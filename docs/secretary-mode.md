# 秘书模式（Secretar y Mode）设计——面向 v0.6

> 需求：用户对话用最便宜模型（秘书）吸收聊天；高阶模型（Lead）只收蒸馏需求负责分析/拆单/派单/验收。聊天废话零成本。
> 状态：**已落地并实测通过**（2026-10-03）。本机拓扑见下节；0.5.2+ 随包提供 secretary persona。

## 架构

```
用户 ⇄ 秘书（flash 级，便宜）      ← 聊天、澄清、追问、废话过滤
        │ 落 _tickets/req-*.md（四要素 + frontmatter 结论层）
        │ 派单提示只给：路径 + 一句话目标 + state.md 路径
        ▼
Lead（K3 级）子会话               ← 分析、拆单、派单、验收、核实（只看蒸馏包）
        ├── worker（flash）         施工
        └── reviewer（异族）        审查
```

## 技术侦察结论（2026-10-03，dsh 0.2.0-rc.2 源码实证）

**可行，有一条纯零工具改造路径 + 一条完整路径：**

1. **零改造（今天就能用）**：会话模型切到便宜档 + `persona.example.md` 加「秘书纪律」——秘书把对话蒸馏成需求包，经 subagent 派给 `foreman` 角色（modelSelectionSettings: true 已实测，按次换 K3）。每轮聊天只付 flash 价；Lead 子会话只看蒸馏包。
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
- 蒸馏包格式（四要素）：目标 / 边界（不做清单）/ 成功信号 / 已定决策。任一缺就追问，不许猜补。
- Lead 拒绝含糊需求：四要素缺任一即打回秘书，秘书再追问用户（一轮往返全在 flash 侧）
- 秘书自己的判断单独放「秘书推断（待确认）」区，**不得混进「已定决策」**——这是本项目实测出的最大失真源（2026-10-04 演练：秘书把推断写成用户决策，被 Lead 评审当场抓出）
- 一切成本照记：秘书 token 与 Lead token 分列进 insights 台账


## 本机实测拓扑（2026-10-03 验证）

```
你 ⇄ MiniMax M3.1（会话模型 = 秘书，flash 价）
      │ 需求包落 _tickets/req-*.md（文件优先：长内容零压缩、可 diff、可寻址）
      ▼ pick_route role=foreman
Kimi K3（Lead：分析、拆单、派单、亲跑验收、逐条核实）
      ├── MiMo-V2.6-Flash（主力施工，可带视觉，high）
      ├── DeepSeek-V4.1-Flash（半价窗口/高峰自动改派）
      └── MiniMax M3.1（自家不可用时的备用施工）
交叉验证：K3 审米系产物 ｜ MiMo-V2.6-Pro 审 K3 自己的活
```

**实测结论**（本机跑通，模型名用公开产品名）：
- 角色表热更新即生效（改完 `pick_route foreman` 当场返回新路由），K3 派单实测可跑。
- 同族硬约束生效：K3 审 K3 被拒（both vendor same）；MiMo-V2.6-Pro 审 K3 通过。
- 秘书人格必须**新开会话**才注入（personaPrefix 在会话启动时读）；0.5.3 的 `cost_session=recent` 必须**重启 app** 进内存。这两条是踩过的坑。

## 别人的复制步骤

1. 角色表用 `roles.example.yml` 的**组合 C**（foreman/foreman-backup/daily-code/review/review-alt，跨族约束已写进注释）。
2. 会话模型切最便宜档 → system-prompt 插件的 personaPrefix 贴 [persona.secretary.example.md](../persona.secretary.example.md)（仅当会话模型是廉价档时生效，规则里带条件判断）。
3. 重开会话 → 说人话；秘书追问 → 落需求包文件 → 派 foreman（提示只给路径）→ 回来结论。

## 为什么需求包走文件（2026-10-04 演练后补）

首场演练里秘书把需求包**内联进 subagent 提示词**派给 Lead——违反了这套设计本身。Lead 读文件只花两次 read + 一次 grep，零成本；内联则整段进上下文、不可跳读、无法 diff、二次引用会漂。

**文件优先通则**：AI 之间的长内容交接一律落文件，聊天只传路径。可寻址、可 diff、可搜索、零长度惩罚、跨会话存活、模型能先读 frontmatter 结论层再按需展开——与回执的「结论层/证据层」是同一条纪律。
4. 每单收尾秘书自己调 `pick_route cost_session=recent` 读真实 token 记账。
