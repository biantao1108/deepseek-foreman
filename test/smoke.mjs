// 自检：装好插件、拿 pick_route 的真实判定。失败即抛。
// 跑法：npm run build && node test/smoke.mjs
import { readFileSync } from 'node:fs'
import { apply } from '../lib/index.js'

let tool
apply({ tools: { register: (t) => { tool = t } } }, {
  roles: [
    route('lead', 'moonshot', 'kimi-coding', 'k3'),
    route('ui-design', 'moonshot', 'kimi-coding', 'k3', { vision: true }),
    route('daily-code', 'xiaomi', 'xiaomi-token-plan-cn', 'mimo-v2.6-flash', { vision: true }),
    route('daily-code-offpeak', 'deepseek', 'deepseek-official', 'deepseek-flash', {
      peakWindows: ['09:00-12:00', '14:00-18:00'], peakDays: [1, 2, 3, 4, 5],
      holidays: ['2026-10-01', '2026-10-08'], fallback: 'daily-code',
    }),
    route('review', 'xiaomi', 'xiaomi-token-plan-cn', 'mimo-v2.6-pro', { vision: true }),
    route('review-alt', 'moonshot', 'kimi-coding', 'k3', { vision: true }),
    route('copywriting', 'minimax', 'minimax-cn', 'MiniMax-M3.1-Flash-Preview', { vision: true }),
    route('chores', 'minimax', 'minimax-cn', 'MiniMax-M2.7', { maxOutputTokens: 131072 }),
  ],
})

function route(role, vendor, provider, model, extra = {}) {
  return { role, vendor, provider, model, reasoningEffort: '', vision: false, maxOutputTokens: 0,
    peakWindows: [], peakDays: [], holidays: [], fallback: '', note: '', ...extra }
}

const at = (iso, fn) => {
  const real = Date
  globalThis.Date = class extends real { constructor(...a) { return a.length ? new real(...a) : new real(iso) } }
  try { return fn() } finally { globalThis.Date = real }
}

const call = async (args) => await tool.execute(args, {})
let failed = 0
const check = (name, got, want) => {
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}  →  ${got}`)
}

console.log('tool:', tool.name)
check('无 role 列出全部角色', (await call({})).alternatives.length, 8)
check('同厂商审查被拒 (review 审 daily-code)', (await call({ role: 'review', review_for: 'daily-code' })).ok, false)
check('跨厂商审查放行 (review 审 daily-code-offpeak)', (await call({ role: 'review', review_for: 'daily-code-offpeak' })).ok, true)
check('第二审查路由放行 (review-alt 审 daily-code)', (await call({ role: 'review-alt', review_for: 'daily-code' })).ok, true)
check('review-alt 审自家 kimi 产物被拒', (await call({ role: 'review-alt', review_for: 'ui-design' })).ok, false)
check('拒审时给出别家候选', (await call({ role: 'review', review_for: 'daily-code' })).alternatives.some(r => r.provider !== 'xiaomi-token-plan-cn'), true)
check('杂活不做视觉活', (await call({ role: 'chores', needs_vision: true })).ok, false)
check('文案做视觉活', (await call({ role: 'copywriting', needs_vision: true })).ok, true)
check('未知角色被拒', (await call({ role: 'nope' })).ok, false)

// 2026-09-30 是周三，非节假日 → 真实高峰两段生效
await at('2026-09-30T11:00:00', async () => {
  const d = await call({ role: 'daily-code-offpeak' })
  check('周三 11:00 落在 09:00-12:00 高峰 → 锁', d.ok, false)
  check('高峰被拒时自动给 fallback 角色', d.route?.role, 'daily-code')
})
await at('2026-09-30T13:00:00', async () => {
  check('周三 13:00 午休属空闲 → 放行（单窗口实现会误锁）', (await call({ role: 'daily-code-offpeak' })).ok, true)
})
await at('2026-09-30T15:00:00', async () => {
  check('周三 15:00 落在 14:00-18:00 高峰 → 锁', (await call({ role: 'daily-code-offpeak' })).ok, false)
})
await at('2026-09-30T21:30:00', async () => {
  check('周三 21:30 空闲 → 放行', (await call({ role: 'daily-code-offpeak' })).ok, true)
})
await at('2026-10-03T11:00:00', async () => {
  check('国庆周六 11:00 全天空闲 → 放行', (await call({ role: 'daily-code-offpeak' })).ok, true)
})
await at('2026-10-08T11:00:00', async () => {
  check('10-08 是周四但属法定假日 → 放行（peakDays 单独判会误锁）', (await call({ role: 'daily-code-offpeak' })).ok, true)
})
check('长产出拒小上限角色', (await call({ role: 'ui-design', needs_long_output: true })).ok, true) // k3 未声明上限 → 按设计跳过检查
check('M2.7 声明 131072，长产出放行', (await call({ role: 'chores', needs_long_output: true })).ok, true)

// 32768 上限的角色（如 kimi-for-coding）必须被长产出拦下
let tinyTool
apply({ tools: { register: (t) => { tinyTool = t } } }, {
  roles: [route('tiny', 'moonshot', 'kimi-coding', 'kimi-for-coding', { maxOutputTokens: 32768 })],
})
check('32768 上限角色被长产出拒绝', (await tinyTool.execute({ role: 'tiny', needs_long_output: true }, {})).ok, false)
check('同一角色普通产出放行', (await tinyTool.execute({ role: 'tiny' }, {})).ok, true)

// example.cordis.yml 的角色名必须和自检一致，否则文档和代码会分叉
const example = readFileSync(new URL('../example.cordis.yml', import.meta.url), 'utf8')
const named = [...example.matchAll(/^      - role: (\S+)$/gm)].map(m => m[1])
check('example.cordis.yml 角色数', named.length, 8)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
