# 开源化与一键安装方案（v1，2026-10-01）

> 现状：`dsh-ticket-manager`，私有仓库，本机 link 安装，角色表硬编码在 bundle patch。
> 目标：开源、改名、装一个 npm 包即可用，模型配置外置，让「高阶模型当经理、按价值派活、异族审查保质」成为 dsh 的即装即用能力。

本文档占位映射（vendorX/modelY）仅本文档内有效。

## 0. 一页纸

把项目改名为 **`dsh-foreman`**（工头，最直白），发布到 npm。用户三步上手：插件页装包 → 把 `roles.example.yml` 拷成 `~/.dsh/foreman.roles.yml` 按注释填自己白名单里的路由 → 开新会话。插件提供三件硬能力：`pick_route`（角色→路由裁决，含高峰/视觉/长文/异族审查四条硬约束）、`subagent_readonly`（物理只读的审查派单实例）、角色表**热更新**（改文件即生效，不用重启）。skill（工单 SOP）随包自动软链进 `~/.dsh/skills/`。

## 1. 需求 → 方案映射

| 用户诉求 | 方案 | 所在节 |
|---|---|---|
| 开源 | 改名 + 去私有化清理 + 双语 README + CI + npm publish | §6 |
| 一键安装就生效 | bundle patch `insert:` 机制已验证；skill 随包自动安装；缺配置时插件自我引导 | §4.4、§5 |
| 借鉴 opus-manager | first-run 引导、田野笔记、demo、双语；不借鉴 dispatch.sh（dsh 原生派单已是优势） | §7 |
| 名字更直接 | 推荐 `dsh-foreman`，npm 已查 5 个候选全部可用 | §3 |
| 高阶模型领导、按价值分配、保质 | 已有 pick_route + SOP；补强：真只读审查实例、角色表热更新、doctor 自检 | §4.2、§4.3 |
| 模型配置独立 | 角色表抽到 `~/.dsh/foreman.roles.yml`，与包解耦、与 cordis config 分层 | §4.2 |

## 2. 已核实的关键事实（方案的地基）

1. **bundle patch 的 `insert:` 机制**已在本机 live 验证：装包即挂载 `pick_route`，7 角色可用。
2. **`toolFilter` 真实存在，但形态与旧文档相反**：它是 `dsh-tool-subagent` 的**实例级 config**（`toolFilter: { allow: [...] }`），对该实例派出的所有子会话**强制生效**（工具从提示消失 + 执行拒绝），不是按次参数。base bundle 已示范同一插件多实例（`subagent` + `subagent_fork` 两个 toolName）。→ 只读审查的正确实现是多挂一个只读实例，见 §4.3。
3. `spawn` provider 声明 `toolFilter: true` 能力；allow 名单里写了不存在的工具名会**启动即报错**（fail loud），名单必须对照 standard preset 的真实工具集。
4. **ExFAT 坑**：本卷上 write 类工具原子写必报 ENOTSUP，派单提示必须写明「用 shell 写文件」（已进 workers.md，开源版进 SKILL.md 的坑清单）。
5. **当前出厂角色表含本机私有路由**（真实路由名已脱敏），开源发布前必须抽走——这是配置外置的强制理由，不只是便利性。
6. SOP 已于 2026-10-01 跑通首张真工单（T001/T002：派单→验收→k3 异族审查→逐条核实→修复→提交），流程本身已验证。
7. npm 候选名 `dsh-foreman` / `dsh-model-foreman` / `dsh-dispatcher` / `dsh-conductor` / `dsh-model-crew` 均 404（可用）。

## 3. 命名

推荐 **`dsh-foreman`**：
- 直白：工头 = 不亲自砌砖、派活、验收、拍板，正是这套系统的事。
- 短、好拼、好搜，npm/GitHub 均可用；与上游 `opus-manager` 区隔明显又同族（都是"管理岗"）。
- 备选：`dsh-conductor`（指挥，偏优雅）、`dsh-dispatcher`（派单员，偏机械）。

GitHub 侧操作：现有私有 repo 直接 **rename + 转 public**（保留 issue/提交历史，GitHub 自动做旧名重定向），不新建仓库。

## 4. 架构设计

### 4.1 三件套

| 件 | 形态 | 职责 |
|---|---|---|
| `pick_route` | 现有插件，改造 | 角色→路由裁决 + 四条硬约束 + **doctor 模式**（见 4.2） |
| `subagent_readonly` | bundle patch 里新增一行 insert（dsh-tool-subagent 第二实例） | 物理只读审查，见 4.3 |
| skill | 包内 `skill/`，apply() 时自动软链到 `~/.dsh/skills/` | 工单 SOP，方法论本体 |

### 4.2 模型配置外置（核心改动）

**分层**：cordis config（包内出厂/高级用户覆盖）→ 用户文件 `~/.dsh/foreman.roles.yml`（推荐路径）。

- `Config` schema 调整：`roles` 改为可选；新增 `rolesFile?: string`（默认 `~/.dsh/foreman.roles.yml`）。
- `apply()` 启动逻辑：
  1. `config.roles` 非空 → 用之（向后兼容本机现有接法）。
  2. 否则读 `rolesFile`；不存在 → 从包内 `roles.example.yml` **拷贝一份注释完整的模板**过去，插件正常加载、`pick_route` 返回引导 JSON（`ok:false, reason:"未配置角色表，请编辑 ~/.dsh/foreman.roles.yml …"`），不报错不炸启动。
- **热更新**：`pick_route` 每次执行时 stat `rolesFile` 的 mtime，变了就重读 + schema 校验；校验失败保留旧表并在返回里说明。**改路由不用重启、不用开关插件**——这是相对"改 cordis patch 必须关开插件"的硬体验优势。
- **与白名单的关系**：角色表指向的 `provider/model` 必须在该会话 `allowedModels` 快照内（白名单仍是会话创建时快照，改白名单仍需新会话——这是 dsh 行为，写进 README 而不是试图绕过）。
- **doctor 模式**：`pick_route` 不带参数时，除列角色外附带每条路由与白名单/注册表的对账结果（能拿到 llm registry 就核对，拿不到就标注"未核对"），让"配置对不对"一眼可见。
- **workers.md 分工不变**：`foreman.roles.yml` 是机器级「能派给谁」，`_tickets/workers.md` 是项目级「这个项目用谁」。

**出厂模板策略**：包内**不放任何真实路由**（防止别人装完指向不存在的服务）。`roles.example.yml` 每个字段带注释 + 两个完整示例组合（DeepSeek 官方全家桶 / 多厂商混合），provider/model 全是占位注释。

### 4.3 只读审查：`subagent_readonly` 实例

bundle patch 增加（包在 `insert:` 下）：

```yaml
- id: tool-subagent-readonly
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: subagent_readonly
    backgroundMode: continuable
    toolFilter:
      allow: [read, grep, glob, read_image, web_fetch, web_search]
```

- 审查单改派 `subagent_readonly`：审查员**物理上没有写工具**，比"提示词自觉 + 事后 git 核实"强一整层；SKILL.md 第六节同步改写法。
- 是否给 bash：不给。审查员要重跑验收命令的需求，靠 Lead 自己重跑（SOP 本来就要求 Lead 重跑），审查只读代码+搜索。若实测中"审查员需要跑只读命令"证明必要，再开 `allow` 加 `bash` 的变体实例 `subagent_review_shell`——**v0.3 先不加**。
- **待实测**（§9）：preset 层对 insert 进来的第三实例是否照常放行；model-selection 装饰是否覆盖新实例（审查要异族 = 必须能按次传 provider/model，若不行需在 insert config 里补对应开关）。

### 4.4 skill 自动安装

- 包 `files` 带上 `skill/`。`apply()` 启动时：检查 `~/.dsh/skills/dsh-foreman` 是否存在且指向本包 skill 目录；否则创建软链；Windows/权限失败 → 退化为整目录拷贝 + 写版本戳，再失败仅在 pick_route 输出里提示手动命令，**不阻断插件加载**。
- `config.installSkill?: boolean`（默认 true）可关。

## 5. 用户旅程（一键安装验收标准）

1. dsh 插件页安装 npm 包 `dsh-foreman`（或 `npm i` 进 profile）。
2. 开新会话，对 dsh 说一句：「装好了 foreman，帮我配上」→ Lead 读引导、让用户从 `allowedModels` 里选施工/审查路由，写进 `~/.dsh/foreman.roles.yml`。
3. 说「走工单：xxx」→ 全流程可用。

验收：全新 profile 上从 0 到第一张工单派出去 ≤ 5 分钟，不手改任何 cordis patch。

## 6. 开源准备清单

- [ ] 改名：包名/仓库名/插件 id（`ticket-manager`→`foreman`）/cordis.patch.yml 的 name 与 id。
- [ ] 去私有化（**发布前硬门槛**）：
  - `cordis.patch.yml` 出厂角色表 → 清空为模板引用（真实 7 角色移到本机 profile patch，本机不受影响）。
  - `docs/交接.md` 含本机绝对路径/私人配置 → 移出仓库（`.gitignore` + 本地保留）或改写为通用版。
  - `_tickets/`、`_receipts/`（T001/T002 含本机路径）→ 不进开源仓库：挪出或脱敏。建议保留 `workers.md` 的匿名化样例当文档。
  - `git filter-repo` 清历史里的私有路由名，或接受"历史可见但已轮换"——**本机这些只是路由名不是密钥**，风险低，建议只清当前文件，历史不动。
- [ ] README 双语重写（中文为主 + English）：一键安装、三件套、与上游差异表、引用上游 MIT 致谢。
- [ ] LICENSE 保持 MIT 双版权（yanauto + 本项目）。
- [ ] CI：GitHub Actions 跑 `npm run build && node test/smoke.mjs`（已是纯 Node 无网络依赖）。
- [ ] `package.json`：name/version(0.2.0)/keywords/files（加 `skill/`、`roles.example.yml`、`examples/`）。
- [ ] npm publish（manual，changesets 不上，小规模不需要）。

## 7. 借鉴上游 opus-manager 清单

| 上游有的 | 我们 | 动作 |
|---|---|---|
| demo.gif（4 分钟真跑） | 无 | M3 补：录一张真工单全程 |
| Field numbers（8 周 360 单） | 只有 T001/T002 两张 | 攒数据，progress.md 就是数据源 |
| first-run 引导（对话式装 CLI） | 不需要装 CLI | 改为「rolesFile 引导」，更轻 |
| docs/models.md 田野笔记 | docs/models.zh-CN.md（含私人排序） | 脱敏公开化 |
| 中英 README | 只有中文 | M1 补 |
| Windows 支持矩阵 | 未测 | README 标"未测"，不吹 |

不借鉴：dispatch.sh/review.sh 首次配置扫描（dsh 原生派单，这是我们相对上游的核心优势）。

## 8. 路线图（工单粒度，可直接进 _tickets/queue.md）

**M1 开源最小版 v0.2.0**
- T101 改名（包/repo/插件 id），本机 profile 同步换名不断链
- T102 配置外置：rolesFile + mtime 热更新 + 自引导 + 单测
- T103 出厂去私有化 + roles.example.yml 两套示例
- T104 README 双语重写 + 交接/工单文件移出
- T105 CI + npm publish + repo 转 public

**M2 审查变硬 v0.3.0**
- T201 插入 `subagent_readonly` 实例，实测 preset 兼容（失败则文档化降级方案）
- T202 SKILL.md 第六节改用只读实例；pick_route 加 doctor 模式

**M3 体验 v0.4.0**
- T301 skill 自动安装（软链→拷贝降级）
- T302 demo 录屏 + models 田野笔记公开版

## 9. 风险与待验证

| 风险 | 影响 | 验证/缓解 |
|---|---|---|
| preset 层可能不认识 insert 的第三实例 | readonly 工具不出现在会话 | M2 第一单实测；失败则保持"提示词+git 核实"并在 README 写明 |
| readonly 实例可能不带按次 provider/model | 异族审查无法换厂商 | 同上，实测；不可行——standing 挂载带 modelSelectionSettings 且无 preset scope 会 throw（T205 实锤回退），只读实例固定跑会话默认路由 |
| toolFilter allow 名单写错名 → 启动 fail loud | 插件页报错 | 名单对照 standard preset 实际工具集，进 smoke.mjs 断言 |
| 角色表热更新读到坏 YAML | 不崩：保留旧表 + 返回错误说明 | T102 单测覆盖 |
| skill 自动安装写权限/平台差异 | 降级为提示手动，不阻断 | T301 单测 mock |
| 历史提交含私有路由名 | 低（非密钥） | 接受，发布说明里注明 |

## 10. 待拍板

1. **名字**：`dsh-foreman`（推荐）/ `dsh-conductor` / `dsh-dispatcher`。
2. 出厂**不带**真实路由、只带注释模板 —— 推荐如此，确认。
3. 仓库 rename 现有 repo 转 public（保留历史）—— 推荐如此，确认。
4. 先做 M1 还是 M1+M2 一起？推荐 M1 先发布抢名字，M2 紧随其后。
