#!/usr/bin/env node
/**
 * signing-identity — resolve the LOCAL macOS development signing identity.
 *
 * HARD RULE (2026-11-11): local macOS development signs with a
 * self-signed development certificate / a custom development signing
 * identity. ADHOC ("temporary anonymous") signing is FORBIDDEN. If the build
 * would use adhoc, the build fails BEFORE anything is packaged, with a
 * friendly how-to-fix message. This complements (not replaces) the existing
 * post-sign `verifySignedBundle()` check.
 *
 * No certificate name, SHA-1 fingerprint, or absolute path is hardcoded.
 * Identities are discovered from the login keychain at runtime, and can be
 * pinned with `AEK_SIGN_IDENTITY`.
 *
 * SAFETY: no arguments = read-only `check`. `--json` for gates. `guide`
 * prints the certificate creation steps. Nothing here writes to the keychain.
 *
 * Usage:
 *   node scripts/aek/signing-identity.mjs             # check (read-only)
 *   node scripts/aek/signing-identity.mjs check --json
 *   node scripts/aek/signing-identity.mjs guide
 *
 * @module scripts/aek/signing-identity
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

/** Values that mean "adhoc / anonymous signing" in any tool. */
const ADHOC_VALUES = new Set(['-', 'adhoc', 'ad-hoc', 'anonymous', 'none', 'false'])

/** Prefixes of Apple-ISSUED identities — not self-signed dev identities. */
const APPLE_ISSUED = /^(?:Apple Development|iPhone Developer|Developer ID Application|Mac Developer|3rd Party Mac Developer|Apple Distribution)/iu

/** Preferred names for a locally created self-signed dev certificate. */
const PREFERRED = [/cheezmil dev/iu, /aek dev/iu, /self[- ]?signed/iu, /local dev/iu]

/**
 * Repository root (walk up to the workspace marker).
 * @returns {string} absolute repository root.
 */
export function repoRoot() {
  let dir = HERE
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return process.cwd()
}

/** @returns {string} the friendly certificate-creation guide. */
export function setupGuide() {
  return `需要一个「自签名开发证书 / 自定义开发签名身份」才能构建 AEK.app
—— adhoc（临时匿名）签名在本项目是被禁止的，编译期就会拦下来。

创建一份（macOS，一次即可）：
  - 打开「钥匙串访问」→ 菜单「证书助理」→「创建证书…」
  - 名称：AEK Dev（或任意你自己的名字）
  - 身份类型：自签名根证书；证书类型：代码签名
  - 勾选「让我覆盖默认值」，后续页保持默认，Key Usage 里要有「代码签名」
  - 存到「登录」钥匙串

命令行等价做法：
  openssl req -x509 -newkey rsa:2048 -keyout aek-dev.key -out aek-dev.crt \\
    -days 3650 -nodes -subj "/CN=AEK Dev/OU=Local Development"
  openssl pkcs12 -export -inkey aek-dev.key -in aek-dev.crt \\
    -out aek-dev.p12 -passout pass:
  security import aek-dev.p12 -k ~/Library/Keychains/login.keychain-db -P "" \\
    -T /usr/bin/codesign
  security set-key-partition-list -S apple-tool:,apple: -s -k "" \\
    ~/Library/Keychains/login.keychain-db

确认它可见：
  security find-identity -v -p codesigning

指定要用哪一张（可选，不设则自动发现）：
  AEK_SIGN_IDENTITY="AEK Dev" pnpm <build-command>

注意：Apple Development / Developer ID 这类 Apple 签发的身份不算「自签名开发证书」，
自动发现会跳过它们。`
}

/**
 * Parse `security find-identity -v -p codesigning`.
 * @returns {{ sha1: string, name: string }[]} valid identities.
 */
export function listCodeSignIdentities() {
  if (process.platform !== 'darwin') return []
  let out = ''
  try {
    out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
    })
  } catch {
    return []
  }
  /** @type {{ sha1: string, name: string }[]} */
  const found = []
  for (const line of out.split(/\r?\n/u)) {
    const match = /^\s*\d+\)\s+([0-9A-F]{40})\s+"(.+)"\s*$/u.exec(line)
    if (match !== null) found.push({ sha1: match[1], name: match[2] })
  }
  return found
}

/**
 * Determine whether a named certificate is self-signed (subject === issuer).
 * Informational: a custom development identity may also be chain-issued.
 * @param {string} name - certificate common name.
 * @returns {boolean | null} true/false, or null when it cannot be inspected.
 */
export function isSelfSigned(name) {
  if (process.platform !== 'darwin') return null
  let pem
  try {
    pem = execFileSync('security', ['find-certificate', '-c', name, '-p'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
    })
  } catch {
    return null
  }
  let report
  try {
    report = execFileSync('openssl', ['x509', '-noout', '-subject', '-issuer'], {
      input: pem, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 10_000,
    })
  } catch {
    return null
  }
  const subject = /^subject=(.*)$/mu.exec(report)?.[1]?.trim()
  const issuer = /^issuer=(.*)$/mu.exec(report)?.[1]?.trim()
  if (subject === undefined || issuer === undefined) return null
  // OpenSSL 3 prints "CN = X, OU = Y"; 1.1 prints "/CN=X/OU=Y". Compare both
  // spellings by normalising separators.
  const norm = value => value.replace(/\s*=\s*/gu, '=').replace(/[,\/]/gu, '|').toLowerCase()
  return norm(subject) === norm(issuer)
}

/**
 * Detect an explicit adhoc intent in the environment or builder config.
 * @param {Record<string, string | undefined>} env - environment.
 * @param {string} [root] - repository root.
 * @returns {string[]} human-readable reasons why the build would be adhoc.
 */
export function adhocReasons(env = process.env, root = repoRoot()) {
  /** @type {string[]} */
  const reasons = []
  for (const key of ['AEK_SIGN_IDENTITY', 'CSC_NAME', 'CSC_IDENTITY']) {
    const value = String(env[key] ?? '').trim()
    if (value.length > 0 && ADHOC_VALUES.has(value.toLowerCase())) {
      reasons.push(`${key}='${value}' 表示 adhoc 签名`)
    }
  }
  if (String(env.CSC_IDENTITY_AUTO_DISCOVERY ?? '').toLowerCase() === 'false' && !env.CSC_NAME) {
    reasons.push('CSC_IDENTITY_AUTO_DISCOVERY=false 会让 electron-builder 退回匿名签名')
  }
  if (String(env.AEK_ALLOW_ADHOC ?? '').trim() !== '') {
    reasons.push('AEK_ALLOW_ADHOC 不允许设置（本项目禁止 adhoc）')
  }
  const config = join(root, 'apps', 'aek-desktop', 'v0', 'electron-builder.config.mjs')
  if (existsSync(config)) {
    const text = readFileSync(config, 'utf8')
    if (/identity\s*:\s*['"](?:-|adhoc)['"]/iu.test(text)) {
      reasons.push(`${config} 里 identity 写成了 adhoc`)
    }
    if (/forceCodeSigning\s*:\s*false/iu.test(text)) {
      reasons.push(`${config} 关闭了 forceCodeSigning`)
    }
  }
  return reasons
}

/**
 * @typedef {object} SigningIdentity
 * @property {boolean} ok - whether the build may proceed.
 * @property {boolean} required - false on non-macOS (no codesign gate).
 * @property {string} identity - identity name / SHA-1 to pass to codesign.
 * @property {string} source - where it came from.
 * @property {boolean | null} selfSigned - subject === issuer, when inspectable.
 * @property {string[]} problems - why it is not ok.
 * @property {string} guide - the friendly how-to-fix text.
 */

/**
 * Resolve the identity a build MUST use.
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @param {string} [root] - repository root override.
 * @returns {SigningIdentity} resolution result.
 */
export function resolveSigningIdentity(env = process.env, root = repoRoot()) {
  const problems = adhocReasons(env, root)
  const required = process.platform === 'darwin'
  const base = { required, identity: '', selfSigned: /** @type {boolean | null} */ (null), guide: setupGuide() }

  if (problems.length > 0) {
    return { ...base, ok: false, source: 'adhoc-intent', problems }
  }
  if (!required) {
    return { ...base, ok: true, source: 'not-darwin', problems: [] }
  }

  const explicit = String(env.AEK_SIGN_IDENTITY ?? '').trim()
  const identities = listCodeSignIdentities()
  if (explicit.length > 0) {
    const match = identities.find(item => item.name === explicit || item.sha1 === explicit)
    if (match === undefined) {
      return {
        ...base, ok: false, source: 'explicit',
        problems: [`AEK_SIGN_IDENTITY='${explicit}' 在登录钥匙串里找不到。可用的代码签名身份：${identities.map(i => i.name).join(' / ') || '(无)'}`],
      }
    }
    return {
      ...base, ok: true, identity: match.name, source: 'AEK_SIGN_IDENTITY',
      selfSigned: isSelfSigned(match.name), problems: [],
    }
  }

  // Auto-discovery: only a CUSTOM development identity qualifies. Apple-issued
  // "Apple Development: ..." identities are intentionally skipped.
  const custom = identities.filter(item => !APPLE_ISSUED.test(item.name))
  const ranked = [...custom].sort((a, b) => {
    const score = item => PREFERRED.findIndex(pattern => pattern.test(item.name))
    const sa = score(a), sb = score(b)
    return (sa === -1 ? 99 : sa) - (sb === -1 ? 99 : sb)
  })
  const chosen = ranked[0]
  if (chosen === undefined) {
    return {
      ...base, ok: false, source: 'keychain',
      problems: [
        '登录钥匙串里没有「自签名开发证书 / 自定义开发签名身份」，构建会退回 adhoc 签名。',
        `security find-identity -v -p codesigning 找到 ${identities.length} 个身份，但没有一个是自定义开发身份（Apple 签发的已被排除）。`,
      ],
    }
  }
  return {
    ...base, ok: true, identity: chosen.name, source: 'auto-discovered',
    selfSigned: isSelfSigned(chosen.name), problems: [],
  }
}

/**
 * Build-gate entry: fail with a friendly message when the identity is adhoc
 * or missing. Called by verify-build-rules.mjs and packageApp().
 * @param {Record<string, string | undefined>} [env] - environment override.
 * @returns {SigningIdentity} the resolution (also throws on failure).
 * @throws {Error} when the identity is not a self-signed development identity.
 */
export function assertBuildIdentity(env = process.env) {
  const result = resolveSigningIdentity(env)
  if (result.ok) return result
  const lines = [
    '',
    '╭──────────────────────────────────────────────────────────────────────╮',
    '│  编译中止：检测到 adhoc 签名 / 缺少自签名开发证书                    │',
    '╰──────────────────────────────────────────────────────────────────────╯',
    '',
    ...result.problems.map(problem => `  ✗ ${problem}`),
    '',
    ...result.guide.split('\n').map(line => `  ${line}`),
    '',
    '  修好之后重新构建。构建前也可以先跑（只读）：',
    '    node scripts/aek/signing-identity.mjs check',
    '',
  ]
  throw new Error(lines.join('\n'))
}

/** CLI: `check` (default, read-only) / `guide` / `--json`. @returns {number} */
function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  if (args.includes('guide') || args.includes('--help') || args.includes('-h')) {
    console.log(setupGuide())
    return 0
  }
  const result = resolveSigningIdentity()
  if (json) {
    console.log(JSON.stringify(result, null, 2))
    return result.ok ? 0 : 1
  }
  console.log(`platform      : ${process.platform} (${result.required ? 'codesign gate applies' : 'no codesign gate'})`)
  console.log(`identity      : ${result.identity || '(none)'}`)
  console.log(`source        : ${result.source}`)
  console.log(`self-signed   : ${result.selfSigned === null ? 'unknown' : result.selfSigned}`)
  if (!result.ok) {
    console.error('\nsigning-identity: BUILD BLOCKED')
    for (const problem of result.problems) console.error(`  ✗ ${problem}`)
    console.error(`\n${setupGuide()}`)
    return 1
  }
  console.log('signing-identity: OK — custom development identity, never adhoc.')
  return 0
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exit(main())
}
