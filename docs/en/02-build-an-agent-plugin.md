# 02 · Build an agent plugin

An **agent** is a skill the orchestrator can pick and call. It declares one or
more tools (`capabilities`) and implements them in code. The worked example is
[`examples/agent-plugin`](../../examples/agent-plugin) — `@acme/agent-hello`.
It also serves a page that works in the browser and as a Microsoft Teams tab
([Pages and Teams tabs](#pages-and-teams-tabs)).

## The contract

```ts
import type { PluginContext } from '@omadia/plugin-api';

export const AGENT_ID = '@acme/agent-hello' as const;

export interface AgentHandle {
  close(): Promise<void>;
}

export async function activate(ctx: PluginContext): Promise<AgentHandle> {
  // …register tools, open resources…
  return {
    async close() {
      // …release resources…
    },
  };
}

export default { AGENT_ID, activate };
```

- `activate` is called **once** when the agent is enabled. Keep it under
  10 s: no full sync, no bulk crawl.
- It returns a handle; the host calls `close()` on disable/uninstall/shutdown.
  Keep it under 5 s and really release timers, sockets and intervals.
- `AGENT_ID` must equal `identity.id` in `manifest.yaml` **and** the package
  `name`.
- Every `register(...)` on `ctx` returns a dispose function. Call them all from
  `close()`.

## Registering a tool

A tool is a JSON-schema input plus a handler that returns a **string** (usually
JSON the model then reads):

```ts
const dispose = ctx.tools.register(
  {
    name: 'say_hello',
    description: 'Returns a friendly greeting for the given name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Who to greet.' } },
      required: ['name'],
    },
  },
  async (input) => {
    const { name } = (input ?? {}) as { name?: string };
    return JSON.stringify({ message: `Hello, ${name ?? 'world'}!` });
  },
);
```

**Keep code and manifest in sync.** Every registered tool needs a matching
entry under `capabilities` in `manifest.yaml` (same `id`/`name` and
`input_schema`) — that declarative copy is what the orchestrator shows the
model and uses to route calls.

The optional third argument (`ToolRegistrationOptions`):

| Option | Use |
| --- | --- |
| `promptDoc` | One paragraph spliced into the system prompt's tool list. |
| `isAvailable: () => boolean` | Hide the tool (spec and `promptDoc`) on turns where it can only fail, e.g. a tool only some channels can serve. Evaluated per turn; must give the same answer for the whole turn. It only hides the tool: the handler must still answer a call truthfully. Since plugin-api 1.31.0; older hosts ignore it. |
| `writeCapabilities` | Declare that the tool may mutate data, which opts it into duplicate-write protection. |
| `attachmentSink` | Per-turn collector for media the tool produced. |

### Errors the model can read

A thrown error reaches the model only as a withheld notice ("the outcome is
unknown"). When the tool did **not** carry the call out and you can say why
in a message that is safe to show (no records, no upstream error text), throw
a `ToolRefusalError` instead:

```ts
throw Object.assign(new Error('Ticket ids are numeric, e.g. 4711.'), {
  name: 'ToolRefusalError',
});
```

Hosts recognise it by `name` (plugin-api 1.28.0+), so this form also loads on
an older host, which withholds it like any other error. On a host you require
anyway you can `import { ToolRefusalError } from '@omadia/plugin-api'`.

## Reading configuration & secrets

Manifest `setup.fields` become operator-filled inputs at install time:

```ts
const greeting = ctx.config.get<string>('greeting') ?? 'Hello';   // plain field
const apiKey   = await ctx.secrets.require('api_key');            // type: secret
```

`ctx.secrets.require` throws if the secret is missing; `ctx.secrets.get`
returns `undefined`. Declare each field under `setup.fields` or the host won't
collect it. Both accessors also resolve along the `depends_on` chain: a plugin
that depends on an integration reads that integration's secrets by key,
without naming it. So declare a field yourself only when no parent has it.

> **Tell the operator how to obtain those values.** For anything they must set
> up *outside* omadia (create an API key, register an app), add a localized
> `setup.guide` to the manifest — it renders next to these fields on the Hub
> page and in the store. See [Manifest & packaging](./04-manifest-and-packaging.md).

## Checking the connection: `verifyConnection`

Do **not** check credentials inside `activate`: an activation must not fail
because the target system is down. Export an optional `verifyConnection`
next to `activate` instead (plugin-api 1.35.0+). The host calls it after every
successful activation and when the operator clicks *re-check*, with a 5 s
budget, and it can never fail the activation:

```ts
import {
  classifyHttpAuthFailure,
  type PluginConnectionVerdict,
  type PluginContext,
} from '@omadia/plugin-api';

export async function verifyConnection(ctx: PluginContext): Promise<PluginConnectionVerdict> {
  try {
    if (!ctx.http) return { status: 'inconclusive' };
    const res = await ctx.http.fetch('https://api.example.com/v1/me', {
      headers: { authorization: `Bearer ${await ctx.secrets.require('api_key')}` },
    });
    const cause = classifyHttpAuthFailure(res.status, await res.text());
    if (cause) return { status: 'rejected', cause, title: 'Not connected', detail: 'The API key was refused.' };
    return res.ok ? { status: 'connected', title: 'Connected' } : { status: 'inconclusive' };
  } catch {
    return { status: 'inconclusive' };   // timeout, DNS, outage: keep the operator's status
  }
}
```

`rejected` turns the plugin red **and** withholds its tools, so the host only
accepts it with a `cause` (`http_401`, `http_403_auth`,
`protocol_auth_failure`); without one it is demoted to `inconclusive`.
`classifyHttpAuthFailure` and `PluginConnectionVerdict` are runtime/type
exports of plugin-api 1.35.0, so a plugin that imports the function needs
`compat.core: ">=1.35.0 <2.0"`.

For problems you notice later (a key revoked while running), report them
yourself: `ctx.status.report({ state: 'error', title, detail })`, and
`ctx.status.clear()` once they are gone. `state: 'ok'` with a `title` renders a
positive badge with a host-stamped time.

`ctx.smokeMode` is `true` when the Agent Builder activates the plugin only to
probe its admin routes; branch on it to return mock data instead of calling a
non-idempotent API.

## Calling out to the network

Outbound HTTP is gated. Declare the hosts:

```yaml
permissions:
  network:
    outbound:
      - "api.example.com"
      - "*.example.com"     # one subdomain level, not example.com itself
```

…and only then is `ctx.http` provisioned. Route **all** traffic through it so
the allow-list, the SSRF guard and the rate limit (60 requests per rolling
minute) apply:

```ts
if (!ctx.http) throw new Error('manifest must declare permissions.network.outbound');
const res = await ctx.http.fetch('https://api.example.com/v1/ping');
```

A host outside the list throws `HttpForbiddenError`, an exceeded budget
`HttpRateLimitError`. Line protocols (SMTP, IMAP) go through `ctx.net.connect`,
gated by `permissions.network.outbound_tcp`.

## Using other plugins: `requires`, `optional_requires`, `depends_on`

Plugins share capabilities through `ctx.services`. The service name **is** the
capability name, and you may only resolve names your manifest declares:

```yaml
requires: ["knowledgeGraph@^1"]          # must be provided, or install fails
optional_requires: ["transcription@^1"]  # may be absent
```

```ts
const graph = ctx.services.get<MyGraph>('knowledgeGraph');            // requires
const stt = ctx.services.getOptional<MyStt>('transcription');          // optional_requires
```

An undeclared name throws `ServiceNotDeclaredError` (a manifest bug), which is
different from `undefined` (no provider installed). An optional provider may
activate after you, so resolve optional services lazily, at first use.

`depends_on` names concrete plugin ids instead of capabilities. The host only
installs your plugin once those parents are installed, and your
`ctx.secrets`/`ctx.config` read through to theirs (see above).

## Pages and Teams tabs

A plugin can serve its own HTTP routes with
`ctx.routes.register(prefix, router, options)`. The host wraps your Express
router in a fixed chain: deactivation guard → auth → body parser → your router.

**`auth`** (default `'session'`):

| Mode | Who gets in |
| --- | --- |
| `'session'` | Requests with a valid omadia operator session. On **every** prefix, `/p/…` included: no prefix is exempt. |
| `'public'` | Everyone. Only for content that is safe to show to anyone, such as a data-free page shell. |
| `'custom'` | Everyone, and your router promises to authenticate each request itself (webhook HMAC, OAuth `state`, signed links). |
| `'teams-sso'` | Requests with a valid Microsoft Teams SSO token, verified by the host (plugin-api 1.51.0+). See below. |

`'public'`, `'custom'` and `'teams-sso'` need **two** things:

1. The prefix lies beneath an entry of `permissions.public_paths` in your
   manifest; otherwise `register()` throws. Each entry is a plain path of at
   least two segments (no wildcards, no percent-encoding), under
   `/api/plugins/` or under a prefix your plugin registers a router at. The
   check runs in one direction: a declaration of `/api/plugins/acme/hooks`
   allows `register('/api/plugins/acme/hooks', …)` but not
   `register('/api/plugins/acme', …)`.
2. The operator grants that path, in the install dialog or later on the
   plugin's store page. Until then the host does not serve it at all, and the
   grant ends when the plugin is deactivated.

There is no "no auth" mode you can pick on your own: you ask for a prefix, the
operator consents.

**`body`** (default `'json'`): `'json'` is parsed JSON (10 MB); `'raw'` hands
the untouched bytes as a `Buffer` on `req.body` and `req.rawBody` (512 KB
default, `bodyLimit` to change), which is what an HMAC check needs; `'none'`
mounts no parser. `'raw'` is buffered before authentication, so it needs the
same `public_paths` declaration as `'public'`.

### A page in the browser

```ts
ctx.routes.register('/p/agent-hello', pageRouter, { auth: 'session' });
ctx.uiRoutes.register({ routeId: 'greetings', path: '/greetings', title: 'Greetings' });
```

Mount pages under `/p/<your id without the @scope/>`. `ctx.uiRoutes.register`
publishes the page to the catalogue that channel-teams' Hub cards and tab
configuration read; `path` is relative to that `/p/<slug>` mount. For an entry
in the operator web UI's navigation, use `ctx.uiRoutes.registerNav({ navId,
label: { en, de }, href })` (or `pluginUi: true` for a bundled UI).

### The same page as a Teams tab

A Teams tab opens its URL as a plain GET: no omadia session cookie, no token.
A `'session'` page therefore answers 401 inside Teams. Do **not** fix that by
switching a page that shows data to `'public'` or `'custom'`. Use the pattern
the example implements ([`src/teamsTab.ts`](../../examples/agent-plugin/src/teamsTab.ts)):

| Prefix | `auth` | Serves |
| --- | --- | --- |
| `/p/<slug><path>` | `'session'` | the page, for operators in a browser |
| `/p/<slug>/teams<path>` | `'public'` | a **data-free** shell: title and a status line |
| `/p/<slug>/teams/_data<path>` | `'teams-sso'` | the page, only with a valid Teams token |

```ts
const MOUNT = '/p/agent-hello/teams';
ctx.routes.register('/p/agent-hello', pageRouter, { auth: 'session' });
ctx.routes.register(MOUNT, teamsTab.shell, { auth: 'public' });
ctx.routes.register(`${MOUNT}/_data`, teamsTab.data, { auth: 'teams-sso' });
ctx.uiRoutes.register({ routeId: 'greetings', path: '/teams/greetings', title: 'Greetings' });
```

```yaml
compat:
  core: ">=1.51.0 <2.0"
permissions:
  public_paths:
    - "/p/agent-hello/teams"
```

- **The shell** loads the Teams JS SDK 2.34.0 from
  `res.cdn.office.net` with its subresource-integrity hash, runs
  `app.initialize()` (an 8 s timeout shows "Open this page inside Microsoft
  Teams."), gets a token with `authentication.getAuthToken()`, fetches
  `<MOUNT>/_data<path>` plus `location.search` with
  `Authorization: Bearer <token>`, `credentials: 'omit'` and
  `cache: 'no-store'`, and replaces itself with the answer
  (`document.open(); document.write(html); document.close()`), or shows an
  error line.
- **The data router** is **one** router for all pages: the host dispatches a
  granted path to a single route entry, so several routers on the same prefix
  would serve only the first. Its **first** middleware is a fail-closed guard
  for older hosts that do not know `'teams-sso'`:

  ```ts
  data.use((req, res, next) => {
    if (!(req as { teamsSsoUser?: unknown }).teamsSsoUser) {
      res.status(401).json({ code: 'auth.teams_sso_required' });
      return;
    }
    next();
  });
  data.use(pageRouter);   // reuse the session page's renderers
  ```

- **The `uiRoutes` descriptor** points at the shell (`/teams<path>`), because
  channel-teams pins that path as the tab URL.
- **Who gets in.** The host checks the token's signature against Entra, that
  it was issued for a bot of the installed, active `@omadia/channel-teams` to
  a Teams or Microsoft 365 client, that it is a delegated token of a tenant
  **member** (guest accounts, personal Microsoft accounts and app-only tokens
  are refused), and its lifetime. Every failure is the same
  `401 {"code":"auth.teams_sso_required"}`. An omadia session cookie does
  **not** open a `'teams-sso'` route. Every member of the bot's tenant can open
  the tab; granting the path is the operator's consent to that reach. To
  narrow it, authorise in your handler on `req.teamsSsoUser.oid`, or have the
  operator set "Assignment required" on the bot's enterprise app in Entra.
- **The user** is on `req.teamsSsoUser`, typed `TeamsSsoUser`
  (`{ oid, tenantId, appId, upn? }`). `upn` is for display and logs;
  authorise on `oid`.

A real Teams tab login also needs the Entra "Expose an API" setup
(`access_as_user` scope, Teams clients pre-authorized) on the bot's app
registration; that is channel-teams setup, not plugin code.

### A webhook

A route an external system calls without any omadia credential uses
`auth: 'custom'` and checks every request itself. For an HMAC signature, take
`body: 'raw'` and sign the bytes as they arrived. The channel example does
exactly that; see [03 · Build a channel](./03-build-a-channel.md#inbound-the-webhook-route).

## Scheduled jobs

Declare jobs in the manifest (pre-registered by the host) or register them in
code:

```ts
const dispose = ctx.jobs.register(
  { name: 'refresh-cache', schedule: { cron: '*/15 * * * *' }, overlap: 'skip' },
  async (signal) => { /* pass `signal` to fetch; it aborts on deactivate/timeout */ },
);
```

`schedule` is `{ cron }` or `{ intervalMs }`; `timeoutMs` defaults to 30 s;
`overlap` is `'skip'` (default) or `'queue'`. A throw is logged and does not
cancel future ticks.

## Skills (prompt-partials)

Ship reusable prompt fragments in `skills/` and reference them in the manifest:

```yaml
skills:
  - id: "hello_system_prompt"
    kind: "prompt_partial"
    path: "skills/system-prompt.md"
```

They are bundled into the ZIP and loaded at activation.

## Build & install

```bash
npm run build -w examples/agent-plugin
# → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
```

Upload via **admin UI → Store → Upload**, fill the setup form, and prompt the
agent (e.g. *"Say hello to Ada."*). The browser page is at
`/p/agent-hello/greetings`; the Teams tab needs the
`/p/agent-hello/teams` grant and an active `@omadia/channel-teams`.

## Alternative: the toolkit pattern

For agents with many tools and shared state, return the tools from `activate`
as a toolkit object (`{ toolkit, close() }`) and keep the handlers in a
separate module. It's the same contract — just a tidier way to organise a large
tool surface. The single-`ctx.tools.register` form shown above is the simplest
starting point.

→ Next: [03 · Build a channel](./03-build-a-channel.md) ·
[04 · Manifest & packaging](./04-manifest-and-packaging.md)
