#!/usr/bin/env node
// 发布前隐私检查：npm 包内容 + 仓库已跟踪文件 里不得出现私有路由名/本机路径。
// 用法：node scripts/privacy-check.mjs   （exit 0=干净，1=有泄露）
import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

// 禁词以 base64 存放，避免检测器自身含被检测物（T308 教训）。
const b64 = ['eGlhb21pLXRva2Vu', 'a2ltaS1jb2Rpbmc=', 'bWluaW1heC1jbg==', 'ZGVlcHNlZWstb2ZmaWNpYWw=']
const FORBIDDEN = b64.map(t => new RegExp(Buffer.from(t, 'base64').toString(), 'i'))
FORBIDDEN.push(/\/Users\/bianta/, /\/Volumes\/Data/)
// 用户项目名与本机专属标识（追加模式，base64 防自检泄漏）
const b64user = ['ZjEtdmlkZW8tc3R1ZGlv', '5oql5byg']
for (const t of b64user) FORBIDDEN.push(new RegExp(Buffer.from(t, 'base64').toString(), 'i'))
// insights 数据内容（usage/analysis 文件本身）永不进 git；路径引用合法

// 从本机角色表取 provider/model 精确值（能读到时）
try {
  const roles = JSON.parse(execSync(`node -e "const y=require('yaml');console.log(JSON.stringify((y.parse(require('fs').readFileSync(process.env.HOME+'/.dsh/foreman.roles.yml','utf8')).roles||[]).flatMap(r=>[r.provider,r.model]).filter(Boolean)))"`, { encoding: 'utf8' }))
  for (const w of roles) if (w.length >= 5) FORBIDDEN.push(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
} catch { /* 角色表不存在则跳过 */ }

const files = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n')
  .filter(f => f && !f.includes('package-lock') && !f.startsWith('_tickets/') && !f.startsWith('_receipts/') && f !== 'scripts/privacy-check.mjs')
let leak = 0
for (const f of files) {
  if (!existsSync(f)) continue
  const txt = readFileSync(f, 'utf8')
  for (const re of FORBIDDEN) {
    const m = re.exec(txt)
    if (m) { console.log('LEAK:', re, 'in', f); leak++ }
  }
}
console.log(leak === 0 ? 'privacy check: CLEAN' : `privacy check: ${leak} leak(s)`)
process.exit(leak ? 1 : 0)
