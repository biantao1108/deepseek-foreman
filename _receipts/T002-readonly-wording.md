# 回执 T002：修 workers.md 模板残留与 T001 回执 3.5 的错误解释

> 执行引擎：deepseek-official/deepseek-flash
> reasoning_effort：low（照工单头 worker-route / claimed-by 记录）
> 完成时间：2026-10-01 00:35
> 分支 / 提交 / PR：无（工单边界第 2 条：不 git commit / push）
> 工单：留在 _tickets/doing/ 等待验收

## 1. 做了什么

按工单「要做的修改」两条，逐文件定点改了两处文本（未用遍历脚本，逐个点名）：

1. `skill/dsh-ticket-manager/SKILL.md` 第 35 行（`workers.md` 模板代码块内）：`- 只读工具集：<allow 列表>` → `- 只读约束：审查提示词声明不改文件 + Lead 审查前后各看一次 git status（没有只读过滤参数可传）`。
2. `_receipts/T001-doc-sync.md` 第 117 行（3.5 节说明段）：把 `_receipts/` 未列出，因为该目录在本单执行前为空、写入回执后仍是未跟踪目录；` 这句错误解释，替换为工单指定的 `引用的输出采集于回执文件写入之前，故缺 `?? _receipts/` 行；验收后 Lead 已重跑确认当前输出满足范围要求。` 3.5 节其余部分未动。

写入方式遵循工单边界第 3 条：改文件一律走 shell（`python3` 定点字面替换，替换前断言目标串在文件中唯一命中 1 次），未使用 write/edit 类原子写工具。本单未启动任何后台进程，无进程需要收尾。src/、test/、配置、git 提交、工单文件均未触碰。

改动前的原样旧文本（用于对照）：

```text
- 只读工具集：<allow 列表>
```

```text
说明：`._README.md` 的删除不出现在 `git status` 里，因为 `.gitignore` 含 `._*`，该文件本就被忽略（工单背景第 3 条也这么说）。这条删除的证据是 3.4 的 `gone` 与上面的 `removed`。`_receipts/` 未列出，因为该目录在本单执行前为空、写入回执后仍是未跟踪目录；`_tickets/` 为未跟踪目录。无 src/、test/、cordis.patch.yml、example.cordis.yml 改动。
```

## 2. 文件清单

修改：
- `skill/dsh-ticket-manager/SKILL.md`（第 35 行）
- `_receipts/T001-doc-sync.md`（第 117 行）

新增：
- `_receipts/T002-readonly-wording.md`（本回执）

## 3. 验收证据（工单里每条检查对应一段）

### 3.1 `node test/smoke.mjs 2>&1 | tail -1` → 全部通过

命令：`node test/smoke.mjs 2>&1 | tail -1`

```text
全部通过
```

### 3.2 `grep -n "只读工具集" skill/dsh-ticket-manager/SKILL.md; echo "exit=$?"` → 无匹配，exit=1

命令：`grep -n "只读工具集" skill/dsh-ticket-manager/SKILL.md; echo "exit=$?"`

```text
exit=1
```

### 3.3 `grep -n "写入回执后仍是未跟踪目录" _receipts/T001-doc-sync.md; echo "exit=$?"` → 无匹配，exit=1

命令：`grep -n "写入回执后仍是未跟踪目录" _receipts/T001-doc-sync.md; echo "exit=$?"`

```text
exit=1
```

### 3.4 `git status --short` → 范围未扩大

本单动手前的基线（命令：`git status --short`）：

```text
 M README.md
 M "docs/\344\272\244\346\216\245.md"
 M skill/dsh-ticket-manager/SKILL.md
?? _receipts/
?? _tickets/
```

改动后的 `git status --short`（命令：`git status --short`）：

```text
 M README.md
 M "docs/\344\272\244\346\216\245.md"
 M skill/dsh-ticket-manager/SKILL.md
?? _receipts/
?? _tickets/
```

### 3.5 新文本复核（工单「产出」要求的对照证据）

命令：`sed -n '35p' skill/dsh-ticket-manager/SKILL.md; sed -n '117p' _receipts/T001-doc-sync.md`

```text
- 只读约束：审查提示词声明不改文件 + Lead 审查前后各看一次 git status（没有只读过滤参数可传）
说明：`._README.md` 的删除不出现在 `git status` 里，因为 `.gitignore` 含 `._*`，该文件本就被忽略（工单背景第 3 条也这么说）。这条删除的证据是 3.4 的 `gone` 与上面的 `removed`。引用的输出采集于回执文件写入之前，故缺 `?? _receipts/` 行；验收后 Lead 已重跑确认当前输出满足范围要求。`_tickets/` 为未跟踪目录。无 src/、test/、cordis.patch.yml、example.cordis.yml 改动。
```

## 4. 风险与存疑

1. **工单验收 4 的措辞与实际不符（已如实记录）**：验收 4 写「较前仅多 SKILL.md 一处修改」，但基线 `git status --short` 里 `M skill/dsh-ticket-manager/SKILL.md` 已经存在（T001 的改动），本单只是让同一个已修改文件继续为 `M`，并未新增任何被跟踪文件条目；前后两行逐字一致。不影响「范围未扩大」的结论。
2. **T001 回执 3.5 新句里「验收后 Lead 已重跑确认……」是工单指定的照写文本**：这是对 Lead 动作的叙述，本工人无法核实 Lead 是否已重跑，只按工单原文写入，未改一字。若该句尚未成立，责任在派单方，不在本工人核实范围。
3. **`_receipts/T001-doc-sync.md` 是未跟踪文件，`git diff` 看不到它的改动**：因此其改动证据只能靠 3.5 的 `sed -n '117p'` 原样输出与旧文本对照，而非 diff。
4. **未做范围外的顺带清理**：卷上其他 AppleDouble（`._*`）文件、`src/`、`test/`、配置等均未触碰；工单未点名的不可逆操作一概未做。
5. **未提交代码、未挪工单、未合并分支**：均按工单边界执行，无相关操作。
