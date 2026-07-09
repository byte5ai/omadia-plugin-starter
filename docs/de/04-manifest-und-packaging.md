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

provides: []                   # Capability-Ids, die dieses Plugin anderen anbietet
requires: []                   # Capability-Ids, die von einem aktiven Plugin
                               # bereitgestellt sein MÜSSEN — harter Fehler bei
                               # der Aktivierung, wenn nicht

multi_instance: true           # false → nur eine Installation erlaubt; wenn false…
multi_instance_justification: "" #   …ist hier ein nicht-leerer Grund PFLICHT
privacy_class: "default"       # "default" | "strict" (strengere PII-Behandlung)
is_reference_only: true        # OB-29-0: aus dem Store ausblenden; nur
                               # Builder-Pattern-Quelle. Für echte Plugins weglassen/false.

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
      # options_provider: "list_things"  # Capability-Id liefert dynamisches Enum
      # multi: true                       # mehrere ausgewählte Werte erlauben
  self_test: true              # nach Installation einmal aktivieren zum Prüfen

permissions:                   # Least-Privilege; weggelassen = verweigert
  memory:  { reads: [], writes: [] }     # Namespace-Globs, z. B. "agent:@you/x:*"
  graph:
    reads:  []                           # Node-Labels, z. B. "Turn", "Person"
    writes: []
    entity_systems: []                   # plugin-eigene KG-Namespaces, akzeptiert von
                                         # ctx.knowledgeGraph.ingestEntities;
                                         # "odoo"/"confluence" reserviert (gestrippt)
  network:
    outbound: []                         # Host-Globs; nicht leer → ctx.http existiert
    web_scanner: false                   # true → ctx Web-Scanner-Oberfläche
    audit_mode: "single-host"            # single-host | allowlist | public-web
  filesystem: { scratch: false }         # true → ctx.scratch-Verzeichnis
  secrets: { runtime_write: false }      # true → ctx.secrets darf zur Laufzeit schreiben
  subAgents:                             # gated ctx.subAgent.ask (sonst wirft es)
    calls: []                            # erlaubte Sub-Agent-Ids; weggelassen = verweigert
    calls_per_invocation: 5              # Budget pro Handler-Aufruf (Default 5)
  llm:                                   # gated ctx.llm.complete (sonst wirft es)
    models_allowed: []                   # Modell-Globs, z. B. "claude-haiku-4-5*"
    calls_per_invocation: 2              # Default 5
    max_tokens_per_call: 1024            # Default 4096
  flows: false                           # true → Conductor-Flow-Toolkit
  events: { emit: false }                # true → ctx.events.emit deklarierter Events
  mcp: false                             # true, oder { servers_hint: [...] } → ctx.mcp

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

jobs:                          # geplante Background-Jobs (cron); braucht den Host-
  - name: "weekly-digest"      #   Scheduler. Gated auch ctx.jobs.register.
    schedule: { cron: "0 8 * * MON" }
    timeoutMs: 30000
    overlap: skip              # skip | queue | allow

# ── nur Integrationen ──────────────────────────────────────────────────────
oauth_providers:               # kernel-vermittelte OAuth-Deskriptoren (inerte
  - id: "acme"                 #   Daten; die Host-Engine führt den Flow aus, nicht dein Code)
    authorize_url: "https://acme.example/oauth/authorize"
    token_url: "https://acme.example/oauth/token"
    client_id_field: "acme_client_id"       # setup.fields-Key mit der Id
    client_secret_field: "acme_client_secret"
    token_auth_style: "body_form"           # body_form | body_json | basic
    pkce: true                              # Default true
service_types:                 # eine ctx.services.provide-Oberfläche auf einen TS-Typ mappen
  - service: "acme.client"
    type: { from: "@acme/integration-acme", name: "AcmeClient" }

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

### Erweiterte Felder

Alles unten ist **optional** und defaultet auf den sicheren/Aus-Wert — deklarier
ein Feld nur, wenn du die Capability nutzt, die es gated.

- **`provides` / `requires`** — Capability-Ids (Freitext-Strings), die ein
  Plugin anbietet oder braucht. Ein `requires` ohne aktiven Provider ist ein
  **harter Fehler bei der Aktivierung** — deklarier also nur, was du wirklich
  brauchst.
- **`jobs`** — cron-geplante Background-Arbeit (`{ name, schedule.cron,
  timeoutMs, overlap }`, `overlap: skip | queue | allow`). Braucht den
  Host-Scheduler; derselbe Check gated das programmatische `ctx.jobs.register`.
- **`permissions.subAgents`** — `{ calls: [ids], calls_per_invocation }`
  (Budget-Default 5). Ohne das wirft `ctx.subAgent.ask` `SubAgentPermissionDenied`.
- **`permissions.llm`** — `{ models_allowed: [globs], calls_per_invocation (Def
  5), max_tokens_per_call (Def 4096) }`. Gated `ctx.llm.complete`; ein Modell
  außerhalb der Liste wirft `LlmModelNotAllowed`.
- **`permissions.graph.entity_systems`** — plugin-eigene KG-Namespaces,
  akzeptiert von `ctx.knowledgeGraph.ingestEntities`. `odoo` / `confluence`
  sind host-reserviert und werden stillschweigend gestrippt.
- **`permissions.secrets.runtime_write: true`** — erlaubt dem Plugin, Vault-
  Secrets zur Laufzeit zu schreiben (`ctx.secrets.set`), nicht nur
  Install-Zeit-Felder zu lesen.
- **`permissions.flows: true`** — schaltet das Conductor-Flow-Toolkit frei.
- **`permissions.events.emit: true`** — erlaubt dem Plugin, deklarierte
  Domain-Events über `ctx.events.emit` zu senden.
- **`permissions.mcp: true`** (oder `{ servers_hint: [...] }`) — schaltet
  `ctx.mcp` frei, host-gepoolten Zugriff auf MCP-Tool-Server. Nur Server, die
  der Operator *explizit für dieses Plugin* im Control Center freigegeben hat,
  lösen auf — kein ambienter Zugriff auf jeden registrierten Server. Calls
  laufen durch den geteilten Connection-Pool des Hosts, das
  Scan-Verdict-Dispatch-Gate und ein Per-Plugin-Call-Audit-Log.
  `servers_hint` ist eine optionale Liste erwarteter Server-Ids, rein
  informativ für die Grant-UI des Operators — sie gewährt selbst keinen
  Zugriff. Mit `if (ctx.mcp)` gaten: ein Hub-Plugin kann auf einem älteren
  Core landen, dem dieser Accessor komplett fehlt.
- **`permissions.network.web_scanner` / `audit_mode`** — die Web-Scanner-
  Oberfläche freischalten; `audit_mode` ist `single-host | allowlist | public-web`.
- **`oauth_providers`** *(Integrationen)* — inerte OAuth-Deskriptoren, die der
  Broker des Hosts ausführt. Jeder braucht `id`, `authorize_url`, `token_url`,
  `client_id_field`, `client_secret_field` und einen `token_auth_style` von
  `body_form | body_json | basic`; fehlerhafte Einträge werden verworfen.
- **`service_types`** *(Integrationen)* — eine `ctx.services.provide(...)`-
  Oberfläche auf den TypeScript-Typ mappen, den ein Konsument importiert:
  `{ service, type: { from, name } }`.
- **`multi_instance`** — defaultet `true`; setz `false` für Singletons, dann
  ist eine nicht-leere `multi_instance_justification` **erforderlich**.
- **`privacy_class`** — `default` oder `strict` (strengere PII-Behandlung);
  alles andere fällt auf `default` zurück.
- **`is_reference_only: true`** — blendet das Plugin aus dem Operator-Store
  aus und markiert es als Builder-Pattern-Quelle. Für echte Plugins weglassen
  (oder `false`).
- **Setup-Field-Extras** — `options_provider: "<capability_id>"` liefert das
  Enum eines Feldes dynamisch nach der Installation; `multi: true` erlaubt
  mehrere ausgewählte Werte.

### `setup.guide` — Anleitung für das Drittsystem

`setup.guide` ist eine **optionale** lokalisierte Markdown-Anleitung, die
automatisch auf der Hub-Seite deines Plugins und im omadia-Store neben dem
Install-Formular gerendert wird. Damit erklärst du, was der Operator **außerhalb**
von omadia tun muss — einen Discord-Bot anlegen, eine Azure-AD-App registrieren,
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
gerade gebaut hast.** Im omadia-Admin-UI unter *Store → Upload* reinziehen; der
Host validiert das Manifest, prüft auf fehlende Host-Peers und registriert das
Plugin. Zum Teilen reichst du die ZIP direkt weiter (E-Mail, geteiltes
Laufwerk, eigener Download-Link).

> ℹ️ **Bald: der omadia-Hub.** Eine öffentliche Registry, auf der du ein Plugin
> einmal *einreichst* und jeder omadia-Host es entdecken, holen und (per
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
