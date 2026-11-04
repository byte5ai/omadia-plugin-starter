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

When you upload and install the ZIP, the omadia host:

1. reads `manifest.yaml` and validates it,
2. checks `compat.core` against its own `@omadia/plugin-api` version and
   refuses the package if the range excludes it (see below),
3. records the permissions you declared and asks the operator to grant the
   ones that need consent (public paths, SQL, …),
4. dynamically imports `dist/plugin.js`,
5. calls `activate(ctx)` (or `activate(ctx, core)` for a channel), then your
   optional `verifyConnection(ctx)` export,
6. keeps the returned handle and calls `close()` on deactivate, uninstall or
   shutdown.

You never reach for globals like `process.env` or raw `fetch`. Everything is on
`ctx`, scoped to your plugin:

| You need… | Use… | Provisioned when… |
| --- | --- | --- |
| A secret (token, key) | `await ctx.secrets.require('x')` | declared as a `type: secret` setup field |
| A config value | `ctx.config.get<T>('x')` | declared as a setup field |
| To register a tool | `ctx.tools.register(spec, handler, options?)` | always (agents) |
| To mount HTTP routes | `ctx.routes.register(prefix, router, { auth, body })` | always; `auth` other than `'session'` needs a granted `permissions.public_paths` entry |
| To list a page (Teams tab, Hub card) | `ctx.uiRoutes.register({ routeId, path, title })` | always |
| To show a status badge | `ctx.status.report({ state, title })` | always |
| Outbound HTTP | `ctx.http.fetch(url)` | `permissions.network.outbound` is non-empty |
| A capability of another plugin | `ctx.services.get(name)` / `getOptional(name)` | `name` declared under `requires` / `optional_requires` |
| To offer a capability | `ctx.services.provide(name, impl)` | always; list it under `provides` so consumers can `requires` it |

Optional accessors (`ctx.http`, `ctx.memory`, `ctx.llm`, …) are `undefined`
unless the manifest declares the permission that gates them. Guard with
`if (ctx.http)`. The full surface is in
[`types/omadia-plugin-api.d.ts`](../../types/omadia-plugin-api.d.ts).

## Which omadia version you build against

`@omadia/plugin-api` is the contract between your plugin and the host. It
is versioned with SemVer and only grows within 1.x. This repo's
[`types/omadia-plugin-api.d.ts`](../../types/omadia-plugin-api.d.ts) mirrors
**plugin-api 1.53.0** (the version is in the file header). The changelog of
every addition is
[`middleware/packages/plugin-api/CHANGELOG.md`](https://github.com/byte5ai/omadia/blob/main/middleware/packages/plugin-api/CHANGELOG.md)
in the omadia repo.

At runtime your plugin links against the **host's** plugin-api, which may be
older than the one you compiled against. Say which versions you support in
`compat.core`: the host checks the range against its own plugin-api version
when the ZIP is uploaded and again at install, and refuses the package
outside it (`package.incompatible_core` / `install.incompatible_core`). Set
the lower bound to the plugin-api version that introduced the newest thing
you use, for example `">=1.51.0 <2.0"` for `auth: 'teams-sso'`. Omitting
`compat` means `">=1.0 <2.0"`.

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
