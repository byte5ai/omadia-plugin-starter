# Example: `@acme/channel-webhook`

A minimal omadia **channel** plugin. It accepts an inbound JSON webhook, drives
an orchestrator turn, and returns the assembled reply. Use it as the skeleton
for a real platform adapter (Discord, Slack, Telegram, …).

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity, `channel` transport block, install form, permissions, `admin_ui_path`. |
| `src/plugin.ts` | Exports `activate(ctx, core)`; mounts the webhook + admin routes; drives turns via `core.handleTurnStream`. |
| `src/adminRouter.ts` | The status iframe the web UI renders. |
| `assets/icon.svg` | Store icon. |

## Build a ZIP

```bash
npm install                 # once, from the repo root
npm run build -w examples/channel
# → examples/channel/out/acme-channel-webhook-0.1.0.zip
```

Upload that ZIP in the omadia admin UI (**Store → Upload**).

## Try the flow (after install)

```bash
curl -X POST https://<your-omadia-host>/api/example-channel/webhook \
  -H 'content-type: application/json' \
  -d '{ "text": "hello", "conversationId": "c1", "userId": "u1" }'
```

## Make it real

- Swap the webhook for your platform's transport. For a **websocket** bot
  (Discord/Slack), set `channel.transport.kind: "websocket"`, open the client
  in `activate`, and close it in the handle's `close()`. Add the platform SDK
  to `dependencies` — esbuild bundles it into `dist/plugin.js` automatically.
- Translate `ChatStreamEvent`s into native cards/attachments for the
  `adapters` you declare.

See [`docs/en/03-build-a-channel.md`](../../docs/en/03-build-a-channel.md)
([DE](../../docs/de/03-channel-bauen.md)) for the full walkthrough.
