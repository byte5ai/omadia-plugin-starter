# omadia Plugin Starter

**Bau dir eigene [omadia](https://omadia.ai)-Plugins und -Channels — und pack
sie mit einem Befehl in eine hochladbare ZIP.**

> 🇬🇧 This guide is also available [in English](./README.md).

omadia ist ein agentisches OS: Jeder Agent, jeder Channel und jede Integration
ist ein **Plugin**, das der Host zur Laufzeit lädt, konfiguriert und sandboxed.
Dieses Repo ist eine fertige Vorlage zum Forken — mit zwei lauffähigen
Beispielen und einem Build-Script, das deinen Code in genau die ZIP packt, die
das omadia-Admin-UI annimmt.

---

## Was du bauen kannst

| Art | Was es ist | Einstieg | Beispiel |
| --- | --- | --- | --- |
| **Agent** | Eine Fähigkeit mit Tools, die der Orchestrator aufrufen kann. | `activate(ctx)` | [`examples/agent-plugin`](./examples/agent-plugin) |
| **Channel** | Eine Oberfläche (Discord, Slack, ein Webhook…), die Nutzer-Nachrichten rein- und Antworten rausroutet. | `activate(ctx, core)` | [`examples/channel`](./examples/channel) |
| **Integration** | Ein Connector, der ein externes System als Tools/Services bereitstellt. | `activate(ctx)` | siehe Agent-Beispiel — gleiche Form |

Alle drei teilen einen Vertrag: Du exportierst ein `async activate(...)`, das
ein Handle mit `close()` zurückgibt. Der Unterschied liegt darin, was du in der
`manifest.yaml` deklarierst und welche `ctx`-Accessoren du nutzt.

---

## Schnellstart

```bash
# Node 22 ist über .nvmrc gepinnt
nvm use            # oder: Node >= 20 installieren

npm install        # installiert die geteilte Toolchain (Workspaces)

# Beispiel wählen, Upload-ZIP bauen:
npm run build:agent      # → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
npm run build:channel    # → examples/channel/out/acme-channel-webhook-0.1.0.zip

# …oder alles typechecken / bauen:
npm run typecheck
npm run build
```

Danach im omadia **Admin-UI → Store → Upload** die ZIP reinziehen.

> ℹ️ Aktuell ist der ZIP-Upload der **einzige** Weg, ein Plugin zu installieren —
> zum Teilen reichst du die ZIP direkt weiter. Ein öffentlicher **omadia-Hub**,
> auf dem du Plugins einmal einreichst und jeder Host sie holt, ist geplant; die
> ZIP, die du heute baust, ist genau das, was er annehmen wird.

---

## Wie das zusammenspielt

```
dein Code (src/plugin.ts)
        │   esbuild-Bundle  (host-bereitgestellte Peers bleiben external)
        ▼
   dist/plugin.js  +  manifest.yaml  +  skills/  +  assets/
        │   zip
        ▼
   out/<id>-<version>.zip  ──Upload──▶  omadia-Host
                                          lädt dist/plugin.js
                                          ruft activate(ctx[, core]) auf
```

Der Host validiert das Manifest, prüft die Permissions und ruft dein
`activate` auf. Jeder externe Effekt (Secrets, Netzwerk, Dateisystem, Memory)
kommt über `ctx` zu dir — exakt auf das beschränkt, was dein Manifest
deklariert.

---

## Repo-Aufbau

```
omadia-plugin-starter/
├── README.md / README.de.md     ← du bist hier
├── docs/en/ · docs/de/          ← vollständige Guides (zweisprachig)
├── scripts/build-zip.mjs        ← der esbuild→zip-Build (von den Beispielen geteilt)
├── tsconfig.base.json           ← geteilte Compiler-Konfig
├── types/                       ← lokale SDK-Typ-Stubs (offline kompilieren)
│   ├── omadia-plugin-api.d.ts
│   └── omadia-channel-sdk.d.ts
└── examples/
    ├── agent-plugin/            ← @acme/agent-hello
    └── channel/                 ← @acme/channel-webhook
```

### Zu den SDK-Typ-Stubs

`@omadia/plugin-api` und `@omadia/channel-sdk` werden **vom omadia-Host zur
Laufzeit bereitgestellt** — sie liegen nicht auf npm, du installierst und
bundlest sie also nicht. Damit dein Plugin trotzdem offline typecheckt, liefert
dieses Repo originalgetreue Typ-Stubs in [`types/`](./types). Der Build markiert
die echten Pakete als `external`, der Host liefert dann die echten
Implementierungen. Halte die Stubs zu der omadia-Version aktuell, die du
anvisierst.

---

## Dokumentation

| Guide | Deutsch | English |
| --- | --- | --- |
| Erste Schritte | [01](./docs/de/01-erste-schritte.md) | [01](./docs/en/01-getting-started.md) |
| Agent-Plugin bauen | [02](./docs/de/02-agent-plugin-bauen.md) | [02](./docs/en/02-build-an-agent-plugin.md) |
| Channel bauen | [03](./docs/de/03-channel-bauen.md) | [03](./docs/en/03-build-a-channel.md) |
| Manifest & Packaging | [04](./docs/de/04-manifest-und-packaging.md) | [04](./docs/en/04-manifest-and-packaging.md) |

---

## Lizenz

[MIT](./LICENSE) — fork es, ship es, verkauf es. Ersetz die `@acme/*`-Platzhalter
und den `authors`-Block durch deine eigenen, bevor du veröffentlichst.
