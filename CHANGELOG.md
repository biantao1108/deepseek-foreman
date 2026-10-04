# Changelog

本项目的显著改动都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.2] - 2026-10-01

### 文档
- README 双语定位重构：开头一句话定位「让强模型当工头、便宜模型干活、别家厂商审查——多模型协作，又省又好」+ 「小白三步」上手框
- 新增「联合使用效果 / Works with」节：三件套联合矩阵（本包 / 精简输出 persona / 行为约束类 skill），含机制说明（persona 部署层继承已实证）与诚实口径（逐插件孤立量化未做 A/B，不给数字）
- 新增 `persona.example.md`：随包精简输出 persona 模板（9 条纪律，可选启用，复制到 system-prompt 插件 `personaPrefix`，子会话自动继承）
- `docs/install-flow.md` 开头加「小白三步」超简版，原 0–6 步保留为完整版

## [0.6.0] - 2026-10-03

### 秘书模式实测落地
- docs/secretary-mode.md 补「本机实测拓扑」与「别人的复制步骤」（两个必踩坑：秘书人格要新开会话、cost recent 要重启 app）
- roles.example.yml 增组合 C：秘书模式角色表模板（lead/lead-backup/daily-code/review/review-alt + 跨族约束注释）
- 交叉验证拓扑固化为模板：K3 审米系 / MiMo-Pro 审 moonshot 系，同族硬拒由 pick_route 保证

## [0.5.3] - 2026-10-03

### 秘书模式补齐计量
- pick_route cost_session=recent：按 token 倒序列出所有已计费会话（秘书 subagent 拿不到子会话 id，这是唯一可核对通道）
- 自检 116 → 119 项

## [0.5.2] - 2026-10-03

### 秘书模式（M3.1 对话、Lead 干活）
- persona.secretary.example.md 随包：会话切 MiniMax M3.1 粘贴即用
- 设计文档 docs/secretary-mode.md（零改造路径 + v0.6 messenger 完整版）

## [0.5.1] - 2026-10-03

### 模型记录（派单与收单双记）
- 台账 schema：派单模型/实到模型/审查模型分列，token in/out 分桶
- 路由偏差（派单≠实到）标「路由偏差」进问题标记
- SOP 绑定：实到模型取工人回执自报（list_subagent_models 可核对）

## [0.5.0] - 2026-10-03

### token 计量闭环（解决两期断层）
- **pick_route 新增 cost 模式**： 从 dsh token-meter 投影读**真实** token（input/output/cache 四桶），不是估算
- 回执模板/SOP 绑定：收尾前先读真数再记账，禁止编数
- 自检 114 → 116 项

## [0.4.6] - 2026-10-03

### 隐私边界（用户数据本机化）
- insights 台账（~/.dsh/foreman-insights/）明确为**仅本机**，永不进 git/npm；README 声明无遥测
- release-checklist 新增「本机数据边界」检查项
- privacy-check 加用户项目名/本机路径模式（base64 防自检泄漏）；CHANGELOG 匿名化历史条目

## [0.4.5] - 2026-10-03

### insights 闭环运转（首个真实项目数据已入库）
- usage 台账新增首个外部项目回填（匿名化，5 单，零重做零事故）
- analysis #1：识别 token 计量断层（P0）→ 回执模板禁止编数、insights schema 定稿
- 收尾 SOP 绑定 insights schema 列定义

## [0.4.4] - 2026-10-01

### 使用数据回收（真实使用驱动迭代）
- SOP 新增「使用数据回收」：每个项目收尾追加工单台账到 ~/.dsh/foreman-insights/usage/（跨项目汇总）
- 每 10 单或每周自动分析（usage → analysis → 需求候选 → 下一版工单）

## [0.4.3] - 2026-10-01

### 隐私与发布工程
- 图表重制为英文（原中文图含聊天式标签）
- ：_tickets/、_receipts/（含回执原话）永不进 npm 包
- privacy check: CLEAN：发布前隐私扫描（私有路由名/本机路径 + 本机角色表精确值），进 release-checklist
- README 图表改绝对链接（docs/ 不进包，npm 页可显示）

## [0.4.2] - 2026-10-01

### 首页重设计
- README 英文为主（badges + Why 表 + 架构图 + 三步上手），细节移入 docs/
- README.zh-CN.md 中文可选版；删除 README.en.md（英文即首页）
- 列表内容降噪：205 行 → 65 行

## [0.4.0] - 2026-10-01

### 新增（P1-P3 全部）
- **R5 验收指纹**：`pick_route` 新增 `accept_check` 模式——机械核对回执指纹（HEAD sha + 每条验收 pass/fail）与当前 git HEAD 一致才 ready；「回执是说法不是证据」从纪律变成程序
- **R15 setup 向导**：`npx deepseek-foreman-setup` 核对白名单/指路角色表/给试单话术
- **R7 交接规范**：换会话 2KB 交接协议（目标/不做/下一步/HEAD/证据路径）
- **R12 bundle 冒烟清单**：改 cordis.patch.yml 后的 5 步 live 验证（T205/T207 教训产品化）
- **R3 上下文四档降级**：30/50/70% 行为切换
- **R10 故障速查** 4→10 条；**R11** models 田野笔记实测回填

### 自检
- 110 → 114 项（R5 accept-check 4 项）

## [0.3.0] - 2026-10-01

### 新增
- **成本台账**：回执模板记录施工 token/effort/wall-clock；progress.md 周汇总；handoff.md 预算闸（单张/累计/Lead 轮数上限，到限即停）
- **工单分级 effort scaling**：trivial/normal/critical 三级（trivial 跳审查、critical 双审查），失败 2 次升档重派
- **审查路由解绑**：normal 单默认「异族便宜模型+提示词只读」，物理只读 subagent_readonly 留 critical 单
- **强制 pick_route**：派单前必调，硬约束不可绕过
- **回执蒸馏契约**：Lead 默认只读结论层三段；验收输出 >50 行落盘贴首尾

### 文档
- 可量化测试数据看板（图表+模型分工逻辑，脱敏可发布）：docs/metrics-2026-10-01.md
- 第三方双盲审报告（k3 / mimo2.6-pro）+ 业界对照调研

## [0.2.1] - 2026-10-01

### 文档
- README 双语：致谢上游 opus-manager、「实测数据」节（模型分工/环境/token 开销）、「本项目 0.2.0 由本系统自己迭代完成」声明
- 派单提示模板首行加本单摘要（dsh 子代理列表预览可区分任务）；ponytail 边界（实现从简、证据段不压缩）

## [0.2.0] - 2026-10-01

首个公开版本：把私有的 `dsh-ticket-manager` 变成可安装、可发布的 `deepseek-foreman`。

### 新增

- **角色表外置**：角色路由从 cordis config 抽到用户文件 `~/.dsh/foreman.roles.yml`（`rolesFile` 可改路径）。文件不存在时插件自动铺一份带中文注释的模板并进入「未配置」引导态（`pick_route` 返回 `ok:false` 并写明下一步），不阻断 dsh 启动。
- **角色表热更新**：`pick_route` 每次调用比对 `rolesFile` 的 mtime，改动保存即生效，不用重启、不用关开插件。文件写坏或写成空表时保留上一份可用角色表并说明错在哪，改好保存后下次调用自动恢复。
- **`subagent_readonly` 只读审查实例**：bundle patch 挂载只读子代理，经它派出的子会话在运行时只有 `read` / `grep` / `glob` 三个读工具——只读审查从「提示词自觉」升级为运行时强制。preset 层未放行导致会话里没有该工具时，按 SKILL.md 降级方案走（提示词只读 + Lead 审查前后各看一次 `git status`）。
- **skill 自动安装**：插件首次加载自动把包内 `skill/deepseek-foreman/` 装进 `~/.dsh/skills/deepseek-foreman`（先软链、被系统拒绝退化为递归拷贝；已装过不动；失败不抛错、记进 `setup`，`installSkill: false` 可关）。
- **`pick_route` setup 自检（doctor）**：不带 `role` 调用即自检——角色表路径与状态、skill 安装结果、`allowedModels` 白名单对账（`unmatchedRoles` 列出不在白名单的角色）、`hints` 写明下一步，配置对不对一次看清。
- **安装流程文档**：`docs/install-flow.md`（0–6 步从装包到派第一张工单 + 故障速查 + 设计原则），README 中英文安装节按它对齐。
- **CI**：`.github/workflows/ci.yml`，push / PR 触发，Node 20 与 22 矩阵跑 `npm ci && npm run build && node test/smoke.mjs`。
- **发布清单**：`docs/release-checklist.md`（脱敏 grep、版本一致性、打包内容、npm publish、发布后从 registry 装一遍验证）。
- **英文 README**：`README.md`，与中文版互链。

### 变更

- **项目改名**：`dsh-ticket-manager` → `dsh-foreman` → **`deepseek-foreman`**（包名、插件 id、仓库名、skill 目录同步）。npm 包名 `deepseek-foreman` 已查可用。
- **`package.json`**：`files` 字段纳入 `skill/`，让工单 SOP 随 npm 包一起发布；补 `repository` 字段。
- **中文 README 重写为开源版**：一键安装、三件套、与上游 `opus-manager` 的差异表。

### 移除

- **出厂去私有化**：`cordis.patch.yml` 与 `example.cordis.yml` 不再包含任何本机真实路由；含本机绝对路径的私有文档（`docs/交接.md`）移出仓库；`_tickets/`、`_receipts/` 已进 `.gitignore`，不进发布内容。
