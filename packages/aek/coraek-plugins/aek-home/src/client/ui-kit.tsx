/**
 * Small shared building blocks for the AEK console panels.
 *
 * One rule the user repeated (2026-11-09): EVERY list is an UNORDERED list.
 * The helpers here render `<ul>/<li>` only; there is no `<ol>` anywhere in the
 * console. Copy buttons, spinners, loading bars and the in-page search box are
 * shared so the runtime, settings, skills, prompts and websearch surfaces
 * look and behave identically. There is deliberately NO progress bar: the
 * user asked for spinners only (2026-11-09 round).
 *
 * @module @cheezmil/aek-home/src/client/ui-kit
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'

/** Props for {@link CopyButton}. */
export interface CopyButtonProps {
  /** Text placed on the clipboard. Ignored when `resolve` is given. */
  value?: string
  /**
   * R4: resolve the literal ONLY when the user clicks copy. Used for masked
   * key rows — the plaintext is fetched through the reveal channel on demand
   * and never rendered, so the copy icon can exist without exposing the key.
   */
  resolve?: () => Promise<string | undefined>
  /** Accessible label (i18n already resolved by the caller). */
  label: string
  /** Icon size. */
  size?: number
  /** Extra class names. */
  className?: string
}

/**
 * Copy one value to the clipboard. The icon flips to a check for a moment so
 * the user sees the action succeeded without a toast / alert.
 * @param props - value / resolver, label and optional size / class.
 * @returns the button.
 */
export function CopyButton({ value, resolve, label, size = 14, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button
      type="button"
      className={cx(css.iconButton, className)}
      title={label}
      aria-label={label}
      onClick={() => {
        void (async () => {
          const text = resolve !== undefined ? await resolve() : value
          if (text === undefined || text.length === 0) return
          await navigator.clipboard?.writeText(text)
          setCopied(true)
        })().catch(() => { /* clipboard or reveal may be blocked */ })
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={size} />
    </button>
  )
}

/**
 * A rotating spinner. Used for every refresh / load so the console never
 * shows a bare "loading…" line of text.
 * @param props.label - optional accessible label.
 * @returns the spinner element.
 */
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n()
  return (
    <span className={css.spinnerWrap} role="status" aria-label={label ?? t('common.loading')}>
      <span className={cx(css.spinnerRing, css.spinning)} />
    </span>
  )
}

/** Props for {@link PanelSearch}. */
export interface PanelSearchProps {
  /** Current query. */
  value: string
  /** Update the query. */
  onChange: (next: string) => void
  /** Input placeholder (already translated). */
  placeholder: string
  /** Number of matches shown beside the box; `undefined` hides it. */
  count?: number | undefined
}

/**
 * The search box at the TOP of a content panel (Web Search / Settings / ...).
 * It filters the PAGE content, not the sidebar navigation.
 * @param props - query, setter, placeholder and optional hit count.
 * @returns the search field.
 */
export function PanelSearch({ value, onChange, placeholder, count }: PanelSearchProps) {
  const { t } = useI18n()
  return (
    <div className={css.panelSearchWrap}>
      <div className={css.navSearchWrap}>
        <span className={css.navSearchIcon}><Icon name="search" size={16} /></span>
        <input
          className={css.navSearchInput}
          type="search"
          value={value}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={event => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onChange('') }}
        />
        {value.length > 0
          ? (
            <button
              type="button"
              className={css.navSearchClear}
              onClick={() => onChange('')}
              title={t('nav.clear')}
              aria-label={t('nav.clear')}
            >
              <Icon name="close" size={14} />
            </button>
          )
          : null}
      </div>
      {count !== undefined
        ? <span className={css.panelSearchCount}>{String(count)}</span>
        : null}
    </div>
  )
}

/** Props for {@link PanelCard}. */
export interface PanelCardProps {
  /** Card heading. */
  title: string
  /** Optional subtitle. */
  subtitle?: string
  /** Optional header actions (refresh, copy, ...). */
  actions?: ReactNode
  /** Card content. */
  children: ReactNode
}

/**
 * A consistent surface for every management panel.
 * @param props - headings, actions and content.
 * @returns the card.
 */
export function PanelCard({ title, subtitle, actions, children }: PanelCardProps) {
  return (
    <section className={css.card}>
      <header className={css.cardHeader}>
        <div>
          <h2 className={css.cardTitle}>{title}</h2>
          {subtitle !== undefined ? <p className={css.cardSubtitle}>{subtitle}</p> : null}
        </div>
        {actions !== undefined ? <div className={css.cardActions}>{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

/** Props for {@link ToggleSwitch}. */
export interface ToggleSwitchProps {
  /** Current state. */
  checked: boolean
  /** Called with the NEXT state when the user flips it. */
  onChange: (next: boolean) => void
  /** Accessible label AND hover tooltip (i18n already resolved). */
  label: string
  /** Renders locked: the state is shown but cannot be changed. */
  locked?: boolean
  /** Extra class names. */
  className?: string
}

/**
 * A real on/off switch.
 *
 * The user rejected the old pair of check / cross icon buttons (2026-11-09):
 * a switch states the CURRENT state and the single action in one control,
 * instead of offering "enable" and "disable" as two parallel buttons where
 * one of them is always a no-op. `role="switch"` keeps it keyboard reachable
 * (Space / Enter) and correctly announced by screen readers.
 *
 * @param props - state, change handler, label and the `locked` variant.
 * @returns the switch.
 */
export function ToggleSwitch({ checked, onChange, label, locked = false, className }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={locked}
      className={cx(css.toggleSwitch, checked && css.toggleOn, locked && css.toggleLocked, className)}
      onClick={() => { if (!locked) onChange(!checked) }}
    >
      <span className={css.toggleThumb} aria-hidden="true" />
    </button>
  )
}

/** One capability tag value. */
export interface Capabilities {
  backend: boolean
  cli: boolean
  mcp: boolean
}

/**
 * Render the three capability tags for a plugin (backend process / CLI / MCP).
 * @param props.caps - tags derived from the manifest on the host.
 * @returns an unordered list of tags.
 */
export function CapabilityTags({ caps }: { caps: Capabilities }) {
  const { t } = useI18n()
  const rows: Array<{ key: string; on: boolean }> = [
    { key: t('plugins.cap.backend'), on: caps.backend },
    { key: t('plugins.cap.cli'), on: caps.cli },
    { key: t('plugins.cap.mcp'), on: caps.mcp },
  ]
  return (
    <ul className={css.tagList}>
      {rows.map(row => (
        <li key={row.key} className={cx(css.capTag, row.on && css.capTagOn)}>{row.key}</li>
      ))}
    </ul>
  )
}

/** Props for {@link BulletList}. */
export interface BulletListProps {
  /** Rows; each is already a rendered node. */
  items: readonly { id: string; content: ReactNode }[]
  /** Extra class names. */
  className?: string
}

/**
 * The ONLY list primitive used by the console: an unordered `<ul>`.
 * @param props - rows and optional class.
 * @returns the list.
 */
export function BulletList({ items, className }: BulletListProps) {
  return (
    <ul className={cx(css.bulletList, className)}>
      {items.map(item => <li key={item.id} className={css.bulletItem}>{item.content}</li>)}
    </ul>
  )
}
