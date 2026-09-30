# 工人配置
> dsh 版本：桌面版 0.2.0-rc.2 | 生成：2026-10-01 | 用户已确认（出厂角色表来自用户三级排序，见 docs/models.zh-CN.md）
> 路由事实已于 2026-10-01 00:08 用 list_subagent_models + pick_route 现场核对。

## 施工（主力）：deepseek-official/deepseek-flash（角色 daily-code-offpeak）
- 适合：日常实现、文档修复；**节假日/非高峰半价**（高峰=工作日 09:00-12:00、14:00-18:00）
- reasoning_effort：off / low / high（默认）/ max；文档类小单传 low
- 上下文窗口 / 输出上限：厂商未核对，工单别塞大上下文
- 要防什么：高峰时段 pick_route 会硬锁，自动 fallback 到 daily-code

## 施工（备用）：xiaomi-token-plan-cn/mimo-v2.6-flash（角色 daily-code）
- 适合：日常实现，全天可用，有视觉
- reasoning_effort：未核对，派单前查 list_subagent_models
- 要防什么：无高峰锁

## 审查：kimi-coding/k3（角色 review，与施工不同厂商 ✓）
- 只读工具集：**当前 dsh subagent 无 toolFilter 参数**；只读靠提示词声明 + Lead 用 git status/diff 核实审查员未改文件
- 要防什么：审不了 moonshot 自家产物（lead/ui-design 写的活），pick_route 会拒
