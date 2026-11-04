/**
 * The skill-hub card's controls — a staged text field and a section head,
 * faithful local copies of the shipped plugin-configuration fields, styled on
 * the same tokens and rhythm as the built-in plugin cards.
 *
 * @module aek-skill-manager/client/fields
 */

import type { ReactNode } from 'react'
import css from './fields.module.css'

/** A staged text field (the hub root control). */
export function ValueField(props: {
  id: string
  label: string
  hint: string
  text: string
  overridden: boolean
  invalid: boolean
  overriddenLabel: string
  resetLabel: string
  invalidLabel: string
  disabled: boolean
  placeholder?: string
  onEdit: (text: string) => void
  onReset: () => void
}) {
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>{props.label}</label>
        {props.overridden
          ? (
            <span className={css.badges}>
              <span className={css.badge}>{props.overriddenLabel}</span>
              <button
                type="button"
                className={css.reset}
                disabled={props.disabled}
                onClick={props.onReset}
              >
                {props.resetLabel}
              </button>
            </span>
          )
          : null}
      </div>
      <input
        id={props.id}
        className={props.invalid ? css.inputInvalid : css.input}
        type="text"
        {...props.invalid ? { 'aria-invalid': true } : {}}
        value={props.text}
        placeholder={props.placeholder ?? ''}
        disabled={props.disabled}
        spellCheck={false}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      <p className={props.invalid ? css.invalid : css.hint}>
        {props.invalid ? props.invalidLabel : props.hint}
      </p>
    </div>
  )
}

/** A section head: a label plus optional trailing controls. */
export function SectionHead(props: { label: string; children?: ReactNode }) {
  return (
    <div className={css.sectionHead}>
      <span className={css.sectionTitle}>{props.label}</span>
      {props.children}
    </div>
  )
}
