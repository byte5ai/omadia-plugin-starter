# 01 · Getting started

This page gets you from a fresh clone to an uploadable ZIP.

## Prerequisites

- **Node ≥ 20** (the repo pins **22** via `.nvmrc`; run `nvm use`).
- The **`zip`** CLI (preinstalled on macOS/Linux; on Windows use `7z` or
  PowerShell `Compress-Archive` and adjust `scripts/build-zip.mjs`).
- Access to an **omadia host** with the admin UI, to install what you build.

## Install

```bash
git clone https://github.com/byte5ai/omadia-plugin-starter.git
cd omadia-plugin-starter
nvm use
npm install
```

`npm install` sets up an npm **workspace**: the shared toolchain
(`typescript`, `esbuild`, `@types/node`) lives at the root and every example
under `examples/*` reuses it.

## The mental model

A plugin is a folder that builds into a ZIP containing:

- `dist/plugin.js` — your bundled code, exporting `activate(...)`.
- `manifest.yaml` — who you are, what you need, what you expose.
- optional `skills/`, `assets/`.

At install time the omadia host:

1. reads `manifest.yaml` and validates it,
2. records the permissions you declared,
3. dynamically imports `dist/plugin.js`,
4. calls `activate(ctx)` (or `activate(ctx, core)` for a channel),
5. keeps the returned handle and calls `close()` on shutdown/uninstall.

You never reach for globals like `process.env` or raw `fetch`. Everything is on
`ctx`, scoped to your plugin:

| You need… | Use… | Provisioned when… |
| --- | --- | --- |
| A secret (token, key) | `await ctx.secrets.require('x')` | declared as a `type: secret` setup field |
| A config value | `ctx.config.get<T>('x')` | declared as a setup field |
| To register a tool | `ctx.tools.register(spec, handler)` | always (agents) |
| To mount HTTP routes | `ctx.routes.register(prefix, router)` | always |
| Outbound HTTP | `ctx.http.fetch(url)` | `permissions.network.outbound` is non-empty |
| To call other plugins | `ctx.services.get/provide(...)` | always |

## Build a ZIP

Run from the repo root:

```bash
npm run build:agent      # one example
npm run build            # every example (workspaces)
```

Each build runs `scripts/build-zip.mjs`, which esbuild-bundles
`src/plugin.ts → dist/plugin.js` and zips the runtime artefacts into
`out/<id>-<version>.zip`. Run the type gate separately:

```bash
npm run typecheck
```

## Next

- Building a skill with tools → [02 · Build an agent plugin](./02-build-an-agent-plugin.md)
- Connecting a messaging surface → [03 · Build a channel](./03-build-a-channel.md)
- Every manifest field + how upload works → [04 · Manifest & packaging](./04-manifest-and-packaging.md)
