/**
 * 运行时 — the numbered coraek runtime view (S round, merged into the
 * 插件与程序 card by the T round).
 *
 * Runtime 1 is always the shared host runtime (this console's own process);
 * runtimes 2..N are the isolated capability processes. Every number, pid,
 * label and memory reading is host-resolved (`GET /api/aek/runtimes`) — the
 * client only renders.
 *
 * T round changes:
 * - The block is EMBEDDED in the 插件与程序 card (no standalone section):
 *   the per-plugin "所驻插件" table is gone — each plugin row of the roster
 *   carries its own runtime line (InfoPanels).
 * - The per-OS memory wording: `win32` reports a **working set** reading,
 *   `darwin` / `linux` report **RSS** — the term is chosen from the host's
 *   `process.platform` (the snapshot carries it) and the hint explains the
 *   term, instead of the old unexplained "RSS".
 * - The add row takes a capability (isolatable list) + an OPTIONAL custom
 *   runtime name; a blank name keeps the capability id (persisted as the
 *   label on the host).
 *
 * The block hides itself when the host has no route (an older build):
 * `useRuntimes` reports `unsupported` and this component renders nothing.
 *
 * @module @cheezmil/aek-web/src/RuntimesPanel
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './i18n.tsx'
import { css, cx } from './styles.ts'
import type { RuntimeRow } from './useRuntimes.ts'
import { useRuntimes } from './useRuntimes.ts'

/** Format one byte reading as a quiet `xx.x MB` (or the unknown marker). */
export function fmtBytes(bytes?: number): string {
  return bytes === undefined ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** One runtime row: number, kind, label (inline rename), state, memory, actions. */
function RuntimeRowView({ row, host, term, onRename, onRemove, busy }: {
  row: RuntimeRow
  host: boolean
  term: string
  onRename: (id: string, label: string) => void
  onRemove: (id: string) => void
  busy: string | undefined
}): ReactNode {
  const { t } = useI18n()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const stateClass = row.state === 'running' ? css.rtStateRunning : css.rtStateStopped
  const memoryText = host
    ? `${term} ${fmtBytes(row.memory?.rss)} · ${t('runtimes.memHeap')} ${fmtBytes(row.memory?.heapUsed)}`
    : `${term} ${fmtBytes(row.memory?.rss)}`
  return (
    <li className={css.rtRow}>
      <span className={css.rtNumber}>{String(row.number)}</span>
      <span className={cx(css.rtChip, host ? css.rtStateRunning : undefined)}>{t(host ? 'runtimes.kind.host' : 'runtimes.kind.isolated')}</span>
      {renaming && row.id !== undefined ? (
        <>
          <input
            className={css.rtLabelInput}
            value={draft}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onRename(row.id as string, draft.trim())
                setRenaming(false)
              }
              if (event.key === 'Escape') setRenaming(false)
            }}
            aria-label={row.id}
          />
          <button type="button" className={css.iconButton} onClick={() => { onRename(row.id as string, draft.trim()); setRenaming(false) }}>✓</button>
          <button type="button" className={css.iconButton} onClick={() => { setRenaming(false) }}>✕</button>
        </>
      ) : (
        <span className={css.rtLabel} title={row.label}>{row.label}</span>
      )}
      <span className={cx(css.rtState, stateClass)}>{t(row.state === 'running' ? 'runtimes.state.running' : 'runtimes.state.stopped')}</span>
      <span className={css.rtMem}>{memoryText} · pid {row.pid ?? '—'}</span>
      {!host && row.id !== undefined ? (
        <span className={css.rtActions}>
          <button
            type="button"
            className={css.iconButton}
            title={t('runtimes.remove')}
            onClick={() => { setDraft(row.label); setRenaming(true) }}
            disabled={busy !== undefined}
          >✎</button>
          <button
            type="button"
            className={cx(css.iconButton, css.chipOff)}
            title={t('runtimes.remove')}
            onClick={() => {
              if (window.confirm(`${t('runtimes.removeConfirm')} ${row.id}`)) onRemove(row.id as string)
            }}
            disabled={busy !== undefined}
          >×</button>
        </span>
      ) : null}
    </li>
  )
}

/**
 * The embedded runtime block: the numbered rows, the add row (capability +
 * optional custom name) and the per-OS hint. Rendered INSIDE the 插件与程序
 * card (T round), never as a standalone section.
 * @param refreshSignal - a number bump re-reads the snapshot.
 * @returns the block (or nothing on an older host).
 */
export function RuntimesBlock({ refreshSignal }: { refreshSignal: number }): ReactNode {
  const { t } = useI18n()
  const { snapshot, unsupported, busy, addRuntime, removeRuntime, renameRuntime } = useRuntimes(refreshSignal)
  const [pendingAdd, setPendingAdd] = useState('')
  const [pendingName, setPendingName] = useState('')
  if (unsupported || snapshot === undefined) return null
  const rows = [snapshot.host, ...snapshot.runtimes]
  const isWin32 = snapshot.platform === 'win32'
  const hint = isWin32 ? t('runtimes.hint.win32') : t('runtimes.hint.posix')
  const term = isWin32 ? t('runtimes.memTerm.win32') : t('runtimes.memTerm.posix')
  return (
    <div className={css.rtBlock}>
      <div className={css.hint}>{hint}</div>
      <ul className={css.rtList}>
        {rows.map(row => (
          <RuntimeRowView
            key={row.kind === 'host' ? 'host' : (row.id as string)}
            row={row}
            host={row.kind === 'host'}
            term={term}
            onRename={(id, label) => { void renameRuntime(id, label) }}
            onRemove={(id) => { void removeRuntime(id) }}
            busy={busy}
          />
        ))}
      </ul>
      {snapshot.runtimes.length === 0 ? <div className={css.rtEmpty}>{t('runtimes.empty')}</div> : null}
      <div className={css.rtAddRow}>
        <select
          className={css.rtSelect}
          value={pendingAdd}
          onChange={(event) => { setPendingAdd(event.target.value) }}
          aria-label={t('runtimes.add')}
        >
          <option value="">{t('runtimes.add')}…</option>
          {snapshot.isolatable.map(id => <option key={id} value={id}>{id}</option>)}
        </select>
        <input
          className={css.rtNameInput}
          value={pendingName}
          onChange={(event) => { setPendingName(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && pendingAdd !== '' && busy === undefined) {
              if (window.confirm(t('runtimes.addConfirm'))) void addRuntime(pendingAdd, pendingName)
              setPendingAdd('')
              setPendingName('')
            }
          }}
          placeholder={t('runtimes.addNamePlaceholder')}
          aria-label={t('runtimes.addNamePlaceholder')}
        />
        <button
          type="button"
          className={css.iconButton}
          title={t('runtimes.add')}
          disabled={pendingAdd === '' || busy !== undefined}
          onClick={() => {
            if (pendingAdd === '') return
            if (window.confirm(t('runtimes.addConfirm'))) void addRuntime(pendingAdd, pendingName)
            setPendingAdd('')
            setPendingName('')
          }}
        >＋</button>
      </div>
    </div>
  )
}
