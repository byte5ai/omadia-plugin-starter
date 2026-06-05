# 02 · Build an agent plugin

An **agent** is a skill the orchestrator can pick and call. It declares one or
more tools (`capabilities`) and implements them in code. The worked example is
[`examples/agent-plugin`](../../examples/agent-plugin) — `@acme/agent-hello`.

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

- `activate` is called **once** when the agent is enabled.
- It returns a handle; the host calls `close()` on disable/uninstall/shutdown.
- `AGENT_ID` must equal `identity.id` in `manifest.yaml` **and** the package
  `name`.

## Registering a tool

A tool is a JSON-schema input plus a handler that returns a **string** (usually
JSON the model then reads):

```ts
ctx.tools.register(
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

## Reading configuration & secrets

Manifest `setup.fields` become operator-filled inputs at install time:

```ts
const greeting = ctx.config.get<string>('greeting') ?? 'Hello';   // plain field
const apiKey   = await ctx.secrets.require('api_key');            // type: secret
```

`ctx.secrets.require` throws if the secret is missing; `ctx.secrets.get`
returns `undefined`. Declare each field under `setup.fields` or the host won't
collect it.

> **Tell the operator how to obtain those values.** For anything they must set
> up *outside* omadia (create an API key, register an app), add a localized
> `setup.guide` to the manifest — it renders next to these fields on the Hub
> page and in the store. See [Manifest & packaging](./04-manifest-and-packaging.md).

## Self-test

If `setup.self_test: true`, the host activates your plugin once right after
install to confirm it boots. Do your cheap reachability/credential check inside
`activate` and **throw a clear error** on failure — the operator sees the
message. The `ctx.smokeMode` flag is `true` during kernel validation; branch on
it to return mock data instead of hitting a real backend.

## Calling out to the network

Outbound HTTP is gated. Declare the hosts:

```yaml
permissions:
  network:
    outbound:
      - "api.example.com"
      - "*.example.com"
```

…and only then is `ctx.http` provisioned. Route **all** traffic through it so
the allow-list and audit mode are enforced:

```ts
if (!ctx.http) throw new Error('manifest must declare permissions.network.outbound');
const res = await ctx.http.fetch('https://api.example.com/v1/ping');
```

## Skills (prompt-partials)

Ship reusable prompt fragments in `skills/` and reference them in the manifest:

```yaml
skills:
  - id: "hello_system_prompt"
    kind: "prompt_partial"
    path: "skills/system-prompt.md"
    shareable: false
```

They are bundled into the ZIP and loaded at activation. `shareable: true` lets
other agents reference the partial.

## Build & install

```bash
npm run build -w examples/agent-plugin
# → examples/agent-plugin/out/acme-agent-hello-0.1.0.zip
```

Upload via **admin UI → Store → Upload**, fill the setup form, and prompt the
agent (e.g. *"Say hello to Ada."*).

## Alternative: the toolkit pattern

For agents with many tools and shared state, return the tools from `activate`
as a toolkit object (`{ toolkit, close() }`) and keep the handlers in a
separate module. It's the same contract — just a tidier way to organise a large
tool surface. The single-`ctx.tools.register` form shown above is the simplest
starting point.

→ Next: [03 · Build a channel](./03-build-a-channel.md) ·
[04 · Manifest & packaging](./04-manifest-and-packaging.md)
