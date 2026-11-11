#!/usr/bin/env node
/**
 * AEK Desktop v0 — build TypeScript sources.
 *
 * Usage: node scripts/aek/build.mjs
 */
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { assertBuildRules } from './verify-build-rules.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const root = join(HERE, '..')
let dir = root
for (let i = 0; i < 10; i++) {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break
  const p = dirname(dir)
  if (p === dir) { dir = root; break }
  dir = p
}
const APP_ROOT = join(dir, 'apps', 'aek-desktop', 'v0')
const tsc = join(APP_ROOT, 'node_modules', '.bin', 'tsc')

// Compile-time rules fail the build BEFORE tsc runs (undeclared plugin class,
// adhoc signing intent, A2 plugin in a publish roster).
assertBuildRules()

console.log('[build] compiling TypeScript …')
execSync(`"${tsc}" -p "${join(APP_ROOT, 'tsconfig.json')}"`, { cwd: APP_ROOT, stdio: 'inherit' })
console.log('[build] done')
