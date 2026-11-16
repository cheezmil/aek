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
import { cn } from '@/lib/utils'
import type { RuntimeRow } from './useRuntimes.ts'
import { useRuntimes } from './useRuntimes.ts'

/** Format one byte reading as a quiet `xx.x MB` (or the unknown marker). */
export function fmtBytes(bytes?: number): string {
  return bytes === undefined ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* FF round: the old rt* module classes, now literal Tailwind utilities (1:1
   from Home.module.css L3234-3428). The five-track row grid ships as the
   named `.aek-grid-rt-row` component helper in index.css (arbitrary
   grid-template values are banned by @shadcn/lint). */
const RT_ROW = 'grid aek-grid-rt-row gap-x-2 items-center border border-border rounded-sm py-2 px-2.5 bg-card'
const RT_ROW_CONFIRM = 'aek-grid-rt-row-confirm bg-danger-soft border-danger-border'
const RT_NUMBER = 'text-center text-xs font-bold tabular-nums text-text-muted'
const RT_LABEL = 'text-xs-plus font-semibold overflow-hidden text-ellipsis whitespace-nowrap'
const RT_LABEL_EDIT = 'flex items-center gap-1 min-w-0'
const RT_LABEL_INPUT = 'text-xs-plus font-semibold py-0.5 px-1.5 border border-accent rounded-2xs bg-surface-subtle text-text min-w-0'
const RT_STATE = 'px-2 py-px rounded-full text-2xs font-semibold justify-self-start'
const RT_STATE_RUNNING = 'bg-success-soft text-success'
const RT_STATE_STOPPED = 'bg-surface-subtle text-text-muted'
const RT_MEM = 'text-2xs tabular-nums text-text-muted break-anywhere'
const RT_ACTIONS = 'flex gap-1 justify-self-end'
const RT_ACTION_ICON = 'inline-flex items-center justify-center size-6 p-0 border-0 rounded-xs bg-transparent text-text-muted text-xs-plus leading-none cursor-pointer hover:text-accent-ink hover:bg-accent-soft disabled:opacity-45 disabled:cursor-default'
const RT_ACTION_DANGER = 'hover:text-danger hover:bg-danger-soft'
const RT_ICON_BUTTON = 'inline-flex items-center justify-center size-8.5 p-0 text-text-secondary bg-card border border-border rounded-sm cursor-pointer transition-[color,border-color,background-color] duration-150 ease-aek hover:text-primary hover:border-accent-border hover:bg-accent-soft disabled:opacity-50 disabled:cursor-not-allowed'
const RT_CONFIRM_OK = 'text-danger border-danger-border text-xs px-2 py-0.5'

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
  const stateClass = row.state === 'running' ? RT_STATE_RUNNING : RT_STATE_STOPPED
  const memoryText = host
    ? `${term} ${fmtBytes(row.memory?.rss)} · ${t('runtimes.memHeap')} ${fmtBytes(row.memory?.heapUsed)}`
    : `${term} ${fmtBytes(row.memory?.rss)}`
  if (confirming && !host) {
    // The unified inline confirm strip: the row's content is replaced by the
    // question + the two buttons (no native dialog, ever).
    return (
      <li className={cn(RT_ROW, RT_ROW_CONFIRM)}>
        <span className={RT_NUMBER}>{String(row.number)}</span>
        <span className={RT_LABEL} title={row.label}>{row.label}</span>
        <span className='text-xs text-danger break-anywhere'>{t('runtimes.removeConfirmInline')}</span>
        <span className={RT_ACTIONS}>
          <button
            type="button"
            className={cn(RT_ICON_BUTTON, RT_CONFIRM_OK, 'w-auto min-w-12')}
            title={t('runtimes.confirmOk')}
            onClick={() => { setConfirming(false); onRemove(row.id) }}
            disabled={busy !== undefined}
          >{t('runtimes.confirmOk')}</button>
          <button
            type="button"
            className={cn(RT_ICON_BUTTON, 'w-auto min-w-12')}
            title={t('runtimes.confirmCancel')}
            onClick={() => { setConfirming(false) }}
            disabled={busy !== undefined}
          >{t('runtimes.confirmCancel')}</button>
        </span>
      </li>
    )
  }
  return (
    <li className={RT_ROW}>
      <span className={RT_NUMBER}>{String(row.number)}</span>
      {/* X3: the rename field lives INSIDE the label column (input + two
          compact buttons on one line) so every row keeps the same five
          tracks — the old markup put ✓ / ✕ as free children and the grid
          wrapped them onto a second line, drifting the state / memory
          columns against the other rows. */}
      {renaming && !host ? (
        <span className={RT_LABEL_EDIT}>
          <input
            className={cn(RT_LABEL_INPUT, 'flex-1 w-auto')}
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
          <button type="button" className={RT_ACTION_ICON} onClick={() => { onRename(row.id, draft.trim()); setRenaming(false) }} title={t('runtimes.confirmOk')}>✓</button>
          <button type="button" className={RT_ACTION_ICON} onClick={() => { setRenaming(false) }} title={t('runtimes.confirmCancel')}>✕</button>
        </span>
      ) : (
        <span className={RT_LABEL} title={row.label}>{row.label}</span>
      )}
      <span className={cn(RT_STATE, stateClass)}>{t(row.state === 'running' ? 'runtimes.state.running' : 'runtimes.state.stopped')}</span>
      <span className={RT_MEM} title={t('runtimes.memOccupied')}>{memoryText} · pid {row.pid ?? '—'}</span>
      {!host ? (
        <span className={RT_ACTIONS}>
          <button
            type="button"
            className={RT_ACTION_ICON}
            title={t('runtimes.rename')}
            onClick={() => { setDraft(row.label); setRenaming(true) }}
            disabled={busy !== undefined}
          >✎</button>
          <button
            type="button"
            className={cn(RT_ACTION_ICON, RT_ACTION_DANGER)}
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
    <div className='flex flex-col gap-2 p-3 border border-border rounded-sm bg-surface-subtle mb-3'>
      {/* The .rtBlock .hint override (margin-top 0) is baked in: the box
          padding already separates the hint from whatever is above. */}
      <div className='text-text-secondary text-xs'>{hint}</div>
      <ul className='list-none m-0 p-0 flex flex-col gap-2'>
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
      {snapshot.runtimes.length === 0 ? <div className='text-text-muted text-xs py-1'>{t('runtimes.empty')}</div> : null}
      {/* X2: the add row is the NAME input only — blank = the auto number. */}
      <div className='flex items-center gap-2 mt-2'>
        <input
          className='flex-1 basis-40 min-w-30 text-xs py-0.75 px-1.5 border border-border rounded-xs bg-card text-text'
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
          className={RT_ACTION_ICON}
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
