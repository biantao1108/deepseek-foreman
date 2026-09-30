# 发布清单（deepseek-foreman）

> 目标：把仓库推成「随时可 public + 可 npm publish」。每一步都写命令，不写感觉。
> 执行顺序自上而下；任何一步不符合预期就停下，先修再继续。

## 0. 前提

- 发布者已 `npm login`（对 `deepseek-foreman` 有发布权限的账号）。
- 本地工作树干净：`git status --short` 无输出（`_tickets/`、`_receipts/` 已被 `.gitignore` 忽略，不在此列）。
- 用 Node 20 或 22（CI 矩阵同款）。

## 1. 发布前

### 1.1 自检全过

```bash
npm ci && npm run build && node test/smoke.mjs 2>&1 | tail -1
```

期望：`全部通过（62 项）`。（项数随自检增长而变，以仓库 README 与 `test/smoke.mjs` 末尾输出为准。）

### 1.2 脱敏检查（干净检出下应为零，仓库地址除外）

在**干净检出**（`git clone` 出来的目录，或已确认 `_tickets/`、`_receipts/` 不在工作树里）上跑：

```bash
grep -rn "kimi-coding\|xiaomi-token\|MiniMax-M\|biantao\|/Volumes/" --include="*.md" --include="*.yml" --include="*.json" . | grep -v node_modules | grep -v package-lock
```

期望：**只有 1 行**，即 `package.json` 的 `repository.url`。`biantao` 是 GitHub 账号名，这一行是仓库地址，属预期命中（2026-10-01 在干净检出等价命令上实测：只输出 `package.json:29`）。

要「严格零输出」的口径，追加一条过滤：

```bash
git ls-files '*.md' '*.yml' '*.json' | xargs grep -n "kimi-coding\|xiaomi-token\|MiniMax-M\|biantao\|/Volumes/" | grep -v '"url": "https://github.com/biantao1108/'
```

期望：无输出（`exit=1`）。

另外两点：

- `LICENSE` 里的 `biantao1108` 署名不在 `--include` 过滤范围内（`.md` / `.yml` / `.json`），不参与本检查；MIT 要求保留署名。
- 本地未提交的工作树里，上面的原版命令会额外命中 `_tickets/`、`_receipts/`（已 gitignore）——那不是泄漏，是工作树噪音，所以发布前检查以干净检出为准。

### 1.3 版本号与 CHANGELOG 一致

```bash
node -p "require('./package.json').version"
head -5 CHANGELOG.md
```

期望：`package.json` 的 `version` 与 CHANGELOG 最上面那条已发布版本号一致（当前 `0.2.0`），且 CHANGELOG 该条已写明日期与本次改动。

### 1.4 打进包里的东西是对的

```bash
npm pack --dry-run 2>&1 | grep -E "roles.example.yml|skill/|lib/index.js|cordis.patch.yml"
```

期望：列出 `roles.example.yml`、`skill/deepseek-foreman/SKILL.md`（及模板）、`lib/index.js`、`cordis.patch.yml`——用户装到的就是这些。

### 1.5 CI 绿

GitHub Actions 的 `CI` 工作流在 Node 20 与 22 两个矩阵上都要绿（`.github/workflows/ci.yml`）。

## 2. 发布

### 2.1 npm 发布

包名 `deepseek-foreman`，已查可用（`npm view deepseek-foreman version` 返回 404，且 `dsh-foreman` 同样 404）。

```bash
npm publish --access public
```

确认发布成功：

```bash
npm view deepseek-foreman version
```

期望：输出 `0.2.0`。

### 2.2 GitHub 仓库转 public

仓库名已按 `dsh-ticket-manager` → `dsh-foreman` → `deepseek-foreman` 改定。若你手上的检出仍指向旧名，先在 Settings → General → Repository name 改成 `deepseek-foreman`（GitHub 自动做旧名重定向），再从 Danger Zone → Change visibility 转 public。

确认仓库是 public 后，检查 `package.json` 的 `repository.url` 指向的正是这个仓库：

```bash
node -p "require('./package.json').repository.url"
```

期望：`https://github.com/biantao1108/deepseek-foreman`。

## 3. 发布后

### 3.1 从 npm 装一遍（不是 link）

在 dsh 插件页（或全新 profile）**从 npm registry 安装 `deepseek-foreman`**，不要用本地 `link` / 软链，确保验证的是发布产物本身。

### 3.2 开新会话跑全流程

新开一个顶层会话（`allowedModels` 白名单是会话创建时的快照），跑通「装包 → 铺模板 → 填角色 → 派一单」：

1. 插件加载后确认角色表模板被自动铺到 `~/.dsh/foreman.roles.yml`（首次不存在时应自动生成）；
2. 按注释填好 `provider` / `model`，保存；
3. 对 dsh 说「走工单：<一件小事>」，确认 `pick_route` 可被调用、派单与异族审查链路可用。

### 3.3 出问题时的回退

- 24 小时内、无其他版本依赖：`npm unpublish deepseek-foreman@0.2.0 --force`。
- 超过 24 小时：改发补丁版本，并把坏版本 `npm deprecate deepseek-foreman@0.2.0 "原因"`。
- GitHub 侧：public 可退回 private（Settings → Danger Zone → Change visibility）。
