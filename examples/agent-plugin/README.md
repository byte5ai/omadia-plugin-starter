# Example: `@acme/agent-hello`

A minimal omadia **agent** plugin. It registers one native tool, `say_hello`,
that returns a greeting. Use it as the skeleton for your own agent.

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity, install form, declared tools (`capabilities`), permissions, skills. |
| `src/plugin.ts` | Exports `activate(ctx)`; registers the `say_hello` tool. |
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

See [`docs/en/02-build-an-agent-plugin.md`](../../docs/en/02-build-an-agent-plugin.md)
([DE](../../docs/de/02-agent-plugin-bauen.md)) for the full walkthrough.
