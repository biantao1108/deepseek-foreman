# 秘书模式（Secretar y Mode）设计——面向 v0.6

> 需求：用户对话用最便宜模型（秘书）吸收聊天；高阶模型（Lead）只收蒸馏需求负责分析/拆单/派单/验收。聊天废话零成本。
> 状态：DESIGN（技术侦察已完成，待拆单实施）。

## 架构

```
用户 ⇄ 秘书（flash 级，便宜）      ← 聊天、澄清、追问、废话过滤
        │ 蒸馏需求包（≤1KB）        ← 「要什么/边界/成功信号/不做清单」
        ▼
Lead（K3 级）子会话               ← 分析、拆单、派单、验收、核实（只看蒸馏包）
        ├── worker（flash）         施工
        └── reviewer（异族）        审查
```

## 技术侦察结论（2026-10-03，dsh 0.2.0-rc.2 源码实证）

**可行，有一条纯零工具改造路径 + 一条完整路径：**

1. **零改造（今天就能用）**：会话模型切到便宜档 + `persona.example.md` 加「秘书纪律」——秘书把对话蒸馏成需求包，经 subagent 派给 `lead` 角色（modelSelectionSettings: true 已实测，按次换 K3）。每轮聊天只付 flash 价；Lead 子会话只看蒸馏包。
   - 限制：Lead 子会话的产出要秘书转述给用户；Lead 不回写文件（子会话可写，但验收链要秘书顺手跑）。
2. **完整版（v0.6 插件）**：`messenger` 工具——副线程挂秘书（agentOptions 锁 flash），主线程（用户对话）由**宿主自动注入** Lead 子会话的最终报告（dsh 已有机制：continuable 子会话结束时「runtime sends the parent a notice containing its outcome and any final assistant message」）。
   - 硬点：文档报告 ≠ 自动进主线程文本，需验证 notice 注入形态；Lead 持续对话则用 followup API（ctx.subagents.followup 已实证存在于 apiproxy）。
   - 兜底：notice 不注入时，秘书转述（方案 1 的体验）。

## token 经济（预期）

| 模式 | 用户对话 token 计价 | Lead 上下文 |
|---|---|---|
| 现状（对话=K3） | K3 价 × 全部闲聊 | 闲聊+工作全在 |
| 秘书模式 | flash 价 × 闲聊（便宜 1-2 数量级） | 只有蒸馏包+工作产物 |

闲聊占比越高（典型用户日常 >50%），节省越大。

## 需求边界（写给拆单）
- 秘书不做判断：不解析技术方案、不拍板优先级——只做「理解→结构化→追问澄清」
- 蒸馏包格式（对齐 osslab goal 三要素）：目标原话 / 边界（不做清单）/ 成功信号 / 权威契约
- Lead 拒绝含糊需求：蒸馏包缺要素打回秘书，秘书再追问用户（一轮往返在 flash 侧）
- 一切成本照记：秘书 token 与 Lead token 分列进 insights 台账
