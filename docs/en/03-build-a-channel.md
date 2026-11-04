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
| `registerRoute / registerRouter` | Mount channel-scoped HTTP straight on the app. These bypass the `auth` modes and `public_paths` grants of `ctx.routes`: under `/api` the host's session gate still answers anonymous callers with 401 first, outside `/api` nothing protects them. Prefer `ctx.routes.register` with an explicit `auth`. |
| `resolveIdentity(ref)` | Resolve a native user ref to a platform identity. |
| `log(level, msg, ctx)` | Channel-scoped logging. |

## Inbound: native event → turn

Whatever the transport, you build an `IncomingTurn` and hand it to the core.
`handleTurnStream` yields a **discriminated union** — branch on `event.type`,
accumulate `text_delta` chunks, drop what `text_retract` takes back, and take
the authoritative answer from the terminal `done` event:

```ts
import {
  NO_REPLY_SENTINEL,
  isNoReply,
  type ChannelHandle,
  type CoreApi,
  type IncomingTurn,
} from '@omadia/channel-sdk';

const turn: IncomingTurn = {
  channelId: ctx.agentId,
  conversationId: body.conversationId ?? 'default',
  text: body.text,
  userRef: { kind: 'custom', id: body.userId ?? 'anonymous' },
};

let streamed = '';
let finalAnswer: string | null = null;
for await (const event of core.handleTurnStream(turn)) {
  switch (event.type) {
    case 'text_delta': streamed += event.text; break;      // incremental
    case 'text_retract':                                   // preamble taken back
      streamed = streamed.slice(0, Math.max(0, streamed.length - event.chars));
      break;
    case 'done':       finalAnswer = event.answer; break;  // authoritative
    case 'error':      throw new Error(event.message);
    default:           break;                              // tool_use, surface_*, …
  }
}
const answer = (finalAnswer ?? streamed).trim();
```

`text_retract` (#1500) removes the last `chars` characters of the preview: the
model wrote them as a preamble to a tool call ("I'll check that first."), not
as answer text. A richer adapter also inspects `tool_use` / `heartbeat` to
stream typing indicators and renders the terminal answer as native cards. Never index
`event.text` on the bare union — only the `text_delta` arm has it; the `switch`
is what narrows each arm safely.

### Drop deliberate non-answers (`NO_REPLY`)

An orchestrator can decide a turn deserves **no** user-visible reply — a
group-chat message not addressed to the bot, a silent acknowledgement. It
signals that with `NO_REPLY_SENTINEL` (the literal string `"NO_REPLY"`). A
channel **MUST drop** it rather than forward the sentinel to the user:

```ts
if (answer === NO_REPLY_SENTINEL || isNoReply({ text: answer })) {
  core.log('info', 'dropping no-reply turn', { conversationId: turn.conversationId });
  return; // send nothing to the user (e.g. respond HTTP 204)
}
res.json({ reply: answer });
```

Use `isNoReply(...)` rather than a bare string compare: it matches both the
strict `NO_REPLY` answer **and** the trailing-line "I won't reply because…"
anti-pattern, while ignoring an innocent `NO_REPLY` substring inside a real
answer.

### Route the turn to the bound Agent (`channelType` / `channelKey`)

`IncomingTurn` carries optional `channelType` and `channelKey`. A
**single-tenant** channel may leave them unset and drive the shared orchestrator
via `core.handleTurnStream` (what the example does). A **direct-agent /
multi-tenant** channel — where the operator binds several Agents to distinct
`(channelType, channelKey)` routes — **MUST set both** and resolve the bound
Agent **per turn**:

```ts
import { resolveChatAgentForChannel } from '@omadia/channel-sdk';

// channelType is constant for the plugin; channelKey is the conversation the
// operator bound in the dashboard.
const agent = resolveChatAgentForChannel(ctx, 'teams', conversationId);
if (!agent) throw new Error('orchestrator unavailable');
const semantic = await agent.chat({ userMessage: turn.text /* …, sessionScope, userId */ });
```

Resolve it on **every** turn — caching `getChatAgent(ctx)` once at `activate()`
defeats per-binding routing and hot config reloads, which is the whole point of
the seam.

## Two transport shapes

The manifest `channel.transport.kind` is one of `webhook`, `websocket`,
`long-poll`.

### Inbound: the webhook route

**Webhook** (the example). The sender is an external system without an omadia
session, so a default `'session'` route would answer it with 401. Register the
webhook with `auth: 'custom'`, declare its prefix in `permissions.public_paths`
and verify every request yourself. `body: 'raw'` gives you the bytes the
sender signed:

```yaml
permissions:
  public_paths:
    - "/api/example-channel/webhook"
channel:
  transport:
    kind: "webhook"
    routes:
      - { path: "/api/example-channel/webhook", method: "POST" }
    verify_signature: true     # you check the signature in code
```

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

const router = express.Router();
router.post('/', async (req, res) => {
  const raw: unknown = req.body;                 // Buffer, exactly as sent
  if (!Buffer.isBuffer(raw)) { res.status(400).end(); return; }
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(req.get('x-signature-256') ?? '');
  // timingSafeEqual throws on different lengths, hence the length check first.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.status(401).json({ error: 'bad signature' });
    return;
  }
  const body = JSON.parse(raw.toString('utf8'));
  /* …build turn… */
});
const dispose = ctx.routes.register('/api/example-channel/webhook', router, {
  auth: 'custom',
  body: 'raw',
});
```

Never sign `JSON.stringify(req.body)`: re-serialising changes the bytes.
`auth: 'custom'` is a promise that the router authenticates **every** request,
so the example refuses all calls (503) while no signing secret is set and
reports that through `ctx.status`. After install the operator grants
`/api/example-channel/webhook`; until then the host does not serve it.

### Websocket / long-poll

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
ctx.routes.register('/api/example-channel/admin', createAdminRouter({ ... }), { auth: 'session' });
```

The web UI renders that path in an iframe for signed-in operators, so it
stays a `'session'` route. Use **relative** `fetch()` URLs in the page (the
iframe is served through a `/bot-api` rewrite), answer every JSON endpoint as
`{ ok: true, … }` / `{ ok: false, error }`, expose a small `/api/status`
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

Upload, fill setup, grant the public path `/api/example-channel/webhook`,
then exercise the webhook:

```bash
BODY='{ "text": "hello", "conversationId": "c1", "userId": "u1" }'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SIGNING_SECRET" | sed 's/^.* //')"
curl -X POST https://<host>/api/example-channel/webhook \
  -H 'content-type: application/json' \
  -H "x-signature-256: $SIG" \
  -d "$BODY"
```

→ Next: [04 · Manifest & packaging](./04-manifest-and-packaging.md)
