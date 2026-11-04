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

The document title is rebranded separately through the `DSH_CLIENT_TITLE` build
environment value, which `AppFrame` already reads. This package has no runtime
state and does not affect model requests.

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
