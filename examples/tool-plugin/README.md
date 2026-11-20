# Example: `@acme/tool-hello`

A minimal omadia **capability plugin** of kind `tool`. It registers two native
tools, `hello_say` and `hello_stats`, and serves a small **Greetings** page
that works in the browser (behind the omadia session) and as a Microsoft Teams
tab (kernel Teams SSO, plugin-api 1.51.0+). Use it as the skeleton for your own
tools.

A plugin delivers tools; it is **not** an agent. It has no persona, no system
prompt and no model loop of its own. The operator grants its tools to an agent
in the Agent Builder, and the role you would otherwise write into the plugin
ships as an inactive **agent template** (`agent_templates` in the manifest, one
English and one German).

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity (`kind: "tool"`), install form, one `capabilities` entry per tool with its `side_effects`, playbook, permissions, `agent_templates`. |
| `src/plugin.ts` | Exports `activate(ctx)`; registers both tools with `ctx.tools.register` and the page routes; returns `{ close }`. |
| `src/greetingsPage.ts` | The page with plugin data, one router for both mounts. |
| `src/teamsTab.ts` | Teams-tab surface: data-free shell (`'public'`) + data router (`'teams-sso'`) with a fail-closed guard. |
| `assets/icon.svg` | Store icon. |

## Build a ZIP

```bash
npm install                 # once, from the repo root
npm run build -w examples/tool-plugin
# → examples/tool-plugin/out/acme-tool-hello-0.1.0.zip
```

Upload that ZIP in the omadia admin UI (**Store → Upload**). It needs a host
whose plugin-api is 1.76.0 or newer (`compat.core`).

## Make it yours

1. Rename `@acme/tool-hello` → your reverse-DNS id in `package.json` **and**
   `manifest.yaml` (`identity.id`), and update the `authors` block.
2. Replace the tools in `src/plugin.ts` with your logic and keep one
   `capabilities` entry per tool in `manifest.yaml` (same `id`, same
   `input_schema`). Set its `side_effects` honestly: `read` reads a system,
   `write` changes a system, `none` touches none. Without an entry the tool
   counts as `unknown`.
3. Does the plugin talk to a system that needs credentials? Make it
   `kind: "integration"` instead of `tool`.
4. Need network access? Add `permissions.network.outbound` and call through
   `ctx.http` only. Never use global `fetch`, `node:http(s)` or an SDK with its
   own networking: the kernel sandboxes them.
5. Need a model? Use `ctx.llm` (declare `permissions.llm`). Never call a model
   provider yourself.
6. Rewrite `agent_templates` for your role: the persona goes there, never into
   the manifest as `persona`/`system_prompt`, and no `AGENT.md`.
7. No pages? Delete `greetingsPage.ts`, `teamsTab.ts`, the page block in
   `plugin.ts`, the manifest's `public_paths` entry and the `express`
   devDependencies.
8. Keeping the page? Rename the `/p/tool-hello` mount and the `public_paths`
   entry to your own slug (your id without the `@scope/`).

After install, the browser page is at `/p/tool-hello/greetings`. The Teams
tab needs an active `@omadia/channel-teams` and the operator's grant of the
public path `/p/tool-hello/teams`.

See [`docs/en/02-build-a-capability-plugin.md`](../../docs/en/02-build-a-capability-plugin.md)
([DE](../../docs/de/02-capability-plugin-bauen.md)) for the full walkthrough.
