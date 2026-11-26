# 04 · Manifest & packaging

The `manifest.yaml` is your plugin's contract with the host. This page is the
field reference plus how the ZIP is built and uploaded.

## Manifest reference

```yaml
schema_version: "1"            # required

identity:
  id: "@you/your-plugin"       # required; reverse-DNS, == package.json "name"
  kind: "tool"                 # integration | tool | skill | channel | model |
                               # archetype | system-module | agent-template
                               # ("agent" and "extension" are retired)
  domain: "your-domain"        # short routing/grouping key
  name: "Your Plugin"          # display name
  version: "0.1.0"             # required; semver, == package.json "version"
  description:                 # locale map; a bare string is read as ENGLISH
    en: "≤140 chars."
    de: "≤140 Zeichen."
  authors:
    - { name: "Your Name", email: "you@example.com", url: "https://example.com" }
  license: "MIT"               # SPDX id
  homepage: "https://…"        # optional
  icon: "./assets/icon.svg"    # relative path, bundled
  categories: ["examples"]     # optional store facets

compat:
  core: ">=1.78.0 <2.0"        # range of the HOST's @omadia/plugin-api version;
                               # checked at upload and install (default ">=1.0 <2.0").
                               # The new kinds and agent_templates need >=1.78.0
  node: ">=20"                 # optional

depends_on: []                 # plugin ids that must be installed first; their
                               # secrets/config are readable through yours
                               # (e.g. "@omadia/memory" if you use ctx.memory)

provides: []                   # capabilities you offer: "name@<major>"
requires: []                   # capabilities that MUST be provided ("name@^<major>");
                               # install is refused without a provider
optional_requires: []          # capabilities you use when present (getOptional)

multi_instance: true           # false → only one install allowed; when false…
multi_instance_justification: "" #   …a non-empty reason is REQUIRED here
privacy_class: "default"       # "default" | "strict" (stricter PII handling)
is_reference_only: true        # OB-29-0: hide from the store; Builder pattern
                               # source only. Omit/false for real plugins.

lifecycle:
  entry: "dist/plugin.js"      # required; the module exporting activate(...)
  uninstall_policy:            # schema field; the current core does not act on it
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
      label: { en: "API key", de: "API-Key" }      # locale maps, like description
      help:  { en: "Where to find it.", de: "Wo du ihn findest." }
      required: true
      # type-specific extras: default, placeholder, pattern + pattern_hint,
      # enum: [{ value, label }], provider/scopes (oauth),
      # multiline: true (string/secret → textarea, e.g. a PEM key)
      # options_provider: "list_things"  # capability id supplying dynamic enum
      # multi: true                       # allow multiple selected values

permissions:                   # least-privilege; omitted = denied
  memory:
    reads: []                            # namespace globs; technical state only, a plugin
    writes: []                           # has no conversation memory
    trees: []                            # own top-level /memories trees for memoryStore@1,
                                         # e.g. ["pairings"]; the first plugin to use a
                                         # tree owns it. core and _* are read-only, private
                                         # trees unreachable (omadia ADR-0256)
  graph:
    reads:  []                           # node labels, e.g. "Turn", "Person"
    writes: []
    entity_systems: []                   # plugin-owned KG namespaces accepted by
                                         # ctx.knowledgeGraph.ingestEntities;
                                         # "odoo"/"confluence" reserved (stripped)
  network:
    outbound: []                         # hosts, "*.x.com" = one subdomain level;
                                         # non-empty → ctx.http exists. Network ONLY
                                         # via ctx.http (global fetch is sandboxed)
    outbound_tcp: []                     # [{ host, port }], literal or "$config.<field>"
                                         # → ctx.net (SMTP, IMAP, …)
    web_scanner: false                   # true → ctx web-scanner surface
    audit_mode: "single-host"            # single-host | allowlist | public-web
  public_paths: []                       # prefixes served WITHOUT an omadia session
                                         # (auth 'public' | 'custom' | 'teams-sso');
                                         # operator must grant each one
  sql:                                   # plugin-owned Postgres tables → ctx.sql,
    ledger: "plg_you_your_plugin_migrations" # after an operator grant
    migrations: "migrations"
  filesystem: { scratch: false }         # true → ctx.scratch dir
  secrets: { runtime_write: false }      # true → ctx.secrets may write at runtime
  llm:                                   # non-empty models_allowed → ctx.llm (the ONLY
                                         # model access; runs in the calling agent's turn)
    models_allowed: []                   # model globs, e.g. "claude-haiku-4-5*"
    calls_per_invocation: 2              # default 5
    max_tokens_per_call: 1024            # default 4096
  flows: false                           # true → Conductor flow toolkit
  events: { emit: false }                # true → ctx.events.emit declared events
  mcp: false                             # true, or { servers_hint: [...] } → ctx.mcp

# ── capability plugins (kinds tool / integration) ──────────────────────────
capabilities:                  # one entry per registered tool
  - id: "do_thing"             # == the ctx.tools.register name, unique per instance
    description: "…"
    input_schema:  { type: "object", required: ["x"], properties: { x: { type: "string" } } }
    output_schema: { type: "object", properties: { y: { type: "string" } } }
    side_effects: "read"       # "read" | "write" | "none"; without it: unknown
    idempotent: true
    timeout_ms: 5000
    rate_limit: { per_minute: 30 }

playbook:                      # natural-language guidance: when to use the tools
  when_to_use: "…"
  example_prompts: ["…"]
  not_for: ["…"]

agent_templates:               # inactive presets for the Agent Builder (the role
  - id: "greeter"              #   a plugin must not carry itself); one per language
    name: "Greeter"
    short_description: "…"     # <= 80
    long_description: "…"      # <= 4000
    instructions: "…"          # <= 20000
    language: "en"             # BCP 47
    capabilities: ["@you/your-plugin"]   # suggestions only
    # optional: archetype, verbosity (tldr|brief|standard|detailed|max),
    #           persona: { axes: { warmth: 60 } }  — strict: unknown fields reject

jobs:                          # scheduled background jobs; needs the host
  - name: "weekly-digest"      #   scheduler. Also guards ctx.jobs.register.
    schedule: { cron: "0 8 * * MON" }   # or "0 8 * * MON", or { interval_ms: 60000 }
    timeout_ms: 30000          # default 30000
    overlap: skip              # skip (default) | queue

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

> Capability plugins declare `capabilities` + `playbook` (+ `agent_templates`);
> channels declare the `channel` block instead. Don't mix them.

### Kinds

| Kind | One sentence |
| --- | --- |
| `integration` | Access to a system with its own credentials, offered as tools and services. |
| `tool` | Tools with local logic and no credentials of their own. |
| `skill` | A reusable procedure an agent can follow. |
| `channel` | A surface that routes user messages in and replies out. |
| `model` | A model, embeddings or transcription provider; only the kernel's model gateway calls it. |
| `archetype` | A kind of agent, selectable in the Agent Builder. |
| `system-module` | Infrastructure of omadia itself. |
| `agent-template` | Only agent templates, no tools. |

`agent` and `extension` are retired. A former `extension` is a `system-module`
(or a `model` plugin when it is an LLM provider); a former `agent` plugin is a
`tool` or `integration` plugin plus an agent template.

### The boundary (the kernel rejects it at upload)

- No `persona`, `speaker`, `personality` or `system_prompt` in the manifest.
- No `skills` entry of `kind: prompt_partial`.
- No `AGENT.md` (except for kind `agent-template`).
- No own model loop and no persona: a plugin delivers tools, the agent speaks.
- Models only through `ctx.llm`. No `anthropicClient@1`, `llm@1` or
  `llmProviderPool` in `requires`, no own Anthropic/OpenAI client, no direct
  `fetch` to a model provider host. `embeddingClient@1` and `transcription@1`
  stay allowed.
- Network only through `ctx.http` (allow-list `permissions.network.outbound`).
  The kernel sandboxes global `fetch` (`PLUGIN_EGRESS_MODE`).

### Advanced fields

Everything below is **optional** and defaults to the safe/off value — declare a
field only when you use the capability it gates.

- **`compat.core`** — a semver range over the **host's** `@omadia/plugin-api`
  version, because that is what your plugin links against at runtime. The host
  refuses a ZIP whose range excludes it at upload (`package.incompatible_core`)
  and at install (`install.incompatible_core`); an invalid range is refused
  too. Put the lower bound at the plugin-api version that added the newest
  thing you use (each addition is listed in the omadia repo's
  `middleware/packages/plugin-api/CHANGELOG.md`) and keep `<2.0`. Default
  `">=1.0 <2.0"`.
- **`depends_on`** — concrete plugin ids. Installing is refused until they are
  installed, and your `ctx.secrets` / `ctx.config` resolve through their
  values (your own first), so declare a setup field only when no parent has
  it.
- **`provides` / `requires` / `optional_requires`** — capabilities in the form
  `name@<major>` (`name@^<major>` is accepted on the consuming side). The name
  is also the `ctx.services` key. A `requires` without a provider stops the
  install (`install.missing_capability`); `optional_requires` does not and adds
  no activation order, so resolve those lazily with
  `ctx.services.getOptional(name)`. `ctx.services.get`/`getOptional` throw
  `ServiceNotDeclaredError` for a name declared nowhere.
- **`permissions.public_paths`** — URL prefixes the plugin asks to serve
  without an omadia session, for `ctx.routes.register(prefix, router, { auth:
  'public' | 'custom' | 'teams-sso' })` and for `body: 'raw'`. The registered
  prefix must lie **beneath** an entry, or `register()` throws. Each entry is
  a plain path of at least two segments (no wildcards, no percent-encoding, at
  most 16 entries), under `/api/plugins/` or under a prefix the plugin
  registers a router at, never under a core route. The operator grants each
  entry in the install dialog or on the store page; ungranted, it is not
  served. See [Pages and Teams tabs](./02-build-a-capability-plugin.md#pages-and-teams-tabs).
- **`permissions.sql`** — `{ ledger, migrations?, handoff? }`: plugin-owned
  tables. The ledger name must start with `plg_` plus your sanitized plugin
  id. After the
  operator grants it, the host runs the migrations directory before
  `activate()` and provides `ctx.sql`.
  If the plugin also resolves the shared `graphPool`, each statement may
  name only its own tables: a statement naming a kernel table, a `$$` body,
  `DO`, `CREATE FUNCTION` or a SQL-text function is refused with
  `SqlTableRefusedError` (omadia ADR-0255).
- **`permissions.memory.trees`** — top-level `/memories` trees the plugin's
  `memoryStore@1` may read and change. The first plugin to use a tree owns
  it; another plugin gets `MemoryPathError`. Every plugin reads `core` and
  the `_*` trees and changes neither (omadia ADR-0256).
- **`jobs`** — scheduled background work (`{ name, schedule, timeout_ms,
  overlap }`; `schedule` is a cron string, `{ cron }` or `{ interval_ms }`;
  `overlap: skip | queue`). Needs the host scheduler; the same check guards
  programmatic `ctx.jobs.register`.
- **`side_effects`** (per `capabilities` entry) — `read`, `write` or `none`:
  `write` changes a system, `none` touches no system. A tool without an entry
  counts as `unknown`, so declare every registered tool.
- **`agent_templates`** — inactive agent presets, read strictly (an unknown
  field rejects the manifest). Persona axes: `formality`, `directness`,
  `warmth`, `humor`, `sarcasm`, `conciseness`, `proactivity`, `autonomy`,
  `risk_tolerance`, `creativity`, `drama`, `philosophy` (0-100), plus optional
  `template` and `custom_notes` (<= 2000). See
  [02](./02-build-a-capability-plugin.md#agent-templates).
- **`permissions.llm`** — `{ models_allowed: [globs], calls_per_invocation (def
  5), max_tokens_per_call (def 4096) }`. Provides `ctx.llm`, the only way a
  plugin reaches a model (the host pays, no API key in the plugin); a model outside the list throws
  `LlmModelNotAllowedError`. `complete()` also takes `outputFormat` (JSON
  schema, 1.22.0+) and a forced tool call (`tools` + `toolChoice`, 1.44.0+).
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
- **Visible text is a locale map** — `identity.description`, `setup.guide`,
  `setup.fields[].label` / `help` / `pattern_hint` and enum option labels are
  written as `{ en: "…", de: "…" }`. A bare string still loads, but it is read
  as English and shown unchanged in every UI language. `identity.name` stays a
  plain string.
- **Fields the current core does not act on** — `lifecycle.uninstall_policy`,
  `lifecycle.hooks`, `setup.self_test` and `skills[].shareable` are accepted
  but nothing reads them today. To check credentials after install, export
  `verifyConnection` (see [02](./02-build-a-capability-plugin.md#checking-the-connection-verifyconnection)).
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
- `skills/` is only for kind `skill` data; a capability plugin has no prompt-partials.

## Uploading

In the omadia admin UI, go to *Store*, open the local tab and drop the ZIP
into the upload area. The host validates the manifest, checks `compat.core`
against its plugin-api version, checks for missing host peers, and registers
the plugin; *Install* then renders the setup form and asks for the grants your
manifest requests (public paths, SQL, …).

**The omadia Hub** at [hub.omadia.ai](https://hub.omadia.ai) is the public
registry. Every omadia host lists it under *Store → Hub* and installs from it
after checking the ZIP's `sha256`. Publishing (`POST /api/publish`) needs the
Hub's publish token, which the Hub operator holds; without it, hand the ZIP
over directly. The ZIP you build here is exactly the artefact the Hub accepts.

## Versioning

Published versions are **immutable**. To ship a change, bump `version` in
**both** `package.json` and `manifest.yaml` (keep them equal) and rebuild — the
ZIP name (`out/<id>-<version>.zip`) changes with it.

## Pre-flight checklist

- [ ] `identity.id` == `package.json` `name`; `version`s match.
- [ ] `compat.core` lower bound = the plugin-api version of the newest API you use (`>=1.78.0` for the new kinds and `agent_templates`).
- [ ] `identity.kind` is not `agent` or `extension`; no persona, `prompt_partial` skill or `AGENT.md`.
- [ ] `lifecycle.entry: "dist/plugin.js"`.
- [ ] Every registered tool has a matching `capabilities` entry with `side_effects`.
- [ ] Models only via `ctx.llm`, network only via `ctx.http`.
- [ ] Every `ctx.secrets`/`ctx.config` key has a `setup.fields` entry.
- [ ] Third-party setup (if any) documented in a localized `setup.guide`.
- [ ] `permissions` list exactly the hosts/namespaces you use — no more.
- [ ] Every route has the right `auth`; pages with data are `'session'` or
      `'teams-sso'`, never `'public'`; every non-session prefix lies beneath a
      `public_paths` entry.
- [ ] Every name you pass to `ctx.services.get`/`getOptional` is under
      `requires`/`optional_requires`.
- [ ] `npm run typecheck` clean, `npm run build` produces the ZIP.
- [ ] Placeholders (`@acme/*`, `Your Name`) replaced.
