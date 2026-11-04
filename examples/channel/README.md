# Example: `@acme/channel-webhook`

A minimal omadia **channel** plugin. It accepts an inbound, HMAC-signed JSON
webhook, drives an orchestrator turn, and returns the assembled reply. The
webhook is registered with `auth: 'custom'` + `body: 'raw'` under a declared
`permissions.public_paths` entry, because the sender has no omadia session. Use it as the skeleton
for a real platform adapter (Discord, Slack, Telegram, …).

## What's here

| File | Purpose |
| --- | --- |
| `manifest.yaml` | Identity, `channel` transport block, install form, permissions, `admin_ui_path`. |
| `src/plugin.ts` | Exports `activate(ctx, core)`; verifies the `x-signature-256` HMAC, mounts the webhook (`'custom'`) + admin (`'session'`) routes, drives turns via `core.handleTurnStream`. |
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

Set the signing secret, grant the public path `/api/example-channel/webhook`
(install dialog or store page), then:

```bash
BODY='{ "text": "hello", "conversationId": "c1", "userId": "u1" }'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SIGNING_SECRET" | sed 's/^.* //')"
curl -X POST https://<your-omadia-host>/api/example-channel/webhook \
  -H 'content-type: application/json' \
  -H "x-signature-256: $SIG" \
  -d "$BODY"
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
