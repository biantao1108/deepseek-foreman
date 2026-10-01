# deepseek-foreman 第三方盲审报告 A（架构与 token 经济学）
评审：kimi-coding/k3 @ 2026-10-01
（盲审原文存档；来源为独立评审子代理，Lead 未修改内容）

## 总评
理念正确、执行诚实、工程深度不匀。核心省钱结构（Lead 上下文只放工单/回执/审查意见，实现 token 落在便宜模型）在文件契约层面成立，回执体积实测受控（最大 20.7KB），且对 fork 前缀复用、persona 继承有正确认知。但：(1) SOP 自身矛盾——SKILL.md:8「Lead 不打开代码文件」vs :127「逐条核实要打开文件行号」；(2) 四条硬约束在 SOP 主路径非必经——SKILL.md 派单节不要求调 pick_route，全文仅 :17 自检提到；(3) 招牌功能 subagent_readonly 被迫跑经理位贵模型（bundle 层无 preset scope，不能按次换模型），物理只读与审查省钱当前互斥；(4) T205/T207 暴露「离线全绿 ≠ dsh 收下」的 bundle 层系统性风险，应对方向对但未产品化；(5) Lead 侧 token 完全未计量，「省钱」论证缺一半。

## 主题 1 Token 经济学（要点）
优点：Lead 上下文形状控制真实成立（工单 1–5KB、回执 ≤20.7KB）；fork/subagent KV cache 规则（SKILL.md:95）正确；有 30 万 token/单上限、>5 子任务用 workflow 等初级预算概念；诚实声明无 A/B。
问题：高=Lead 侧无 token 计量（README.md:155 只有施工口径）；高=subagent_readonly 锁死贵路由（cordis.patch.yml:27-28）。中=工单×3/回执×2/验收输出×3 的结构性重复 prefill，SOP 无减负条款（T207 已自发用 `| tail -1`，应升格为规则）；派单提示与 persona 继承重复（SKILL.md:83 vs :99）；fork 复用无量化。低=预算熔断无工具；LONG_OUTPUT_MIN_TOKENS 硬编码（src/index.ts:241）。

## 主题 2 闭环健壮性（要点）
优点：验收哲学被真实执行（T102 审查 5 条逐条核实+mutation testing）；失败升级/停机条件明确；审查转化率有据（20+ 发现 19 成立 1 驳回）；T205/T207 根因分析质量高。
问题：高=SOP 主路径绕过 pick_route 硬约束；高=bundle 层变更无离线验证手段（T205 preset scope / T207 全局工具表同源）。中=审查报告非强制落档（dogfooding.md:29 自认部分轮次只在会话里）；会话中断+在跑子代理的认领路径空白；核实者与审查者同族（Lead=k3 审 k3 的审查，靠直接证据兜底但论证未写出）。低=SKILL.md :8/:127 矛盾；双审无分级标准；holidays 手工维护。

## 主题 3 架构与耦合（要点）
优点：插件边界干净（只做事后硬约束）；src/index.ts 防御性质量高（TOCTOU 方向、COPYFILE_EXCL、悬空软链、白名单采集限定 model-selection 条目、坏文件保旧表；110 项自检实跑全绿）；cordis.patch.yml 注释即护栏。
问题：中=对 dsh 内部契约硬依赖深（spawn/toolName/preset scope/全局工具表/allowedModels 快照，均非稳定 API）；peerDep dsh-tools 钉死 0.2.0-rc.2；apply() 重复内联角色直接 throw（:338）与「失败不炸宿主」语言不一致。低=单文件 756 行、SETUP_SCHEMA 110 行偏重；可移植层/dsh 专属层未画线。

## 业界对比结论
与 Anthropic orchestrator-workers（lead 回收压缩结论、agent≈15× token）、Karpathy 小步强验证纪律方向一致；「异族审查代码强制 + 按次路由」是相对 Claude Code 与 Codex 的真实差异化。缺：评估体系、Lead 计量、预算熔断工具。疑似过度设计：peak/holiday 时段引擎（可辩护，是卖点）、doctor 110 行 JSON Schema。规模实证差距：本项目 1 晚 19 单 vs 上游 opus-manager 8 周 13 仓 360 单。存疑：Tiny-Workers 式任务特化小工人路线对个人用户适用性。

## v0.3 建议（优先级序）
1. 派单节强制 pick_route（收益最大的一行改动）
2. Lead 侧 token 计量+Lead:Worker 比值
3. 只读 vs 便宜审查决策矩阵+向 dsh 上游提 bundle 层 scoped preset
4. bundle patch live 冒烟清单产品化
5. 审查报告强制落档
6. 验收输出截尾规范（落盘+贴首尾）
7. 修 :8/:127 矛盾+同族核实论证落档
8. 中断恢复 SOP（doing 有单无回执=按失败重派）
9. dsh 内部契约清单+版本探测、peerDep 改范围
10. fork vs subagent 对照实验
11. 杂项（LONG_OUTPUT 可配、throw 改 error 态、假日过期 hint）
