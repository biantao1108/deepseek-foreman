/** Route adjudication for ticket dispatch: role -> provider/model, with hard constraints. */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'ticket-manager'
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

/** Plugin configuration: the role table, the single source of routing truth. */
export interface Config {
  roles: RoleRoute[]
}

/** Loader schema for the role table. */
export const Config: z<Config> = z.object({
  roles: z.array(z.object({
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
  })).default([]),
})

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

/** Register the role-to-route adjudication tool. */
export function apply(ctx: Context, config: Config) {
  const byRole = new Map(config.roles.map(route => [route.role, route]))
  if (byRole.size !== config.roles.length) throw new Error('ticket-manager: duplicate role in config.roles')

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
      const now = new Date()
      const all = () => config.roles.map(toRoute)
      if (args.role === undefined || args.role === '') {
        return { ok: true, reason: `${config.roles.length} roles available`, alternatives: all() }
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
          alternatives: config.roles
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
          alternatives: config.roles.filter(other => other.role !== route.role && usable(other, args, now)).map(toRoute),
        }
      }
      return { ok: true, reason: 'route accepted', route: toRoute(route), alternatives: [] }
    },
  }))
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
