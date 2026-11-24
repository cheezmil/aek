# aek-skill-manager

Local-first **agent skill hub** for the AEK family. One central repository
(the *hub*) holds your skills; the `aeksm` CLI installs, imports, audits,
updates, and **distributes** them to dozens of AI coding tools (Claude Code,
Cursor, Codex, Gemini, OpenCode, …) as symlinks (user scope) or copies
(project scope).

The engine is ported from [shenysun/skills-manager](https://github.com/shenysun/skills-manager)
(MIT) — see `NOTICE` for per-module attribution, pinned SHAs, and the
license chain.

## CLI is the primary interface

**Every operation is an `aeksm` command.** The CLI is non-interactive (the
`bootstrap` agent picker is the one exception) and emits machine-parseable
JSON on stdout. The AEK webui is the *auxiliary* face: it is a coraek plugin
that drives the same engine — it never adds an operation the CLI lacks.

| Command | What it does |
| --- | --- |
| `aeksm bootstrap` | one-time setup: create the hub, install the manager skill, mount it to detected agents |
| `aeksm list` / `get` / `status` | inspect the library (zero-retention `get` prints a skill's SKILL.md to stdout) |
| `aeksm add <owner/repo>` | install a skill from a git / local / GitHub source |
| `aeksm init` | import skills already living in agent runtime dirs |
| `aeksm distribute` / `undistribute` / `redistribute` | project skills out to (or back from) agent runtime dirs |
| `aeksm update` | tree-SHA freshness check + pull updates from sources |
| `aeksm audit security\|overlap\|descriptions` | report-only scanners + CI gates |
| `aeksm cost` | resident per-message token ledger for distributed skills |
| `aeksm categories` / `preset` | tag skills with domain categories; save/apply named presets |
| `aeksm sync init\|push\|pull\|status` | multi-machine hub sync over your own git remote |
| `aeksm doctor` | hub health + security rollup |

Run `aeksm --help` for the full list; `docs/CLI.md` (EN) and `docs/CLI.zh-CN.md`
(中文) are the command reference.

## Hub layout

The hub defaults to `~/.aek/skill-manager` (unified `~/.aek` namespace;
override with `--home <path>`, the `AEK_SKILL_MANAGER_HOME` env var, or
`SKILL_HOME`):

```
~/.aek/skill-manager/
├── skills/<name>/…        # canonical skill content (SKILL.md + assets)
├── registry.yaml          # metadata: sources, categories, distribution state
├── .backups/              # machine-local: pre-import/rollback snapshots
├── .skills/               # machine-local: distribution index, activity log
└── aek-skill-manager/     # the bundled "manager" skill (kept current on every run)
```

Configuration is **YAML** (the family standard — no jsonc). `registry.yaml`
is the source of truth; there is no separate global config file.

## Install

AEK packages install with **pnpm only** (a `preinstall` guard refuses `npm i -g`):

```sh
pnpm add -g @cheezmil/aek-skill-manager
aeksm bootstrap
```

In this repo (dev checkout) the `bin/aeksm` wrapper runs the TypeScript
source through `tsx` automatically; set `~/.aek/aeksm-mode` to `npm` to
delegate to the globally installed build instead.

## Webui face (auxiliary)

The package is declared `aek: { type: "dual", cordis: true }`. Its webui
face lives in the AEK web console (`apps/aek-web`), not in this package:

- **the `skills` family panel** (`apps/aek-web/src/ConsolePanels.tsx`) — a
  command console over the host bridge `/api/aek/plugin-console`: the full
  `aeksm` catalogue, one-click read-only actions, and write runs that need
  an explicit confirmation. This plugin is **not** mounted in the web
  profile's `cordis.patch.yml`, so the panel drives the CLI — the backend
  half (`src/index.ts`, `ctx.skillsManager`) only matters to profiles that
  mount it.
- **the `Skill 设置` tab** — the family's second-level rail. Schema-driven
  (the console's `SKILLS_SETTINGS_SCHEMA`): the single `aeksm.home` row
  (`aek-home.aeksm.home` host preference).

Contract (R2 round): every AEK plugin with a webui face owns a second-level
rail with at least a home + settings tab; a tab may either switch pages or
anchor to a section of the same page. Machine-checked by
`scripts/aek/verify-plugin-rails.mjs` (the `plugin-rails` face of
`dev-cycle verify`).

## Model / token experience

Distributing a skill puts its session-catalog line (`name` + the
whitespace-normalized, 500-char-capped `description` — the exact text the
tool-skill catalog puts in **every** message) into that agent's context; that
is its *resident cost*. The SKILL.md body loads on demand and is not charged
per message. `aeksm cost` accounts for it per physical runtime path
(approximate, `≈`, `method: "char-approx"`). An undistributed or `get`-only
skill costs nothing per message. Keep resident descriptions short — anything
past the 500-char catalog cap does not ride every message;
`aeksm cost --budget <n>` is a CI gate that exits 1 when the total exceeds a
token budget.

## Known Limitations and Deferred Work

- **Windows junctions** — the ported link layer uses plain symlinks/directory
  links. The `asm` junction abstraction (no developer-mode requirement on
  Windows) is a planned port (worklist T3).
- **Webui mount face** — the backend half (`src/index.ts`) and the card
  face (`client/`) are both written, but the web profile does not mount
  this plugin's cordis face: the webui drives the CLI through the host
  plugin-console bridge (`/api/aek/plugin-console`, `aek-web`'s family
  panel) instead. Mounting `ctx.skillsManager` into a profile (and wiring
  `client/` to it) stays open work.
- **Agent model tools** — `aeksm_*` host tools (worklist T8) not yet exposed.
- **Transfer-sync (WSL↔Windows)** — AEK-specific cross-machine alignment
  (worklist T9) not yet ported; upstream `sync` covers multi-machine via git.
- The upstream `web`/`dashboard` (fastify + vue) commands were intentionally
  **not** ported — AEK serves its webui through the coraek plugin.

## License

Apache-2.0 (this package). Ported MIT sources are attributed in `NOTICE`
with their license texts preserved under `licenses/`. No AGPL/GPL code is
included, and no telemetry is shipped.
