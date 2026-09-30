# 模型实测体感（dsh 路由池）

方法论抄自上游 [opus-manager](https://github.com/yanauto/opus-manager/blob/main/docs/models.zh-CN.md)：**每一行都要有依据（日期 + 样本量），没实测过的不要填。**

下表「窗口 / 输出上限 / 模态」是从 `~/.dsh/profiles/desktop/cordis.patch.yml` 的 `llm-pi-ai` 配置里直接读的**声明值**，不是实测。「适合干什么 / 要防什么 / 依据」三列**必须自己跑出来再填**，现在是空的。

## 施工

| provider/model | 厂商 | 窗口 | 输出上限 | 模态 | 适合干什么 | 要防什么 | 依据 |
|---|---|---|---|---|---|---|---|
| `deepseek-account/deepseek-flash` | DeepSeek | 未声明 | 未声明 | 文本 | | | |
| `deepseek-official/deepseek-flash` | DeepSeek | 未声明 | 未声明 | 文本 | | | |
| `minimax-cn/MiniMax-M3` | MiniMax | **1,000,000**（总） | 512,000（本地声明，未获厂商确认） | 文本+图 | | | |
| `minimax-cn/MiniMax-M2.7` | MiniMax | **204,800** | 131,072 | 文本 | | | |
| `minimax-cn/MiniMax-M3.1-Flash-Preview` | MiniMax | **1,000,000**（总） | 未声明→32,768 | 文本+图 | | | |
| `xiaomi-token-plan-cn/mimo-v2.6-pro` | 小米 | 1,048,576 | 131,072 | 文本+图 | | | |
| `xiaomi-token-plan-cn/mimo-v2.6-flash` | 小米 | 1,048,576 | 131,072 | 文本+图 | | | |
| `kimi-coding/k3` | Moonshot | 1,048,576 | 131,072 | 文本+图 | | | |
| `kimi-coding/k3-256k` | Moonshot | 262,144 | 131,072 | 文本+图 | | | |
| `kimi-coding/kimi-for-coding` | Moonshot | 1,048,576 | **32,768** | 文本+图 | | | |

## 只读审查

审查必须和施工**不同厂商**。填上面那张表里没占用的行。

| provider/model | 厂商 | 只读工具集 | 表现 | 要防什么 | 依据 |
|---|---|---|---|---|---|

## 厂商规格（2026-09-30 由用户提供，非实测）

| 模型 | 输入输出**总** token | 说明 |
|---|---|---|
| MiniMax-M3.1-Flash-Preview | 1,000,000 | 原生多模态、1M 上下文的 Frontier Coding 模型，**思考深度可调** |
| MiniMax-M3 | 1,000,000 | 原生多模态、1M 上下文的 Frontier Coding 模型，输出约 100+ TPS |
| MiniMax-M2.7 | 204,800 | 开启模型的自我迭代，输出约 60 TPS |

**关键口径**：厂商给的是**输入+输出总量**，不是单独的上下文窗口，也不是输出上限。所以 dsh 的 `contextWindow` 按这个数填，`maxTokens`（输出）厂商没给，配置里也就不要拿 2^20 凑数——`1048576` 比真实的 1,000,000 多 48K，会让 dsh 按偏大的预算组包，被网关拒。

## 已知的结构性事实（这些不用实测，来自配置与 dsh 源码）

- **`kimi-for-coding` 输出上限只有 32,768**，全场最低。别派给它需要大段产出的活（写整份 PRD、生成大文件），会中途截断。适合读多写少。
- **`MiniMax-M2.7` 窗口只有 204,800**，是 M3 系列的 1/5。别把大上下文塞给它。
- **`MiniMax-M3.1-Flash-Preview` 的 `maxTokens` 仍缺**，dsh 按默认 32,768 处理（`PiAiProviderProfile.defaultMaxTokens`）。厂商只给了总量没给输出量，所以这个数要么问 MiniMax 要，要么自己实测一次长产出看它在哪断。**在它补上之前，插件的长产出检查对 M3.1 不生效**（`maxOutputTokens: 0` = 跳过），别指望它替你挡。
- **配置里 `MiniMax-M3` 声明的 `maxTokens: 512000` 是本地写的，厂商规格表没有这一项**，未获确认。若真实输出上限更低，长产出会失败而不是被裁剪。
- **`MiniMax-M3.1-Flash-Preview` 思考深度可调** —— 意味着它能接 `reasoning_effort`，不只是文案档。
- **只有 `minimax-cn` 的 M3/M3.1、小米两档、kimi 三档声明了 `input: [text, image]`** —— 涉及截图/设计稿的活只能派给这几条。M3.1 的 image 是按厂商"原生多模态"补进去的（2026-09-30），此前配置漏标。
- **`deepseek-account` 和 `deepseek-official` 是两条不同路由**（前者走订阅账号鉴权，后者走 API Key），计费口径不同，别当同一家用。

## 跨模型经验（待自己验证后再往上加行）

上游有几条值得先按假设采纳、再用自己的数据复核：

- 同一个会话不要换模型；换模型接着别人的产出干活，效果明显下降。
- 同族模型会犯同一种错，所以审查不能只一家。
- 便宜模型容易"收尾粗心"（漏存盘、漏入口），必须配异族审查。
- 会话拉长后缓存重读的 token 可能占到花费的一半左右——长会话要盯。
