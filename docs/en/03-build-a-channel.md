# 03 · Build a channel

A **channel** connects an external surface — Discord, Slack, Telegram, a plain
webhook — to the orchestrator. It receives native events, translates them to
the core `IncomingTurn` shape, drives a turn, and renders the answer back. The
worked example is [`examples/channel`](../../examples/channel) —
`@acme/channel-webhook`.

## The contract

Channels take a **second argument**, `core`:

```ts
import type { PluginContext } from '@omadia/plugin-api';
import type { ChannelHandle, CoreApi, IncomingTurn } from '@omadia/channel-sdk';

export async function activate(ctx: PluginContext, core: CoreApi): Promise<ChannelHandle> {
  // …open transport, mount routes…
  return { async close() { /* …tear down… */ } };
}
```

`ctx` is the same per-plugin context as an agent (secrets, config, routes).
`core` is the channel-only API:

| `core` method | Use |
| --- | --- |
| `handleTurnStream(turn)` | Drive an orchestrator turn; yields `ChatStreamEvent`s. |
| `registerRoute / registerRouter` | Mount channel-scoped HTTP (alternative to `ctx.routes`). |
| `resolveIdentity(ref)` | Resolve a native user ref to a platform identity. |
| `log(level, msg, ctx)` | Channel-scoped logging. |

## Inbound: native event → turn

Whatever the transport, you build an `IncomingTurn` and hand it to the core:

```ts
const turn: IncomingTurn = {
  channelId: ctx.agentId,
  conversationId: body.conversationId ?? 'default',
  text: body.text,
  userRef: { kind: 'custom', id: body.userId ?? 'anonymous' },
};

let reply = '';
for await (const event of core.handleTurnStream(turn)) {
  if (typeof event.text === 'string') reply += event.text;   // accumulate deltas
}
```

`ChatStreamEvent` is a stream of incremental + terminal events. The example
just concatenates text; a richer adapter inspects the event types to stream
typing indicators and render the terminal answer as native cards.

## Two transport shapes

The manifest `channel.transport.kind` is one of `webhook`, `websocket`,
`long-poll`.

**Webhook** (the example) — the host exposes an inbound route; you mount the
handler and verify the request:

```yaml
channel:
  transport:
    kind: "webhook"
    routes:
      - { path: "/api/example-channel/webhook", method: "POST" }
    verify_signature: true     # you check the signature in code
```

```ts
const router = express.Router();
router.post('/webhook', express.json(), async (req, res) => { /* …build turn… */ });
const dispose = ctx.routes.register('/api/example-channel', router);
```

**Websocket / long-poll** (Discord, Slack, Telegram) — open a long-lived client
in `activate`, route its messages, and close it in `close()`:

```ts
const client = new SomeSdkClient({ token: await ctx.secrets.require('bot_token') });
client.on('message', async (m) => { /* build turn, handleTurnStream, reply natively */ });
await client.login();
return { async close() { await client.destroy(); } };
```

Set `transport.kind: "websocket"` and **no** `routes`. Add the platform SDK to
`dependencies` — esbuild bundles it into `dist/plugin.js` automatically (see
[bundling](#why-channels-must-bundle)).

## Admin UI

Declare an iframe surface and mount a matching router:

```yaml
admin_ui_path: "/api/example-channel/admin/index.html"
```

```ts
ctx.routes.register('/api/example-channel/admin', createAdminRouter({ ... }));
```

The web UI renders that path in an iframe. Expose a small `/api/status` JSON
endpoint for a live status pill, and return mock data when `ctx.smokeMode` is
true.

## Why channels must bundle

The host resolves a plugin's bare imports against **its own** `node_modules`.
Anything it doesn't already ship — `discord.js`, `@slack/web-api`, your SDK —
must be **bundled** into `dist/plugin.js`. That's why the build uses esbuild,
not plain `tsc`: it inlines your non-host dependencies and keeps only the
host-provided peers (`@omadia/*`, `express`) external. You get this for free —
just `npm install` the SDK as a normal `dependency` and run `npm run build`.

## Capabilities & adapters

Declare what your surface supports so the orchestrator can gate features:

```yaml
channel:
  capabilities: ["text", "typing_indicator", "interactive_cards"]
  adapters: ["text", "markdown", "block_kit"]
```

`capabilities` are feature flags (`text`, `attachments`, `interactive_cards`,
`user_sso`, `file_upload`, `typing_indicator`). `adapters` are the outbound
render shapes you implement (`text`, `markdown`, `adaptive_card`, `block_kit`,
`interactive_message`, `discord_components`, `telegram_keyboard`).

## Build & install

```bash
npm run build -w examples/channel
# → examples/channel/out/acme-channel-webhook-0.1.0.zip
```

> **Document the bot setup.** A channel almost always needs the operator to
> create a bot/app on the provider first (token, webhook secret, invite). Put
> those steps in a localized `setup.guide` in your manifest — it renders on the
> Hub page and next to the install form. See
> [Manifest & packaging](./04-manifest-and-packaging.md).

Upload, fill setup, then exercise the webhook:

```bash
curl -X POST https://<host>/api/example-channel/webhook \
  -H 'content-type: application/json' \
  -d '{ "text": "hello", "conversationId": "c1", "userId": "u1" }'
```

→ Next: [04 · Manifest & packaging](./04-manifest-and-packaging.md)
