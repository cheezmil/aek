/**
 * X5: the install self-check state, fed by the desktop shell's preload bridge
 * (`window.aekShell`). The hook is inert outside the shell — `available`
 * stays false and nothing renders; a plain browser shows no checklist card.
 * X5b: the rows table moved here from InfoPanels so the /setup wizard and
 * any future surface share ONE definition.
 */
import { useCallback, useEffect, useState } from 'react'

export type ShellInstallStatus = NonNullable<Window['aekShell']> extends {
  getInstallStatus: () => Promise<infer S>
}
  ? S
  : never

export interface ShellInstallResult {
  ok: boolean
  tool: string
  output: string
}

/** The status field each row reads; `pkg` (when set) makes the row installable. */
export type ShellInstallField = 'node' | 'pnpm' | 'npm' | 'aek' | 'aekpm' | 'aekws' | 'aeksm'

export const SHELL_INSTALL_ROWS: {
  key: string
  labelKey: string
  field: ShellInstallField
  fallback?: ShellInstallField
  pkg?: string
}[] = [
  { key: 'node', labelKey: 'about.shellInstall.node', field: 'node' },
  { key: 'pkgMgr', labelKey: 'about.shellInstall.pkgMgr', field: 'pnpm' },
  { key: 'aek', labelKey: 'about.shellInstall.cli', field: 'aek', pkg: '@cheezmil/coraek' },
  { key: 'aekpm', labelKey: 'about.shellInstall.prompt', field: 'aekpm', pkg: '@cheezmil/aek-prompt-manager' },
  { key: 'aekws', labelKey: 'about.shellInstall.websearch', field: 'aekws', pkg: '@cheezmil/aek-websearch' },
  { key: 'aeksm', labelKey: 'about.shellInstall.skill', field: 'aeksm', pkg: '@cheezmil/aek-skill-manager' },
]

/** The read-only runtime rows (Node / package manager) — no checkbox. */
export const RUNTIME_ROWS: typeof SHELL_INSTALL_ROWS[number][] = SHELL_INSTALL_ROWS.slice(0, 2)
/** The installable component rows (the wizard's section 2). */
export const COMPONENT_ROWS: typeof SHELL_INSTALL_ROWS[number][] = SHELL_INSTALL_ROWS.slice(2)

/** The installable packages still missing per the last probe (empty = all ready). */
export function missingPackages(status: ShellInstallStatus | undefined): string[] {
  return SHELL_INSTALL_ROWS
    .filter(row => row.pkg !== undefined && (status === undefined || status[row.field] === undefined))
    .map(row => row.pkg as string)
}

/**
 * @returns `available` = running inside the shell; `status`/`result`/`pending`
 * plus `refresh` and `install` to drive the setup surfaces.
 */
export function useShellInstall() {
  const available = window.aekShell !== undefined
  const [status, setStatus] = useState<ShellInstallStatus | undefined>(undefined)
  const [result, setResult] = useState<ShellInstallResult | undefined>(undefined)
  const [pending, setPending] = useState(false)

  const refresh = useCallback(async () => {
    if (!window.aekShell) return
    try {
      setStatus(await window.aekShell.getInstallStatus())
    } catch {
      setStatus(undefined)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const install = useCallback(
    async (packages: string[]) => {
      if (!window.aekShell) return
      setPending(true)
      setResult(undefined)
      try {
        setResult(await window.aekShell.installSelected(packages))
      } finally {
        setPending(false)
        void refresh()
      }
    },
    [refresh],
  )

  return { available, status, result, pending, refresh, install }
}
