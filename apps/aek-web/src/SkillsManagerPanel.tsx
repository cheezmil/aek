/**
 * The skill-manager panel — the BG round: the shenysun skills-manager
 * dashboard, re-architected for the AEK console (P15: webui + backend only,
 * Electron is just the carrier).
 *
 * Data: the `@cheezmil/aek-skill-manager` host half (`/api/aek/skills/*`,
 * the SAME in-process engine the `aeksm` CLI drives). When the host predates
 * the API (404 = `unsupported`), the panel degrades to the thin CLI-bridge
 * surface (the old `SkillsPanel`) instead of a dead page.
 *
 * Interaction model = shenysun dashboard 1:1 (its domain tier is ported
 * verbatim into `./skill-manager/domain/`): search filter, selection mode
 * (checkbox in → Esc/取消 out, zero persistence), the update strip, the
 * resident-cost strip, the agent picker (per-scope memory = last confirmed
 * apply), the undistribute sheet, and the skill preview (light markdown,
 * source view toggle, no CodeMirror). V6.5 iron rule: the row list is a
 * virtual list (`./VirtualList`), never a flat DOM at hundreds of skills.
 *
 * @module @cheezmil/aek-web/src/SkillsManagerPanel
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import { VirtualList } from './VirtualList.tsx'
import { useSkills, type AgentInfo, type DistributionBySkill, type SkillRow, type SkillsOverview } from './useSkills.ts'
import { filterSkills } from './skill-manager/domain/filterSkills.ts'
import { deriveRowStatus, type RowStatus } from './skill-manager/domain/rowStatus.ts'
import { distCountsText, type DistributionTarget } from './skill-manager/domain/distribution.ts'
import {
  defaultProjectRoot,
  groupFamilies,
  initialSelection,
  rememberApply,
  searchAgents,
  type PickerAgent,
  type PickerMemory,
  selectAllVisible,
  selectDetectedVisible,
  toggleAgent,
  toggleFamily,
  clearVisible,
  type Scope,
} from './skill-manager/domain/picker.ts'
import {
  exitSelection,
  idleSelection,
  isSelected,
  selectionCount,
  toggleSelection,
  type SelectionState,
} from './skill-manager/domain/selection.ts'
import { sourceLink } from './skill-manager/domain/sourceLink.ts'
import { showCostLine, formatApproxTokens } from './skill-manager/domain/costLedger.ts'
import { showUpdateStrip, updatableNames } from './skill-manager/domain/updateStrip.ts'
import { expireNotice, idleNotice, showNotice, type NoticeSlot } from './skill-manager/domain/noticeSlot.ts'
import { removeConsequence } from './skill-manager/domain/remove.ts'
import { togglePreviewView, type PreviewView } from './skill-manager/domain/previewView.ts'
import { SkillsPanel } from './ConsolePanels.tsx'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

/** One row's derived state (the domain tier's flat input shape: the registry
 *  `SkillRow` spread + the four fields the row-status / filter / update
 *  domains reason about). */
interface RowState {
  name: string
  title: string
  category: string
  tags: string[]
  categories: string[]
  consumers: string[]
  description: string
  source: SkillRow['source']
  archived: boolean
  hasUpdate: boolean
  warning: string | null
  distributedAgents: string[]
  distribution: DistributionTarget[]
}

const ROW_HEIGHT = 64

/** Read one skill's wiring out of the per-skill map. The map's value type is
 *  not nullish (a `Record` index access), but a skill with no managed entry is
 *  genuinely absent — the helper's explicit `| undefined` return keeps that
 *  honest for the row-status / preview consumers. */
function wiringOf(map: DistributionBySkill, name: string): DistributionBySkill[string] | undefined {
  return map[name]
}

/** A uniform agent row for the picker (the catalog has no families yet). */
function toPickerAgents(agents: AgentInfo[]): PickerAgent[] {
  return agents.map(agent => ({
    id: agent.id,
    label: agent.label,
    detected: agent.detected,
    familyKey: null,
    invalidReason: null,
  }))
}

/**
 * The light markdown renderer: escape-first, then headings / bold / inline
 * code / fenced blocks / lists / links. No external library (the console's
 * stack is fixed), no CodeMirror (user ruling: light rendering only).
 */
function renderMarkdownLite(source: string): string {
  const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s: string): string => {
    let out = escape(s)
    out = out.replace(/`([^`]+)`/g, '<code class="rounded-sm bg-secondary px-1 text-xs">$1</code>')
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-primary underline">$1</a>')
    return out
  }
  const lines = source.split('\n')
  const out: string[] = []
  let inCode = false
  let listOpen = false
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (listOpen) { out.push('</ul>'); listOpen = false }
      out.push(inCode ? '</code></pre>' : '<pre class="overflow-auto rounded-md bg-secondary p-2 text-xs"><code class="text-foreground">')
      inCode = !inCode
      continue
    }
    if (inCode) {
      out.push(escape(line))
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      if (listOpen) { out.push('</ul>'); listOpen = false }
      const level = heading[1].length === 1 ? 1 : heading[1].length === 2 ? 2 : 3
      const cls = level === 1 ? 'mt-4 mb-2 text-lg font-bold' : level === 2 ? 'mt-3 mb-1.5 text-base font-bold' : 'mt-3 mb-1 text-sm font-bold'
      out.push(`<h${level} class="${cls}">${inline(heading[2])}</h${level}>`)
      continue
    }
    const listItem = line.match(/^\s*[-*]\s+(.*)$/)
    if (listItem) {
      if (!listOpen) { out.push('<ul class="my-2 list-disc pl-5">'); listOpen = true }
      out.push(`<li>${inline(listItem[1])}</li>`)
      continue
    }
    if (listOpen) { out.push('</ul>'); listOpen = false }
    if (line.trim() === '') {
      out.push('')
      continue
    }
    out.push(`<p class="my-1.5 text-sm leading-6">${inline(line)}</p>`)
  }
  if (listOpen) out.push('</ul>')
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}

/** The top overlay (agent picker / undistribute / preview / add wizard share the frame). */
function SheetFrame({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={cn('flex h-full flex-col border-l border-border bg-background shadow-lg', wide ? 'w-full max-w-2xl' : 'w-full max-w-lg')}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-bold text-text">{title}</div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label="close">
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/**
 * The skill-manager panel.
 * @param refreshSignal - a number bump re-fetches the overview.
 */
export function SkillsManagerPanel({ refreshSignal }: { refreshSignal: number }) {
  const { t } = useI18n()
  const skills = useSkills(refreshSignal)
  // Older host (no skill-hub API): degrade to the CLI-bridge console, never
  // render a dead page.
  if (skills.unsupported) return <SkillsPanel refreshSignal={refreshSignal} />

  if (skills.error !== undefined && skills.overview === undefined) {
    return (
      <PanelCard>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="alert" size={20} />
          <div className="text-sm text-muted-foreground">{t('skills.error')}: {skills.error}</div>
          <Button variant="secondary" size="sm" onClick={skills.refresh}>{t('skills.retry')}</Button>
        </div>
      </PanelCard>
    )
  }

  if (skills.overview === undefined) {
    return (
      <PanelCard>
        <div className="flex items-center justify-center gap-3 py-16"><Spinner /><span className="text-sm text-muted-foreground">{t('skills.loading')}</span></div>
      </PanelCard>
    )
  }

  return <SkillsPanelBody skills={skills} />
}

/** The loaded body: strips + toolbar + virtual rows + overlays. */
function SkillsPanelBody({ skills }: { skills: ReturnType<typeof useSkills> }) {
  const { t, tf } = useI18n()
  const overview = skills.overview as SkillsOverview
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<SelectionState>(idleSelection)
  const [noticeSlot, setNoticeSlot] = useState<NoticeSlot>(idleNotice)
  // Overlays: at most one open; each keeps its session payload separately.
  const [previewSkill, setPreviewSkill] = useState<string | null>(null)
  const [picker, setPicker] = useState<{ scope: Scope; skills: string[]; projectRoot: string } | null>(null)
  const [undistribute, setUndistribute] = useState<{ scope: Scope; skills: string[]; projectRoot: string } | null>(null)
  const [adding, setAdding] = useState(false)

  const agents = useMemo(() => toPickerAgents(overview.agents), [overview.agents])

  const rows: RowState[] = useMemo(() => {
    const updatable = new Set((skills.updatePlan ?? []).flatMap(group => group.skills.map(item => item.skill)))
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
  }, [overview, skills.updatePlan])

  const filtered = useMemo(() => filterSkills(rows, query), [rows, query])
  const updatableCount = updatableNames(rows).length
  const selectedRows = useMemo(() => rows.filter(row => isSelected(selection, row.name)), [rows, selection])

  const announce = useCallback((kind: 'ok' | 'error', text: string): void => {
    setNoticeSlot(prev => expireNotice(showNotice(prev, kind, text, Date.now()), Date.now()))
  }, [])
  const runWrite = useCallback(async (label: string, action: () => Promise<boolean>): Promise<void> => {
    const ok = await action()
    setSelection(prev => (ok ? exitSelection(prev) : prev))
    announce(ok ? 'ok' : 'error', ok ? label : `${label} ✕`)
  }, [announce])

  // Esc: closes the topmost sheet, else exits selection (the bare page).
  useEffect(() => {
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (previewSkill !== null || picker !== null || undistribute !== null || adding) {
        setPreviewSkill(null)
        setPicker(null)
        setUndistribute(null)
        setAdding(false)
        return
      }
      setSelection(exitSelection)
    }
    window.addEventListener('keydown', onKeydown)
    return () => { window.removeEventListener('keydown', onKeydown) }
  }, [previewSkill, picker, undistribute, adding])

  const notice = noticeSlot.notice
  const cost = skills.cost

  // Selection-bar handlers (block-body: the void-expression lint rule).
  const openPickerFromSelection = (): void => {
    setPicker({ scope: 'user', skills: [...selection.names], projectRoot: defaultProjectRoot(overview.projects) })
  }
  const openUndistributeFromSelection = (): void => {
    setUndistribute({ scope: 'user', skills: [...selection.names], projectRoot: defaultProjectRoot(overview.projects) })
  }
  const updateSelected = (): void => {
    void runWrite(t('skills.updateSelected'), () => skills.update({ skills: updatableNames(selectedRows) }))
  }
  const clearSelection = (): void => {
    setSelection(exitSelection(selection))
  }

  return (
    <PanelCard>
      <div className="flex flex-col gap-4">
        {/* Home + bootstrap state line */}
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
            {overview.doctor.warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {overview.doctor.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
              </ul>
            )}
          </div>
        )}

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

        {/* The resident-cost strip (visible iff any physical path carries a distribution) */}
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

        {/* Toolbar: search + add + selection actions */}
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <PanelSearch value={query} onChange={setQuery} placeholder={t('skills.search')} badge={String(filtered.length)} />
          </div>
          <Button size="sm" onClick={() => { setAdding(true) }}><Icon name="plus" size={14} /><span className="ml-1">{t('skills.add')}</span></Button>
        </div>

        {selection.active && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-secondary/40 px-3 py-2">
            <Badge variant="secondary">{selectionCount(selection)} {t('skills.selected')}</Badge>
            <Button size="sm" variant="secondary" onClick={openPickerFromSelection}>{t('skills.distribute')}</Button>
            <Button size="sm" variant="secondary" onClick={openUndistributeFromSelection}>{t('skills.undistribute')}</Button>
            <Button size="sm" variant="secondary" onClick={updateSelected}>{t('skills.updateSelected')}</Button>
            <Button size="sm" variant="ghost" onClick={clearSelection}>{t('skills.clearSelection')}</Button>
          </div>
        )}

        {/* The library: virtual row list (V6.5 iron rule) */}
        {filtered.length === 0
          ? <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">{t('skills.empty')}</div>
          : (
            <VirtualList
              items={filtered}
              rowHeight={ROW_HEIGHT}
              height={420}
              renderRow={(index) => {
                const row = filtered[index]
                const status = deriveRowStatus({
                  hasUpdate: row.hasUpdate,
                  detection: 'skipped',
                  warning: row.warning,
                  distributedAgents: row.distributedAgents,
                  distribution: row.distribution,
                })
                return (
                  <SkillRowView
                    key={row.name}
                    row={row}
                    status={status}
                    checked={isSelected(selection, row.name)}
                    onSelectToggle={() => { setSelection(prev => toggleSelection(prev, row.name)) }}
                    onOpen={() => { setPreviewSkill(row.name) }}
                  />
                )
              }}
            />
          )}
      </div>

      {/* The notice line (single slot, 4s TTL) */}
      {notice !== null && (
        <div className={cn('mt-3 rounded-md px-3 py-2 text-sm', notice.kind === 'ok' ? 'bg-secondary text-text' : 'bg-destructive/10 text-destructive')}>
          {notice.text}
        </div>
      )}

      {/* Overlays */}
      {previewSkill !== null && (
        <PreviewSheet
          overview={overview}
          skill={previewSkill}
          fetchDetail={skills.refreshDetail}
          onUndistribute={() => {
            setUndistribute({ scope: 'user', skills: [previewSkill], projectRoot: defaultProjectRoot(overview.projects) })
            setPreviewSkill(null)
          }}
          onClose={() => { setPreviewSkill(null) }}
        />
      )}
      {picker !== null && (
        <AgentPickerSheet
          agents={agents}
          scope={picker.scope}
          knownProjects={overview.projects}
          busy={skills.busy}
          onConfirm={(agentsSel, projectRoot, scope) => {
            void runWrite(tf('skills.distributeDone', { n: picker.skills.length }), async () => {
              const ok = await skills.distribute({ to: scope, skills: picker.skills, agents: agentsSel, projectRoot: projectRoot })
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
            void runWrite(tf('skills.undistributeDone', { n: undistribute.skills.length }), async () => {
              const ok = await skills.undistribute({ to: scope, skills: undistribute.skills, agents: agentsSel, projectRoot })
              if (ok) setUndistribute(null)
              return ok
            })
          }}
          onClose={() => { setUndistribute(null) }}
        />
      )}
      {adding && (
        <AddWizardSheet
          busy={skills.busy}
          onAdd={(source, overwrite) => {
            void skills.add(source, { overwrite }).then((ok) => { if (ok) setAdding(false) })
          }}
          onClose={() => { setAdding(false) }}
        />
      )}
    </PanelCard>
  )
}

/** One library row: checkbox + title + status badge + distribution + source. */
function SkillRowView({ row, status, checked, onSelectToggle, onOpen }: {
  row: RowState
  status: RowStatus
  checked: boolean
  onSelectToggle: () => void
  onOpen: () => void
}) {
  const { t, tf } = useI18n()
  const rowLink = sourceLink({
    type: row.source?.type ?? 'local',
    url: row.source?.url ?? '',
    subpath: row.source?.subpath ?? null,
    ref: row.source?.ref ?? null,
  })
  const statusBadge = (() => {
    switch (status.kind) {
      case 'warning': return <Badge variant="destructive">{t('skills.status.warning')}</Badge>
      case 'detectionFailed': return <Badge variant="destructive">{t('skills.status.detectionFailed')}</Badge>
      case 'updatable': return <Badge variant="secondary">{t('skills.status.updatable')}</Badge>
      case 'distributed': return <Badge variant="outline">{distCountsText((key, n) => tf(key, { n }), status.agentCount, status.projectCount)}</Badge>
      case 'unlinked': return <Badge variant="ghost">{t('skills.status.unlinked')}</Badge>
    }
  })()
  return (
    <div
      className={cn('flex items-center gap-3 border-b border-border px-2', checked && 'bg-secondary/40')}
      style={{ height: ROW_HEIGHT }}
    >
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
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {row.category !== 'general' && <span>{row.category} · </span>}
            {row.description}
          </div>
        </div>
        {rowLink !== null && rowLink.href !== null && (
          <a href={rowLink.href} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation() }} className="text-xs text-primary underline">
            {rowLink.label}
          </a>
        )}
        {statusBadge}
      </button>
    </div>
  )
}

/** The preview sheet: markdown (light) / source, distribution + undistribute. */
function PreviewSheet({ overview, skill, fetchDetail, onUndistribute, onClose }: {
  overview: SkillsOverview
  skill: string
  fetchDetail: (skill: string) => Promise<import('./useSkills.ts').SkillDetail | undefined>
  onUndistribute: () => void
  onClose: () => void
}) {
  const { t, tf } = useI18n()
  const [view, setView] = useState<PreviewView>('rendered')
  const [body, setBody] = useState<string>('')
  useEffect(() => {
    let cancelled = false
    void fetchDetail(skill).then((d) => {
      if (!cancelled && d !== undefined) setBody(d.body)
    })
    return () => { cancelled = true }
  }, [fetchDetail, skill])
  const row = overview.skills.find(candidate => candidate.name === skill)
  const wiring = wiringOf(overview.distributionBySkill, skill)
  const source = row?.source ?? null
  const link = source !== null
    ? sourceLink({
      type: source.type ?? 'local',
      url: source.url ?? '',
      subpath: source.subpath ?? null,
      ref: source.ref ?? null,
    })
    : null

  return (
    <SheetFrame title={skill} onClose={onClose} wide>
      <div className="mb-3 flex items-center gap-2">
        {row?.archived && <Badge variant="ghost">{t('skills.archived')}</Badge>}
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => { setView(v => togglePreviewView(v)) }}>
          {view === 'rendered' ? t('skills.preview.source') : t('skills.preview.rendered')}
        </Button>
        {wiring !== undefined && wiring.targets.length > 0 && (
          <Button size="sm" variant="secondary" onClick={onUndistribute}>{t('skills.undistribute')}</Button>
        )}
      </div>
      {view === 'rendered'
        ? <div className="text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(body) }} />
        : <pre className="overflow-auto rounded-md bg-secondary p-3 text-xs text-foreground">{body}</pre>}
      {link !== null && (
        <div className="mt-4">
          <Separator />
          <div className="mt-3 text-xs text-muted-foreground">
            {t('skills.preview.source')}:{' '}
            {link.href !== null
              ? <a href={link.href} target="_blank" rel="noreferrer" className="text-primary underline">{link.label}</a>
              : link.label}
          </div>
        </div>
      )}
      {wiring !== undefined && wiring.targets.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-bold text-muted-foreground">{t('skills.preview.distribution')}</div>
          <ul className="text-xs text-text">
            {wiring.targets.map(target => (
              <li key={`${target.kind}-${target.targetRoot}`} className="flex flex-wrap gap-2">
                <Badge variant="secondary">{target.kind}</Badge>
                <span>{target.targetRoot}</span>
                <span className="text-muted-foreground">
                  {distCountsText((key, n) => tf(key, { n }), target.entries.reduce((sum, entry) => sum + entry.agents.length, 0), target.kind === 'project' ? 1 : 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SheetFrame>
  )
}

/** The agent picker sheet (user/project scope, per-scope memory). */
function AgentPickerSheet({ agents, scope, knownProjects, busy, onConfirm, onClose }: {
  agents: PickerAgent[]
  scope: Scope
  knownProjects: string[]
  busy: boolean
  onConfirm: (agents: string[], projectRoot: string | undefined, scope: Scope) => string[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const [pickerScope, setPickerScope] = useState<Scope>(scope)
  const [query, setQuery] = useState('')
  const [projectRoot, setProjectRoot] = useState(() => defaultProjectRoot(knownProjects))
  const [memory, setMemory] = useState<PickerMemory>({})
  const [selected, setSelected] = useState<string[]>(() => initialSelection(agents, memory[scope] ?? null))
  const visible = searchAgents(agents, query)
  const { families, singletons } = groupFamilies(visible)

  const switchScope = (next: Scope): void => {
    setPickerScope(next)
    setSelected(initialSelection(agents, memory[next] ?? null))
    setProjectRoot(defaultProjectRoot(knownProjects))
  }

  const confirm = (): void => {
    setMemory(prev => rememberApply(prev, pickerScope, selected))
    onConfirm(selected, pickerScope === 'project' ? projectRoot : undefined, pickerScope)
  }

  return (
    <SheetFrame title={t('skills.picker.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={pickerScope === 'user' ? 'default' : 'secondary'} onClick={() => { switchScope('user') }}>{t('skills.picker.user')}</Button>
          <Button size="sm" variant={pickerScope === 'project' ? 'default' : 'secondary'} onClick={() => { switchScope('project') }}>{t('skills.picker.project')}</Button>
        </div>
        {pickerScope === 'project' && (
          <div>
            <Label className="text-xs text-muted-foreground">{t('skills.picker.projectRoot')}</Label>
            <Input value={projectRoot} onChange={(e) => { setProjectRoot(e.target.value) }} className="mt-1 text-xs" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex-1"><PanelSearch value={query} onChange={setQuery} placeholder={t('skills.picker.search')} /></div>
          <Button size="sm" variant="ghost" onClick={() => { setSelected(prev => selectDetectedVisible(visible, query, prev)) }}>{t('skills.picker.selectDetected')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setSelected(prev => selectAllVisible(visible, query, prev)) }}>{t('skills.picker.selectAll')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setSelected(prev => clearVisible(visible, query, prev)) }}>{t('skills.picker.clear')}</Button>
        </div>
        <ul className="flex flex-col gap-1">
          {families.map(family => (
            <li key={family.familyKey}>
              <div className="flex items-center gap-2 px-1 py-1 text-xs font-bold text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={family.members.every(member => selected.includes(member.id))}
                  onChange={() => { setSelected(prev => toggleFamily(visible, prev, family.familyKey)) }}
                />
                {family.familyKey}
              </div>
              {family.members.map(member => (
                <PickerRow
                  key={member.id}
                  agent={member}
                  checked={selected.includes(member.id)}
                  onToggle={() => { setSelected(prev => toggleAgent(prev, member.id)) }}
                />
              ))}
            </li>
          ))}
          {singletons.map(member => (
            <PickerRow
              key={member.id}
              agent={member}
              checked={selected.includes(member.id)}
              onToggle={() => { setSelected(prev => toggleAgent(prev, member.id)) }}
              bare
            />
          ))}
        </ul>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{String(selected.length)} {t('skills.selected')}</div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
            <Button size="sm" disabled={busy || selected.length === 0} onClick={confirm}>{t('skills.distribute')}</Button>
          </div>
        </div>
      </div>
    </SheetFrame>
  )
}

function PickerRow({ agent, checked, onToggle, bare }: {
  agent: PickerAgent
  checked: boolean
  onToggle: () => void
  bare?: boolean
}) {
  const { t } = useI18n()
  return (
    <li>
      <label className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary', bare ? '' : 'ml-3')}>
        <input type="checkbox" className="h-4 w-4" checked={checked} onChange={onToggle} />
        <span className="flex-1 text-text">{agent.label}</span>
        {agent.detected && <Badge variant="secondary" className="text-2xxs">{t('skills.picker.detected')}</Badge>}
      </label>
    </li>
  )
}

/** The undistribute sheet. */
function UndistributeSheet({ overview, skills, busy, onConfirm, onClose }: {
  overview: SkillsOverview
  skills: string[]
  busy: boolean
  onConfirm: (scope: Scope, agents: string[], projectRoot?: string) => void
  onClose: () => void
}) {
  const { t, tf } = useI18n()
  const [scope, setScope] = useState<Scope>('user')
  const [projectRoot, setProjectRoot] = useState(() => defaultProjectRoot(overview.projects))
  const targetRows = skills.map(name => ({ name, skill: overview.skills.find(candidate => candidate.name === name) }))
  const consequence = removeConsequence(targetRows.map((target) => {
    const wiring = wiringOf(overview.distributionBySkill, target.name)
    return { distributedAgents: wiring?.agents ?? [] }
  }))
  const selectedAgents = overview.agents.map(agent => agent.id)

  const confirmNow = (): void => {
    onConfirm(scope, selectedAgents, scope === 'project' ? projectRoot : undefined)
  }

  return (
    <SheetFrame title={t('skills.undist.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button size="sm" variant={scope === 'user' ? 'default' : 'secondary'} onClick={() => { setScope('user') }}>{t('skills.picker.user')}</Button>
          <Button size="sm" variant={scope === 'project' ? 'default' : 'secondary'} onClick={() => { setScope('project') }}>{t('skills.picker.project')}</Button>
        </div>
        {scope === 'project' && (
          <div>
            <Label className="text-xs text-muted-foreground">{t('skills.picker.projectRoot')}</Label>
            <Input value={projectRoot} onChange={(e) => { setProjectRoot(e.target.value) }} className="mt-1 text-xs" />
          </div>
        )}
        <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {tf('skills.undist.consequence', { skills: consequence.skillCount, agents: consequence.agentCount })}
        </div>
        <ul className="text-sm text-text">
          {targetRows.map(target => <li key={target.name} className="py-0.5">{target.name}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={confirmNow}>
            {t('skills.undist.confirm')}
          </Button>
        </div>
      </div>
    </SheetFrame>
  )
}

/** The add wizard (source input → install). */
function AddWizardSheet({ busy, onAdd, onClose }: {
  busy: boolean
  onAdd: (source: string, overwrite: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [source, setSource] = useState('')
  const [overwrite, setOverwrite] = useState(false)

  return (
    <SheetFrame title={t('skills.add')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">{t('skills.addSource')}</Label>
          <Input
            value={source}
            onChange={(e) => { setSource(e.target.value) }}
            placeholder={t('skills.addSourcePlaceholder')}
            className="mt-1"
          />
          <div className="mt-1 text-xs text-muted-foreground">{t('skills.addSourceHint')}</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" className="h-4 w-4" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked) }} />
          {t('skills.addOverwrite')}
        </label>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
          <Button size="sm" disabled={busy || source.trim() === ''} onClick={() => { onAdd(source.trim(), overwrite) }}>{t('skills.addInstall')}</Button>
        </div>
      </div>
    </SheetFrame>
  )
}
