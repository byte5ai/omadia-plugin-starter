<div align="center">

# omadia plugin starter

### Build your own [omadia](https://omadia.ai) plugin or channel, and package it into an uploadable ZIP with one command.

A ready-to-fork template with two working examples and a build script that turns
your code into the ZIP the omadia admin UI accepts. Clone it, fill in your logic,
ship it.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built for omadia](https://img.shields.io/badge/built%20for-omadia-2496ED.svg)](https://github.com/byte5ai/omadia)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[**Main repo**](https://github.com/byte5ai/omadia) · [**Website**](https://omadia.ai) · [**Plugin hub**](https://hub.omadia.ai) · [**Quickstart**](#quickstart) · [**Docs**](#documentation)

🇩🇪 Diese Anleitung gibt es auch [auf Deutsch](./README.de.md).

</div>

---

omadia is an agentic OS: every capability, channel and model is a **plugin**
the host loads, configures and sandboxes at runtime. A plugin is only the
delivery form; agents are built in the Agent Builder and receive the tools of
the plugins an operator grants them. This repository is a ready-to-fork
template with two working examples and a build script that turns your code into
the ZIP the omadia admin UI accepts.

---

## What you can build

A plugin's manifest `identity.kind` is one of:

| Kind | What it is | Example |
| --- | --- | --- |
| `integration` | Access to a system with its own credentials, offered as tools and services. | same shape as the tool example |
| `tool` | Tools with local logic, optionally with its own pages (browser and Teams tab), plus `agent_templates`. | [`examples/tool-plugin`](./examples/tool-plugin) |
| `skill` | A reusable procedure an agent can follow. | |
| `channel` | A surface (Discord, Slack, a webhook…) that routes user messages in and replies back out. | [`examples/channel`](./examples/channel) |
| `model` | A model, embeddings or transcription provider; only the kernel's model gateway calls it. | |
| `archetype` | A kind of agent, selectable in the Agent Builder. | |
| `system-module` | Infrastructure of omadia itself. | |
| `agent-template` | Only agent templates, no tools. | |

`agent` and `extension` are **retired** kinds (an old `extension` is a
`system-module`, or a `model` plugin for an LLM provider).

All plugins share one contract: export an `async activate(...)` that returns a
handle with `close()`. The difference is what they declare in `manifest.yaml`
and which `ctx` accessors they use.

### The rules of the plugin boundary

The kernel rejects a plugin at upload that breaks them:

- **No persona.** No `persona`/`speaker`/`personality`/`system_prompt` in the
  manifest, no `skills` of `kind: prompt_partial`, no `AGENT.md` (except for
  kind `agent-template`). A plugin has no model loop of its own. The role a
  plugin used to carry ships as **`agent_templates`** (inactive presets, one
  per language) that an operator turns into an agent.
- **Tools declare `side_effects`.** Every tool registered with
  `ctx.tools.register` has a `capabilities` entry with `side_effects: read |
  write | none`; without one it counts as `unknown`. `activate` returns
  `{ close }`, not a toolkit.
- **Models only via `ctx.llm`.** No raw model services (`anthropicClient@1`,
  `llm@1`, `llmProviderPool`), no own Anthropic/OpenAI client, no direct call
  to a model provider host.
- **Network only via `ctx.http`.** The kernel sandboxes the global `fetch`
  (`PLUGIN_EGRESS_MODE`); allowed hosts are `permissions.network.outbound`.
- **`compat.core`** is `">=1.77.0 <2.0"` for anything that uses the new kinds
  or `agent_templates`; older cores cannot load them.

---

---

## Quickstart

```bash
# Node 22 is pinned via .nvmrc
nvm use            # or: install Node >= 20

npm install        # installs the shared toolchain (workspaces)

# Pick an example, build its upload ZIP:
npm run build:tool       # → examples/tool-plugin/out/acme-tool-hello-0.1.0.zip
npm run build:channel    # → examples/channel/out/acme-channel-webhook-0.1.0.zip

# …or typecheck / build everything:
npm run typecheck
npm run build
```

Then open the omadia **admin UI → Store → Upload** and drop the ZIP in.

> ℹ️ Two ways to ship a plugin. Upload the ZIP in the admin UI, or publish it to
> the **omadia hub** at [hub.omadia.ai](https://hub.omadia.ai) and install it
> from there on any host. The ZIP you build here is exactly what both accept.

---

## How it fits together

```
your code (src/plugin.ts)
        │   esbuild bundle  (host-provided peers stay external)
        ▼
   dist/plugin.js  +  manifest.yaml  +  assets/
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
    ├── tool-plugin/             ← @acme/tool-hello (kind tool + agent templates)
    └── channel/                 ← @acme/channel-webhook
```

### About the SDK type stubs

`@omadia/plugin-api` and `@omadia/channel-sdk` are **provided by the omadia
host at runtime**. They are not published to npm, so you neither install nor
bundle them. To let your plugin typecheck offline, this repo ships faithful
type stubs in [`types/`](./types). The build marks the real packages as
`external`, so the host supplies the genuine implementations.

`types/omadia-plugin-api.d.ts` mirrors **`@omadia/plugin-api` 1.53.0**: the
plugin-authoring modules are copied verbatim from that version's compiled
declarations, so route auth modes (`'session' | 'public' | 'custom' |
'teams-sso'`), `TeamsSsoUser`, `verifyConnection`, `ctx.sql` and the rest of
`ctx` are typed exactly as the host defines them. The version and commit are
in the file header. A weekly workflow (`SDK drift check`) compares both stubs
against omadia `main` and opens an issue when they drift. State the host
versions your plugin supports in the manifest's `compat.core`
([01 · Getting started](./docs/en/01-getting-started.md#which-omadia-version-you-build-against)).

---

## Documentation

| Guide | English | Deutsch |
| --- | --- | --- |
| Getting started | [01](./docs/en/01-getting-started.md) | [01](./docs/de/01-erste-schritte.md) |
| Build a capability plugin | [02](./docs/en/02-build-a-capability-plugin.md) | [02](./docs/de/02-capability-plugin-bauen.md) |
| Build a channel | [03](./docs/en/03-build-a-channel.md) | [03](./docs/de/03-channel-bauen.md) |
| Manifest & packaging | [04](./docs/en/04-manifest-and-packaging.md) | [04](./docs/de/04-manifest-und-packaging.md) |

---

## License

[MIT](./LICENSE). Fork it, ship it, sell it. Replace the `@acme/*`
placeholders and the `authors` block with your own before you publish.
