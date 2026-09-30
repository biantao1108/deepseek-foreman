# T101：包与插件改名 dsh-ticket-manager → dsh-foreman

> 派单：dsh kimi-coding/k3 | 日期：2026-10-01
> worker-route: deepseek-official/deepseek-flash
> claimed-by: deepseek-official/deepseek-flash @ low，2026-10-01 00:40 派出

## 目标
包名、插件名、插件 id 全部改为 foreman 系，为开源做准备；本机目录与 profile 重接线由 Lead 在验收后做，工人只改仓库内文件。

## 映射表（照此逐处改，不要自由发挥）
- package.json `name`：`dsh-ticket-manager` → `dsh-foreman`；`version` → `0.2.0`；description 改为 "Foreman for DeepSeek Harness: your best model leads, cheaper models build, a rival vendor reviews. Role-to-route adjudication with peak-window, vision, output-size and cross-vendor-review constraints."
- src/index.ts `export const name = 'ticket-manager'` → `'foreman'`
- cordis.patch.yml：`id: ticket-manager` → `id: foreman`；`name: dsh-ticket-manager` → `name: dsh-foreman`
- example.cordis.yml：同上两处（`- id: ticket-manager` → `- id: foreman`；`name: 'dsh-ticket-manager'` → `name: 'dsh-foreman'`）
- README.md、docs/、skill/、test/ 内所有 `dsh-ticket-manager` 字样 → `dsh-foreman`；`ticket-manager` 插件 id 引用 → `foreman`。**例外**：LICENSE 不动；git 历史不动；docs/plan-open-source.md 里「现 dsh-ticket-manager」这类描述现状的句子不动。
- skill 目录名 skill/dsh-ticket-manager/ → skill/dsh-foreman/（git mv），其 SKILL.md 的 frontmatter `name: dsh-ticket-manager` → `name: dsh-foreman`

## 边界
1. 只改仓库内文件；**不动** ~/.dsh 下任何东西（profile 重接线由 Lead 做）。不 git commit。不挪工单。
2. 本卷 ExFAT：写文件用 shell（sed/python3/cat），不用原子写工具；git mv 可用。
3. 角色表内容（7 个角色）本单不动。

## 验收（写命令，不写感觉）
1. `npm run build && node test/smoke.mjs` → 全部通过
2. `grep -rn "dsh-ticket-manager" --include="*.json" --include="*.yml" --include="*.ts" --include="*.mjs" . | grep -v node_modules | grep -v "docs/plan-open-source.md"; echo exit=$?` → exit=1
3. `grep -rn "ticket-manager" cordis.patch.yml example.cordis.yml src/index.ts; echo exit=$?` → exit=1
4. `node -e "import('./lib/index.js').then(m=>console.log(m.name))"` → 输出 foreman
5. `git status --short` → 含 skill 目录 rename，无意外文件

## 为什么这样验收
改名最常见的事故是漏改一处导致装不上或插件页显示两个名字。grep 零匹配 + 运行时打印插件名，正好覆盖"文本干净"和"运行时生效"两层。

## 产出
- 上述文件修改 + skill 目录 rename
- 回执：_receipts/T101-rename-foreman.md
