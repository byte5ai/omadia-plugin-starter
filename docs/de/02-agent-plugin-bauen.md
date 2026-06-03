# 02 · Agent-Plugin bauen

Ein **Agent** ist eine Fähigkeit, die der Orchestrator auswählen und aufrufen
kann. Er deklariert ein oder mehrere Tools (`capabilities`) und implementiert
sie im Code. Das ausgearbeitete Beispiel ist
[`examples/agent-plugin`](../../examples/agent-plugin) — `@acme/agent-hello`.

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

- `activate` wird **einmal** aufgerufen, wenn der Agent aktiviert wird.
- Es gibt ein Handle zurück; der Host ruft `close()` beim
  Deaktivieren/Deinstallieren/Shutdown.
- `AGENT_ID` muss gleich `identity.id` in der `manifest.yaml` **und** dem
  Paket-`name` sein.

## Ein Tool registrieren

Ein Tool ist ein JSON-Schema-Input plus ein Handler, der einen **String**
zurückgibt (meist JSON, das das Modell dann liest):

```ts
ctx.tools.register(
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
passenden Eintrag unter `capabilities` in der `manifest.yaml` (gleiche
`id`/`name` und `input_schema`) — diese deklarative Kopie ist es, die der
Orchestrator dem Modell zeigt und für das Routing nutzt.

## Config & Secrets lesen

Manifest-`setup.fields` werden zu Operator-Eingaben bei der Installation:

```ts
const greeting = ctx.config.get<string>('greeting') ?? 'Hello';   // normales Feld
const apiKey   = await ctx.secrets.require('api_key');            // type: secret
```

`ctx.secrets.require` wirft, wenn das Secret fehlt; `ctx.secrets.get` gibt
`undefined` zurück. Deklariere jedes Feld unter `setup.fields`, sonst sammelt
der Host es nicht ein.

> **Erkläre dem Operator, woher er diese Werte bekommt.** Für alles, was er
> *außerhalb* von Omadia einrichten muss (API-Key erstellen, App registrieren),
> ergänze eine lokalisierte `setup.guide` im Manifest — sie wird neben diesen
> Feldern auf der Hub-Seite und im Store gerendert. Siehe
> [Manifest & Packaging](./04-manifest-und-packaging.md).

## Self-Test

Bei `setup.self_test: true` aktiviert der Host dein Plugin direkt nach der
Installation einmal, um zu prüfen, dass es bootet. Mach deinen günstigen
Erreichbarkeits-/Credential-Check in `activate` und **wirf eine klare
Fehlermeldung** bei Misserfolg — der Operator sieht den Text. Das Flag
`ctx.smokeMode` ist `true` während der Kernel-Validierung; verzweige darauf, um
Mock-Daten zurückzugeben statt ein echtes Backend zu treffen.

## Nach außen ins Netz

Ausgehendes HTTP ist gegated. Deklariere die Hosts:

```yaml
permissions:
  network:
    outbound:
      - "api.example.com"
      - "*.example.com"
```

…und erst dann wird `ctx.http` bereitgestellt. Route **allen** Traffic
darüber, damit Allow-List und Audit-Mode greifen:

```ts
if (!ctx.http) throw new Error('manifest must declare permissions.network.outbound');
const res = await ctx.http.fetch('https://api.example.com/v1/ping');
```

## Skills (Prompt-Partials)

Liefere wiederverwendbare Prompt-Fragmente in `skills/` und referenziere sie im
Manifest:

```yaml
skills:
  - id: "hello_system_prompt"
    kind: "prompt_partial"
    path: "skills/system-prompt.md"
    shareable: false
```

Sie werden in die ZIP gebundelt und bei der Aktivierung geladen.
`shareable: true` erlaubt anderen Agents, das Partial zu referenzieren.

## Bauen & installieren

```bash
npm run build -w examples/agent-plugin
# → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
```

Über **Admin-UI → Store → Upload** hochladen, das Setup-Formular ausfüllen und
den Agent prompten (z. B. *„Say hello to Ada."*).

## Alternative: das Toolkit-Pattern

Für Agents mit vielen Tools und geteiltem State gibst du die Tools aus
`activate` als Toolkit-Objekt zurück (`{ toolkit, close() }`) und hältst die
Handler in einem separaten Modul. Gleicher Vertrag — nur eine sauberere Art,
eine große Tool-Oberfläche zu organisieren. Die einzelne
`ctx.tools.register`-Form oben ist der einfachste Einstieg.

→ Weiter: [03 · Channel bauen](./03-channel-bauen.md) ·
[04 · Manifest & Packaging](./04-manifest-und-packaging.md)
