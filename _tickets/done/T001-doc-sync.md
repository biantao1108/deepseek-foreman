# T001：修文档漂移与失效的 toolFilter 说法

> 派单：dsh kimi-coding/k3 | 日期：2026-10-01
> worker-route: deepseek-official/deepseek-flash
> claimed-by: deepseek-official/deepseek-flash @ low，2026-10-01 00:10 派出

## 目标
README、SKILL.md、交接文档与代码/工具现状对齐：自检数量写错、toolFilter 是这台 dsh 不存在的参数。

## 背景（已核实的事实，直接采信，不用重查）
1. `node test/smoke.mjs` 实际 20 项自检；README.md 第 70 行写「16 项自检」，docs/交接.md 第 32 行写「22 项」，都是错的。
2. 当前 dsh 0.2.0-rc.2 的 `subagent` 工具参数只有：description / prompt / provider / model / reasoning_effort / run_in_background。**没有 toolFilter 参数**。以下三处按「传 toolFilter」写，照做会失败或被静默忽略：
   - README.md 第 25 行附近差异表「只读审查」一行
   - skill/dsh-ticket-manager/SKILL.md 第零节第 3 条「审查员是否只读」
   - skill/dsh-ticket-manager/SKILL.md 第六节「并传 `toolFilter` 只给读和搜索」
3. 项目根有 macOS AppleDouble 垃圾文件 `._README.md`（.gitignore 已挡，但文件还在盘上）。

## 要做的修改
1. README.md：「16 项自检」→「20 项自检」。
2. docs/交接.md：「离线，`node test/smoke.mjs` 22 项」→「20 项」。
3. toolFilter 三处改为如下口径（可微调措辞，意思不变）：当前 dsh 的 subagent 没有 toolFilter 参数；只读审查靠两层——(a) 审查提示词明确「不要改任何文件，只跑只读命令」；(b) Lead 在审查前后各看一次 `git status`，确认审查员没动文件。
4. 删除 `._README.md`（`rm ._README.md`）。

## 边界
1. 只动：README.md、docs/交接.md、skill/dsh-ticket-manager/SKILL.md、._README.md（删）。
2. 不 git commit / push。不挪工单文件。src/、test/、cordis.patch.yml、example.cordis.yml 一律不碰。
3. 本卷是 ExFAT：write 类工具的原子写会报 ENOTSUP，写文件用 shell（cat heredoc 等）。

## 验收（写命令，不写感觉）
1. `node test/smoke.mjs` → 末行「全部通过」，exit=0
2. `grep -rn "toolFilter" README.md docs/交接.md skill/dsh-ticket-manager/SKILL.md; echo "exit=$?"` → 无匹配行，exit=1
3. `grep -n "16 项\|22 项" README.md docs/交接.md; echo "exit=$?"` → 无匹配行，exit=1
4. `test ! -e ._README.md && echo gone` → 输出 gone
5. `git status --short` → 改动只涉及上述 4 个文件与 _tickets/、_receipts/

## 为什么这样验收
这张单的目的是「文档说的 = 实际能做的」。toolFilter 留着不删，接手人照 SOP 派审查单时会传一个不存在的参数，静默失败还以为自己做了只读约束——这比写错数字更害人。自检数字错则直接误导复测。

## 产出
- 修改：README.md、docs/交接.md、skill/dsh-ticket-manager/SKILL.md
- 删除：._README.md
- 回执：_receipts/T001-doc-sync.md（按回执模板写）
