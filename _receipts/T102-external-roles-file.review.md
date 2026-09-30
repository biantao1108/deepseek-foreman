审查：kimi-coding/k3 @ 2026-10-01

总评：实现质量高，42 项自检重跑全绿，五个新场景全部真测到，出厂零真实路由成立；2 中 3 低建议修后再合。

发现（已逐条核实，全部成立）：
1. 中｜rolesFile 不展开 ~，出厂注释示例会误导用户在 cwd 建字面 ~ 目录
2. 中｜loadFile 先读后 stat，TOCTOU 方向错，会永久漏掉一次热更新
3. 低｜restoreTemplate 成功不清旧 loadError，当次调用返回陈旧报错
4. 低｜模板铺盖 copyFileSync 无 COPYFILE_EXCL，理论竞态可覆盖用户已有文件
5. 低存疑｜合法空表清掉旧好表，与"校验失败保留旧表"不对称

---
## Lead 逐条核实（kimi-coding/k3 @ 2026-10-01）
- 审查员只读核实：git 快照一致 ✓（首次对比文件含 diffstat 是我快照口径不一，重新只比 git status 后确认干净）
- 发现 1 **成立**：src/index.ts:181 无 tilde 展开，注释示例确为坑 → T102b 修
- 发现 2 **成立**：218-219 行序确为先读后 stat → T102b 修
- 发现 3 **成立**：restoreTemplate 成功分支不清 loadError → T102b 修
- 发现 4 **成立**：196 行无 EXCL → T102b 修
- 发现 5 **成立，裁决要改**：空表保旧表更安全 → T102b 修
- T102b 修复后 Lead 重跑 62 项自检全过，关键行抽查属实；工人额外做了逐条回退验证（mutation testing），证明新检查真实卡住 5 条修复。
- 部署：真实角色表已由 Lead 写入 ~/.dsh/foreman.roles.yml（7 角色），新构建探针实测 ok:true。
