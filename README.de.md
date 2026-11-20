<div align="center">

# omadia plugin starter

### Bau dir eigene [omadia](https://omadia.ai)-Plugins und -Channels, und pack sie mit einem Befehl in eine hochladbare ZIP.

Eine fertige Vorlage zum Forken, mit zwei lauffähigen Beispielen und einem Build-Script, das deinen Code in genau die ZIP packt, die das omadia-Admin-UI annimmt. Forken, deine Logik einsetzen, ausliefern.

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](./LICENSE)
[![Built for omadia](https://img.shields.io/badge/built%20for-omadia-2496ED.svg)](https://github.com/byte5ai/omadia)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[**Haupt-Repo**](https://github.com/byte5ai/omadia) · [**Website**](https://omadia.ai) · [**Plugin-Hub**](https://hub.omadia.ai) · [**Schnellstart**](#schnellstart) · [**Doku**](#dokumentation)

🇬🇧 This guide is also available [in English](./README.md).

</div>

---

omadia ist ein agentisches OS: Jede Fähigkeit, jeder Channel und jedes Modell ist ein **Plugin**, das der Host zur Laufzeit lädt, konfiguriert und sandboxed. Ein Plugin ist nur die Lieferform; Agents entstehen im Agent Builder und bekommen die Tools der Plugins, die ein Operator ihnen gewährt. Dieses Repo ist eine fertige Vorlage zum Forken, mit zwei lauffähigen Beispielen und einem Build-Script, das deinen Code in genau die ZIP packt, die das omadia-Admin-UI annimmt.

---

## Was du bauen kannst

Das `identity.kind` im Manifest eines Plugins ist einer von:

| Kind | Was es ist | Beispiel |
| --- | --- | --- |
| `integration` | Zugang zu einem System mit eigenen Zugangsdaten, angeboten als Tools und Services. | gleiche Form wie das Tool-Beispiel |
| `tool` | Tools mit lokaler Logik, optional mit eigenen Seiten (Browser und Teams-Tab), dazu `agent_templates`. | [`examples/tool-plugin`](./examples/tool-plugin) |
| `skill` | Ein wiederverwendbares Vorgehen, dem ein Agent folgen kann. | |
| `channel` | Eine Oberfläche (Discord, Slack, ein Webhook), die Nutzer-Nachrichten rein- und Antworten rausroutet. | [`examples/channel`](./examples/channel) |
| `model` | Ein Modell-, Embedding- oder Transkriptions-Anbieter; nur das Modell-Gateway des Kernels ruft ihn auf. | |
| `archetype` | Eine Art von Agent, im Agent Builder wählbar. | |
| `system-module` | Infrastruktur von omadia selbst. | |
| `agent-template` | Nur Agent-Vorlagen, keine Tools. | |

`agent` und `extension` sind **ausgemusterte** Kinds (eine frühere `extension` ist ein `system-module`, oder ein `model`-Plugin für einen LLM-Anbieter).

Alle Plugins teilen einen Vertrag: Du exportierst ein `async activate(...)`, das ein Handle mit `close()` zurückgibt. Der Unterschied liegt darin, was du in der `manifest.yaml` deklarierst und welche `ctx`-Accessoren du nutzt.

### Die Regeln der Plugin-Grenze

Der Kernel lehnt ein Plugin beim Upload ab, das sie verletzt:

- **Keine Persona.** Kein `persona`/`speaker`/`personality`/`system_prompt` im Manifest, keine `skills` mit `kind: prompt_partial`, keine `AGENT.md` (außer beim Kind `agent-template`). Ein Plugin hat keine eigene Modell-Schleife. Die Rolle, die ein Plugin früher trug, liefert es als **`agent_templates`** (inaktive Vorlagen, je eine pro Sprache), aus denen ein Operator einen Agenten macht.
- **Tools deklarieren `side_effects`.** Jedes mit `ctx.tools.register` registrierte Tool hat einen `capabilities`-Eintrag mit `side_effects: read | write | none`; ohne Eintrag gilt es als `unknown`. `activate` gibt `{ close }` zurück, kein Toolkit.
- **Modelle nur über `ctx.llm`.** Keine rohen Modell-Services (`anthropicClient@1`, `llm@1`, `llmProviderPool`), kein eigener Anthropic-/OpenAI-Client, kein direkter Aufruf eines Modell-Anbieter-Hosts.
- **Netz nur über `ctx.http`.** Der Kernel sandboxt den globalen `fetch` (`PLUGIN_EGRESS_MODE`); erlaubte Hosts stehen in `permissions.network.outbound`.
- **`compat.core`** ist `">=1.77.0 <2.0"` für alles, was die neuen Kinds oder `agent_templates` nutzt; ältere Kerne können sie nicht laden.

---

## Schnellstart

```bash
# Node 22 ist über .nvmrc gepinnt
nvm use            # oder: Node >= 20 installieren

npm install        # installiert die geteilte Toolchain (Workspaces)

# Beispiel wählen, Upload-ZIP bauen:
npm run build:tool       # -> examples/tool-plugin/out/acme-tool-hello-0.1.0.zip
npm run build:channel    # -> examples/channel/out/acme-channel-webhook-0.1.0.zip

# oder alles typechecken / bauen:
npm run typecheck
npm run build
```

Danach im omadia **Admin-UI -> Store -> Upload** die ZIP reinziehen.

> ℹ️ Zwei Wege, ein Plugin auszuliefern. Lade die ZIP im Admin-UI hoch, oder
> veröffentliche sie im **omadia-Hub** unter [hub.omadia.ai](https://hub.omadia.ai)
> und installiere sie von dort auf jedem Host. Die ZIP, die du hier baust, ist
> genau das, was beide annehmen.

---

## Wie das zusammenspielt

```
dein Code (src/plugin.ts)
        |   esbuild-Bundle  (host-bereitgestellte Peers bleiben external)
        v
   dist/plugin.js  +  manifest.yaml  +  assets/
        |   zip
        v
   out/<id>-<version>.zip  --Upload-->  omadia-Host
                                          laedt dist/plugin.js
                                          ruft activate(ctx[, core]) auf
```

Der Host validiert das Manifest, prüft die Permissions und ruft dein `activate` auf. Jeder externe Effekt (Secrets, Netzwerk, Dateisystem, Memory) kommt über `ctx` zu dir, beschränkt auf das, was dein Manifest deklariert.

---

## Repo-Aufbau

```
omadia-plugin-starter/
├── README.md / README.de.md     <- du bist hier
├── docs/en/ · docs/de/          <- vollständige Guides (zweisprachig)
├── scripts/build-zip.mjs        <- der esbuild->zip-Build (von den Beispielen geteilt)
├── tsconfig.base.json           <- geteilte Compiler-Konfig
├── types/                       <- lokale SDK-Typ-Stubs (offline kompilieren)
│   ├── omadia-plugin-api.d.ts
│   └── omadia-channel-sdk.d.ts
└── examples/
    ├── tool-plugin/             <- @acme/tool-hello (Kind tool + Agent-Vorlagen)
    └── channel/                 <- @acme/channel-webhook
```

### Zu den SDK-Typ-Stubs

`@omadia/plugin-api` und `@omadia/channel-sdk` werden **vom omadia-Host zur Laufzeit bereitgestellt**. Sie liegen nicht auf npm, du installierst und bundlest sie also nicht. Damit dein Plugin trotzdem offline typecheckt, liefert dieses Repo originalgetreue Typ-Stubs in [`types/`](./types). Der Build markiert die echten Pakete als `external`, der Host liefert dann die echten Implementierungen.

`types/omadia-plugin-api.d.ts` bildet **`@omadia/plugin-api` 1.53.0** ab: Die Module für Plugin-Autoren sind wörtlich aus den kompilierten Deklarationen dieser Version übernommen. Route-Auth-Modi (`'session' | 'public' | 'custom' | 'teams-sso'`), `TeamsSsoUser`, `verifyConnection`, `ctx.sql` und der Rest von `ctx` sind also genau so typisiert, wie der Host sie definiert. Version und Commit stehen im Dateikopf. Ein wöchentlicher Workflow (`SDK drift check`) vergleicht beide Stubs mit omadia `main` und öffnet ein Issue, wenn sie abweichen. Welche Host-Versionen dein Plugin unterstützt, steht im Manifest unter `compat.core` ([01 · Erste Schritte](./docs/de/01-erste-schritte.md#gegen-welche-omadia-version-du-baust)).

---

## Dokumentation

| Guide | Deutsch | English |
| --- | --- | --- |
| Erste Schritte | [01](./docs/de/01-erste-schritte.md) | [01](./docs/en/01-getting-started.md) |
| Capability-Plugin bauen | [02](./docs/de/02-capability-plugin-bauen.md) | [02](./docs/en/02-build-a-capability-plugin.md) |
| Channel bauen | [03](./docs/de/03-channel-bauen.md) | [03](./docs/en/03-build-a-channel.md) |
| Manifest & Packaging | [04](./docs/de/04-manifest-und-packaging.md) | [04](./docs/en/04-manifest-and-packaging.md) |

---

## Lizenz

[MIT](./LICENSE). Fork es, ship es, verkauf es. Ersetz die `@acme/*`-Platzhalter und den `authors`-Block durch deine eigenen, bevor du veröffentlichst.
