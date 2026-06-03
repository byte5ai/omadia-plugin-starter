# 03 · Channel bauen

Ein **Channel** verbindet eine externe Oberfläche — Discord, Slack, Telegram,
einen schlichten Webhook — mit dem Orchestrator. Er empfängt native Events,
übersetzt sie in die Core-`IncomingTurn`-Form, treibt einen Turn an und rendert
die Antwort zurück. Das ausgearbeitete Beispiel ist
[`examples/channel`](../../examples/channel) — `@acme/channel-webhook`.

## Der Vertrag

Channels nehmen ein **zweites Argument**, `core`:

```ts
import type { PluginContext } from '@omadia/plugin-api';
import type { ChannelHandle, CoreApi, IncomingTurn } from '@omadia/channel-sdk';

export async function activate(ctx: PluginContext, core: CoreApi): Promise<ChannelHandle> {
  // …Transport öffnen, Routen mounten…
  return { async close() { /* …abbauen… */ } };
}
```

`ctx` ist derselbe Per-Plugin-Kontext wie bei einem Agent (Secrets, Config,
Routes). `core` ist die Channel-spezifische API:

| `core`-Methode | Wofür |
| --- | --- |
| `handleTurnStream(turn)` | Treibt einen Orchestrator-Turn an; liefert `ChatStreamEvent`s. |
| `registerRoute / registerRouter` | Mountet Channel-scoped HTTP (Alternative zu `ctx.routes`). |
| `resolveIdentity(ref)` | Löst eine native User-Ref zu einer Plattform-Identität auf. |
| `log(level, msg, ctx)` | Channel-scoped Logging. |

## Inbound: natives Event → Turn

Egal welcher Transport — du baust einen `IncomingTurn` und gibst ihn an den
Core:

```ts
const turn: IncomingTurn = {
  channelId: ctx.agentId,
  conversationId: body.conversationId ?? 'default',
  text: body.text,
  userRef: { kind: 'custom', id: body.userId ?? 'anonymous' },
};

let reply = '';
for await (const event of core.handleTurnStream(turn)) {
  if (typeof event.text === 'string') reply += event.text;   // Deltas sammeln
}
```

`ChatStreamEvent` ist ein Strom aus inkrementellen + terminalen Events. Das
Beispiel hängt nur Text aneinander; ein reicherer Adapter inspiziert die
Event-Typen, um Typing-Indicators zu streamen und die finale Antwort als native
Cards zu rendern.

## Zwei Transport-Formen

Das Manifest-`channel.transport.kind` ist eines von `webhook`, `websocket`,
`long-poll`.

**Webhook** (das Beispiel) — der Host exponiert eine Inbound-Route; du mountest
den Handler und verifizierst den Request:

```yaml
channel:
  transport:
    kind: "webhook"
    routes:
      - { path: "/api/example-channel/webhook", method: "POST" }
    verify_signature: true     # du prüfst die Signatur im Code
```

```ts
const router = express.Router();
router.post('/webhook', express.json(), async (req, res) => { /* …Turn bauen… */ });
const dispose = ctx.routes.register('/api/example-channel', router);
```

**Websocket / long-poll** (Discord, Slack, Telegram) — öffne in `activate` einen
langlebigen Client, route seine Nachrichten und schließe ihn in `close()`:

```ts
const client = new SomeSdkClient({ token: await ctx.secrets.require('bot_token') });
client.on('message', async (m) => { /* Turn bauen, handleTurnStream, nativ antworten */ });
await client.login();
return { async close() { await client.destroy(); } };
```

Setz `transport.kind: "websocket"` und **keine** `routes`. Füg das
Plattform-SDK zu `dependencies` hinzu — esbuild bundlet es automatisch in
`dist/plugin.js` (siehe [Bundling](#warum-channels-bundlen-müssen)).

## Admin-UI

Deklariere eine iframe-Oberfläche und mounte einen passenden Router:

```yaml
admin_ui_path: "/api/example-channel/admin/index.html"
```

```ts
ctx.routes.register('/api/example-channel/admin', createAdminRouter({ ... }));
```

Das Web-UI rendert diesen Pfad in einem iframe. Exponiere einen kleinen
`/api/status`-JSON-Endpoint für ein Live-Status-Pill und gib Mock-Daten zurück,
wenn `ctx.smokeMode` true ist.

## Warum Channels bundlen müssen

Der Host löst die Bare-Imports eines Plugins gegen sein **eigenes**
`node_modules` auf. Alles, was er nicht ohnehin mitliefert — `discord.js`,
`@slack/web-api`, dein SDK — muss in `dist/plugin.js` **gebundelt** werden.
Darum nutzt der Build esbuild statt schlichtes `tsc`: Es inlinet deine
Nicht-Host-Abhängigkeiten und lässt nur die host-bereitgestellten Peers
(`@omadia/*`, `express`) external. Das kriegst du geschenkt — `npm install` das
SDK als normale `dependency` und führ `npm run build` aus.

## Capabilities & Adapters

Deklariere, was deine Oberfläche unterstützt, damit der Orchestrator Features
gaten kann:

```yaml
channel:
  capabilities: ["text", "typing_indicator", "interactive_cards"]
  adapters: ["text", "markdown", "block_kit"]
```

`capabilities` sind Feature-Flags (`text`, `attachments`, `interactive_cards`,
`user_sso`, `file_upload`, `typing_indicator`). `adapters` sind die
Outbound-Render-Formen, die du implementierst (`text`, `markdown`,
`adaptive_card`, `block_kit`, `interactive_message`, `discord_components`,
`telegram_keyboard`).

## Bauen & installieren

```bash
npm run build -w examples/channel
# → examples/channel/out/acme-channel-webhook-0.1.0.zip
```

> **Dokumentiere das Bot-Setup.** Ein Channel braucht fast immer, dass der
> Operator zuerst beim Anbieter einen Bot/eine App anlegt (Token, Webhook-Secret,
> Einladung). Schreib diese Schritte in eine lokalisierte `setup.guide` im
> Manifest — sie wird auf der Hub-Seite und neben dem Install-Formular gerendert.
> Siehe [Manifest & Packaging](./04-manifest-und-packaging.md).

Hochladen, Setup ausfüllen, dann den Webhook testen:

```bash
curl -X POST https://<host>/api/example-channel/webhook \
  -H 'content-type: application/json' \
  -d '{ "text": "hello", "conversationId": "c1", "userId": "u1" }'
```

→ Weiter: [04 · Manifest & Packaging](./04-manifest-und-packaging.md)
