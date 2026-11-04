#!/usr/bin/env node
// AEK launcher — runs the (dsh-derived) CLI under an ISOLATED DSH_HOME so it
// never touches the real DeepSeek Harness data at ~/.dsh.
//
// Default DSH_HOME = ~/.aek (AEK's own profiles/logs/cordis.patch.yml/storage).
// Override with the DSH_HOME env var if you need a different isolated home.
//
// This is AEK's thin layer over the faithful dsh copy: zero source changes to
// dsh packages, isolation purely via environment. See
//   my-skills/aek-dev-notes/references/20261022-忠实全量复制重启-策略决策.md
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
process.env.DSH_HOME ??= join(process.env.HOME ?? '/tmp', '.aek')
process.env.DSH_BUILD_FACE ??= 'host' // match dsh's build face default for runtime

const bin = join(root, 'apps/cli/lib/bin.js')
const res = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})
process.exit(res.status ?? (res.error ? 1 : 0))
