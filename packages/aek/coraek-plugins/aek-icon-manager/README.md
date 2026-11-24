# @cheezmil/aek-icon-manager (`aekim`)

The icon manager of the AEK frontend — IV round. A2 local-only dev
capability, never published (`private: true` + `aek.distribution: A2`,
excluded from every npm / release publish path).

## Why it exists

The AEK console renders 36 inline Lucide-style glyphs from a single
registry (`apps/aek-web/src/Icons.tsx`). When a user wants an agent to
place "that icon" in markup, saying it in words ("a magnifier") is
ambiguous. Two faces solve that:

- **the webui 图标管理 panel** (host side, `apps/aek-web/src/IconManagerPanel.tsx`):
  a wall of every glyph, **click a tile = its usage snippet lands on the
  clipboard**, tick several + **复制选中 = the whole block in one copy**.
- **`aekim`** (this package, the agent side): the same registry as a
  command-line listing, so an agent can discover and hand off icon names
  without a human in the loop.

## CLI

```
aekim list [--json]      every icon name (one per line; --json = the manifest)
aekim show <name...>     usage facts for one or more icons
aekim copy <name...>     the agent-handoff block (header + one usage line each)
aekim copy --all         the block for EVERY icon
```

The `copy` block is the byte-identical text the webui panel puts on the
clipboard (header + `- name → <Icon name="…" size={18} />` lines), so the
two faces never drift. Pipe to your platform's clipboard if you want it
on the real clipboard (`... | pbcopy` on macOS).

Unknown names exit 2 and print the full available list.

## Data & regeneration

`data/icons.json` is generated, never hand-edited:

```
node scripts/aek/gen-icon-manifest.mjs          # read-only diff + report
node scripts/aek/gen-icon-manifest.mjs --write  # sync after Icons.tsx changes
```

The generator parses the `IconName` union out of the host registry (the
single source of truth) and checks that every union member has a
`ICONS` fragment. If `Icons.tsx` gains or loses glyphs, run `--write` in
the same commit — the panel stays in sync automatically (it imports the
registry in-process); only this manifest needs the regeneration.

## Webui face

This package is CLI-only (`aek: { type: "cli", cordis: false }`) — it
ships no host plugin. The webui 图标管理 panel is host-side
(`aek-web`), and under the R2 rail contract its family owns a second-level
rail with an `Icon 设置` tab; the schema behind that tab
(`ICONS_SETTINGS_SCHEMA`) is empty, so the page renders the "no settings
yet" state until rows are added.

## Known Limitations and Deferred Work

- No per-glyph meaning glossary yet: the registry documents which THING
  owns each glyph in `apps/aek-web/src/icon-registry.ts` (semantic vs
  action boundary, BB round); `aekim show` reports style + source but
  not that per-thing meaning. Deferred until the registry table carries
  machine-readable meanings.
- No clipboard write from the CLI (stdout only, by design — a terminal
  writing the user's clipboard without asking is a surprise).
