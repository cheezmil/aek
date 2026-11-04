---
description: "DSh bundle: installing @cheezmil/aek-for-dsh into a dsh profile gives the profile the dsh-facing AEK plugins (coraek, aek-websearch)."
kind: "package-bundle"
---

# @cheezmil/aek-for-dsh

English | [中文](README.zh.md)

## What this is

`@cheezmil/aek-for-dsh` is a **dsh profile bundle** — it is not a plugin itself,
but a single installable layer that registers the dsh-facing AEK plugins into
any dsh profile it is added to.

Install it once, and the profile gains access to the AEK functionality layer
(identity + web search) at once.

Host-specific UI surfaces (for example `@cheezmil/aek-home`, the React root
that renders into `#root` and replaces the dsh shell) are intentionally NOT
part of this bundle: they belong to the host that owns them (web-app /
aek-desktop profiles) and should be installed there individually.

## Install

```bash
pnpm add @cheezmil/aek-for-dsh
```

Then reference it in your profile's `package.json`:

```json
{
  "name": "my-aek-profile",
  "private": true,
  "dsh": {
    "profile": {
      "bundles": ["@cheezmil/dsh-base", "@cheezmil/aek-for-dsh"]
    }
  }
}
```

Or from the command line:

```bash
dsh plugin --profile my-aek-profile add @cheezmil/aek-for-dsh
dsh --profile my-aek-profile "your task"
```

## What you get

Once `@cheezmil/aek-for-dsh` is included, the profile has these two AEK
plugins registered:

| Plugin id | Package | What it provides |
|---|---|---|
| `coraek` | `@cheezmil/coraek` | Prints `aek web:` readiness line; re-exports `Context`/`Volatile`/`ClientContext` types for all other AEK plugins |
| `web-search-aggregation` | `@cheezmil/aek-websearch` | Multi-provider web search with key rotation (tavily, exa, serper, brave) |

## Why not install each plugin individually?

You can — each AEK plugin publishes its own npm package. But `aek-for-dsh` exists
to avoid the tedious manual step of adding each plugin's `cordis.patch.yml` row
and updating dependencies one by one. One install = everything wired up.

Future AEK plugins will be added to this bundle as they ship. Just update the
bundle version.

## Understand the implementation

`aek-for-dsh` contains no TypeScript source. Its only substance is
`cordis.patch.yml`, which declares two `- insert:` rows with the corresponding
plugin names. The dsh Loader resolves each name at runtime, pulling in the
actual package from npm.

Peer dependencies are declared but never installed by this package: they are
satisfied by the dsh profile's own dependency graph (`@deepseek-ai/cordis`,
etc.).
