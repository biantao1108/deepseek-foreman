# T102b：修 T102 审查发现的 5 处问题

> 派单：dsh kimi-coding/k3 | 日期：2026-10-01
> worker-route: deepseek-official/deepseek-flash
> claimed-by: deepseek-official/deepseek-flash @ high，2026-10-01 01:05 派出

## 目标
修掉 k3 审查 T102 发现的 5 处问题（2 中 3 低），全部在 src/index.ts + cordis.patch.yml 注释 + test/smoke.mjs。

## 动手前先读
1. `_receipts/T102-external-roles-file.review.md`（不存在则按下述五条原文做，它们来自审查报告已核实）
2. src/index.ts 现状

## 五条修改
1. **`~` 展开**（中）：rolesFile 解析处加 `rolesFile.startsWith('~/') ? join(homedir(), rolesFile.slice(2)) : rolesFile`。cordis.patch.yml 第 13 行注释示例保持 `~/.dsh/foreman.roles.yml` 写法（展开后它是对的）。
2. **TOCTOU 方向**（中）：loadFile 里改为**先 statSync 记 mtime、后 readFileSync**（最坏多 reload 一次，安全方向）。
3. **restoreTemplate 成功不清旧错**（低）：模板铺盖成功后清掉 loadError 并让 refresh 继续走 re-stat → loadFile，使当次调用即恢复正确的「未配置」态。
4. **模板铺盖加排他**（低）：copyFileSync 第三个参数加 `constants.COPYFILE_EXCL`（从 node:fs 导入 constants）；EXCL 冲突落入现有 catch 即可。
5. **合法空表保留旧表**（低，Lead 已裁决要改）：loadFile 里 `table.length === 0` 时，若内存里有旧表（roles.length > 0）则保留旧表，loadError 写「文件里是空表，已保留上一份可用角色表；改好保存自动生效」；无旧表时保持现有「未配置」文案。

## 自检
test/smoke.mjs 为每条加对应检查（42 项基础上新增）：
- `~` 展开的 rolesFile 指向真实 home 下文件（用临时 HOME 或临时目录模拟，别碰真实 ~/.dsh）
- TOCTOU：构造 stat-then-read 顺序的断言（读代码顺序可由测试通过行为保证，至少加一条"reload 后内容是新表"的回归）
- 删文件后当次调用即进入正确「未配置」态（无陈旧报错）
- 对已存在文件铺模板不覆盖（COPYFILE_EXCL 行为）
- 空表保留旧表

## 边界
1. 只动：src/index.ts、test/smoke.mjs、cordis.patch.yml（如需调注释）。不动 README、roles.example.yml、其他文件。
2. 不 git commit。不挪工单。ExFAT：写文件用 shell。

## 验收（写命令，不写感觉）
1. `npm run build && node test/smoke.mjs` → 全部通过（42+N 项），exit=0
2. `grep -n "COPYFILE_EXCL" src/index.ts` → 有匹配
3. `grep -n "startsWith('~/'" src/index.ts` → 有匹配
4. `git status --short` → 只动 src/index.ts、test/smoke.mjs、（可选）cordis.patch.yml

## 为什么这样验收
这 5 条全是「代码里看起来对、边界下才出错」的类型，审查员已逐条给出证据；修复必须有机器验证，尤其热更新和铺盖这种时序敏感的。

## 产出
- 修改：src/index.ts、test/smoke.mjs
- 回执：_receipts/T102b-review-fixes.md
