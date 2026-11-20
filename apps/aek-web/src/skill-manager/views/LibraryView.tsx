/**
 * The library tab (the reference's MySkills page, re-voiced for the aeksm
 * engine): the hub state strips, the search + category/source pill filters,
 * the list ⇄ grid virtual views, the selection bar, and the overlay sheets
 * (detail / picker / undistribute / archive / categorize).
 *
 * P16: the layout and interaction IA borrows the reference; every widget is
 * the app's own (shadcn/radix + console primitives + the virtual lists).
 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { PanelSearch } from '../../ui-kit.tsx'
import { VirtualList } from '../../VirtualList.tsx'
import { VirtualGrid } from '../../VirtualGrid.tsx'
import { type SkillsOverview } from '../../useSkills.ts'
import { filterSkills } from '../domain/filterSkills.ts'
import { buildCategoryPills, buildSourcePills, filterByPills } from '../domain/categoryPills.ts'
import { deriveRowStatus, type RowStatus } from '../domain/rowStatus.ts'
import { distCountsText } from '../domain/distribution.ts'
import { showUpdateStrip, updatableNames } from '../domain/updateStrip.ts'
import { showCostLine, formatApproxTokens } from '../domain/costLedger.ts'
import {
  exitSelection,
  idleSelection,
  isSelected,
  selectionCount,
  toggleSelection,
  type SelectionState,
} from '../domain/selection.ts'
import { sourceLink } from '../domain/sourceLink.ts'
import {
  type RowState,
  statusDotClass,
  toPickerAgents,
  useRunWrite,
  useSkillView,
  wiringOf,
} from './shared.tsx'
import { AgentPickerSheet, ArchiveSheet, AgentDotRow, CategorizeSheet, DetailSheet, UndistributeSheet } from './sheets.tsx'
import { agentDots } from '../domain/agentDots.ts'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

const ROW_HEIGHT = 64
const VIEW_HEIGHT = 420

/** The derived rows (the registry skill + the four status domains). */
function buildRows(overview: SkillsOverview, updatePlan: ReadonlyArray<{ skills: Array<{ skill: string }> }> | undefined): RowState[] {
  const updatable = new Set((updatePlan ?? []).flatMap(group => group.skills.map(item => item.skill)))
  const erroredBySkill = new Map<string, string>()
  for (const entry of overview.distribution.errored) {
    if (entry.error !== null) erroredBySkill.set(entry.skill, `${entry.skill} @ ${entry.runtimePath}: ${entry.error}`)
  }
  return overview.skills.map((skill) => {
    const wiring = wiringOf(overview.distributionBySkill, skill.name)
    return {
      name: skill.name,
      title: skill.title,
      category: skill.category,
      tags: skill.tags,
      categories: skill.categories,
      consumers: skill.consumers,
      description: skill.description,
      source: skill.source,
      archived: skill.archived,
      hasUpdate: updatable.has(skill.name),
      warning: erroredBySkill.get(skill.name) ?? null,
      distributedAgents: wiring?.agents ?? [],
      distribution: wiring?.targets ?? [],
    }
  })
}

/** The card / row overflow menu's actions. */
type CardAction = 'detail' | 'update' | 'distribute' | 'undistribute' | 'archive' | 'categorize'

export function LibraryView() {
  const { t, tf } = useI18n()
  const { skills, goNav } = useSkillView()
  const runWrite = useRunWrite()
  const overview = skills.overview as SkillsOverview

  const [query, setQuery] = useState('')
  const [activeCats, setActiveCats] = useState<ReadonlySet<string>>(new Set())
  const [activeSrcs, setActiveSrcs] = useState<ReadonlySet<string>>(new Set())
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [selection, setSelection] = useState<SelectionState>(idleSelection)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  // Overlays: at most one open; each keeps its session payload separately.
  const [detailSkill, setDetailSkill] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ skills: string[] } | null>(null)
  const [undistribute, setUndistribute] = useState<{ skills: string[] } | null>(null)
  const [archiving, setArchiving] = useState<string[] | null>(null)
  const [categorizing, setCategorizing] = useState<string[] | null>(null)

  const rows = useMemo(() => buildRows(overview, skills.updatePlan), [overview, skills.updatePlan])
  const agents = useMemo(() => toPickerAgents(overview.agents), [overview.agents])
  const catPills = useMemo(() => buildCategoryPills(rows, skills.categories), [rows, skills.categories])
  const srcPills = useMemo(() => buildSourcePills(rows), [rows])

  const searched = useMemo(() => filterSkills(rows, query), [rows, query])
  const filtered = useMemo(() => {
    let out = filterByPills(searched, activeCats)
    if (activeSrcs.size > 0) out = out.filter(row => activeSrcs.has(row.source?.type ?? 'local'))
    return out
  }, [searched, activeCats, activeSrcs])

  const updatableCount = updatableNames(rows).length
  const selectedRows = useMemo(() => rows.filter(row => isSelected(selection, row.name)), [rows, selection])

  // Esc: the card menu, then the topmost sheet, else the selection mode.
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (menuFor !== null) {
        setMenuFor(null)
        return
      }
      if (detailSkill !== null || picker !== null || undistribute !== null || archiving !== null || categorizing !== null) {
        setDetailSkill(null)
        setPicker(null)
        setUndistribute(null)
        setArchiving(null)
        setCategorizing(null)
        return
      }
      setSelection(exitSelection)
    }
    window.addEventListener('keydown', onKeydown)
    return () => { window.removeEventListener('keydown', onKeydown) }
  }, [menuFor, detailSkill, picker, undistribute, archiving, categorizing])

  // Selection-bar writes exit the selection mode on success.
  const runSelectionWrite = (label: string, action: () => Promise<boolean>): void => {
    void runWrite(label, async () => {
      const ok = await action()
      if (ok) setSelection(exitSelection)
      return ok
    })
  }

  const togglePill = (set: ReadonlySet<string>, key: string, apply: (next: ReadonlySet<string>) => void): void => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    apply(next)
  }

  const openAction = (action: CardAction, names: string[]): void => {
    setMenuFor(null)
    switch (action) {
      case 'detail': setDetailSkill(names[0]); return
      case 'update':
        runSelectionWrite(t('skills.menu.update'), () => skills.update({ skills: names }))
        return
      case 'distribute': setPicker({ skills: names }); return
      case 'undistribute': setUndistribute({ skills: names }); return
      case 'archive': setArchiving(names); return
      case 'categorize': setCategorizing(names); return
    }
  }

  const statusOf = (row: RowState): RowStatus => deriveRowStatus({
    hasUpdate: row.hasUpdate,
    detection: 'skipped',
    warning: row.warning,
    distributedAgents: row.distributedAgents,
    distribution: row.distribution,
  })

  const cost = skills.cost
  const doctor = overview.doctor

  return (
    <div className="flex flex-col gap-4">
      {/* Hub state line */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{t('skills.home')}: {overview.home}</Badge>
        {!overview.bootstrapped && <Badge variant="destructive">{t('skills.notBootstrapped')}</Badge>}
        {overview.distribution.status.outdated > 0 && <Badge variant="secondary">{tf('skills.outdated', { n: overview.distribution.status.outdated })}</Badge>}
      </div>

      {/* Not bootstrapped: the doctor hint, never a silent empty page */}
      {!overview.bootstrapped && (
        <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          <div className="mb-2 font-bold text-text">{t('skills.notBootstrappedTitle')}</div>
          <div className="whitespace-pre-wrap">{t('skills.notBootstrappedHint')}</div>
          {doctor.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {doctor.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* The hub stats line (the reference's MySkills header counts) */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{tf('skills.stat.skills', { n: rows.length })}</span>
        <span>·</span>
        <span>{tf('status.agents', { n: overview.agents.length })}</span>
        <span>·</span>
        <span>{tf('skills.stat.updatable', { n: updatableCount })}</span>
        <span>·</span>
        {doctor.warnings.length === 0
          ? <Badge variant="secondary">{t('skills.stat.healthy')}</Badge>
          : <Badge variant="destructive">{tf('skills.stat.degraded', { n: doctor.warnings.length })}</Badge>}
      </div>

      {/* The update strip (visible iff anything is updatable) */}
      {showUpdateStrip(updatableCount) && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2">
          <div className="text-sm text-text">{String(updatableCount)} {t('skills.updatable')}</div>
          <Button
            size="sm"
            variant="secondary"
            disabled={skills.busy}
            onClick={() => { void runWrite(t('skills.updateAll'), () => skills.update({ skills: updatableNames(rows) })) }}
          >
            {t('skills.updateAll')}
          </Button>
        </div>
      )}

      {/* The resident-cost strip */}
      {showCostLine(cost ?? null) && cost !== undefined && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
          <div className="text-text">{t('skills.cost')}: {formatApproxTokens(cost.totalTokens)} {t('skills.costUnit')}</div>
          {cost.paths.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {cost.paths.slice(0, 3).map(group => `${group.runtimeDir} ${formatApproxTokens(group.tokens)}`).join(' · ')}
            </div>
          )}
        </div>
      )}

      {/* Toolbar: search + add (→ the add tab) + view toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <PanelSearch value={query} onChange={setQuery} placeholder={t('skills.search')} badge={String(filtered.length)} />
        </div>
        <Button size="sm" onClick={() => { goNav({ view: 'add' }) }}><Icon name="plus" size={14} /><span className="ml-1">{t('skills.add')}</span></Button>
        <div className="flex rounded-md border border-border">
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => { setView('list') }}
            className={cn('px-2 py-1.5 text-xs', view === 'list' ? 'bg-secondary text-text' : 'text-muted-foreground hover:text-text')}
          >
            {t('skills.view.list')}
          </button>
          <button
            type="button"
            aria-pressed={view === 'grid'}
            onClick={() => { setView('grid') }}
            className={cn('px-2 py-1.5 text-xs', view === 'grid' ? 'bg-secondary text-text' : 'text-muted-foreground hover:text-text')}
          >
            {t('skills.view.grid')}
          </button>
        </div>
      </div>

      {/* The pill filter rows (categories from the registry vocabulary,
          source types derived) */}
      {(catPills.length > 0 || srcPills.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {catPills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.category')}</span>
              {catPills.map(pill => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => { togglePill(activeCats, pill.key, setActiveCats) }}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-2xxs',
                    activeCats.has(pill.key) ? 'border-primary bg-primary/10 text-text' : 'border-border text-muted-foreground hover:text-text',
                  )}
                >
                  {pill.label} · {pill.count}
                </button>
              ))}
            </div>
          )}
          {srcPills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.source')}</span>
              {srcPills.map(pill => (
                <button
                  key={pill.type}
                  type="button"
                  onClick={() => { togglePill(activeSrcs, pill.type, setActiveSrcs) }}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-2xxs',
                    activeSrcs.has(pill.type) ? 'border-primary bg-primary/10 text-text' : 'border-border text-muted-foreground hover:text-text',
                  )}
                >
                  {pill.type} · {pill.count}
                </button>
              ))}
            </div>
          )}
          {(activeCats.size > 0 || activeSrcs.size > 0) && (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => { setActiveCats(new Set()); setActiveSrcs(new Set()) }}>
              {t('skills.filter.clear')}
            </Button>
          )}
        </div>
      )}

      {/* The selection bar */}
      {selection.active && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-secondary/40 px-3 py-2">
          <Badge variant="secondary">{selectionCount(selection)} {t('skills.selected')}</Badge>
          <Button size="sm" variant="secondary" onClick={() => { openAction('distribute', [...selection.names]) }}>{t('skills.distribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('undistribute', [...selection.names]) }}>{t('skills.undistribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { runSelectionWrite(t('skills.updateSelected'), () => skills.update({ skills: updatableNames(selectedRows) })) }}>{t('skills.updateSelected')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('archive', [...selection.names]) }}>{t('skills.batch.archive')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('categorize', [...selection.names]) }}>{t('skills.batch.categorize')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setSelection(exitSelection(selection)) }}>{t('skills.clearSelection')}</Button>
        </div>
      )}

      {/* The library: virtual rows (list) or virtual tiles (grid) */}
      {filtered.length === 0
        ? <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">{t('skills.empty')}</div>
        : view === 'list'
          ? (
            <VirtualList
              items={filtered}
              rowHeight={ROW_HEIGHT}
              height={VIEW_HEIGHT}
              renderRow={(index) => {
                const row = filtered[index]
                const status = statusOf(row)
                return (
                  <SkillRowView
                    key={row.name}
                    row={row}
                    status={status}
                    overview={overview}
                    checked={isSelected(selection, row.name)}
                    menuOpen={menuFor === row.name}
                    onMenuToggle={() => { setMenuFor(current => (current === row.name ? null : row.name)) }}
                    onAction={(action) => { openAction(action, [row.name]) }}
                    onSelectToggle={() => { setSelection(prev => toggleSelection(prev, row.name)) }}
                    onOpen={() => { setDetailSkill(row.name) }}
                  />
                )
              }}
            />
          )
          : (
            <VirtualGrid
              cols={3}
              items={filtered.map(row => row.name)}
              height={VIEW_HEIGHT}
              renderTile={(index) => {
                const row = filtered[index]
                const status = statusOf(row)
                return (
                  <SkillCardView
                    key={row.name}
                    row={row}
                    status={status}
                    overview={overview}
                    checked={isSelected(selection, row.name)}
                    menuOpen={menuFor === row.name}
                    onMenuToggle={() => { setMenuFor(current => (current === row.name ? null : row.name)) }}
                    onAction={(action) => { openAction(action, [row.name]) }}
                    onSelectToggle={() => { setSelection(prev => toggleSelection(prev, row.name)) }}
                    onOpen={() => { setDetailSkill(row.name) }}
                  />
                )
              }}
            />
          )}

      {/* Overlays */}
      {detailSkill !== null && (
        <DetailSheet
          skill={detailSkill}
          onClose={() => { setDetailSkill(null) }}
          onUndistribute={(skillName) => {
            setUndistribute({ skills: [skillName] })
            setDetailSkill(null)
          }}
          onArchive={(skillName) => {
            setArchiving([skillName])
            setDetailSkill(null)
          }}
        />
      )}
      {picker !== null && (
        <AgentPickerSheet
          agents={agents}
          scope="user"
          knownProjects={overview.projects}
          busy={skills.busy}
          onConfirm={(agentsSel, projectRoot, scope) => {
            runSelectionWrite(tf('skills.distributeDone', { n: picker.skills.length }), async () => {
              const ok = await skills.distribute({ to: scope, skills: picker.skills, agents: agentsSel, projectRoot })
              if (ok) setPicker(null)
              return ok
            })
            return agentsSel
          }}
          onClose={() => { setPicker(null) }}
        />
      )}
      {undistribute !== null && (
        <UndistributeSheet
          overview={overview}
          skills={undistribute.skills}
          busy={skills.busy}
          onConfirm={(scope, agentsSel, projectRoot) => {
            runSelectionWrite(tf('skills.undistributeDone', { n: undistribute.skills.length }), async () => {
              const ok = await skills.undistribute({ to: scope, skills: undistribute.skills, agents: agentsSel, projectRoot })
              if (ok) setUndistribute(null)
              return ok
            })
          }}
          onClose={() => { setUndistribute(null) }}
        />
      )}
      {archiving !== null && (
        <ArchiveSheet
          skillsNames={archiving}
          onDone={() => {
            setArchiving(null)
            setSelection(exitSelection)
          }}
          onClose={() => { setArchiving(null) }}
        />
      )}
      {categorizing !== null && (
        <CategorizeSheet
          skillsNames={categorizing}
          onDone={() => {
            setCategorizing(null)
            setSelection(exitSelection)
          }}
          onClose={() => { setCategorizing(null) }}
        />
      )}
    </div>
  )
}

/** The status badge for one row. */
function StatusBadge({ status }: { status: RowStatus }) {
  const { t, tf } = useI18n()
  switch (status.kind) {
    case 'warning': return <Badge variant="destructive">{t('skills.status.warning')}</Badge>
    case 'detectionFailed': return <Badge variant="destructive">{t('skills.status.detectionFailed')}</Badge>
    case 'updatable': return <Badge variant="secondary">{t('skills.status.updatable')}</Badge>
    case 'distributed': return <Badge variant="outline">{distCountsText((key, n) => tf(key, { n }), status.agentCount, status.projectCount)}</Badge>
    case 'unlinked': return <Badge variant="ghost">{t('skills.status.unlinked')}</Badge>
  }
}

/** One card / row's overflow menu (the reference's CardActionMenu, our own). */
function CardMenu({ row, onAction, onClose }: {
  row: RowState
  onAction: (action: CardAction) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const linked = row.distributedAgents.length > 0 || row.distribution.length > 0
  const items: Array<{ action: CardAction; label: string; show: boolean }> = [
    { action: 'detail', label: t('skills.menu.detail'), show: true },
    { action: 'update', label: t('skills.menu.update'), show: row.hasUpdate },
    { action: 'distribute', label: t('skills.menu.distribute'), show: true },
    { action: 'undistribute', label: t('skills.menu.undistribute'), show: linked },
    { action: 'archive', label: t('skills.menu.archive'), show: true },
    { action: 'categorize', label: t('skills.menu.categorize'), show: true },
  ]
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-full z-40 mt-1 flex min-w-32 flex-col rounded-md border border-border bg-background py-1 shadow-md">
        {items.filter(item => item.show).map(item => (
          <button
            key={item.action}
            type="button"
            onClick={() => { onAction(item.action) }}
            className="flex items-center gap-2 px-3 py-1.5 text-left text-xs text-text hover:bg-secondary"
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}

/** One library row (list view): checkbox + title + status + dots + menu. */
function SkillRowView({ row, status, overview, checked, menuOpen, onMenuToggle, onAction, onSelectToggle, onOpen }: {
  row: RowState
  status: RowStatus
  overview: SkillsOverview
  checked: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onAction: (action: CardAction) => void
  onSelectToggle: () => void
  onOpen: () => void
}) {
  const { t } = useI18n()
  const link = sourceLink({
    type: row.source?.type ?? 'local',
    url: row.source?.url ?? '',
    subpath: row.source?.subpath ?? null,
    ref: row.source?.ref ?? null,
  })
  const dots = agentDots(overview.agents, row.distributedAgents)
  return (
    <div className={cn('relative flex items-center gap-3 border-b border-border px-2', checked && 'bg-secondary/40')} style={{ height: ROW_HEIGHT }}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={onSelectToggle}
        onClick={(e) => { e.stopPropagation() }}
        aria-label={row.name}
      />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-text">{row.title || row.name}</span>
            {row.archived && <Badge variant="ghost">{t('skills.archived')}</Badge>}
            <StatusBadge status={status} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.category !== 'general' && <span>{row.category} · </span>}
            {row.description}
          </div>
        </div>
        <AgentDotRow dots={dots} />
        {link !== null && row.source !== null && row.source.url !== null && row.source.url !== '' && (
          link.href !== null
            ? <a href={link.href} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation() }} className="text-xs text-primary underline">{link.label}</a>
            : <span className="text-xs text-muted-foreground">{link.label}</span>
        )}
      </button>
      <button
        type="button"
        aria-label={t('skills.menu.more')}
        aria-expanded={menuOpen}
        onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
        className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-secondary"
      >
        ⋯
      </button>
      {menuOpen && <CardMenu row={row} onAction={onAction} onClose={onMenuToggle} />}
    </div>
  )
}

/** One grid tile (the reference's SkillCard, virtual): status, title,
 *  description, dots + source, overflow menu. */
function SkillCardView({ row, status, overview, checked, menuOpen, onMenuToggle, onAction, onSelectToggle, onOpen }: {
  row: RowState
  status: RowStatus
  overview: SkillsOverview
  checked: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onAction: (action: CardAction) => void
  onSelectToggle: () => void
  onOpen: () => void
}) {
  const { t } = useI18n()
  const dots = agentDots(overview.agents, row.distributedAgents)
  const link = sourceLink({
    type: row.source?.type ?? 'local',
    url: row.source?.url ?? '',
    subpath: row.source?.subpath ?? null,
    ref: row.source?.ref ?? null,
  })
  return (
    <div className={cn('relative flex h-24 flex-col justify-between rounded-md border border-border p-2', checked && 'border-primary/50 bg-secondary/40')}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={checked}
          onChange={onSelectToggle}
          aria-label={row.name}
        />
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(status))} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-text hover:underline">
          {row.title || row.name}
        </button>
        <button
          type="button"
          aria-label={t('skills.menu.more')}
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
          className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-secondary"
        >
          ⋯
        </button>
      </div>
      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{row.description || row.name}</div>
      <div className="flex items-center justify-between gap-2">
        <AgentDotRow dots={dots} />
        {link !== null && row.source !== null && row.source.url !== null && row.source.url !== '' && (
          link.href !== null
            ? <a href={link.href} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation() }} className="truncate text-2xxs text-primary underline">{link.label}</a>
            : <span className="truncate text-2xxs text-muted-foreground">{link.label}</span>
        )}
      </div>
      {menuOpen && <CardMenu row={row} onAction={onAction} onClose={onMenuToggle} />}
    </div>
  )
}
