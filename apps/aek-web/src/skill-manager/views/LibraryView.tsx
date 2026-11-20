/**
 * The library face (本地技能中心) — BN round: the full body re-voiced in the
 * app's own house style (no external webui reference, per m06945/m07564):
 * one hub-state card (counts + update + resident cost merged), a single
 * search + pill-filter toolbar, and spacious card rows / grid tiles.
 * Every widget is the app's own (shadcn/radix + console primitives +
 * virtual lists); the data flow (useSkills, the domain modules, the
 * overlay sheets) is untouched — only the rendering layer changed.
 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { PanelCard, PanelSearch } from '../../ui-kit.tsx'
import { VirtualList } from '../../VirtualList.tsx'
import { VirtualGrid } from '../../VirtualGrid.tsx'
import { type SkillsOverview } from '../../useSkills.ts'
import { filterSkills } from '../domain/filterSkills.ts'
import { buildCategoryPills, buildSourcePills, filterByPills } from '../domain/categoryPills.ts'
import { deriveRowStatus, type RowStatus } from '../domain/rowStatus.ts'
import { distCountsText } from '../domain/distribution.ts'
import { showUpdateStrip, updatableNames } from '../domain/updateStrip.ts'
import { showCostLine, costCaliber, formatApproxTokens } from '../domain/costLedger.ts'
import {
  exitSelection,
  idleSelection,
  isSelected,
  selectionCount,
  toggleSelection,
  type SelectionState,
} from '../domain/selection.ts'
import { sourceLink } from '../domain/sourceLink.ts'
import { agentDots } from '../domain/agentDots.ts'
import {
  type RowState,
  statusDotClass,
  toPickerAgents,
  useRunWrite,
  useSkillView,
  ViewHeader,
  wiringOf,
} from './shared.tsx'
import { AgentPickerSheet, ArchiveSheet, AgentDotRow, CategorizeSheet, DetailSheet, UndistributeSheet } from './sheets.tsx'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** One virtual row slot: the 80px card + its 8px gap (the virtual pitch). */
const ROW_PITCH = 88
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

/** The per-row badges (only the exceptional states earn one). */
function RowBadges({ row, status }: { row: RowState; status: RowStatus }) {
  const { t, tf } = useI18n()
  return (
    <>
      {row.hasUpdate && <Badge variant="secondary" className="shrink-0 text-2xxs">{t('skills.status.updatable')}</Badge>}
      {status.kind === 'distributed' && (
        <Badge variant="outline" className="shrink-0 text-2xxs">
          {distCountsText((key, n) => tf(key, { n }), status.agentCount, status.projectCount)}
        </Badge>
      )}
      {row.archived && <Badge variant="ghost" className="shrink-0 text-2xxs">{t('skills.archived')}</Badge>}
    </>
  )
}

/** The source link chip (the row's second line / the tile's footer). */
function SourceChip({ row }: { row: RowState }) {
  const link = sourceLink({
    type: row.source?.type ?? 'local',
    url: row.source?.url ?? '',
    subpath: row.source?.subpath ?? null,
    ref: row.source?.ref ?? null,
  })
  if (link === null || row.source === null || row.source.url === null || row.source.url === '') return null
  if (link.href !== null) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => { e.stopPropagation() }}
        className="max-w-44 shrink-0 truncate text-2xxs text-primary underline"
      >
        {link.label}
      </a>
    )
  }
  return <span className="max-w-44 shrink-0 truncate text-2xxs text-muted-foreground">{link.label}</span>
}

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
  const caliber = cost !== undefined ? costCaliber(cost) : null
  const skillsPath = overview.home.replace(/[/\\]+$/, '') + '/skills/'
  const filtersActive = activeCats.size > 0 || activeSrcs.size > 0

  const viewButton = (mode: 'list' | 'grid'): React.JSX.Element => (
    <button
      type="button"
      aria-pressed={view === mode}
      onClick={() => { setView(mode) }}
      className={cn(
        'px-2.5 py-1 text-2xxs',
        view === mode ? 'bg-secondary font-bold text-text' : 'text-muted-foreground hover:text-text',
      )}
    >
      {mode === 'list' ? t('skills.view.list') : t('skills.view.grid')}
    </button>
  )

  const rowProps = (row: RowState, status: RowStatus) => ({
    row,
    status,
    overview,
    checked: isSelected(selection, row.name),
    menuOpen: menuFor === row.name,
    onMenuToggle: () => { setMenuFor(current => (current === row.name ? null : row.name)) },
    onAction: (action: CardAction): void => { openAction(action, [row.name]) },
    onSelectToggle: () => { setSelection(prev => toggleSelection(prev, row.name)) },
    onOpen: () => { setDetailSkill(row.name) },
  })

  return (
    <div className="flex flex-col gap-4">
      {/* The house header (BM round) + the face's actions (add + view
          toggle) moved up here — the body carries no more of them. */}
      <ViewHeader
        icon="bookOpenText"
        title={t('panel.skillsLibrary')}
        subtitle={`${t('skills.home')}: ${skillsPath}`}
      >
        <Button size="sm" variant="secondary" onClick={() => { goNav({ view: 'add' }) }}>
          <Icon name="plus" size={14} /><span className="ml-1">{t('skills.add')}</span>
        </Button>
        <div className="flex rounded-md border border-border">
          {viewButton('list')}
          {viewButton('grid')}
        </div>
      </ViewHeader>

      {/* Hub state: the three old scattered strips, merged into one card. */}
      <PanelCard className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          <span className="text-sm font-bold tabular-nums text-text">{tf('skills.stat.skills', { n: rows.length })}</span>
          <span>{tf('status.agents', { n: overview.agents.length })}</span>
          <span>{tf('skills.stat.updatable', { n: updatableCount })}</span>
          {doctor.warnings.length === 0
            ? <Badge variant="secondary" className="ml-auto text-2xxs">{t('skills.stat.healthy')}</Badge>
            : <Badge variant="destructive" className="ml-auto text-2xxs">{tf('skills.stat.degraded', { n: doctor.warnings.length })}</Badge>}
        </div>
        {showUpdateStrip(updatableCount) && (
          <div className="mt-2.5 flex items-center gap-3 border-t border-border pt-2.5">
            <span className="text-xs font-bold text-accent-ink">{tf('skills.stat.updatable', { n: updatableCount })}</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto"
              disabled={skills.busy}
              onClick={() => { void runWrite(t('skills.updateAll'), () => skills.update({ skills: updatableNames(rows) })) }}
            >
              {t('skills.updateAll')}
            </Button>
          </div>
        )}
        {showCostLine(cost ?? null) && cost !== undefined && caliber !== null && (
          <div className={cn('flex flex-col gap-1', showUpdateStrip(updatableCount) ? 'mt-2.5 border-t border-border pt-2.5' : '')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t('skills.cost')}{' '}
                <span className="text-base font-bold tabular-nums text-text">{formatApproxTokens(cost.totalTokens)}</span>{' '}
                {t('skills.costUnit')}
              </span>
              {cost.paths.length > 0 && (
                <span className="text-2xxs text-muted-foreground">
                  {cost.paths.slice(0, 3).map(group => `${group.runtimeDir} ${formatApproxTokens(group.tokens)}`).join(' · ')}
                </span>
              )}
            </div>
            {caliber.dirs > 0 && (
              <span className="text-2xxs text-muted-foreground">
                {tf('skills.costCaliber', { n: caliber.dirs, avg: formatApproxTokens(caliber.avg), max: formatApproxTokens(caliber.max) })}
              </span>
            )}
          </div>
        )}
      </PanelCard>

      {/* Not bootstrapped: the doctor hint, never a silent empty page */}
      {(!overview.bootstrapped || overview.distribution.status.outdated > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {!overview.bootstrapped && <Badge variant="destructive">{t('skills.notBootstrapped')}</Badge>}
          {overview.distribution.status.outdated > 0 && <Badge variant="secondary">{tf('skills.outdated', { n: overview.distribution.status.outdated })}</Badge>}
        </div>
      )}
      {!overview.bootstrapped && (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <div className="mb-2 text-sm font-bold text-text">{t('skills.notBootstrappedTitle')}</div>
          <div className="whitespace-pre-wrap">{t('skills.notBootstrappedHint')}</div>
          {doctor.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs">
              {doctor.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* The search + filter toolbar (one quiet card, pills inside) */}
      <PanelCard className="flex flex-col gap-2.5 p-3">
        <PanelSearch value={query} onChange={setQuery} placeholder={t('skills.search')} badge={String(filtered.length)} />
        {(catPills.length > 0 || srcPills.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.category')}</span>
            {catPills.map(pill => (
              <button
                key={pill.key}
                type="button"
                onClick={() => { togglePill(activeCats, pill.key, setActiveCats) }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xxs',
                  activeCats.has(pill.key) ? 'border-primary bg-primary/10 font-bold text-text' : 'border-border text-muted-foreground hover:border-accent/40 hover:text-text',
                )}
              >
                {pill.label} <span className="tabular-nums">{pill.count}</span>
              </button>
            ))}
            {catPills.length > 0 && srcPills.length > 0 && <span className="h-3.5 w-px bg-border" />}
            <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.source')}</span>
            {srcPills.map(pill => (
              <button
                key={pill.type}
                type="button"
                onClick={() => { togglePill(activeSrcs, pill.type, setActiveSrcs) }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-2xxs',
                  activeSrcs.has(pill.type) ? 'border-primary bg-primary/10 font-bold text-text' : 'border-border text-muted-foreground hover:border-accent/40 hover:text-text',
                )}
              >
                {pill.type} <span className="tabular-nums">{pill.count}</span>
              </button>
            ))}
            {filtersActive && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-6 px-2 text-2xxs"
                onClick={() => { setActiveCats(new Set()); setActiveSrcs(new Set()) }}
              >
                {t('skills.filter.clear')}
              </Button>
            )}
          </div>
        )}
      </PanelCard>

      {/* The selection bar */}
      {selection.active && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-secondary/40 px-3.5 py-2.5">
          <Badge variant="secondary">{selectionCount(selection)} {t('skills.selected')}</Badge>
          <Button size="sm" variant="secondary" onClick={() => { openAction('distribute', [...selection.names]) }}>{t('skills.distribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('undistribute', [...selection.names]) }}>{t('skills.undistribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { runSelectionWrite(t('skills.updateSelected'), () => skills.update({ skills: updatableNames(selectedRows) })) }}>{t('skills.updateSelected')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('archive', [...selection.names]) }}>{t('skills.batch.archive')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('categorize', [...selection.names]) }}>{t('skills.batch.categorize')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setSelection(exitSelection(selection)) }}>{t('skills.clearSelection')}</Button>
        </div>
      )}

      {/* The library body: virtual card rows (list) or virtual tiles */}
      {filtered.length === 0
        ? <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">{t('skills.empty')}</div>
        : view === 'list'
          ? (
            <VirtualList
              items={filtered}
              rowHeight={ROW_PITCH}
              height={VIEW_HEIGHT}
              renderRow={(index) => {
                const row = filtered[index]
                return (
                  <SkillRowView
                    key={row.name}
                    {...rowProps(row, statusOf(row))}
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
                return (
                  <SkillTileView
                    key={row.name}
                    {...rowProps(row, statusOf(row))}
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

interface RowSlotProps {
  row: RowState
  status: RowStatus
  overview: SkillsOverview
  checked: boolean
  menuOpen: boolean
  onMenuToggle: () => void
  onAction: (action: CardAction) => void
  onSelectToggle: () => void
  onOpen: () => void
}

/** One virtual slot's 80px card row (the 8px pitch gap stays below it). */
function SkillRowView({ row, status, overview, checked, menuOpen, onMenuToggle, onAction, onSelectToggle, onOpen }: RowSlotProps) {
  const { t } = useI18n()
  const dots = agentDots(overview.agents, row.distributedAgents)
  return (
    <div className={cn(
      'relative flex h-20 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card px-3 transition-colors hover:border-accent/40',
      checked && 'border-primary/50 bg-secondary/30',
    )}>
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 shrink-0 accent-primary"
          checked={checked}
          onChange={onSelectToggle}
          onClick={(e) => { e.stopPropagation() }}
          aria-label={row.name}
        />
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(status))} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-text">
          {row.title || row.name}
        </button>
        <RowBadges row={row} status={status} />
        <button
          type="button"
          aria-label={t('skills.menu.more')}
          aria-expanded={menuOpen}
          onClick={(e) => { e.stopPropagation(); onMenuToggle() }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-text"
        >
          ⋯
        </button>
      </div>
      <div className="flex items-center gap-2 pl-11 pr-11">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {row.description !== '' ? row.description : row.name}
        </span>
        <AgentDotRow dots={dots} />
        <SourceChip row={row} />
      </div>
      {menuOpen && <CardMenu row={row} onAction={onAction} onClose={onMenuToggle} />}
    </div>
  )
}

/** One virtual grid tile (VirtualGrid's fixed h-24 contract). */
function SkillTileView({ row, status, overview, checked, menuOpen, onMenuToggle, onAction, onSelectToggle, onOpen }: RowSlotProps) {
  const { t } = useI18n()
  const dots = agentDots(overview.agents, row.distributedAgents)
  return (
    <div className={cn(
      'relative flex h-24 flex-col gap-1 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-accent/40',
      checked && 'border-primary/50 bg-secondary/30',
    )}>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 shrink-0 accent-primary"
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
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-secondary hover:text-text"
        >
          ⋯
        </button>
      </div>
      <div className="line-clamp-2 text-xs text-muted-foreground">
        {row.description !== '' ? row.description : row.name}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <RowBadges row={row} status={status} />
        <AgentDotRow dots={dots} />
        <span className="ml-auto"><SourceChip row={row} /></span>
      </div>
      {menuOpen && <CardMenu row={row} onAction={onAction} onClose={onMenuToggle} />}
    </div>
  )
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
