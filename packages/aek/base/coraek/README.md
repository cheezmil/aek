---
description: "AEK base identity layer — rebrands the dsh web UI sidebar and startup announcement for AEK deployments."
kind: "package-reference"
---

# @cheezmil/coraek

The AEK base identity layer. It rebrands two user-visible surfaces of a dsh web
profile so they read as AEK instead of DeepSeek Harness:

- the **sidebar brand** — fills the `sidebar.brand.mark` and `sidebar.brand.name`
  slots with the AEK orange-slice mark and the `AEK` name, replacing the shell's
  fish-mark and `brand.localBuild` fallback;
- the **startup announcement** — prints the `aek web: <url>` readiness line,
  replacing the dsh web-app bundle's own `dsh web:` line (which the web profile
  suppresses with `printUrl: false`).

It also owns the **external capability provider** layer: a generic protocol, a
process supervisor, a host API and an operator CLI that let *separate-process*
capabilities — strongly-copyleft providers (license isolation) and native-language
(Go / Rust) capabilities (runtime incompatibility) — attach without the host ever
knowing their internals. (Our own TS/JS AEK plugins are a different class: they
run *in-process* on the shared coraek Node runtime, optionally shared to reduce
resident memory; they are not managed by this layer.) See
[External capability providers](#external-capability-providers).

The document title is rebranded separately through the `DSH_CLIENT_TITLE` build
environment value, which `AppFrame` already reads. The identity half has no
runtime state and does not affect model requests.

## Use this package

Install it into a dsh web profile and register it in the profile's coraek patch:

```yaml
- id: coraek
  name: '@cheezmil/coraek'
```

Suppress the dsh bundle's own URL line so only the AEK line prints:

```yaml
- id: web-app
  name: '@deepseek-ai/dsh-web-app'
  config:
    printUrl: false
```

## Understand the implementation

The host half (`src/index.ts`) injects the `connection` service and prints
`aek web: <authenticatedUrl>` once, mirroring the web-app bundle's readiness
line. The client half (`src/client/index.ts`) injects the `slots` service and
registers the AEK mark and name into the sidebar brand slots as one
declaration-aware set, the same pattern as `@deepseek-ai/dsh-client-ui-brand-official`.

The host half also calls `registerCapabilityApi` (see
[External capability providers](#external-capability-providers)), which mounts
two routes on the `webServer` seam and owns one `CapabilitySupervisor` per
composition root.

## External capability providers

coraek is the host side of a **process boundary**: a capability provider that
ships its own code (for example a strongly-copyleft / AGPL binary) attaches as
a *separate process* and talks to AEK through one small protocol. The host
never imports, links, or distributes the provider's code — that arm's-length
boundary keeps the host process clean and leaves the license obligation on the
provider's own distribution channel.

**Which capabilities use this layer** (the boundary is *separate process*, not
"all external code"):

| class | runtime relationship | why |
|---|---|---|
| our own TS/JS AEK plugins | **in-process**, on the shared coraek Node runtime; the user can selectively share it to reduce resident memory | same language/runtime; memory efficiency |
| strongly-copyleft providers (AGPL / GPL) | **separate process + this protocol** | license isolation — no code transfer into the host |
| native-language capabilities (Go / Rust) | **separate process instance each** | their runtime cannot be shared with the JS runtime, architecturally |

This section and the `aek.external` manifest gate govern only the two
*separate-process* rows. The in-process TS/JS row is ordinary coraek plugin
loading (bundle + `apply(ctx)`), which this layer must never intercept.

- **Protocol `aek-capability/1`** (`external.mjs`). A provider *self-describes*
  with a flat JSON descriptor: `name`, `version`, `spdx` (the provider's own
  license), `source`, `capabilities`, and an `attach` block saying how to reach
  it (`mcp-stdio` / `jsonrpc-stdio` / `http` / `cli`). `validateDescriptor` is
  strict and total: unknown fields, off-whitelist attach kinds, absolute or
  shell-metacharacter commands, and off-whitelist SPDX are all rejected. Two
  wire framings are supported for stdio JSON-RPC — LSP `Content-Length`
  headers and bare newline-delimited JSON — with `JsonRpcStream` auto-detecting
  either from the first byte.
- **Supervisor** (`external-supervisor.mjs`). One `CapabilitySupervisor` owns
  the state store at `<AEK_HOME>/capabilities.json`, spawns stdio providers as
  `execFile`-style children (no shell), and enforces the safety rules:
  **single instance** (a live recorded pid is *adopted*, never re-spawned),
  **attached instances are never killed** (stop is report-only), and graceful
  shutdown is `SIGTERM` with a bounded 5 s grace, **never escalated to
  `SIGKILL`**. On disposal it signals every child it spawned so no orphan
  survives a host shutdown.
- **Manifest gate** (`aek.external` in `package.json` + the `external` build
  gate in `verify-build-rules.mjs`). A wrapper package declares the block:
  `spdx` (asserts the provider's license) and `attach` (the process boundary).
  It **forbids an in-process runtime entry** — no `main` and no `exports["."]`
  (a `bin` field is allowed, it stays out of the host's module graph). This is
  the machine-enforced half of the "no code transfer" rule.
- **Host API** (`src/capability-api.ts`). `GET /api/aek/capabilities` returns
  the registry with live-corrected state and a host-rendered compliance line;
  `POST /api/aek/capabilities/stop` stops a provider and requires
  `confirm: true` (428 otherwise). The compliance line is a *fixed host
  template* filled with provider-asserted data — the host never hardcodes
  upstream facts. The aek-home About panel renders the section only when at
  least one provider is registered.
- **Operator CLI** (`aek external`, `src/commands/external.ts`). Read-only
  actions (`list`, `status`, `describe`) need no confirmation; mutating
  actions (`stop`, `register`) require `--confirm`. The host API is
  intentionally thin: install / download / start are operator actions, not
  host actions.

## Model Experience

No effect on model requests, token usage, or KV-cache behavior. The package
changes only browser presentation and process stdout.

## Known Limitations and Deferred Work

- The AEK name is plain localized text, not an SVG wordmark; a designed
  wordmark can replace `AekBrandName` later.
- The host half prints as soon as the `connection` service mounts; it does not
  wait for the full Loader tree to settle (sufficient for a human-readable
  readiness line; a supervisor that RPCs on seeing the line should wait for
  the dsh bundle's own loader-gated signal).
