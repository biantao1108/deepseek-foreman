# Changelog

本项目的显著改动都记在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-10-01

首个公开版本：把私有的 `dsh-ticket-manager` 变成可安装、可发布的 `deepseek-foreman`。

### 新增

- **角色表外置**：角色路由从 cordis config 抽到用户文件 `~/.dsh/foreman.roles.yml`（`rolesFile` 可改路径）。文件不存在时插件自动铺一份带中文注释的模板并进入「未配置」引导态（`pick_route` 返回 `ok:false` 并写明下一步），不阻断 dsh 启动。
- **角色表热更新**：`pick_route` 每次调用比对 `rolesFile` 的 mtime，改动保存即生效，不用重启、不用关开插件。文件写坏或写成空表时保留上一份可用角色表并说明错在哪，改好保存后下次调用自动恢复。
- **CI**：`.github/workflows/ci.yml`，push / PR 触发，Node 20 与 22 矩阵跑 `npm ci && npm run build && node test/smoke.mjs`。
- **发布清单**：`docs/release-checklist.md`（脱敏 grep、版本一致性、打包内容、npm publish、发布后从 registry 装一遍验证）。
- **英文 README**：`README.en.md`，与中文版互链。

### 变更

- **项目改名**：`dsh-ticket-manager` → `dsh-foreman` → **`deepseek-foreman`**（包名、插件 id、仓库名、skill 目录同步）。npm 包名 `deepseek-foreman` 已查可用。
- **`package.json`**：`files` 字段纳入 `skill/`，让工单 SOP 随 npm 包一起发布；补 `repository` 字段。
- **中文 README 重写为开源版**：一键安装、三件套、与上游 `opus-manager` 的差异表。

### 移除

- **出厂去私有化**：`cordis.patch.yml` 与 `example.cordis.yml` 不再包含任何本机真实路由；含本机绝对路径的私有文档（`docs/交接.md`）移出仓库；`_tickets/`、`_receipts/` 已进 `.gitignore`，不进发布内容。
