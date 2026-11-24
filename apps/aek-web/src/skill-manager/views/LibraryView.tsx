/**
 * The library face (本地技能中心) — re-voiced in shadcn/ui (the user's ruling,
 * 2026-11-24: "那些 shadcn ui 用起来"): the hub-state card, the search +
 * pill-filter toolbar, and every row / tile control now render through the
 * app's own shadcn component set (Card, Input, Badge, Button, Checkbox,
 * DropdownMenu, Separator) instead of hand-rolled boxes. The data flow
 * (useSkills, the domain modules, the overlay sheets) is untouched — only the
 * rendering layer changed. The overflow menu is a real radix DropdownMenu,
 * controlled per-row from the view (one open menu at a time, Esc priority
 * preserved: menu → sheet → selection).
 */
import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { Icon } from '../../Icons.tsx'
import { formatDisplayPath, parsePathStyle } from '../../paths.ts'
import { PREF_KEYS, usePref } from '../../preferences.tsx'
import { useConsoleFacts } from '../../useConsoleFacts.ts'
import { VirtualList } from '../../VirtualList.tsx'
import { VirtualGrid } from '../../VirtualGrid.tsx'
import { type SkillsOverview } from '../../useSkills.ts'
import { filterSkills } from '../domain/filterSkills.ts'
import { buildCategoryPills, buildSourcePills, filterByPills } from '../domain/categoryPills.ts'
import { deriveRowStatus, type RowStatus } from '../domain/rowStatus.ts'
import { distCountsText } from '../domain/distribution.ts'
import { showUpdateStrip, updatableNames } from '../domain/updateStrip.ts'
import { showCostLine, costCaliber, formatApproxTokens, skillResidentTokens } from '../domain/costLedger.ts'
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
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/** One virtual row slot: the 80px card + its 8px gap (the virtual pitch). */
const ROW_PITCH = 88

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

/** The row / tile overflow menu's actions. */
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

/** One row / tile's overflow menu (radix DropdownMenu, view-controlled). */
function RowMenu({ row, open, onOpenChange, onAction }: {
  row: RowState
  open: boolean
  onOpenChange: (open: boolean) => void
  onAction: (action: CardAction) => void
}) {
  const { t } = useI18n()
  const linked = row.distributedAgents.length > 0 || row.distribution.length > 0
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="shrink-0"
          aria-label={t('skills.menu.more')}
        >
          <Icon name="ellipsis" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => { onAction('detail') }}>{t('skills.menu.detail')}</DropdownMenuItem>
        {row.hasUpdate && (
          <DropdownMenuItem onSelect={() => { onAction('update') }}>{t('skills.menu.update')}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { onAction('distribute') }}>{t('skills.menu.distribute')}</DropdownMenuItem>
        {linked && (
          <DropdownMenuItem onSelect={() => { onAction('undistribute') }}>{t('skills.menu.undistribute')}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { onAction('archive') }}>{t('skills.menu.archive')}</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { onAction('categorize') }}>{t('skills.menu.categorize')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One filter pill (a shadcn Button wearing the house pill shape). */
function FilterPill({ label, count, active, onToggle }: {
  label: string
  count: number
  active: boolean
  onToggle: () => void
}) {
  return (
    <Button
      size="xs"
      variant={active ? 'secondary' : 'outline'}
      aria-pressed={active}
      onClick={onToggle}
      className={cn('h-6 rounded-full px-2.5 gap-1.5 text-2xxs font-normal', !active && 'text-muted-foreground')}
    >
      {label}
      <span className={cn('tabular-nums', !active && 'text-muted-foreground')}>{count}</span>
    </Button>
  )
}

export function LibraryView() {
  const { t, tf } = useI18n()
  const { skills, goNav, notify } = useSkillView()
  const runWrite = useRunWrite()
  const overview = skills.overview as SkillsOverview
  const [pathCopied, setPathCopied] = useState(false)
  /** BO round (m00001 ③): the 本地技能中心 path obeys the global path display
      style; home + platform come from the host facts, never the client. */
  const [pathStyle] = usePref(PREF_KEYS.pathStyle, 'abbreviated', parsePathStyle)
  const { facts } = useConsoleFacts()

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

  // Esc: the row menu (radix closes it itself; this keeps the view-level
  // priority), then the topmost sheet, else the selection mode.
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

  /** BO round: the path chip's copy button (m07690 item 2). */
  const copyPath = (): void => {
    void navigator.clipboard.writeText(skillsPath).then(() => {
      setPathCopied(true)
      notify('ok', t('skills.copied'))
      window.setTimeout(() => { setPathCopied(false) }, 2000)
    })
  }

  const viewToggle = (mode: 'list' | 'grid'): React.JSX.Element => (
    <Button
      size="icon-sm"
      variant={view === mode ? 'secondary' : 'ghost'}
      aria-label={mode === 'list' ? t('skills.view.list') : t('skills.view.grid')}
      aria-pressed={view === mode}
      onClick={() => { setView(mode) }}
    >
      <Icon name={mode === 'list' ? 'list' : 'grid'} size={14} />
    </Button>
  )

  const rowProps = (row: RowState, status: RowStatus) => ({
    row,
    status,
    overview,
    checked: isSelected(selection, row.name),
    tokens: skillResidentTokens(cost ?? null, row.name),
    menuOpen: menuFor === row.name,
    onMenuChange: (open: boolean): void => { setMenuFor(open ? row.name : null) },
    onAction: (action: CardAction): void => { openAction(action, [row.name]) },
    onSelectToggle: () => { setSelection(prev => toggleSelection(prev, row.name)) },
    onOpen: () => { setDetailSkill(row.name) },
  })

  return (
    /* The view fills the keep-alive face: the virtual box (list / grid) runs
       in document flow (`height="document"`) — the page scrolls, no inner
       overflow box can trap the wheel — while the toolbar card stays pinned
       below the title bar (the house `aek-sticky-panel-search` frosted
       strip, the settings face's pattern). */
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* The house header + the face's actions (add + the shadcn view toggle). */}
      <ViewHeader
        icon="bookOpenText"
        title={t('panel.skillsLibrary')}
        subtitle={(
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate" title={skillsPath}>{formatDisplayPath(skillsPath, facts?.home, facts?.platform, pathStyle)}</span>
            <button
              type="button"
              onClick={copyPath}
              aria-label={t('skills.copyPath')}
              title={t('skills.copyPath')}
              className="flex h-4.5 w-4.5 flex-none items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-text"
            >
              <Icon name={pathCopied ? 'check' : 'copy'} size={11} />
            </button>
          </span>
        )}
      >
        <Button size="sm" onClick={() => { goNav({ view: 'add' }) }}>
          <Icon name="plus" size={14} />
          {t('skills.add')}
        </Button>
        <div className="flex items-center gap-0.5 rounded-lg border border-border bg-secondary/40 p-0.5">
          {viewToggle('list')}
          {viewToggle('grid')}
        </div>
      </ViewHeader>

      {/* Hub state: counts + the update strip + the resident cost, one card. */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="font-bold tabular-nums text-text">{tf('skills.stat.skills', { n: rows.length })}</CardTitle>
          <CardDescription className="text-xs">
            {tf('status.agents', { n: overview.agents.length })} · {tf('skills.stat.updatable', { n: updatableCount })}
          </CardDescription>
          <CardAction>
            {doctor.warnings.length === 0
              ? <Badge variant="secondary" className="text-2xxs">{t('skills.stat.healthy')}</Badge>
              : <Badge variant="destructive" className="text-2xxs">{tf('skills.stat.degraded', { n: doctor.warnings.length })}</Badge>}
          </CardAction>
        </CardHeader>
        {showUpdateStrip(updatableCount) && (
          <>
            <Separator />
            <CardContent className="flex items-center gap-3">
              <span className="text-xs font-bold text-accent-ink">{tf('skills.stat.updatable', { n: updatableCount })}</span>
              <Button
                size="sm"
                className="ml-auto"
                disabled={skills.busy}
                onClick={() => { void runWrite(t('skills.updateAll'), () => skills.update({ skills: updatableNames(rows) })) }}
              >
                <Icon name="refresh" size={14} />
                {t('skills.updateAll')}
              </Button>
            </CardContent>
          </>
        )}
        {showCostLine(cost ?? null) && cost !== undefined && caliber !== null && (
          <>
            <Separator />
            <CardContent className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t('skills.cost')}{' '}
                <span className="text-sm font-bold tabular-nums text-text">{formatApproxTokens(caliber.max)}</span>{' '}
                {t('skills.costUnit')} · {t('skills.costPerAgent')}
              </span>
              {caliber.dirs > 0 && (
                <span className="text-2xxs text-muted-foreground">
                  {tf('skills.costCaliber', {
                    n: caliber.dirs,
                    avg: formatApproxTokens(caliber.avg),
                    max: formatApproxTokens(caliber.max),
                  })}
                </span>
              )}
            </CardContent>
          </>
        )}
      </Card>

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

      {/* The search + filter toolbar — pinned below the title bar while the
          page scrolls, the settings face's frosted `aek-sticky-panel-search`
          strip (one quiet card, shadcn input + pills). */}
      <Card size="sm" className="aek-sticky-panel-search">
        <CardContent className="flex flex-col gap-2.5">
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" size={14} />
            </span>
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value) }}
              onKeyDown={(e) => { if (e.key === 'Escape') setQuery('') }}
              placeholder={t('skills.search')}
              className="h-9 pl-8 pr-12 text-sm"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <Badge variant="secondary" className="tabular-nums text-2xxs">{filtered.length}</Badge>
            </span>
          </div>
          {(catPills.length > 0 || srcPills.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.category')}</span>
              {catPills.map(pill => (
                <FilterPill
                  key={pill.key}
                  label={pill.label}
                  count={pill.count}
                  active={activeCats.has(pill.key)}
                  onToggle={() => { togglePill(activeCats, pill.key, setActiveCats) }}
                />
              ))}
              {catPills.length > 0 && srcPills.length > 0 && <Separator orientation="vertical" className="h-4 w-px self-center" />}
              <span className="text-2xxs font-bold text-muted-foreground">{t('skills.filter.source')}</span>
              {srcPills.map(pill => (
                <FilterPill
                  key={pill.type}
                  label={pill.type}
                  count={pill.count}
                  active={activeSrcs.has(pill.type)}
                  onToggle={() => { togglePill(activeSrcs, pill.type, setActiveSrcs) }}
                />
              ))}
              {filtersActive && (
                <Button size="xs" variant="ghost" className="ml-auto" onClick={() => { setActiveCats(new Set()); setActiveSrcs(new Set()) }}>
                  {t('skills.filter.clear')}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The selection bar */}
      {selection.active && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-secondary/40 px-3.5 py-2.5">
          <Badge variant="secondary" className="tabular-nums text-2xxs">{selectionCount(selection)} {t('skills.selected')}</Badge>
          <Button size="sm" variant="secondary" onClick={() => { openAction('distribute', [...selection.names]) }}><Icon name="users" size={14} />{t('skills.distribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('undistribute', [...selection.names]) }}>{t('skills.undistribute')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { runSelectionWrite(t('skills.updateSelected'), () => skills.update({ skills: updatableNames(selectedRows) })) }}><Icon name="refresh" size={14} />{t('skills.updateSelected')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('archive', [...selection.names]) }}>{t('skills.batch.archive')}</Button>
          <Button size="sm" variant="secondary" onClick={() => { openAction('categorize', [...selection.names]) }}>{t('skills.batch.categorize')}</Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setSelection(exitSelection(selection)) }}>{t('skills.clearSelection')}</Button>
        </div>
      )}

      {/* The library body: virtual card rows (list) or virtual tiles */}
      {filtered.length === 0
        ? <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">{t('skills.empty')}</div>
        : view === 'list'
          ? (
            <VirtualList
              items={filtered}
              rowHeight={ROW_PITCH}
              height="document"
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
              height="document"
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
  /** The skill's resident tokens in one agent context, or null when it is
   *  not in the ledger (undistributed / ledger not loaded yet). */
  tokens: number | null
  menuOpen: boolean
  onMenuChange: (open: boolean) => void
  onAction: (action: CardAction) => void
  onSelectToggle: () => void
  onOpen: () => void
}

/** The per-skill resident footprint badge: what the skill's session-catalog
 *  line (name + capped description) occupies in one agent context, with the
 *  counting caliber on hover. */
function SkillCostBadge({ tokens }: { tokens: number }) {
  const { t } = useI18n()
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Badge variant="ghost" className="shrink-0 tabular-nums text-2xxs">
          {formatApproxTokens(tokens)} {t('skills.costUnit')}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{t('skills.skillCost')}</TooltipContent>
    </Tooltip>
  )
}

/** One virtual slot's 80px card row. BQ18: the card fills the TOP of its
 *  88px slot (VirtualList wraps every row in a fixed-pitch slot); the slot's
 *  trailing 8px headroom is the inter-row gap — the card stays top-aligned so
 *  the row pitch is exact and the band never drifts off its virtual slots. */
function SkillRowView({ row, status, overview, checked, tokens, menuOpen, onMenuChange, onAction, onSelectToggle, onOpen }: RowSlotProps) {
  const dots = agentDots(overview.agents, row.distributedAgents)
  return (
    <div className={cn(
      'relative flex h-20 flex-col justify-center gap-1.5 rounded-lg border border-border bg-card px-3 transition-colors hover:border-accent/40',
      checked && 'border-primary/50 bg-secondary/30',
    )}>
      <div className="flex items-center gap-2.5">
        <Checkbox
          checked={checked}
          onCheckedChange={onSelectToggle}
          aria-label={row.name}
        />
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(status))} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-text hover:underline">
          {row.title || row.name}
        </button>
        <RowBadges row={row} status={status} />
        <RowMenu row={row} open={menuOpen} onOpenChange={onMenuChange} onAction={onAction} />
      </div>
      <div className="flex items-center gap-2 pl-11 pr-11">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {row.description !== '' ? row.description : row.name}
        </span>
        {tokens !== null && <SkillCostBadge tokens={tokens} />}
        <AgentDotRow dots={dots} />
        <SourceChip row={row} />
      </div>
    </div>
  )
}

/** One virtual grid tile (VirtualGrid's fixed h-24 contract). */
function SkillTileView({ row, status, overview, checked, tokens, menuOpen, onMenuChange, onAction, onSelectToggle, onOpen }: RowSlotProps) {
  const dots = agentDots(overview.agents, row.distributedAgents)
  return (
    <div className={cn(
      'relative flex h-24 flex-col gap-1 rounded-lg border border-border bg-card p-2.5 transition-colors hover:border-accent/40',
      checked && 'border-primary/50 bg-secondary/30',
    )}>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={onSelectToggle}
          aria-label={row.name}
        />
        <span className={cn('h-2 w-2 shrink-0 rounded-full', statusDotClass(status))} />
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-text hover:underline">
          {row.title || row.name}
        </button>
        <RowMenu row={row} open={menuOpen} onOpenChange={onMenuChange} onAction={onAction} />
      </div>
      <div className="line-clamp-2 text-xs text-muted-foreground">
        {row.description !== '' ? row.description : row.name}
      </div>
      <div className="mt-auto flex items-center gap-2">
        <RowBadges row={row} status={status} />
        {tokens !== null && <SkillCostBadge tokens={tokens} />}
        <AgentDotRow dots={dots} />
        <span className="ml-auto"><SourceChip row={row} /></span>
      </div>
    </div>
  )
}
