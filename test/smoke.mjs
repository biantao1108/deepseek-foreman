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
      peakFrom: '09:00', peakTo: '18:00', peakDays: [1, 2, 3, 4, 5], fallback: 'daily-code',
    }),
    route('review', 'xiaomi', 'xiaomi-token-plan-cn', 'mimo-v2.6-pro', { vision: true }),
    route('copywriting', 'minimax', 'minimax-cn', 'MiniMax-M3.1-Flash-Preview', { vision: true }),
    route('chores', 'minimax', 'minimax-cn', 'MiniMax-M2.7', { maxOutputTokens: 131072 }),
  ],
})

function route(role, vendor, provider, model, extra = {}) {
  return { role, vendor, provider, model, reasoningEffort: '', vision: false, maxOutputTokens: 0,
    peakFrom: '', peakTo: '', peakDays: [], fallback: '', note: '', ...extra }
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
check('无 role 列出全部角色', (await call({})).alternatives.length, 7)
check('同厂商审查被拒 (review 审 daily-code)', (await call({ role: 'review', review_for: 'daily-code' })).ok, false)
check('跨厂商审查放行 (review 审 daily-code-offpeak)', (await call({ role: 'review', review_for: 'daily-code-offpeak' })).ok, true)
check('拒审时给出别家候选', (await call({ role: 'review', review_for: 'daily-code' })).alternatives.some(r => r.provider !== 'xiaomi-token-plan-cn'), true)
check('杂活不做视觉活', (await call({ role: 'chores', needs_vision: true })).ok, false)
check('文案做视觉活', (await call({ role: 'copywriting', needs_vision: true })).ok, true)
check('未知角色被拒', (await call({ role: 'nope' })).ok, false)

await at('2026-10-01T14:30:00', async () => {
  const d = await call({ role: 'daily-code-offpeak' })
  check('工作日下午高峰锁 deepseek', d.ok, false)
  check('高峰被拒时自动给 fallback 角色', d.route?.role, 'daily-code')
})
await at('2026-10-01T21:30:00', async () => {
  check('同一天晚上 21:30 放行 deepseek', (await call({ role: 'daily-code-offpeak' })).ok, true)
})
await at('2026-10-04T14:30:00', async () => {
  check('周日下午不算高峰', (await call({ role: 'daily-code-offpeak' })).ok, true)
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
check('example.cordis.yml 角色数', named.length, 7)

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
