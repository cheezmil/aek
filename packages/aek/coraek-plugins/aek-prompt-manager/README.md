# aek-prompt-manager

Injects **managed, patchable prompt blocks** into the global prompt files of
the AI agent tools you actually use (Claude Code, Codex, Cursor, OpenCode,
Gemini/Antigravity, DeepSeek Harness, Hermes, …). Two source trees under
`~/.aek/prompt-manager/` feed one injection engine:

```
~/.aek/prompt-manager/
├── global-prompt-mapping/   # "map" source — the managed block is REPLACED in place
├── only-patch/              # "patch"/"apply" source — the block is APPENDED to the end
│   └── aek_system_prompt/   # built-in system prompt, injected ahead of the shared block
└── project-rules/           # project-local prompt generation (aekpm pr …)
```

Each source holds per-platform fragments (`cross_platform_shared.md` +
`linux/mac/windows/wsl.md`) in an `all_agents_shared/` tree and per-tool
trees; the merge order and block markers are documented in `aekpm --help`.
On WSL the Linux-side file is authoritative and the content is dual-written
to the Windows-native profile (`/mnt/c/Users/<user>/…`).

## CLI is the primary interface

**Every operation is an `aekpm` command.** Non-interactive, one verb per
operation:

| Command | What it does |
| --- | --- |
| `aekpm init` | create the source trees with empty platform files (never overwrites) |
| `aekpm patch <tool\|all>` | append the only-patch block to a tool's global prompt |
| `aekpm map <tool\|all>` | replace the global-prompt-mapping block in place |
| `aekpm apply <tool\|all>` | alias of `patch` |
| `aekpm remove <tool\|all>` | strip the managed block |
| `aekpm status <tool\|all>` | per-tool patched / not-patched / file-missing report |
| `aekpm pr init` / `aekpm pr gen [agent]` | project-local prompt rules under the project's `.aek/prompt-manager/project-rules/` |
| `aekpm use <local\|npm>` | which CLI code runs when a local build and a global install coexist |

## Coraek host half (auxiliary face)

The package also ships a **function plugin** (`main` → `lib/index.js`) that
registers the in-process `ctx.promptManager` service on a dsh web profile
host (via `@cheezmil/aek-for-dsh`). The service is the host face of the
SAME plain-JS engine the CLI drives — no process spawning, no second
implementation:

- `patch` / `map` / `apply` / `remove` / `status` — batch ops keep
  per-tool failures in the result array (CLI parity)
- `prInit` / `prGenerate` / `projectAgents` — project-rules face
- `tools` / `unsupportedTools` / `platform` / `wsl` — introspection

Project-rules failures throw `PromptManagerError` with a machine-readable
`code` that travels over the typert remote intact. The `Config` schema is
empty in v1 (settings namespace `aek-prompt-manager`): a live-editable
`home` override is deferred until a webui card or agent model tool
consumes it. The webui face and `aekpm_*` model tools are phase-2 work,
like the skill-manager's.

## Install

AEK packages install with **pnpm only** (a `preinstall` guard refuses
`npm i -g`):

```sh
pnpm add -g @cheezmil/aek-prompt-manager   # aekpm on PATH
```

In-repo dev: the `aekpm` bin auto-detects local vs. global (local build
wins by default; `aekpm use npm` delegates to the published install).

## Build (host half)

The plain-JS engine ships from `src/` untouched; only the TS host half is
compiled:

```sh
pnpm run build      # tsc (standalone NodeNext) + copy-assets.mjs (engine JS + sidecar .d.ts → lib/)
```
