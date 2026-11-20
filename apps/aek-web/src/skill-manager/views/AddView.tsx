/**
 * The add tab — the reference's InstallSkills git-tab card shape, 1:1
 * re-voiced for the aeksm engine's source rules (P16: our own widgets):
 * the icon block, the title + direct-install note, the source input
 * (Enter installs), the accent "already installed, reinstalling updates"
 * hint bar (matched against the host's update plan), the install options,
 * the install button. The display-side source-kind badge mirrors the
 * engine's parser; the engine stays the authority.
 */
import { useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { PanelCard, Spinner } from '../../ui-kit.tsx'
import { Icon } from '../../Icons.tsx'
import { useRunWrite, useSkillView } from './shared.tsx'
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

  // The reference's "already installed" hint: the typed source matches an
  // update-plan group (git-like sources only) → reinstalling updates it.
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

  return (
    <PanelCard className="mx-auto max-w-lg p-5">
      <div className="flex flex-col">
        {/* ① The reference's icon block (the install glyph, our set). */}
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary">
          <Icon name="save" size={20} />
        </div>

        {/* ② The title + the direct-install note (the engine has no
            preview / staging step — the install reports straight back). */}
        <div>
          <h2 className="text-sm font-semibold text-text">{t('skills.add.title')}</h2>
          <p className="mt-1 text-xs text-text-muted">{t('skills.add.directHint')}</p>
        </div>

        {/* ③ The source input: the label + the display-side kind badge,
            Enter installs (the reference's keyboard shortcut). */}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-text-secondary">{t('skills.addSource')}</Label>
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
          <div className="mt-1 text-2xxs text-text-muted">{t('skills.addSourceHint')}</div>
        </div>

        {/* ④ The installed hint bar (the reference's amber strip, our
            accent tokens): the source is already in the library, a
            reinstall updates it. */}
        {installedSkills.length > 0 && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-accent-border bg-accent-soft px-3 py-2 text-xs text-accent-ink">
            <Icon name="check" size={13} />
            {tf('skills.add.alreadyInstalled', { name: installedSkills.join('、') })}
          </div>
        )}

        {/* ⑤ The install options (the engine's add-write faces). */}
        <div className="mt-3 flex flex-col gap-2 text-xs">
          <label className="flex items-center gap-2 text-text">
            <input type="checkbox" className="h-4 w-4" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked) }} />
            {t('skills.addOverwrite')}
          </label>
          <label className="flex items-center gap-2 text-text">
            <input type="checkbox" className="h-4 w-4" checked={insecure} onChange={(e) => { setInsecure(e.target.checked) }} />
            {t('skills.add.insecure')}
          </label>
          <label className="flex items-center gap-2 text-text">
            <input type="checkbox" className="h-4 w-4" checked={onlyMode} onChange={(e) => { setOnlyMode(e.target.checked) }} />
            {onlyMode ? t('skills.add.onlySkills') : t('skills.add.allSkills')}
          </label>
          {onlyMode && (
            <Input
              value={names}
              onChange={(e) => { setNames(e.target.value) }}
              placeholder={t('skills.add.onlyPlaceholder')}
              className="text-xs"
            />
          )}
        </div>

        {/* ⑥ The button row (left-aligned, the reference's install
            affordance; the busy state spins in place). */}
        <div className="mt-4 flex items-center gap-2">
          {skills.busy
            ? <Spinner />
            : <Button size="sm" disabled={trimmed === ''} onClick={submit}>{t('skills.addInstall')}</Button>}
        </div>
      </div>
    </PanelCard>
  )
}
