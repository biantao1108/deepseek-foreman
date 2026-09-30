# dsh-ticket-manager

把活写成工单派给**更便宜的模型**去做，Lead 只负责拆活、派活、亲自重跑验收命令、派**另一家厂商**只读审查、逐条核实。人不在的时候按队列接着干。

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）。

## 来源

设计与工单/回执契约移植自 [yanauto/opus-manager](https://github.com/yanauto/opus-manager)（MIT，Copyright (c) 2026 yanauto）。上游是一个 **Claude Code skill**；本项目是它的 **dsh 移植版**。上游用 8 周、13 个仓库、360 张工单验证了这套流程，本项目沿用它的目录契约、验收标准和"回执是说法不是证据"原则。

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
| 只读审查 | 审查命令只开 `read,grep,find,ls` | `toolFilter: { allow: [...] }` |
| 上下文隔离 | 靠独立进程 | 靠独立 Session（子会话工作不进父对话） |
| 省钱规则 | 一张单一个新会话 | 同上，**外加**：同模型继续干用 `subagent_fork`（保住前缀 KV cache），只有必须换模型才用 `subagent` |
| 无人托管 | `queue.md` + 后台等待 | 同上，可叠 dsh 的 `goal` |

工单/回执模板、`_tickets/` 目录契约、验收与核实流程**保持一致**——这部分和宿主无关，是上游最有价值的东西。

## 安装

装到 dsh 的用户技能根（**软链，不拷贝**，改仓库即生效）：

```bash
mkdir -p ~/.dsh/skills
ln -s "$PWD/skill/dsh-ticket-manager" ~/.dsh/skills/dsh-ticket-manager
```

dsh 的 `skill-filesystem` 默认扫 `~/.dsh/skills`（`user-dsh` 根）和 `~/.agents/skills`（`user-agents` 根）。装在这里只给 dsh 用，不污染四工具共享的 `~/.agents/skills`。

**改完要开新会话**：技能目录会热更新，但 `allowedModels` 白名单是在新顶层会话创建时快照的。

## 前置条件

`dsh` 桌面版或 CLI，且 `cordis.patch.yml` 里配好：

- `@deepseek-ai/dsh-tool-subagent/model-selection-settings` → `enabled: true` + `allowedModels` 至少两条**不同厂商**的路由
- `standard` preset（其 `subagent` 工具实例带 `modelSelectionSettings: true`）

两者缺一，`subagent` 就不会暴露 `provider`/`model` 入参，本 skill 的派单步骤无法执行。

## 状态

私密开发中。macOS / dsh 桌面版 0.2.0-rc.2 上首次配置流程待实测。

## 许可

MIT。见 [LICENSE](LICENSE)（含上游与本项目两份版权声明）。
