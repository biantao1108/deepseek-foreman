# 回执 T101：包与插件改名 dsh-ticket-manager → dsh-foreman

> 执行引擎：deepseek-official/deepseek-flash
> reasoning_effort：low（照工单头 claimed-by 记录）
> 完成时间：2026-10-01 00:45
> 分支 / 提交 / PR：无（按工单边界，未提交）
> 工单：留在 _tickets/doing/ 等待验收

## 1. 做了什么

照工单映射表逐处改名，未自由发挥：

- `package.json`：`name` → `dsh-foreman`；`version` → `0.2.0`；`description` 换成工单给的 Foreman 英文描述。
- `src/index.ts`：插件 `export const name` → `'foreman'`；连带把重复角色报错串 `'ticket-manager: duplicate role in config.roles'` → `'foreman: ...'`（否则验收 3 的 `grep ticket-manager` 不会归零）。
- `cordis.patch.yml`：注释里的包名、`- id: ticket-manager` → `foreman`、`name: dsh-ticket-manager` → `dsh-foreman`。
- `example.cordis.yml`：`- id:` 与 `name:` 同上两处。
- `README.md`：全文 `dsh-ticket-manager` → `dsh-foreman`、`ticket-manager` → `foreman`（标题、软链安装命令、bundle patch 示例）。
- `docs/交接.md`：全文同上替换（路径、仓库 URL、profile bundle、插件页组件名、skill 路径）。
- `skill/dsh-ticket-manager/SKILL.md`：frontmatter `name:` → `dsh-foreman`。
- `skill/dsh-ticket-manager/` → `skill/dsh-foreman/`（`git mv`，三个受跟踪文件一并 rename）。
- `package-lock.json`：锁文件内两处包名 `dsh-ticket-manager` → `dsh-foreman`（验收 2 覆盖 `*.json`，必须改）；两处 `version` 同步 `0.1.0` → `0.2.0`，与 `package.json` 保持一致（见 §4 存疑 2）。

未动：`LICENSE`（工单例外）；`docs/plan-open-source.md`（工单例外 + 见 §4 存疑 1）；`_tickets/`、`_receipts/` 里的历史记录；`~/.dsh` 下任何东西（边界 1）；角色表 7 条内容（边界 3）。未删任何文件，未提交。

## 2. 文件清单

- `package.json`
- `package-lock.json`
- `src/index.ts`
- `cordis.patch.yml`
- `example.cordis.yml`
- `README.md`
- `docs/交接.md`
- `skill/dsh-foreman/SKILL.md`（原 `skill/dsh-ticket-manager/SKILL.md`）
- `skill/dsh-foreman/templates/receipt.md`、`skill/dsh-foreman/templates/ticket.md`（随目录 rename）
- 本回执：`_receipts/T101-rename-foreman.md`

## 3. 验收证据（工单里每条检查对应一段）

### 3.1 `npm run build && node test/smoke.mjs` → 全部通过

命令：`npm run build && node test/smoke.mjs; echo "acceptance1_exit=$?"`

```text
> dsh-foreman@0.2.0 build
> tsc -p tsconfig.json

tool: pick_route
  ok   无 role 列出全部角色  →  7
  ok   K3 审小米写的 daily-code 放行（异族）  →  true
  ok   跨厂商审查放行 (review 审 daily-code-offpeak)  →  true
  ok   K3 审 K3 自己的产物被拒  →  false
  ok   同厂商拒审时给出别家候选  →  true
  ok   杂活不做视觉活  →  false
  ok   文案做视觉活  →  true
  ok   未知角色被拒  →  false
  ok   周三 11:00 落在 09:00-12:00 高峰 → 锁  →  false
  ok   高峰被拒时自动给 fallback 角色  →  daily-code
  ok   周三 13:00 午休属空闲 → 放行（单窗口实现会误锁）  →  true
  ok   周三 15:00 落在 14:00-18:00 高峰 → 锁  →  false
  ok   周三 21:30 空闲 → 放行  →  true
  ok   国庆周六 11:00 全天空闲 → 放行  →  true
  ok   10-08 是周四但属法定假日 → 放行（peakDays 单独判会误锁）  →  true
  ok   长产出拒小上限角色  →  true
  ok   M2.7 声明 131072，长产出放行  →  true
  ok   32768 上限角色被长产出拒绝  →  false
  ok   同一角色普通产出放行  →  true
  ok   example.cordis.yml 角色数  →  7

全部通过
acceptance1_exit=0
```

### 3.2 验收 2 → exit=1

命令：

```text
grep -rn "dsh-ticket-manager" --include="*.json" --include="*.yml" --include="*.ts" --include="*.mjs" . | grep -v node_modules | grep -v "docs/plan-open-source.md"; echo exit=$?
```

```text
exit=1
```

（无任何匹配行，故管道无输出，`echo exit=$?` 打印 1。）

### 3.3 验收 3 → exit=1

命令：`grep -rn "ticket-manager" cordis.patch.yml example.cordis.yml src/index.ts; echo exit=$?`

```text
exit=1
```

### 3.4 验收 4 → 输出 foreman

命令：`node -e "import('./lib/index.js').then(m=>console.log(m.name))"`

```text
foreman
acceptance4_exit=0
```

（`lib/` 由本次 `npm run build` 重新生成；`lib/` 在 `.gitignore` 内，不进 git 状态。）

### 3.5 验收 5 → git status 含 skill 目录 rename

命令：`git status --short`

```text
 M README.md
 M cordis.patch.yml
 M "docs/\344\272\244\346\216\245.md"
 M example.cordis.yml
 M package-lock.json
 M package.json
RM skill/dsh-ticket-manager/SKILL.md -> skill/dsh-foreman/SKILL.md
R  skill/dsh-ticket-manager/templates/receipt.md -> skill/dsh-foreman/templates/receipt.md
R  skill/dsh-ticket-manager/templates/ticket.md -> skill/dsh-foreman/templates/ticket.md
 M src/index.ts
?? _tickets/doing/
?? _tickets/open/
?? _tickets/queue.md
?? docs/plan-open-source.md
```

rename 三行齐全（`RM` = 改名且 SKILL.md 内容有改；两个模板为纯 `R`）。四条 `??` 未跟踪项在本单开始前的基线里就已存在（开工前基线：`?? _tickets/doing/`、`?? _tickets/open/`、`?? _tickets/queue.md`、`?? docs/plan-open-source.md`），非本单产生。

### 3.6 范围复核（补充证据，非工单验收项）

命令：`git diff --stat`

```text
 README.md                          |  8 ++++----
 cordis.patch.yml                   |  6 +++---
 "docs/\344\272\244\346\216\245.md" | 14 +++++++-------
 example.cordis.yml                 |  4 ++--
 package-lock.json                  |  8 ++++----
 package.json                       |  6 +++---
 skill/dsh-foreman/SKILL.md         |  2 +-
 src/index.ts                       |  4 ++--
 8 files changed, 26 insertions(+), 26 deletions(-)
```

命令：`grep -rn "ticket-manager" . --exclude-dir=node_modules --exclude-dir=.git; echo "exit=$?"`

剩余命中全部落在工单允许不动的范围内：`LICENSE`（例外）、`_tickets/doing/T101-rename-foreman.md`（工单本身）、`_tickets/done/T001,T002`、`_receipts/T001,T002`（历史记录）、`docs/plan-open-source.md` 第 3 行（工单例外）与第 99 行（见 §4 存疑 1）。

## 4. 风险与存疑

1. **`docs/plan-open-source.md` 第 99 行未改（存疑，请 Lead 裁决）**：该行是开源清单里的改名任务描述 —— `` 改名：包名/仓库名/插件 id（`ticket-manager`→`foreman`） ``。工单说「`docs/` 内 `ticket-manager` 插件 id 引用 → `foreman`」，但这一行的 `ticket-manager` 是「旧名」本身，改成 `foreman` 会变成 `foreman`→`foreman`，语义被破坏。第 3 行「现状：`dsh-ticket-manager`」属工单点名的例外。因此整份文件未动。若要严格全库归零，请 Lead 指定该行的新写法。
2. **`package-lock.json` 的 `version` 也改成了 `0.2.0`（工单未逐字写明）**：工单映射表只写了 `package.json` 的 `version`，但验收 2 覆盖 `*.json`，锁文件两处 `name` 必须改；为避免锁文件与 `package.json` 版本不一致，同步改了锁文件两处 `version`（全文仅这两处 `0.1.0`）。若不希望动，可回退为 `0.1.0`。
3. **`docs/交接.md` 的本机路径与仓库 URL 一并改名（口径存疑）**：工单说「`docs/` 内所有 `dsh-ticket-manager` 字样 → `dsh-foreman`」，故第 13 行本机项目路径、第 14 行 GitHub 仓库 URL 也改成了 `dsh-foreman`。这两处描述的是「现状」，而目录改名与仓库 rename 按工单由 Lead 在验收后做——在 Lead 完成前，这两行文档与实际不一致。若工单本意只改「包名/插件名/插件 id」而不含路径与 URL，请 Lead 回退这两行。
4. **`~/.dsh/skills/dsh-ticket-manager` 软链已悬空（本单副作用，须 Lead 重接）**：工单要求 `git mv` 重命名 skill 目录，而 `~/.dsh` 下的接线按边界 1 不得由工人改动。只读证据：

   ```text
   $ ls -la ~/.dsh/skills/
   lrwxr-xr-x  1 biantao  staff  83 Oct  1 00:08 dsh-ticket-manager -> /Volumes/Data/OSData/MacOS/Documents/AI/dsh-ticket-manager/skill/dsh-ticket-manager

   $ test -e ~/.dsh/skills/dsh-ticket-manager && echo "symlink target EXISTS" || echo "symlink is DANGLING"
   symlink is DANGLING
   ```

   改名瞬间可观察到技能目录热更新：会话技能表里 `dsh-ticket-manager` 变为 `dsh-foreman`，随后因软链悬空而消失。Lead 验收后需重接该软链（并按工单做本机目录/profile 重接线）。
5. **未做/未验证**：未提交代码；未动 `~/.dsh`；未删除任何文件；`lib/` 是构建产物（gitignored），未单独核对其中每个字符串（它由 `tsc` 从已改名的 `src/index.ts` 重新生成，验收 4 已用运行时打印覆盖）；未对 `package.json`/`package-lock.json` 跑 `npm ci`（会改动 `node_modules`，超出范围），仅用 `node` 解析核对了两者 `name`/`version` 一致：`package.json dsh-foreman 0.2.0`、`package-lock dsh-foreman 0.2.0`、锁内根包 `dsh-foreman 0.2.0`。
