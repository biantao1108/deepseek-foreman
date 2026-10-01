# Changelog

本项目的显著改动都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.2] - 2026-10-01

### 文档
- README 双语定位重构：开头一句话定位「让强模型当工头、便宜模型干活、别家厂商审查——多模型协作，又省又好」+ 「小白三步」上手框
- 新增「联合使用效果 / Works with」节：三件套联合矩阵（本包 / 精简输出 persona / 行为约束类 skill），含机制说明（persona 部署层继承已实证）与诚实口径（逐插件孤立量化未做 A/B，不给数字）
- 新增 `persona.example.md`：随包精简输出 persona 模板（9 条纪律，可选启用，复制到 system-prompt 插件 `personaPrefix`，子会话自动继承）
- `docs/install-flow.md` 开头加「小白三步」超简版，原 0–6 步保留为完整版

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
- **英文 README**：`README.en.md`，与中文版互链。

### 变更

- **项目改名**：`dsh-ticket-manager` → `dsh-foreman` → **`deepseek-foreman`**（包名、插件 id、仓库名、skill 目录同步）。npm 包名 `deepseek-foreman` 已查可用。
- **`package.json`**：`files` 字段纳入 `skill/`，让工单 SOP 随 npm 包一起发布；补 `repository` 字段。
- **中文 README 重写为开源版**：一键安装、三件套、与上游 `opus-manager` 的差异表。

### 移除

- **出厂去私有化**：`cordis.patch.yml` 与 `example.cordis.yml` 不再包含任何本机真实路由；含本机绝对路径的私有文档（`docs/交接.md`）移出仓库；`_tickets/`、`_receipts/` 已进 `.gitignore`，不进发布内容。
