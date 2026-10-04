# 回执 T<N>：<简短标题>

> 执行引擎：<实际生效的 provider/model，照派单提示里给的写>
> reasoning_effort：<实际值>
> 完成时间：YYYY-MM-DD HH:MM
> 分支 / 提交 / PR：<有就写，没有写「无」>
> 工单：留在 _tickets/doing/ 等待验收

## 1. 做了什么
<改动的实质，不写逐行流水账。>

## 2. 文件清单
- `path/to/file`

## 3. 验收证据（工单里每条检查对应一段）
### 3.1 <检查 1>
命令：`<原样的完整命令>`
```text
<原样输出，不删改>
```

## 4. 成本台账（v0.3 起必填）
| 项 | 值 |
|---|---|
| 施工 token（**用 `pick_route cost_session=<子会话id>` 读真数**；读不到填 - 并备注，**禁止编数**） | <万> |
| reasoning_effort | <档> |
| wall-clock | <分钟> |

## 5. 风险与存疑
<没能验证的、没覆盖的边界、没做完的。没有就写"无"。>

## 指纹
<回执末尾必附，供 `pick_route accept_check` 机械核对：HEAD 必须等于收尾时的 `git rev-parse HEAD` 前 8 位，每条验收一行且全为 pass，缺一条或有 fail 都会被判 not ready。>
- HEAD sha: <git rev-parse HEAD 的前 8 位，无反引号外的装饰>
- [<验收1 的名称>]: pass
- [<验收2 的名称>]: pass
