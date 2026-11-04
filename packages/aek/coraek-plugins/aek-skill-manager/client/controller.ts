/**
 * The skill-hub card's controller: the staged `home` draft over the
 * `aek-skill-manager` settings namespace, projected into one snapshot the
 * card's slot entry injects.
 *
 * Unlike the aggregated-search card (a whole structured queue), this card
 * stages ONE scalar field — the hub `home` root — and shows a READ-ONLY hub
 * status block. The live status crosses the `aeksm` remote namespace when the
 * host composed it; when that namespace is absent (the tsc-build typert gap,
 * or a host that never registered `skillsManager`), the block degrades to the
 * "run the aeksm CLI" guidance. The CLI stays the primary interface in either
 * case; this card only stages configuration.
 *
 * @module aek-skill-manager/client/controller
 */

import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { CardFieldState, CardShell, SnapshotStore } from './form.ts'

/** The settings namespace carrying this plugin's configuration page. */
export const AEKSM_NS = 'aek-skill-manager'

/** The section the `configForms` form edits — the plugin's `Config` schema, minus the volatile wrappers. */
export interface AeksmSettingsSection {
  home?: string
}

/**
 * The structural face of the host `skillsManager` service as it rides the
 * `aeksm` remote namespace. Deliberately NARROW: the card only ever reads hub
 * health, never mutates. The generated typert namespace (a follow-on wiring
 * step) satisfies this; the card degrades when it is not mounted.
 */
export interface AeksmRemoteFace {
  /** `aeksm status` — hub health as a machine view. */
  status(): Promise<{ managedEntries: number; skillCount: number; errored: unknown[] }>
  /** The resolved hub root this service targets. */
  home(): Promise<string>
}

/** What the card renders for the read-only hub status block. */
export interface HubStatusView {
  /** False while a host read is pending. */
  loaded: boolean
  /** True when the remote namespace is absent or a read failed — show the CLI guidance. */
  unavailable: boolean
  bootstrapped?: boolean
  root?: string
  skillCount?: number
  managedEntries?: number
  errored?: number
}

/** What the skill-hub card renders. */
export interface SkillManagerCardState extends CardShell {
  /** The staged hub root control. */
  home: CardFieldState
  /** The read-only hub status block. */
  status: HubStatusView
}

/** The card's mutation and form actions, injected by the slot entry. */
export interface SkillManagerCardActions {
  /** Stage a hub root; empty re-inherits the default hub. */
  editHome: (text: string) => void
  /** Clear the hub root's user-layer entry. */
  resetHome: () => void
  /** Write the staged edit, then re-seed from what the Host accepted. */
  save: () => void
  /** Drop the staged edit. */
  discard: () => void
}

/** The registration-side face the card's slot entry injects. */
export interface SkillManagerCardFace extends SkillManagerCardActions {
  hooks: {
    /** Card snapshot bound by the renderer as useSkillManagerCard. */
    skillManagerCard: SnapshotStore<SkillManagerCardState>
  }
}

/**
 * Bridges the `aek-skill-manager` settings form and the optional `aeksm`
 * remote namespace onto the card. One staged string (the hub root) plus a
 * read-only status projection; a save writes a single path mutation.
 */
export class SkillManagerCardController {
  private homeDraft: string | undefined = undefined
  private homeReset = false
  private saving = false
  private failed = false
  private status: HubStatusView = { loaded: false, unavailable: false }
  private readonly listeners = new Set<() => void>()
  private readonly unsubscribe: () => void

  /**
   * @param scope - the shared configuration form for the `aek-skill-manager` entry.
   * @param remote - the `aeksm` namespace when the Host composed it, else
   *   undefined (the status block degrades to the CLI guidance).
   */
  constructor(
    private readonly scope: ConfigForm<AeksmSettingsSection>,
    private readonly remote: AeksmRemoteFace | undefined,
  ) {
    this.unsubscribe = this.scope.subscribe(() => {
      // A scope change while the user is mid-edit is the section moving under
      // the draft (another surface, a save landing): the draft wins until the
      // user saves or discards.
      if (this.saving || this.homeDraft !== undefined || this.homeReset) return
      this.publish()
    })
    if (this.remote !== undefined) void this.loadStatus()
  }

  /** Release the scope subscription and every bound store. */
  dispose(): void {
    this.unsubscribe()
    this.listeners.clear()
  }

  /** Bind one projection of this controller as a snapshot store. */
  bind(): SnapshotStore<SkillManagerCardState> {
    let last = this.projection()
    const bound = new Set<() => void>()
    const store: SnapshotStore<SkillManagerCardState> = {
      getSnapshot: () => last,
      subscribe: (listener) => {
        bound.add(listener)
        return () => { bound.delete(listener) }
      },
      set: (next) => {
        last = next
        for (const listener of bound) listener()
      },
    }
    this.listeners.add(() => { store.set(this.projection()) })
    return store
  }

  /** The card's actions. */
  actions(): SkillManagerCardActions {
    return {
      editHome: (text) => {
        this.homeDraft = text
        this.homeReset = false
        this.failed = false
        this.publish()
      },
      resetHome: () => {
        this.homeReset = true
        this.homeDraft = undefined
        this.failed = false
        this.publish()
      },
      save: () => { void this.save() },
      discard: () => {
        this.homeDraft = undefined
        this.homeReset = false
        this.failed = false
        this.publish()
      },
    }
  }

  /** The registration-side face: the hooks compartment plus the form actions. */
  inject(): SkillManagerCardFace {
    return { hooks: { skillManagerCard: this.bind() }, ...this.actions() }
  }

  private async save(): Promise<void> {
    if (this.saving || !this.dirty()) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      // A reset or an empty draft clears the user-layer entry (re-inherit the
      // default hub); a non-empty draft writes the staged path.
      const trimmed = this.homeReset ? '' : (this.homeDraft ?? '')
      const landed = trimmed.length > 0
        ? await this.scope.set('home', trimmed)
        : await this.scope.unset('home')
      this.homeDraft = undefined
      this.homeReset = false
      this.saving = false
      if (!landed) this.failed = true
      if (this.remote !== undefined) void this.loadStatus()
      this.publish()
    } catch (_writeFailure) {
      this.saving = false
      this.failed = true
      this.publish()
    }
  }

  /** Read the optional remote namespace's hub status (never takes the card down). */
  private async loadStatus(): Promise<void> {
    if (this.remote === undefined) {
      this.status = { loaded: false, unavailable: true }
      this.publish()
      return
    }
    try {
      const [root, view] = await Promise.all([this.remote.home(), this.remote.status()])
      this.status = {
        loaded: true,
        unavailable: false,
        bootstrapped: view.skillCount > 0,
        root,
        skillCount: view.skillCount,
        managedEntries: view.managedEntries,
        errored: view.errored.length,
      }
      this.publish()
    } catch (_statusReadFailure) {
      this.status = { loaded: false, unavailable: true }
      this.publish()
    }
  }

  private dirty(): boolean {
    return this.homeDraft !== undefined || this.homeReset
  }

  private projection(): SkillManagerCardState {
    const snapshot: ConfigFormSnapshot<AeksmSettingsSection> = this.scope.getSnapshot()
    const userHome = (snapshot.user as { home?: string } | undefined)?.home
    const stagedText = this.homeReset
      ? ''
      : (this.homeDraft ?? userHome ?? snapshot.value?.home ?? '')
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.dirty(),
      invalid: false,
      saving: this.saving,
      failed: this.failed,
      home: {
        text: stagedText,
        overridden: userHome !== undefined || this.homeReset || this.homeDraft !== undefined,
        invalid: false,
      },
      status: this.status,
    }
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
