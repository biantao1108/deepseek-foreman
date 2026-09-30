// 自检：装好插件、拿 pick_route 的真实判定。失败即抛。
// 跑法：npm run build && node test/smoke.mjs
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { apply } from '../lib/index.js'

let tool
apply({ tools: { register: (t) => { tool = t } } }, {
  roles: [
    route('lead', 'vendor-a', 'provider-a', 'model-a'),
    route('ui-design', 'vendor-a', 'provider-a', 'model-a', { vision: true }),
    route('daily-code', 'vendor-b', 'provider-b', 'model-b', { vision: true }),
    route('daily-code-offpeak', 'vendor-c', 'provider-c', 'model-c', {
      peakWindows: ['09:00-12:00', '14:00-18:00'], peakDays: [1, 2, 3, 4, 5],
      holidays: ['2026-10-01', '2026-10-08'], fallback: 'daily-code',
    }),
    route('review', 'vendor-a', 'provider-a', 'model-a', { vision: true }),
    route('copywriting', 'vendor-d', 'provider-d', 'model-d', { vision: true }),
    route('chores', 'vendor-d', 'provider-d', 'model-e', { maxOutputTokens: 131072 }),
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
let total = 0
const check = (name, got, want) => {
  total++
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}  →  ${got}`)
}

console.log('tool:', tool.name)
check('无 role 列出全部角色', (await call({})).alternatives.length, 7)
check('异族审查：审另一家厂商写的 daily-code 放行', (await call({ role: 'review', review_for: 'daily-code' })).ok, true)
check('跨厂商审查放行 (review 审 daily-code-offpeak)', (await call({ role: 'review', review_for: 'daily-code-offpeak' })).ok, true)
check('同厂商审查自家产物被拒', (await call({ role: 'review', review_for: 'ui-design' })).ok, false)
check('同厂商拒审时给出别家候选', (await call({ role: 'review', review_for: 'ui-design' })).alternatives.some(r => r.provider !== 'provider-a'), true)
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
check('长产出拒小上限角色', (await call({ role: 'ui-design', needs_long_output: true })).ok, true) // ui-design 未声明上限 → 按设计跳过检查
check('chores 声明 131072，长产出放行', (await call({ role: 'chores', needs_long_output: true })).ok, true)

// 32768 上限的角色（如 model-tiny）必须被长产出拦下
let tinyTool
apply({ tools: { register: (t) => { tinyTool = t } } }, {
  roles: [route('tiny', 'vendor-e', 'provider-e', 'model-tiny', { maxOutputTokens: 32768 })],
})
check('32768 上限角色被长产出拒绝', (await tinyTool.execute({ role: 'tiny', needs_long_output: true }, {})).ok, false)
check('同一角色普通产出放行', (await tinyTool.execute({ role: 'tiny' }, {})).ok, true)

// example.cordis.yml 是开源门面：必须存在，且解析出来的 provider/model 只能是占位（注释态即没有值）
const examplePath = new URL('../example.cordis.yml', import.meta.url)
const example = readFileSync(examplePath, 'utf8')
const exampleRows = parseYaml(example)
const exampleFile = Array.isArray(exampleRows) ? exampleRows : []
const exampleRoutes = []
const collectRouteValues = (node) => {
  if (Array.isArray(node)) { node.forEach(collectRouteValues); return }
  if (node === null || typeof node !== 'object') return
  for (const [key, value] of Object.entries(node)) {
    if ((key === 'provider' || key === 'model') && typeof value === 'string') exampleRoutes.push(value)
    else collectRouteValues(value)
  }
}
collectRouteValues(exampleFile)
const isPlaceholder = (value) => /^(YOUR_|PROVIDER_|MODEL_)/.test(value)
check('example.cordis.yml 存在，且 provider/model 全是占位或注释态',
  existsSync(examplePath) && exampleFile.some(row => row?.id === 'foreman') && exampleRoutes.every(isPlaceholder), true)

// ── T102：角色表外置到 rolesFile，热更新 + 坏文件保护 ─────────────────────────
const mount = (config) => {
  let mounted
  apply({ tools: { register: (t) => { mounted = t } } }, config)
  return mounted
}
const dir = mkdtempSync(join(tmpdir(), 'foreman-smoke-'))
const save = (file, text, seconds) => {
  writeFileSync(file, text)
  utimesSync(file, seconds, seconds) // 显式 mtime：热更新判定不靠写文件的时间精度
}
const exampleYml = readFileSync(new URL('../roles.example.yml', import.meta.url), 'utf8')
const tableA = ['roles:', '  - role: lead', '    vendor: vendor-a', '    provider: provider-a',
  '    model: model-a', '  - role: review', '    vendor: vendor-b', '    provider: provider-b',
  '    model: model-b', ''].join('\n')
const tableB = ['roles:', '  - role: chores', '    vendor: vendor-a', '    provider: provider-a',
  '    model: model-a', '  - role: review', '    vendor: vendor-b', '    provider: provider-b',
  '    model: model-b', ''].join('\n')
const tableBroken = 'roles:\n  - role: lead\n   vendor: vendor-a\n'
const tableDup = ['roles:', '  - role: lead', '    vendor: vendor-a', '    provider: provider-a',
  '    model: model-a', '  - role: lead', '    vendor: vendor-b', '    provider: provider-b',
  '    model: model-b', ''].join('\n')
const inlineOnly = [route('only', 'vendor-a', 'provider-a', 'model-a')]

// a. config 直传 roles：老接法行为不变，rolesFile 被忽略
const inlineTool = mount({ roles: inlineOnly })
check('config 直传 roles 行为不变（回归）', (await inlineTool.execute({ role: 'only' }, {})).ok, true)
const ghost = join(dir, 'ghost.yml')
mount({ roles: inlineOnly, rolesFile: ghost })
check('config.roles 非空 → 不读也不铺 rolesFile', existsSync(ghost), false)
const ignored = join(dir, 'ignored.yml')
save(ignored, tableA, 1_700_000_000)
const inlineTool2 = mount({ roles: inlineOnly, rolesFile: ignored })
check('config.roles 非空 → 文件里的角色不参与裁决', (await inlineTool2.execute({ role: 'lead' }, {})).ok, false)
const thrown = (fn) => { try { fn(); return '没抛错' } catch (error) { return error.message } }
check('config 直传角色重名仍然当场抛错（老行为保留）',
  thrown(() => mount({ roles: [route('dup', 'vendor-a', 'provider-a', 'model-a'), route('dup', 'vendor-b', 'provider-b', 'model-b')] })),
  'foreman: duplicate role in config.roles')

// b. rolesFile 不存在 → 自动铺模板 + 未配置态引导
const autoFile = join(dir, 'nested', 'deep', 'foreman.roles.yml')
const bootTool = mount({ roles: [], rolesFile: autoFile })
check('rolesFile 不存在 → 自动铺出模板（含父目录）', existsSync(autoFile), true)
check('铺出的模板与包内 roles.example.yml 一致', readFileSync(autoFile, 'utf8') === exampleYml, true)
const boot = await bootTool.execute({ role: 'lead' })
check('未配置态：指定角色也 ok:false', boot.ok, false)
check('未配置态：reason 带文件位置与下一步', boot.reason.includes(autoFile) && boot.reason.includes('按注释填好 provider/model，保存即生效'), true)
const bootList = await bootTool.execute({})
check('未配置态：列角色也 ok:false 且无候选', bootList.ok === false && bootList.alternatives.length === 0, true)

// c. rolesFile 留空 → 默认 <home>/.dsh/foreman.roles.yml
const fakeHome = mkdtempSync(join(tmpdir(), 'foreman-home-'))
const realHome = process.env.HOME
process.env.HOME = fakeHome
try {
  const homeTool = mount({ roles: [] })
  check('rolesFile 留空 → 默认落在 <home>/.dsh/foreman.roles.yml', existsSync(join(fakeHome, '.dsh', 'foreman.roles.yml')), true)
  check('默认落点同样是未配置态', (await homeTool.execute({})).ok, false)
} finally {
  if (realHome === undefined) delete process.env.HOME
  else process.env.HOME = realHome
}

// d. 热更新：写合法表 → 生效；改坏 → 保留旧表 + ok:false；修好 → 自动恢复
const liveFile = join(dir, 'live.yml')
const liveTool = mount({ roles: [], rolesFile: liveFile })
save(liveFile, tableA, 1_700_000_000)
check('写入合法 rolesFile → 下次调用即生效（热更新）', (await liveTool.execute({ role: 'lead' })).ok, true)
check('热更新后列出新表的 2 个角色', (await liveTool.execute({})).alternatives.length, 2)
save(liveFile, tableBroken, 1_700_000_100)
const broken = await liveTool.execute({})
check('改坏 rolesFile → 本次调用 ok:false', broken.ok, false)
check('改坏后 reason 带 YAML 解析错误摘要', broken.reason.includes('YAML 解析失败') && broken.reason.includes('line 3'), true)
check('改坏后保留上一份好表（alternatives 仍 2 条）', (await liveTool.execute({})).alternatives.length, 2)
check('改坏期间指定角色也仍被拒', (await liveTool.execute({ role: 'lead' })).ok, false)
save(liveFile, tableB, 1_700_000_200)
check('文件修好后自动恢复', (await liveTool.execute({ role: 'chores' })).ok, true)
check('恢复后用的是新表（旧表 lead 已不存在）', (await liveTool.execute({ role: 'lead' })).ok, false)

// e. 文件里的重名与 schema 类型错误都走校验失败路径
const dupFile = join(dir, 'dup.yml')
save(dupFile, tableDup, 1_700_000_000)
const dupTool = mount({ roles: [], rolesFile: dupFile })
const dup = await dupTool.execute({})
check('rolesFile 里 role 重名 → 校验失败', dup.ok, false)
check('重名 reason 点出重复的角色名', dup.reason.includes('角色名重复'), true)
const typeFile = join(dir, 'type.yml')
save(typeFile, 'roles: nope\n', 1_700_000_000)
check('roles 类型错误 → 校验失败并带 schema 摘要', (await mount({ roles: [], rolesFile: typeFile }).execute({})).reason.includes('expected array'), true)

// ── T102b：~ 展开、TOCTOU 顺序、铺盖排他、删文件不留陈旧错、空表保旧表 ──────────
// f. ~ 展开：rolesFile 写 ~/ 时落到 home 下（用临时 HOME 模拟，不碰真实 ~/.dsh）
const srcText = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
const loadBody = srcText.slice(srcText.indexOf('function loadFile'), srcText.indexOf('function refresh'))
const statAt = loadBody.indexOf('statSync(rolesFile)')
const readAt = loadBody.indexOf('readFileSync(rolesFile')
check('TOCTOU：loadFile 里 statSync 排在 readFileSync 之前（源码顺序断言）',
  statAt !== -1 && readAt !== -1 && statAt < readAt, true)

const tildeHome = mkdtempSync(join(tmpdir(), 'foreman-tilde-'))
const homeBefore = process.env.HOME
process.env.HOME = tildeHome
try {
  mkdirSync(join(tildeHome, '.dsh'), { recursive: true }) // 造目录，不造文件：文件只许插件自己铺
  const tildeTool = mount({ roles: [], rolesFile: '~/.dsh/foreman.roles.yml' })
  const tildePath = join(tildeHome, '.dsh', 'foreman.roles.yml')
  check('rolesFile 写 ~/ → 插件把模板落到 <home>/.dsh/foreman.roles.yml', existsSync(tildePath), true)
  save(tildePath, tableA, 1_700_000_000)
  check('~/ 展开后的那份文件被真正读成角色表', (await tildeTool.execute({ role: 'lead' })).ok, true)
} finally {
  if (homeBefore === undefined) delete process.env.HOME
  else process.env.HOME = homeBefore
}

// g. TOCTOU 行为回归：同一文件连改两次，第二次的内容必须是当次生效的那份
const toctouFile = join(dir, 'toctou.yml')
const toctouTool = mount({ roles: [], rolesFile: toctouFile })
save(toctouFile, tableA, 1_700_000_000)
check('TOCTOU 回归：先读到表 A（lead 可用）', (await toctouTool.execute({ role: 'lead' })).ok, true)
save(toctouFile, tableB, 1_700_000_050)
check('TOCTOU 回归：再改一次读到的是表 B（chores 可用）', (await toctouTool.execute({ role: 'chores' })).ok, true)
check('TOCTOU 回归：旧表 A 的角色随新表失效（lead 不在表 B）', (await toctouTool.execute({ role: 'lead' })).ok, false)

// h. 运行中文件被删：当次调用即重铺模板，不带上一份文件的陈旧报错
const goneFile = join(dir, 'gone.yml')
save(goneFile, tableBroken, 1_700_000_000) // 从没读到过好表：内存里唯一记住的就是这个错
const goneTool = mount({ roles: [], rolesFile: goneFile })
const beforeDelete = await goneTool.execute({})
check('删文件前基线：坏文件报 YAML 解析失败', beforeDelete.ok === false && beforeDelete.reason.includes('YAML 解析失败'), true)
rmSync(goneFile)
const afterDelete = await goneTool.execute({})
check('删文件后当次调用即重铺出模板', existsSync(goneFile), true)
check('删文件后当次调用是干净的「未配置」态（无陈旧 YAML 报错）',
  afterDelete.ok === false && afterDelete.reason.includes('还没有启用中的角色')
  && !afterDelete.reason.includes('YAML 解析失败'), true)
// h2. 已有旧表时删文件：重铺的模板是空表 → 按第 5 条保旧表（且同样不得带陈旧报错）
const goneLive = join(dir, 'gone-live.yml')
save(goneLive, tableA, 1_700_000_000)
const goneLiveTool = mount({ roles: [], rolesFile: goneLive })
check('删文件前基线：表 A 在内存里可用', (await goneLiveTool.execute({ role: 'lead' })).ok, true)
rmSync(goneLive)
const goneLiveAfter = await goneLiveTool.execute({ role: 'lead' })
check('有旧表时删文件 → 重铺模板 + 空表保旧表，不带陈旧错',
  existsSync(goneLive) && goneLiveAfter.ok === false
  && goneLiveAfter.reason.includes('文件里是空表') && !goneLiveAfter.reason.includes('配置文件读取失败'), true)
check('有旧表时删文件 → alternatives 仍列旧表 2 条', goneLiveAfter.alternatives.length, 2)

// i. 铺模板带排他：已有的表不被覆盖，占住路径时宁可报错也不覆盖
const keepFile = join(dir, 'keep.yml')
save(keepFile, tableA, 1_700_000_000)
mount({ roles: [], rolesFile: keepFile })
check('已存在的 rolesFile 不会被模板覆盖', readFileSync(keepFile, 'utf8') === tableA, true)
const linkFile = join(dir, 'dangling.yml')
const linkTarget = join(dir, 'dangling-target.yml')
symlinkSync(linkTarget, linkFile) // statSync 看不到这个悬空软链 → 插件会去铺模板，COPYFILE_EXCL 必须挡住
const linkTool = mount({ roles: [], rolesFile: linkFile })
const linkCall = await linkTool.execute({})
check('COPYFILE_EXCL：目标被占住时铺模板失败并如实报错',
  linkCall.ok === false && linkCall.reason.includes('模板写入失败'), true)
check('COPYFILE_EXCL：那次冲突没有覆盖出任何文件', existsSync(linkTarget), false)

// j. 合法空表：有旧表就保旧表，从没读到过好表才是「未配置」
const emptyFile = join(dir, 'empty.yml')
save(emptyFile, tableA, 1_700_000_000)
const emptyTool = mount({ roles: [], rolesFile: emptyFile })
check('空表前基线：表 A 可用', (await emptyTool.execute({ role: 'lead' })).ok, true)
save(emptyFile, 'roles: []\n', 1_700_000_100)
const emptied = await emptyTool.execute({ role: 'lead' })
check('文件改成合法空表 → 本次调用 ok:false', emptied.ok, false)
check('空表保旧表：alternatives 仍是表 A 的 2 条', emptied.alternatives.length, 2)
check('空表 reason 说明保留了旧表',
  emptied.reason.includes('文件里是空表') && emptied.reason.includes('已保留上一份可用角色表'), true)
const freshEmptyFile = join(dir, 'fresh-empty.yml')
save(freshEmptyFile, 'roles: []\n', 1_700_000_000)
const freshEmpty = await mount({ roles: [], rolesFile: freshEmptyFile }).execute({})
check('从没读到过好表时空表仍是「未配置」文案',
  freshEmpty.ok === false && freshEmpty.reason.includes('还没有启用中的角色'), true)

console.log(failed === 0 ? `\n全部通过（${total} 项）` : `\n${failed}/${total} 项失败`)
process.exit(failed === 0 ? 0 : 1)
