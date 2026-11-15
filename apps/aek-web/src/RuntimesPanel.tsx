/**
 * 运行时 — the v2 multi-tenant runtime view (X2: merged into the 插件与程序
 * card by the T round, re-modelled by the X2 round).
 *
 * Runtimes are FIRST-CLASS CONTAINERS: `runtime0` is the shared host process
 * (this console's own process), `runtime1..N` are the isolated containers and
 * SEVERAL plugins may live in one container. Every number, pid, label and
 * memory reading is host-resolved (`GET /api/aek/runtimes`) — the client only
 * renders.
 *
 * X2 changes:
 * - The kind chip ("宿主共享" / "独立进程") is gone: the number + the state
 *   dot already say what a row is, and the host row is `runtime0`, full stop
 *   (never "coraek host").
 * - The add row is a bare NAME input + ＋ (no capability picker, no native
 *   confirmation): a blank name auto-iterates `runtime{n}`; the name is
 *   persisted as the label on the host.
 * - Deleting a container is an INLINE floating confirm (the unified page
 *   surface — the native `window.confirm` is banned: many users have no
 *   desktop environment, and the webui is the only surface).
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

/**
 * One runtime row: number, label (inline rename), state, memory + pid,
 * actions (rename / delete with the inline confirm strip).
 */
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
  const [confirming, setConfirming] = useState(false)
  const [draft, setDraft] = useState('')
  const stateClass = row.state === 'running' ? css.rtStateRunning : css.rtStateStopped
  const memoryText = host
    ? `${term} ${fmtBytes(row.memory?.rss)} · ${t('runtimes.memHeap')} ${fmtBytes(row.memory?.heapUsed)}`
    : `${term} ${fmtBytes(row.memory?.rss)}`
  if (confirming && !host) {
    // The unified inline confirm strip: the row's content is replaced by the
    // question + the two buttons (no native dialog, ever).
    return (
      <li className={cx(css.rtRow, css.rtRowConfirm)}>
        <span className={css.rtNumber}>{String(row.number)}</span>
        <span className={css.rtLabel} title={row.label}>{row.label}</span>
        <span className={css.rtConfirmText}>{t('runtimes.removeConfirmInline')}</span>
        <span className={css.rtActions}>
          <button
            type="button"
            className={cx(css.iconButton, css.rtConfirmOk)}
            title={t('runtimes.confirmOk')}
            onClick={() => { setConfirming(false); onRemove(row.id) }}
            disabled={busy !== undefined}
          >{t('runtimes.confirmOk')}</button>
          <button
            type="button"
            className={css.iconButton}
            title={t('runtimes.confirmCancel')}
            onClick={() => { setConfirming(false) }}
            disabled={busy !== undefined}
          >{t('runtimes.confirmCancel')}</button>
        </span>
      </li>
    )
  }
  return (
    <li className={css.rtRow}>
      <span className={css.rtNumber}>{String(row.number)}</span>
      {/* X3: the rename field lives INSIDE the label column (input + two
          compact buttons on one line) so every row keeps the same five
          tracks — the old markup put ✓ / ✕ as free children and the grid
          wrapped them onto a second line, drifting the state / memory
          columns against the other rows. */}
      {renaming && !host ? (
        <span className={css.rtLabelEdit}>
          <input
            className={css.rtLabelInput}
            value={draft}
            onChange={(event) => { setDraft(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                onRename(row.id, draft.trim())
                setRenaming(false)
              }
              if (event.key === 'Escape') setRenaming(false)
            }}
            aria-label={row.id}
          />
          <button type="button" className={css.rtActionIcon} onClick={() => { onRename(row.id, draft.trim()); setRenaming(false) }} title={t('runtimes.confirmOk')}>✓</button>
          <button type="button" className={css.rtActionIcon} onClick={() => { setRenaming(false) }} title={t('runtimes.confirmCancel')}>✕</button>
        </span>
      ) : (
        <span className={css.rtLabel} title={row.label}>{row.label}</span>
      )}
      <span className={cx(css.rtState, stateClass)}>{t(row.state === 'running' ? 'runtimes.state.running' : 'runtimes.state.stopped')}</span>
      <span className={css.rtMem} title={t('runtimes.memOccupied')}>{memoryText} · pid {row.pid ?? '—'}</span>
      {!host ? (
        <span className={css.rtActions}>
          <button
            type="button"
            className={css.rtActionIcon}
            title={t('runtimes.rename')}
            onClick={() => { setDraft(row.label); setRenaming(true) }}
            disabled={busy !== undefined}
          >✎</button>
          <button
            type="button"
            className={cx(css.rtActionIcon, css.rtActionDanger)}
            title={t('runtimes.remove')}
            onClick={() => { setConfirming(true) }}
            disabled={busy !== undefined}
          >×</button>
        </span>
      ) : null}
    </li>
  )
}

/**
 * The embedded runtime block: the numbered rows (0 = the host process), the
 * add row (a bare name input + ＋) and the per-OS hint. Rendered INSIDE the
 * 插件与程序 card (T round), never as a standalone section.
 * @param refreshSignal - a number bump re-reads the snapshot.
 * @returns the block (or nothing on an older host).
 */
export function RuntimesBlock({ refreshSignal }: { refreshSignal: number }): ReactNode {
  const { t } = useI18n()
  const { snapshot, unsupported, busy, addRuntime, removeRuntime, renameRuntime } = useRuntimes(refreshSignal, 3000)
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
            key={row.id}
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
      {/* X2: the add row is the NAME input only — blank = the auto number. */}
      <div className={css.rtAddRow}>
        <input
          className={css.rtNameInput}
          value={pendingName}
          onChange={(event) => { setPendingName(event.target.value) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && busy === undefined) {
              void addRuntime(pendingName).then(() => { setPendingName('') })
            }
          }}
          placeholder={t('runtimes.addNamePlaceholder')}
          aria-label={t('runtimes.addNamePlaceholder')}
        />
        <button
          type="button"
          className={css.rtActionIcon}
          title={t('runtimes.add')}
          disabled={busy !== undefined}
          onClick={() => {
            void addRuntime(pendingName).then(() => { setPendingName('') })
          }}
        >＋</button>
      </div>
    </div>
  )
}
