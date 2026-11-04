# 02 · Agent-Plugin bauen

Ein **Agent** ist eine Fähigkeit, die der Orchestrator auswählen und aufrufen
kann. Er deklariert ein oder mehrere Tools (`capabilities`) und implementiert
sie im Code. Das ausgearbeitete Beispiel ist
[`examples/agent-plugin`](../../examples/agent-plugin) — `@acme/agent-hello`.
Es liefert außerdem eine Seite aus, die im Browser und als Microsoft-Teams-Tab
funktioniert ([Seiten und Teams-Tabs](#seiten-und-teams-tabs)).

## Der Vertrag

```ts
import type { PluginContext } from '@omadia/plugin-api';

export const AGENT_ID = '@acme/agent-hello' as const;

export interface AgentHandle {
  close(): Promise<void>;
}

export async function activate(ctx: PluginContext): Promise<AgentHandle> {
  // …Tools registrieren, Ressourcen öffnen…
  return {
    async close() {
      // …Ressourcen freigeben…
    },
  };
}

export default { AGENT_ID, activate };
```

- `activate` wird **einmal** aufgerufen, wenn der Agent aktiviert wird. Bleib
  unter 10 s: kein Vollsync, kein Massen-Crawl.
- Es gibt ein Handle zurück; der Host ruft `close()` beim Deaktivieren,
  Deinstallieren oder Herunterfahren. Bleib unter 5 s und gib Timer, Sockets
  und Intervalle wirklich frei.
- `AGENT_ID` muss `identity.id` in `manifest.yaml` **und** dem Package-`name`
  entsprechen.
- Jedes `register(...)` auf `ctx` gibt eine Dispose-Funktion zurück. Ruf sie
  alle in `close()` auf.

## Ein Tool registrieren

Ein Tool besteht aus einem JSON-Schema-Input und einem Handler, der einen
**String** zurückgibt (meist JSON, das das Modell liest):

```ts
const dispose = ctx.tools.register(
  {
    name: 'say_hello',
    description: 'Returns a friendly greeting for the given name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Who to greet.' } },
      required: ['name'],
    },
  },
  async (input) => {
    const { name } = (input ?? {}) as { name?: string };
    return JSON.stringify({ message: `Hello, ${name ?? 'world'}!` });
  },
);
```

**Code und Manifest synchron halten.** Jedes registrierte Tool braucht einen
passenden Eintrag unter `capabilities` in `manifest.yaml` (gleiche `id`/`name`
und `input_schema`). Diese deklarative Kopie zeigt der Orchestrator dem Modell
und nutzt sie zum Routing.

Das optionale dritte Argument (`ToolRegistrationOptions`):

| Option | Zweck |
| --- | --- |
| `promptDoc` | Ein Absatz, der in die Tool-Liste des System-Prompts eingefügt wird. |
| `isAvailable: () => boolean` | Blendet das Tool (Spec und `promptDoc`) in Turns aus, in denen es nur scheitern kann, etwa ein Tool, das nur manche Channels bedienen. Wird pro Turn ausgewertet und muss für den ganzen Turn gleich antworten. Es blendet nur aus: Der Handler muss einen Aufruf trotzdem wahrheitsgemäß beantworten. Ab plugin-api 1.31.0; ältere Hosts ignorieren es. |
| `writeCapabilities` | Erklärt, dass das Tool Daten ändern kann; das schaltet den Schutz gegen doppelte Schreibvorgänge ein. |
| `attachmentSink` | Sammelt pro Turn die Medien ein, die das Tool erzeugt hat. |

### Fehler, die das Modell lesen kann

Ein geworfener Fehler erreicht das Modell nur als zurückgehaltener Hinweis
(„das Ergebnis ist unbekannt"). Hat das Tool den Aufruf **nicht** ausgeführt
und kannst du den Grund in einer Nachricht nennen, die gefahrlos sichtbar sein
darf (keine Datensätze, kein Fehlertext von außen), wirf stattdessen einen
`ToolRefusalError`:

```ts
throw Object.assign(new Error('Ticket ids are numeric, e.g. 4711.'), {
  name: 'ToolRefusalError',
});
```

Hosts erkennen ihn am `name` (ab plugin-api 1.28.0). Diese Form lädt also auch
auf einem älteren Host, der ihn wie jeden anderen Fehler zurückhält. Setzt du
den Host ohnehin voraus, geht auch
`import { ToolRefusalError } from '@omadia/plugin-api'`.

## Konfiguration & Secrets lesen

Manifest-`setup.fields` werden zu Eingaben, die der Operator bei der
Installation ausfüllt:

```ts
const greeting = ctx.config.get<string>('greeting') ?? 'Hello';   // normales Feld
const apiKey   = await ctx.secrets.require('api_key');            // type: secret
```

`ctx.secrets.require` wirft, wenn das Secret fehlt; `ctx.secrets.get` gibt
`undefined` zurück. Deklariere jedes Feld unter `setup.fields`, sonst fragt der
Host es nicht ab. Beide Accessoren lösen außerdem entlang der
`depends_on`-Kette auf: Ein Plugin, das von einer Integration abhängt, liest
deren Secrets über den Key, ohne sie zu benennen. Deklariere ein Feld also nur
selbst, wenn es kein Parent schon hat.

> **Sag dem Operator, wie er an diese Werte kommt.** Für alles, was er
> *außerhalb* von omadia einrichten muss (API-Key erstellen, App registrieren),
> ergänze ein lokalisiertes `setup.guide` im Manifest. Es erscheint neben
> diesen Feldern auf der Hub-Seite und im Store. Siehe
> [Manifest & Packaging](./04-manifest-und-packaging.md).

## Die Verbindung prüfen: `verifyConnection`

Prüfe Credentials **nicht** in `activate`: Eine Aktivierung darf nicht
scheitern, weil das Zielsystem gerade nicht erreichbar ist. Exportiere
stattdessen neben `activate` ein optionales `verifyConnection` (ab plugin-api
1.35.0). Der Host ruft es nach jeder erfolgreichen Aktivierung auf und wenn
der Operator *Erneut prüfen* klickt, mit 5 s Budget, und es kann die
Aktivierung nie scheitern lassen:

```ts
import {
  classifyHttpAuthFailure,
  type PluginConnectionVerdict,
  type PluginContext,
} from '@omadia/plugin-api';

export async function verifyConnection(ctx: PluginContext): Promise<PluginConnectionVerdict> {
  try {
    if (!ctx.http) return { status: 'inconclusive' };
    const res = await ctx.http.fetch('https://api.example.com/v1/me', {
      headers: { authorization: `Bearer ${await ctx.secrets.require('api_key')}` },
    });
    const cause = classifyHttpAuthFailure(res.status, await res.text());
    if (cause) return { status: 'rejected', cause, title: 'Nicht verbunden', detail: 'Der API-Key wurde abgelehnt.' };
    return res.ok ? { status: 'connected', title: 'Verbunden' } : { status: 'inconclusive' };
  } catch {
    return { status: 'inconclusive' };   // Timeout, DNS, Ausfall: Status des Operators bleibt
  }
}
```

`rejected` färbt das Plugin rot **und** entzieht ihm seine Tools. Der Host
nimmt es deshalb nur mit einem `cause` an (`http_401`, `http_403_auth`,
`protocol_auth_failure`); ohne wird es zu `inconclusive` herabgestuft.
`classifyHttpAuthFailure` und `PluginConnectionVerdict` gibt es ab plugin-api
1.35.0. Ein Plugin, das die Funktion importiert, braucht also
`compat.core: ">=1.35.0 <2.0"`.

Probleme, die du später bemerkst (ein Key wird im Betrieb widerrufen), meldest
du selbst: `ctx.status.report({ state: 'error', title, detail })`, und
`ctx.status.clear()`, sobald sie behoben sind. `state: 'ok'` mit `title`
erscheint als positives Badge mit einer Zeit, die der Host setzt.

`ctx.smokeMode` ist `true`, wenn der Agent Builder das Plugin nur aktiviert,
um seine Admin-Routen zu prüfen. Verzweige darauf, um Mock-Daten zu liefern,
statt eine nicht idempotente API aufzurufen.

## Ins Netz rufen

Ausgehendes HTTP ist gesperrt, bis du die Hosts deklarierst:

```yaml
permissions:
  network:
    outbound:
      - "api.example.com"
      - "*.example.com"     # eine Subdomain-Ebene, nicht example.com selbst
```

…erst dann ist `ctx.http` vorhanden. Schick **allen** Traffic darüber, damit
Allow-List, SSRF-Schutz und Rate-Limit (60 Requests pro gleitender Minute)
greifen:

```ts
if (!ctx.http) throw new Error('manifest must declare permissions.network.outbound');
const res = await ctx.http.fetch('https://api.example.com/v1/ping');
```

Ein Host außerhalb der Liste wirft `HttpForbiddenError`, ein überschrittenes
Budget `HttpRateLimitError`. Zeilenprotokolle (SMTP, IMAP) laufen über
`ctx.net.connect` und sind über `permissions.network.outbound_tcp` freigegeben.

## Andere Plugins nutzen: `requires`, `optional_requires`, `depends_on`

Plugins teilen Capabilities über `ctx.services`. Der Service-Name **ist** der
Capability-Name, und du darfst nur Namen auflösen, die dein Manifest
deklariert:

```yaml
requires: ["knowledgeGraph@^1"]          # muss bereitgestellt sein, sonst scheitert die Installation
optional_requires: ["transcription@^1"]  # darf fehlen
```

```ts
const graph = ctx.services.get<MyGraph>('knowledgeGraph');            // requires
const stt = ctx.services.getOptional<MyStt>('transcription');          // optional_requires
```

Ein nicht deklarierter Name wirft `ServiceNotDeclaredError` (ein
Manifest-Fehler), was etwas anderes ist als `undefined` (kein Provider
installiert). Ein optionaler Provider kann nach dir aktiviert werden; löse
optionale Services deshalb erst bei der ersten Nutzung auf.

`depends_on` nennt konkrete Plugin-IDs statt Capabilities. Der Host
installiert dein Plugin erst, wenn diese Parents installiert sind, und dein
`ctx.secrets`/`ctx.config` liest bis zu ihren Werten durch (siehe oben).

## Seiten und Teams-Tabs

Ein Plugin kann mit `ctx.routes.register(prefix, router, options)` eigene
HTTP-Routen ausliefern. Der Host legt eine feste Kette um deinen
Express-Router: Deaktivierungs-Guard → Auth → Body-Parser → dein Router.

**`auth`** (Default `'session'`):

| Modus | Wer kommt rein |
| --- | --- |
| `'session'` | Requests mit gültiger omadia-Operator-Session. Auf **jedem** Prefix, `/p/…` eingeschlossen: Kein Prefix ist ausgenommen. |
| `'public'` | Alle. Nur für Inhalte, die jeder sehen darf, etwa eine Seitenhülle ohne Daten. |
| `'custom'` | Alle, und dein Router sagt zu, jeden Request selbst zu authentifizieren (Webhook-HMAC, OAuth-`state`, signierte Links). |
| `'teams-sso'` | Requests mit gültigem Microsoft-Teams-SSO-Token, das der Host prüft (ab plugin-api 1.51.0). Siehe unten. |

`'public'`, `'custom'` und `'teams-sso'` brauchen **zwei** Dinge:

1. Das Prefix liegt unterhalb eines Eintrags in `permissions.public_paths`
   deines Manifests, sonst wirft `register()`. Jeder Eintrag ist ein schlichter
   Pfad mit mindestens zwei Segmenten (keine Wildcards, kein
   Percent-Encoding), unter `/api/plugins/` oder unter einem Prefix, an dem
   dein Plugin einen Router registriert. Die Prüfung geht in eine Richtung:
   Eine Deklaration `/api/plugins/acme/hooks` erlaubt
   `register('/api/plugins/acme/hooks', …)`, aber nicht
   `register('/api/plugins/acme', …)`.
2. Der Operator gibt diesen Pfad frei, im Install-Dialog oder später auf der
   Store-Seite des Plugins. Bis dahin liefert der Host ihn gar nicht aus, und
   die Freigabe endet, wenn das Plugin deaktiviert wird.

Einen Modus „ohne Auth", den du selbst wählen kannst, gibt es nicht: Du
beantragst ein Prefix, der Operator stimmt zu.

**`body`** (Default `'json'`): `'json'` ist geparstes JSON (10 MB); `'raw'`
liefert die unveränderten Bytes als `Buffer` auf `req.body` und `req.rawBody`
(Default 512 KB, änderbar mit `bodyLimit`), genau das, was eine HMAC-Prüfung
braucht; `'none'` hängt keinen Parser ein. `'raw'` wird vor der
Authentifizierung gepuffert und braucht deshalb dieselbe
`public_paths`-Deklaration wie `'public'`.

### Eine Seite im Browser

```ts
ctx.routes.register('/p/agent-hello', pageRouter, { auth: 'session' });
ctx.uiRoutes.register({ routeId: 'greetings', path: '/greetings', title: 'Greetings' });
```

Hänge Seiten unter `/p/<deine ID ohne @scope/>` ein. `ctx.uiRoutes.register`
veröffentlicht die Seite im Katalog, den die Hub-Karten und die
Tab-Konfiguration von channel-teams lesen; `path` ist relativ zu diesem
`/p/<slug>`-Mount. Für einen Eintrag in der Navigation der Operator-Weboberfläche
nimm `ctx.uiRoutes.registerNav({ navId, label: { en, de }, href })` (oder
`pluginUi: true` für eine mitgelieferte UI).

### Dieselbe Seite als Teams-Tab

Ein Teams-Tab öffnet seine URL als schlichten GET: kein omadia-Session-Cookie,
kein Token. Eine `'session'`-Seite antwortet in Teams deshalb mit 401. Behebe
das **nicht**, indem du eine Seite mit Daten auf `'public'` oder `'custom'`
stellst. Nimm das Muster, das das Beispiel umsetzt
([`src/teamsTab.ts`](../../examples/agent-plugin/src/teamsTab.ts)):

| Prefix | `auth` | Liefert |
| --- | --- | --- |
| `/p/<slug><path>` | `'session'` | die Seite, für Operatoren im Browser |
| `/p/<slug>/teams<path>` | `'public'` | eine Hülle **ohne Daten**: Titel und eine Statuszeile |
| `/p/<slug>/teams/_data<path>` | `'teams-sso'` | die Seite, nur mit gültigem Teams-Token |

```ts
const MOUNT = '/p/agent-hello/teams';
ctx.routes.register('/p/agent-hello', pageRouter, { auth: 'session' });
ctx.routes.register(MOUNT, teamsTab.shell, { auth: 'public' });
ctx.routes.register(`${MOUNT}/_data`, teamsTab.data, { auth: 'teams-sso' });
ctx.uiRoutes.register({ routeId: 'greetings', path: '/teams/greetings', title: 'Greetings' });
```

```yaml
compat:
  core: ">=1.51.0 <2.0"
permissions:
  public_paths:
    - "/p/agent-hello/teams"
```

- **Die Hülle** lädt das Teams-JS-SDK 2.34.0 von `res.cdn.office.net` mit
  seinem Subresource-Integrity-Hash, ruft `app.initialize()` auf (nach 8 s
  Timeout erscheint „Open this page inside Microsoft Teams."), holt mit
  `authentication.getAuthToken()` ein Token, ruft `<MOUNT>/_data<path>` plus
  `location.search` mit `Authorization: Bearer <token>`,
  `credentials: 'omit'` und `cache: 'no-store'` ab und ersetzt sich durch die
  Antwort (`document.open(); document.write(html); document.close()`), sonst
  zeigt sie eine Fehlerzeile.
- **Der Daten-Router** ist **ein** Router für alle Seiten: Der Host leitet
  einen freigegebenen Pfad an genau einen Routen-Eintrag weiter, mehrere
  Router auf demselben Prefix würden also nur den ersten bedienen. Seine
  **erste** Middleware ist ein Guard, der für ältere Hosts ohne `'teams-sso'`
  geschlossen bleibt:

  ```ts
  data.use((req, res, next) => {
    if (!(req as { teamsSsoUser?: unknown }).teamsSsoUser) {
      res.status(401).json({ code: 'auth.teams_sso_required' });
      return;
    }
    next();
  });
  data.use(pageRouter);   // die Renderer der Session-Seite wiederverwenden
  ```

- **Der `uiRoutes`-Eintrag** zeigt auf die Hülle (`/teams<path>`), weil
  channel-teams genau diesen Pfad als Tab-URL festhält.
- **Wer reinkommt.** Der Host prüft die Signatur des Tokens gegen Entra, dass
  es für einen Bot des installierten, aktiven `@omadia/channel-teams` an einen
  Teams- oder Microsoft-365-Client ausgestellt wurde, dass es ein delegiertes
  Token eines **Mitglieds** des Tenants ist (Gastkonten, private
  Microsoft-Konten und reine App-Tokens werden abgewiesen), und seine
  Laufzeit. Jeder Fehler ist derselbe
  `401 {"code":"auth.teams_sso_required"}`. Ein omadia-Session-Cookie öffnet
  eine `'teams-sso'`-Route **nicht**. Jedes Mitglied des Bot-Tenants kann den
  Tab öffnen; die Freigabe des Pfads ist die Zustimmung des Operators zu dieser
  Reichweite. Zum Einschränken autorisierst du im Handler auf
  `req.teamsSsoUser.oid`, oder der Operator setzt in Entra an der Enterprise-App
  des Bots „Zuweisung erforderlich".
- **Der Nutzer** steht auf `req.teamsSsoUser`, Typ `TeamsSsoUser`
  (`{ oid, tenantId, appId, upn? }`). `upn` ist für Anzeige und Logs;
  autorisiere auf `oid`.

Ein echter Login im Teams-Tab braucht außerdem die Entra-Einrichtung „Expose an
API" (Scope `access_as_user`, vorab autorisierte Teams-Clients) an der
App-Registrierung des Bots; das ist Einrichtung von channel-teams, kein
Plugin-Code.

### Ein Webhook

Eine Route, die ein externes System ohne omadia-Credential aufruft, nimmt
`auth: 'custom'` und prüft jeden Request selbst. Für eine HMAC-Signatur nimm
`body: 'raw'` und signiere die Bytes, wie sie ankamen. Genau das macht das
Channel-Beispiel; siehe [03 · Channel bauen](./03-channel-bauen.md#eingang-die-webhook-route).

## Geplante Jobs

Deklariere Jobs im Manifest (der Host registriert sie vorab) oder registriere
sie im Code:

```ts
const dispose = ctx.jobs.register(
  { name: 'refresh-cache', schedule: { cron: '*/15 * * * *' }, overlap: 'skip' },
  async (signal) => { /* `signal` an fetch weitergeben; bricht bei Deaktivierung/Timeout ab */ },
);
```

`schedule` ist `{ cron }` oder `{ intervalMs }`; `timeoutMs` ist per Default
30 s; `overlap` ist `'skip'` (Default) oder `'queue'`. Ein Fehler wird geloggt
und stoppt keine späteren Ausführungen.

## Skills (Prompt-Partials)

Leg wiederverwendbare Prompt-Fragmente in `skills/` ab und referenziere sie im
Manifest:

```yaml
skills:
  - id: "hello_system_prompt"
    kind: "prompt_partial"
    path: "skills/system-prompt.md"
```

Sie landen in der ZIP und werden bei der Aktivierung geladen.

## Bauen & installieren

```bash
npm run build -w examples/agent-plugin
# → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
```

Lade sie über **Admin-UI → Store → Upload** hoch, füll das Setup-Formular aus
und sprich den Agent an (z.B. *„Sag Hallo zu Ada."*). Die Browser-Seite liegt
unter `/p/agent-hello/greetings`; der Teams-Tab braucht die Freigabe von
`/p/agent-hello/teams` und ein aktives `@omadia/channel-teams`.

## Alternative: das Toolkit-Muster

Für Agents mit vielen Tools und geteiltem Zustand gibst du die Tools aus
`activate` als Toolkit-Objekt zurück (`{ toolkit, close() }`) und hältst die
Handler in einem eigenen Modul. Gleicher Vertrag, nur aufgeräumter für eine
große Tool-Oberfläche. Die einfache `ctx.tools.register`-Form oben ist der
leichteste Einstieg.

→ Weiter: [03 · Channel bauen](./03-channel-bauen.md) ·
[04 · Manifest & Packaging](./04-manifest-und-packaging.md)
