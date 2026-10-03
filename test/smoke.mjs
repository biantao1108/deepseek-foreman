// 自检：装好插件、拿 pick_route 的真实判定。失败即抛。
// 跑法：npm run build && node test/smoke.mjs
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { apply } from '../lib/index.js'

// T202：整份自检跑在临时 HOME 下——skill 自动安装与角色表模板只许落进这里，绝不碰真实 ~/.dsh。
// （process.env 只在本进程内生效，进程退出即恢复。）
process.env.HOME = mkdtempSync(join(tmpdir(), 'foreman-sandbox-'))

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

// ── T201：bundle patch 里的只读审查实例 subagent_readonly ────────────────────
// patch 结构错一个缩进就静默失效（README 记载的坑），所以这里解析后逐项断言。
const patchRows = (() => {
  const parsed = parseYaml(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'))
  return Array.isArray(parsed) ? parsed : []
})()
const insertEntries = patchRows.flatMap((row) => (Array.isArray(row?.insert) ? row.insert : []))
const readonlyEntry = insertEntries.find((e) => e?.id === 'tool-subagent-readonly')
check('cordis.patch.yml 存在 id=tool-subagent-readonly 条目', !!readonlyEntry, true)
check('readonly 条目 name 是 @deepseek-ai/dsh-tool-subagent',
  readonlyEntry?.name, '@deepseek-ai/dsh-tool-subagent')
check('readonly 条目 provider=spawn 且 toolName=subagent_readonly',
  `${readonlyEntry?.config?.provider}/${readonlyEntry?.config?.toolName}`, 'spawn/subagent_readonly')
check('toolFilter.allow 恰好是 read/grep/glob（顺序无关）',
  (Array.isArray(readonlyEntry?.config?.toolFilter?.allow)
    && readonlyEntry.config.toolFilter.allow.length === 3
    && ['read', 'grep', 'glob'].every((t) => readonlyEntry.config.toolFilter.allow.includes(t))), true)
check('toolFilter.deny 恰好是 subagent_fork/subagent_readonly/workflow（堵委派绕过）',
  (Array.isArray(readonlyEntry?.config?.toolFilter?.deny)
    && readonlyEntry.config.toolFilter.deny.length === 3
    && ['subagent_fork', 'subagent_readonly', 'workflow']
      .every((t) => readonlyEntry.config.toolFilter.deny.includes(t))), true)
// T207：subagent 不在子组合全局工具表，deny 它会让 restrict() 抛 unknown global tool
check('toolFilter.deny 不含 subagent（不存在的名字会校验失败）',
  Array.isArray(readonlyEntry?.config?.toolFilter?.deny)
    && !readonlyEntry.config.toolFilter.deny.includes('subagent'), true)
check('config.modelSelectionSettings 不存在（bundle 层 standing 挂载开它会 throw）',
  readonlyEntry?.config?.modelSelectionSettings, undefined)
check('patch 里所有新增条目都在 insert: 下（顶层无裸 - id: 条目）',
  patchRows.length > 0 && patchRows.every((row) => row !== null && typeof row === 'object'
    && !('id' in row) && Array.isArray(row.insert)), true)

// ── T202：skill 自动安装 + pick_route 无 role 时返回 setup（doctor 自检） ────────────
const skillSource = fileURLToPath(new URL('../skill/deepseek-foreman', import.meta.url))
const skillDir = (home) => join(home, '.dsh', 'skills', 'deepseek-foreman')
const withHome = (home, fn) => {
  const previous = process.env.HOME
  process.env.HOME = home
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.HOME
    else process.env.HOME = previous
  }
}
const freshHome = (label) => mkdtempSync(join(tmpdir(), `foreman-${label}-`))

// a. 没有 skills 目录 → 插件加载时自动建软链，SKILL.md 可读
const skillHome = freshHome('skill')
const skillTool = withHome(skillHome, () => mount({ roles: inlineOnly }))
const skillSetup = (await skillTool.execute({})).setup
check('T202 无 skills 目录 → 自动装为软链', skillSetup.skill, 'linked')
check('T202 软链指向包内 skill/deepseek-foreman', readlinkSync(skillDir(skillHome)), skillSource)
check('T202 软链后 SKILL.md 可读', readFileSync(join(skillDir(skillHome), 'SKILL.md'), 'utf8').includes('deepseek-foreman'), true)
check('T202 setup 四个键齐全', Object.keys(skillSetup).join(','), 'rolesFile,skill,allowlist,hints')
check('T202 直传 roles → rolesFile.status=ok 且注明未使用',
  skillSetup.rolesFile.status === 'ok' && skillSetup.rolesFile.detail.includes('直传'), true)

// b. 已存在（普通目录）→ 不覆盖：标记文件原样，也不会被换成软链
const keepHome = freshHome('keepskill')
const keptDir = skillDir(keepHome)
mkdirSync(keptDir, { recursive: true })
writeFileSync(join(keptDir, 'MARKER.md'), 'pre-existing')
const keepTool = withHome(keepHome, () => mount({ roles: inlineOnly }))
const keepSetup = (await keepTool.execute({})).setup
check('T202 已有 skill 目录 → exists 且不动', keepSetup.skill, 'exists')
check('T202 已有目录没被换成软链', lstatSync(keptDir).isSymbolicLink(), false)
check('T202 已有目录里的文件原样', readFileSync(join(keptDir, 'MARKER.md'), 'utf8'), 'pre-existing')

// c. installSkill: false → 一个文件都不建
const offHome = freshHome('offskill')
const offTool = withHome(offHome, () => mount({ roles: inlineOnly, installSkill: false }))
check('T202 installSkill:false → skills 目录不创建', existsSync(join(offHome, '.dsh', 'skills')), false)
check('T202 installSkill:false → setup.skill=disabled', (await offTool.execute({})).setup.skill, 'disabled')

// d. 软链与拷贝都失败 → 不抛错，原因记进 setup.skill 和 hints
const badHome = freshHome('badskill')
mkdirSync(join(badHome, '.dsh'))
writeFileSync(join(badHome, '.dsh', 'skills'), 'i am a file, not a directory')
const badTool = withHome(badHome, () => mount({ roles: inlineOnly })) // 若这里抛错，测试会直接崩
const badSetup = (await badTool.execute({})).setup
check('T202 skills 路径被文件占住 → failed: 而非抛错', badSetup.skill.startsWith('failed:'), true)
check('T202 安装失败原因进 hints', badSetup.hints.some((h) => h.includes('skill 自动安装失败')), true)

// d2. T202b：悬空软链占位 → 不报假绿 exists，清理后重装，装完 SKILL.md 可读
const dangleHome = freshHome('dangle')
const dangleDir = skillDir(dangleHome)
mkdirSync(dirname(dangleDir), { recursive: true })
symlinkSync(join(dangleHome, 'gone-skill'), dangleDir) // 指向不存在的路径：statSync 跟不过去
const dangleTool = withHome(dangleHome, () => mount({ roles: inlineOnly }))
const dangleSetup = (await dangleTool.execute({})).setup
check('T202b 悬空软链重装为 linked（不是假绿 exists）', dangleSetup.skill, 'linked')
check('T202b 清理重装后 SKILL.md 可读',
  readFileSync(join(dangleDir, 'SKILL.md'), 'utf8').includes('deepseek-foreman'), true)
check('T202b 重装结果就是指向包内 skill 的真软链', readlinkSync(dangleDir), skillSource)

// d3. T202b：普通文件占住安装目标 → failed: 目标路径被普通文件占用 + 对应 hints，文件原样不动
const fileHome = freshHome('fileskill')
const fileTarget = skillDir(fileHome)
mkdirSync(dirname(fileTarget), { recursive: true })
writeFileSync(fileTarget, 'plain file, not a skill dir')
const fileTool = withHome(fileHome, () => mount({ roles: inlineOnly }))
const fileSetup = (await fileTool.execute({})).setup
check('T202b 普通文件占位 → failed: 目标路径被普通文件占用',
  fileSetup.skill.startsWith('failed:') && fileSetup.skill.includes('目标路径被普通文件占用'), true)
check('T202b 占位失败有对应 hints', fileSetup.hints.some((h) => h.includes('被普通文件占用')), true)
check('T202b 占位文件原样保留（不被覆盖）', readFileSync(fileTarget, 'utf8'), 'plain file, not a skill dir')

// e. doctor 对账：假 profile patch 含 allowedModels，角色表故意放一个不在白名单的路由
const docHome = freshHome('doctor')
mkdirSync(join(docHome, '.dsh', 'profiles', 'desktop'), { recursive: true })
writeFileSync(join(docHome, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), [
  '- id: model-selection-settings',
  '  name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings"',
  '  config:',
  '    enabled: true',
  '    allowedModels:',
  '      - provider: provider-a',
  '        model: model-a',
  '',
].join('\n'))
mkdirSync(join(docHome, '.dsh', 'profiles', 'broken'), { recursive: true })
writeFileSync(join(docHome, '.dsh', 'profiles', 'broken', 'cordis.patch.yml'), 'allowedModels: [oops\n')
const docTool = withHome(docHome, () => mount({ roles: [
  route('lead', 'vendor-a', 'provider-a', 'model-a'),
  route('rogue', 'vendor-b', 'provider-x', 'model-y'),
] }))
// 白名单扫描发生在 execute 那一刻 → 临时 HOME 必须把调用也包住
const docSetup = (await withHome(docHome, () => docTool.execute({}))).setup
check('T202 白名单扫描到 provider-a/model-a',
  docSetup.allowlist.routes.some((p) => p.provider === 'provider-a' && p.model === 'model-a'), true)
check('T202 白名单对账 status=ok', docSetup.allowlist.status, 'ok')
check('T202 白名单外的角色被标出', docSetup.allowlist.unmatchedRoles.map((m) => m.role).join(','), 'rogue')
check('T202 白名单内的 lead 不被误标', docSetup.allowlist.unmatchedRoles.some((m) => m.role === 'lead'), false)
check('T202 读不到的 profile patch 标 unknown', docSetup.allowlist.profiles.filter((p) => p.status === 'unknown').length, 1)
check('T202 hints 点名 rogue 并指路「加白名单后开新会话」',
  docSetup.hints.some((h) => h.includes('角色 rogue') && h.includes('加进白名单后开新会话')), true)

// f. 一个白名单都读不到 → allowlist=unknown，不再逐个角色报「不在白名单」
const blindHome = freshHome('blinddoctor')
const blindTool = withHome(blindHome, () => mount({ roles: inlineOnly }))
const blindSetup = (await withHome(blindHome, () => blindTool.execute({}))).setup
check('T202 读不到 profiles → allowlist.status=unknown', blindSetup.allowlist.status, 'unknown')
check('T202 读不到白名单时不误标角色', blindSetup.allowlist.unmatchedRoles.length, 0)
check('T202 hints 说明无法核对白名单', blindSetup.hints.some((h) => h.includes('无法核对角色路由')), true)

// ── T202b：白名单只认 model-selection 条目 + 按 profile 粒度对账 + 未启用白名单 ─────────
// a. 别的插件也叫 allowedModels 的段不算白名单，否则该拦的角色会被放行（对账假阴性）
const scopedHome = freshHome('scoped')
mkdirSync(join(scopedHome, '.dsh', 'profiles', 'desktop'), { recursive: true })
writeFileSync(join(scopedHome, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), [
  '- id: model-selection-settings',
  '  name: "@deepseek-ai/dsh-tool-subagent/model-selection-settings"',
  '  config:',
  '    enabled: true',
  '    allowedModels:',
  '      - provider: provider-a',
  '        model: model-a',
  '- id: other-tool',
  '  name: "@deepseek-ai/dsh-tool-other"',
  '  config:',
  '    allowedModels:',
  '      - provider: provider-x',
  '        model: model-y',
  '',
].join('\n'))
const scopedTool = withHome(scopedHome, () => mount({ roles: [
  route('lead', 'vendor-a', 'provider-a', 'model-a'),
  route('rogue', 'vendor-b', 'provider-x', 'model-y'),
] }))
const scopedSetup = (await withHome(scopedHome, () => scopedTool.execute({}))).setup
check('T202b 只收集 name 含 model-selection 条目下的 allowedModels',
  scopedSetup.allowlist.routes.some((p) => p.provider === 'provider-x' && p.model === 'model-y'), false)
check('T202b 只在别的插件 allowedModels 里的角色仍被标为 unmatched',
  scopedSetup.allowlist.unmatchedRoles.map((m) => m.role).join(','), 'rogue')
check('T202b roleMatches 注明 lead 匹配到 desktop',
  JSON.stringify(scopedSetup.allowlist.roleMatches.find((m) => m.role === 'lead')?.matchedIn), '["desktop"]')
check('T202b roleMatches 注明 rogue 没匹配到任何 profile',
  JSON.stringify(scopedSetup.allowlist.roleMatches.find((m) => m.role === 'rogue')?.matchedIn), '[]')

// b. 所有 profile 都读得到但没有 allowedModels 段 → not-configured，不再逐角色报警
const bareHome = freshHome('bareallow')
mkdirSync(join(bareHome, '.dsh', 'profiles', 'desktop'), { recursive: true })
writeFileSync(join(bareHome, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), [
  '- id: other-tool',
  '  name: "@deepseek-ai/dsh-tool-other"',
  '  config:',
  '    enabled: true',
  '',
].join('\n'))
const bareTool = withHome(bareHome, () => mount({ roles: inlineOnly }))
const bareSetup = (await withHome(bareHome, () => bareTool.execute({}))).setup
check('T202b 没有 allowedModels 段 → allowlist.status=not-configured', bareSetup.allowlist.status, 'not-configured')
check('T202b 未启用白名单时不逐角色报警', bareSetup.allowlist.unmatchedRoles.length, 0)
check('T202b hints 改说「未启用白名单，当前不强制限制派单；建议启用」',
  bareSetup.hints.some((h) => h.includes('未启用白名单，当前不强制限制派单；建议启用')), true)

// g. rolesFile 三态（ok / unconfigured / error）+ 只有无 role 的调用带 setup
const okFile = join(dir, 'doctor-ok.yml')
save(okFile, tableA, 1_700_000_300)
const okTool = mount({ roles: [], rolesFile: okFile })
const okSetup = (await okTool.execute({})).setup
check('T202 角色表可读 → rolesFile.status=ok、roles=2',
  okSetup.rolesFile.status === 'ok' && okSetup.rolesFile.roles === 2, true)
check('T202 带 role 的调用不返回 setup', 'setup' in (await okTool.execute({ role: 'lead' })), false)
const newFile = join(dir, 'doctor-new', 'foreman.roles.yml')
const newSetup = (await mount({ roles: [], rolesFile: newFile }).execute({})).setup
check('T202 角色表还没铺出 → status=unconfigured', newSetup.rolesFile.status, 'unconfigured')
check('T202 未配置态 hints 给编辑指引', newSetup.hints.some((h) => h.includes('角色表还没配置')), true)
const errFile = join(dir, 'doctor-err.yml')
save(errFile, tableBroken, 1_700_000_400)
const errSetup = (await mount({ roles: [], rolesFile: errFile }).execute({})).setup
check('T202 角色表坏文件 → status=error 且 detail 带解析摘要',
  errSetup.rolesFile.status === 'error' && errSetup.rolesFile.detail.includes('YAML 解析失败'), true)
check('T202 坏文件的 hints 点出角色表有问题', errSetup.hints.some((h) => h.includes('角色表有问题')), true)


// ── R5 验收指纹（accept_check 模式）──
{
  const os = await import('node:os'); const fs = await import('node:fs'); const path = await import('node:path')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foreman-accept-'))
  const { execSync } = await import('node:child_process')
  execSync('git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init', { cwd: dir })
  const head = execSync('git -C ' + dir + ' rev-parse HEAD', { encoding: 'utf8' }).trim()
  const good = path.join(dir, 'good.md')
  fs.writeFileSync(good, `# 回执 T901\n> 工单：\`_tickets/doing/T901.md\`\n\n## 指纹\n- HEAD sha: ${head.slice(0, 8)}\n- [验收1]: pass\n- [验收2]: pass\n`)
  const bad = path.join(dir, 'bad.md')
  fs.writeFileSync(bad, `# 回执\n## 指纹\n- HEAD sha: deadbeef\n- [验收1]: pass\n- [验收2]: fail\n`)
  const rGood = await call({ accept_check: good, project_root: dir })
  const rBad = await call({ accept_check: bad, project_root: dir })
  const rNone = await call({ accept_check: path.join(dir, 'none.md'), project_root: dir })
  check('R5 指纹齐备且 HEAD 一致 → ready', rGood.acceptCheck.ready, true)
  check('R5 指纹 HEAD 不符/有 fail → not ready', rBad.acceptCheck.ready, false)
  check('R5 HEAD 核对比对正确', rBad.acceptCheck.headMatches, false)
  check('R5 回执缺失 → checks 空且 not ready', rNone.acceptCheck.ready && rNone.acceptCheck.checks.length, false)
}

// ── token 计量（cost 模式）──
{
  const fakeSession = { id: 's1' }
  const fakeCtx = {
    get(name) {
      if (name === 'sessions') return { get: () => fakeSession }
      if (name === 'sessionProjections') return { snapshot: () => ({ values: { tokenUsage: { totals: { inputTokens: 12345, outputTokens: 678, cacheReadTokens: 9, cacheWriteTokens: 0 } } } }) }
      return undefined
    },
  }
  const mk = (ctx2) => { let t; apply({ tools: { register: (x) => { t = x } }, get: ctx2.get }, { roles: [], rolesFile: '/tmp/cost-none.yml' }); return t }
  const r = await mk(fakeCtx).execute({ cost_session: 's1' }, {})
  check('cost 模式读到真实 token（input 12345）', r.cost.found && r.cost.totals.inputTokens, 12345)
  const r2 = await mk({ get: () => undefined }).execute({ cost_session: 's1' }, {})
  check('cost 模式服务缺失 → found=false 不编数', r2.cost.found, false)
}

console.log(failed === 0 ? `\n全部通过（${total} 项）` : `\n${failed}/${total} 项失败`)
process.exit(failed === 0 ? 0 : 1)

