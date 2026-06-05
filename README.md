<div align="center">

# omadia plugin starter

### Build your own [omadia](https://omadia.ai) plugin or channel — and package it into an uploadable ZIP with one command.

A ready-to-fork template with two working examples and a build script that turns
your code into the ZIP the omadia admin UI accepts. Clone it, fill in your logic,
ship it.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built for omadia](https://img.shields.io/badge/built%20for-omadia-2496ED.svg)](https://github.com/byte5ai/omadia)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[**Main repo**](https://github.com/byte5ai/omadia) · [**Website**](https://omadia.ai) · [**Quickstart**](#quickstart) · [**Docs**](#documentation)

> 🇩🇪 Diese Anleitung gibt es auch [auf Deutsch](./README.de.md).

</div>

---

omadia is an agentic OS: every agent, channel and integration is a **plugin**
the host loads, configures and sandboxes at runtime. This repository is a
ready-to-fork template with two working examples and a build script that turns
your code into the ZIP the omadia admin UI accepts.

---

## What you can build

| Kind | What it is | Entry point | Example |
| --- | --- | --- | --- |
| **Agent** | A skill with tools the orchestrator can call. | `activate(ctx)` | [`examples/agent-plugin`](./examples/agent-plugin) |
| **Channel** | A surface (Discord, Slack, a webhook…) that routes user messages in and replies back out. | `activate(ctx, core)` | [`examples/channel`](./examples/channel) |
| **Integration** | A connector that exposes an external system as tools/services. | `activate(ctx)` | see the agent example — same shape |

All three share one contract: export an `async activate(...)` that returns a
handle with `close()`. The difference is what they declare in `manifest.yaml`
and which `ctx` accessors they use.

---

## Quickstart

```bash
# Node 22 is pinned via .nvmrc
nvm use            # or: install Node >= 20

npm install        # installs the shared toolchain (workspaces)

# Pick an example, build its upload ZIP:
npm run build:agent      # → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
npm run build:channel    # → examples/channel/out/acme-channel-webhook-0.1.0.zip

# …or typecheck / build everything:
npm run typecheck
npm run build
```

Then open the omadia **admin UI → Store → Upload** and drop the ZIP in.

> ℹ️ Today, ZIP upload is the **only** way to install a plugin — share it by
> handing the ZIP over directly. A public **omadia Hub** for submitting plugins
> once and having any host fetch them is planned; the ZIP you build now is
> exactly what it will accept.

---

## How it fits together

```
your code (src/plugin.ts)
        │   esbuild bundle  (host-provided peers stay external)
        ▼
   dist/plugin.js  +  manifest.yaml  +  skills/  +  assets/
        │   zip
        ▼
   out/<id>-<version>.zip  ──upload──▶  omadia host
                                          loads dist/plugin.js
                                          calls activate(ctx[, core])
```

The host validates the manifest, checks permissions, and calls your
`activate`. Every external effect (secrets, network, filesystem, memory) is
handed to you through `ctx`, scoped to what your manifest declares.

---

## Repository layout

```
omadia-plugin-starter/
├── README.md / README.de.md     ← you are here
├── docs/en/ · docs/de/          ← full guides (bilingual)
├── scripts/build-zip.mjs        ← the esbuild→zip build (shared by examples)
├── tsconfig.base.json           ← shared compiler config
├── types/                       ← local SDK type stubs (compile offline)
│   ├── omadia-plugin-api.d.ts
│   └── omadia-channel-sdk.d.ts
└── examples/
    ├── agent-plugin/            ← @acme/agent-hello
    └── channel/                 ← @acme/channel-webhook
```

### About the SDK type stubs

`@omadia/plugin-api` and `@omadia/channel-sdk` are **provided by the omadia
host at runtime** — they are not published to npm, so you neither install nor
bundle them. To let your plugin typecheck offline, this repo ships faithful
type stubs in [`types/`](./types). The build marks the real packages as
`external`, so the host supplies the genuine implementations. Keep the stubs in
sync with the omadia version you target.

---

## Documentation

| Guide | English | Deutsch |
| --- | --- | --- |
| Getting started | [01](./docs/en/01-getting-started.md) | [01](./docs/de/01-erste-schritte.md) |
| Build an agent plugin | [02](./docs/en/02-build-an-agent-plugin.md) | [02](./docs/de/02-agent-plugin-bauen.md) |
| Build a channel | [03](./docs/en/03-build-a-channel.md) | [03](./docs/de/03-channel-bauen.md) |
| Manifest & packaging | [04](./docs/en/04-manifest-and-packaging.md) | [04](./docs/de/04-manifest-und-packaging.md) |

---

## License

[MIT](./LICENSE) — fork it, ship it, sell it. Replace the `@acme/*`
placeholders and the `authors` block with your own before you publish.
