/**
 * The Skill Manager settings page — the BM round house-style rewrite
 * (the user: stop copying other webuis, restyle these pages). Two quiet
 * sections on the host's two skills fields (the hub root + the
 * distribution mode), the draft/commit layer stays the host's
 * (`useDraftSettings`), and the per-row undo/save + the save-all bar
 * reuse the base settings page's i18n vocabulary.
 */
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n.tsx'
import { PanelCard } from '../../ui-kit.tsx'
import { useDraftSettings } from '../../preferences.tsx'
import { coerce, SKILLS_SETTINGS_SCHEMA, type SettingField } from '../../settings-schema.ts'
import { ViewHeader } from './shared.tsx'
import { Icon } from '../../Icons.tsx'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const HOME_KEY = 'aek-home.aeksm.home'
const MODE_KEY = 'aek-home.aeksm.distributeMode'

function fieldOf(key: string): SettingField {
  const field = SKILLS_SETTINGS_SCHEMA.find(item => item.key === key)
  if (field === undefined) throw new Error(`skills settings field missing: ${key}`)
  return field
}

export function SkillsSettingsView({ refreshSignal }: { refreshSignal: number }) {
  const { t } = useI18n()
  const { values: draftValues, dirtyKeys, draftSet, draftSave, draftUndo, reload } = useDraftSettings()

  useEffect(() => {
    if (refreshSignal > 0) reload()
  }, [refreshSignal, reload])

  const home = fieldOf(HOME_KEY)
  const mode = fieldOf(MODE_KEY)

  /** One settings row: label + hint on the left, the control on the right,
   *  undo/save affordances once the key is dirty. */
  const renderRow = (field: SettingField): ReactNode => {
    const isDirty = dirtyKeys.includes(field.key)
    const value = coerce(field, draftValues[field.key] ?? field.default)
    return (
      <li key={field.key} className="flex flex-col gap-3 rounded-md border border-border bg-background p-4 sm:flex-row sm:items-start sm:gap-4" data-setting-key={field.key}>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-text">{t(field.labelKey)}</div>
          {field.hintKey !== undefined && <div className="mt-1 text-xs leading-5 text-muted-foreground">{t(field.hintKey)}</div>}
        </div>
        <div className="flex w-full flex-none flex-col gap-2 sm:max-w-xs">
          {field.kind === 'select' && field.options !== undefined ? (
            <select
              value={String(value)}
              onChange={(e) => { draftSet(field.key, e.target.value) }}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {field.options.map(option => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          ) : (
            <Input
              value={String(value)}
              onChange={(e) => { draftSet(field.key, e.target.value) }}
              placeholder="~/.aek/current/skill-manager"
            />
          )}
          {isDirty && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" title={t('settings.dirty.undo')} onClick={() => { draftUndo(field.key) }}>
                <Icon name="restore" size={14} />
                {t('settings.dirty.undo')}
              </Button>
              <Button variant="secondary" size="sm" title={t('settings.dirty.saveOne')} onClick={() => { void draftSave(field.key) }}>
                <Icon name="check" size={14} />
                {t('settings.dirty.saveOne')}
              </Button>
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ViewHeader
        icon="settings"
        title={t('panel.skillsSettings')}
        subtitle={t('settings.dirty.empty')}
      />

      {/* The save-all bar (visible only while something is staged). */}
      {dirtyKeys.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-accent-border bg-accent-soft px-3.5 py-2">
          <div className="text-sm font-medium text-accent-ink">
            {t('settings.dirty.title')} · {String(dirtyKeys.length)}
          </div>
          <Button size="sm" onClick={() => { void draftSave('all') }}>
            <Icon name="save" size={14} />
            {t('settings.dirty.saveAll')}
          </Button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <PanelCard className="flex flex-col gap-3 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('skills.home')}</div>
          <ul className="m-0 flex flex-col gap-3 p-0">{renderRow(home)}</ul>
        </PanelCard>
      </section>

      <section className="flex flex-col gap-2">
        <PanelCard className="flex flex-col gap-3 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('settings.skills.distribution')}</div>
          <ul className="m-0 flex flex-col gap-3 p-0">{renderRow(mode)}</ul>
        </PanelCard>
      </section>
    </div>
  )
}
