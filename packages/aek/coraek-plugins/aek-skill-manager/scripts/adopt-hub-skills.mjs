#!/usr/bin/env node
/**
 * adopt-hub-skills.mjs — one-time, idempotent: register the hub's OWN
 * skills/ directories into registry.yaml as local (source-less) managed
 * entries, so `aeksm list/status/distribute` (which read registry.yaml, not
 * the directory) see them.
 *
 * Why: a fresh hub (e.g. just after `aeksm bootstrap`) has skills/ content but
 * an empty registry — directory-scanning commands (doctor's skillCount) see the
 * skills, but registry-driven ones (list/status/distribute/update) do not. This
 * bridges that gap without touching the SKILL.md files (local sources are
 * mirror-less, so no frontmatter rewrites).
 *
 * Re-runnable: already-registered skills are skipped. It does NOT import from
 * agent runtime dirs (that is `aeksm init`) and does NOT migrate the legacy
 * settings.yml/record.yml.
 *
 * Usage: node scripts/adopt-hub-skills.mjs [home]   (home defaults to the resolved hub)
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRuntimeServices } from '../lib/infra/runtime.js';

const home = process.argv[2] || undefined;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const s = createRuntimeServices({ home, ensureDefaultHub: true }, projectRoot);
const registry = s.registry;

const canonical = registry.listCanonicalSkills();
const unregistered = canonical.filter((name) => !registry.getEntry(name));

if (unregistered.length === 0) {
  console.log(`All ${canonical.length} canonical skill(s) in ${s.resolution.root} are already registered. Nothing to do.`);
} else {
  registry.ensureEntries(unregistered.map((name) => ({ skill: name, patch: {} })));
  console.log(`Registered ${unregistered.length} skill(s) into registry.yaml (local, source-less) at ${s.resolution.root}:`);
  for (const name of unregistered) console.log(`  + ${name}`);
  console.log('Hint: backfill real provenance later with `aeksm provenance` or `aeksm edit <skill> --source-url <url>`; tag domains with `aeksm categories`.');
}
console.log(`Hub now: ${registry.listCanonicalSkills().length} canonical on disk, ${registry.listSkills().length} registered in registry.yaml.`);
