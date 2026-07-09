# 04 · Manifest & packaging

The `manifest.yaml` is your plugin's contract with the host. This page is the
field reference plus how the ZIP is built and uploaded.

## Manifest reference

```yaml
schema_version: "1"            # required

identity:
  id: "@you/your-plugin"       # required; reverse-DNS, == package.json "name"
  kind: "agent"                # "agent" (default) | "channel" | "integration"
  domain: "your-domain"        # short routing/grouping key
  name: "Your Plugin"          # display name
  version: "0.1.0"             # required; semver, == package.json "version"
  description: "≤140 chars."
  authors:
    - { name: "Your Name", email: "you@example.com", url: "https://example.com" }
  license: "MIT"               # SPDX id
  homepage: "https://…"        # optional
  icon: "./assets/icon.svg"    # relative path, bundled
  categories: ["examples"]     # optional store facets

compat:
  core: ">=1.0 <2.0"           # host version range you support
  node: ">=20"                 # optional

depends_on: []                 # other plugin ids that must activate first
                               # (e.g. "@omadia/memory" if you use ctx.memory)

provides: []                   # capability ids this plugin advertises to others
requires: []                   # capability ids that MUST be provided by some
                               # active plugin — hard error at activation if not

multi_instance: true           # false → only one install allowed; when false…
multi_instance_justification: "" #   …a non-empty reason is REQUIRED here
privacy_class: "default"       # "default" | "strict" (stricter PII handling)
is_reference_only: true        # OB-29-0: hide from the store; Builder pattern
                               # source only. Omit/false for real plugins.

lifecycle:
  entry: "dist/plugin.js"      # required; the module exporting activate(...)
  hooks:                       # optional; all boolean, default false
    onInstall: true
    onConfigure: true
    onActivate: true
    onDeactivate: true
    onUninstall: true
  uninstall_policy:            # what to do with the plugin's data on removal
    entities: "delete"         # "keep" | "quarantine" | "delete"
    memory:   "delete"
    secrets:  "delete"

setup:
  guide:                       # optional localized install guide (markdown)
    en: |                      # how to set up the third-party system
      ## Create the bot / get the API key, step by step …
    de: |                      # ship at least `en`; add `de` and others if you can
      ## Bot anlegen / API-Key besorgen, Schritt für Schritt …
  fields:                      # operator-filled install form
    - key: "api_key"
      type: "secret"           # string | url | secret | oauth | enum | boolean | integer | host_list
      label: "API key"
      help: "Where to find it."
      required: true
      # type-specific extras: default, placeholder, pattern, enum:[…],
      # provider/scopes (oauth)
      # options_provider: "list_things"  # capability id supplying dynamic enum
      # multi: true                       # allow multiple selected values
  self_test: true              # activate once after install to verify

permissions:                   # least-privilege; omitted = denied
  memory:  { reads: [], writes: [] }     # namespace globs, e.g. "agent:@you/x:*"
  graph:
    reads:  []                           # node labels, e.g. "Turn", "Person"
    writes: []
    entity_systems: []                   # plugin-owned KG namespaces accepted by
                                         # ctx.knowledgeGraph.ingestEntities;
                                         # "odoo"/"confluence" reserved (stripped)
  network:
    outbound: []                         # host globs; non-empty → ctx.http exists
    web_scanner: false                   # true → ctx web-scanner surface
    audit_mode: "single-host"            # single-host | allowlist | public-web
  filesystem: { scratch: false }         # true → ctx.scratch dir
  secrets: { runtime_write: false }      # true → ctx.secrets may write at runtime
  subAgents:                             # gate ctx.subAgent.ask (else it throws)
    calls: []                            # allowed sub-agent ids; omit = denied
    calls_per_invocation: 5              # per-handler budget (default 5)
  llm:                                   # gate ctx.llm.complete (else it throws)
    models_allowed: []                   # model globs, e.g. "claude-haiku-4-5*"
    calls_per_invocation: 2              # default 5
    max_tokens_per_call: 1024            # default 4096
  flows: false                           # true → Conductor flow toolkit
  events: { emit: false }                # true → ctx.events.emit declared events
  mcp: false                             # true, or { servers_hint: [...] } → ctx.mcp

# ── agents only ────────────────────────────────────────────────────────────
capabilities:                  # the tools the orchestrator can call
  - id: "do_thing"
    description: "…"
    input_schema:  { type: "object", required: ["x"], properties: { x: { type: "string" } } }
    output_schema: { type: "object", properties: { y: { type: "string" } } }
    side_effects: "read"       # "read" | "write"
    idempotent: true
    timeout_ms: 5000
    rate_limit: { per_minute: 30 }

playbook:                      # natural-language routing guidance
  when_to_use: "…"
  example_prompts: ["…"]
  not_for: ["…"]

skills:                        # bundled prompt-partials / schemas / data
  - { id: "sys", kind: "prompt_partial", path: "skills/system.md", shareable: false }

jobs:                          # scheduled background jobs (cron); needs the host
  - name: "weekly-digest"      #   scheduler. Also guards ctx.jobs.register.
    schedule: { cron: "0 8 * * MON" }
    timeoutMs: 30000
    overlap: skip              # skip | queue | allow

# ── integrations only ──────────────────────────────────────────────────────
oauth_providers:               # kernel-brokered OAuth descriptors (inert data;
  - id: "acme"                 #   the host engine runs the flow, not your code)
    authorize_url: "https://acme.example/oauth/authorize"
    token_url: "https://acme.example/oauth/token"
    client_id_field: "acme_client_id"       # setup.fields key holding the id
    client_secret_field: "acme_client_secret"
    token_auth_style: "body_form"           # body_form | body_json | basic
    pkce: true                              # default true
service_types:                 # map a ctx.services.provide surface to a TS type
  - service: "acme.client"
    type: { from: "@acme/integration-acme", name: "AcmeClient" }

# ── channels only (schema section 14) ──────────────────────────────────────
admin_ui_path: "/api/your-channel/admin/index.html"   # optional iframe surface
channel:
  transport:
    kind: "webhook"            # webhook | websocket | long-poll
    routes:                    # required for kind: webhook
      - { path: "/api/your-channel/webhook", method: "POST" }
    verify_signature: true     # you verify inbound requests in code
  capabilities: ["text", "typing_indicator"]   # feature flags
  adapters: ["text", "markdown"]               # outbound render shapes
```

> Agents declare `capabilities` + `playbook`; channels declare the `channel`
> block instead. Don't mix them.

### Advanced fields

Everything below is **optional** and defaults to the safe/off value — declare a
field only when you use the capability it gates.

- **`provides` / `requires`** — capability ids (free-form strings) a plugin
  advertises or depends on. A `requires` with no active provider is a **hard
  error at activation**, so declare only what you truly need.
- **`jobs`** — cron-scheduled background work (`{ name, schedule.cron, timeoutMs,
  overlap }`, `overlap: skip | queue | allow`). Needs the host scheduler; the
  same check guards programmatic `ctx.jobs.register`.
- **`permissions.subAgents`** — `{ calls: [ids], calls_per_invocation }` (budget
  default 5). Without it, `ctx.subAgent.ask` throws `SubAgentPermissionDenied`.
- **`permissions.llm`** — `{ models_allowed: [globs], calls_per_invocation (def
  5), max_tokens_per_call (def 4096) }`. Gates `ctx.llm.complete`; a model
  outside the list throws `LlmModelNotAllowed`.
- **`permissions.graph.entity_systems`** — plugin-owned KG namespaces accepted
  by `ctx.knowledgeGraph.ingestEntities`. `odoo` / `confluence` are
  host-reserved and silently stripped.
- **`permissions.secrets.runtime_write: true`** — lets the plugin write vault
  secrets at runtime (`ctx.secrets.set`), not just read install-time fields.
- **`permissions.flows: true`** — unlocks the Conductor flow toolkit.
- **`permissions.events.emit: true`** — lets the plugin emit declared domain
  events via `ctx.events.emit`.
- **`permissions.mcp: true`** (or `{ servers_hint: [...] }`) — unlocks
  `ctx.mcp`, host-pooled access to MCP tool servers. Only servers the operator
  has *explicitly granted to this plugin* in the Control Center resolve —
  there is no ambient access to every registered server. Calls route through
  the host's shared connection pool, the scan-verdict dispatch guard, and a
  per-plugin call audit log. `servers_hint` is an optional list of server ids
  the plugin expects, purely informational for the operator's grant UI — it
  does not itself grant access. Guard with `if (ctx.mcp)`: a Hub plugin may
  land on an older core that lacks this accessor entirely.
- **`permissions.network.web_scanner` / `audit_mode`** — opt into the web-scanner
  surface; `audit_mode` is `single-host | allowlist | public-web`.
- **`oauth_providers`** *(integrations)* — inert OAuth descriptors the host's
  broker executes. Each needs `id`, `authorize_url`, `token_url`,
  `client_id_field`, `client_secret_field`, and a `token_auth_style` of
  `body_form | body_json | basic`; malformed entries are dropped.
- **`service_types`** *(integrations)* — map a `ctx.services.provide(...)` surface
  to the TypeScript type a consumer imports: `{ service, type: { from, name } }`.
- **`multi_instance`** — defaults `true`; set `false` for singletons and then a
  non-empty `multi_instance_justification` is **required**.
- **`privacy_class`** — `default` or `strict` (stricter PII handling); anything
  else falls back to `default`.
- **`is_reference_only: true`** — hides the plugin from the operator store and
  marks it a Builder pattern source. Omit (or `false`) for real plugins.
- **Setup-field extras** — `options_provider: "<capability_id>"` supplies a
  field's enum dynamically post-install; `multi: true` allows multiple selected
  values.

### `setup.guide` — third-party setup instructions

`setup.guide` is an **optional** localized markdown guide that renders
automatically on your plugin's Hub page and in the omadia store, next to the
install form. Use it to explain what the operator must do **outside** omadia —
create a Discord bot, register an Azure AD app, get an API key. It is keyed by
locale (`en`, `de`, …); ship at least `en`. Markdown supports headings, ordered
lists, links and code. It is display-only (never executed) and is copied
verbatim into the ZIP, so it ships with your plugin. Omit it when your plugin
needs no external setup.

## What goes in the ZIP

`scripts/build-zip.mjs` stages and zips exactly these (when present):

```
manifest.yaml   package.json   dist/   assets/   skills/   README.md   LICENSE   NOTICE
```

Rules:

- **`dist/plugin.js` and `manifest.yaml` are mandatory**, and
  `lifecycle.entry` must point at the former.
- **No `node_modules/`** — esbuild bundles your non-host deps into
  `dist/plugin.js`.
- `skills/` must be in the ZIP if your manifest references prompt-partials.

## Uploading

**Today, the only way to install a plugin is the ZIP you just built.** In the
omadia admin UI, go to *Store → Upload* and drop it in; the host validates the
manifest, checks for missing host peers, and registers the plugin. To share a
plugin with others, hand the ZIP over directly (email, a shared drive, your own
download link).

> ℹ️ **Coming soon: the omadia Hub.** A public registry where you'll *submit* a
> plugin once and any omadia host can discover, fetch and verify it (by
> `sha256`) — no manual ZIP hand-off. **It is not available yet**; for now the
> ZIP upload above is the only supported route. The ZIP you build today is
> exactly the artefact the Hub will accept, so nothing you do now is throwaway.

## Versioning

Published versions are **immutable**. To ship a change, bump `version` in
**both** `package.json` and `manifest.yaml` (keep them equal) and rebuild — the
ZIP name (`out/<id>-<version>.zip`) changes with it.

## Pre-flight checklist

- [ ] `identity.id` == `package.json` `name`; `version`s match.
- [ ] `lifecycle.entry: "dist/plugin.js"`.
- [ ] Every registered tool has a matching `capabilities` entry (agents).
- [ ] Every `ctx.secrets`/`ctx.config` key has a `setup.fields` entry.
- [ ] Third-party setup (if any) documented in a localized `setup.guide`.
- [ ] `permissions` list exactly the hosts/namespaces you use — no more.
- [ ] `npm run typecheck` clean, `npm run build` produces the ZIP.
- [ ] Placeholders (`@acme/*`, `Your Name`) replaced.
