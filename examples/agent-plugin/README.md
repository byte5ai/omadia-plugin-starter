# Example: `@acme/agent-hello`

A minimal omadia **agent** plugin. It registers one native tool, `say_hello`,
that returns a greeting, and serves a small **Greetings** page that works in
the browser (behind the omadia session) and as a Microsoft Teams tab (kernel
Teams SSO, plugin-api 1.51.0+). Use it as the skeleton for your own agent.

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity, install form, declared tools (`capabilities`), permissions, skills. |
| `src/plugin.ts` | Exports `activate(ctx)`; registers the `say_hello` tool and the page routes. |
| `src/greetingsPage.ts` | The page with plugin data, one router for both mounts. |
| `src/teamsTab.ts` | Teams-tab surface: data-free shell (`'public'`) + data router (`'teams-sso'`) with a fail-closed guard. |
| `skills/system-prompt.md` | Prompt-partial bundled into the ZIP and loaded at activation. |
| `assets/icon.svg` | Store icon. |

## Build a ZIP

```bash
npm install                 # once, from the repo root
npm run build -w examples/agent-plugin
# → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
```

Upload that ZIP in the omadia admin UI (**Store → Upload**).

## Make it yours

1. Rename `@acme/agent-hello` → your reverse-DNS id in `package.json` **and**
   `manifest.yaml` (`identity.id`), and update the `authors` block.
2. Replace the `say_hello` tool in `src/plugin.ts` with your logic, and keep
   the matching `capabilities` entry in `manifest.yaml` in sync.
3. Need network access? Add `permissions.network.outbound` and call through
   `ctx.http` (only then is `ctx.http` provisioned).
4. No pages? Delete `greetingsPage.ts`, `teamsTab.ts`, the page block in
   `plugin.ts`, the manifest's `public_paths` entry and the `express`
   devDependencies, and lower `compat.core` to what you still use.
5. Keeping the page? Rename the `/p/agent-hello` mount and the
   `public_paths` entry to your own slug (your id without the `@scope/`).

After install, the browser page is at `/p/agent-hello/greetings`. The Teams
tab needs an active `@omadia/channel-teams` and the operator's grant of the
public path `/p/agent-hello/teams`.

See [`docs/en/02-build-an-agent-plugin.md`](../../docs/en/02-build-an-agent-plugin.md)
([DE](../../docs/de/02-agent-plugin-bauen.md)) for the full walkthrough.
