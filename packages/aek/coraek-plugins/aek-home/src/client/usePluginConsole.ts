/**
 * Front-end state for the Prompt Manager / Skill Manager command consoles.
 *
 * The command catalogue and every execution go through the host bridge
 * `/api/aek/plugin-console`; the client never spawns a process and never
 * hardcodes a CLI path. Mutating commands need an explicit confirmation flag,
 * which the UI turns into a checkbox the user must tick.
 *
 * @module @cheezmil/aek-home/src/client/usePluginConsole
 */
import { useCallback, useEffect, useState } from 'react'

/** Host route publishing the complete command catalogue. */
export const PLUGIN_CONSOLE_API = '/api/aek/plugin-console'
/** Host route running one whitelisted command. */
export const PLUGIN_CONSOLE_RUN_API = '/api/aek/plugin-console/run'

/** One CLI command exposed by a manager plugin. */
export interface ConsoleCommand {
  name: string
  args: string[]
  label: string
  mutating: boolean
}

/** One manager plugin's catalogue entry. */
export interface ManagerPlugin {
  id: string
  packageName: string
  cli: string
  version: string
  distribution: string
  languages: string[]
  primaryLanguage: string
  bin: string
  binSource: string
  available: boolean
  commands: ConsoleCommand[]
}

/** The catalogue payload. */
export interface ConsoleCatalog {
  plugins: ManagerPlugin[]
  generatedAt: string
}

/** Result of one CLI invocation. */
export interface CommandResult {
  plugin: string
  command: string[]
  mutating: boolean
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
  bin: string
  timedOut?: boolean
  code?: string
  message?: string
}

/** Live console state. */
export interface PluginConsoleState {
  catalog: ConsoleCatalog | undefined
  loading: boolean
  error: string | undefined
  refresh: () => void
  running: boolean
  result: CommandResult | undefined
  run: (plugin: string, command: string[], confirm: boolean) => Promise<void>
  clear: () => void
}

/** @returns live state for the manager consoles. */
export function usePluginConsole(): PluginConsoleState {
  const [catalog, setCatalog] = useState<ConsoleCatalog | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<CommandResult | undefined>(undefined)
  const [tick, setTick] = useState(0)

  const refresh = useCallback(() => setTick(value => value + 1), [])

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(PLUGIN_CONSOLE_API, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json() as ConsoleCatalog & { message?: string }
        if (!response.ok) throw new Error(body.message ?? `HTTP ${String(response.status)}`)
        return body
      })
      .then((body) => {
        if (!active) return
        setCatalog(body)
        setError(undefined)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : String(cause))
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tick])

  const run = useCallback(async (plugin: string, command: string[], confirm: boolean) => {
    setRunning(true)
    setError(undefined)
    try {
      const response = await fetch(PLUGIN_CONSOLE_RUN_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plugin, command, confirm }),
      })
      const body = await response.json() as CommandResult & { message?: string }
      if (body.code !== undefined && body.exitCode === undefined) {
        setError(body.message ?? 'command rejected')
        setResult(undefined)
      } else {
        setResult(body)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRunning(false)
    }
  }, [])

  const clear = useCallback(() => { setResult(undefined); setError(undefined) }, [])

  return { catalog, loading, error, refresh, running, result, run, clear }
}
