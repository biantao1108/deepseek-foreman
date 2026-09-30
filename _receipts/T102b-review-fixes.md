# 回执 T102b：修 T102 审查发现的 5 处问题

> 执行引擎：deepseek-official/deepseek-flash
> reasoning_effort：high（照工单头 claimed-by 记录）
> 完成时间：2026-10-01 01:08
> 分支 / 提交 / PR：无（按工单边界，未提交、未合并）
> 工单：留在 _tickets/doing/ 等待验收

## 1. 做了什么

工单点名的 5 条逐条落地，代码全在 `src/index.ts`，外加 `cordis.patch.yml` 一行注释：

1. **`~` 展开**：`rolesFile` 解析处先取 `config.rolesFile ?? ''`；为空才落默认 `<home>/.dsh/foreman.roles.yml`；以 `~/` 开头则 `join(homedir(), configured.slice(2))`。`homedir()` 仍在 `apply()` 里现算，所以 `HOME` 被改写时（自检就是这么验的）落点跟着变。`cordis.patch.yml` 第 13 行注释示例保持 `~/.dsh/foreman.roles.yml` 原样，只在第 12 行的引导句尾补了「开头写 ~/ 会展开成家目录」。
2. **TOCTOU 方向**：`loadFile` 改为**先 `statSync` 记 `loadedMtimeMs`、后 `readFileSync`**。两步之间文件若被改，记下的是旧 mtime、读到的是新内容 → 下次调用必重读（最坏多 reload 一次）；原来的 read-then-stat 会记下新 mtime 配旧内容 → 从此永不重读。
3. **restoreTemplate 成功清旧错**：`writeTemplate()` 成功后 `loadError = undefined`。`refresh()` 里紧跟的 `if (loadError !== undefined) return` 于是不再被**上一份文件的陈旧报错**拦住，当次调用继续走 re-stat → `loadFile`：没有旧表时回到「未配置」态，有旧表时按第 5 条回到「空表保旧表」态（两种情况都不再带陈旧报错）。
4. **模板铺盖加排他**：`copyFileSync(EXAMPLE_ROLES_FILE, rolesFile, constants.COPYFILE_EXCL)`（`constants` 从 `node:fs` 导入）；EEXIST 落进 `restoreTemplate` 现有 catch，变成可读的「模板写入失败（…）」reason，而不是静默覆盖掉刚出现的文件。
5. **合法空表保留旧表**：`loadFile` 里 `table.length === 0` 时，若内存里有旧表（`roles.length > 0`）则只 `loadError = fileReason('文件里是空表')` 并 return，角色表原样保留；从没读到过好表时保持原「未配置：…里还没有启用中的角色」文案。

`test/smoke.mjs` 新增 20 项自检（42 → **62** 项），5 条各有对应检查：`~` 展开（临时 `HOME` 里插件自己铺模板 → 再写表验证确实读的是那份）、TOCTOU（① 读源码断言 `statSync` 与 `readFileSync` 的先后，② 同一文件连改两次「第二次内容当次生效」的行为回归）、删文件后当次调用进入干净「未配置」态（无旧表 / 有旧表两支都验，后者落「空表保旧表」）、COPYFILE_EXCL（含悬空软链占位时拒绝铺盖且不产出文件）、空表保旧表（有旧表 / 无旧表两支）。临时文件全走 `mkdtempSync(os.tmpdir())`；真实 `~/.dsh/foreman.roles.yml` 全程未被读写（见 §4-5）。

## 2. 文件清单

- `src/index.ts`
- `test/smoke.mjs`
- `cordis.patch.yml`（第 12 行注释一句）
- 本回执：`_receipts/T102b-review-fixes.md`

未动：`README.md`、`roles.example.yml`、`example.cordis.yml`、`package.json`、`skill/`、`docs/`、`_tickets/`（工单位置未挪）。

## 3. 验收证据

### 3.1 验收 1：`npm run build && node test/smoke.mjs` → 全部通过（62 项），exit=0

命令：`npm run build && node test/smoke.mjs; echo "ACCEPTANCE1_EXIT=$?"`

```text
> dsh-foreman@0.2.0 build
> tsc -p tsconfig.json

tool: pick_route
  ok   无 role 列出全部角色  →  7
  ok   K3 审小米写的 daily-code 放行（异族）  →  true
  ok   跨厂商审查放行 (review 审 daily-code-offpeak)  →  true
  ok   K3 审 K3 自己的产物被拒  →  false
  ok   同厂商拒审时给出别家候选  →  true
  ok   杂活不做视觉活  →  false
  ok   文案做视觉活  →  true
  ok   未知角色被拒  →  false
  ok   周三 11:00 落在 09:00-12:00 高峰 → 锁  →  false
  ok   高峰被拒时自动给 fallback 角色  →  daily-code
  ok   周三 13:00 午休属空闲 → 放行（单窗口实现会误锁）  →  true
  ok   周三 15:00 落在 14:00-18:00 高峰 → 锁  →  false
  ok   周三 21:30 空闲 → 放行  →  true
  ok   国庆周六 11:00 全天空闲 → 放行  →  true
  ok   10-08 是周四但属法定假日 → 放行（peakDays 单独判会误锁）  →  true
  ok   长产出拒小上限角色  →  true
  ok   M2.7 声明 131072，长产出放行  →  true
  ok   32768 上限角色被长产出拒绝  →  false
  ok   同一角色普通产出放行  →  true
  ok   example.cordis.yml 角色数  →  7
  ok   config 直传 roles 行为不变（回归）  →  true
  ok   config.roles 非空 → 不读也不铺 rolesFile  →  false
  ok   config.roles 非空 → 文件里的角色不参与裁决  →  false
  ok   config 直传角色重名仍然当场抛错（老行为保留）  →  foreman: duplicate role in config.roles
  ok   rolesFile 不存在 → 自动铺出模板（含父目录）  →  true
  ok   铺出的模板与包内 roles.example.yml 一致  →  true
  ok   未配置态：指定角色也 ok:false  →  false
  ok   未配置态：reason 带文件位置与下一步  →  true
  ok   未配置态：列角色也 ok:false 且无候选  →  true
  ok   rolesFile 留空 → 默认落在 <home>/.dsh/foreman.roles.yml  →  true
  ok   默认落点同样是未配置态  →  false
  ok   写入合法 rolesFile → 下次调用即生效（热更新）  →  true
  ok   热更新后列出新表的 2 个角色  →  2
  ok   改坏 rolesFile → 本次调用 ok:false  →  false
  ok   改坏后 reason 带 YAML 解析错误摘要  →  true
  ok   改坏后保留上一份好表（alternatives 仍 2 条）  →  2
  ok   改坏期间指定角色也仍被拒  →  false
  ok   文件修好后自动恢复  →  true
  ok   恢复后用的是新表（旧表 lead 已不存在）  →  false
  ok   rolesFile 里 role 重名 → 校验失败  →  false
  ok   重名 reason 点出重复的角色名  →  true
  ok   roles 类型错误 → 校验失败并带 schema 摘要  →  true
  ok   TOCTOU：loadFile 里 statSync 排在 readFileSync 之前（源码顺序断言）  →  true
  ok   rolesFile 写 ~/ → 插件把模板落到 <home>/.dsh/foreman.roles.yml  →  true
  ok   ~/ 展开后的那份文件被真正读成角色表  →  true
  ok   TOCTOU 回归：先读到表 A（lead 可用）  →  true
  ok   TOCTOU 回归：再改一次读到的是表 B（chores 可用）  →  true
  ok   TOCTOU 回归：旧表 A 的角色随新表失效（lead 不在表 B）  →  false
  ok   删文件前基线：坏文件报 YAML 解析失败  →  true
  ok   删文件后当次调用即重铺出模板  →  true
  ok   删文件后当次调用是干净的「未配置」态（无陈旧 YAML 报错）  →  true
  ok   删文件前基线：表 A 在内存里可用  →  true
  ok   有旧表时删文件 → 重铺模板 + 空表保旧表，不带陈旧错  →  true
  ok   有旧表时删文件 → alternatives 仍列旧表 2 条  →  2
  ok   已存在的 rolesFile 不会被模板覆盖  →  true
  ok   COPYFILE_EXCL：目标被占住时铺模板失败并如实报错  →  true
  ok   COPYFILE_EXCL：那次冲突没有覆盖出任何文件  →  false
  ok   空表前基线：表 A 可用  →  true
  ok   文件改成合法空表 → 本次调用 ok:false  →  false
  ok   空表保旧表：alternatives 仍是表 A 的 2 条  →  2
  ok   空表 reason 说明保留了旧表  →  true
  ok   从没读到过好表时空表仍是「未配置」文案  →  true

全部通过（62 项）
ACCEPTANCE1_EXIT=0
```

### 3.2 验收 2：`grep -n "COPYFILE_EXCL" src/index.ts` → 有匹配

```text
$ grep -n "COPYFILE_EXCL" src/index.ts; echo "exit=$?"
201:    copyFileSync(EXAMPLE_ROLES_FILE, rolesFile, constants.COPYFILE_EXCL)
exit=0
```

### 3.3 验收 3：`grep -n "startsWith('~/'" src/index.ts` → 有匹配

```text
$ grep -n "startsWith('~/'" src/index.ts; echo "exit=$?"
184:    : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured
exit=0
```

### 3.4 验收 4：`git status --short` → 只动点名的文件

```text
$ git status --short
 M README.md
 D _tickets/open/T102-external-roles-file.md
 M cordis.patch.yml
 M package-lock.json
 M package.json
 M src/index.ts
 M test/smoke.mjs
?? _receipts/T102-external-roles-file.md
?? _receipts/T102b-review-fixes.md
?? _tickets/doing/
?? roles.example.yml

```

说明：`README.md`、`package.json`、`package-lock.json`、`roles.example.yml`、`_receipts/T102-external-roles-file.md`、`_tickets/doing/`、`D _tickets/open/T102-external-roles-file.md` 这些条目是**领单基线**（T102 尚未提交的工作区改动 + 领单时的工单移动），不是本单产生的。本单开工前先把基线快照存下来，收工后与现状逐字对比：

```text
$ diff <(baseline git status) <(now git status)  # 领单基线 vs 现在
8a9
> ?? _receipts/T102b-review-fixes.md
```

即与基线相比只多出**一行**：本回执自身（`?? _receipts/T102b-review-fixes.md`，工单要求的产出）。除本单点名的三个文件外，没有任何文件被本单改动。

本单实际改动的三个文件（`git diff --stat` 含 T102 未提交改动，故数字是累计的）：

```text
 cordis.patch.yml |  85 +++---------------------
 src/index.ts     | 198 +++++++++++++++++++++++++++++++++++++++++++++++++------
 test/smoke.mjs   | 186 ++++++++++++++++++++++++++++++++++++++++++++++++++-
 3 files changed, 371 insertions(+), 98 deletions(-)
```

### 3.5 补充证据：5 条各自的落点（只读 grep，逐条对上工单）

```text
$ grep -n "startsWith('~/'" src/index.ts
184:    : configured.startsWith('~/') ? join(homedir(), configured.slice(2)) : configured
$ grep -n -B2 -A3 "stat first, read second" src/index.ts
222-    let text: string
223-    try {
224:      // stat first, read second: if the file changes in between, the recorded mtime is the older one,
225-      // so the next call reloads. The other order can record a newer mtime with older content and never retry.
226-      loadedMtimeMs = statSync(rolesFile).mtimeMs
227-      text = readFileSync(rolesFile, 'utf8')
$ grep -n "stale error is about the file that is gone" src/index.ts
208:      loadError = undefined // the stale error is about the file that is gone now; let refresh() re-stat and reload
$ grep -n "COPYFILE_EXCL" src/index.ts
201:    copyFileSync(EXAMPLE_ROLES_FILE, rolesFile, constants.COPYFILE_EXCL)
$ grep -n -A7 "文件里是空表" src/index.ts
251:        loadError = fileReason('文件里是空表')
252-        return
253-      }
254-      roles = []
255-      byRole = new Map()
256-      loadError = `未配置：${rolesFile} 里还没有启用中的角色。按注释填好 provider/model，保存即生效`
257-      return
258-    }
$ grep -n "展开成家目录" cordis.patch.yml
12:      # 要把角色表放到别处，就把下一行的注释解开、换成你的路径（开头写 ~/ 会展开成家目录）：
$ grep -n "TOCTOU\|COPYFILE_EXCL\|空表\|展开\|陈旧\|删文件" test/smoke.mjs
182:// ── T102b：~ 展开、TOCTOU 顺序、铺盖排他、删文件不留陈旧错、空表保旧表 ──────────
183:// f. ~ 展开：rolesFile 写 ~/ 时落到 home 下（用临时 HOME 模拟，不碰真实 ~/.dsh）
188:check('TOCTOU：loadFile 里 statSync 排在 readFileSync 之前（源码顺序断言）',
200:  check('~/ 展开后的那份文件被真正读成角色表', (await tildeTool.execute({ role: 'lead' })).ok, true)
206:// g. TOCTOU 行为回归：同一文件连改两次，第二次的内容必须是当次生效的那份
210:check('TOCTOU 回归：先读到表 A（lead 可用）', (await toctouTool.execute({ role: 'lead' })).ok, true)
212:check('TOCTOU 回归：再改一次读到的是表 B（chores 可用）', (await toctouTool.execute({ role: 'chores' })).ok, true)
213:check('TOCTOU 回归：旧表 A 的角色随新表失效（lead 不在表 B）', (await toctouTool.execute({ role: 'lead' })).ok, false)
215:// h. 运行中文件被删：当次调用即重铺模板，不带上一份文件的陈旧报错
220:check('删文件前基线：坏文件报 YAML 解析失败', beforeDelete.ok === false && beforeDelete.reason.includes('YAML 解析失败'), true)
223:check('删文件后当次调用即重铺出模板', existsSync(goneFile), true)
224:check('删文件后当次调用是干净的「未配置」态（无陈旧 YAML 报错）',
227:// h2. 已有旧表时删文件：重铺的模板是空表 → 按第 5 条保旧表（且同样不得带陈旧报错）
231:check('删文件前基线：表 A 在内存里可用', (await goneLiveTool.execute({ role: 'lead' })).ok, true)
234:check('有旧表时删文件 → 重铺模板 + 空表保旧表，不带陈旧错',
236:  && goneLiveAfter.reason.includes('文件里是空表') && !goneLiveAfter.reason.includes('配置文件读取失败'), true)
237:check('有旧表时删文件 → alternatives 仍列旧表 2 条', goneLiveAfter.alternatives.length, 2)
246:symlinkSync(linkTarget, linkFile) // statSync 看不到这个悬空软链 → 插件会去铺模板，COPYFILE_EXCL 必须挡住
249:check('COPYFILE_EXCL：目标被占住时铺模板失败并如实报错',
251:check('COPYFILE_EXCL：那次冲突没有覆盖出任何文件', existsSync(linkTarget), false)
253:// j. 合法空表：有旧表就保旧表，从没读到过好表才是「未配置」
257:check('空表前基线：表 A 可用', (await emptyTool.execute({ role: 'lead' })).ok, true)
260:check('文件改成合法空表 → 本次调用 ok:false', emptied.ok, false)
261:check('空表保旧表：alternatives 仍是表 A 的 2 条', emptied.alternatives.length, 2)
262:check('空表 reason 说明保留了旧表',
263:  emptied.reason.includes('文件里是空表') && emptied.reason.includes('已保留上一份可用角色表'), true)
267:check('从没读到过好表时空表仍是「未配置」文案',
```

### 3.6 补充证据：逐条回退验证（自检确有判别力，仓库文件没动）

做法：把仓库（排除 `node_modules`/`.git`/`lib`，`node_modules` 用软链）拷到 `/tmp/t102b-disc/` 下 5 份，每份**只回退一条修复**，再跑同一套自检。5 份全部 exit=1，且失败项都落在对应的检查上（`v4` 回退后「空表保旧表」两条路径都失败，所以是 4 项）：

```text
$ # v1_order：在该副本里只回退这一条修复，然后重跑同一套自检
exit=1
 FAIL  TOCTOU：loadFile 里 statSync 排在 readFileSync 之前（源码顺序断言）  →  false
1/62 项失败
$ # v2_staleerr：在该副本里只回退这一条修复，然后重跑同一套自检
exit=1
 FAIL  删文件后当次调用是干净的「未配置」态（无陈旧 YAML 报错）  →  false
1/62 项失败
$ # v3_excl：在该副本里只回退这一条修复，然后重跑同一套自检
exit=1
 FAIL  COPYFILE_EXCL：目标被占住时铺模板失败并如实报错  →  false
 FAIL  COPYFILE_EXCL：那次冲突没有覆盖出任何文件  →  true
2/62 项失败
$ # v4_emptytable：在该副本里只回退这一条修复，然后重跑同一套自检
exit=1
 FAIL  有旧表时删文件 → 重铺模板 + 空表保旧表，不带陈旧错  →  false
 FAIL  有旧表时删文件 → alternatives 仍列旧表 2 条  →  0
 FAIL  空表保旧表：alternatives 仍是表 A 的 2 条  →  0
 FAIL  空表 reason 说明保留了旧表  →  false
4/62 项失败
$ # v5_tilde：在该副本里只回退这一条修复，然后重跑同一套自检
exit=1
 FAIL  rolesFile 写 ~/ → 插件把模板落到 <home>/.dsh/foreman.roles.yml  →  false
 FAIL  ~/ 展开后的那份文件被真正读成角色表  →  false
2/62 项失败
```

（`v5_tilde` 回退后，插件把模板铺到了副本 cwd 下的字面量 `~` 目录里 —— 这正是工单第 1 条要修的东西；该 `~` 目录只出现在 `/tmp` 副本中，仓库里没有，见 3.7。）

### 3.7 补充证据：真实 home 未被碰、无残留进程

```text
$ stat -f '%N mtime=%Sm size=%z' ~/.dsh/foreman.roles.yml
/Users/biantao/.dsh/foreman.roles.yml mtime=Oct  1 00:56:16 2026 size=4311

$ ls -d ./~ 2>&1
ls: ./~: No such file or directory
```

- mtime/size 是 T102 收工时的值（本单全程只做过这一次 `stat`，未读未写）。
- 仓库里没有出现字面量 `~` 目录；临时 `HOME` 与临时 `rolesFile` 全部在 `os.tmpdir()` 下。
- 本单没起过任何后台进程（跑的都是同步命令），无残留；`/tmp/t102b-disc/` 是我自建的验证副本，收尾时删除（删除前校验过绝对路径）。

## 4. 风险与存疑

1. **验收 4 的 `git status` 里有多条基线条目**：T102 的改动（README/package.json/package-lock.json/roles.example.yml/cordis.patch.yml/src/test）在领单时就未提交，所以 `git status --short` 不可能只列本单文件。我用「开工前基线快照 vs 收工后」逐字 diff 证明**只多出本回执一行**（§3.4），本单只改了 `src/index.ts`、`test/smoke.mjs`、`cordis.patch.yml` 三个文件。
2. **空表保旧表的 reason 措辞与工单原文有出入**：工单给的原文是「文件里是空表，已保留上一份可用角色表；改好保存自动生效」，我复用了既有的 `fileReason()`（多带文件全路径、「已保留上一份可用角色表（见 alternatives）」、句尾作「改好保存后下次调用自动生效」），语义一致但非逐字。若要逐字照抄，改一行即可。
3. **「空表保旧表」导致进程内没有清空角色表的路径（值得 Lead 知道）**：第 5 条落地后，一旦读到过一份非空好表，内存里的表就只能被**另一份非空好表**替换 —— 写空表会保旧表；写坏文件会保旧表；把文件删掉，`refresh()` 会重铺模板，落回第 5 条的「空表」分支，同样保旧表。也就是说，撤销全部路由只能靠重启（或先写一份不含目标角色的非空表）。实际危害有限：这些状态下 `pick_route` 一律 `ok:false`，旧表只出现在 `alternatives` 里做参考，不会真的派单；但我把代码里原先那句「删文件是显式清空路径」的注释改掉了，改成如实描述这一后果（`src/index.ts` 第 248-250 行注释）。
4. **`~` 展开只认 `~/` 前缀**：不支持裸 `~` 和 `~user/...`（工单第 1 条字面要求就是 `startsWith('~/')`）。写裸 `~` 会被当成相对路径，插件会照它建目录铺模板；我没加额外拦截（未在工单范围内）。`~` 展开在 inline config 模式（`config.roles` 非空）下仍会算一次路径但一次盘都不碰，与原行为一致。
5. **真实 `~/.dsh/foreman.roles.yml` 我没碰**：它存在与否、内容是 T102 回执 §4-2 记录的那份「探针铺出的模板」。本单按「未写明的删除不做」既没删也没覆盖，也没把它读进任何判定。
6. **`loadedMtimeMs` 在「stat 成功、read 失败」时已被推进**：此时 `loadError` 会置成「配置文件读取失败」，调用被正确拒绝；只是同 mtime 下下次不会重读，需等 mtime 变化。这与 T102 的既有语义相同，本次只把两条语句换了顺序，在此点明而非掩盖。
7. **mtime 相同不重读**（T102 回执 §4-5 的老边界，同秒内改两次且 mtime 未变时不会热重载）不在本单范围内，未动。
8. **自检里有一条静态断言读 `src/index.ts`**（TOCTOU 的源码顺序断言）：它把测试和 `loadFile` 的实现文本绑在一起，将来重排/改名那几行会让它以「源码顺序断言」失败。这是工单「构造 stat-then-read 顺序的断言」要求的最直接做法，但属于测试与实现耦合的取舍，特此记录。
9. **COPYFILE_EXCL 的验证手法**：单线程里没有真的竞态窗口，我用「悬空软链占住目标路径」构造了 `statSync` 看不到、而 `copyFileSync` 必然撞上的目标（POSIX 下 `O_CREAT|O_EXCL` 遇软链一律 EEXIST）。仓库外的探针已证实：同一路径加 EXCL 抛 EEXIST、不加 EXCL 会顺着软链把文件写出来。所以这条自检确实卡的是 EXCL 语义，而不是别的意外。
10. **未做的**：未 git commit / 未合并任何分支或 PR / 未挪工单 / 未改 README 与 roles.example.yml / 未在真实 dsh 会话里重启验证插件加载（本单验收只要求 build + smoke + 三条只读检查）。自检产生的 `mkdtemp` 临时目录按「未写明的删除不做」留在 `os.tmpdir()` 下未删。
