[English](README.en.md) | 中文

> 一个 DeepSeek Harness 社区插件，与 DeepSeek 官方无隶属关系。

# deepseek-foreman

**让强模型当工头、便宜模型干活、别家厂商审查——多模型协作，又省又好。** 把活写成工单派给**更便宜的模型**去做，Lead 只负责拆活、派活、亲自重跑验收命令、逐条核实。人不在的时候按队列接着干。

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）。

**小白三步**（没碰过 cordis / YAML / CLI 也能上手）：

1. 装 dsh，配好 ≥2 家厂商的模型；
2. 插件页点装 `deepseek-foreman`；
3. 开新会话，说一句「**帮我配 foreman，我有 \<某两家\> 的模型**」。

> **本项目的 0.2.0 就是用这套系统自己迭代完成的**——19 张工单 overnight，详见 [docs/dogfooding.md](docs/dogfooding.md)。

## 来源

设计与工单/回执契约移植自 [yanauto/opus-manager](https://github.com/yanauto/opus-manager)（MIT，Copyright (c) 2026 yanauto）。上游是一个 **Claude Code skill**；本项目是它的 **dsh 移植版**。上游用 8 周、13 个仓库、360 张工单验证了这套流程，本项目沿用它的目录契约、验收标准和"回执是说法不是证据"原则。

## 致谢

感谢 [yanauto/opus-manager](https://github.com/yanauto/opus-manager)：工单/回执契约，以及"验收亲自重跑、换一家厂商只读审查、发现逐条核实"这套打法，都是上游用 8 周、13 个仓库、360 张工单实打实跑出来的。本项目只是它的 **dsh 移植版**——目录契约照搬、原则照搬，连"回执是说法不是证据"这句话也照搬。上游与本项目同以 **MIT** 发布，双份版权声明见 [LICENSE](LICENSE)。

## 为什么要移植到 dsh

上游必须靠外部命令行工具（`pi`、`cursor-agent`、`codex`、`agy`）当工人，因为 **Claude Code 没有"按次给子任务换模型"的入口**——它的模型静态写在 subagent 定义里，外加一个"所有子代理用同一个模型"的全局开关。

`dsh` 的 `subagent` 工具在**调用那一刻**接受 `provider` / `model` / `reasoning_effort`，并受会话级 `allowedModels` 白名单约束。所以"经理一家、施工一家、审查一家"在 dsh 里是**同一进程内的三次工具调用**，不需要任何外部 CLI。

## 与上游的差异

| | opus-manager | 本项目 |
|---|---|---|
| 宿主 | Claude Code skill | dsh skill |
| 工人 | 外部 CLI 进程（pi / cursor-agent / codex / agy） | `subagent` 工具 + 按次传 `provider`/`model` |
| 首次配置 | 扫描本机装了哪些 CLI、读各自 `--help`、写 `dispatch.sh` / `review.sh` | 读 `allowedModels` 白名单 + `list_subagent_models` 核对，**不写派单脚本** |
| 工人脱离会话 | `nohup` / `Start-Process` | `run_in_background: true` 的 continuable 子会话 |
| 只读审查 | 审查命令只开 `read,grep,find,ls` | 首选 `subagent_readonly` 物理只读（运行时只有 `read`/`grep`/`glob`）；会话里没有该工具时降级为审查提示词写明「不改文件，只跑只读命令」+ Lead 审查前后各看一次 `git status` |
| 上下文隔离 | 靠独立进程 | 靠独立 Session（子会话工作不进父对话） |
| 省钱规则 | 一张单一个新会话 | 同上，**外加**：同模型继续干用 `subagent_fork`（保住前缀 KV cache），只有必须换模型才用 `subagent`；子会话继承部署 persona，工人纪律不用按次重述 |
| 无人托管 | `queue.md` + 后台等待 | 同上，可叠 dsh 的 `goal` |

工单/回执模板、`_tickets/` 目录契约、验收与核实流程**保持一致**——这部分和宿主无关，是上游最有价值的东西。

## 安装

从装包到派出第一张工单 ≤ 10 分钟，0–6 步照做即可。逐步细节与故障速查见详版 [docs/install-flow.md](docs/install-flow.md)。

0. **dsh 桌面版**，已配好 ≥2 家厂商的 LLM 路由（API key 各家的）。
1. **`allowedModels` 白名单**（`@deepseek-ai/dsh-tool-subagent/model-selection-settings`）：把允许子任务使用的 `provider/model` 列进去，**至少两家不同厂商**（异族审查的硬要求）。改完白名单要开新会话——它是会话快照，详见[前置条件](#前置条件)。
2. **装包**：dsh 插件页安装 `deepseek-foreman`，安装即生效的**四件套**——
   - 挂载 `pick_route`（路由裁决：高峰时段锁、视觉、输出上限、异族审查四条硬约束，见下文「插件」一节）；
   - 挂载 `subagent_readonly`（只读审查实例：经它派出的子会话在运行时只有 `read` / `grep` / `glob` 三个读工具）；
   - 自动把工单 skill 装进 `~/.dsh/skills/deepseek-foreman`：先建软链（改仓库即生效），软链被系统拒绝（如 Windows 权限）自动退化为递归拷贝；已装过（软链或目录）一律不动，不会覆盖；两步都失败也不抛错、不影响 dsh 启动，失败原因记进 `setup`（见第 5 步）；插件配置 `installSkill: false` 可关闭自动安装；
   - 发现没有角色表 → 自动在 `~/.dsh/foreman.roles.yml` 铺一份带中文注释的模板（内容就是包里的 [roles.example.yml](roles.example.yml)），插件进入「未配置」引导态——不报错、不影响 dsh 启动。

   dsh 的 `skill-filesystem` 默认扫 `~/.dsh/skills`（`user-dsh` 根）和 `~/.agents/skills`（`user-agents` 根）。装在这里只给 dsh 用，不污染四工具共享的 `~/.agents/skills`。
3. **开新会话**：让白名单快照覆盖到新装的实例。
4. **编辑 `~/.dsh/foreman.roles.yml`**：把模板里「组合 A」（单一厂商全家桶）或「组合 B」（多厂商混合）其中一组的注释解开（**只解一组**），`provider` / `model` 换成第 1 步白名单里已有的路由。**保存即生效**——`pick_route` 每次调用查 mtime 热更新，不用重启；字段逐条有注释，详见下文「配置角色表」一节。
5. **自检**：对 dsh 说「**调 pick_route 看看 setup**」。`pick_route` 不带 role 即自检模式，返回的 `setup` 一眼看到还缺什么：

   | 字段 | 内容 |
   |---|---|
   | `skill` | skill 安装结果：`linked` / `copied` / `exists` / `disabled` / `failed: ...` |
   | `rolesFile` | 角色表路径、状态（`ok` / `unconfigured` / `error`）、角色数与错误摘要 |
   | `allowlist` | 扫各 profile 的 `cordis.patch.yml` 拿到的 `allowedModels` 白名单，与角色表对账；`unmatchedRoles` 列出不在白名单的角色 |
   | `hints` | 有问题时的一句人话指引（如「角色 daily-code 的路由不在 allowedModels，把它加进白名单后开新会话」） |

6. **走工单**：对 dsh 说「**走工单：把 xxx 项目里的 yyy 做了**」。之后 SOP 自动运转：写工单 → `pick_route` 选路由 → `subagent` 派单 → Lead 重跑验收 → `subagent_readonly` 派异族只读审查 → 逐条核实 → 收尾。用户不在时说「我走了你接着干」进入无人托管——九个环节与队列规矩见 [SKILL.md](skill/deepseek-foreman/SKILL.md) 的「九、无人托管」；派单后出岔子按 [docs/install-flow.md](docs/install-flow.md) 的「故障速查」查。

## 配置角色表（`~/.dsh/foreman.roles.yml`）

角色表不在 cordis config 里，而在一个外部 YAML 文件，默认 `~/.dsh/foreman.roles.yml`（可用插件的 `rolesFile` 字段换位置）。

装包时若发现该文件不存在，插件会**自动铺一份带中文注释的模板**（内容就是包里的 [roles.example.yml](roles.example.yml)）并进入「未配置」引导态——`pick_route` 全部返回 `ok:false`，reason 写明文件位置和下一步（「按注释填好 provider/model，保存即生效」），插件本身不报错、不影响 dsh 启动。

要改的就是安装第 4 步这一件事：把模板里「组合 A」（单一厂商全家桶）或「组合 B」（多厂商混合）其中一组的注释解开（**只解一组**，同时解开会出现两个顶层 `roles:` 键），再把 `provider` / `model` 换成你自己白名单里已有的路由。改白名单要开新会话（见[前置条件](#前置条件)）；角色表文件不受这条限制，保存即生效。

```bash
$EDITOR ~/.dsh/foreman.roles.yml   # 填好 provider/model，保存即生效
```

**改角色表不用重启**：`pick_route` 每次调用都查一次该文件的 mtime，变了就重读 + 重校验。文件写坏也不会把插件带崩：保留上一份可用角色表、本次调用返回 `ok:false` 并说明错在哪，改好保存后下一次调用自动恢复。

## 前置条件

`dsh` 桌面版或 CLI，且 `cordis.patch.yml` 里配好：

- `@deepseek-ai/dsh-tool-subagent/model-selection-settings` → `enabled: true` + `allowedModels` 至少两条**不同厂商**的路由
- `standard` preset（其 `subagent` 工具实例带 `modelSelectionSettings: true`）

两者缺一，`subagent` 就不会暴露 `provider`/`model` 入参，本 skill 的派单步骤无法执行。

**白名单是会话快照**：`allowedModels` 在**新顶层会话创建时取一次**，之后改它不影响已经在跑的会话——改完白名单必须**开新会话**才生效。角色表文件（`~/.dsh/foreman.roles.yml`）不受这条限制，它每次调用都重读，改完保存即时生效。

## 插件（v1：路由裁决）

`src/index.ts` 是 Cordis 插件，注册一个模型可见工具 `pick_route`。它只管 skill 管不了的三件硬约束——这三条写在 markdown 里只能靠模型自觉，写在代码里才能拒：

| 约束 | 配置字段 | 拒的时候 |
|---|---|---|
| **高峰时段锁** | `peakWindows` / `peakDays` | 工作日 09:00–18:00 派给 deepseek → 拒，并自动给 `fallback` 角色 |
| **视觉能力** | `vision` | 带截图的活派给纯文本角色 → 拒 |
| **输出上限** | `maxOutputTokens` | 整篇长产出派给上限 <100K 的角色 → 拒 |
| **异族审查** | `vendor` + 调用时传 `review_for` | 审查者和写代码者同厂商 → 拒，并列出别家候选 |

派单本身仍走 dsh 原生 `subagent`（它已支持按次 `provider`/`model`/`reasoning_effort`），工单契约仍是文件。**插件不做的事**：不重造任务板、不接管派单、不碰持久化。

角色表的装法见上面「配置角色表」一节。也仍然兼容老接法：在 cordis config 里直接写 `roles: [...]`，非空时优先，`rolesFile` 被忽略（写法见 [example.cordis.yml](example.cordis.yml)；出厂 bundle 的 [cordis.patch.yml](cordis.patch.yml) 里不再带真实角色表）。

本包在 bundle patch 里还挂载了 **`subagent_readonly`**（只读审查实例）：经这个实例派出的子会话在**运行时**只有 `read` / `grep` / `glob` 三个读工具——写工具从提示里消失，执行也会被拒，只读审查从「提示词自觉」升级为运行时强制（原生 `subagent` 本身仍没有只读过滤参数，见上表）。只读审查的子会话跑**会话默认路由（通常=经理位模型）**——异族审查覆盖非经理模型写的活（bundle 层不能开按次换模型：standing 挂载需要 preset scope，见 dsh-tool-subagent 源码；k3 自己写的活仍是已知空洞）；委派工具（`subagent` / `subagent_fork` / `subagent_readonly` / `workflow`）已被 `toolFilter.deny` 堵住，只读子会话派不出不受限子代理。

注意：这个工具**能否出现在会话里取决于 dsh 的 preset 层**，本包只保证 bundle patch 这一层写对。若会话里没有 `subagent_readonly`，就按 [SKILL.md](skill/deepseek-foreman/SKILL.md) 的降级方案执行——审查提示词写明「不要改任何文件，只跑只读命令」，Lead 在审查前后各看一次 `git status` 核实。

```bash
npm install && npm run build && node test/smoke.mjs   # 110 项自检
```

`Lead` 角色应与 `agent-default-model`（会话实际跑的模型）一致，否则"大脑"名不副实。

## 踩过的坑：bundle patch 必须用 `insert:`

bundle 的 `cordis.patch.yml` 里**新增插件行要包在 `insert:` 下**：

```yaml
- insert:
    - id: foreman
      name: deepseek-foreman
      config: { ... }
```

写成裸条目 `- id: ... / name: ...` 会被解释为**按 id 覆盖已存在的行**；组合里没有这一行时**静默不生效**——不报错、不告警，插件页显示「这个插件包不包含任何组件」，模型侧 `NO_TOOL`。官方规范见 [Package and install a plugin](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.md)。

另外：**手改 bundle 的 patch 文件不会通知运行中的 Host**（管理器之外的改动"announces nothing"）。改完要在插件页把开关关再开，或重启 app，才会重新应用这一层。

## 实测数据

一晚（2026-09-30 23:00 – 2026-10-01 12:00）跑完整轮冲刺的记录，数字来自当轮工单与回执，实证见 [docs/dogfooding.md](docs/dogfooding.md)。

| 项 | 内容 |
|---|---|
| 环境 | dsh 桌面版 0.2.0-rc.2，macOS（Intel iMac），项目在 ExFAT 卷上 |
| Lead | Kimi K3（拆活、派单、亲自重跑验收、逐条核实） |
| 施工 | DeepSeek-V4.1-Flash（T001–T108，国庆半价窗口）、MiMo-V2.6-Flash（T201 起，主力） |
| 异族审查 | Kimi K3；收尾新增 MiMo-V2.6-Pro 审 K3 产物 |

- 19 张工单全部走完「派单 → Lead 重跑验收 → 异族审查 → 逐条核实 → 修复」闭环。
- 自检从 20 项长到 110 项全绿；npm 发布 0.2.0 + GitHub 公开 + CI 首跑即绿。
- 异族审查累计 20+ 条发现：约 19 条成立全部修复、1 条不成立被 Lead 驳回；含 1 条高危（私有路由名差点开源出去）。
- 2 起「离线 109 项全绿、live 才炸」的事故被流程抓住并修复。

**token 开销**（来源：dsh 子代理面板截图；口径＝该次施工会话累计 token）：施工类工单 33 万–59 万 token/单，验证类调用 0.6 万–1.6 万 token/次。施工 token 全部发生在便宜模型上，Lead 上下文只放工单/回执/审查意见、不读代码——这就是省钱机制。未做严格 A/B 对照实验，不给百分比承诺；读者可在 dsh 子代理面板自行核对每条开销。

逐插件的贡献口径与另外两件搭配件，见下面的[联合使用效果](#联合使用效果)一节。

## 联合使用效果

三件套合在一起用，各管一段、叠加生效：

| 件 | 干什么 | 怎么拿到 |
|---|---|---|
| **deepseek-foreman（本包）** | 强模型当工头：派单、亲自重跑验收、逐条核实；便宜模型施工；别家厂商只读审查。`pick_route` 四条硬约束 + `subagent_readonly` 物理只读 | **本包含**（装包即生效） |
| **精简输出 persona**（[persona.example.md](persona.example.md)） | ponytail 式输出纪律：动手前逐级自检（能不做就不做、能复用不新写、能一行不十行）、输出先结论、汇报一两句 | **本包含，可选启用**：全选复制模板 → dsh 设置里 system-prompt 插件的 `personaPrefix` → 保存 |
| **行为约束类 skill**（如 superpowers） | 给 agent 的行为装护栏：TDD、验收先行那套规矩 | **自备，可选** |

**机制**：persona 挂在 dsh 的 system-prompt 插件 `personaPrefix`（deployment 层），**子会话自动继承**（已实证：dsh-subagent 源码 + 子会话实际行为双重印证）——工人拿到的是部署级纪律，每张工单不用按次重述。

**口径（诚实）**：19 张工单的整体数据见上文[实测数据](#实测数据)；逐插件的孤立量化贡献**没做 A/B 对照，不给数字**，只讲机制——token 大头在实现 → 便宜工人；对话与判断从简 → persona 精简；质量不降 → 异族审查 + 逐条核实。三个机制各管一段，叠加生效。

## 状态

已装进 dsh 桌面版 0.2.0-rc.2（Intel iMac）并 live 验证：冷启动正常，`pick_route` 可被模型调用，视觉约束会真的拦截并给 fallback；`subagent_readonly` 最终态同样 live 实测通过（只读工具集生效、委派工具被拦死）。

工单 SOP（`skill/`）已在真实任务上跑完整轮冲刺：2026-10-01 一晚把 T001–T207（含修复单）全部走完，`_tickets/` / `_receipts/` 契约在本项目立了起来，「派单 → 施工 → 异族只读审查 → 逐条核实 → 修复回单」整条链路闭环，自检从 20 项一路长到 110 项。

实证记录见 [docs/dogfooding.md](docs/dogfooding.md)。

## 许可

MIT。见 [LICENSE](LICENSE)（含上游与本项目两份版权声明）。
