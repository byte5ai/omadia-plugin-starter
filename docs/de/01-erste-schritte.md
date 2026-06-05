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
- optional `skills/`, `assets/`.

Bei der Installation tut der omadia-Host:

1. liest `manifest.yaml` und validiert es,
2. merkt sich die Permissions, die du deklariert hast,
3. importiert `dist/plugin.js` dynamisch,
4. ruft `activate(ctx)` auf (oder `activate(ctx, core)` bei einem Channel),
5. behält das zurückgegebene Handle und ruft `close()` beim Shutdown/Uninstall.

Du greifst nie zu Globals wie `process.env` oder rohem `fetch`. Alles hängt an
`ctx`, scoped auf dein Plugin:

| Du brauchst… | Nimm… | Bereitgestellt, wenn… |
| --- | --- | --- |
| Ein Secret (Token, Key) | `await ctx.secrets.require('x')` | als `type: secret`-Setup-Feld deklariert |
| Einen Config-Wert | `ctx.config.get<T>('x')` | als Setup-Feld deklariert |
| Ein Tool registrieren | `ctx.tools.register(spec, handler)` | immer (Agents) |
| HTTP-Routen mounten | `ctx.routes.register(prefix, router)` | immer |
| Ausgehendes HTTP | `ctx.http.fetch(url)` | `permissions.network.outbound` ist nicht leer |
| Andere Plugins aufrufen | `ctx.services.get/provide(...)` | immer |

## ZIP bauen

Aus dem Repo-Root:

```bash
npm run build:agent      # ein Beispiel
npm run build            # alle Beispiele (Workspaces)
```

Jeder Build führt `scripts/build-zip.mjs` aus: esbuild-bundlet
`src/plugin.ts → dist/plugin.js` und zippt die Runtime-Artefakte nach
`out/<id>-<version>.zip`. Das Type-Gate läuft separat:

```bash
npm run typecheck
```

## Weiter

- Eine Fähigkeit mit Tools → [02 · Agent-Plugin bauen](./02-agent-plugin-bauen.md)
- Eine Messaging-Oberfläche anbinden → [03 · Channel bauen](./03-channel-bauen.md)
- Jedes Manifest-Feld + wie der Upload läuft → [04 · Manifest & Packaging](./04-manifest-und-packaging.md)
