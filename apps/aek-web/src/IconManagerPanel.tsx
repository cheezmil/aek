/**
 * The icon manager panel (IV round, user ask: "list every frontend icon,
 * click to copy, tick several to copy together — so the user can point the
 * icons at an agent").
 *
 * Interaction follows the mature Lucide-docs pattern (verified via aekws,
 * 2026-11-17): a wall of glyph tiles, one click = the usage snippet lands on
 * the clipboard, plus multi-select + a bulk copy for agent handoff.
 *
 * The data is the host's own registry (`Icons.tsx` — Lucide stroke-style
 * 24×24 glyphs), so the panel is always in sync with what the console
 * actually renders; no icon runtime, no extra package.
 *
 * @module @cheezmil/aek-web/src/IconManagerPanel
 */
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon, ICON_NAMES, type IconName } from './Icons.tsx'
import { PanelCard } from './ui-kit.tsx'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useI18n } from './i18n.tsx'

/** One unified outer-card body (32px, IV-round scale). */
const BODY = 'p-8'
/** The section-title style shared by every panel (accent bar, mt-8 mb-4 pl-3). */
const TITLE = 'relative mb-4 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[""] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary'

/** @param name - one registry name. @param t - the i18n `tf` interpolator. @returns the agent-handoff line. */
function usageLine(name: IconName, tf: (key: string, vars?: Record<string, string | number>) => string): string {
  return tf('icons.usageLine', { name })
}

/**
 * Copy text to the clipboard. The Electron shell serves the webui from a
 * localhost origin (a secure context), so the async Clipboard API is always
 * available; a failed write simply reports false to the caller.
 * @param text - the snippet. @returns whether the write succeeded.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function IconManagerPanel(): ReactNode {
  const { t, tf } = useI18n()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<IconName>>(new Set())
  /** The tile whose copy just happened (the transient "copied" mark). */
  const [copied, setCopied] = useState<IconName | undefined>(undefined)
  const [bulkCopied, setBulkCopied] = useState(false)
  const copyTimer = useRef<number | undefined>(undefined)

  const needle = query.trim().toLowerCase()
  const names = useMemo(
    () => ICON_NAMES.filter(name => needle.length === 0 || name.toLowerCase().includes(needle)),
    [needle])

  const header = tf('icons.usageHeader')

  /** @param icon - the clicked tile. Copies its one-icon snippet. */
  const copyOne = async (icon: IconName): Promise<void> => {
    const ok = await copyText(`${header}\n${usageLine(icon, tf)}`)
    if (ok) {
      setCopied(icon)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(undefined) }, 1200)
    }
  }

  /** Copies the whole bulk block for every ticked icon. */
  const copySelected = async (): Promise<void> => {
    const chosen = Array.from(selected)
    if (chosen.length === 0) return
    const ok = await copyText([header, ...chosen.map(name => usageLine(name, tf))].join('\n'))
    if (ok) {
      setBulkCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setBulkCopied(false) }, 1200)
    }
  }

  /** @param icon - toggle one tile's tick. */
  const toggle = (icon: IconName): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(icon)) next.delete(icon)
      else next.add(icon)
      return next
    })
  }

  return (
    <PanelCard>
      <div className={BODY}>
        <h2 className={TITLE}>{t('panel.icons')}</h2>
        <p className="mb-4 pl-3 text-xs-plus text-text-muted">{t('icons.desc')}</p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => { setQuery(event.target.value) }}
            placeholder={t('icons.search')}
            className="h-8 flex-1 min-w-40 max-w-80 text-xs"
          />
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => { setSelected(new Set(names)) }}>{t('icons.selectAll')}</Button>
            <Button size="sm" variant="ghost" disabled={selected.size === 0} onClick={() => { setSelected(new Set()) }}>{t('icons.clear')}</Button>
            <Button size="sm" disabled={selected.size === 0} onClick={() => { void copySelected() }}>
              {bulkCopied ? t('icons.copied') : `${t('icons.copySelected')}${selected.size > 0 ? ` (${String(selected.size)})` : ''}`}
            </Button>
          </div>
        </div>
        {names.length === 0
          ? <p className="p-4 text-xs-plus text-text-muted">{t('icons.empty')}</p>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-9 gap-2">
              {names.map((name) => {
                const ticked = selected.has(name)
                const justCopied = copied === name
                return (
                  <div
                    key={name}
                    role="button"
                    tabIndex={0}
                    aria-label={name}
                    onClick={() => { void copyOne(name) }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void copyOne(name) }
                    }}
                    className={[
                      'group relative flex cursor-pointer flex-col items-center gap-1.5 rounded-sm border bg-surface-subtle p-3 transition duration-120 ease-aek',
                      ticked || justCopied ? 'border-primary bg-accent-soft' : 'border-border hover:border-input',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      aria-label={`${name} (select)`}
                      checked={ticked}
                      onChange={() => { toggle(name) }}
                      onClick={(event) => { event.stopPropagation() }}
                      className="absolute right-1.5 top-1.5 size-3.5 accent-primary"
                    />
                    <Icon name={name} size={22} />
                    <span className="w-full truncate text-center font-mono text-xs text-text-secondary">{name}</span>
                    {justCopied
                      ? <span className="text-2xs font-semibold text-primary">{t('icons.copied')}</span>
                      : <span className="text-2xs text-transparent selection:bg-accent-soft">·</span>}
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </PanelCard>
  )
}
