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

期望：`全部通过（110 项）`。（项数随自检增长而变，以仓库 README 与 `test/smoke.mjs` 末尾输出为准。）

### 1.2 脱敏检查（应为零）

检查方向是**反向**的：清单里不写任何真实路由名（写了清单自己就成了泄露源），而是从本机私有角色表 `~/.dsh/foreman.roles.yml` 现读 `provider` / `model` / `vendor` 值，逐个在**已跟踪文件**里找。换台机器、换套路由都不用改清单。

```bash
node -e "
const yaml=require('yaml'),fs=require('fs'),cp=require('child_process');
const roles=yaml.parse(fs.readFileSync(process.env.HOME+'/.dsh/foreman.roles.yml','utf8')).roles||[];
const self=require('./package.json').name.split('-');
const raw=[...new Set(roles.flatMap(r=>[r.provider,r.model,r.vendor]).filter(Boolean))];
const skip=raw.filter(w=>w.length<3||self.includes(w));
const words=raw.filter(w=>!skip.includes(w));
if(skip.length)console.error('note: skipped',skip.length,'value(s): repo name or shorter than 3 chars');
const files=cp.execSync('git ls-files').toString().trim().split('\n').filter(f=>f&&!f.includes('package-lock'));
const tok=c=>c!==undefined&&/[A-Za-z0-9_.-]/.test(c);
let leak=0;
for(const w of words)for(const f of files){
  if(!fs.existsSync(f))continue;
  fs.readFileSync(f,'utf8').split('\n').forEach((l,i)=>{
    for(let p=l.indexOf(w);p>=0;p=l.indexOf(w,p+1))
      if(!tok(l[p-1])&&!tok(l[p+w.length])){console.log('LEAK',w,'in',f+':'+(i+1));leak++}
  });
}
console.log(leak===0?'no leaks':leak+' leaks');process.exit(leak?1:0)"
```

期望：`no leaks`，`exit=0`。有命中就逐条列出 `LEAK <值> in <文件>:<行>` 并以 `exit=1` 结束。两点口径：

- **大小写敏感 + 独立词**：只有整个词才算命中，值出现在更长的词里不算（`-`、`.`、`_` 都算词的一部分）。这样「仓库自己的名字里恰好含某个厂商名」这类包含关系不会被误判成泄露。
- **跳过两类词**：仓库 `package.json` 的 `name` 本身含有的词（公开发布，不可能是秘密），以及长度不足 3 的值（两字符档位无法与普通文本区分，误报大于信号）。被跳过的**只报条数**、不回显值，避免私有路由名进 CI 日志；`note:` 行走 stderr，stdout 只有结论。

然后单独扫一遍通用本机路径形态——这类是机器特征、不是路由名，所以留在清单里。关键词一律写成字符类拆开，否则清单会自己命中自己：

```bash
git ls-files | xargs grep -nE '(/[V]olumes/|/[U]sers/|/[h]ome/|[A-Za-z]:\\[U]sers)'
```

期望：无输出（`exit=1`）。

另外两点：

- `biantao` 是作者的 GitHub 账号名，`package.json` 的 `repository.url` 合法包含它，因此**不作检查词**（上面的命令从角色表取词，不会碰到它）；`LICENSE` 里的 `biantao1108` 署名同属预期，MIT 要求保留署名。
- 命令只扫 `git ls-files` 列出的已跟踪文件，`_tickets/`、`_receipts/`（已 gitignore）不参与——本地工作树噪音不会干扰判定，也就不必再靠「干净检出」来排除。

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
