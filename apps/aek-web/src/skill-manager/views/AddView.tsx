/**
 * The add view (BM round rewrite): a full-width house page, not a floating
 * center card. The header carries the back button — the page is a
 * drill-through, and the user must always see how to get out (the
 * "莫名奇妙的页面，回不去" report). The body keeps the aeksm engine's
 * source rules: the display-side source-kind badge mirrors the engine's
 * parser, the "already installed" hint matches the host's update plan,
 * and the engine stays the authority.
 */
import { useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { PanelCard, Spinner } from '../../ui-kit.tsx'
import { Icon } from '../../Icons.tsx'
import { useRunWrite, useSkillView, ViewHeader } from './shared.tsx'
import { detectSourceKind, type SourceKind } from '../domain/sourceDetect.ts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'

/** The source-kind badge's i18n key (empty input shows no badge). */
const DETECT_KEY: Record<Exclude<SourceKind, 'empty'>, string> = {
  'local-dir': 'skills.add.detect.localDir',
  'zip-archive': 'skills.add.detect.archive',
  'owner-repo': 'skills.add.detect.ownerRepo',
  'git-repo': 'skills.add.detect.gitRepo',
  'http-url': 'skills.add.detect.httpUrl',
}

/** The url normalization the installed-hint match runs on: trimmed, the
 *  optional `.git` suffix and trailing slashes ignored. */
function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\.git$/i, '').replace(/\/+$/, '')
}

/** One install option row: a native checkbox styled to the house tokens. */
function OptionRow({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-xs text-text hover:bg-secondary/60">
      <input
        type="checkbox"
        className="h-4 w-4 rounded accent-primary"
        checked={checked}
        onChange={(e) => { onChange(e.target.checked) }}
      />
      {label}
    </label>
  )
}

export function AddView() {
  const { skills, goNav } = useSkillView()
  const { t, tf } = useI18n()
  const runWrite = useRunWrite()
  const [source, setSource] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [insecure, setInsecure] = useState(false)
  const [onlyMode, setOnlyMode] = useState(false)
  const [names, setNames] = useState('')

  const trimmed = source.trim()
  const kind = detectSourceKind(source)
  const onlyNames = names.split(',').map(part => part.trim()).filter(Boolean)

  // The "already installed" hint: the typed source matches an update-plan
  // group (git-like sources only) → reinstalling updates it.
  const installedSkills = trimmed !== ''
    ? (skills.updatePlan ?? [])
      .find(group => normalizeUrl(group.url) === normalizeUrl(trimmed))
      ?.skills.map(item => item.skill) ?? []
    : []

  const submit = (): void => {
    void runWrite(t('skills.addDone'), async () => {
      const ok = onlyMode && onlyNames.length > 0
        ? await skills.add(trimmed, { skills: onlyNames, overwrite, allowInsecureHttp: insecure })
        : await skills.add(trimmed, { overwrite, allowInsecureHttp: insecure })
      if (ok) goNav({ view: 'library' })
      return ok
    })
  }

  const goBack = (): void => { goNav({ view: 'dashboard' }) }

  return (
    <div className="flex flex-col gap-3">
      {/* The house header with the back button: this is a drill-through
          page — the exit is always visible (BM round, the "回不去" fix). */}
      <ViewHeader
        icon="save"
        title={t('skills.add.title')}
        subtitle={t('skills.add.directHint')}
        onBack={goBack}
      />

      <PanelCard className="flex flex-col gap-4 p-4">
        {/* The source input: label + display-side kind badge, Enter installs. */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold text-text-secondary">{t('skills.addSource')}</Label>
            {kind !== 'empty' && (
              <Badge variant="ghost" className="text-2xxs">
                {t('skills.add.detection')}: {t(DETECT_KEY[kind])}
              </Badge>
            )}
          </div>
          <Input
            value={source}
            onChange={(e) => { setSource(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && trimmed !== '' && !skills.busy) { submit() } }}
            placeholder={t('skills.addSourcePlaceholder')}
            className="mt-1"
          />
          <div className="mt-1 text-2xxs text-muted-foreground">{t('skills.addSourceHint')}</div>
        </div>

        {/* The installed hint bar: the source is already in the library, a
            reinstall updates it. */}
        {installedSkills.length > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-accent-border bg-accent-soft px-3 py-2 text-xs text-accent-ink">
            <Icon name="check" size={13} />
            {tf('skills.add.alreadyInstalled', { name: installedSkills.join('、') })}
          </div>
        )}

        {/* The install options (the engine's add-write faces). */}
        <div className="flex flex-col gap-1">
          <OptionRow checked={overwrite} onChange={(next) => { setOverwrite(next) }} label={t('skills.addOverwrite')} />
          <OptionRow checked={insecure} onChange={(next) => { setInsecure(next) }} label={t('skills.add.insecure')} />
          <OptionRow checked={onlyMode} onChange={(next) => { setOnlyMode(next) }} label={onlyMode ? t('skills.add.onlySkills') : t('skills.add.allSkills')} />
          {onlyMode && (
            <Input
              value={names}
              onChange={(e) => { setNames(e.target.value) }}
              placeholder={t('skills.add.onlyPlaceholder')}
              className="mt-1 text-xs"
            />
          )}
        </div>

        {/* The footer: back on the left, install on the right (the busy
            state spins in place of the primary). */}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={goBack}>{t('skills.back')}</Button>
          {skills.busy
            ? <Spinner />
            : (
              <Button size="sm" disabled={trimmed === ''} onClick={submit}>
                {t('skills.addInstall')}
              </Button>
            )}
        </div>
      </PanelCard>
    </div>
  )
}
