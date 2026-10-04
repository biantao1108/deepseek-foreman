/** Route adjudication for ticket dispatch: role -> provider/model, with hard constraints. */

import { constants, copyFileSync, cpSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parse as parseYaml } from 'yaml'

/** Cordis plugin name. */
export const name = 'foreman'
/** Services required by this plugin. */
export const inject = ['tools']

/** One declared role and the route it maps to. */
export interface RoleRoute {
  /** Role key the model asks for, e.g. `daily-code`. */
  role: string
  /** Vendor key for cross-vendor review; two routes of one vendor never review each other. */
  vendor: string
  /** LLM provider route to hand to the `subagent` tool. */
  provider: string
  /** Model id interpreted by that provider. */
  model: string
  /** Adapter-owned reasoning effort; empty follows the model's own default. */
  reasoningEffort: string
  /** Route may only take image-bearing work when true. */
  vision: boolean
  /** Declared output-token ceiling; 0 means undeclared and skips the check. */
  maxOutputTokens: number
  /** Expensive-hours windows as `HH:MM-HH:MM`; empty disables the peak check. */
  peakWindows: string[]
  /** Weekdays the windows apply to, ISO numbering (1 = Monday). Empty means every day. */
  peakDays: number[]
  /** `YYYY-MM-DD` dates treated as off-peak all day even on a weekday. */
  holidays: string[]
  /** Role to suggest when this one is refused. */
  fallback: string
  /** Model-facing note: what this role is for and what to watch for. */
  note: string
}

/** Plugin configuration: the inline role table plus the external role file. */
export interface Config {
  /** Inline role table. Non-empty wins over `rolesFile`, for callers that configure in cordis. */
  roles: RoleRoute[]
  /** External role file; a leading `~/` expands to the home directory. Empty means `<home>/.dsh/foreman.roles.yml`. */
  rolesFile: string
  /** Install the packaged skill into `<home>/.dsh/skills` when the plugin loads. Default true. */
  installSkill: boolean
  /**
   * Delegation depth this plugin asks the host for at startup. dsh's subagent service
   * defaults to 1, which makes the three-stage flow (session → foreman → worker) impossible:
   * the foreman sits at depth 1 and cannot start a worker at depth 2. Default 2.
   * Set 1 to opt out; 0 disables delegation entirely.
   */
  delegationDepth: number
}

/** Schema of one role entry, shared by the inline config and the external file. */
const ROLE_SCHEMA = z.object({
  role: z.string(),
  vendor: z.string(),
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string().default(''),
  vision: z.boolean().default(false),
  maxOutputTokens: z.number().default(0),
  peakWindows: z.array(z.string()).default([]),
  peakDays: z.array(z.number()).default([]),
  holidays: z.array(z.string()).default([]),
  fallback: z.string().default(''),
  note: z.string().default(''),
})

/** Loader schema for the role table. */
export const Config: z<Config> = z.object({
  roles: z.array(ROLE_SCHEMA).default([]),
  rolesFile: z.string().default(''),
  installSkill: z.boolean().default(true),
  delegationDepth: z.number().min(0).max(8).default(2),
})

/** Schema of the external role file: the same role entries under a `roles:` key. */
const ROLES_FILE_SCHEMA = z.object({ roles: z.array(ROLE_SCHEMA).default([]) })

/** Role-file template shipped in this package, copied out when the user has none yet. */
const EXAMPLE_ROLES_FILE = fileURLToPath(new URL('../roles.example.yml', import.meta.url))

/** Packaged skill directory shipped in this package, installed into the user skill root on load. */
const SKILL_SOURCE = fileURLToPath(new URL('../skill/deepseek-foreman', import.meta.url))

/** Install target under the user skill root: `<home>/.dsh/skills/deepseek-foreman`. */
const SKILL_TARGET = () => join(homedir(), '.dsh', 'skills', 'deepseek-foreman')

/** One whitelisted `allowedModels` provider/model pair. */
interface RoutePair {
  provider: string
  model: string
}

/** Scan of one profile's `cordis.patch.yml`; `unknown` means the file could not be read or parsed. */
interface ProfileScan {
  file: string
  status: 'ok' | 'unknown'
  routes: RoutePair[]
  detail?: string
}

/** Role-table report for the doctor: where it is, how it fared, how many roles it holds. */
interface RolesFileReport {
  path: string
  status: 'ok' | 'unconfigured' | 'error'
  roles: number
  detail?: string
}

/** The `setup` block `pick_route` returns when called without a role. */
interface SetupReport {
  rolesFile: RolesFileReport
  skill: string
  /** What happened to the host delegation depth at load: raised, already N, or why not. */
  delegation: string
  allowlist: {
    /** `not-configured`: every readable profile lacks an `allowedModels` block — no whitelist to enforce yet. */
    status: 'ok' | 'unknown' | 'not-configured'
    detail?: string
    routes: RoutePair[]
    profiles: ProfileScan[]
    unmatchedRoles: { role: string, provider: string, model: string }[]
    /** Per-role reconciliation: which `status=ok` profiles each role matched, e.g. `matchedIn: ['desktop']`. */
    roleMatches: { role: string, matchedIn: string[] }[]
  }
  hints: string[]
}

/** R5 mechanical acceptance verdict as the model sees it. */
export interface AcceptCheck {
  receipt: string
  ticket?: string
  headSha: string
  headMatches: boolean
  recordedHead?: string
  checks: { name: string, status: 'pass' | 'fail' | 'missing' | 'stale' }[]
  ready: boolean
}

/** One resolved role route as the model sees it. */
export interface Route {
  role: string
  provider: string
  model: string
  reasoning_effort?: string
  note?: string
}

const ROUTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    role: { type: 'string', required: true },
    provider: { type: 'string', required: true },
    model: { type: 'string', required: true },
    reasoning_effort: { type: 'string' },
    note: { type: 'string' },
  },
} as const

const ROUTE_PAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    provider: { type: 'string', required: true },
    model: { type: 'string', required: true },
  },
} as const

/** Setup self-check (doctor) block: role table, skill install, allowlist reconciliation, hints. */
const SETUP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    rolesFile: {
      type: 'object',
      additionalProperties: false,
      properties: {
        path: { type: 'string', required: true },
        status: { type: 'string', enum: ['ok', 'unconfigured', 'error'], required: true },
        roles: { type: 'integer', required: true },
        detail: { type: 'string' },
      },
    },
    skill: { type: 'string', required: true },
    allowlist: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['ok', 'unknown', 'not-configured'], required: true },
        detail: { type: 'string' },
        routes: { type: 'array', required: true, items: ROUTE_PAIR_SCHEMA },
        profiles: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              file: { type: 'string', required: true },
              status: { type: 'string', enum: ['ok', 'unknown'], required: true },
              routes: { type: 'array', required: true, items: ROUTE_PAIR_SCHEMA },
              detail: { type: 'string' },
            },
          },
        },
        unmatchedRoles: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: { type: 'string', required: true },
              provider: { type: 'string', required: true },
              model: { type: 'string', required: true },
            },
          },
        },
        roleMatches: {
          type: 'array',
          required: true,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: { type: 'string', required: true },
              matchedIn: { type: 'array', required: true, items: { type: 'string' } },
            },
          },
        },
      },
    },
    delegation: { type: 'string', required: true },
    hints: { type: 'array', required: true, items: { type: 'string' } },
  },
} as const

/** Accept-check (R5 fingerprint) block: receipt vs code version, mechanically. */
/** Cost meter block: real per-session token usage from the dsh token-meter projection. */
const COST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    session: { type: 'string', required: true },
    found: { type: 'boolean', required: true },
    detail: { type: 'string' },
    totals: {
      type: 'object', additionalProperties: false, properties: {
        inputTokens: { type: 'integer' },
        outputTokens: { type: 'integer' },
        cacheReadTokens: { type: 'integer' },
        cacheWriteTokens: { type: 'integer' },
      },
    },
    recent: {
      type: 'array', items: {
        type: 'object', additionalProperties: false, properties: {
          session: { type: 'string', required: true },
          totalTokens: { type: 'integer', required: true },
          inputTokens: { type: 'integer', required: true },
          outputTokens: { type: 'integer', required: true },
        },
      },
    },
  },
} as const

const ACCEPT_CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    receipt: { type: 'string', required: true },
    ticket: { type: 'string' },
    headSha: { type: 'string', required: true },
    headMatches: { type: 'boolean', required: true },
    recordedHead: { type: 'string' },
    checks: {
      type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          name: { type: 'string', required: true },
          status: { type: 'string', enum: ['pass', 'fail', 'missing', 'stale'], required: true },
        },
      },
    },
    ready: { type: 'boolean', required: true },
  },
} as const

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    reason: { type: 'string', required: true },
    route: ROUTE_SCHEMA,
    alternatives: { type: 'array', required: true, items: ROUTE_SCHEMA },
    setup: SETUP_SCHEMA,
    acceptCheck: ACCEPT_CHECK_SCHEMA,
    cost: COST_SCHEMA,
  },
} as const

/** Long-output threshold below which a capped route is refused. */
const LONG_OUTPUT_MIN_TOKENS = 100_000

function parseClock(value: string): number | undefined {
  const parts = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (parts === null) return undefined
  return Number(parts[1]) * 60 + Number(parts[2])
}

/** Whether `now` falls inside any of this route's peak windows, in local time. */
function inPeakWindow(route: RoleRoute, now: Date): boolean {
  if (route.peakWindows.length === 0) return false
  if (route.holidays.includes(localDate(now))) return false
  if (route.peakDays.length > 0 && !route.peakDays.includes(now.getDay() === 0 ? 7 : now.getDay())) return false
  const minutes = now.getHours() * 60 + now.getMinutes()
  return route.peakWindows.some(window => {
    const parts = window.split('-')
    const from = parts.length === 2 ? parseClock(parts[0].trim()) : undefined
    const to = parts.length === 2 ? parseClock(parts[1].trim()) : undefined
    if (from === undefined || to === undefined) return false
    return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to
  })
}

/** Local `YYYY-MM-DD` for a Date, so a holiday list is not timezone-sensitive. */
function localDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function toRoute(route: RoleRoute): Route {
  return {
    role: route.role,
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === '' ? {} : { reasoning_effort: route.reasoningEffort }),
    ...(route.note === '' ? {} : { note: route.note }),
  }
}

/** One-line, length-capped rendering of a thrown value, for a model-readable reason. */
function summarize(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/\s+/g, ' ').trim().slice(0, 300)
}

/** Validate a parsed role file into a usable table; throws a readable reason when it cannot be used. */
function validateTable(data: unknown): RoleRoute[] {
  const table = ROLES_FILE_SCHEMA(data as Record<string, unknown>).roles
  const seen = new Set<string>()
  for (const entry of table) {
    for (const field of ['role', 'vendor', 'provider', 'model'] as const) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        throw new Error(`角色 ${entry.role === '' ? '(未命名)' : `"${entry.role}"`} 的 ${field} 为空`)
      }
    }
    if (seen.has(entry.role)) throw new Error(`角色名重复："${entry.role}"`)
    seen.add(entry.role)
  }
  return table
}

/** Register the role-to-route adjudication tool. */
export function apply(ctx: Context, config: Config) {
  // The subagent service caps delegation depth at 1 by default and the cap is volatile,
  // i.e. designed to be set at runtime. Raising it here is what makes the three-stage
  // flow (session → foreman → worker/reviewer) possible at all. A missing service is
  // not an error: dsh builds without the subagent domain.
  const requestedDepth = config.delegationDepth ?? 2
  let delegationDepth: string
  try {
    const subagents = (ctx as unknown as {
      get(name: string): { config?: { maxDepth?: { get(): number, set(v: number): void } } } | undefined
    }).get('subagents')
    const current = subagents?.config?.maxDepth?.get()
    if (subagents?.config?.maxDepth === undefined) delegationDepth = 'no subagent service'
    else if (current === undefined) delegationDepth = 'not readable'
    else if (current >= requestedDepth) delegationDepth = `already ${current}`
    else {
      subagents.config.maxDepth.set(requestedDepth)
      delegationDepth = `raised ${current} → ${requestedDepth}`
    }
  } catch (error) {
    delegationDepth = `unavailable: ${summarize(error)}`
  }

  const inlineRoles = config.roles ?? []
  const inlineMode = inlineRoles.length > 0
  const configured = config.rolesFile ?? ''
  const rolesFile = configured === ''
    ? join(homedir(), '.dsh', 'foreman.roles.yml')
    : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured

  /** Whether the packaged skill is installed on load; config `installSkill`, default true. */
  const installSkill = config.installSkill ?? true
  /** Skill install result recorded at load time; a failure is reported to the doctor, never thrown. */
  let skillInstall: string
  try {
    skillInstall = ensureSkill()
  } catch (error) {
    skillInstall = `failed: ${summarize(error)}`
  }

  /** Active table: the inline config roles, or the last good read of `rolesFile`. */
  let roles: RoleRoute[] = inlineMode ? inlineRoles : []
  let byRole = new Map(roles.map(route => [route.role, route]))
  /** Set while the file is missing, empty, unreadable or invalid; it refuses every call. */
  let loadError: string | undefined
  /** Doctor classification of `loadError`: `unconfigured` for a fresh file, `error` for a broken one. */
  let loadKind: 'ok' | 'unconfigured' | 'error' = 'ok'
  /** mtime of the last file read already processed; NaN forces the next call to read. */
  let loadedMtimeMs = Number.NaN

  /** Record one load outcome: `error` message for the caller, `kind` for the doctor report. */
  function setLoad(kind: 'ok' | 'unconfigured' | 'error', error: string | undefined): void {
    loadKind = kind
    loadError = error
  }

  if (inlineMode && byRole.size !== roles.length) throw new Error('foreman: duplicate role in config.roles')

  /**
   * Install the packaged skill into `<home>/.dsh/skills`: prefer a symlink (repo edits stay live),
   * fall back to a recursive copy where symlinks are refused (Windows privileges etc.).
   * Every failure is reported, not thrown — and a target that cannot serve as the install is never
   * reported as `exists` (a dangling symlink used to read as a healthy install: doctor 假绿).
   */
  function ensureSkill(): string {
    if (!installSkill) return 'disabled'
    const target = SKILL_TARGET()
    const health = skillHealth(target)
    if (health === 'ok') return 'exists'
    if (health === 'occupied') return `failed: 目标路径被普通文件占用（${target}），未做任何改动`
    if (health === 'unreadable') return `failed: 软链指向的位置读不到 SKILL.md（${target}），未改动该软链`
    let cleaned = false
    if (health === 'dangling') {
      // 悬空软链必须清掉重装：留着它 entryExists 恒真，doctor 会把一个装不上的 skill 报成 exists。
      // 这是工单明写的唯一授权删除动作；清不掉就如实报错，绝不假绿。
      try {
        unlinkSync(target)
        cleaned = true
      } catch (error) {
        return `failed: 悬空软链清理失败（${summarize(error)}），未重装`
      }
    }
    try {
      mkdirSync(dirname(target), { recursive: true })
      symlinkSync(SKILL_SOURCE, target, 'dir')
      return 'linked'
    } catch (linkError) {
      if (entryExists(target)) return 'exists' // someone else installed it between the check and the link
      try {
        // TOCTOU：cpSync 默认 force 覆盖，在这期间被建出来的目标会被静默冲掉；
        // errorOnExist+force:false 把「不覆盖别人刚建的东西」交给内核判定，冲突即失败。
        cpSync(SKILL_SOURCE, target, { recursive: true, force: false, errorOnExist: true })
        return 'copied'
      } catch (copyError) {
        if (cleaned) return `failed: 悬空软链已清理，重装失败（软链：${summarize(linkError)}；拷贝：${summarize(copyError)}）`
        return `failed: 软链安装失败（${summarize(linkError)}）；递归拷贝也失败（${summarize(copyError)}）`
      }
    }
  }

  /** Copy the shipped template to `rolesFile`, creating its parent directory first. */
  function writeTemplate(): void {
    mkdirSync(dirname(rolesFile), { recursive: true })
    // EXCL: never clobber a file that appeared between the existence check and this copy; the EEXIST
    // lands in `restoreTemplate`'s catch and surfaces as a readable reason instead of silent data loss.
    copyFileSync(EXAMPLE_ROLES_FILE, rolesFile, constants.COPYFILE_EXCL)
  }

  /** Lay the template back down after the file disappeared; report it when even that fails. */
  function restoreTemplate(): void {
    try {
      writeTemplate()
      // OK: the stale error is about the file that is gone now; let refresh() re-stat and reload
      setLoad('ok', undefined)
    } catch (error) {
      // The template never landed, so this is a real error dressed as "未配置" — keep the wording,
      // but classify it as `error` for the doctor so it is not mistaken for a not-configured-yet state.
      setLoad('error', `未配置：模板写入失败（${summarize(error)}）；目标：${rolesFile}。按注释填好 provider/model，保存即生效`)
    }
  }

  /** Turn a file problem into a reason that names the file and the way out of it. */
  function fileReason(head: string): string {
    const kept = roles.length === 0 ? '' : '已保留上一份可用角色表（见 alternatives），'
    return `${head}；文件：${rolesFile}。${kept}改好保存后下次调用自动生效`
  }

  /** Read, parse and validate `rolesFile`; every failure keeps the previous good table. */
  function loadFile(): void {
    let text: string
    try {
      // stat first, read second: if the file changes in between, the recorded mtime is the older one,
      // so the next call reloads. The other order can record a newer mtime with older content and never retry.
      loadedMtimeMs = statSync(rolesFile).mtimeMs
      text = readFileSync(rolesFile, 'utf8')
    } catch (error) {
      setLoad('error', `配置文件读取失败：${summarize(error)}；文件：${rolesFile}`)
      return
    }
    let data: unknown
    try {
      data = parseYaml(text)
    } catch (error) {
      setLoad('error', fileReason(`配置文件 YAML 解析失败：${summarize(error)}`))
      return
    }
    let table: RoleRoute[]
    try {
      table = validateTable(data ?? {})
    } catch (error) {
      setLoad('error', fileReason(`配置文件校验失败：${summarize(error)}`))
      return
    }
    if (table.length === 0) {
      if (roles.length > 0) {
        // A legal but empty table is a half-saved edit far more often than a deliberate wipe: keep the last
        // usable table for `alternatives` and refuse everything through `loadError`. Deleting the file does
        // not wipe it either — the template gets laid back down and lands here as an empty table.
        setLoad('error', fileReason('文件里是空表'))
        return
      }
      roles = []
      byRole = new Map()
      setLoad('unconfigured', `未配置：${rolesFile} 里还没有启用中的角色。按注释填好 provider/model，保存即生效`)
      return
    }
    roles = table
    byRole = new Map(table.map(route => [route.role, route]))
    setLoad('ok', undefined)
  }

  /** Re-read `rolesFile` when its mtime moved; inline config mode never touches the disk. */
  function refresh(): void {
    if (inlineMode) return
    let mtimeMs = mtimeOf(rolesFile)
    if (mtimeMs === undefined) {
      restoreTemplate()
      if (loadError !== undefined) return
      mtimeMs = mtimeOf(rolesFile)
      if (mtimeMs === undefined) {
        setLoad('error', `配置文件读取失败：${rolesFile} 无法访问`)
        return
      }
    }
    if (mtimeMs === loadedMtimeMs) return
    loadFile()
  }

  if (!inlineMode) {
    if (mtimeOf(rolesFile) === undefined) restoreTemplate()
    if (loadError === undefined) loadFile()
  }

  /**
   * Scan `<home>/.dsh/profiles/<name>/cordis.patch.yml` for `allowedModels` pairs. A file that cannot be
   * read or parsed is reported as `unknown` — the doctor's job is to surface the gap, not to guess.
   * Readable files with no `allowedModels` block anywhere are `not-configured` (nothing to enforce yet),
   * which is a different state from "configured but not matching": the former must not alarm per role.
   */
  function scanAllowlist(): { profiles: ProfileScan[], routes: RoutePair[], status: 'ok' | 'unknown' | 'not-configured', detail?: string } {
    const dir = join(homedir(), '.dsh', 'profiles')
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch (error) {
      return { profiles: [], routes: [], status: 'unknown', detail: `${dir} 读不到（${summarize(error)}）` }
    }
    const profiles: ProfileScan[] = []
    const routes: RoutePair[] = []
    const seen = new Set<string>()
    for (const name of names) {
      const file = join(dir, name, 'cordis.patch.yml')
      if (!entryExists(file)) continue
      try {
        const found = collectAllowedModels(parseYaml(readFileSync(file, 'utf8')))
        for (const pair of found) {
          const key = JSON.stringify([pair.provider, pair.model]) // collision-free dedup
          if (seen.has(key)) continue
          seen.add(key)
          routes.push(pair)
        }
        profiles.push({ file, status: 'ok', routes: found })
      } catch (error) {
        profiles.push({ file, status: 'unknown', routes: [], detail: summarize(error) })
      }
    }
    const readable = profiles.filter((profile) => profile.status === 'ok')
    if (readable.some((profile) => profile.routes.length > 0)) return { profiles, routes, status: 'ok' }
    if (readable.length === profiles.length) {
      // 全部读得到，却一个 allowedModels 段都没有 → 没启用白名单，不是「对不上」
      return profiles.length === 0
        ? { profiles, routes, status: 'unknown', detail: `${dir} 下没有 cordis.patch.yml` }
        : { profiles, routes, status: 'not-configured', detail: `${dir} 下的 profile 都没有 allowedModels 段` }
    }
    return {
      profiles,
      routes,
      status: 'unknown',
      detail: readable.length === 0
        ? `${dir} 下的 cordis.patch.yml 都读不到`
        : `${dir} 下 ${profiles.length - readable.length} 个 cordis.patch.yml 读不到，其余没有 allowedModels 段`,
    }
  }

  /** The `setup` block for a no-role call: role table, skill install, allowlist reconciliation, hints. */
  function buildSetup(): SetupReport {
    const allowlist = scanAllowlist()
    // 对账按 profile 粒度：一个角色只要在任一 status=ok 的 profile 里对上，就不算失配；
    // roleMatches 记下每个角色匹配到了哪些 profile（如 matchedIn: ['desktop']），供逐条核对。
    const okProfiles = allowlist.profiles.filter((profile) => profile.status === 'ok')
    const matchedIn = (route: RoleRoute): string[] => okProfiles
      .filter((profile) => profile.routes.some((pair) => pair.provider === route.provider && pair.model === route.model))
      .map((profile) => basename(dirname(profile.file)))
    const roleMatches = allowlist.status === 'ok'
      ? roles.map((route) => ({ role: route.role, matchedIn: matchedIn(route) }))
      : []
    // 只标「在所有 status=ok 的 profile 里都不匹配」的角色。白名单没读到（unknown）或没启用
    // （not-configured）时一个都不标：逐角色报警会把真正的问题埋掉。
    const unmatchedRoles = allowlist.status === 'ok'
      ? roles
        .filter((route) => matchedIn(route).length === 0)
        .map(route => ({ role: route.role, provider: route.provider, model: route.model }))
      : []
    const rolesFileReport: RolesFileReport = inlineMode
      ? { path: rolesFile, status: 'ok', roles: roles.length, detail: 'config.roles 直传，rolesFile 未使用' }
      : { path: rolesFile, status: loadKind, roles: roles.length, ...(loadError === undefined ? {} : { detail: loadError }) }
    const hints: string[] = []
    if (!inlineMode && loadKind === 'unconfigured') {
      hints.push(`角色表还没配置：编辑 ${rolesFile}，按注释填好 provider/model，保存即生效`)
    } else if (!inlineMode && loadKind === 'error') {
      hints.push(`角色表有问题：${loadError}`)
    }
    if (skillInstall.startsWith('failed:')) {
      const detail = skillInstall.slice('failed:'.length).trim()
      hints.push(detail.startsWith('目标路径被普通文件占用')
        ? `skill 安装目标被普通文件占用（${SKILL_TARGET()}），先移走或删除该文件，重启后插件会自动重装`
        : `skill 自动安装失败（${detail}），可手动把包内 skill/deepseek-foreman 链进 ~/.dsh/skills/deepseek-foreman`)
    }
    for (const missing of unmatchedRoles) {
      hints.push(`角色 ${missing.role} 的路由 ${missing.provider}/${missing.model} 不在 allowedModels，把它加进白名单后开新会话`)
    }
    if (allowlist.status === 'not-configured') {
      hints.push('未启用白名单，当前不强制限制派单；建议启用')
    } else if (allowlist.status === 'unknown') {
      hints.push(`没读到 allowedModels 白名单（${allowlist.detail ?? ''}），无法核对角色路由`)
    }
    return {
      rolesFile: rolesFileReport,
      skill: skillInstall,
      allowlist: {
        status: allowlist.status,
        ...(allowlist.detail === undefined ? {} : { detail: allowlist.detail }),
        routes: allowlist.routes,
        profiles: allowlist.profiles,
        unmatchedRoles,
        roleMatches,
      },
      delegation: delegationDepth,
      hints,
    }
  }

  ctx.tools.register(defineTool({
    name: 'pick_route',
    description: 'Resolve a work role to the LLM route to dispatch with. Omit role to list every role. '
      + 'Call before every ticket dispatch and pass the returned provider/model/reasoning_effort to the '
      + 'subagent tool; do not choose a model yourself. A refused route must not be worked around.',
    parameters: {
      role: { type: 'string', description: 'Role key from the table, e.g. lead, daily-code, review, copywriting, chores.' },
      needs_vision: { type: 'boolean', description: 'The work reads images or screenshots.' },
      needs_long_output: { type: 'boolean', description: 'The work must produce a large single output (whole document, big file).' },
      review_for: { type: 'string', description: 'When this dispatch is a code review, name the role that wrote the code. Same-vendor reviewers are refused: correlated models make correlated mistakes.' },
      accept_check: { type: 'string', description: 'R5 mechanical acceptance: pass an absolute receipt path (the receipt must contain a 「指纹」 section with HEAD sha and per-check status). Verifies the receipt matches the current git HEAD and every acceptance command passed. Returns acceptCheck instead of a route.' },
      project_root: { type: 'string', description: 'Git working directory for accept_check (defaults to the repo containing the receipt).' },
      cost_session: { type: 'string', description: "Token metering: pass a session id to read that session real token usage, or \"recent\" to list the metered sessions newest-first. Returns cost instead of a route - use it to fill cost ledgers with measured numbers, never estimates." },
    },
    output: {
      schema: DECISION_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      refresh()
      // Cost metering is a mode switch too.
      if (args.cost_session !== undefined) {
        return { ok: false, reason: 'cost meter mode', alternatives: [], cost: readCost(ctx, args.cost_session) }
      }
      // R5: accept_check is a mode switch, not a route query.
      if (args.accept_check !== undefined && args.accept_check !== '') {
        return { ok: false, reason: 'accept-check mode', alternatives: [], acceptCheck: runAcceptCheck(args.accept_check, args.project_root) }
      }
      const now = new Date()
      const all = () => roles.map(toRoute)
      // Omitting the role is the doctor call: the answer carries `setup` even when the table
      // itself is broken — that is exactly the call where the user asks "what is still missing?".
      if (loadError !== undefined) {
        const wantsSetup = args.role === undefined || args.role === ''
        return { ok: false, reason: loadError, alternatives: all(), ...(wantsSetup ? { setup: buildSetup() } : {}) }
      }
      if (args.role === undefined || args.role === '') {
        return { ok: true, reason: `${roles.length} roles available`, alternatives: all(), setup: buildSetup() }
      }
      const route = byRole.get(args.role)
      if (route === undefined) {
        return { ok: false, reason: `unknown role "${args.role}"; call pick_route with no role to list roles`, alternatives: all() }
      }
      const author = args.review_for === undefined || args.review_for === ''
        ? undefined : byRole.get(args.review_for)
      if (author !== undefined && author.vendor === route.vendor) {
        return {
          ok: false,
          reason: `reviewer and author are both vendor "${route.vendor}"; pick a route from another vendor`,
          alternatives: roles
            .filter(other => other.vendor !== route.vendor && usable(other, args, now))
            .map(toRoute),
        }
      }
      if (!usable(route, args, now)) {
        const suggested = route.fallback === '' ? undefined : byRole.get(route.fallback)
        return {
          ok: false,
          reason: blockers(route, args, now).join('; '),
          ...(suggested === undefined || !usable(suggested, args, now) ? {} : { route: toRoute(suggested) }),
          alternatives: roles.filter(other => other.role !== route.role && usable(other, args, now)).map(toRoute),
        }
      }
      return { ok: true, reason: 'route accepted', route: toRoute(route), alternatives: [] }
    },
  }))
}

/** Read real token usage for one session from the dsh token-meter projection (no estimates). */
function readCost(ctx: Context, sessionId: string | undefined): CostMeter {
  const sessions = (ctx as unknown as { get(name: string): { get(id: string): unknown, current?: () => unknown, list?: unknown } | undefined }).get('sessions')
  const projections = (ctx as unknown as { get(name: string): { snapshot(session: unknown): { values: Record<string, unknown> } } | undefined }).get('sessionProjections')
  if (projections === undefined || sessions === undefined) {
    return { session: sessionId ?? 'current', found: false, detail: 'session or tokenMeter projection unavailable in this deployment' }
  }
  // `recent`: walk every known session and keep the ones carrying real totals.
  // This is the secretary-facing path — a subagent call returns no session id to the
  // model, so "which subagent just ran" is answered by reading the newest usage.
  if (sessionId === 'recent') {
    const all = (sessions as unknown as { list(): unknown[] }).list()
    const rows: CostRow[] = []
    for (const candidate of all) {
      try {
        const totals = (projections.snapshot(candidate).values as Record<string, { totals?: Record<string, number> } | undefined>).tokenUsage?.totals
        if (totals === undefined) continue
        const total = Object.values(totals).reduce((a, b) => a + (b ?? 0), 0)
        if (total === 0) continue
        rows.push({ session: (candidate as { id: string }).id, totalTokens: total, inputTokens: totals.inputTokens ?? 0, outputTokens: totals.outputTokens ?? 0 })
      } catch { /* one bad session must not sink the scan */ }
    }
    rows.sort((a, b) => b.totalTokens - a.totalTokens)
    return { session: 'recent', found: rows.length > 0, detail: `${rows.length} session(s) with metered usage`, recent: rows.slice(0, 20) }
  }
  const target = sessions.get(sessionId === undefined || sessionId === '' ? '' : sessionId)
  if (target === undefined) {
    return { session: sessionId ?? 'current', found: false, detail: 'no such session id; pass "recent" to list metered sessions' }
  }
  try {
    const values = projections.snapshot(target).values as Record<string, { totals?: Record<string, number> } | undefined>
    const usage = values.tokenUsage
    if (usage?.totals === undefined) {
      return { session: sessionId ?? 'current', found: false, detail: 'tokenUsage projection has no totals yet' }
    }
    const t = usage.totals as Record<string, number>
    return {
      session: sessionId ?? 'current',
      found: true,
      totals: {
        inputTokens: t.inputTokens ?? 0,
        outputTokens: t.outputTokens ?? 0,
        cacheReadTokens: t.cacheReadTokens ?? 0,
        cacheWriteTokens: t.cacheWriteTokens ?? 0,
      },
    }
  } catch (error) {
    return { session: sessionId ?? 'current', found: false, detail: summarize(error) }
  }
}

/** One metered session row. */
export interface CostRow {
  session: string
  totalTokens: number
  inputTokens: number
  outputTokens: number
}

/** Cost meter verdict as the model sees it. */
export interface CostMeter {
  session: string
  found: boolean
  detail?: string
  totals?: { inputTokens: number, outputTokens: number, cacheReadTokens: number, cacheWriteTokens: number }
  recent?: CostRow[]
}

/** R5: mechanically verify a receipt's fingerprint block against the current git HEAD. */
function runAcceptCheck(receiptPath: string, projectRoot?: string): AcceptCheck {
  const receipt = (() => {
    try { return readFileSync(receiptPath, 'utf8') } catch { return '' }
  })()
  const root = projectRoot ?? dirname(receiptPath)
  const headSha = (() => {
    try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() } catch { return '' }
  })()
  const recordedHead = /HEAD sha[:：]\s*`?([0-9a-f]{7,40})`?/.exec(receipt)?.[1] ?? ''
  const ticket = /工单[:：]\s*`?([^`\n]+)`?/.exec(receipt)?.[1]?.trim()
  // Fingerprint block: each acceptance line as `- [<name>]: <status>` where status ∈ pass/fail/missing/stale.
  const checks: { name: string, status: 'pass' | 'fail' | 'missing' | 'stale' }[] = []
  for (const line of receipt.split('\n')) {
    const m = /^- \[([^\]]+)\]:\s*(pass|fail|missing|stale)\s*$/.exec(line.trim())
    if (m !== null) checks.push({ name: m[1], status: m[2] as 'pass' | 'fail' | 'missing' | 'stale' })
  }
  const headMatches = recordedHead !== '' && recordedHead === headSha.slice(0, recordedHead.length)
  const ready = receipt !== '' && headSha !== '' && headMatches
    && checks.length > 0 && checks.every(c => c.status === 'pass')
  return {
    receipt: receiptPath,
    ...(ticket === undefined ? {} : { ticket }),
    headSha,
    headMatches,
    ...(recordedHead === '' ? {} : { recordedHead }),
    checks,
    ready,
  }
}

/** mtime of a file, or undefined when it cannot be stat'ed at all. */
function mtimeOf(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs
  } catch {
    return undefined
  }
}

/** Whether a path exists as an entry — `statSync` misses even a dangling symlink, `lstatSync` does not. */
function entryExists(file: string): boolean {
  try {
    lstatSync(file)
    return true
  } catch {
    return false
  }
}

/**
 * Health of the skill install target, checked before `ensureSkill` may answer `exists`:
 * - `ok`: a directory (pre-existing install, left untouched) or a symlink through which `SKILL.md` reads;
 * - `dangling`: a symlink `statSync` cannot follow — the install is gone, but `lstatSync` sees an entry;
 * - `unreadable`: a resolvable symlink whose `<target>/SKILL.md` does not read (only reported, not removed);
 * - `occupied`: a plain file (or other non-directory) sitting on the target path;
 * - `absent`: nothing there yet, safe to install.
 * Without this check a dangling symlink reads as a healthy `exists` while the skill cannot load at all.
 */
function skillHealth(target: string): 'ok' | 'dangling' | 'unreadable' | 'occupied' | 'absent' {
  let isLink = false
  let isDir = false
  try {
    const stats = lstatSync(target)
    isLink = stats.isSymbolicLink()
    isDir = stats.isDirectory()
  } catch {
    return 'absent'
  }
  if (isLink) {
    try {
      statSync(target) // follows the link; throws when it dangles
    } catch {
      return 'dangling'
    }
    try {
      readFileSync(join(target, 'SKILL.md'), 'utf8')
      return 'ok'
    } catch {
      return 'unreadable'
    }
  }
  return isDir ? 'ok' : 'occupied'
}

/**
 * `{provider, model}` pairs under any `allowedModels` key below a node — used only for subtrees that
 * already belong to a `model-selection` entry (see `collectAllowedModels`).
 */
function collectAllowedUnder(node: unknown, out: RoutePair[] = []): RoutePair[] {
  if (Array.isArray(node)) {
    for (const item of node) collectAllowedUnder(item, out)
    return out
  }
  if (node === null || typeof node !== 'object') return out
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key !== 'allowedModels') {
      collectAllowedUnder(value, out)
      continue
    }
    if (!Array.isArray(value)) continue
    for (const entry of value) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
      const { provider, model } = entry as Record<string, unknown>
      if (typeof provider === 'string' && typeof model === 'string') out.push({ provider, model })
    }
  }
  return out
}

/**
 * `{provider, model}` pairs of a parsed patch file, collected ONLY from entries whose `name` carries
 * `model-selection` (e.g. `@deepseek-ai/dsh-tool-subagent/model-selection-settings`). Other plugins may
 * declare their own `allowedModels` key; counting those fakes a whitelisted route and lets the doctor
 * stay green while the dispatch is really refused.
 */
function collectAllowedModels(node: unknown, out: RoutePair[] = []): RoutePair[] {
  if (Array.isArray(node)) {
    for (const item of node) collectAllowedModels(item, out)
    return out
  }
  if (node === null || typeof node !== 'object') return out
  const record = node as Record<string, unknown>
  if (typeof record.name === 'string' && record.name.includes('model-selection')) {
    collectAllowedUnder(record, out)
    return out
  }
  for (const value of Object.values(record)) collectAllowedModels(value, out)
  return out
}

function blockers(route: RoleRoute, args: { needs_vision?: boolean, needs_long_output?: boolean }, now: Date): string[] {
  const found: string[] = []
  if (args.needs_vision === true && route.vision !== true) {
    found.push(`role "${route.role}" is not declared vision-capable`)
  }
  if (inPeakWindow(route, now)) {
    found.push(`route ${route.provider}/${route.model} is locked during peak windows ${route.peakWindows.join(', ')}`)
  }
  if (args.needs_long_output === true && route.maxOutputTokens > 0 && route.maxOutputTokens < LONG_OUTPUT_MIN_TOKENS) {
    found.push(`role "${route.role}" caps output at ${route.maxOutputTokens} tokens, too small for a long single output`)
  }
  return found
}

function usable(route: RoleRoute, args: { needs_vision?: boolean, needs_long_output?: boolean }, now: Date): boolean {
  return blockers(route, args, now).length === 0
}
