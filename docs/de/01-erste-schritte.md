# 01 · Erste Schritte

Diese Seite bringt dich vom frischen Clone zur hochladbaren ZIP.

## Voraussetzungen

- **Node ≥ 20** (das Repo pinnt **22** über `.nvmrc`; führ `nvm use` aus).
- Das **`zip`**-CLI (auf macOS/Linux vorinstalliert; unter Windows `7z` oder
  PowerShell `Compress-Archive` nutzen und `scripts/build-zip.mjs` anpassen).
- Zugang zu einem **omadia-Host** mit Admin-UI, um das Gebaute zu installieren.

## Installation

```bash
git clone https://github.com/byte5ai/omadia-plugin-starter.git
cd omadia-plugin-starter
nvm use
npm install
```

`npm install` richtet einen npm-**Workspace** ein: Die geteilte Toolchain
(`typescript`, `esbuild`, `@types/node`) liegt im Root, jedes Beispiel unter
`examples/*` nutzt sie mit.

## Das mentale Modell

Ein Plugin ist ein Ordner, der zu einer ZIP baut, die enthält:

- `dist/plugin.js` — dein gebundelter Code, der `activate(...)` exportiert.
- `manifest.yaml` — wer du bist, was du brauchst, was du bereitstellst.
- optional `assets/` (und `skills/` beim Kind `skill`).

Beim Hochladen und Installieren der ZIP macht der omadia-Host Folgendes:

1. liest `manifest.yaml` und validiert es,
2. prüft `compat.core` gegen seine eigene `@omadia/plugin-api`-Version und
   lehnt das Paket ab, wenn der Bereich sie nicht einschließt (siehe unten),
3. merkt sich die deklarierten Permissions und fragt den Operator nach den
   Freigaben, die Zustimmung brauchen (öffentliche Pfade, SQL, …),
4. importiert `dist/plugin.js` dynamisch,
5. ruft `activate(ctx)` auf (oder `activate(ctx, core)` bei einem Channel),
   danach deinen optionalen Export `verifyConnection(ctx)`,
6. behält das zurückgegebene Handle und ruft `close()` beim Deaktivieren,
   Deinstallieren oder Herunterfahren.

Du greifst nie zu Globals wie `process.env` oder rohem `fetch` (der Kernel sandboxt ihn; Netz läuft über `ctx.http`, Modelle über `ctx.llm`). Alles hängt an
`ctx`, scoped auf dein Plugin:

| Du brauchst… | Nimm… | Bereitgestellt, wenn… |
| --- | --- | --- |
| Ein Secret (Token, Key) | `await ctx.secrets.require('x')` | als `type: secret`-Setup-Feld deklariert |
| Einen Config-Wert | `ctx.config.get<T>('x')` | als Setup-Feld deklariert |
| Ein Tool registrieren | `ctx.tools.register(spec, handler, options?)` | immer (Capability-Plugins) |
| HTTP-Routen mounten | `ctx.routes.register(prefix, router, { auth, body })` | immer; jedes `auth` außer `'session'` braucht einen freigegebenen `permissions.public_paths`-Eintrag |
| Eine Seite listen (Teams-Tab, Hub-Karte) | `ctx.uiRoutes.register({ routeId, path, title })` | immer |
| Ein Status-Badge zeigen | `ctx.status.report({ state, title })` | immer |
| Ausgehendes HTTP | `ctx.http.fetch(url)` | `permissions.network.outbound` ist nicht leer |
| Eine Capability eines anderen Plugins | `ctx.services.get(name)` / `getOptional(name)` | `name` steht unter `requires` / `optional_requires` |
| Eine Capability anbieten | `ctx.services.provide(name, impl)` | immer; unter `provides` eintragen, damit andere sie per `requires` anfordern können |

Optionale Accessoren (`ctx.http`, `ctx.llm`, …) sind
`undefined`, solange das Manifest die zugehörige Permission nicht deklariert.
Prüfe sie mit `if (ctx.http)`. Die vollständige Oberfläche steht in
[`types/omadia-plugin-api.d.ts`](../../types/omadia-plugin-api.d.ts).

## Welche Art Plugin du baust

Ein Plugin ist nur die Lieferform; `identity.kind` sagt, was es liefert:
`integration`, `tool`, `skill`, `channel`, `model`, `archetype`,
`system-module` oder `agent-template`. Die Kinds `agent` und `extension` sind
ausgemustert: Ein Plugin hat weder Persona noch eigene Modell-Schleife, es
liefert Tools, und der Agent spricht. Siehe
[02](./02-capability-plugin-bauen.md#was-ein-plugin-ist-und-was-nicht).

## Gegen welche omadia-Version du baust

`@omadia/plugin-api` ist der Vertrag zwischen deinem Plugin und dem Host. Er
ist nach SemVer versioniert und wächst innerhalb von 1.x nur. Die Datei
[`types/omadia-plugin-api.d.ts`](../../types/omadia-plugin-api.d.ts) in diesem
Repo bildet **plugin-api 1.53.0** ab (die Version steht im Dateikopf). Jede
Ergänzung ist im
[`middleware/packages/plugin-api/CHANGELOG.md`](https://github.com/byte5ai/omadia/blob/main/middleware/packages/plugin-api/CHANGELOG.md)
des omadia-Repos beschrieben.

Zur Laufzeit linkt dein Plugin gegen die plugin-api **des Hosts**, und die
kann älter sein als die, gegen die du kompiliert hast. Welche Versionen du
unterstützt, sagst du mit `compat.core`: Der Host prüft den Bereich beim
Hochladen der ZIP und noch einmal bei der Installation gegen seine eigene
plugin-api-Version und lehnt das Paket außerhalb davon ab
(`package.incompatible_core` / `install.incompatible_core`). Setz die
Untergrenze auf die plugin-api-Version, die das Neueste eingeführt hat, das du
nutzt, zum Beispiel `">=1.51.0 <2.0"` für `auth: 'teams-sso'`; die neuen Kinds und `agent_templates` brauchen `">=1.75.0 <2.0"`. Ohne `compat`
gilt `">=1.0 <2.0"`.

## ZIP bauen

Aus dem Repo-Root:

```bash
npm run build:tool       # ein Beispiel
npm run build            # alle Beispiele (Workspaces)
```

Jeder Build führt `scripts/build-zip.mjs` aus: esbuild-bundlet
`src/plugin.ts → dist/plugin.js` und zippt die Runtime-Artefakte nach
`out/<id>-<version>.zip`. Das Type-Gate läuft separat:

```bash
npm run typecheck
```

## Weiter

- Tools für Agents → [02 · Capability-Plugin bauen](./02-capability-plugin-bauen.md)
- Eine Messaging-Oberfläche anbinden → [03 · Channel bauen](./03-channel-bauen.md)
- Jedes Manifest-Feld + wie der Upload läuft → [04 · Manifest & Packaging](./04-manifest-und-packaging.md)
