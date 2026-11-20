/**
 * The library view's overlay sheets: the agent picker (user/project scope,
 * per-scope memory = the last confirmed apply), the undistribute confirm,
 * the skill detail (markdown / source, source meta, the operable category
 * axis, distribution), and the two BH-round write faces — the non-
 * destructive archive confirm and the batch categorize.
 *
 * Every confirm is in-UI (P15/P16 + the no-native-dialog rule): the host's
 * 428 confirm-required rule is satisfied by `useSkills` sending
 * `confirm: true`; the sheet's own button is the human confirmation.
 */
import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { PanelSearch, Spinner } from '../../ui-kit.tsx'
import {
  type SkillsOverview,
} from '../../useSkills.ts'
import { sourceLink } from '../domain/sourceLink.ts'
import { distCountsText } from '../domain/distribution.ts'
import { removeConsequence } from '../domain/remove.ts'
import { archiveConsequence } from '../domain/archiveAsk.ts'
import { agentDots } from '../domain/agentDots.ts'
import { togglePreviewView, type PreviewView } from '../domain/previewView.ts'
import {
  clearVisible,
  defaultProjectRoot,
  groupFamilies,
  initialSelection,
  type PickerAgent,
  type PickerMemory,
  rememberApply,
  searchAgents,
  type Scope,
  selectAllVisible,
  selectDetectedVisible,
  toggleAgent,
  toggleFamily,
} from '../domain/picker.ts'
import { SheetFrame, useRunWrite, useSkillView, wiringOf } from './shared.tsx'
import { renderMarkdownLite } from './markdown.ts'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

/** The agent picker sheet (user/project scope, per-scope memory). */
export function AgentPickerSheet({ agents, scope, knownProjects, busy, onConfirm, onClose }: {
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

/** The undistribute confirm sheet. */
export function UndistributeSheet({ overview, skills, busy, onConfirm, onClose }: {
  overview: SkillsOverview
  skills: string[]
  busy: boolean
  onConfirm: (scope: Scope, agents: string[], projectRoot?: string) => void
  onClose: () => void
}) {
  const { t, tf } = useI18n()
  const [scope, setScope] = useState<Scope>('user')
  const [projectRoot, setProjectRoot] = useState(() => defaultProjectRoot(overview.projects))
  const targetRows = skills.map(name => ({ name, row: overview.skills.find(candidate => candidate.name === name) }))
  const consequence = removeConsequence(targetRows.map((target) => {
    const wiring = wiringOf(overview.distributionBySkill, target.name)
    return { distributedAgents: wiring?.agents ?? [] }
  }))

  const confirmNow = (): void => {
    onConfirm(scope, overview.agents.map(agent => agent.id), scope === 'project' ? projectRoot : undefined)
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
          {targetRows.map(target => <li key={target.name} className="py-0.5">{target.row?.title ?? target.name}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
          <Button size="sm" variant="destructive" disabled={busy} onClick={confirmNow}>{t('skills.undist.confirm')}</Button>
        </div>
      </div>
    </SheetFrame>
  )
}

/** One skill's detail sheet: the light-markdown body + source meta + the
 *  operable category axis + distribution wiring. */
export function DetailSheet({ skill, onClose, onUndistribute, onArchive }: {
  skill: string
  onClose: () => void
  onUndistribute: (skill: string) => void
  onArchive: (skill: string) => void
}) {
  const { t, tf } = useI18n()
  const { skills } = useSkillView()
  const runWrite = useRunWrite()
  const [view, setView] = useState<PreviewView>('rendered')
  const [body, setBody] = useState('')
  const [newCategory, setNewCategory] = useState('')

  useEffect(() => {
    let cancelled = false
    void skills.refreshDetail(skill).then((detail) => {
      if (!cancelled && detail !== undefined) setBody(detail.body)
    })
    return () => { cancelled = true }
  }, [skills, skill])

  const overview = skills.overview as SkillsOverview
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
  const dots = agentDots(overview.agents, row !== undefined ? wiring?.agents ?? [] : [])

  const addCategory = (): void => {
    const value = newCategory.trim()
    if (value === '') return
    void runWrite(tf('skills.categorizeDone', { n: 1 }), async () => {
      const ok = await skills.applyCategories('add', skill, [value])
      if (ok) setNewCategory('')
      return ok
    })
  }

  const removeCategory = (value: string): void => {
    void runWrite(tf('skills.categorizeDone', { n: 1 }), () => skills.applyCategories('remove', skill, [value]))
  }

  const updateNow = (): void => {
    void runWrite(t('skills.detail.updateNow'), () => skills.update({ skills: [skill] }))
  }

  return (
    <SheetFrame title={row?.title ?? skill} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {row?.archived === true && <Badge variant="ghost">{t('skills.archived')}</Badge>}
          <div className="flex-1" />
          {row?.hasUpdate === true && (
            <Button size="sm" variant="secondary" disabled={skills.busy} onClick={updateNow}>{t('skills.detail.updateNow')}</Button>
          )}
          {wiring !== undefined && wiring.targets.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => { onUndistribute(skill) }}>{t('skills.undistribute')}</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => { onArchive(skill) }}>{t('skills.menu.archive')}</Button>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="text-xs font-bold text-muted-foreground">{t('skills.detail.preview')}</div>
            <Button size="sm" variant="ghost" onClick={() => { setView(current => togglePreviewView(current)) }}>
              {view === 'rendered' ? t('skills.preview.source') : t('skills.preview.rendered')}
            </Button>
          </div>
          {body === ''
            ? <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Spinner /> {t('skills.loading')}</div>
            : view === 'rendered'
              ? <div className="text-foreground" dangerouslySetInnerHTML={{ __html: renderMarkdownLite(body) }} />
              : <pre className="overflow-auto rounded-md bg-secondary p-3 text-xs text-foreground">{body}</pre>}
        </div>

        {link !== null && (
          <div>
            <Separator />
            <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
              <div className="text-sm font-bold text-text">{t('skills.detail.sourceMeta')}</div>
              <div>
                <span className="mr-2">{source?.type ?? 'local'}</span>
                {link.href !== null
                  ? <a href={link.href} target="_blank" rel="noreferrer" className="text-primary underline">{link.label}</a>
                  : <span>{link.label}</span>}
              </div>
              {source?.subpath !== null && source?.subpath !== undefined && <div>subpath: {source.subpath}</div>}
              {source?.ref !== null && source?.ref !== undefined && <div>ref: {source.ref}</div>}
              {source?.upstream_tree !== null && source?.upstream_tree !== undefined && (
                <div>{t('skills.detail.upstream')}: {source.upstream_tree}</div>
              )}
            </div>
          </div>
        )}

        <div>
          <Separator />
          <div className="mt-3 text-sm font-bold text-text">{t('skills.detail.categories')}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {(row?.categories ?? []).map(category => (
              <span key={category} className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-text">
                {category}
                <button
                  type="button"
                  aria-label={`${t('skills.detail.removeCategory')} ${category}`}
                  onClick={() => { removeCategory(category) }}
                  className="rounded-sm px-0.5 text-muted-foreground hover:bg-background"
                >
                  ×
                </button>
              </span>
            ))}
            <Input
              value={newCategory}
              onChange={(e) => { setNewCategory(e.target.value) }}
              onKeyDown={(e) => { if (e.key === 'Enter') addCategory() }}
              placeholder={t('skills.detail.addCategory')}
              className="h-6 w-48 text-xs"
              disabled={skills.busy}
            />
          </div>
        </div>

        <div>
          <Separator />
          <div className="mt-3 text-sm font-bold text-text">{t('skills.preview.distribution')}</div>
          {wiring !== undefined && wiring.targets.length > 0 ? (
            <div className="mt-2 flex flex-col gap-2">
              <ul className="text-xs text-text">
                {wiring.targets.map(target => (
                  <li key={`${target.kind}-${target.targetRoot}`} className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{target.kind}</Badge>
                    <span>{target.targetRoot}</span>
                    <span className="text-muted-foreground">
                      {distCountsText((key, n) => tf(key, { n }), target.entries.reduce((sum, entry) => sum + entry.agents.length, 0), target.kind === 'project' ? 1 : 0)}
                    </span>
                  </li>
                ))}
              </ul>
              <AgentDotRow dots={dots} />
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">{t('skills.detail.notDistributed')}</div>
          )}
        </div>
      </div>
    </SheetFrame>
  )
}

/** The per-agent sync-dot row (catalog order, capped, overflow +N). */
export function AgentDotRow({ dots }: { dots: ReturnType<typeof agentDots> }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-0.5">
        {dots.dots.map(dot => (
          <span
            key={dot.id}
            title={dot.label}
            className={cn('h-1.5 w-1.5 rounded-full', dot.on ? 'bg-chart-2' : 'bg-chart-5')}
          />
        ))}
      </span>
      {dots.more > 0 && <span className="text-2xxs">+{dots.more}</span>}
    </div>
  )
}

/** The non-destructive archive confirm (there is no delete in the engine). */
export function ArchiveSheet({ skillsNames, onDone, onClose }: {
  skillsNames: string[]
  onDone: () => void
  onClose: () => void
}) {
  const { t, tf } = useI18n()
  const { skills } = useSkillView()
  const runWrite = useRunWrite()
  const overview = skills.overview as SkillsOverview
  const consequence = archiveConsequence(
    skillsNames,
    skillsNames.map(name => ({ skill: name, agents: wiringOf(overview.distributionBySkill, name)?.agents ?? [] })),
  )

  const confirm = (): void => {
    void runWrite(tf('skills.archiveDone', { n: consequence.skillCount }), async () => {
      const ok = await skills.archive(skillsNames)
      if (ok) onDone()
      return ok
    })
  }

  return (
    <SheetFrame title={t('skills.archive.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {tf('skills.archive.consequence', { skills: consequence.skillCount, agents: consequence.agentCount })}
        </div>
        <ul className="text-sm text-text">
          {skillsNames.map(name => <li key={name} className="py-0.5">{name}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
          <Button size="sm" variant="destructive" disabled={skills.busy} onClick={confirm}>{t('skills.archive.confirm')}</Button>
        </div>
      </div>
    </SheetFrame>
  )
}

/** The batch categorize (one category value onto every selected skill). */
export function CategorizeSheet({ skillsNames, onDone, onClose }: {
  skillsNames: string[]
  onDone: () => void
  onClose: () => void
}) {
  const { t, tf } = useI18n()
  const { skills } = useSkillView()
  const runWrite = useRunWrite()
  const [value, setValue] = useState('')

  const confirm = (): void => {
    const target = value.trim()
    if (target === '') return
    void runWrite(tf('skills.categorizeDone', { n: skillsNames.length }), async () => {
      const results = await Promise.all(skillsNames.map(name => skills.applyCategories('add', name, [target])))
      const ok = results.every(Boolean)
      if (ok) {
        onDone()
        setValue('')
      }
      return ok
    })
  }

  return (
    <SheetFrame title={t('skills.categorize.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">{t('skills.categorize.placeholder')}</Label>
          <Input
            value={value}
            onChange={(e) => { setValue(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
            className="mt-1"
            autoFocus
          />
        </div>
        <div className="rounded-md bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {value.trim() === ''
            ? tf('skills.categorize.hint', { name: '…', n: skillsNames.length })
            : tf('skills.categorize.hint', { name: value.trim(), n: skillsNames.length })}
        </div>
        <ul className="text-sm text-text">
          {skillsNames.map(name => <li key={name} className="py-0.5">{name}</li>)}
        </ul>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>{t('skills.cancel')}</Button>
          <Button size="sm" disabled={skills.busy || value.trim() === ''} onClick={confirm}>{t('skills.categorize.confirm')}</Button>
        </div>
      </div>
    </SheetFrame>
  )
}
