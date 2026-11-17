/**
 * The ICON REGISTRY (BB round, 2026-11-16) — the single source of truth for
 * "which thing uses which icon" (user ruling: "哪种东西就用哪个图标，不要
 * 乱七八糟地使用图标").
 *
 * Boundary rule, spelled out so the next round does not re-litigate it:
 * - SEMANTIC / IDENTITY icons — the mark that names a THING (a nav concept,
 *   an app entry, a plugin bucket, a section header) — come from THIS file,
 *   one entry per thing, each documented with what the glyph says.
 * - ACTION / CONTROL icons — the mark that names a CONTROL (copy, refresh,
 *   close, plus, trash, check, eye/eyeOff/eyeAll, play, stop, save,
 *   restore, pin, grip, alert, lock, chevronDown) — stay inline at the
 *   control's own call site; they belong to the control, not to a thing.
 *
 * New glyph policy: a new semantic thing gets its row here first; if the
 * glyph is missing from `Icons.tsx` the new IconName is verified against
 * the upstream Lucide set (aekws, multiple sources) before it lands — the
 * table already records that for `skill` / `globe`.
 *
 * @module @cheezmil/aek-home/src/client/icon-registry
 */
import type { IconName } from './Icons.tsx'
import type { PanelId } from './nav-model.ts'
import type { PluginBucket } from './useConsoleFacts.ts'

/**
 * The icons of the NAV concepts, keyed by the nav model's `PanelId`.
 * `plugins` is the retired bucket id (filtered out of the rail by the
 * Sidebar's orderIds memo) — kept in the map so the type stays total.
 */
export const NAV_ICONS: Record<PanelId, IconName> = {
  /** 插件与程序管理: a live heartbeat = running instances / liveness. */
  runtime: 'activity',
  /** Web Search: the magnifier says "look things up" and nothing else. */
  websearch: 'search',
  /** Skill Manager: an open book of text lines = "skill document". Icon
      history (both earlier picks user-vetoed, 2026-11-17): the BB-round
      mortarboard read as "academic"; the GG-round jigsaw was vetoed the
      same day. `book-open-text` says "readable capability document" and
      matches the aeksm hub (install / import / distribute skill docs). */
  skills: 'bookOpenText',
  /** Prompt Manager: a plain text block (the Q-round ruling stands). */
  prompts: 'type',
  /** Web Search settings: the sliders glyph is the house style for "tune". */
  websearchSettings: 'settings',
  /** 基础设置: the same sliders glyph — one house style for "settings". */
  settings: 'settings',
  /** 关于 / 系统信息: the "i" in a circle says "info about this". */
  about: 'about',
  /** (retired bucket id, never rendered as a rail row.) */
  plugins: 'layers',
}

/**
 * The icons of the APP ENTRIES, keyed by the host-reported entry id.
 * `Record<string, IconName>` on purpose: the host scans directories, so the
 * key set is open-ended; unknown entries fall back to `layout` (a generic
 * program window) at the call site.
 */
export const ENTRY_ICONS: Record<string, IconName> = {
  /** The Electron shell: a window frame says "desktop program". */
  'aek-desktop': 'layout',
  /** The web console: a globe says "a web app" unambiguously — the old
      `activity` heartbeat read as "is it alive?", not "which program". */
  'aek-web': 'globe',
  /** The operator CLI: a terminal prompt says "run commands here". */
  cli: 'terminal',
}

/**
 * The icons of the PLUGIN BUCKETS, one per `PluginBucket`.
 * `bucketIconOf` in InfoPanels is a thin alias of this table.
 */
export const BUCKET_ICONS: Record<PluginBucket, IconName> = {
  /** AEK's own plugins: stacked layers = "the stack of this system". */
  plugins: 'layers',
  /** Public npm-ecosystem packages: an open book = "published / docs". */
  public: 'book',
  /** The base environment: a shield = "the protected core". */
  base: 'shield',
  /** Extensions: the jigsaw = "a pluggable capability block". */
  extensions: 'puzzle',
}

/**
 * The marker of the 入口 section header inside 系统信息 — a program window,
 * not a heartbeat (the section lists PROGRAMS, it does not monitor them).
 */
export const ENTRIES_SECTION_ICON: IconName = 'layout'

/**
 * The SKILL concept mark (the jigsaw — the Skill Manager's block glyph, the
 * 2026-11-17 restoration of the Q-round choice), shared by the Skill Manager
 * nav entry and the skill-hub path row in the setup flow — one thing, one
 * mark.
 */
export const SKILL_ICON: IconName = 'bookOpenText'

/**
 * The "family home" row of a plugin's own side rail (`PluginSubNav`) — the
 * window-frame glyph says "back to this family's main surface".
 */
export const FAMILY_HOME_ICON: IconName = 'layout'

/**
 * The row marker of the 权限 panel's app-bundle list — each row IS an app
 * bundle, drawn as a window frame.
 */
export const APP_BUNDLE_ICON: IconName = 'layout'
