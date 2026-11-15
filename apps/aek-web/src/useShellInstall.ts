/**
 * X5: the install self-check state, fed by the desktop shell's preload bridge
 * (`window.aekShell`). The hook is inert outside the shell — `available`
 * stays false and nothing renders; a plain browser shows no checklist card.
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

/**
 * @returns `available` = running inside the shell; `status`/`result`/`pending`
 * plus `refresh` and `install` to drive the card.
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
