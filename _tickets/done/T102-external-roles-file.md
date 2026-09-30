# T102：角色表外置到 ~/.dsh/foreman.roles.yml，支持热更新与自我引导

> 派单：dsh kimi-coding/k3 | 日期：2026-10-01
> worker-route: deepseek-official/deepseek-flash
> reasoning: high（本单是真代码，不是文档）
> claimed-by: deepseek-official/deepseek-flash @ high，派出时填

## 目标
把角色表从 cordis config 里解耦：插件启动读外部 YAML 文件；文件不存在时自动铺一份注释模板并进入"未配置"引导态；pick_route 每次调用查 mtime，变了就热重载，改角色表不用重启。

## 动手前先读
1. src/index.ts 现状（Config schema、apply、pick_route execute）
2. test/smoke.mjs 现有 20 项自检的写法（新检查照它的风格加）
3. cordis.patch.yml（出厂 config.roles 现状）

## 需求
1. **Config schema 调整**（src/index.ts）：
   - `roles` 改为可空（默认空数组）
   - 新增 `rolesFile: z.string().default('')`；空串时默认 `<os.homedir()>/.dsh/foreman.roles.yml`
2. **启动加载顺序**（apply 内）：
   a. `config.roles` 非空 → 用它（向后兼容现有接法），rolesFile 被忽略
   b. 否则读 rolesFile：`{ roles: [...] }` 结构，用同一个 roles schema 校验
   c. 文件不存在 → 从包内 `roles.example.yml`（本单新建，见下）**拷贝**到目标路径（先 mkdir -p 父目录），进入"未配置态"：插件正常加载不抛错，pick_route 所有调用返回 `ok:false`，reason 写明配置文件位置与下一步（"按注释填好 provider/model，保存即生效"）
   d. 文件存在但 YAML 解析/schema 校验失败 → 启动不炸：记为未配置态，reason 里带解析错误摘要
3. **热更新**：pick_route 每次 execute 前 `fs.statSync` rolesFile，mtimeMs 变了就重读+重校验；校验失败**保留上一份好表**，本次调用返回 `ok:false` 并说明（下一份调用若文件修好自动恢复）。注意 YAML 解析库：dependencies 里加 `yaml` 包（runtime 已有 cosmokit 但别引内部包，用干净的 `yaml` 依赖）
4. **重复 role 名**：文件/config 任一处重复 → 视为校验失败（现有 throw 行为保留给 config 直传场景；文件场景走"保留旧表"路径）
5. **roles.example.yml**（包根新建，files 字段加上）：每个字段带中文注释、两个示例组合（DeepSeek 官方全家桶 / 多厂商混合），provider/model 全部注释掉或明显占位，**不含任何真实路由名**（kimi-coding/xiaomi-token-plan-cn 等一律不出现）
6. **cordis.patch.yml 出厂 config 里的 7 个真实角色清空**：config 只留 `rolesFile` 注释示例（注释掉的）。本机正在用的 7 角色表 Lead 会自己挪到 ~/.dsh/foreman.roles.yml，不用工人管
7. **自检新增**（test/smoke.mjs，现有 20 项保留）：
   - config 直传 roles 时行为与现状一致（回归）
   - rolesFile 不存在 → 自动铺模板 + 未配置态引导
   - 写入合法 rolesFile → 下次调用即生效（热更新）
   - 改坏 rolesFile → 保留旧表 + ok:false + 修好自动恢复
   - rolesFile 里重复 role → 校验失败路径
   - 临时文件用 `fs.mkdtempSync(os.tmpdir() + ...)`，别写进仓库目录
8. README.md 的安装/配置段改成新流程（装包 → 编辑 ~/.dsh/foreman.roles.yml → 开新会话），"前置条件"一节保留 allowedModels 白名单说明（白名单仍是会话快照，改它仍需新会话——明确写出这点）

## 边界
1. 只动：src/index.ts、test/smoke.mjs、package.json（加 yaml 依赖、files 加 roles.example.yml）、cordis.patch.yml、README.md；新建 roles.example.yml
2. 不动 example.cordis.yml（T103 处理）、不动 skill/、不动 docs/
3. 不 git commit。不挪工单。ExFAT：写文件用 shell
4. npm install 新依赖：允许 `npm install yaml`（会改 package-lock）

## 验收（写命令，不写感觉）
1. `npm run build && node test/smoke.mjs` → 全部通过（含新增项，回执贴全量输出）
2. `grep -n "kimi-coding\|xiaomi\|minimax\|deepseek-official" roles.example.yml cordis.patch.yml; echo exit=$?` → exit=1（出厂零真实路由）
3. `node -e "const m=require('yaml');console.log('yaml ok')"` → yaml ok
4. `git status --short` → 改动只含第 1 条点名的文件

## 为什么这样验收
这张单的目的是"装包即用"：新用户没有配置也能装得上、得到明确引导；老用户改文件即生效。热更新和坏文件保护必须机器验证，不能靠读代码觉得对。出厂零真实路由是开源硬门槛，用 grep 证伪。

## 产出
- 修改：src/index.ts、test/smoke.mjs、package.json、 cordis.patch.yml、README.md
- 新建：roles.example.yml
- 回执：_receipts/T102-external-roles-file.md
