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
 * HH round (2026-11-17): the block is the shadcn Table (rows = TableRow,
 * five tracks via table-fixed + per-cell widths: 24px number / fluid label /
 * 56px state Badge / 176px memory / 56px actions), Badge state chips,
 * ghost icon-xs action buttons, Input add-row — the design-system parts the
 * user asked for, replacing the hand-rolled bordered-row look.
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import type { RuntimeRow } from './useRuntimes.ts'
import { useRuntimes } from './useRuntimes.ts'

/** Format one byte reading as a quiet `xx.x MB` (or the unknown marker). */
export function fmtBytes(bytes?: number): string {
  return bytes === undefined ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* HH round: the track widths now live on the CELLS (table-fixed sizes the
   columns from the first row) instead of the old `.aek-grid-rt-row` template. */
const RT_CELL = 'p-2.5 align-middle'
const RT_CELL_NUMBER = cn(RT_CELL, 'w-6 text-center')
const RT_CELL_STATE = cn(RT_CELL, 'w-14')
const RT_CELL_MEM = cn(RT_CELL, 'w-44')
const RT_CELL_ACTIONS = cn(RT_CELL, 'w-14')
const RT_NUMBER = 'text-xs font-bold tabular-nums text-text-muted'
const RT_LABEL = 'text-xs-plus font-semibold overflow-hidden text-ellipsis whitespace-nowrap'
const RT_LABEL_EDIT = 'flex items-center gap-1 min-w-0'
const RT_MEM = 'text-2xs tabular-nums text-text-muted break-anywhere'
const RT_QUESTION = 'text-xs text-danger break-anywhere'

/**
 * One runtime row (a shadcn TableRow). Number, label (inline rename), state,
 * memory + pid, actions (rename / delete with the inline confirm strip).
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
  const memoryText = host
    ? `${term} ${fmtBytes(row.memory?.rss)} · ${t('runtimes.memHeap')} ${fmtBytes(row.memory?.heapUsed)}`
    : `${term} ${fmtBytes(row.memory?.rss)}`
  if (confirming && !host) {
    // The unified inline confirm strip: the row's content is replaced by the
    // question + the two buttons (no native dialog, ever).
    // HH fix: the old layout squeezed BOTH buttons into the 56px actions
    // track (they overflowed under the question text at wide windows) —
    // now the question cell spans the whole fluid width (colSpan 4) and the
    // buttons ride the flex row, right-aligned on the same track; the label
    // travels with the question so "which runtime" is never lost.
    return (
      <TableRow className="bg-danger-soft hover:bg-danger-soft">
        <TableCell className={RT_CELL_NUMBER}>{String(row.number)}</TableCell>
        <TableCell colSpan={4} className={RT_CELL}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className={cn(RT_LABEL, 'shrink-0')} title={row.label}>{row.label}</span>
            <span className={RT_QUESTION}>{t('runtimes.removeConfirmInline')}</span>
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <Button
                variant="outline"
                size="xs"
                title={t('runtimes.confirmCancel')}
                onClick={() => { setConfirming(false) }}
                disabled={busy !== undefined}
              >{t('runtimes.confirmCancel')}</Button>
              <Button
                variant="destructive"
                size="xs"
                title={t('runtimes.confirmOk')}
                onClick={() => { setConfirming(false); onRemove(row.id) }}
                disabled={busy !== undefined}
              >{t('runtimes.confirmOk')}</Button>
            </span>
          </div>
        </TableCell>
      </TableRow>
    )
  }
  return (
    <TableRow>
      <TableCell className={RT_CELL_NUMBER}>
        <span className={RT_NUMBER}>{String(row.number)}</span>
      </TableCell>
      {/* X3: the rename field lives INSIDE the label cell (input + two
          compact buttons on one line) so every row keeps the same five
          tracks — the old markup put ✓ / ✕ as free children and the grid
          wrapped them onto a second line, drifting the state / memory
          columns against the other rows. */}
      <TableCell>
        {renaming && !host ? (
          <span className={RT_LABEL_EDIT}>
            <Input
              className="h-6.5 flex-1 w-auto p-1 px-1.5 text-xs-plus font-semibold"
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
            <Button variant="ghost" size="icon-xs" onClick={() => { onRename(row.id, draft.trim()); setRenaming(false) }} title={t('runtimes.confirmOk')}>✓</Button>
            <Button variant="ghost" size="icon-xs" onClick={() => { setRenaming(false) }} title={t('runtimes.confirmCancel')}>✕</Button>
          </span>
        ) : (
          <span className={RT_LABEL} title={row.label}>{row.label}</span>
        )}
      </TableCell>
      <TableCell className={RT_CELL_STATE}>
        {row.state === 'running'
          ? <Badge variant="outline" className="bg-success-soft text-success border-success-border">{t('runtimes.state.running')}</Badge>
          : <Badge variant="secondary">{t('runtimes.state.stopped')}</Badge>}
      </TableCell>
      <TableCell className={RT_CELL_MEM}>
        <span className={RT_MEM} title={t('runtimes.memOccupied')}>{memoryText} · pid {row.pid ?? '—'}</span>
      </TableCell>
      <TableCell className={RT_CELL_ACTIONS}>
        {!host ? (
          <div className="flex gap-1 justify-end">
            <Button
              variant="ghost"
              size="icon-xs"
              title={t('runtimes.rename')}
              onClick={() => { setDraft(row.label); setRenaming(true) }}
              disabled={busy !== undefined}
            >✎</Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="hover:bg-danger-soft hover:text-danger"
              title={t('runtimes.remove')}
              onClick={() => { setConfirming(true) }}
              disabled={busy !== undefined}
            >×</Button>
          </div>
        ) : null}
      </TableCell>
    </TableRow>
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
    <Card size="lg" className="mb-3 shadow-none">
      {/* HH round: one explicit 8px block rhythm (hint / table / add row) —
          the ad-hoc mt-2 / py-1 margins are gone. */}
      <CardContent className="flex flex-col gap-2">
        <div className='text-text-secondary text-xs'>{hint}</div>
        {/* HH round: the five-track row grid is now a shadcn Table —
            table-fixed takes the column template from the first row's cells. */}
        <Table className="table-fixed w-full">
          <TableBody>
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
          </TableBody>
        </Table>
        {snapshot.runtimes.length === 0 ? <div className='text-text-muted text-xs'>{t('runtimes.empty')}</div> : null}
        {/* X2: the add row is the NAME input only — blank = the auto number. */}
        <div className='flex items-center gap-2'>
          <Input
            className="h-8 flex-1 basis-40 min-w-30 text-xs"
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
          <Button
            variant="outline"
            size="icon-sm"
            title={t('runtimes.add')}
            disabled={busy !== undefined}
            onClick={() => {
              void addRuntime(pendingName).then(() => { setPendingName('') })
            }}
          >＋</Button>
        </div>
      </CardContent>
    </Card>
  )
}
