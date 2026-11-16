/**
 * Build-flag reader for the build scripts (BB round, 2026-11-16).
 *
 * The console's 构建开关 (the source-map toggle in the 插件与程序 panel)
 * persists `<AEK_HOME>/build-flags.json` through the host route
 * (`@cheezmil/coraek/build-flags-api`); the build scripts read the same
 * fact file directly so the toggle takes effect on the NEXT build without a
 * host running — the zero-dep fact-file pattern `ai-release.json` set.
 *
 * @module scripts/aek/build-flags
 */
import { slotHome } from './shared-logic.mjs'
import { readBuildFlags } from '../../packages/aek/base/coraek/build-flags.mjs'

/**
 * Read the persisted build flags of one slot (the file the that slot's
 * console writes).
 * @param {'aek' | 'next'} slot - `aek` = the live current slot (1685),
 *   `next` = the dev slot (1687).
 * @returns {{ sourcemap: boolean }} the flags; missing / corrupt = the safe
 *   default `{ sourcemap: false }`.
 */
export function buildFlagsForSlot(slot) {
  return readBuildFlags(slotHome(slot))
}

/**
 * The env vars to export for the aek-web vite build so `vite.config.ts`
 * honors the persisted source-map flag.
 * @param {'aek' | 'next'} slot
 * @returns {Record<string, string>} `{ AEK_WEB_SOURCEMAP: '1' | '0' }`.
 */
export function buildFlagsEnv(slot) {
  return { AEK_WEB_SOURCEMAP: buildFlagsForSlot(slot).sourcemap ? '1' : '0' }
}
