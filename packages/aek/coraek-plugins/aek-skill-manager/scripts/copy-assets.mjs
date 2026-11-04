#!/usr/bin/env node
/**
 * Copy non-TS runtime assets into lib/ after tsc (tsc only emits .js/.d.ts;
 * the bundled agent catalog snapshot is read module-relative at runtime via
 * `new URL('../catalog/agent-catalog.json', import.meta.url)`, so the file
 * must exist at lib/core/catalog/agent-catalog.json).
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// tsc emits .js/.d.ts but NOT the raw .json snapshot the catalog service
// reads module-relative (`new URL('../catalog/agent-catalog.json', ...)`).
// Copy only the runtime asset files (.json), never the .ts sources tsc already compiled.
const ASSET_EXTS = new Set(['.json', '.yml', '.yaml', '.txt', '.md']);

for (const base of [join(root, 'src')]) {
  const stack = [base];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const from = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(from);
        continue;
      }
      const ext = from.slice(from.lastIndexOf('.'));
      if (!ASSET_EXTS.has(ext)) continue; // skip .ts (tsc-compiled) and everything else
      const rel = from.slice(root.length + 1); // src/core/catalog/agent-catalog.json
      const to = join(root, 'lib', ...rel.split('/').slice(1));
      if (existsSync(from)) {
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        console.log(`copied ${rel} -> lib/${rel.slice(4)}`);
      }
    }
  }
}
