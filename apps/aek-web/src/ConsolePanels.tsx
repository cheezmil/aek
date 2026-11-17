/**
 * Skill Manager / Prompt Manager surfaces — EVERY capability is clickable.
 *
 * 2026-11-11: these two plugins are NOT mounted in the web profile's
 * `cordis.patch.yml`, so `ctx.skillsManager` / `ctx.promptManager` do not exist
 * in this host. Their CLIs (`aeksm`, `aekpm`) are the real primary interface,
 * so the host bridge `/api/aek/plugin-console` exposes the complete command
 * catalogue and runs one whitelisted command at a time. The UI here is a thin
 * viewer/button layer over that bridge — no duplicated business logic.
 *
 * - Quick actions = read-only commands, one click.
 * - Full roster = every command, searchable, selectable, with editable args.
 * - Write commands need an explicit checkbox before the Run button works.
 * - Output (stdout / stderr / exit code / duration) is shown inline, copyable.
 * - All collections are unordered `<ul>/<li>`; no progress bars (Spinner only).
 *
 * @module @cheezmil/aek-web/src/ConsolePanels
 */
import { useEffect, useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { CopyButton, OutputView, PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import { usePluginConsole } from './usePluginConsole.ts'
import type { ConsoleCommand } from './usePluginConsole.ts'

/** Number of one-click read-only buttons shown at the top. */
const QUICK_LIMIT = 8

/**
 * @returns the shared command console for one manager plugin.
 *
 * Q round (2026-11-12): the `managerBar` (CLI / version / A1 / 基础语言) was
 * cut — the user called it noise — and so was the "工作区插件目录" roster,
 * which is the About page's job. The card header (title / subtitle / refresh
 * row) is gone as well: the refresh now lives on the sidebar row icon.
 * Output is rendered through the virtualized {@link OutputView}, so the host
 * no longer has to truncate it.
 */
function ManagerPanel({ pluginId, refreshSignal }: {
  pluginId: string
  /** How many sidebar refresh clicks are pending for this page. */
  refreshSignal: number
}) {
  const { t } = useI18n()
  const state = usePluginConsole()

  // Sidebar-row refresh (Q round): re-read the command catalogue.
  useEffect(() => {
    if (refreshSignal > 0) state.refresh()
  }, [refreshSignal, state.refresh])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ConsoleCommand | undefined>(undefined)
  const [commandLine, setCommandLine] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [notice, setNotice] = useState('')

  const plugin = state.catalog?.plugins.find(item => item.id === pluginId)
  const commands = plugin?.commands ?? []
  const needle = query.trim().toLowerCase()
  const visible = needle.length === 0
    ? commands
    : commands.filter(command => `${command.name} ${command.label}`.toLowerCase().includes(needle))
  const quick = commands.filter(command => !command.mutating).slice(0, QUICK_LIMIT)

  const pick = (command: ConsoleCommand) => {
    setSelected(command)
    setCommandLine(command.args.join(' '))
    setConfirm(false)
    setNotice('')
  }

  const execute = (command: ConsoleCommand, line: string, confirmed: boolean) => {
    if (command.mutating && !confirmed) {
      setNotice(t('managers.confirmNeeded'))
      return
    }
    // V round: the placeholder advertises the full `<cli> <args>` shape
    // ("aeksm status"), so tolerate a leading CLI token — `aeksm status` and
    // `status` both run the same command.
    const tokens = line.trim().split(/\s+/u).filter(Boolean)
    if (plugin?.cli !== undefined && tokens[0] === plugin.cli) tokens.shift()
    if (tokens.length === 0) return
    setNotice('')
    void state.run(pluginId, tokens, confirmed)
  }

  const output = state.result === undefined
    ? ''
    : [state.result.stdout, state.result.stderr].filter(Boolean).join('\n')
  const outputLabel = state.result === undefined
    ? ''
    : `${plugin?.cli ?? ''} ${state.result.command.join(' ')}`

  return (
    <PanelCard>
      <div className="p-6">
        {state.error !== undefined
          ? <div className="mb-4 flex items-center gap-2 rounded-sm border border-danger-border bg-danger-soft p-4 text-xs-plus text-danger"><Icon name="alert" size={16} /><span>{state.error}</span></div>
          : null}
        {notice !== ''
          ? <div className="mb-4 flex items-center gap-2 rounded-sm border border-danger-border bg-danger-soft p-4 text-xs-plus text-danger"><Icon name="alert" size={16} /><span>{notice}</span></div>
          : null}
        {state.loading ? <div className="flex min-h-30 items-center justify-center gap-2 text-xs-plus text-text-muted"><Spinner />{t('common.loading')}</div> : null}

        {/* FF-NOTE: .sectionTitle had letter-spacing: 0.01em → tracking-normal; the ::before accent bar
            (top 3px, radius 2px) maps to top-0.75 / rounded-xs pending 0.25-step decimal support. */}
        <h3 className="relative mt-8 mb-4 first:mt-0 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[''] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary">{t('managers.allCommands')}</h3>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('managers.searchCommands')} />
        <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
          {visible.map(command => (
            <li key={command.name} className="flex items-center gap-2 rounded-sm border border-border bg-secondary p-1 px-2">
              <button
                type="button"
                className="group flex flex-1 min-w-0 items-baseline gap-3 cursor-pointer bg-transparent py-0.5 text-left text-text"
                onClick={() =>{  pick(command) }}
                aria-pressed={selected?.name === command.name}
              >
                <span className="flex-none text-xs font-semibold group-hover:text-accent-ink">{command.name}</span>
                <span className="flex-1 min-w-0 truncate text-2xs text-text-muted">{command.label}</span>
              </button>
              <span className={command.mutating
                ? 'flex-none rounded-full bg-secondary px-2 py-0.25 text-xs font-semibold text-danger'
                /* FF-NOTE: .badgeSuccess had color: #15803d → text-success (#16a34a); its
                   border-color: var(--aek-success-border) is dropped (the rule sets no
                   border-width, so no border was rendered). */
                : 'bg-success-soft text-success'}>
                {command.mutating ? t('managers.write') : t('managers.readonly')}
              </span>
            </li>
          ))}
        </ul>
        {visible.length === 0 && !state.loading
          ? <div className="flex min-h-30 items-center justify-center gap-2 text-xs-plus text-text-muted">{t('managers.empty')}</div>
          : null}

        <div className="my-6 h-px bg-border" />
        {/* W round: the one-click read-only actions sit DIRECTLY ABOVE the
            运行 section (the user's placement), not above 全部命令. */}
        <h3 className="relative mt-8 mb-4 first:mt-0 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[''] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary">{t('managers.quick')}</h3>
        <div className="flex flex-wrap gap-2">
          {quick.map(command => (
            <button
              key={command.name}
              type="button"
              className="cursor-pointer rounded-sm border border-border bg-secondary p-1.25 px-3 text-xs text-text enabled:hover:border-accent-border enabled:hover:bg-accent-soft disabled:cursor-default disabled:opacity-45"
              disabled={state.running || plugin?.available !== true}
              onClick={() =>{  execute(command, command.args.join(' '), false) }}
              title={command.label}
            >
              {command.name}
            </button>
          ))}
          {quick.length === 0 && !state.loading
            ? <div className="flex min-h-30 items-center justify-center gap-2 text-xs-plus text-text-muted">{t('managers.empty')}</div>
            : null}
        </div>

        <div className="my-6 h-px bg-border" />
        <h3 className="relative mt-8 mb-4 first:mt-0 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[''] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary">{t('managers.run')}</h3>
        <div className="flex flex-nowrap items-center gap-2">
          {/* Y round: an EMPTY box shows no text at all — the placeholder
              ("aeksm status" / the args hint) was noise. The accessible name
              stays; the V-round tolerance for a typed leading CLI token is
              unchanged.
              FF-NOTE: .textInput / .managerForm descendant rules now exact via the 0.25-step scale + rounded-xs (6px). */}
          <input
            className="w-full flex-1 min-w-30 rounded-xs border border-input bg-card p-1.25 px-2 text-xs text-text"
            value={commandLine}
            onChange={(event) => { setCommandLine(event.target.value); setNotice('') }}
            spellCheck={false}
            aria-label={t('managers.args')}
          />
          <button
            type="button"
            className="flex-none whitespace-nowrap cursor-pointer rounded-sm border border-accent-border bg-accent-soft p-1.25 px-3 text-xs font-semibold text-text enabled:hover:border-accent-border enabled:hover:bg-accent-soft disabled:cursor-default disabled:opacity-45"
            disabled={state.running || commandLine.trim().length === 0 || plugin?.available !== true}
            onClick={() =>{  execute(
              selected ?? { name: commandLine.trim(), args: commandLine.trim().split(/\s+/u), label: '', mutating: true },
              commandLine,
              confirm,
            ) }}
          >
            {state.running ? t('managers.running') : t('managers.run')}
          </button>
        </div>
        {confirm || (selected?.mutating === true)
          ? <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={confirm} onChange={(event) =>{  setConfirm(event.target.checked) }} />
            <span>{t('managers.confirm')}</span>
          </label>
          : null}
        <div className="mt-4 text-xs text-text-secondary">{t('managers.hint')}</div>

        <div className="my-6 h-px bg-border" />
        <div className="mb-2 flex flex-wrap items-center gap-3">
          {/* FF-NOTE: .outputHead > .sectionTitle { margin: 0 } — the h3 is outputHead's
              first child, so first:mb-0 re-asserts it (first:mt-0 already in the base string). */}
          <h3 className="relative mt-8 mb-4 first:mt-0 first:mb-0 pl-3 text-base font-bold tracking-normal text-text before:absolute before:content-[''] before:left-0 before:top-0.75 before:h-4 before:w-1 before:rounded-3xs before:bg-primary">{t('managers.output')}</h3>
          {state.result !== undefined
            ? <>
              <span className="text-xs text-muted">{t('managers.exit')} {state.result.exitCode}</span>
              <span className="text-xs text-muted">{t('managers.duration')} {state.result.durationMs} ms</span>
              <CopyButton value={output} label={t('managers.copy')} />
              <button type="button" className="inline-flex size-8.5 items-center justify-center rounded-sm border border-border bg-card p-0 text-text-secondary transition duration-150 ease-aek hover:border-accent-border hover:bg-accent-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50" onClick={state.clear}>{t('managers.clear')}</button>
            </>
            : null}
        </div>
        {state.result === undefined
          ? <div className="flex min-h-30 items-center justify-center gap-2 text-xs-plus text-text-muted">{t('managers.noOutput')}</div>
          : (
            <OutputView
              text={outputLabel + '\n' + (output || '(no output)')}
              failed={state.result.exitCode !== 0}
            />
          )}
      </div>
    </PanelCard>
  )
}

/** @returns the Skill Manager command console. */
export function SkillsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <ManagerPanel pluginId="aek-skill-manager" refreshSignal={refreshSignal} />
}

/** @returns the Prompt Manager command console. */
export function PromptsPanel({ refreshSignal }: { refreshSignal: number }) {
  return <ManagerPanel pluginId="aek-prompt-manager" refreshSignal={refreshSignal} />
}
