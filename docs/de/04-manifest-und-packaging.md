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
  description:                 # Sprachkarte; ein nackter String gilt als ENGLISCH
    en: "≤140 chars."
    de: "≤140 Zeichen."
  authors:
    - { name: "Your Name", email: "you@example.com", url: "https://example.com" }
  license: "MIT"               # SPDX-Id
  homepage: "https://…"        # optional
  icon: "./assets/icon.svg"    # relativer Pfad, gebundelt
  categories: ["examples"]     # optionale Store-Facetten

compat:
  core: ">=1.51.0 <2.0"        # Bereich der @omadia/plugin-api-Version DES HOSTS;
                               # geprüft bei Upload und Installation (Default ">=1.0 <2.0")
  node: ">=20"                 # optional

depends_on: []                 # Plugin-Ids, die vorher installiert sein müssen;
                               # ihre Secrets/Config sind über deine lesbar
                               # (z. B. "@omadia/memory", wenn du ctx.memory nutzt)

provides: []                   # Capabilities, die du anbietest: "name@<major>"
requires: []                   # Capabilities, die bereitgestellt sein MÜSSEN
                               # ("name@^<major>"); ohne Provider keine Installation
optional_requires: []          # Capabilities, die du nutzt, wenn vorhanden (getOptional)

multi_instance: true           # false → nur eine Installation erlaubt; wenn false…
multi_instance_justification: "" #   …ist hier ein nicht-leerer Grund PFLICHT
privacy_class: "default"       # "default" | "strict" (strengere PII-Behandlung)
is_reference_only: true        # OB-29-0: aus dem Store ausblenden; nur
                               # Builder-Pattern-Quelle. Für echte Plugins weglassen/false.

lifecycle:
  entry: "dist/plugin.js"      # erforderlich; das Modul, das activate(...) exportiert
  uninstall_policy:            # Schema-Feld; der aktuelle Core wertet es nicht aus
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
      label: { en: "API key", de: "API-Key" }      # Sprachkarten, wie description
      help:  { en: "Where to find it.", de: "Wo du ihn findest." }
      required: true
      # typ-spezifische Extras: default, placeholder, pattern + pattern_hint,
      # enum: [{ value, label }], provider/scopes (oauth),
      # multiline: true (string/secret → Textarea, z. B. ein PEM-Key)
      # options_provider: "list_things"  # Capability-Id liefert dynamisches Enum
      # multi: true                       # mehrere ausgewählte Werte erlauben

permissions:                   # Least-Privilege; weggelassen = verweigert
  memory:  { reads: [], writes: [] }     # Namespace-Globs, z. B. "agent:@you/x:*"
  graph:
    reads:  []                           # Node-Labels, z. B. "Turn", "Person"
    writes: []
    entity_systems: []                   # plugin-eigene KG-Namespaces, akzeptiert von
                                         # ctx.knowledgeGraph.ingestEntities;
                                         # "odoo"/"confluence" reserviert (gestrippt)
  network:
    outbound: []                         # Hosts, "*.x.com" = eine Subdomain-Ebene;
                                         # nicht leer → ctx.http existiert
    outbound_tcp: []                     # [{ host, port }], Literal oder "$config.<feld>"
                                         # → ctx.net (SMTP, IMAP, …)
    web_scanner: false                   # true → ctx Web-Scanner-Oberfläche
    audit_mode: "single-host"            # single-host | allowlist | public-web
  public_paths: []                       # Prefixe, die OHNE omadia-Session ausgeliefert
                                         # werden (auth 'public' | 'custom' | 'teams-sso');
                                         # der Operator gibt jeden einzeln frei
  sql:                                   # plugin-eigene Postgres-Tabellen → ctx.sql,
    ledger: "plg_you_your_plugin_migrations" # nach Freigabe durch den Operator
    migrations: "migrations"
  filesystem: { scratch: false }         # true → ctx.scratch-Verzeichnis
  secrets: { runtime_write: false }      # true → ctx.secrets darf zur Laufzeit schreiben
  subAgents:                             # calls nicht leer → ctx.subAgent
    calls: []                            # erlaubte Sub-Agent-Ids; weggelassen = verweigert
    calls_per_invocation: 5              # Budget pro Handler-Aufruf (Default 5)
  llm:                                   # models_allowed nicht leer → ctx.llm
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
  - { id: "sys", kind: "prompt_partial", path: "skills/system.md" }

jobs:                          # geplante Background-Jobs; braucht den Host-
  - name: "weekly-digest"      #   Scheduler. Gated auch ctx.jobs.register.
    schedule: { cron: "0 8 * * MON" }   # oder "0 8 * * MON", oder { interval_ms: 60000 }
    timeout_ms: 30000          # Default 30000
    overlap: skip              # skip (Default) | queue

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

- **`compat.core`** — ein Semver-Bereich über die `@omadia/plugin-api`-Version
  **des Hosts**, denn gegen die linkt dein Plugin zur Laufzeit. Der Host lehnt
  eine ZIP, deren Bereich ihn ausschließt, beim Upload
  (`package.incompatible_core`) und bei der Installation
  (`install.incompatible_core`) ab; ein ungültiger Bereich wird ebenfalls
  abgelehnt. Setz die Untergrenze auf die plugin-api-Version, die das Neueste
  eingeführt hat, das du nutzt (jede Ergänzung steht in
  `middleware/packages/plugin-api/CHANGELOG.md` im omadia-Repo), und behalte
  `<2.0`. Default `">=1.0 <2.0"`.
- **`depends_on`** — konkrete Plugin-Ids. Die Installation wird abgelehnt,
  solange sie nicht installiert sind, und dein `ctx.secrets` / `ctx.config`
  lösen über ihre Werte auf (deine eigenen zuerst). Deklariere ein Setup-Feld
  also nur, wenn kein Parent es hat.
- **`provides` / `requires` / `optional_requires`** — Capabilities in der Form
  `name@<major>` (`name@^<major>` ist auf der konsumierenden Seite erlaubt).
  Der Name ist zugleich der `ctx.services`-Key. Ein `requires` ohne Provider
  stoppt die Installation (`install.missing_capability`); `optional_requires`
  nicht, und es legt keine Aktivierungsreihenfolge fest. Löse diese deshalb
  erst bei Bedarf mit `ctx.services.getOptional(name)` auf.
  `ctx.services.get`/`getOptional` werfen `ServiceNotDeclaredError` für einen
  Namen, der nirgends deklariert ist.
- **`permissions.public_paths`** — URL-Prefixe, die das Plugin ohne
  omadia-Session ausliefern will, für `ctx.routes.register(prefix, router,
  { auth: 'public' | 'custom' | 'teams-sso' })` und für `body: 'raw'`. Das
  registrierte Prefix muss **unterhalb** eines Eintrags liegen, sonst wirft
  `register()`. Jeder Eintrag ist ein schlichter Pfad mit mindestens zwei
  Segmenten (keine Wildcards, kein Percent-Encoding, höchstens 16 Einträge),
  unter `/api/plugins/` oder unter einem Prefix, an dem das Plugin einen Router
  registriert, nie unter einer Core-Route. Der Operator gibt jeden Eintrag im
  Install-Dialog oder auf der Store-Seite frei; ohne Freigabe wird er nicht
  ausgeliefert. Siehe [Seiten und Teams-Tabs](./02-agent-plugin-bauen.md#seiten-und-teams-tabs).
- **`permissions.sql`** — `{ ledger, migrations?, handoff? }`: plugin-eigene
  Tabellen. Der Ledger-Name muss mit `plg_` und deiner bereinigten Plugin-Id
  beginnen. Nach der Freigabe durch den Operator führt der Host das
  Migrationsverzeichnis vor `activate()` aus und stellt `ctx.sql` bereit.
- **`jobs`** — geplante Background-Arbeit (`{ name, schedule, timeout_ms,
  overlap }`; `schedule` ist ein Cron-String, `{ cron }` oder
  `{ interval_ms }`; `overlap: skip | queue`). Braucht den Host-Scheduler;
  derselbe Check gated das programmatische `ctx.jobs.register`.
- **`permissions.subAgents`** — `{ calls: [ids], calls_per_invocation }`
  (Budget-Default 5). Ohne das ist `ctx.subAgent` `undefined`; ein Ziel
  außerhalb von `calls` wirft `SubAgentPermissionDeniedError`.
- **`permissions.llm`** — `{ models_allowed: [globs], calls_per_invocation (Def
  5), max_tokens_per_call (Def 4096) }`. Stellt `ctx.llm` bereit (der Host
  zahlt, kein API-Key im Plugin); ein Modell außerhalb der Liste wirft
  `LlmModelNotAllowedError`. `complete()` nimmt außerdem `outputFormat`
  (JSON-Schema, ab 1.22.0) und einen erzwungenen Tool-Aufruf (`tools` +
  `toolChoice`, ab 1.44.0).
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
- **Sichtbarer Text ist eine Sprachkarte** — `identity.description`,
  `setup.guide`, `setup.fields[].label` / `help` / `pattern_hint` und die
  Labels von Enum-Optionen schreibst du als `{ en: "…", de: "…" }`. Ein nackter
  String lädt weiter, gilt aber als Englisch und erscheint unverändert in jeder
  UI-Sprache. `identity.name` bleibt ein schlichter String.
- **Felder, die der aktuelle Core nicht auswertet** —
  `lifecycle.uninstall_policy`, `lifecycle.hooks`, `setup.self_test` und
  `skills[].shareable` werden akzeptiert, aber heute liest sie nichts. Um
  Credentials nach der Installation zu prüfen, exportiere `verifyConnection`
  (siehe [02](./02-agent-plugin-bauen.md#die-verbindung-prüfen-verifyconnection)).
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

Im omadia-Admin-UI unter *Store* den lokalen Tab öffnen und die ZIP in die
Upload-Fläche ziehen. Der Host validiert das Manifest, prüft `compat.core`
gegen seine plugin-api-Version, prüft auf fehlende Host-Peers und registriert
das Plugin; *Installieren* rendert dann das Setup-Formular und fragt nach den
Freigaben, die dein Manifest anfordert (öffentliche Pfade, SQL, …).

**Der omadia-Hub** unter [hub.omadia.ai](https://hub.omadia.ai) ist die
öffentliche Registry. Jeder omadia-Host listet ihn unter *Store → Hub* und
installiert daraus, nachdem er den `sha256` der ZIP geprüft hat. Das
Veröffentlichen (`POST /api/publish`) braucht das Publish-Token des Hubs, das
der Hub-Betreiber hält; ohne Token reichst du die ZIP direkt weiter. Die ZIP,
die du hier baust, ist genau das Artefakt, das der Hub annimmt.

## Versionierung

Veröffentlichte Versionen sind **immutable**. Um eine Änderung auszuliefern,
bump `version` in **beiden** — `package.json` und `manifest.yaml` (gleich
halten) — und baue neu; der ZIP-Name (`out/<id>-<version>.zip`) ändert sich mit.

## Pre-Flight-Checkliste

- [ ] `identity.id` == `package.json` `name`; `version`s stimmen überein.
- [ ] Untergrenze von `compat.core` = plugin-api-Version der neuesten API, die du nutzt.
- [ ] `lifecycle.entry: "dist/plugin.js"`.
- [ ] Jedes registrierte Tool hat einen passenden `capabilities`-Eintrag (Agents).
- [ ] Jeder `ctx.secrets`/`ctx.config`-Key hat einen `setup.fields`-Eintrag.
- [ ] Drittsystem-Setup (falls vorhanden) in einer lokalisierten `setup.guide` dokumentiert.
- [ ] `permissions` listen genau die Hosts/Namespaces, die du nutzt — nicht mehr.
- [ ] Jede Route hat das richtige `auth`; Seiten mit Daten sind `'session'` oder
      `'teams-sso'`, nie `'public'`; jedes Prefix ohne Session liegt unterhalb
      eines `public_paths`-Eintrags.
- [ ] Jeder Name für `ctx.services.get`/`getOptional` steht unter
      `requires`/`optional_requires`.
- [ ] `npm run typecheck` sauber, `npm run build` erzeugt die ZIP.
- [ ] Platzhalter (`@acme/*`, `Your Name`) ersetzt.
