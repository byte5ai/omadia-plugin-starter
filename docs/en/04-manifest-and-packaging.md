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
  self_test: true              # activate once after install to verify

permissions:                   # least-privilege; omitted = denied
  memory:  { reads: [], writes: [] }     # namespace globs, e.g. "agent:@you/x:*"
  graph:   { reads: [], writes: [] }
  network: { outbound: [] }              # host globs; non-empty → ctx.http exists
  filesystem: { scratch: false }         # true → ctx.scratch dir

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
