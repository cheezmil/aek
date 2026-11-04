import { Command } from '@oclif/core'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'

export default class StatusCommand extends Command {
  static description = 'Show current mode and paths'

  override async run() {
    const AEK_HOME = process.env.AEK_HOME ?? resolve(homedir(), '.aek')
    const MODE_FILE = join(AEK_HOME, 'aekws-mode')
    const REPO_ROOT = join(import.meta.url.replace('file://', '').split('/packages/aek/coraek-plugins/aek-websearch')[0], '')
    const LOCAL_BIN = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData', 'Local'), 'bin')
      : join(homedir(), '.local', 'bin')
    const DEV_CLI = join(REPO_ROOT, 'packages/aek/coraek-plugins/aek-websearch/bin/aekws.mjs')
    const NPM_GLOBAL_BIN = process.env.NPM_PREFIX
      ? join(process.env.NPM_PREFIX, 'bin', 'aekws')
      : join(homedir(), '.npm-global', 'bin', 'aekws')

    let mode = 'dev'
    try { mode = readFileSync(MODE_FILE, 'utf-8').trim() || 'dev' } catch { /* keep dev */ }

    console.log(`Mode: ${mode}`)
    console.log(`Repo root: ${REPO_ROOT}`)
    console.log(`Local bin: ${LOCAL_BIN} (${existsSync(LOCAL_BIN) ? '✓' : '✗'})`)
    console.log(`Dev CLI:   ${DEV_CLI} ${existsSync(DEV_CLI) ? '✓' : '✗ (missing)'}`)
    console.log(`NPM CLI:   ${NPM_GLOBAL_BIN} ${existsSync(NPM_GLOBAL_BIN) ? '✓' : '✗ (not installed)'}`)
  }
}
