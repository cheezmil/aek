/**
 * 运行时与内存 — the numbered coraek runtime view (S round).
 *
 * Runtime 1 is always the shared host runtime (this console's own process);
 * runtimes 2..N are the isolated capability processes. Every number, pid,
 * label and memory reading is host-resolved (`GET /api/aek/runtimes`) — the
 * client only renders. Memory is live and honest: the host row is a
 * `process.memoryUsage()` reading, an isolated row is its whole-process RSS,
 * and an in-host plugin is reported as "counted toward the host runtime",
 * never an invented per-module split.
 *
 * The section hides itself when the host has no route (an older build):
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
function fmtBytes(bytes?: number): string {
  return bytes === undefined ? '—' : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** One runtime row: number, kind, label (inline rename), state, memory, plugins, actions. */
function RuntimeRowView({ row, host, onRename, onRemove, busy }: {
  row: RuntimeRow
  host: boolean
  onRename: (id: string, label: string) => void
  onRemove: (id: string) => void
  busy: string | undefined
}): ReactNode {
  const { t } = useI18n()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const stateClass = row.state === 'running' ? css.rtStateRunning : css.rtStateStopped
  const memoryText = host
    ? `${t('runtimes.memRss')} ${fmtBytes(row.memory?.rss)} · ${t('runtimes.memHeap')} ${fmtBytes(row.memory?.heapUsed)}`
    : `${t('runtimes.memRss')} ${fmtBytes(row.memory?.rss)}`
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
      <span className={css.rtPlugins}>
        {row.plugins.map(pluginId => <span key={pluginId} className={css.unknownChip}>{pluginId}</span>)}
      </span>
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

/** The per-plugin memory table (the "哪些插件占用了多少内存" half). */
function PluginMemoryTable({ pluginMemory, runtimes }: {
  pluginMemory: Record<string, { value?: number; caliber: 'process-rss' | 'in-host-shared' }>
  runtimes: RuntimeRow[]
}): ReactNode {
  const { t } = useI18n()
  const entries = Object.entries(pluginMemory).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return <div className={css.rtEmpty}>{t('runtimes.empty')}</div>
  const runtimeOf = (pluginId: string): number => {
    const row = runtimes.find(candidate => candidate.plugins.includes(pluginId))
    return row !== undefined ? row.number : 1
  }
  return (
    <div>
      <h3 className={css.sectionTitle}>{t('runtimes.plugins')}</h3>
      {entries.map(([pluginId, entry]) => (
        <div key={pluginId} className={css.rtPluginRow}>
          <span className={css.rtPluginName}>{pluginId}</span>
          <span className={css.rtPluginRuntime}>
            {entry.caliber === 'in-host-shared'
              ? t('plugins.mem.inHost')
              : `${t('plugins.mem.process')} · ${t('runtimes.memRss')} ${fmtBytes(entry.value)}`}
          </span>
          <span className={css.rtMem}>rt{String(runtimeOf(pluginId))}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * The numbered runtime section.
 * @param refreshSignal - a number bump re-reads the snapshot.
 * @returns the section (or nothing on an older host).
 */
export function RuntimesPanel({ refreshSignal }: { refreshSignal: number }): ReactNode {
  const { t } = useI18n()
  const { snapshot, unsupported, busy, addRuntime, removeRuntime, renameRuntime } = useRuntimes(refreshSignal)
  const [pendingAdd, setPendingAdd] = useState('')
  if (unsupported || snapshot === undefined) return null
  const rows = [snapshot.host, ...snapshot.runtimes]
  return (
    <section className={css.programsSection}>
      <h2 className={css.programsSectionTitle}>{t('panel.runtimesSection')}</h2>
      <div className={css.hint}>{t('runtimes.hint')}</div>
      <ul className={css.rtList}>
        {rows.map(row => (
          <RuntimeRowView
            key={row.kind === 'host' ? 'host' : (row.id as string)}
            row={row}
            host={row.kind === 'host'}
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
        <button
          type="button"
          className={css.iconButton}
          title={t('runtimes.add')}
          disabled={pendingAdd === '' || busy !== undefined}
          onClick={() => {
            if (pendingAdd === '') return
            if (window.confirm(t('runtimes.addConfirm'))) void addRuntime(pendingAdd)
            setPendingAdd('')
          }}
        >＋</button>
      </div>
      <PluginMemoryTable pluginMemory={snapshot.pluginMemory} runtimes={snapshot.runtimes} />
    </section>
  )
}
