/**
 * The skill-hub plugin-configuration card: the one `home` field (the hub root
 * the host `skillsManager` service targets) plus a read-only hub status block
 * and a note that the aeksm CLI is the primary interface. Staged and saved
 * through the controller like the built-in plugin cards.
 *
 * The Plugins page asks for `view: 'summary'` (a row's description fallback)
 * or `view: 'page'` (this form). The same component serves both seats it is
 * registered into: the bundle's own page and the row's page; one controller
 * stages the edits shared by the two.
 *
 * @module aek-skill-manager/client/card
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { CardForm } from './PluginCard.tsx'
import { SectionHead, ValueField } from './fields.tsx'
import type { SkillManagerCardFace } from './controller.ts'
import type { AeksmLocaleKey } from './locales.ts'
import css from './fields.module.css'

/** Props the renderer binds for the skill-hub card. */
export type SkillManagerCardProps =
  (PropsRuntime<'plugins.bundle.config'> | PropsRuntime<'plugins.row.config'>)
  & PropsLocale<'aek-skill-manager'>
  & InjectFace<SkillManagerCardFace>

/** One read-only status row. */
function StatusRow(props: { label: string; value?: string }) {
  return props.value === undefined
    ? null
    : (
      <div className={css.statusRow}>
        <span className={css.statusKey}>{props.label}</span>
        <span className={css.statusValue}>{props.value}</span>
      </div>
    )
}

/**
 * Render the skill-hub card: its one-liner for the list, or the staged form
 * for the page.
 * @param props - the view asked for, locale copy, the card snapshot, and its form actions.
 * @returns the one-liner, the form, or nothing while the namespace is unavailable.
 */
export function SkillManagerCard(props: SkillManagerCardProps) {
  const { t } = props
  if (props.view === 'summary') return t('description')
  const state = props.useSkillManagerCard(snapshot => snapshot)
  if (!state.available) return null
  const disabled = !state.writable
  const { status } = state
  return (
    <CardForm
      copy={{
        readOnly: t('readOnly'),
        saveFailed: t('saveFailed'),
        discard: t('discard'),
        save: t('save'),
        saving: t('saving'),
      }}
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ValueField
        id="plugin-config-aeksm-home"
        label={t('home')}
        hint={state.home.text.length > 0 ? t('homeHint') : t('homeDefault')}
        overriddenLabel={t('overridden')}
        resetLabel={t('reset')}
        invalidLabel={t('invalidText')}
        disabled={disabled}
        text={state.home.text}
        overridden={state.home.overridden}
        invalid={state.home.invalid}
        onEdit={(text) => { props.editHome(text) }}
        onReset={() => { props.resetHome() }}
      />
      <SectionHead label={t('statusTitle')} />
      <div className={css.status}>
        {status.unavailable
          ? <p className={css.statusEmpty}>{t('statusUnavailable')}</p>
          : status.loaded
            ? (
              <>
                <StatusRow key="root" label={t('home')} value={status.root} />
                <StatusRow
                  key="skills"
                  label={t('skillCount')}
                  value={status.skillCount === undefined ? undefined : String(status.skillCount)}
                />
                <StatusRow
                  key="managed"
                  label={t('managedEntries')}
                  value={status.managedEntries === undefined ? undefined : String(status.managedEntries)}
                />
                {!status.bootstrapped
                  ? <p className={css.statusEmpty}>{t('notBootstrapped')}</p>
                  : null}
              </>
            )
            : null}
        <p className={css.statusEmpty}>{t('cliNote')}</p>
      </div>
    </CardForm>
  )
}
