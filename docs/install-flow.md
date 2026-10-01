# 安装到能用：完整流程设计（v1，2026-10-01）

> 首页见 [README](README.md)（英文为主）/ [中文首页](README.zh-CN.md)。
> 目标读者：刚发现 deepseek-foreman 的 dsh 用户。目标：从装包到派出第一张工单 ≤ 10 分钟，全程不改 cordis patch、不手动软链。

## 小白三步（超简版）

与 README 的[小白三步](../README.zh-CN.md#三步上手)呼应，只记三句：

1. 装 dsh，配好 ≥2 家厂商的模型。
2. 插件页点装 `deepseek-foreman`。
3. 开新会话，说一句「**帮我配 foreman，我有 \<某两家\> 的模型**」。

## 完整版（0–6 步）

下面把每一步展开：前置、安装、配置、验证、使用，最后是故障速查与设计原则。

## 前置（一次性，dsh 自身的事）

0. **dsh 桌面版**，已配好 ≥2 家厂商的 LLM 路由（API key 各家的）。
1. **`allowedModels` 白名单**（`@deepseek-ai/dsh-tool-subagent/model-selection-settings`）：把允许子任务使用的 provider/model 列进去，**至少两家不同厂商**（异族审查的硬要求）。改完白名单要开新会话（它是会话快照）——这是全程唯一需要"开新会话"的地方。

## 安装（2 步）

2. **装包**：dsh 插件页安装 `deepseek-foreman`。安装即生效：
   - 挂载 `pick_route`（路由裁决）与 `subagent_readonly`（只读审查实例）
   - 自动把工单 skill 装进 `~/.dsh/skills/deepseek-foreman`（软链，失败自动退化为拷贝）
   - 发现没有角色表 → 自动在 `~/.dsh/foreman.roles.yml` 铺一份带中文注释的模板，插件进入「未配置」引导态（不报错、不影响 dsh 启动）
3. **开新会话**（让白名单快照覆盖到新装的实例）。

## 配置（1 个文件）

4. **编辑 `~/.dsh/foreman.roles.yml`**：模板里两组示例（单厂商全家桶 / 多厂商混合）解开其中一组注释，把 provider/model 换成第 1 步白名单里已有的路由。**保存即生效**（pick_route 每次调用查 mtime 热更新，不用重启）。字段逐条有注释：高峰时段锁、视觉、输出上限、fallback、异族审查的 vendor 分组。

## 验证（1 句话）

5. 对 dsh 说：**「调 pick_route 看看 setup」**。返回里逐项说清：
   - 角色表：几个角色、有没有角色不在白名单（对账 allowedModels，标出具体角色）
   - skill：linked / copied / exists / failed（failed 会给手动命令）
   - 缺什么、下一步做什么，写在 hints 里

## 使用（1 句话）

6. 对 dsh 说：**「走工单：把 xxx 项目里的 yyy 做了」**。之后是 SOP 自动运转：写工单 → `pick_route` 选路由 → `subagent` 派单 → Lead 重跑验收 → `subagent_readonly` 派异族只读审查 → 逐条核实 → 收尾。用户不在时说「我走了你接着干」进入无人托管。

## 故障速查（10 条，与 doctor hints 对应）

| 现象 | 原因 | 怎么办 |
|---|---|---|
| pick_route 全部 ok:false | 角色表未配置/写坏 | reason 写着文件位置和错在哪，改好保存自动恢复 |
| 派单报 route not allowed | 路由不在白名单 | 加进 allowedModels，**开新会话** |
| subagent 没有 provider/model 入参 | standard preset 未启用 model-selection | 检查 preset 与 `subagent-model-selection-settings`，见 README 前置条件 |
| 会话里没有 subagent_readonly | preset 层未放行 | 按 SKILL.md 降级方案（提示词只读 + git 核实） |
| 插件页「不包含任何组件」/模型侧 NO_TOOL | bundle patch 新增行没包 `insert:` | 见 README「踩过的坑」，修 patch 后关开插件 |
| 改了角色表没生效 | 改了别的文件 | 以 pick_route setup 返回的 rolesFile 路径为准 |
| 改了 bundle patch 没生效 | 手改文件不通知 Host | 插件页关→开，或重启 app |
| YAML 报「两个 roles: 键」 | 模板两组注释解开了两组 | 只解一组 |
| skill 没自动装 | 权限/平台限制 | doctor 的 setup.skill 会给手动命令 |
| 用量上限/电脑休眠中断托管 | 套餐到顶 / 睡眠 | 按 SKILL.md 无人托管节：到限即停，重置后叫 Lead 继续 |

## 设计原则（为什么长这样）

- **能自动的不让用户动手**：skill、模板、只读实例都随包自动就位。
- **必须手动的只有一步**：填角色表——因为只有用户知道自己有哪些路由、愿意把代码交给谁。
- **所有状态一个入口可查**：pick_route setup，不猜、不翻文件。
- **降级永远可用**：只读实例缺席、skill 装不上、角色表写坏，都有明确退路，不炸启动。
