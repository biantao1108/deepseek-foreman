# 回执 T102：角色表外置到 ~/.dsh/foreman.roles.yml，支持热更新与自我引导

> 执行引擎：deepseek-official/deepseek-flash
> reasoning_effort：high（照工单头 worker-route / reasoning 记录）
> 完成时间：2026-10-01 01:00
> 分支 / 提交 / PR：无（按工单边界，未提交、未合并）
> 工单：留在 _tickets/doing/ 等待验收

## 1. 做了什么

角色表从 cordis config 解耦成外部 YAML，插件自己引导新用户、自己热重载、自己扛坏文件。

**src/index.ts**

- `Config` schema：`roles` 改为可空（`z.array(ROLE_SCHEMA).default([])`）；新增 `rolesFile: z.string().default('')`。角色条目 schema 抽成 `ROLE_SCHEMA` 常量，inline config 与外部文件共用同一份。
- `rolesFile` 为空串时落到 `<os.homedir()>/.dsh/foreman.roles.yml`；`homedir()` 在 `apply()` 里现算（不在模块顶层算），所以 `HOME` 被改写时（自检就是这么验的）落点跟着变。
- 启动加载顺序按工单 a→d：
  - a. `config.roles` 非空 → 直接用它，`rolesFile` 被完全忽略（不读、不写、不铺模板）。重复角色名仍**当场 `throw 'foreman: duplicate role in config.roles'`**（老行为原样保留）。
  - b/c. 否则读 `rolesFile`，结构 `{ roles: [...] }`，用同一份角色 schema 校验。文件不存在 → `mkdirSync(parent, {recursive:true})` + 从包内 `roles.example.yml` 拷到目标路径，进入未配置态。
  - d. 文件存在但 YAML 解析 / schema 校验失败 → 不抛错，记为未配置态，reason 带解析错误摘要。
- 未配置态的 reason 一律带文件全路径 + 下一步原话「按注释填好 provider/model，保存即生效」；未配置态下**所有** `pick_route` 调用（含不带 role 的列角色调用）返回 `ok:false`。
- 热更新：`execute` 第一步 `refresh()`，`fs.statSync(rolesFile).mtimeMs` 与上次读过的 mtime 比对，变了就重读重校验；inline config 模式直接短路，一次盘都不碰。
- 坏文件保护：解析/校验失败时**保留上一份好表**（旧表继续留在 `alternatives` 里可见），本次调用 `ok:false` 并说明错在哪；文件改好后下一次调用自动恢复，无需重启。reason 只在确实存在旧表时才写「已保留上一份可用角色表（见 alternatives）」，从没读到过好表时不多说这句话。
- 文件里 `role` 重名 → 走「保留旧表」的校验失败路径；`role`/`vendor`/`provider`/`model` 缺项或空串 → 同一路径失败（见 §4 存疑 3）。
- 文件被删掉时 `refresh()` 会重新铺一份模板（工单 2c 的同一套代码路径），未写进自检（见 §4 存疑 5）。

**roles.example.yml（新建，包根）**

- 全部字段带中文注释；两个示例组合：「组合 A：单一厂商全家桶」「组合 B：多厂商混合（三家）」，每组 4 个角色。
- 两组示例**整段注释掉**（所以模板解析出来 `roles` 为空 → 天然是未配置态，不会出现「占位路由被当成真配置」）；`provider` / `model` 全部是 `PROVIDER_A` / `MODEL_LEAD` 这类大写占位符。
- 不含任何真实路由名：`kimi-coding` / `xiaomi` / `minimax` / `deepseek-official` 一个都没有（验收 2 为证）。厂商名也一并占位成 `vendor-a`/`-b`/`-c`，避免开源出厂件里出现真实厂商路由线索。
- 用 `yaml` 解析器验过：模板本身解析为 `null` → `roles: []`；单独解开组合 A 得 4 个角色、组合 B 得 4 个角色，都能过 schema。

**cordis.patch.yml**

- 出厂 config 里 7 个真实角色整段删除，只留注释：说明角色表已外置、默认落点、文件缺失时自动铺模板 + 未配置引导、以及 `rolesFile:` 的注释示例（保持注释状态）。
- 文件头注释同步改成「同 id 条目可整体覆盖 config（roles / rolesFile 都行）」。

**package.json**

- `files` 加 `roles.example.yml`（`npm pack --dry-run` 已证进包，见 3.5）。
- `dependencies` 加 `yaml@^2.9.1`（`npm install yaml`）。
- `devDependencies` 加 `@types/node@^22.20.4`（见 §4 存疑 1，这条超出工单字面清单，请重点复核）。

**test/smoke.mjs**

- 原 20 项一字未改（含 example.cordis.yml 角色数 = 7 那条老检查）。新增 22 项 T102 自检，共 **42 项**：config 直传回归（行为不变 / 不读不铺 rolesFile / 重名仍抛错）、文件不存在自动铺模板 + 未配置引导、`HOME` 改写后默认落点正确、写入合法文件即生效（热更新）、改坏后 `ok:false` + 旧表保留 + 修好自动恢复且用的确实是新表、文件里重名与 schema 类型错误各自走校验失败路径。
- 临时文件全部走 `fs.mkdtempSync(os.tmpdir() + ...)`，不写仓库目录；热更新判定不靠写文件的时间精度，显式 `fs.utimesSync` 给每次写入一个递增 mtime，避免秒级/毫秒级时间戳抖动导致 flaky。

**README.md**

- 新增「配置角色表（`~/.dsh/foreman.roles.yml`）」一节：装包 → 编辑 `~/.dsh/foreman.roles.yml` → 开新会话，三步含自动铺模板与未配置引导、热重载、坏文件保护说明。
- 「前置条件」一节保留 allowedModels 白名单说明，并**明确写出白名单是会话创建时的快照、改它必须开新会话**；同时点明角色表文件不受这条限制。
- 「插件」一节里指向 example.cordis.yml 的老口径改成新流程，并保留 role 表也兼容老接法的说明；自检数 20 → 42。

## 2. 文件清单

- `src/index.ts`
- `test/smoke.mjs`
- `package.json`、`package-lock.json`（`npm install yaml` 与 `npm install -D @types/node` 的副产物）
- `cordis.patch.yml`
- `README.md`
- `roles.example.yml`（新建）
- 本回执：`_receipts/T102-external-roles-file.md`

未动：`example.cordis.yml`（T103）、`skill/`、`docs/`、`lib/`（gitignored 构建产物）、`_tickets/`（工单位置未挪）。

## 3. 验收证据（工单里每条检查对应一段）

### 3.1 验收 1：`npm run build && node test/smoke.mjs` → 全部通过

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

全部通过（42 项）
ACCEPTANCE1_EXIT=0
```

### 3.2 验收 2：出厂零真实路由

命令：`grep -n "kimi-coding\|xiaomi\|minimax\|deepseek-official" roles.example.yml cordis.patch.yml; echo exit=$?`

```text
exit=1
```

（两份文件零命中，grep 无输出故只打印 exit=1。）

### 3.3 验收 3：`yaml` 依赖可 require

命令：`node -e "const m=require('yaml');console.log('yaml ok')"; echo exit=$?`

```text
yaml ok
exit=0
```

### 3.4 验收 4：改动范围

命令：`git status --short`

```text
 M README.md
 D _tickets/open/T102-external-roles-file.md
 M cordis.patch.yml
 M package-lock.json
 M package.json
 M src/index.ts
 M test/smoke.mjs
?? _tickets/doing/
?? roles.example.yml
```

前两行 `D _tickets/open/T102-external-roles-file.md` 与 `?? _tickets/doing/` 在本单开工前的基线里就已存在（领单时的工单移动），不是本单产生的。其余改动逐条对上工单「边界 1」点名的文件：`src/index.ts`、`test/smoke.mjs`、`package.json`（+ 边界 4 允许的 `package-lock.json`）、`cordis.patch.yml`、`README.md`；`roles.example.yml` 是本单要求新建的文件。没有第 1 条之外的文件被改动。

补一句时间差：上面这段输出是写本回执**之前**抓的。写完回执后再跑 `git status --short`，会多出一行 `?? _receipts/T102-external-roles-file.md`（本回执自身，工单要求产出，不是代码改动）。

### 3.5 补充证据（非工单验收项）

`roles.example.yml` 确实进包（否则外部文件模式在装好的包里找不到模板）：

命令：`npm pack --dry-run`

```text
npm notice 1.1kB cordis.patch.yml
npm notice 12.9kB lib/index.js
npm notice 4.3kB roles.example.yml
npm notice total files: 7
```

（`npm notice Tarball Contents` 全量为 LICENSE / README.md / cordis.patch.yml / lib/index.d.ts / lib/index.js / package.json / roles.example.yml。`lib/index.js` 与 `roles.example.yml` 在包内仍是 `lib/` 与包根两级，所以 `new URL('../roles.example.yml', import.meta.url)` 在装好的包里解析正确。）

改动规模：

命令：`git diff --stat`

```text
 README.md                                 |  20 +++-
 _tickets/open/T102-external-roles-file.md |  56 ---------
 cordis.patch.yml                          |  85 ++------------
 package-lock.json                         |  36 +++++-
 package.json                              |   9 +-
 src/index.ts                              | 183 ++++++++++++++++++++++++++----
 test/smoke.mjs                            |  98 +++++++++++++++-
 7 files changed, 326 insertions(+), 161 deletions(-)
```

模板可解性复核（把注释解开后确实是合法 YAML，且两组各 4 个角色）：

命令：`node -e "..."`（按 `# ── 组合 A/B` 标记切段、剥掉行首注释符后 `parse`）

```text
combo A => roles=4 lead,daily-code,chores,review
combo B => roles=4 lead,daily-code,review,copywriting
```

## 4. 风险与存疑

1. **多装了一个 devDependency：`@types/node@^22.20.4`（超出工单字面清单，请 Lead 裁决）**。仓库里没有任何 Node 类型声明，`src/index.ts` 一旦 `import` `node:fs`/`node:os`/`node:path`/`node:url` 就必然 `TS2307 Cannot find module`，`npm run build` 会直接失败（验收 1 过不去）。工单「边界 1」对 package.json 只写了「加 yaml 依赖、files 加 roles.example.yml」，这一条是我为了能让 `tsc` 通过而加的，`package-lock.json` 随之变化。替代方案都不干净：给四行 import 挂 `@ts-expect-error`（换个环境有 `@types/node` 就变「未使用的指令」而报错）、或把 import 改成变量说明符的动态 `import()`（把整包变成 top-level await 模块）。若不允许，请指示我改走哪条路。
2. **本单有一个仓库外的副作用：真实 `~/.dsh/foreman.roles.yml` 被自动铺出了模板（我没有删除它）**。我在收尾前用一条一次性探针命令验证「config 全空也能挂载插件」（`apply(Config(null))`），那条命令没给 `rolesFile`，插件就按设计把出厂模板拷到了真实家目录。证据链：
   - 该文件此前不存在。探针返回的 reason 是「未配置：…/foreman.roles.yml 里还没有启用中的角色」，如果当时已经存在一份可用角色表，`apply` 会读它、不带 role 的调用会回 `ok:true`「7 roles available」而不是未配置态；如果是读取失败，reason 会是「配置文件读取失败」。所以**没有覆盖、没有丢任何已有数据**。
   - 现在该文件与出厂模板逐字节相同：`diff ~/.dsh/foreman.roles.yml roles.example.yml` 退出码 0。
   - 按「未写明的删除不做」，我没有删它。Lead 把本机 7 角色表挪过来时直接覆盖即可（工单第 28 行本来就是让 Lead 自己做这步）。自检本身全部走 `mkdtemp`，不会碰家目录。
3. **文件场景多了一道「必填字段非空」校验（工单未逐字要求，属加固）**。schemastery 的 `z.string()` 默认不强制存在：文件里漏写 `model` 会静默变成 `undefined`，直到派单时才炸。我给文件路径补了 `role`/`vendor`/`provider`/`model` 四项的非空检查，失败即走「保留旧表 + ok:false」。**config 直传路径的 schema 一个字没改**（仍是原来的 `z.string()`），所以「config 直传行为与现状一致」这条回归从构造上就成立（自检 3 条 + 重名抛错 1 条为证）。若你认为文件路径也该完全无为而治，删掉 `validateTable` 里那 5 行即可。
4. **「保留上一份好表」的可观察语义由我定成 `alternatives` 仍列旧表**。工单只说「保留旧表 + 本次调用 ok:false」，没说旧表从哪看。我的实现是：坏文件期间 `ok:false`，`alternatives` 仍是旧表（自检用「仍是 2 条」验证），reason 里也只在确实有旧表时才声明保留了。若期望的是 `ok:false` 时 `alternatives` 必须为空（更严格地阻断绕过），请裁决，我改一行。
5. **未写进自检的路径**：文件运行中被删掉 → `refresh()` 重新铺模板 → 回到未配置态。代码路径与启动时的 bootstrap 共用，我用人工探针验证通过，但自检里没做（不想在自检里执行删除动作）。另外 `mtimeMs` 相同时不会重读（标准 mtime 语义，同秒内改两次且 mtime 不变时不会热重载）。
6. **README 里两处已存在的陈旧内容按边界未动**：插件一节表格的字段名写的是 `peakFrom` / `peakTo`，实际 schema 是 `peakWindows`（T101 之前就有的老问题，与 T102 无关）；「踩过的坑」里 `insert:` 示例是 4 空格缩进而真实 `cordis.patch.yml` 是 2 空格。都在点名范围外，我没碰。
7. **`example.cordis.yml` 未动（T103 的范围），但它现在是文档分叉点**：出厂 bundle 已不带真实角色表，而 `example.cordis.yml` 里仍有 7 个真实角色的内联表，自检里「example.cordis.yml 角色数 = 7」那条老检查也仍然按 7 通过。T103 改它时这条老检查会一起需要调整，请别忘。
8. **未做的**：未 git commit / 未合并任何分支或 PR；未挪工单文件；未动 `example.cordis.yml`、`skill/`、`docs/`；没起过任何后台进程（无残留）；自检产生的 `mkdtemp` 临时目录按「未写明的删除不做」留在 `os.tmpdir()` 下未删；未在 dsh 里真机重启验证插件加载（本单验收只要求 `npm run build && node test/smoke.mjs` + 三条只读检查，真机热更新验证需要重启 dsh 会话，超出本单范围）。
