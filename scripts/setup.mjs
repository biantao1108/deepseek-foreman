#!/usr/bin/env node
// deepseek-foreman setup 向导（R15）：核对白名单配置 + 指路角色表 + 给试单话术。
// 用法：node node_modules/deepseek-foreman/scripts/setup.mjs  或  npx deepseek-foreman-setup
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

const home = homedir()
const profilesDir = join(home, '.dsh', 'profiles')
const rows = []
if (existsSync(profilesDir)) {
  for (const name of readdirSync(profilesDir)) {
    const file = join(profilesDir, name, 'cordis.patch.yml')
    if (!existsSync(file)) continue
    let found = false
    try {
      const doc = parseYaml(readFileSync(file, 'utf8'))
      for (const entry of Array.isArray(doc) ? doc : []) {
        if (entry?.config?.allowedModels !== undefined) { found = true; break }
        if (entry?.insert) for (const sub of entry.insert) if (sub?.config?.allowedModels !== undefined) { found = true; break }
      }
    } catch { /* 解析失败当没配 */ }
    rows.push({ profile: name, hasAllowlist: found })
  }
}
console.log('=== deepseek-foreman setup ===')
console.log('1) allowedModels 白名单检查：')
for (const r of rows) console.log('   profile ' + r.profile + ': ' + (r.hasAllowlist ? '已配置 ok' : '未配置 -> 在该 profile 的 cordis.patch.yml 加 subagent-model-selection-settings 的 allowedModels（模板见 README 前置条件），改完开新会话'))
if (rows.length === 0) console.log('   未发现 profile（先安装并运行一次 dsh）')
console.log('2) 角色表：编辑 ~/.dsh/foreman.roles.yml，provider/model 用「调 pick_route 看看 setup」返回的可用清单里的值。')
console.log('3) 试跑一张小工单：对 dsh 说「走工单：把 docs/README.md 里错的日期改成今天，difficulty: trivial」。')
