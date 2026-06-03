# 04 · Manifest & Packaging

Die `manifest.yaml` ist der Vertrag deines Plugins mit dem Host. Diese Seite ist
die Feld-Referenz plus wie die ZIP gebaut und hochgeladen wird.

## Manifest-Referenz

```yaml
schema_version: "1"            # erforderlich

identity:
  id: "@you/your-plugin"       # erforderlich; Reverse-DNS, == package.json "name"
  kind: "agent"                # "agent" (Default) | "channel" | "integration"
  domain: "your-domain"        # kurzer Routing-/Gruppierungs-Key
  name: "Your Plugin"          # Anzeigename
  version: "0.1.0"             # erforderlich; semver, == package.json "version"
  description: "≤140 Zeichen."
  authors:
    - { name: "Your Name", email: "you@example.com", url: "https://example.com" }
  license: "MIT"               # SPDX-Id
  homepage: "https://…"        # optional
  icon: "./assets/icon.svg"    # relativer Pfad, gebundelt
  categories: ["examples"]     # optionale Store-Facetten

compat:
  core: ">=1.0 <2.0"           # Host-Versionsbereich, den du unterstützt
  node: ">=20"                 # optional

depends_on: []                 # andere Plugin-Ids, die zuerst aktivieren müssen
                               # (z. B. "@omadia/memory", wenn du ctx.memory nutzt)

lifecycle:
  entry: "dist/plugin.js"      # erforderlich; das Modul, das activate(...) exportiert
  hooks:                       # optional; alle boolean, Default false
    onInstall: true
    onConfigure: true
    onActivate: true
    onDeactivate: true
    onUninstall: true
  uninstall_policy:            # was mit den Daten des Plugins beim Entfernen passiert
    entities: "delete"         # "keep" | "quarantine" | "delete"
    memory:   "delete"
    secrets:  "delete"

setup:
  guide:                       # optionale lokalisierte Anleitung (Markdown)
    en: |                      # wie man das Drittsystem aufsetzt
      ## Create the bot / get the API key, step by step …
    de: |                      # mindestens `en` mitliefern; `de` etc. nach Möglichkeit
      ## Bot anlegen / API-Key besorgen, Schritt für Schritt …
  fields:                      # Operator-Eingabeformular bei der Installation
    - key: "api_key"
      type: "secret"           # string | url | secret | oauth | enum | boolean | integer | host_list
      label: "API key"
      help: "Wo man ihn findet."
      required: true
      # typ-spezifische Extras: default, placeholder, pattern, enum:[…],
      # provider/scopes (oauth)
  self_test: true              # nach Installation einmal aktivieren zum Prüfen

permissions:                   # Least-Privilege; weggelassen = verweigert
  memory:  { reads: [], writes: [] }     # Namespace-Globs, z. B. "agent:@you/x:*"
  graph:   { reads: [], writes: [] }
  network: { outbound: [] }              # Host-Globs; nicht leer → ctx.http existiert
  filesystem: { scratch: false }         # true → ctx.scratch-Verzeichnis

# ── nur Agents ─────────────────────────────────────────────────────────────
capabilities:                  # die Tools, die der Orchestrator aufrufen kann
  - id: "do_thing"
    description: "…"
    input_schema:  { type: "object", required: ["x"], properties: { x: { type: "string" } } }
    output_schema: { type: "object", properties: { y: { type: "string" } } }
    side_effects: "read"       # "read" | "write"
    idempotent: true
    timeout_ms: 5000
    rate_limit: { per_minute: 30 }

playbook:                      # Routing-Hinweise in natürlicher Sprache
  when_to_use: "…"
  example_prompts: ["…"]
  not_for: ["…"]

skills:                        # gebundelte Prompt-Partials / Schemas / Daten
  - { id: "sys", kind: "prompt_partial", path: "skills/system.md", shareable: false }

# ── nur Channels (Schema-Abschnitt 14) ─────────────────────────────────────
admin_ui_path: "/api/your-channel/admin/index.html"   # optionale iframe-Oberfläche
channel:
  transport:
    kind: "webhook"            # webhook | websocket | long-poll
    routes:                    # erforderlich für kind: webhook
      - { path: "/api/your-channel/webhook", method: "POST" }
    verify_signature: true     # du verifizierst Inbound-Requests im Code
  capabilities: ["text", "typing_indicator"]   # Feature-Flags
  adapters: ["text", "markdown"]               # Outbound-Render-Formen
```

> Agents deklarieren `capabilities` + `playbook`; Channels deklarieren
> stattdessen den `channel`-Block. Nicht mischen.

### `setup.guide` — Anleitung für das Drittsystem

`setup.guide` ist eine **optionale** lokalisierte Markdown-Anleitung, die
automatisch auf der Hub-Seite deines Plugins und im Omadia-Store neben dem
Install-Formular gerendert wird. Damit erklärst du, was der Operator **außerhalb**
von Omadia tun muss — einen Discord-Bot anlegen, eine Azure-AD-App registrieren,
einen API-Key holen. Sie ist nach Locale gekeyt (`en`, `de`, …); liefere
mindestens `en` mit. Markdown unterstützt Überschriften, nummerierte Listen,
Links und Code. Sie ist reine Anzeige (wird nie ausgeführt) und wird unverändert
ins ZIP kopiert, reist also mit deinem Plugin mit. Weglassen, wenn dein Plugin
keinen externen Setup braucht.

## Was in die ZIP kommt

`scripts/build-zip.mjs` staged und zippt genau diese (falls vorhanden):

```
manifest.yaml   package.json   dist/   assets/   skills/   README.md   LICENSE   NOTICE
```

Regeln:

- **`dist/plugin.js` und `manifest.yaml` sind Pflicht**, und `lifecycle.entry`
  muss auf Ersteres zeigen.
- **Kein `node_modules/`** — esbuild bundlet deine Nicht-Host-Deps in
  `dist/plugin.js`.
- `skills/` muss in der ZIP sein, wenn dein Manifest Prompt-Partials
  referenziert.

## Hochladen

**Aktuell ist der einzige Weg, ein Plugin zu installieren, die ZIP, die du
gerade gebaut hast.** Im Omadia-Admin-UI unter *Store → Upload* reinziehen; der
Host validiert das Manifest, prüft auf fehlende Host-Peers und registriert das
Plugin. Zum Teilen reichst du die ZIP direkt weiter (E-Mail, geteiltes
Laufwerk, eigener Download-Link).

> ℹ️ **Bald: der Omadia-Hub.** Eine öffentliche Registry, auf der du ein Plugin
> einmal *einreichst* und jeder Omadia-Host es entdecken, holen und (per
> `sha256`) verifizieren kann — ohne manuelle ZIP-Weitergabe. **Das ist noch
> nicht verfügbar**; bis dahin ist der ZIP-Upload oben der einzige unterstützte
> Weg. Die ZIP, die du heute baust, ist genau das Artefakt, das der Hub später
> annehmen wird — nichts davon ist Wegwerfarbeit.

## Versionierung

Veröffentlichte Versionen sind **immutable**. Um eine Änderung auszuliefern,
bump `version` in **beiden** — `package.json` und `manifest.yaml` (gleich
halten) — und baue neu; der ZIP-Name (`out/<id>-<version>.zip`) ändert sich mit.

## Pre-Flight-Checkliste

- [ ] `identity.id` == `package.json` `name`; `version`s stimmen überein.
- [ ] `lifecycle.entry: "dist/plugin.js"`.
- [ ] Jedes registrierte Tool hat einen passenden `capabilities`-Eintrag (Agents).
- [ ] Jeder `ctx.secrets`/`ctx.config`-Key hat einen `setup.fields`-Eintrag.
- [ ] Drittsystem-Setup (falls vorhanden) in einer lokalisierten `setup.guide` dokumentiert.
- [ ] `permissions` listen genau die Hosts/Namespaces, die du nutzt — nicht mehr.
- [ ] `npm run typecheck` sauber, `npm run build` erzeugt die ZIP.
- [ ] Platzhalter (`@acme/*`, `Your Name`) ersetzt.
