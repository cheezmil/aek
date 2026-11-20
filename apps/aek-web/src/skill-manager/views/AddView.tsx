/**
 * The add tab (the reference's InstallSkills page, re-voiced for the aeksm
 * engine's source rules): one source input, a display-side source-kind
 * badge (mirror of the engine's parser, the engine stays the authority),
 * the install options, and a direct install — the engine has no preview /
 * staging step, it reports the result straight back.
 */
import { useState } from 'react'
import { useI18n } from '../../i18n.tsx'
import { PanelCard, Spinner } from '../../ui-kit.tsx'
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

export function AddView() {
  const { skills, goView } = useSkillView()
  const { t } = useI18n()
  const runWrite = useRunWrite()
  const [source, setSource] = useState('')
  const [overwrite, setOverwrite] = useState(false)
  const [insecure, setInsecure] = useState(false)
  const [onlyMode, setOnlyMode] = useState(false)
  const [names, setNames] = useState('')

  const kind = detectSourceKind(source)
  const trimmed = source.trim()
  const onlyNames = names.split(',').map(part => part.trim()).filter(Boolean)

  const submit = (): void => {
    void runWrite(t('skills.addDone'), async () => {
      const ok = onlyMode && onlyNames.length > 0
        ? await skills.add(trimmed, { skills: onlyNames, overwrite, allowInsecureHttp: insecure })
        : await skills.add(trimmed, { overwrite, allowInsecureHttp: insecure })
      if (ok) goView('library')
      return ok
    })
  }

  return (
    <PanelCard>
      <div className="flex flex-col gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-bold text-text">{t('skills.add.title')}</div>
            {kind !== 'empty' && (
              <Badge variant="secondary">
                {t('skills.add.detection')}: {t(DETECT_KEY[kind])}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{t('skills.add.directHint')}</div>
        </div>

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

        <div className="flex flex-col gap-2 text-sm">
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

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => { goView('library') }}>{t('skills.cancel')}</Button>
          {skills.busy
            ? <Spinner />
            : <Button size="sm" disabled={trimmed === ''} onClick={submit}>{t('skills.addInstall')}</Button>}
        </div>
      </div>
    </PanelCard>
  )
}
