/** Route adjudication for ticket dispatch: role -> provider/model, with hard constraints. */

import { constants, copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
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
})

/** Schema of the external role file: the same role entries under a `roles:` key. */
const ROLES_FILE_SCHEMA = z.object({ roles: z.array(ROLE_SCHEMA).default([]) })

/** Role-file template shipped in this package, copied out when the user has none yet. */
const EXAMPLE_ROLES_FILE = fileURLToPath(new URL('../roles.example.yml', import.meta.url))

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

const DECISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    reason: { type: 'string', required: true },
    route: ROUTE_SCHEMA,
    alternatives: { type: 'array', required: true, items: ROUTE_SCHEMA },
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
  const inlineRoles = config.roles ?? []
  const inlineMode = inlineRoles.length > 0
  const configured = config.rolesFile ?? ''
  const rolesFile = configured === ''
    ? join(homedir(), '.dsh', 'foreman.roles.yml')
    : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured

  /** Active table: the inline config roles, or the last good read of `rolesFile`. */
  let roles: RoleRoute[] = inlineMode ? inlineRoles : []
  let byRole = new Map(roles.map(route => [route.role, route]))
  /** Set while the file is missing, empty, unreadable or invalid; it refuses every call. */
  let loadError: string | undefined
  /** mtime of the last file read already processed; NaN forces the next call to read. */
  let loadedMtimeMs = Number.NaN

  if (inlineMode && byRole.size !== roles.length) throw new Error('foreman: duplicate role in config.roles')

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
      loadError = undefined // the stale error is about the file that is gone now; let refresh() re-stat and reload
    } catch (error) {
      loadError = `未配置：模板写入失败（${summarize(error)}）；目标：${rolesFile}。按注释填好 provider/model，保存即生效`
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
      loadError = `配置文件读取失败：${summarize(error)}；文件：${rolesFile}`
      return
    }
    let data: unknown
    try {
      data = parseYaml(text)
    } catch (error) {
      loadError = fileReason(`配置文件 YAML 解析失败：${summarize(error)}`)
      return
    }
    let table: RoleRoute[]
    try {
      table = validateTable(data ?? {})
    } catch (error) {
      loadError = fileReason(`配置文件校验失败：${summarize(error)}`)
      return
    }
    if (table.length === 0) {
      if (roles.length > 0) {
        // A legal but empty table is a half-saved edit far more often than a deliberate wipe: keep the last
        // usable table for `alternatives` and refuse everything through `loadError`. Deleting the file does
        // not wipe it either — the template gets laid back down and lands here as an empty table.
        loadError = fileReason('文件里是空表')
        return
      }
      roles = []
      byRole = new Map()
      loadError = `未配置：${rolesFile} 里还没有启用中的角色。按注释填好 provider/model，保存即生效`
      return
    }
    roles = table
    byRole = new Map(table.map(route => [route.role, route]))
    loadError = undefined
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
        loadError = `配置文件读取失败：${rolesFile} 无法访问`
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
    },
    output: {
      schema: DECISION_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      refresh()
      const now = new Date()
      const all = () => roles.map(toRoute)
      if (loadError !== undefined) return { ok: false, reason: loadError, alternatives: all() }
      if (args.role === undefined || args.role === '') {
        return { ok: true, reason: `${roles.length} roles available`, alternatives: all() }
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

/** mtime of a file, or undefined when it cannot be stat'ed at all. */
function mtimeOf(file: string): number | undefined {
  try {
    return statSync(file).mtimeMs
  } catch {
    return undefined
  }
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
