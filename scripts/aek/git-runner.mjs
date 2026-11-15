#!/usr/bin/env node
/**
 * git-runner.mjs — pick the git executable: the author's local `cqg` wrapper
 * when installed, otherwise bare `git`.
 *
 * `cqg` is a personal operator tool (multi-platform token injection,
 * exclude validation, central state). It is NOT a dependency of this repo
 * and is NOT shipped with it — global clones never have it, so every
 * shipped script must keep working without it. The probe is read-only
 * (`cqg arch`, a diagnostic command) and runs once at import.
 *
 * @module scripts/aek/git-runner
 */
import { spawnSync } from 'node:child_process'

/** @returns {boolean} whether the `cqg` CLI is installed and runnable here. */
export function cqgAvailable() {
  const probe = spawnSync('cqg', ['arch'], { stdio: 'ignore', shell: process.platform === 'win32' })
  return !probe.error && probe.status === 0
}

/**
 * The effective git runner: `cqg git …` when available, bare `git …` when not.
 * @returns {{ cmd: string, prefix: string[], via: string }}
 *   cmd      — executable to spawn
 *   prefix   — args to prepend (['git'] for cqg, [] for bare git)
 *   via      — human label for logs ("cqg git" / "git")
 */
export function gitRunner() {
  return cqgAvailable()
    ? { cmd: 'cqg', prefix: ['git'], via: 'cqg git' }
    : { cmd: 'git', prefix: [], via: 'git' }
}
