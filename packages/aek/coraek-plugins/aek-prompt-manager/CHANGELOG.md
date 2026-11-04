# @cheezmil/aek-prompt-manager

## 0.2.0

### Minor Changes

- New dual form (family `aek.type: "dual"`): the package now ships a Coraek
  host half alongside the `aekpm` CLI.
  - `main`/`exports["."]` → `lib/index.js`: function-plugin entry exporting
    `name` / `inject: []` / `Config` / `apply` — registers the in-process
    `ctx.promptManager` host service (same pattern as `ctx.skillsManager`).
  - `src/config.ts`: settings namespace `aek-prompt-manager`, v1 empty
    schema (a live-editable `home` override is deferred until a webui /
    model-tool consumer exists).
  - `src/plugin/prompt-manager-service.ts`: host face of the `aekpm` command
    catalog (`patch`/`map`/`apply`/`remove`/`status` + `prInit`/`prGenerate`
    + introspection). Per-tool batch ops keep failures in the result array
    (CLI parity); project-rules ops throw `PromptManagerError` with a
    machine-readable `code` that travels over the typert remote intact.
  - Standalone NodeNext `tsconfig.json` (no repo base — the plain-JS engine
    ships from source); `scripts/copy-assets.mjs` copies the engine
    (`core.js`/`platforms.js`/`project-rules.js`) + hand-written sidecar
    declarations into `lib/` after `tsc`.
- Housekeeping: deleted `src/common.js` (self-vendored code of the old
  `@cheezmil/aek` monolith; dead `NAME`/`SCOPED_NAME` + duplicated `isWSL`).
  `getWindowsNativeRoot`/`winProfileToWsl` inlined into `src/core.js`, its
  only consumer.
- Registered in `@cheezmil/aek-for-dsh` (0.1.4): `cordis.patch.yml` gains a
  `prompt-manager` row (`@cheezmil/aek-prompt-manager`, no config).

### Notes

- Publish order for npm: `@cheezmil/aek-prompt-manager@0.2.0` first, then
  `@cheezmil/aek-for-dsh@0.1.4` (its `workspace:^` deps/peers rewrite to
  `^0.2.0` at pack time).

## 0.1.2

### Patch Changes

- fix: dual-write bug - normalize UNC path separators
