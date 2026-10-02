# deepseek-foreman

[![CI](https://github.com/biantao1108/deepseek-foreman/actions/workflows/ci.yml/badge.svg)](https://github.com/biantao1108/deepseek-foreman/actions)
[![npm](https://img.shields.io/npm/v/deepseek-foreman)](https://www.npmjs.com/package/deepseek-foreman)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[English](README.md) | **中文**

> **强模型当工头，便宜模型干活，别家厂商审查。**
> 面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的多模型协作插件——又省又好。
> 社区插件，与 DeepSeek 官方无隶属关系。

![效果看板](https://raw.githubusercontent.com/biantao1108/deepseek-foreman/main/docs/metrics-2026-10-01.png)

## 为什么

| 痛点 | foreman 怎么解 |
|---|---|
| 贵模型把额度烧在写代码上 | Lead 只做**拆单、派单、验收、核实**，实现全在便宜模型 |
| 自己写的代码自己审 | **异族审查运行时强制**：同厂商被拒，只读审查员物理上写不了 |
| 提示词规矩会被无视 | 四条硬约束在代码里（`pick_route`）：高峰锁/视觉/输出上限/异族 |
| 配置吓人 | 一个 YAML 文件、改完即生效；setup 向导 + doctor 自检说人话 |

**实测**（23 张工单，一晚）：93%+ token 在便宜模型、审查 24 条发现 22 条修复、工单 100% 闭环——见[可量化数据](docs/metrics-2026-10-01.md)。

## 三步上手

1. 装 dsh，配好 **≥2 家厂商的模型**
2. 插件页点装 `deepseek-foreman`
3. 开新会话，说一句：**「帮我配 foreman，我有 \<厂商A\> 和 \<厂商B\> 的模型」**

向导（`npx deepseek-foreman-setup`）核对白名单、插件自动装工单 SOP、`pick_route` 自检全程说人话。完整流程：[docs/install-flow.md](docs/install-flow.md)。

## 工作原理

```
 你 ──► Lead（K3 级）          拆单、亲自重跑验收、逐条核实
           ├──► 施工（便宜档）   独立会话实现，93% 的 token 在这
           └──► 审查（别家厂商） 只读找问题 → Lead 逐条核实
```

工单/回执/审查报告全是仓库里的普通 Markdown。**回执是说法，不是证据**——Lead 重跑每条验收命令，`accept_check` 把回执指纹与 git HEAD 机械核对。

## 工单分级（effort scaling）

| 级别 | 流程 | 档位 |
|---|---|---|
| `trivial`（≤10 行/文档） | 跳审查，Lead 验收收尾 | low |
| `normal`（默认） | 完整闭环 + 异族便宜审查 | 按配置 |
| `critical`（数据/发布/安全） | 双审查 + 物理只读 | high；失败 2 次升档 |

每张回执带成本台账，无人托管有预算闸。模型分工与实测：[可量化数据](docs/metrics-2026-10-01.md)。

## 📈 由真实使用驱动迭代

你跑的每张工单都会进本地台账（`~/.dsh/foreman-insights/`，仅本机）；每 10 张单或每周，数据自动分析成下一版需求。本项目自己的路线图就是这么来的。

## 致谢

移植自 [yanauto/opus-manager](https://github.com/yanauto/opus-manager)（MIT，© 2026 yanauto）——工单/回执契约与「重跑验收、异族审查、逐条核实」打法在上游经 8 周 13 仓库 360 单验证。双版权声明见 [LICENSE](LICENSE)。

## 状态

- ✅ 已上 [npm](https://www.npmjs.com/package/deepseek-foreman)，CI 绿，114 项自检
- ✅ 项目自身用这套工单系统迭代完成（v0.2–v0.4）
- 📄 详情与故障自助：[docs/install-flow.md](docs/install-flow.md) · [实证记录](docs/dogfooding.md)

MIT 协议。社区项目，欢迎 Issue 和 PR。
