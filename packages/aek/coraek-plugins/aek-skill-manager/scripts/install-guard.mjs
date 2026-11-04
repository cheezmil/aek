#!/usr/bin/env node
/**
 * preinstall guard — AEK packages install with pnpm only.
 *
 * The npm client runs `preinstall` of an installed package, so a global
 * `npm i -g @cheezmil/…` reaches this script and is stopped with an
 * actionable message. pnpm does not run dependency lifecycle scripts,
 * so `pnpm add -g` is unaffected; if a client does report a pnpm
 * user-agent (corepack-managed pnpm, etc.) the guard passes it too.
 *
 * Escape hatch (CI / air-gapped machines that really must use another
 * client): AEK_ALLOW_NPM_INSTALL=1
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
const ua = (process.env.npm_config_user_agent ?? '').toLowerCase()

if (ua.includes('pnpm') || process.env.AEK_ALLOW_NPM_INSTALL === '1') {
  process.exit(0)
}

console.error(`\n⚠  ${pkg.name} 只支持 pnpm 安装 — 检测到 ${ua || '非 pnpm'} 客户端，安装已中止。`)
console.error(`   请改用: pnpm add -g ${pkg.name}`)
console.error(`   AEK 全家桶（aek-websearch / aek-prompt-manager / …）一律 pnpm，不支持 npm install -g。`)
console.error(`   (EN: ${pkg.name} must be installed with pnpm: pnpm add -g ${pkg.name}. npm install -g is not supported.)`)
console.error(`   (escape hatch: AEK_ALLOW_NPM_INSTALL=1)` )
process.exit(1)
