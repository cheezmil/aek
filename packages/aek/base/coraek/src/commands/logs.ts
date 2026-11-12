/**
 * `aek logs` — read the built-in text logs of one or both slots.
 *
 * T round: the operator-facing half of the logging system. Everything the
 * shell (Electron main + captured renderer console) and the web host record
 * lands in `<slotHome(slot)>/logs/` as plain text (`@cheezmil/coraek/
 * logging`); this command is how a global user or developer diagnoses an
 * incident — white screen, crash, boot failure — from text alone, on any
 * platform, with no GUI tooling and no screenshots.
 *
 * Log surfaces per slot:
 *   - `desktop`  — shell main process + captured renderer console events
 *                  (`desktop.log`, plain-text lines from electron-log)
 *   - `web-host` — structured web-host lines (`web-host.log`, pino JSON
 *                  lines: boot context and child lifecycle), rendered to
 *                  text by this command
 *   - `web`      — raw stdout/stderr of the web process (`web.log`,
 *                  `web.err.log` — console output and crash traces)
 *
 * @module @cheezmil/coraek/commands/logs
 */

import { Command, Flags } from '@oclif/core'
import { readFile } from 'node:fs/promises'
import { readLogTail, followLog } from '../../logging.mjs'
import { slotHome } from '../../slots.mjs'

const SLOT_OPTIONS = ['aek', 'next', 'all'] as const
const SOURCE_OPTIONS = ['desktop', 'web', 'all'] as const
const RAW_CONSOLE_FILES = ['web.log', 'web.err.log'] as const

/** pino level numbers (web-host.log lines) to words. */
const PINO_LEVELS: Record<number, string> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' }
/** Keys that are pino envelope, not operator content. */
const PINO_ENVELOPE = new Set(['level', 'time', 'msg', 'pid', 'hostname', 'v'])

/**
 * Render one pino JSON line (`web-host.log`) into the shared text shape:
 * `ISO LEVEL message k=v …` (the `aek logs` surface prefix names the
 * source). Non-JSON lines pass through raw.
 * @param line - one raw line of `web-host.log`.
 * @returns the display line (or the raw line when it is not pino JSON).
 */
function renderWebHostLine(line: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return line
  }
  const obj = parsed as Record<string, unknown>
  const msg = String(obj.msg ?? '')
  const level = PINO_LEVELS[Number(obj.level)] ?? String(obj.level ?? '?').toUpperCase()
  const time = typeof obj.time === 'number' ? new Date(obj.time).toISOString() : String(obj.time ?? '')
  const kv = Object.entries(obj)
    .filter(([k, v]) => !PINO_ENVELOPE.has(k) && v !== undefined)
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join(' ')
  return `${time} ${level.padEnd(5)} ${msg}${kv ? ` ${kv}` : ''}`
}

interface Surface {
  surface: string
  lines: string[]
}

/**
 * Read the newest `maxLines` lines of the raw console files (no structured
 * prefix — they are stdout/stderr redirects).
 */
async function rawConsoleTail(slot: string, maxLines: number, grep?: string): Promise<string[]> {
  const out: string[] = []
  for (const f of RAW_CONSOLE_FILES) {
    try {
      const text = await readFile(`${slotHome(slot)}/logs/${f}`, 'utf8')
      const lines = text.split('\n').filter(l => l.trim() !== '')
      out.push(...(grep ? lines.filter(l => l.includes(grep)) : lines).slice(-maxLines))
    } catch {
      // file absent yet — nothing to show
    }
  }
  return out
}

/** Read one slot's selected surfaces, newest-first within each surface. */
async function collect(slot: string, source: string, tail: number, level: string, grep?: string): Promise<Surface[]> {
  const out: Surface[] = []
  if (source === 'desktop' || source === 'all') {
    out.push({ surface: 'desktop', lines: await readLogTail({ slot, source: 'desktop', maxLines: tail, level, grep }).catch(() => []) })
  }
  if (source === 'web' || source === 'all') {
    out.push({ surface: 'web-host', lines: await readLogTail({ slot, source: 'web-host', maxLines: tail, level, grep, scheme: 'numbered', render: renderWebHostLine }).catch(() => []) })
    out.push({ surface: 'web', lines: await rawConsoleTail(slot, tail, grep) })
  }
  return out
}

export default class LogsCommand extends Command {
  static override description = 'Read the built-in text logs of the shell and web host (no GUI tooling required)'

  static override strict = true

  static override examples = [
    '<%= config.bin %> logs',
    '<%= config.bin %> logs --slot next --source all --tail 200',
    '<%= config.bin %> logs --follow --grep 1685',
  ]

  static override flags = {
    slot: Flags.string({
      description: 'slot to read: `aek` (current) | `next` (dev) | `all`',
      options: SLOT_OPTIONS,
      default: 'aek',
    }),
    source: Flags.string({
      description: 'log surfaces: `desktop` (shell) | `web` (host structured + raw console) | `all`',
      options: SOURCE_OPTIONS,
      default: 'all',
    }),
    tail: Flags.integer({
      description: 'maximum lines per surface',
      default: 100,
    }),
    level: Flags.string({
      description: 'minimum level for structured lines',
      options: ['debug', 'info', 'warn', 'error'],
      default: 'debug',
    }),
    grep: Flags.string({
      description: 'only lines containing this literal substring',
    }),
    follow: Flags.boolean({
      description: 'keep printing new lines from the structured surfaces',
    }),
  }

  override async run(): Promise<void> {
    const { flags } = await this.parse(LogsCommand)
    const slots = flags.slot === 'all' ? ['aek', 'next'] : [flags.slot]
    const prefix = (slot: string, surface: string): string =>
      slots.length > 1 ? `[${slot}:${surface}]` : `[${surface}]`

    for (const slot of slots) {
      for (const { surface, lines } of await collect(slot, flags.source, flags.tail, flags.level, flags.grep)) {
        for (const l of lines) process.stdout.write(`${prefix(slot, surface)} ${l}\n`)
      }
    }

    if (flags.follow) {
      this.debug(`following ${slots.join(', ')}`)
      await Promise.all(
        slots.map(slot =>
          Promise.allSettled([
            (flags.source === 'desktop' || flags.source === 'all') ? followLog({ slot, source: 'desktop', onLine: l => process.stdout.write(`${prefix(slot, 'desktop')} ${l}\n`) }) : undefined,
            (flags.source === 'web' || flags.source === 'all') ? followLog({ slot, source: 'web-host', scheme: 'numbered', onLine: l => process.stdout.write(`${prefix(slot, 'web-host')} ${renderWebHostLine(l)}\n`) }) : undefined,
          ]),
        ),
      )
    }
  }
}
