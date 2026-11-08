import { Command, Args } from '@oclif/core'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { resolveAekHome } from '@cheezmil/coraek/home'

const AEK_HOME = resolveAekHome()
const MODE_FILE = join(AEK_HOME, 'aekws-mode')

export default class UseCommand extends Command {
  static description = 'Set default mode (dev or npm)'
  static args = {
    mode: Args.string({ description: 'Mode: dev or npm', required: true }),
  }

  override async run() {
    const { args } = await this.parse(UseCommand)
    const mode = args.mode
    if (!['dev', 'npm'].includes(mode)) this.error('Mode must be "dev" or "npm"')
    const dir = dirname(MODE_FILE)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(MODE_FILE, mode + '\n')
    console.log(`Default mode set to: ${mode}`)
  }
}
