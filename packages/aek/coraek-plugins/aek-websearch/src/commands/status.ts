import { Command } from '@oclif/core'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export default class StatusCommand extends Command {
  static description = 'Show current mode and resolved paths'

  override async run() {
    // Package root derived from THIS command file's own location — no hardcoded
    // monorepo path. oclif loads the compiled command from <pkg>/lib/commands/
    // in every mode (dev / npm / installed), so we walk up to the nearest
    // ancestor that owns a package.json to find the package root. This works
    // whether this is a dev checkout, a global pnpm install, or any other
    // install location (the old code hard-split on
    // "/packages/aek/coraek-plugins/aek-websearch", which breaks once the
    // package is installed outside the monorepo).
    const findPkgRoot = (start: string): string => {
      let dir = start
      for (;;) {
        if (existsSync(join(dir, 'package.json'))) return dir
        const parent = dirname(dir)
        if (parent === dir) return start
        dir = parent
      }
    }
    const here = dirname(fileURLToPath(import.meta.url))
    const pkgRoot = findPkgRoot(here)
    const INSTALLED = import.meta.url.includes('/node_modules/')

    const AEK_HOME = process.env.AEK_HOME ?? resolve(homedir(), '.aek')
    const MODE_FILE = join(AEK_HOME, 'aekws-mode')

    let mode = 'dev'
    try { mode = readFileSync(MODE_FILE, 'utf-8').trim() || 'dev' } catch { /* keep dev */ }
    if (INSTALLED) mode = 'installed'

    const DEV_CLI = join(pkgRoot, 'bin', 'aekws.mjs')
    const LOCAL_BIN = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? resolve(homedir(), 'AppData', 'Local'), 'bin')
      : join(homedir(), '.local', 'bin')
    const NPM_GLOBAL_BIN = process.env.NPM_PREFIX
      ? join(process.env.NPM_PREFIX, 'bin', 'aekws')
      : join(homedir(), '.npm-global', 'bin', 'aekws')

    console.log(`Mode: ${mode}`)
    console.log(`AEK_HOME: ${AEK_HOME}`)
    console.log(`Package root: ${pkgRoot}`)
    console.log(`Mode file:    ${MODE_FILE} ${existsSync(MODE_FILE) ? '✓' : '✗ (default: dev)'}`)
    console.log(`CLI bin:      ${DEV_CLI} ${existsSync(DEV_CLI) ? '✓' : '✗ (missing)'}`)
    console.log(`Local bin: ${LOCAL_BIN} (${existsSync(LOCAL_BIN) ? '✓' : '✗'})`)
    console.log(`NPM CLI:   ${NPM_GLOBAL_BIN} ${existsSync(NPM_GLOBAL_BIN) ? '✓' : '✗ (not installed)'}`)
  }
}
