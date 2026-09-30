# T002：修 workers.md 模板残留与 T001 回执 3.5 的错误解释

> 派单：dsh kimi-coding/k3 | 日期：2026-10-01
> worker-route: deepseek-official/deepseek-flash
> claimed-by: deepseek-official/deepseek-flash @ low，2026-10-01 00:20 派出

## 目标
收尾 T001 审查发现的两处低severity问题：SKILL.md 模板里残留的失效参数形态、T001 回执 3.5 的错误解释。

## 动手前先读
1. `_receipts/T001-doc-sync.review.md`（审查报告 + Lead 核实结论）
2. `_receipts/T001-doc-sync.md` 的 3.5 节

## 要做的修改
1. `skill/dsh-ticket-manager/SKILL.md` 第 35 行附近（workers.md 模板代码块内）：
   `- 只读工具集：<allow 列表>` → `- 只读约束：审查提示词声明不改文件 + Lead 审查前后各看一次 git status（没有只读过滤参数可传）`
2. `_receipts/T001-doc-sync.md` 3.5 节的说明段：把「`_receipts/` 未列出，因为该目录在本单执行前为空、写入回执后仍是未跟踪目录」这句错误解释，改为「引用的输出采集于回执文件写入之前，故缺 `?? _receipts/` 行；验收后 Lead 已重跑确认当前输出满足范围要求」。其余不动。

## 边界
1. 只动：skill/dsh-ticket-manager/SKILL.md 那一行、_receipts/T001-doc-sync.md 3.5 节说明段。
2. 不 git commit / push。不挪工单。src/、test/、配置不碰。
3. 本卷 ExFAT：写文件用 shell，不用原子写工具。

## 验收（写命令，不写感觉）
1. `node test/smoke.mjs 2>&1 | tail -1` → 全部通过
2. `grep -n "只读工具集" skill/dsh-ticket-manager/SKILL.md; echo "exit=$?"` → 无匹配，exit=1
3. `grep -n "写入回执后仍是未跟踪目录" _receipts/T001-doc-sync.md; echo "exit=$?"` → 无匹配，exit=1
4. `git status --short` → 较前仅多 SKILL.md 一处修改（_receipts/ 本就未跟踪）

## 为什么这样验收
这两处都是「说法与事实不符」：模板残留会让 Lead 照抄一个不存在的参数形态；回执的错误解释会误导后来者以为未跟踪目录不出现在 git status。都是小改，用 grep 零匹配即可证伪旧文本、新文本由 Lead 验收时读 diff 确认。

## 产出
- 修改：skill/dsh-ticket-manager/SKILL.md、_receipts/T001-doc-sync.md
- 回执：_receipts/T002-readonly-wording.md
