# T<N>：<简短标题>

> 派单：dsh <Lead 的 provider/model> | 日期：YYYY-MM-DD
> worker-route: <施工用的 provider/model>
> difficulty: <trivial|normal|critical>
> workdir: <相对项目根目录的作业目录；在根目录就删掉这行>
> claimed-by: （派单时由 Lead 填写实际生效的 provider/model/reasoning_effort 和时间）

## 目标
<一句话：这张单解决什么问题。>

## 动手前先读
1. <项目规矩，如 AGENTS.md>
2. <这次改动涉及的文件、文档或 issue>

## 边界
1. 只动：<文件 / 模块>，别的不碰。
2. 密钥不写进代码、文档和日志。
3. 不 git commit / push（Lead 验收后统一提交）。
4. 工单文件留在 `_tickets/doing/`，不要挪。
5. 不写遍历目录、逐个改文件内容的脚本；改哪个文件就点名改哪个。
6. 不打开数据库、图片、压缩包这类非文本文件（本单点名要处理的除外）。

## 验收（写命令，不写感觉）
1. `<命令>` → <预期结果，如测试全过>
2. `<命令>` → <预期输出或字段值>

## 为什么这样验收
<这些检查要保住的真实目的。过了检查不是目标，这个才是。>

## 产出
- <要新建或修改的文件>
