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
 * @module @cheezmil/aek-home/src/client/ConsolePanels
 */
import { useState } from 'react'
import { Icon } from './Icons.tsx'
import { useI18n } from './i18n.tsx'
import { css } from './styles.ts'
import { CapabilityTags, CopyButton, PanelCard, PanelSearch, Spinner } from './ui-kit.tsx'
import { displayName } from './InfoPanels.tsx'
import { useConsoleFacts } from './useConsoleFacts.ts'
import { usePluginConsole } from './usePluginConsole.ts'
import type { ConsoleCommand } from './usePluginConsole.ts'

/** Number of one-click read-only buttons shown at the top. */
const QUICK_LIMIT = 8

/** @returns the shared command console for one manager plugin. */
function ManagerPanel({ pluginId, titleKey, subtitleKey }: {
  pluginId: string
  titleKey: string
  subtitleKey: string
}) {
  const { t } = useI18n()
  const facts = useConsoleFacts()
  const state = usePluginConsole()
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
  const roster = facts.facts?.plugins ?? []

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
    const tokens = line.trim().split(/\s+/u).filter(Boolean)
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
    <PanelCard
      title={t(titleKey)}
      subtitle={t(subtitleKey)}
      actions={(
        <>
          {state.loading || state.running ? <Spinner /> : null}
          <button type="button" className={css.iconButton} onClick={state.refresh} title={t('common.refresh')} aria-label={t('common.refresh')}><Icon name="refresh" size={16} /></button>
        </>
      )}
    >
      <div className={css.cardBody}>
        {state.error !== undefined
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{state.error}</span></div>
          : null}
        {notice !== ''
          ? <div className={css.errorBanner}><Icon name="alert" size={16} /><span>{notice}</span></div>
          : null}

        <div className={css.managerBar}>
          <span className={css.managerMeta}>{t('managers.cli')} <strong>{plugin?.cli ?? '—'}</strong></span>
          <span className={css.managerMeta}>{t('managers.version')} {plugin?.version ?? '—'}</span>
          <span className={css.managerMeta}>{plugin?.distribution ?? '—'}</span>
          <span className={css.managerMeta}>{t('managers.stack')} {(plugin?.languages ?? []).join(' · ') || '—'}</span>
          {plugin?.available === false
            ? <span className={css.managerWarn}>{t('managers.unavailable')}</span>
            : null}
        </div>

        <h3 className={css.sectionTitle}>{t('managers.quick')}</h3>
        <div className={css.managerActions}>
          {quick.map(command => (
            <button
              key={command.name}
              type="button"
              className={css.actionButton}
              disabled={state.running || plugin?.available !== true}
              onClick={() => execute(command, command.args.join(' '), false)}
              title={command.label}
            >
              {command.name}
            </button>
          ))}
          {quick.length === 0 && !state.loading
            ? <div className={css.emptyState}>{t('managers.empty')}</div>
            : null}
        </div>

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('managers.allCommands')}</h3>
        <PanelSearch value={query} onChange={setQuery} placeholder={t('managers.searchCommands')} count={state.loading ? undefined : visible.length} />
        <ul className={css.commandList}>
          {visible.map(command => (
            <li key={command.name} className={css.commandItem}>
              <button
                type="button"
                className={css.commandButton}
                onClick={() => pick(command)}
                aria-pressed={selected?.name === command.name}
              >
                <span className={css.commandName}>{command.name}</span>
                <span className={css.commandLabel}>{command.label}</span>
              </button>
              <span className={command.mutating ? css.badgeWarn : css.badgeSuccess}>
                {command.mutating ? t('managers.write') : t('managers.readonly')}
              </span>
            </li>
          ))}
        </ul>
        {visible.length === 0 && !state.loading
          ? <div className={css.emptyState}>{t('managers.empty')}</div>
          : null}

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('managers.run')}</h3>
        <div className={css.managerForm}>
          <input
            className={css.textInput}
            value={commandLine}
            onChange={(event) => { setCommandLine(event.target.value); setNotice('') }}
            placeholder={plugin?.cli ? `${plugin.cli} status` : t('managers.args')}
            spellCheck={false}
            aria-label={t('managers.args')}
          />
          <button
            type="button"
            className={css.actionButtonPrimary}
            disabled={state.running || commandLine.trim().length === 0 || plugin?.available !== true}
            onClick={() => execute(
              selected ?? { name: commandLine.trim(), args: commandLine.trim().split(/\s+/u), label: '', mutating: true },
              commandLine,
              confirm,
            )}
          >
            {state.running ? t('managers.running') : t('managers.run')}
          </button>
        </div>
        {confirm || (selected?.mutating === true)
          ? <label className={css.managerCheck}>
            <input type="checkbox" checked={confirm} onChange={event => setConfirm(event.target.checked)} />
            <span>{t('managers.confirm')}</span>
          </label>
          : null}
        <div className={css.hint}>{t('managers.hint')}</div>

        <div className={css.divider} />
        <div className={css.outputHead}>
          <h3 className={css.sectionTitle}>{t('managers.output')}</h3>
          {state.result !== undefined
            ? <>
              <span className={css.managerMeta}>{t('managers.exit')} {state.result.exitCode}</span>
              <span className={css.managerMeta}>{t('managers.duration')} {state.result.durationMs} ms</span>
              <CopyButton value={output} label={t('managers.copy')} />
              <button type="button" className={css.iconButton} onClick={state.clear}>{t('managers.clear')}</button>
            </>
            : null}
        </div>
        {state.result === undefined
          ? <div className={css.emptyState}>{t('managers.noOutput')}</div>
          : <pre className={css.outputPre}>{outputLabel}{'\n'}{output || '(no output)'}</pre>}

        <div className={css.divider} />
        <h3 className={css.sectionTitle}>{t('managers.roster')}</h3>
        <ul className={css.pluginList}>
          {roster.map(entry => (
            <li key={entry.id} className={css.pluginItem}>
              <div className={css.pluginHead}>
                <span className={css.featureIcon}><Icon name="book" size={18} /></span>
                <div className={css.pluginText}>
                  <div className={css.featureTitle}>{displayName(entry.packageName)}</div>
                  <div className={css.featureText}>{t('managers.version')} {entry.version} · {entry.description}</div>
                </div>
              </div>
              <CapabilityTags caps={entry.capabilities} />
            </li>
          ))}
        </ul>
      </div>
    </PanelCard>
  )
}

/** @returns the Skill Manager command console. */
export function SkillsPanel() {
  return <ManagerPanel pluginId="aek-skill-manager" titleKey="skills.title" subtitleKey="skills.subtitle" />
}

/** @returns the Prompt Manager command console. */
export function PromptsPanel() {
  return <ManagerPanel pluginId="aek-prompt-manager" titleKey="prompts.title" subtitleKey="prompts.subtitle" />
}
