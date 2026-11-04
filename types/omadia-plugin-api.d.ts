/**
 * Local type stubs for `@omadia/plugin-api` 1.53.0.
 * Last synced against byte5ai/omadia @ dc0df0730c4ba4e5e93bb74eec23a5a31f59f087 (2026-11-04).
 *
 * The real package is provided by the Omadia host at runtime — it is NOT
 * published to npm, so you do not (and cannot) `npm install` it. These ambient
 * declarations mirror the host's public surface closely enough to compile your
 * plugin offline. At runtime the host injects the genuine implementations.
 *
 * What is mirrored: the plugin-authoring modules of
 * `middleware/packages/plugin-api/src/`, copied verbatim from the compiled
 * declarations (`dist/*.d.ts`, doc comments included) of the version above:
 * `pluginContext.ts` (the whole `ctx` surface, route auth modes, `TeamsSsoUser`,
 * `verifyConnection`, `ctx.sql`, errors), `toolErrorNotice.ts`
 * (`ToolRefusalError`), `limitSignal.ts`, `localSubAgentTool.ts`,
 * `piiAnnotation.ts`, `selfExtend.ts`, `pkce.ts`, `conversation.ts` and
 * `targetRef.ts`. The knowledge-graph DTOs and `WriteCapability` at the end are
 * the few types `pluginContext.ts` references from other modules.
 *
 * What is NOT mirrored: host-internal domains the package also exports
 * (knowledge-graph provider contract, privacy receipts, nudges, routines,
 * transcription, decision model, …). Consult the live source when you consume
 * one of those capabilities through `ctx.services`.
 *
 * Keep this file in sync with the Omadia version you target: the weekly
 * `SDK drift check` workflow compares it against byte5ai/omadia `main` and
 * opens an issue when they diverge. See `middleware/packages/plugin-api/CHANGELOG.md`
 * in the Omadia repo for what each version added.
 */
declare module '@omadia/plugin-api' {

  // ──────────────────────────────────────────────────────────────────────
  // pluginContext.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Plugin-facing contract for the @byte5/harness kernel.
   *
   * A PluginContext is the single, auditable surface through which a plugin's
   * code reaches platform-owned resources. Plugin code never imports the vault,
   * the registry, or the host config directly; it receives a ctx scoped to its
   * own identity and goes through ctx.* for everything.
   *
   * v1 (this file): secrets + config + log. Future additions (llm, memory,
   * graph, entities, fs.scratchDir, ...) land here as the runtime matures —
   * each one an additive change, not a breaking one.
   *
   * Invariant: ctx is scoped to exactly one plugin. The kernel's vault and
   * registry lookups are pinned to agentId. There is no API that lets a plugin
   * ask for another plugin's secrets — the boundary is structural.
   */
  import type { Socket } from 'node:net';
  export interface PluginContext {
      readonly agentId: string;
      /**
       * OB-77 (Palaia Phase 8) — first-class plugin Domain.
       *
       * Manifest-declared (`identity.domain`) lowercase dotted identifier (e.g.
       * `confluence`, `odoo.hr`, `m365.calendar`). Required at the manifest
       * level; the loader auto-fallbacks to `unknown.<plugin-id>` with a warn
       * when a plugin ships without one. Plugins read it via `ctx.domain` to
       * inherit it onto every tool they register (`NativeToolSpec.domain`
       * overrides per-spec when a plugin contributes tools that semantically
       * span multiple domains — rare).
       *
       * Consumed by the Phase-8 Nudge-Pipeline's multi-domain trigger and by
       * the Operator Admin UI for cross-agent grouping. Future consumers
       * (OB-78 Agent-Profile, permission scopes) may build on the same field.
       *
       * Naming-Convention enforced via `PLUGIN_DOMAIN_REGEX`.
       */
      readonly domain: string;
      readonly secrets: SecretsAccessor;
      readonly config: ConfigAccessor;
      readonly services: ServicesAccessor;
      /** Epic #470 C7 / G4 — plugin-owned Postgres schema. Present ONLY when the
       *  manifest declares `permissions.sql` AND the operator granted it. A plugin
       *  that owns tables reaches them through the `graphPool` capability (also
       *  gated by the same permission); this accessor is the migration side of
       *  that — a shared, advisory-locked runner so eight plugins do not hand-roll
       *  eight racy ones. Guard with `if (ctx.sql)`: an older core, an undeclared
       *  permission and a withheld grant are all indistinguishable from the
       *  plugin's side, and all three mean "do not touch the database". */
      readonly sql?: SqlAccessor;
      /** True only when the kernel activated this plugin specifically for a
       *  smoke probe (Theme D — admin-route schema check). False during
       *  normal `activate()` calls. Plugins MAY branch on this to return
       *  mock data instead of hitting non-idempotent production APIs during
       *  the probe. Reading the flag is optional — most plugins ignore it. */
      readonly smokeMode: boolean;
      /** Per-plugin scratch directory. Present only when the manifest declares
       *  `permissions.filesystem.scratch: true` (OM-89; the legacy top-level
       *  `filesystem.scratch` is tolerated only when the canonical block is absent).
       *  Undefined otherwise — plugins that need
       *  temp files must declare the capability so the operator can see it in
       *  the permissions summary at install time. */
      readonly scratch?: ScratchDirAccessor;
      /** HTTP client with manifest-enforced outbound allow-listing and
       *  per-plugin rate limiting. Present when `permissions.network.outbound`
       *  declares at least one host. Undefined otherwise — plugins that don't
       *  declare network access should not reach the internet at all (global
       *  `fetch` is not blocked today, but will be in a future hardening pass;
       *  relying on ctx.http means the plugin stays future-proof). */
      readonly http?: HttpAccessor;
      /** Raw-TCP egress for line protocols `ctx.http` cannot speak (SMTP, IMAP,
       *  …). Present only when the manifest declares
       *  `permissions.network.outbound_tcp` and the referenced operator config
       *  resolves to a concrete host:port. Every `connect` is pinned to that
       *  exact allow-listed target. Undefined otherwise — guard with `if
       *  (ctx.net)` so a Hub plugin tolerates an older core that lacks it. */
      readonly net?: NetAccessor;
      /** Per-plugin memory store, scoped to `/memories/agents/<agentId>/`.
       *  Paths passed to this accessor are relative — `notes.md` resolves to
       *  `/memories/agents/<agentId>/notes.md` under the hood. Plugins cannot
       *  read or write other plugins' memory (structural isolation, not ACL).
       *  Present when the manifest declares `permissions.memory.reads` OR
       *  `permissions.memory.writes` with at least one entry; absent otherwise. */
      readonly memory?: MemoryAccessor;
      /** Contribute native tools to the orchestrator. A tool registered here
       *  appears in the system-prompt tool list, becomes dispatchable via
       *  Claude's tool-use flow, and can optionally produce per-turn attachments
       *  (e.g. image URLs for rich channel cards). */
      readonly tools: ToolsAccessor;
      /** Mount Express routers contributed by the plugin. Each registration
       *  gets a path prefix (e.g. `/diagrams`) and an opaque router instance;
       *  the kernel calls `app.use(prefix, router)` at mount time. Deactivate
       *  unmounts via the returned dispose handle. */
      readonly routes: RoutesAccessor;
      /** Cross-channel notification fan-out. Plugins emit outbound events
       *  via `notifications.send(...)`; channel plugins register handlers
       *  via `notifications.registerChannel(...)`. v1 broadcasts to every
       *  registered channel; per-user channel preference comes later. */
      readonly notifications: NotificationsAccessor;
      /** Plugin-served UI surface catalogue. Plugins register clickable
       *  surfaces (Teams Tabs, Hub cards) via `uiRoutes.register(...)`.
       *  channel-teams' Hub + Tab-Config consume the catalogue at request
       *  time, so new uploads surface automatically without code changes
       *  elsewhere. */
      readonly uiRoutes: UiRoutesAccessor;
      /** Register cron- or interval-scheduled background jobs. The kernel runs
       *  each job in isolation (per-job AbortController + timeout) and stops
       *  every job belonging to a plugin when the plugin deactivates. Jobs
       *  declared in the manifest's `jobs:` block are auto-registered before
       *  `activate()` returns control; programmatic registrations via this
       *  accessor coexist with them. */
      readonly jobs: JobsAccessor;
      /** US4 (Conductor Surface) — emit a domain event the plugin declared. Present iff the manifest
       *  declares `permissions.events.emit: true`. A plugin may only emit an event id it declared via an
       *  `{ id, event_emit: true }` capability (deny-by-default → `EventNotDeclaredError`). `emit` throws
       *  `ConductorUnavailableError` when no Conductor event router is registered in this host (e.g. the
       *  in-memory backend, or during boot before Conductor has wired) — presence of the accessor does
       *  NOT guarantee the router. A successful emit is routed to every subscribed Conductor workflow. */
      readonly events?: EventsAccessor;
      /** OB-29-1 — delegate a single-turn question to another agent registered
       *  in the host. Present iff the manifest declares
       *  `permissions.subAgents.calls` with at least one entry. Plugins without
       *  the permission see `ctx.subAgent === undefined`; runtime calls to
       *  agentIds outside the manifest whitelist throw
       *  `SubAgentPermissionDeniedError`. */
      readonly subAgent?: SubAgentAccessor;
      /** OB-29-2 — namespaced knowledge-graph accessor. Present iff the
       *  manifest declares `permissions.graph.entity_systems` with at least
       *  one namespace string AND a `knowledgeGraph` provider is registered.
       *  Wraps the underlying `KnowledgeGraph` service with namespace-
       *  validation: ingestEntities/ingestFacts calls whose `system` string
       *  isn't in the manifest declaration throw `KgEntityNamespaceError`.
       *  Read methods (searchTurns, findEntityCapturedTurns, getNeighbors)
       *  pass through unchanged. */
      readonly knowledgeGraph?: KnowledgeGraphAccessor;
      /** OB-29-3 — host-LLM accessor. Present iff the manifest declares
       *  `permissions.llm.models_allowed` with at least one entry AND a
       *  'llm' provider service is registered (host with ANTHROPIC_API_KEY).
       *  Wraps the host's Anthropic client with model-whitelist + per-
       *  invocation call-budget + max-tokens-clamp. Plugins use it for
       *  natural-language tasks (entity extraction, summarisation,
       *  rephrasing) without managing API keys themselves — the host pays. */
      readonly llm?: LlmAccessor;
      /** Epic #459 W5 (issue #458) — host-pooled MCP tool access. Present iff the
       *  manifest declares `permissions.mcp` AND the host wires an MCP service.
       *  Scoped to servers the operator has EXPLICITLY granted to this plugin —
       *  never ambient access to every registered server. Calls route through
       *  the host's shared connection pool, the scan-verdict dispatch guard, and
       *  the call audit log (attributed to this plugin). Guard with
       *  `if (ctx.mcp)` — a Hub plugin may land on an older core that lacks it. */
      readonly mcp?: McpAccessor;
      /** Spec 004 — redirect/callback flow toolkit. Present iff the manifest
       *  declares `permissions.flows: true`. Supplies the three things a plugin
       *  needs to run a credential-acquisition round-trip on its OWN route:
       *  the public callback URL (`publicUrl`), and a CSRF-safe, plugin-audience-
       *  bound state token (`signState`/`verifyState`). The signing key is held by
       *  the kernel and never reaches plugin code — a token signed for plugin A
       *  fails `verifyState` in plugin B. Used by the GitHub App-Manifest flow;
       *  re-usable by any future device/OAuth dance. Guard with `if (ctx.flows)` —
       *  a Hub plugin may land on an older core that lacks it. */
      readonly flows?: FlowsAccessor;
      /** Spec 005 — broker-acquired OAuth access tokens. Present iff the manifest
       *  declares a `type:oauth` setup field (resolved through an `oauth_providers`
       *  descriptor) AND the core ships the broker. `get(fieldKey)` returns a
       *  valid access token, refreshing under a 5-minute margin kernel-side; the
       *  refresh token never reaches plugin code. Guard with `if (ctx.oauthTokens)`
       *  — a Hub plugin may land on an older core without the broker. */
      readonly oauthTokens?: OAuthTokensAccessor;
      /** Issue #438 follow-up — kernel-published operator-session verifier. Present
       *  iff the host wires a session-verification backend into
       *  `createPluginContext` (production always does; older kernels or narrow
       *  test/migration contexts may not). Lets a plugin gate its OWN admin-only
       *  HTTP surface behind the SAME operator session cookie the kernel's own
       *  `requireAuth` middleware checks, WITHOUT re-implementing (and risking
       *  drifting from) that verification logic. Per {@link RoutesAccessor}'s doc
       *  comment the kernel does NOT inject auth middleware around a contributed
       *  router — a plugin whose admin surface needs operator-only access MUST
       *  check this itself, and MUST fail closed (refuse to serve, never silently
       *  mount unauthenticated) when it is undefined. Guard with `if
       *  (ctx.operatorAuth)`. */
      readonly operatorAuth?: OperatorAuthAccessor;
      /** Report an operator-facing action status (e.g. "not connected yet"). The
       *  kernel holds the latest value per plugin and the admin UI renders it as a
       *  badge on the plugin card + a banner on the detail page that clears when
       *  the plugin reports `ok`. Always present, ungated — a plugin reports only
       *  its OWN status. In-memory: re-report on `activate()` so it self-heals
       *  after a restart. */
      readonly status: StatusAccessor;
      log(...args: unknown[]): void;
  }
  /**
   * Spec for a background job a plugin contributes to the kernel scheduler.
   *
   * `name` MUST be unique within the plugin — it is the singleton-lock key.
   * The kernel does not collide-check across plugins (plugin-A's "sync" and
   * plugin-B's "sync" are different jobs) but does enforce uniqueness inside
   * one plugin's own registrations.
   *
   * `schedule` is either a 5- or 6-field cron expression (`"*\/5 * * * *"`,
   * croner syntax) or a fixed interval in milliseconds. Cron triggers are
   * timezone-agnostic — the kernel uses local server time today; an explicit
   * `tz` field can land later without breaking existing manifests.
   *
   * `timeoutMs` defaults to 30_000. A handler that runs longer is signalled
   * via the AbortSignal it received and the run is marked failed; the next
   * scheduled tick still fires.
   *
   * `overlap` controls what happens when a tick arrives while the previous
   * run is still in flight. `'skip'` (default) drops the late tick — typical
   * for idempotent sync jobs. `'queue'` enqueues exactly one run; further
   * ticks while still waiting fall back to skip. Higher fan-in is not
   * supported in v1.
   */
  export interface JobSpec {
      readonly name: string;
      readonly schedule: JobSchedule;
      readonly timeoutMs?: number;
      readonly overlap?: 'skip' | 'queue';
  }
  export type JobSchedule = {
      readonly cron: string;
  } | {
      readonly intervalMs: number;
  };
  /** Default per-run timeout when `JobSpec.timeoutMs` is omitted. */
  export const JOB_DEFAULT_TIMEOUT_MS = 30000;
  /**
   * Handler the kernel calls on every scheduled tick. The supplied
   * `AbortSignal` is aborted on plugin deactivate or when `timeoutMs`
   * elapses — long-running handlers must respect it (e.g. pass it to fetch
   * or check `signal.aborted` between work units). Throwing is logged but
   * does NOT cancel future ticks; if the operator wants the job stopped, they
   * deactivate the plugin.
   */
  export type JobHandler = (signal: AbortSignal) => Promise<void>;
  export interface JobsAccessor {
      /** Register a job. Returns a dispose handle the plugin's `close()` MUST
       *  invoke — failing to dispose leaks the cron timer. Jobs declared in
       *  the manifest's `jobs:` block are pre-registered; calling `register`
       *  with a duplicate `name` for the same plugin throws. */
      register(spec: JobSpec, handler: JobHandler): () => void;
  }
  export class JobValidationError extends Error {
      constructor(message: string);
  }
  export class JobAlreadyRegisteredError extends Error {
      constructor(agentId: string, name: string);
  }
  /** Outcome of emitting a domain event — how many Conductor workflows matched and started. */
  export interface EmitResult {
      eventId: string;
      matchedWorkflows: number;
      startedRuns: Array<{
          workflowSlug: string;
          runId: string;
      }>;
  }
  export interface EventsAccessor {
      /** Emit a declared domain event with a JSON payload. Routes to every subscribed Conductor
       *  workflow (matched by event id + optional payload filter). Throws if the plugin did not
       *  declare `id` as an emittable event. */
      emit(id: string, payload: Record<string, unknown>): Promise<EmitResult>;
  }
  export class EventNotDeclaredError extends Error {
      constructor(agentId: string, eventId: string);
  }
  /** Thrown by `ctx.events.emit` when no Conductor event router is registered in this host — e.g. the
   *  in-memory backend, or before the Conductor subsystem has finished wiring. A typed error so plugins
   *  can detect "Conductor not available here" and degrade, rather than parsing a generic message. */
  export class ConductorUnavailableError extends Error {
      constructor();
  }
  /**
   * Capability system (manifest-only in v1).
   *
   * A capability is a versioned contract that one plugin `provides` and another
   * plugin `requires`. Before activation, the kernel checks every `requires`
   * has a matching `provides` — if not, boot fails with a clear error naming
   * the missing provider. Capability-names are ALSO used as service-registry
   * keys: a provider deklariert `provides: ["memory.kv@1"]` im Manifest and
   * calls `ctx.services.provide("memory.kv", impl)` at activate-time;
   * consumers reach the same impl via `ctx.services.get("memory.kv")`.
   *
   * v1 versioning is major-only: `"<name>@<major>"` for provides, optionally
   * `"<name>@^<major>"` for requires (the `^` is accepted but redundant — minor
   * /patch don't exist). A provider at major N matches any requires at major N.
   * This keeps the surface trivially dep-free; a later revision can introduce
   * proper semver when a real breakage case appears.
   *
   * Difference to `depends_on`:
   *   - `depends_on` names a SPECIFIC plugin id (`@omadia/memory`).
   *     Tight coupling — only that exact plugin satisfies the link.
   *   - `requires` names a CAPABILITY. Any provider that matches the name+major
   *     satisfies the link. Lets the memory layer be swapped (filesystem-impl
   *     vs. redis-impl) without touching consumers' manifests.
   */
  export interface CapabilityRef {
      /** The capability name — used as both the manifest key and the
       *  service-registry lookup key. Example: `"memory.kv"`. */
      readonly name: string;
      /** Major version. In v1 a consumer at major N matches any provider at
       *  major N exactly. */
      readonly major: number;
  }
  export class CapabilityParseError extends Error {
      constructor(raw: string, detail: string);
  }
  /**
   * Parse a capability string. Accepts both `<name>@<major>` and
   * `<name>@^<major>` — the `^` is optional and has the same semantics in v1.
   * Throws {@link CapabilityParseError} on malformed input.
   */
  export function parseCapabilityRef(raw: string): CapabilityRef;
  /** Same name + same major. */
  export function capabilitiesMatch(provider: CapabilityRef, consumer: CapabilityRef): boolean;
  /**
   * Who is asking for a service. Every field is the **kernel-known** installed
   * plugin id — `createPluginContext` fills it from the id the kernel activated
   * the plugin under, never from an argument the caller supplies. A provider can
   * therefore trust it for attribution, scoping and per-tenant filtering.
   *
   * `agentId` and `pluginId` are the same value under two names: the kernel's
   * internal term is `agentId`, the manifest/registry term is `pluginId`. Both
   * are present so a provider can read whichever name its own domain uses
   * without a lookup table.
   */
  export interface ServiceCaller {
      /** Kernel-known installed plugin id (kernel-internal name for it). */
      readonly agentId: string;
      /** The same kernel-known id under the manifest's name for it. */
      readonly pluginId: string;
  }
  /** Brand for {@link PerCallerFactory}. A unique symbol, so a plain value a
   *  plugin happens to register can never be mistaken for a factory — including
   *  a value that *is* a function, which is why the factory is wrapped in a
   *  branded object rather than detected by `typeof impl === 'function'`. */
  const PER_CALLER_FACTORY: unique symbol;
  /**
   * A service registration that mints one implementation **per consuming
   * plugin** instead of sharing a single instance.
   *
   * Build one with {@link perCallerService}; it is otherwise opaque. Resolution
   * is memoized by the FACTORY OBJECT and then by `caller.pluginId`, so one
   * provider instance is reused for repeat reads by the same consuming plugin,
   * while a re-registered provider starts cold automatically because it is a
   * different factory object.
   */
  export interface PerCallerFactory<T> {
      readonly [PER_CALLER_FACTORY]: (caller: ServiceCaller) => T;
  }
  /**
   * Wrap a factory so the kernel invokes it once per consuming plugin, handing
   * it the {@link ServiceCaller}. The factory must therefore be idempotent for a
   * given caller: repeat reads by the same plugin receive the cached result, not
   * a freshly constructed instance.
   *
   *   ctx.services.provide(
   *     'repoGrants',
   *     perCallerService((caller) => grantsScopedTo(caller.pluginId)),
   *   );
   *
   * Why this exists (epic #470 §2.2): before it, a provider that needed to know
   * which plugin was calling had exactly one option — take the id as an argument
   * from the consumer (`listGrantedRepoIds(myOwnPluginId)`). That is
   * self-attribution: the caller names itself, and nothing stops it naming
   * someone else. Routing attribution through the kernel closes that by
   * construction.
   *
   * Value providers are unaffected: `provide(name, impl)` with a plain value
   * keeps returning that exact value to every consumer.
   */
  export function perCallerService<T>(factory: (caller: ServiceCaller) => T): PerCallerFactory<T>;
  /** Narrow an arbitrary registration to a per-caller factory. */
  export function isPerCallerService<T = unknown>(value: unknown): value is PerCallerFactory<T>;
  /** Invoke a per-caller factory. Exported for the kernel's registry; plugins
   *  never need it — `ctx.services.get` already resolves the factory. */
  export function resolvePerCallerService<T>(factory: PerCallerFactory<T>, caller: ServiceCaller): T;
  /**
   * Why a `ctx.services.get(name)` call was refused — issue #788.
   *
   * The two reasons have different fixers and must not be collapsed:
   *
   *  - `undeclared` — the manifest never mentions the capability. The author
   *    adds a `requires:` / `optional_requires:` line.
   *  - `provides-not-registered` — the manifest DOES mention it, but only under
   *    `provides:`, and the plugin has not called `ctx.services.provide(name, …)`
   *    yet. `provides:` grants read-back of the plugin's OWN registration; until
   *    that registration exists there is nothing of the plugin's to read back,
   *    and resolving the name would hand over somebody else's implementation.
   *    The author either provides it first, or declares it as a dependency.
   */
  export type ServiceNotDeclaredReason = 'undeclared' | 'provides-not-registered';
  /**
   * Which `ctx.services` verb the gate refused — issue #788 follow-up.
   *
   * `get` and `replace` run the SAME grant check but are different mistakes, and
   * naming the wrong one in the message sends the author to the wrong line:
   *
   *  - `get` — the plugin tried to RESOLVE a capability.
   *  - `replace` — the plugin tried to SWAP OUT the live provider of a
   *    capability. That is strictly more dangerous than resolving it, because
   *    every other consumer in the process (core included) resolves the
   *    replacement afterwards. It is gated on the same declaration for that
   *    reason: a name a plugin may not read is a name it may not redefine.
   */
  export type ServiceGateOperation = 'get' | 'replace';
  /**
   * Thrown by `ctx.services.get(name)` / `ctx.services.replace(name, …)` when the
   * plugin's manifest does not declare `name` as a capability it `requires` — or
   * declares it only under `provides:` without having provided it (see
   * {@link ServiceNotDeclaredReason}).
   *
   * Typed so a plugin can distinguish "the operator has not installed a
   * provider" (`get` returns `undefined`) from "I forgot to declare this"
   * (this throw) — two very different bugs that used to look identical.
   */
  export class ServiceNotDeclaredError extends Error {
      readonly pluginId: string;
      readonly capability: string;
      /** The manifest field that would grant it. */
      readonly manifestField = "requires";
      /** #788 — which of the two refusals this is. Defaults to `undeclared` so
       *  every pre-existing construction site keeps its exact message. */
      readonly reason: ServiceNotDeclaredReason;
      /** Which verb was refused. Defaults to `get`, the only gated verb before
       *  the `replace` gate landed, so pre-existing call sites are unchanged. */
      readonly operation: ServiceGateOperation;
      constructor(pluginId: string, capability: string, reason?: ServiceNotDeclaredReason, operation?: ServiceGateOperation);
  }
  /**
   * Accessor for plugin-bereitgestellte (plugin-provided) services.
   *
   * Difference from secrets/config: those are kernel-owned per-plugin resources.
   * Services come from OTHER plugins — e.g. `@omadia/knowledge-graph`
   * provides 'graph', 'bus', 'embeddings'. A consumer plugin accesses them
   * generically:
   *
   *   const graph = ctx.services.get<GraphAccessor>('graph');
   *   if (!graph) { // provider not installed — handle gracefully }
   *
   * **`get` is manifest-gated (epic #470 B1).** The service-registry key IS the
   * capability name, so a plugin may only resolve names it declared in its
   * manifest's `requires:` (or `provides:`, for reading back its own
   * registration). An undeclared name throws {@link ServiceNotDeclaredError}
   * instead of handing over the implementation. Before this gate any installed
   * plugin could ask for any service — including `graphPool`, the same Postgres
   * pool core uses — with no manifest declaration and nothing in the install
   * dialog.
   *
   * **A `provides:` entry grants the name only once it has been provided
   * (issue #788).** `provides:` is a self-declaration that costs nothing at
   * activation — unlike `requires:`, it creates no ordering edge and cannot fail
   * an activation. A plugin that listed `provides: ["graphPool@1"]` and never
   * called `provide()` was therefore passing the gate for somebody else's
   * `graphPool`: an undeclared-capability bypass wearing a declaration's
   * clothes. The kernel now checks the registry for a live registration owned by
   * the asking plugin and throws with
   * `reason: 'provides-not-registered'` until there is one.
   *
   * `has` stays ungated: it answers a yes/no existence question and hands over
   * no capability, so gating it would only turn feature-probing into
   * exception-handling.
   *
   * Well-known service names and their accessor interfaces are documented
   * alongside the providing plugin. Plugins that depend on a specific service
   * should declare the provider in their manifest's `depends_on` so the
   * installer can enforce ordering.
   */
  export interface ServicesAccessor {
      /** Returns the registered provider for the given service, or undefined
       *  if no provider is installed.
       *
       *  Throws {@link ServiceNotDeclaredError} when this plugin's manifest does
       *  not declare `name` — that is a manifest bug, not a missing provider, and
       *  the two must not be reported the same way. */
      get<T>(name: string): T | undefined;
      /**
       * Resolve a capability the plugin declared as OPTIONAL
       * (`optional_requires:` in the manifest), where "no provider installed"
       * is a supported steady state rather than a misconfiguration.
       *
       * Declaration-gated on exactly the same terms as {@link get}: a name in
       * neither `requires:`, `optional_requires:` nor `provides:` throws
       * {@link ServiceNotDeclaredError}, because a typo must not silently
       * become `undefined`.
       *
       * The difference from {@link get} is the contract it advertises, not the
       * lookup. `get` is paired with `requires:`, which the installer and the
       * boot loop both treat as a hard prerequisite — so a `get` that returns
       * `undefined` normally means something upstream failed. `getOptional` is
       * paired with `optional_requires:`, which neither gate enforces, so
       * `undefined` here is an expected answer and the caller is expected to
       * carry a degradation path for it.
       *
       * Note the ordering caveat that comes with optionality: an optional
       * dependency contributes no activation edge, so a provider that IS
       * installed may not have activated yet when the consumer's `activate()`
       * runs. Resolve optional services lazily (at first use) rather than
       * caching the result of a single call during activation.
       */
      getOptional<T>(name: string): T | undefined;
      /** Whether a provider is currently registered. Ungated — see the interface
       *  doc. */
      has(name: string): boolean;
      /** Register THIS plugin as the provider for the given service name.
       *  Returns a dispose handle — the plugin's `close()` MUST invoke it to
       *  symmetrically unregister the service on deactivate. Throws on
       *  duplicate-provider (two plugins cannot both claim the same name; the
       *  operator must uninstall one).
       *
       *  `impl` is normally the shared implementation every consumer receives.
       *  Wrap it in {@link perCallerService} instead to mint one implementation
       *  per consuming plugin, with the kernel-known caller id supplied by the
       *  kernel. */
      provide<T>(name: string, impl: T | PerCallerFactory<T>): () => void;
      /**
       * OB-71 (palaia capture-pipeline): wrap an already-registered provider
       * with a decorator. The previous provider stays live behind the wrapper;
       * the dispose handle restores it on plugin deactivate. Throws if no
       * provider exists yet — use `provide` for the first registration.
       *
       * Intentionally privileged, and ENFORCED as such: `replace` is
       * declaration-gated on exactly the same terms as {@link get}. It throws
       * {@link ServiceNotDeclaredError} with `operation: 'replace'` when the
       * manifest declares `name` nowhere, and when it declares `name` only under
       * `provides:` without this plugin holding a live registration for it — in
       * that case the live provider belongs to somebody else, and taking it would
       * hand every other consumer in the process an implementation they never
       * asked for.
       *
       * So the canonical decorator declares the capability it wraps under
       * `requires:`/`optional_requires:` (e.g. `harness-orchestrator-extras`
       * declares `knowledgeGraph@^1` and wraps it with the capture-filter), and a
       * plugin re-wrapping its OWN registration is already permitted. Treat the
       * swap as a coordinated handoff, not a competing provider.
       *
       * Note the asymmetry with `provide`, which is NOT gated: `provide` cannot
       * displace anyone (it throws duplicate-provider instead), whereas `replace`
       * only succeeds when there is an owner to displace.
       *
       * Accepts a {@link perCallerService} wrapper on the same terms as
       * `provide`.
       */
      replace<T>(name: string, impl: T | PerCallerFactory<T>): () => void;
  }
  /**
   * Native-tool specification in the shape Anthropic's Messages API accepts.
   * Plugins emit this when they register a top-level orchestrator tool via
   * `ctx.tools.register(...)`. The kernel is responsible for feeding the spec
   * into the system-prompt tool list and for routing `tool_use` events with
   * a matching `name` to the plugin's handler.
   */
  export interface NativeToolSpec {
      readonly name: string;
      readonly description: string;
      readonly input_schema: {
          readonly type: 'object';
          readonly properties: Record<string, unknown>;
          readonly required?: readonly string[];
      };
      /**
       * OB-77 (Palaia Phase 8) — per-spec Domain override.
       *
       * Optional. When omitted, the kernel inherits `ctx.domain` (the plugin's
       * manifest-declared domain) at registration time. Set explicitly only
       * when a plugin contributes tools spanning multiple semantic domains
       * (rare). Same naming convention as `ctx.domain` —
       * `PLUGIN_DOMAIN_REGEX`.
       */
      readonly domain?: string;
  }
  /**
   * OB-77 (Palaia Phase 8) — Naming-Convention für Plugin-Domains.
   *
   * Lowercase, dotted hierarchy. Each segment may contain alphanumerics +
   * single hyphens (kebab-case mid-segment), but cannot start or end with a
   * hyphen and cannot contain `--`. Erlaubte Beispiele: `confluence`,
   * `odoo`, `odoo.hr`, `core.knowledge-graph`, `quality.response-guard`,
   * `m365.calendar`, `infra.unifi.devices`. Hierarchy ist vorerst
   * informativ — die Phase-8-Pipeline behandelt jeden String als opake
   * Domain (Hierarchy-Auswertung kommt mit OB-78).
   */
  export const PLUGIN_DOMAIN_REGEX: RegExp;
  /**
   * Validation helper for domain strings — used by the manifest loader and
   * by tests that exercise the contract. Returns the validated domain or a
   * structured error so callers can decide between fail-fast and warn-fallback.
   */
  export function validatePluginDomain(value: unknown): {
      ok: true;
      domain: string;
  } | {
      ok: false;
      message: string;
  };
  /** Handler a plugin hands the kernel together with the tool spec. Must return
   *  a string — the tool-use reply sent back to Claude. Kernel wraps thrown
   *  errors into `Error: <message>` for symmetry with built-in tools. */
  export type NativeToolHandler = (input: unknown) => Promise<string>;
  /**
   * Optional per-turn attachment sink. Called once at the end of each orchestrator
   * turn so the plugin can return any media (image URLs, cards, …) produced during
   * this turn and clear its internal buffer. The kernel forwards the returned
   * attachments to the channel adapter for inline rendering (Teams cards, web UI,
   * etc.). Return `undefined` if the tool did not fire during this turn — that's
   * the common case and MUST be cheap.
   */
  export type NativeToolAttachmentSink = () => NativeToolAttachment[] | undefined;
  /** Opaque attachment payload. The shape is kernel-internal; channel adapters
   *  downcast to their own richer types. Kept as `unknown` on the plugin-API
   *  surface so a new attachment kind can land without breaking the type. */
  export interface NativeToolAttachment {
      readonly kind: string;
      readonly payload: unknown;
  }
  /**
   * Contributes a tool to the orchestrator. Returns a dispose handle that
   * unregisters the tool — callers who get one at `activate()`-time MUST
   * invoke it at `close()`-time so deactivation really removes the tool
   * from the system-prompt and dispatch table.
   */
  export interface ToolsAccessor {
      register(spec: NativeToolSpec, handler: NativeToolHandler, options?: ToolRegistrationOptions): () => void;
      /** Register a handler for a tool whose spec the kernel emits itself
       *  (e.g. the Anthropic-native `memory_20250818` tool, whose wire shape is
       *  `{type, name}` rather than `{name, description, input_schema}`).
       *  Dispatch still routes `tool_use` events named `name` through this
       *  handler; prompt-list emission stays kernel-owned. Returns a dispose
       *  handle the plugin's `close()` MUST invoke. */
      registerHandler(name: string, handler: NativeToolHandler, options?: ToolRegistrationOptions): () => void;
      /** Invoke a registered native tool OUTSIDE the orchestrator turn loop.
       *  Powers the deterministic canvas refresh (omadia-ui#5): a recorded
       *  source query is re-executed with no LLM in the seat. Resolves to the
       *  handler's string result; rejects when the tool is unknown or was
       *  registered without a handler. NOTE: this bypasses the per-turn
       *  dispatch hooks (privacy guard, telemetry) — callers replay only
       *  inputs a real turn of the same user already executed. Optional so
       *  narrow test contexts need not implement it.
       *
       *  `memory` is special (#909): it never reaches the memory provider's
       *  root-bound handler. It runs against the caller's OWN `ctx.memory`
       *  scope — `/memories` is the plugin's subtree
       *  (`/memories/orchestrators/<agentSlug>/plugins/<pluginId>/`), with the
       *  same default-Agent read-only legacy fallback — and rejects when the
       *  manifest declares no `permissions.memory` or no memory store is
       *  published. */
      invoke?(name: string, input: unknown): Promise<string>;
  }
  export interface ToolRegistrationOptions {
      /** System-prompt documentation block for this tool. The kernel splices it
       *  into the tool-list section of the system prompt verbatim, prefixed by
       *  a bullet. Keep it to one paragraph (≈4–8 sentences). */
      readonly promptDoc?: string;
      /** Per-turn attachment collector. See NativeToolAttachmentSink docs. */
      readonly attachmentSink?: NativeToolAttachmentSink;
      /**
       * #542 prerequisite — declare that dispatching this tool may MUTATE data.
       *
       * This is the plugin-facing end of the `WriteCapability` contract in
       * `./writeCapabilities.ts` (see the NOTE under `NativeToolSpec` for why it
       * rides the options bag rather than the spec: the spec is forwarded verbatim
       * to Anthropic, which rejects unknown fields). The kernel stores it on the
       * registry entry, where `ToolDispatchService` reads it.
       *
       * Declaring it opts the tool into duplicate-write protection: a dispatch that
       * carries an idempotency key is deduplicated, and the MCP transport's
       * transient retry is suppressed for it (a retry cannot tell "failed before
       * writing" from "wrote, then lost the response"). A tool that mutates data and
       * omits this gets no such protection — for an Odoo or M365 write reachable from
       * a public endpoint, that means a duplicate is possible.
       */
      readonly writeCapabilities?: readonly WriteCapability[];
      /**
       * #1346 — per-turn availability. The kernel calls it inside the turn scope
       * each time it builds the tool list and the system-prompt tool docs; `false`
       * hides the tool (spec AND `promptDoc`) for that turn. On `registerHandler`
       * it gates the `promptDoc` only: the wire spec of a handler-only tool is
       * the kernel's to emit. Use it for a tool
       * that only some channels can serve — e.g. one that needs a conversation the
       * turn cannot name — so the model is never offered a call that can only
       * fail. A throw counts as `false`. Absent ⇒ always offered.
       *
       * Advertisement only: dispatch is NOT gated, so the handler must still
       * answer a call on such a turn with a truthful `Error:` result. Keep it
       * cheap and synchronous — it runs once per model round — and give the same
       * answer for the whole turn: the system prompt is built once per turn, the
       * tool list every round, and a predicate that flips mid-turn would make the
       * two disagree and break the cached prompt prefix.
       */
      readonly isAvailable?: () => boolean;
  }
  /**
   * Epic #470 C6 / G2 — how a contributed route is authenticated.
   *
   *  - `'session'` — **the default**. The kernel composes the same operator
   *    session check core mounts at `/api`, per route — WITHOUT core's static
   *    public-path exemptions (#1596), so no prefix opens it. Under `/api` that
   *    is defence-in-depth (the blanket gate already ran); outside `/api`
   *    (`/diagrams`, `/documents`, `/p/…`) it is the only session gate there is.
   *    CSRF posture is core's own: a `SameSite=Lax` session cookie, no token
   *    layer — a browser never attaches the session to a cross-site request.
   *  - `'public'` — no kernel authentication. Registration THROWS unless the
   *    prefix lies beneath a path this plugin declared in
   *    `permissions.public_paths`. Whether it is actually served without a
   *    session additionally requires operator consent (epic #470 C4/H1).
   *  - `'custom'` — same registration constraint as `'public'`; the plugin
   *    asserts it authenticates every request itself. A webhook verifying an
   *    HMAC over `req.rawBody` is the canonical case.
   *  - `'teams-sso'` (#1620) — same registration constraint and the same
   *    operator grant as `'public'`; the KERNEL authenticates every request
   *    with a Microsoft Teams tab SSO token (`Authorization: Bearer`, from
   *    `microsoftTeams.authentication.getAuthToken()`): RS256 signature against
   *    Entra's keys, the tenant and app id of a bot of the installed
   *    `@omadia/channel-teams`, issued to a Teams / Microsoft 365 client, a
   *    delegated token of a tenant member (no guest), within its lifetime.
   *    The handler finds the user on `req.teamsSsoUser`
   *    ({@link TeamsSsoUser}). Any failure is the same 401 with no reason. PURE: an omadia session cookie does NOT open it — a
   *    route that also wants operator access registers a second `'session'`
   *    router on another prefix. A Teams tab's own page load carries no
   *    bearer, so the HTML shell lives on a `'public'` route and stays
   *    data-free; it fetches the data from the `'teams-sso'` route.
   *
   * There is deliberately no `'none'`: a plugin cannot self-declare its way out
   * of authentication, only ask the operator for a prefix and be granted it.
   */
  export type RouteAuthMode = 'session' | 'public' | 'custom' | 'teams-sso';
  /**
   * #1620 — the Teams user an `auth: 'teams-sso'` route is serving. The kernel
   * sets it as `req.teamsSsoUser` after the token verified; it is absent on every
   * other route. Read it as
   * `(req as { teamsSsoUser?: TeamsSsoUser }).teamsSsoUser`.
   */
  export interface TeamsSsoUser {
      /** Entra object id of the signed-in user (`oid`). */
      readonly oid: string;
      /** Entra tenant id (`tid`), lower-cased. One of the bots' tenants; guest
       *  accounts are refused, so this is the user's own tenant. */
      readonly tenantId: string;
      /** App id of the bot the token was issued for. */
      readonly appId: string;
      /** `preferred_username` / `upn`, when the token carries one. Display and
       *  logs only — authorise on `oid`, not on this. */
      readonly upn?: string;
  }
  /**
   * Epic #470 C6 / G3 — how the request body reaches the contributed router.
   *
   *  - `'json'` — **the default**. Parsed JSON at core's own limit (10 MB).
   *  - `'raw'` — untouched bytes as a `Buffer`, on BOTH `req.body` and
   *    `req.rawBody`, at a 512 KB default limit. The kernel parses these ahead
   *    of its global JSON parser, so the bytes an HMAC is computed over are the
   *    bytes that arrived. Do NOT re-serialise `req.body` to verify a signature.
   *  - `'none'` — the kernel mounts no parser for this route; the plugin owns the
   *    stream (uploads, proxying, streaming responses). It does NOT disable the
   *    kernel's global JSON parser: an `application/json` request has still been
   *    read upstream. Use `'raw'` when you need the bytes as they arrived.
   */
  export type RouteBodyMode = 'json' | 'raw' | 'none';
  export interface RouteRegisterOptions {
      /** Default `'session'`. See {@link RouteAuthMode}. */
      readonly auth?: RouteAuthMode;
      /** Default `'json'`. See {@link RouteBodyMode}. */
      readonly body?: RouteBodyMode;
      /** Express body-parser limit string (`'1mb'`, `'512kb'`). Defaults to 10 MB
       *  for `'json'` and 512 KB for `'raw'`. Ignored for `'none'`.
       *
       *  Only `'raw'` gives it a real effect. Raw bodies are captured before the
       *  kernel's global parser (they have to be), which is also before the session
       *  gate — so raising it raises how much an ANONYMOUS caller can make the
       *  kernel buffer. State a bigger number only when the payload needs it.
       *
       *  On `'json'` the kernel's global 10 MB parser has already run, so a larger
       *  value here cannot raise the effective ceiling. */
      readonly bodyLimit?: string;
  }
  /**
   * Contributes an Express router to the kernel. The kernel mounts it at the
   * given prefix via `app.use(prefix, router)`.
   *
   * Since epic #470 C6 the kernel DOES inject middleware around the contributed
   * router, in a fixed order:
   *
   *     [deactivation guard] → [auth] → [body parser] → your router
   *
   * The deactivation guard is first, so a deactivated plugin's prefix stops
   * existing before any authentication or body buffering happens. CORS and rate
   * limiting remain the plugin's responsibility.
   */
  export interface RoutesAccessor {
      register(prefix: string, router: unknown, options?: RouteRegisterOptions): () => void;
  }
  /**
   * Spec 004 — toolkit for plugins that run a redirect/callback flow on their
   * own route (`permissions.flows: true`). The kernel owns the public-URL
   * topology and the state-signing key; the plugin owns its route handler and
   * the provider-specific logic (what to POST, how to parse the response).
   *
   * Threat model: the state token is the CSRF guard for the whole round-trip.
   * The kernel auto-binds its audience to the calling plugin id, so a token
   * minted by (or for) one plugin cannot be replayed against another's
   * callback. The HS512 signing key is kernel-held; `signState`/`verifyState`
   * close over it without ever exposing it.
   */
  export interface FlowsAccessor {
      /**
       * Resolve the browser-facing absolute URL for one of this plugin's own
       * routes — the value to hand an external IdP as a `redirect_url`.
       *
       * Mirrors how the store-detail page reaches a plugin's admin UI: the
       * plugin's route is mounted on the middleware under `/api/<…>`, and the
       * browser reaches it through the `/bot-api/*` → `/api/*` proxy. So a route
       * registered at prefix `/api/github` with `relPath = 'flow/callback'`
       * resolves to `{FLOW_PUBLIC_BASE_URL}/bot-api/github/flow/callback`.
       *
       * The prefix is the plugin's sole registered route prefix; when the plugin
       * registered several, pass `opts.prefix` to disambiguate. `relPath` is
       * relative (a leading slash is tolerated). Throws if no route is registered
       * yet (register the route before calling) or if the prefix is ambiguous.
       */
      publicUrl(relPath: string, opts?: {
          prefix?: string;
      }): string;
      /**
       * Sign arbitrary claims into a short-lived (10-min default) HS512 state
       * token. The kernel sets `iss=omadia`, `aud=plugin:<thisPluginId>`, and the
       * issued-at/expiry — the plugin only supplies its own claims (e.g. a nonce,
       * a return path). Use the result as the `state` query-param of the flow.
       */
      signState(claims: Record<string, unknown>, opts?: {
          ttl?: string;
      }): Promise<string>;
      /**
       * Verify a state token returned on the callback. Rejects (throws) a token
       * whose signature is invalid, whose `aud` is not this plugin, or whose TTL
       * has expired. Returns the decoded claims (including the standard `iss`,
       * `aud`, `iat`, `exp`) on success.
       */
      verifyState(token: string): Promise<Record<string, unknown>>;
  }
  /**
   * Normalized, operator-facing health of a plugin. `ok` = nothing to do;
   * `needs_action` = a required setup/connection step is pending (rendered as an
   * amber badge + banner with a call-to-action toward the plugin's admin UI);
   * `error` = misconfigured/failing (red). The kernel maps these to the UI;
   * `title`/`detail` let the plugin phrase the specifics ("Nicht verbunden" /
   * "Erstelle die GitHub App in der Admin-UI").
   */
  export type PluginActionState = 'ok' | 'needs_action' | 'error';
  export interface PluginActionStatus {
      readonly state: PluginActionState;
      /** Short label for the badge/banner (e.g. "Nicht verbunden"). */
      readonly title?: string;
      /** One-line detail / next step (e.g. "Verbindung in der Admin-UI herstellen"). */
      readonly detail?: string;
      /**
       * ISO timestamp of when this status was reported — STAMPED BY THE KERNEL at
       * `report()` time, never trusted from the plugin, so "geprüft um <Zeit>"
       * cannot lie about when the check actually ran. Field-test follow-up
       * (OM-16/24/33): a connection verdict without a time reads as a permanent
       * fact; with one it reads as what it is — the result of the last probe.
       */
      readonly checked_at?: string;
  }
  /**
   * Push-based status reporter. A plugin calls `report(...)` whenever its
   * operator-facing state changes (typically from its discovery/health check),
   * and `clear()` once everything is fine. The kernel keeps only the latest
   * value per plugin; there is no history. Reporting another plugin's status is
   * impossible — the accessor is bound to the calling plugin's id.
   *
   * `state: 'ok'` semantics: a BARE ok (no `title`) is equivalent to `clear()`
   * and renders nothing — existing callers keep their behaviour. An ok WITH a
   * `title` (e.g. "Verbunden") is stored and rendered as a positive badge with
   * the kernel-stamped `checked_at`, so an integration can surface "connection
   * verified at <time>" instead of silence.
   */
  export interface StatusAccessor {
      report(status: PluginActionStatus): void;
      clear(): void;
  }
  /**
   * Issue #1453 — WHY a plugin says the target system refused its credentials.
   *
   * `rejected` is the only verdict that turns a plugin red and withholds its
   * tools from the orchestrator, so the kernel does not accept it on the
   * plugin's word alone: a verdict that names no recognised cause here is
   * demoted to `inconclusive`. The kernel cannot inspect the exchange itself —
   * only the plugin knows its wire protocol — but it can insist the plugin
   * state WHICH explicit refusal it saw, which is what stops a bare
   * `catch { return { status: 'rejected' } }` from painting an outage as a dead
   * key.
   *
   * - `http_401` — the target answered 401. The unambiguous case.
   * - `http_403_auth` — a 403 whose body self-identifies as an authentication
   *   failure. A plain 403 is NOT this: OpenAI answers 403 for "country, region,
   *   or territory not supported" and Atlassian for permission scopes, neither
   *   of which means the credential is wrong.
   * - `protocol_auth_failure` — an auth refusal carried outside the HTTP status,
   *   which is why this enum cannot be HTTP-only: Odoo answers a wrong API key
   *   with `authenticate → false` over a 200.
   *
   * Timeouts, 5xx, DNS failures and anything the plugin is unsure about have no
   * cause and must be reported as `inconclusive`.
   */
  export type ConnectionRejectionCause = 'http_401' | 'http_403_auth' | 'protocol_auth_failure';
  /**
   * Issue #1453 — core's own rules for the HTTP half of the classification
   * above, so a plugin does not have to re-derive them (and cannot get them
   * subtly wrong). Returns the cause for an exchange that is an explicit
   * authentication refusal, and `undefined` for everything else — including
   * every 5xx, every network failure and a plain 403.
   *
   * The 403 rule mirrors `providerCredentialVerifier.ts` in the middleware,
   * which pays for it on the LLM side: only a 403 whose body says so is an auth
   * verdict.
   *
   * ```ts
   * // ctx.http (allow-list, SSRF guard, rate limit), never global fetch.
   * const res = await ctx.http!.fetch(url, { headers });
   * const cause = classifyHttpAuthFailure(res.status, await res.text());
   * return cause
   *   ? { status: 'rejected', cause, title: 'Nicht verbunden' }
   *   : res.ok
   *     ? { status: 'connected', title: 'Verbunden' }
   *     : { status: 'inconclusive' };
   * ```
   */
  export function classifyHttpAuthFailure(status: number, bodyText?: string): ConnectionRejectionCause | undefined;
  /**
   * Issue #1453 — the verdict of a plugin's own connection check.
   *
   * Only the plugin knows its wire protocol, so only the plugin can classify the
   * answer: Odoo answers a bad API key with `authenticate → false` over a 200,
   * Confluence with a 401, another target with a 403 that does not mean "wrong
   * key" at all. The kernel therefore does not inspect responses — it asks for a
   * verdict and maps it, which is also why the three cases are named rather than
   * expressed as a boolean.
   *
   * - `connected` — the target system accepted the credentials. Carry a `title`
   *   (e.g. "Verbunden") to have it rendered as a positive badge with the
   *   kernel-stamped time; without one the probe only clears a previous verdict.
   * - `rejected` — the target system EXPLICITLY refused the credentials. This is
   *   the only verdict that turns the plugin red and withholds its tools, so it
   *   must mean "this key is wrong", never "the call did not succeed" — and it
   *   MUST carry a `cause`, or the kernel demotes it to `inconclusive`.
   * - `inconclusive` — anything else: timeout, 5xx, DNS failure, air-gapped
   *   install, an endpoint that answered something unparseable. The operator
   *   keeps whatever status they had; an outage must not accuse them of holding
   *   a broken credential. Returning nothing, throwing, or running past the
   *   kernel's time budget are all treated as this case.
   *
   * `title` and `detail` are rendered verbatim in the admin UI, so a plugin that
   * supplies them owns their localisation (the kernel ships no copy of its own).
   */
  export interface PluginConnectionVerdict {
      readonly status: 'connected' | 'rejected' | 'inconclusive';
      /**
       * REQUIRED when `status` is `rejected`, and meaningless otherwise: which
       * explicit refusal the plugin saw. A `rejected` verdict without a recognised
       * cause is demoted to `inconclusive` by the kernel — see
       * {@link ConnectionRejectionCause}. Derive the HTTP cases with
       * {@link classifyHttpAuthFailure} rather than by hand.
       */
      readonly cause?: ConnectionRejectionCause;
      /** Short label for the badge, in the operator's language. */
      readonly title?: string;
      /** One-line detail / next step, in the operator's language. */
      readonly detail?: string;
  }
  /**
   * Issue #1453 — optional module export, next to `activate`, that answers "do
   * these credentials actually work?".
   *
   * The kernel calls it after a successful `activate()` (so the plugin's own
   * client is already built), on every activation — fresh install, boot-time
   * reactivation, and the reactivation that follows a setup-field edit — and
   * from the operator-triggered `POST /api/v1/admin/runtime/installed/:id/verify`.
   * It is bounded and its result can never fail the activation: a plugin whose
   * probe throws or hangs stays up, it just does not get a verdict.
   *
   * The verdict is written through the SAME `ctx.status` channel the plugin may
   * write itself, and it runs after `activate()`, so a probe verdict is the
   * fresher of the two and wins. A plugin that reports an unrelated
   * `needs_action` from `activate()` should therefore re-report it from here.
   */
  export type VerifyConnection = (ctx: PluginContext) => Promise<PluginConnectionVerdict> | PluginConnectionVerdict;
  /**
   * Spec 005 — read-side of the kernel OAuth broker. `get(fieldKey)` returns a
   * currently-valid access token for the named `type:oauth` connection,
   * transparently refreshing it within a 5-minute expiry margin. The kernel runs
   * the refresh, rotates the stored refresh token, and returns only the access
   * token — the refresh token NEVER reaches plugin code.
   *
   * Throws an {@link OAuthTokenError}: `not_connected` when no token is stored
   * (the operator hasn't completed Connect), `refresh_failed` when a refresh was
   * rejected (credential revoked → operator must re-connect).
   */
  export interface OAuthTokensAccessor {
      get(fieldKey: string): Promise<string>;
  }
  export type OAuthTokenErrorCode = 'not_connected' | 'refresh_failed';
  /**
   * Issue #438 follow-up — kernel-published operator-session verifier (see the
   * `PluginContext.operatorAuth` doc comment for the full contract). The kernel
   * implementation reuses the EXACT SAME verification logic as its own
   * `requireAuth` middleware — same cookie name, same signing key, same
   * Entra-whitelist rule — so there is exactly one code path that decides
   * session validity, never two that can drift apart. Deliberately decoupled
   * from Express (this package never imports express types, see
   * {@link RoutesAccessor}): the caller hands over the raw `Cookie` header
   * string, not a `Request`.
   */
  export interface OperatorAuthAccessor {
      /**
       * Resolves `true` iff the raw `Cookie` request header carries a currently
       * valid operator session. Never throws — a missing header, a malformed
       * cookie, an expired/invalid session token, or (for Entra-issued sessions)
       * an email that fell off the admin whitelist all resolve `false`.
       */
      hasValidSession(cookieHeader: string | undefined): Promise<boolean>;
      /**
       * Issue #1329 — who the session belongs to. Resolves the principal behind a
       * currently valid operator session (same verification as
       * `hasValidSession`), or `null` for anything `hasValidSession` would refuse.
       * Never throws. Optional so a plugin running on an older kernel degrades to
       * "owner unknown" instead of failing to load.
       */
      sessionPrincipal?(cookieHeader: string | undefined): Promise<OperatorPrincipal | null>;
      /**
       * Issue #1329 — append one row to the kernel's `admin_audit` ledger for a
       * privileged action the plugin just performed. The KERNEL resolves the actor
       * from the cookie (a plugin cannot name somebody else as the actor) and
       * stamps the calling plugin's id into the row. `action` must be one the
       * kernel admits for the calling plugin and target (today the `api_key.*`
       * lifecycle events of `@omadia/channel-api`); anything else is refused, as
       * are payloads over 4 KB.
       *
       * Resolves `true` when the row was written, `false` when it was not (no
       * valid session, action not admitted, no audit store in this deployment,
       * or the write failed — the kernel logs why). Never throws: the caller has
       * already performed the action and decides itself how loudly to complain.
       */
      recordAdminAction?(cookieHeader: string | undefined, entry: OperatorAdminAuditEntry): Promise<boolean>;
  }
  /** Issue #1329 — the operator behind a session. `userId` is `users.id` (the
   *  session's `uid` claim; absent on a session minted before that claim
   *  existed), `email` the session email. */
  export interface OperatorPrincipal {
      readonly userId?: string;
      readonly email: string;
  }
  /** Issue #1329 — one plugin-originated `admin_audit` row. `before`/`after`
   *  are stored verbatim as JSON; never put secrets (tokens, hashes) in them. */
  export interface OperatorAdminAuditEntry {
      readonly action: string;
      /** Entity ref, e.g. `api-key:<uuid>`. */
      readonly target: string;
      readonly before?: Readonly<Record<string, unknown>>;
      readonly after?: Readonly<Record<string, unknown>>;
  }
  export class OAuthTokenError extends Error {
      readonly code: OAuthTokenErrorCode;
      constructor(code: OAuthTokenErrorCode, message: string);
  }
  /**
   * Plugin-served UI surface registry. Plugins call
   * `uiRoutes.register({routeId, path, title})` from their `activate()`
   * to publish a clickable surface (Teams Tab, Hub card, web link).
   * The kernel auto-fills `pluginId` from the calling plugin's agentId
   * so plugins can't spoof other plugins' surfaces.
   *
   * The descriptor catalogue is the source of truth for downstream
   * surfaces — channel-teams' Hub iterates it for cards, and Tab-Config
   * queries it for the target-route dropdown. The HTTP route itself is
   * registered separately via `ctx.routes.register('/p/...', router)`;
   * the descriptor just makes the surface discoverable.
   */
  export interface UiRoutesAccessor {
      /**
       * Publish a uiRoute descriptor. Returns a dispose handle the plugin
       * MUST call from its `close()` so a hot-swap doesn't leak entries
       * into the catalogue.
       */
      register(descriptor: UiRouteDescriptorInput): () => void;
      /**
       * Publish a top-level navigation entry for the operator web UI.
       *
       * This is deliberately separate from `register()`: a uiRoute
       * descriptor addresses a plugin-served surface *relative to* the
       * plugin's `/p/<pluginId>` mount, whereas a nav entry addresses an
       * absolute in-app route. A plugin whose UI ships as compiled
       * web-ui pages (a built-in package) has a nav entry and no uiRoute;
       * a plugin serving its own HTML has both.
       *
       * Supply either a literal `href` (validated as a canonical in-app path)
       * or `pluginUi: true`, which asks the kernel to render the canonical
       * path to this plugin's own bundled UI — the only way a scoped plugin
       * id can express a nav destination, since that path must be
       * percent-encoded and a literal href may not be.
       *
       * Returns a dispose handle the plugin MUST call from its `close()`.
       * The kernel additionally drops every entry by source on deactivate,
       * so a leaked handle cannot outlive the plugin.
       */
      registerNav(entry: UiNavEntryInput): () => void;
  }
  export interface UiRouteDescriptorInput {
      /** Stable id within the plugin (e.g. `'dashboard'`, `'absences'`).
       *  Combined with pluginId to form the catalogue key. */
      readonly routeId: string;
      /** Path relative to the plugin's `/p/<pluginId>` mount (must start
       *  with `/`, e.g. `/dashboard`). */
      readonly path: string;
      /** Human-readable label shown in Hubs, dropdowns, and Tab titles. */
      readonly title: string;
      /** Optional one-line summary surfaced as a tooltip / card subtitle. */
      readonly description?: string;
      /** Optional ordering hint — lower comes first. Defaults to 100. */
      readonly order?: number;
  }
  /**
   * Catalogue-resolved descriptor — pluginId injected by the kernel from
   * the registering plugin's agentId.
   */
  export interface UiRouteDescriptor extends UiRouteDescriptorInput {
      readonly pluginId: string;
  }
  /**
   * A navigation entry contributed by a plugin to the operator web UI.
   *
   * Labels are plugin-owned and localized here rather than in web-ui's
   * `messages/*.json`, because the shell cannot know a third-party
   * plugin's strings at build time. The kernel resolves the label for
   * the requested locale before it ever reaches the browser, so the UI
   * never has to merge a second message catalogue at runtime.
   */
  export interface UiNavEntryInput {
      /** Stable id within the plugin. Combined with pluginId as the key. */
      readonly navId: string;
      /**
       * Absolute in-app path (e.g. `/admin/reports`). Must start with exactly
       * one `/` — protocol-relative (`//host`) and scheme-bearing values are
       * rejected so a manifest cannot point the nav off-origin. Segments are
       * confined to the RFC 3986 unreserved set: no query, no fragment, no
       * percent-encoding, no dot-segments.
       *
       * Mutually exclusive with {@link pluginUi}; exactly one of the two must
       * be supplied.
       */
      readonly href?: string;
      /**
       * Point the entry at THIS plugin's own bundled UI instead of a literal
       * path, and let the kernel spell the URL.
       *
       * A plugin that ships a compiled SPA is served at `/p/<pluginId>/ui/`
       * and embedded by the shell's host page at `/plugin-ui/<pluginId>`. For
       * a scoped id like `@acme/widget` the only URL that resolves is the
       * percent-encoded one (`%40acme%2Fwidget`) — and percent-encoding is
       * exactly what the `href` validator refuses, deliberately, because a
       * literal href has to be comparable to a core path by string equality.
       *
       * So the plugin states the intent and the kernel renders the canonical
       * encoded path from the id it already knows. A plugin never hand-builds
       * an encoded href, and the literal-href rule stays strict.
       */
      readonly pluginUi?: true;
      /**
       * Optional cluster to nest under (e.g. `adminCluster`). Rendered as a
       * top-level entry when omitted, or when the shell has no cluster by
       * that key.
       */
      readonly cluster?: string;
      /** Ordering hint within the cluster — lower comes first. Default 100. */
      readonly order?: number;
      /**
       * Locale code → label. An `en` entry is required as the fallback for
       * locales the plugin does not translate.
       */
      readonly label: Readonly<Record<string, string>>;
  }
  /**
   * Catalogue-resolved nav entry — `pluginId` injected by the kernel, and
   * `href` no longer optional: a `pluginUi: true` input is resolved to the
   * canonical host-page path at registration, so every stored entry carries
   * a concrete destination.
   */
  export interface UiNavEntry extends Omit<UiNavEntryInput, 'href'> {
      readonly pluginId: string;
      readonly href: string;
  }
  /**
   * A nav entry flattened for one locale. This is the shape the HTTP
   * surface returns and the web UI consumes; `label` is already resolved,
   * so no locale negotiation happens in the browser.
   */
  export interface ResolvedUiNavEntry {
      readonly pluginId: string;
      readonly navId: string;
      readonly href: string;
      readonly cluster?: string;
      readonly order: number;
      readonly label: string;
      /**
       * Present iff the entry was registered with `pluginUi: true`. The shell
       * uses it to re-derive `href` from `pluginId` locally instead of
       * trusting the transmitted string — the middleware is a separate
       * deployable, and a percent-encoded href is the one shape the shell's
       * own defensive href rule cannot check character by character.
       */
      readonly pluginUi?: true;
  }
  /**
   * Cross-channel notifications. Plugins emit outbound events through
   * `send()`; channel plugins register inbound handlers via
   * `registerChannel()`. The router fans every emitted event out to every
   * registered channel — v1 broadcast model. Per-user channel preference
   * routing lands in a later slice.
   */
  export interface NotificationsAccessor {
      /**
       * Dispatch a notification to all registered channel handlers. The
       * pluginId is auto-injected from the caller's PluginContext; plugins
       * MUST NOT set it themselves.
       *
       * Returns a per-channel dispatch result so callers can surface partial
       * failures. The accessor itself never throws on handler errors — a
       * crashing channel handler must not break the calling plugin's flow.
       */
      send(payload: NotificationPayload): Promise<NotificationDispatchResult>;
      /**
       * Channel plugins register an inbound handler keyed by channelId
       * (e.g. `'teams'`, `'telegram'`). Returns a dispose handle the channel
       * MUST call from its `close()` so a hot-swap doesn't leak handlers.
       * Re-registering the same channelId without disposing first throws.
       */
      registerChannel(channelId: string, handler: ChannelNotificationHandler): () => void;
  }
  export interface NotificationPayload {
      readonly title: string;
      readonly body: string;
      /**
       * Optional relative path users land on when they activate the
       * notification. Channel handlers resolve it against the operator-facing
       * web-ui origin (Teams deep-link, Telegram start-param, etc.).
       */
      readonly deepLink?: string;
      /**
       * v1 supports `'broadcast'` only — each channel handler decides what
       * 'broadcast' means in its world (Teams: activity feed for tenant
       * members; Telegram: pinned chat post; etc.). v2 will accept a
       * concrete list of user IDs for targeted delivery.
       */
      readonly recipients?: 'broadcast' | readonly string[];
  }
  export interface NotificationDispatchResult {
      /** channelIds whose handler completed without throwing. */
      readonly delivered: readonly string[];
      /** channelIds whose handler threw, with the error message. */
      readonly failed: readonly {
          readonly channelId: string;
          readonly error: string;
      }[];
      /** Whether the router has any registered handlers. False here means
       *  the notification went nowhere — plugins MAY surface this to the
       *  operator. */
      readonly anyHandlerPresent: boolean;
  }
  export type ChannelNotificationHandler = (payload: ResolvedNotificationPayload) => Promise<void>;
  /**
   * Payload as it lands inside a channel handler — the kernel has filled
   * in `pluginId` from the emitting plugin and normalised `recipients`.
   */
  export interface ResolvedNotificationPayload {
      readonly pluginId: string;
      readonly title: string;
      readonly body: string;
      readonly deepLink?: string;
      readonly recipients: 'broadcast' | readonly string[];
  }
  /**
   * Accessor for a per-plugin scratch directory. The kernel guarantees:
   *   - The directory is isolated to the plugin (no other plugin sees it).
   *   - The path is stable across invocations within one activation (restarts
   *     or re-installs may allocate a fresh directory).
   *   - The directory is created lazily on first `path()` call.
   *   - Cleanup on deactivate/uninstall is best-effort (the operator may see
   *     leftover entries on crash or aborted uninstall — plugins must not
   *     depend on cleanup for correctness).
   *
   * The kernel does NOT enforce a size quota in v1. Plugins that write large
   * files are responsible for their own cleanup. A future accessor revision
   * may add `sizeBytes()` / `reserve(bytes)` APIs.
   */
  export interface ScratchDirAccessor {
      /** Absolute path to the scratch directory. Creates it on first call. */
      path(): Promise<string>;
  }
  /**
   * HTTP accessor — a thin wrapper around global `fetch` that enforces the
   * outbound allow-list declared in the plugin's manifest and applies a
   * per-plugin rate limit.
   *
   * Allow-list matching (v1):
   *   - Exact hostname: `api.example.com` matches only `api.example.com`
   *   - Leading-wildcard: `*.example.com` matches any single-level subdomain
   *     like `api.example.com` but NOT `example.com` itself
   *   - Port is ignored — a manifest entry for `api.example.com` permits both
   *     :80 and :443. Port-specific allow-listing is reserved for a later
   *     hardening pass.
   *
   * Rate-limit (v1): simple token bucket, 60 requests per rolling minute.
   * Violations throw `HttpRateLimitError`. Per-plugin config override lands
   * in a future revision alongside `permissions.network.rate_limit`.
   *
   * Errors: unknown-host requests throw `HttpForbiddenError`. Network /
   * transport failures surface as whatever fetch itself throws.
   */
  export interface HttpAccessor {
      fetch(url: string, init?: RequestInit): Promise<Response>;
  }
  export class HttpForbiddenError extends Error {
      constructor(agentId: string, host: string);
  }
  export class HttpRateLimitError extends Error {
      constructor(agentId: string);
  }
  /**
   * Raw outbound TCP connection options for `ctx.net.connect`.
   *
   * Unlike `ctx.http` (HTTP/HTTPS only), `ctx.net` opens a raw TCP — or, with
   * `tls: true`, an implicitly-encrypted — socket to a host:port the operator
   * configured. It exists for line protocols the HTTP accessor cannot speak:
   * SMTP/IMAP/POP3 and the like. The target is gated against
   * `permissions.network.outbound_tcp` (see `NetAccessor`).
   */
  export interface NetConnectOptions {
      readonly host: string;
      readonly port: number;
      /**
       * When true the kernel performs the TLS handshake and resolves with an
       * already-encrypted socket (implicit TLS — e.g. SMTPS on :465). When false
       * or omitted a plain TCP socket is returned and the caller may upgrade it
       * itself (e.g. SMTP STARTTLS on :587, which nodemailer negotiates over the
       * plain socket). Either way the connection only reaches the allow-listed
       * host:port.
       */
      readonly tls?: boolean;
      /** TLS SNI servername; defaults to `host`. Ignored when `tls` is falsy. */
      readonly servername?: string;
  }
  /**
   * Raw-TCP egress accessor. Present only when the manifest declares
   * `permissions.network.outbound_tcp` with at least one target the plugin's
   * config resolves to a concrete host:port. Every `connect` is gated against
   * that resolved allow-list (exact host + port match) and a per-minute
   * connection budget — an unlisted target throws `NetForbiddenError`, an
   * over-budget caller `NetRateLimitError`.
   *
   * The allow-list is resolved from operator config, NOT static manifest
   * hostnames: a generic mail plugin does not know the SMTP host at authoring
   * time, so the manifest references config fields (`host: "$config.smtp_host"`)
   * and the kernel pins egress to exactly what the operator entered. That also
   * means an internal relay on a private IP is reachable — the operator chose
   * it — without opening a general SSRF hole.
   */
  export interface NetAccessor {
      connect(options: NetConnectOptions): Promise<Socket>;
  }
  export class NetForbiddenError extends Error {
      constructor(agentId: string, target: string);
  }
  export class NetRateLimitError extends Error {
      constructor(agentId: string);
  }
  /**
   * Memory accessor — per-plugin filesystem-backed key-value-ish store.
   *
   * All paths are RELATIVE to the plugin's own scope. Absolute paths, `..`
   * segments, and null bytes are rejected. The kernel transparently prepends
   * `/memories/agents/<agentId>/` to every call, so a plugin writing
   * `notes/today.md` stores data at `/memories/agents/<agentId>/notes/today.md`
   * on the host's memory store.
   *
   * Scope isolation is structural, not permission-based: the accessor literally
   * has no way to reach another plugin's path. A future revision may add an
   * opt-in shared-space concept (e.g. `ctx.memory.shared('public')`) once the
   * KG / shared-knowledge extraction lands.
   */
  export interface MemoryAccessor {
      /** Read a file. Throws on missing path or if the path is a directory. */
      readFile(relPath: string): Promise<string>;
      /** Create-or-overwrite. Intermediate directories are created as needed. */
      writeFile(relPath: string, content: string): Promise<void>;
      /** Create, fail-if-exists. Use when two concurrent writers must not race. */
      createFile(relPath: string, content: string): Promise<void>;
      /** Remove a file or directory (recursive). */
      delete(relPath: string): Promise<void>;
      /** List immediate entries under `relPath`. */
      list(relPath: string): Promise<readonly MemoryEntryInfo[]>;
      /** True if the path resolves to an existing file OR directory. */
      exists(relPath: string): Promise<boolean>;
      /**
       * The plugin's own AGENT-INDEPENDENT tree — `/memories/agents/<pluginId>/`,
       * the tree the manifest's `agent:<pluginId>:*` memory permission names.
       * The accessor itself resolves per Agent (the active turn's slug, else
       * `default`); this view is the same for every Agent and outside any turn,
       * so plugin-wide state (a tenant-wide cache, learned data) has ONE
       * location. Same path rules; no nested `pluginWide`. Absent on hosts that
       * predate it — callers fall back to the per-Agent view.
       */
      readonly pluginWide?: MemoryAccessor;
  }
  export interface MemoryEntryInfo {
      /** Path relative to the plugin's scope — the same shape callers pass in. */
      readonly relPath: string;
      readonly isDirectory: boolean;
      readonly sizeBytes: number;
  }
  export class MemoryPathError extends Error {
      constructor(message: string);
  }
  /**
   * Host-side memory store contract. The unscoped, root-level interface that
   * a memory-provider plugin (e.g. `@omadia/memory`) implements and
   * publishes into the kernel's ServiceRegistry under the well-known name
   * `memoryStore`. All paths passed in are absolute virtual paths starting
   * with `/memories/...`; the backend maps them into its own namespace
   * (filesystem, Postgres, …).
   *
   * Plugin code does NOT receive a `MemoryStore` directly — it receives the
   * scoped `MemoryAccessor` above, which the kernel constructs from a
   * `MemoryStore` pinned to the plugin's `/memories/agents/<agentId>/`
   * subtree. The `MemoryStore` contract lives on the plugin-api surface
   * because it is a cross-plugin service boundary: the memory-provider
   * plugin emits it, downstream plugins (via `ctx.services.get('memoryStore')`)
   * and kernel glue (chat-session store, graph backfill, admin router)
   * consume it. Keeping the interface here means neither side has to
   * depend on the provider plugin's package directly.
   */
  export interface MemoryStore {
      /** List entries (files + directories) up to 2 levels deep under `virtualPath`. */
      list(virtualPath: string): Promise<MemoryEntry[]>;
      /** Check whether a file exists at `virtualPath`. Directories return `false`. */
      fileExists(virtualPath: string): Promise<boolean>;
      /** Check whether a directory exists at `virtualPath`. */
      directoryExists(virtualPath: string): Promise<boolean>;
      /** Read a file's full content. Throws if missing or if it's a directory. */
      readFile(virtualPath: string): Promise<string>;
      /** Create a file with content. Throws if it already exists. */
      createFile(virtualPath: string, content: string): Promise<void>;
      /** Overwrite a file's content (used by str_replace/insert). */
      writeFile(virtualPath: string, content: string): Promise<void>;
      /** Delete a file or directory (recursive). */
      delete(virtualPath: string): Promise<void>;
      /** Rename/move a file or directory. */
      rename(fromVirtualPath: string, toVirtualPath: string): Promise<void>;
  }
  export interface MemoryEntry {
      virtualPath: string;
      isDirectory: boolean;
      sizeBytes: number;
  }
  export interface SecretsAccessor {
      /** Returns the secret, or undefined if not present. */
      get(key: string): Promise<string | undefined>;
      /** Returns the secret, or throws a MissingSecretError. */
      require(key: string): Promise<string>;
      /** Keys present in the vault for this plugin. Never returns values. */
      keys(): Promise<string[]>;
      /** Spec 004 — create or overwrite a secret in THIS plugin's namespace.
       *  Present only when the manifest declares `permissions.secrets.runtime_write`
       *  (otherwise `undefined`). Used by runtime credential-acquisition flows to
       *  persist an acquired secret (e.g. a GitHub App private key). Cannot reach
       *  another plugin's namespace. Guard with `if (ctx.secrets.set)`. */
      set?(key: string, value: string): Promise<void>;
      /** Spec 004 — remove a secret from this plugin's namespace. No-op if absent.
       *  Present only with `permissions.secrets.runtime_write`. */
      delete?(key: string): Promise<void>;
  }
  /**
   * Write-capable secrets accessor. The kernel only hands this out inside an
   * `onMigrate` hook — normal plugin code receives the read-only `SecretsAccessor`.
   * Scope is the same (per-plugin namespace); a migration cannot reach other
   * plugins' secrets.
   */
  export interface SecretsReadWriteAccessor extends SecretsAccessor {
      /** Create or overwrite a secret. */
      set(key: string, value: string): Promise<void>;
      /** Remove a secret. No-op if absent. */
      delete(key: string): Promise<void>;
  }
  export interface ConfigAccessor {
      /** Returns the config value, or undefined if not present. */
      get<T = unknown>(key: string): T | undefined;
      /** Returns the config value, or throws a MissingConfigError. */
      require<T = unknown>(key: string): T;
      /** Spec 004 — persist a NON-secret config value to this plugin's own
       *  installed-registry config. The key MUST be a declared, non-secret setup
       *  field (secrets go through `secrets.set`). Present only when the manifest
       *  declares `permissions.secrets.runtime_write`. Guard with
       *  `if (ctx.config.set)`. */
      set?(key: string, value: unknown): Promise<void>;
  }
  /**
   * Accessor for delegating a single-turn natural-language question to another
   * agent registered in the host. Resolves the target via the kernel's service
   * registry (each agent's `DomainTool` is published as `subAgent:<agentId>`)
   * and runs the wrapped `LocalSubAgent.ask()` to completion.
   *
   * Lifetime: one `ask()` call is a complete sub-agent run from question to
   * final-text. There is no persistent session between calls — each call
   * constructs a fresh messages-array on the sub-agent side.
   *
   * Permission model (v1, opt-in):
   *   - Manifest must declare `permissions.subAgents.calls: ['<agentId>', ...]`
   *     (wildcards allowed: `'de.byte5.agent.*'`).
   *   - `ctx.subAgent` is `undefined` when the manifest entry is missing or
   *     empty.
   *   - At runtime, each `ask()` checks the resolved targetAgentId against
   *     the whitelist; mismatches throw `SubAgentPermissionDeniedError`.
   *   - Self-recursion (target === own agentId) throws
   *     `SubAgentRecursionError`. Indirect cycles (A→B→A) are not detected
   *     here in v1; LocalSubAgent.maxIterations is the backstop.
   *   - Per tool-handler invocation, a budget caps the number of calls
   *     (default 5, override via `permissions.subAgents.calls_per_invocation`).
   *     Exceeding it throws `SubAgentBudgetExceededError`.
   */
  export interface SubAgentAccessor {
      /**
       * Ask the named agent a question. Returns the final answer string.
       *
       * @param targetAgentId The full agent id, e.g. `'@omadia/agent-seo-analyst'`.
       * @param question Natural-language question. Forwarded as the first user
       *   message to the sub-agent.
       * @throws {UnknownSubAgentError} no such agent registered in the host
       * @throws {SubAgentPermissionDeniedError} target not in manifest whitelist
       * @throws {SubAgentRecursionError} target === own agentId
       * @throws {SubAgentBudgetExceededError} per-invocation call budget exhausted
       */
      ask(targetAgentId: string, question: string): Promise<string>;
      /** Whether a given target agent is currently reachable (registered in
       *  the kernel's service registry). Permission filter is NOT applied —
       *  use this to introspect what's installed. */
      has(targetAgentId: string): boolean;
      /** Snapshot of every reachable target agentId (no permission filter). */
      list(): readonly string[];
  }
  export class UnknownSubAgentError extends Error {
      constructor(callerAgentId: string, targetAgentId: string);
  }
  export class SubAgentPermissionDeniedError extends Error {
      constructor(callerAgentId: string, targetAgentId: string);
  }
  export class SubAgentRecursionError extends Error {
      constructor(agentId: string);
  }
  export class SubAgentBudgetExceededError extends Error {
      constructor(callerAgentId: string, budget: number);
  }
  /**
   * Plugin-facing knowledge-graph accessor. Wraps the host's `knowledgeGraph`
   * service with namespace-validation on writes, and exposes a curated subset
   * of read methods. Plugins MUST declare their custom system namespaces in
   * `manifest.permissions.graph.entity_systems` to enable writes; the builtin
   * systems `'odoo'` and `'confluence'` are reserved for the host integrations
   * and rejected for plugin-side ingest even if listed.
   *
   * Why a wrapper?
   *   1. Auditable: ops can inspect every plugin's declared entity_systems
   *      without grepping plugin source.
   *   2. Defensive: a plugin bug that constructs `system: 'odoo'` (e.g. typo,
   *      copy-paste) cannot silently corrupt the Odoo namespace.
   *   3. Symmetric: parallels `SubAgentAccessor` (whitelist + permission
   *      errors) and `MemoryAccessor` (scope-isolation).
   *
   * Read methods (searchTurns, findEntityCapturedTurns, getNeighbors, stats)
   * pass through unchanged — read access is governed by `permissions.graph.reads`
   * which lives separately and is not yet enforced at the kernel boundary.
   */
  export interface KnowledgeGraphAccessor {
      /**
       * Persist entities into the graph as `PluginEntity` nodes (system, model,
       * id, displayName, extras). Each `system` string MUST be in the
       * manifest's `permissions.graph.entity_systems` list, otherwise throws
       * `KgEntityNamespaceError`.
       */
      ingestEntities(entities: EntityIngest[]): Promise<EntityIngestResult>;
      /**
       * Persist atomic facts. `mentionedEntityIds` may reference entities the
       * plugin previously ingested OR entities owned by other systems (the KG
       * tolerates dangling references). The `subject`/`predicate`/`object`
       * fields are free-form strings — no validation here, but the kernel may
       * truncate over-long values defensively in a future pass.
       */
      ingestFacts(facts: FactIngest[]): Promise<FactIngestResult>;
      /** Full-text search over Turn nodes. Read-only, no namespace check. */
      searchTurns(opts: SearchTurnsOptions): Promise<TurnSearchHit[]>;
      /** Entity-anchored Turn lookup. Read-only, no namespace check. */
      findEntityCapturedTurns(opts: EntityCapturedTurnsOptions): Promise<EntityCapturedTurnsHit[]>;
      /** Direct neighbours of a node. Read-only, no namespace check. */
      getNeighbors(nodeId: string): Promise<GraphNode[]>;
      /** Coarse counts for the UI / sanity checks. */
      stats(): Promise<GraphStats>;
      /** The namespaces this accessor was created with. Useful for plugin-side
       *  introspection (e.g. choosing a default namespace when there's only one). */
      readonly entitySystems: readonly string[];
  }
  export class KgEntityNamespaceError extends Error {
      constructor(callerAgentId: string, system: string);
  }
  export class KgServiceUnavailableError extends Error {
      constructor(callerAgentId: string);
  }
  /**
   * Plugin-facing accessor for the host's LLM. Wraps the host's Anthropic
   * client (or any future provider) with manifest-declared model-whitelist
   * and per-invocation call-budget. The host pays the bill — plugins do NOT
   * bring their own API keys.
   *
   * Cost-control:
   *   - `models_allowed` whitelist (with `*`-suffix wildcard) limits which
   *     models the plugin can target. Helps the operator pin a fast/cheap
   *     model for an analytics plugin while keeping Opus available for the
   *     orchestrator.
   *   - `calls_per_invocation` (default 5) caps total calls per
   *     `createPluginContext` lifetime — analogous to SubAgentAccessor.
   *   - `max_tokens_per_call` (default 4096) silently clamps `req.maxTokens`
   *     down to the manifest cap (no throw — predictable plugin code).
   */
  export interface LlmAccessor {
      complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>;
      /** Snapshot of the model whitelist for plugin-side introspection. */
      readonly modelsAllowed: readonly string[];
  }
  export interface LlmCompleteRequest {
      /** Anthropic model id (e.g. `'claude-haiku-4-5'`, `'claude-sonnet-4-6'`).
       *  MUST match the manifest whitelist or `LlmModelNotAllowedError` throws. */
      readonly model: string;
      /** Optional system prompt. Forwarded verbatim to Anthropic. */
      readonly system?: string;
      /** Conversation messages. Plain strings only in v1 — content blocks
       *  (image, document) are a v2 add-on. */
      readonly messages: ReadonlyArray<{
          readonly role: 'user' | 'assistant';
          readonly content: string;
      }>;
      /** Cap on output tokens. Silently clamped to
       *  `permissions.llm.max_tokens_per_call` when manifest sets a smaller cap. */
      readonly maxTokens?: number;
      readonly temperature?: number;
      /** Reasoning effort (normalized, mirrors `@omadia/llm-provider-api`
       *  `EffortLevel`). Providers/models without the knob ignore it. */
      readonly effort?: 'low' | 'medium' | 'high' | 'xhigh';
      /** `'off'` = no extended reasoning where the model allows it (a hint,
       *  ignored elsewhere — pair it with `effort: 'low'`). For latency-critical
       *  single calls. */
      readonly thinking?: 'off';
      /**
       * Ask for a schema-constrained JSON response (#1219) instead of instructing
       * the model to emit JSON in the prompt.
       *
       * `schema` is a JSON Schema object, forwarded to the provider untouched.
       * Providers that have no such channel IGNORE it rather than failing, so a
       * plugin must still parse the result tolerantly — this narrows the output,
       * it does not guarantee it everywhere.
       *
       * On Anthropic the call FAILS (HTTP 400) for a model without
       * structured-output support, and for a schema using keywords the API cannot
       * compile: `minimum`/`maximum`, `minLength`/`maxLength`, or an object
       * without `additionalProperties: false`. Nothing validates the schema before
       * it is sent. And a refusal ({@link LlmCompleteResult.refusal}) still returns
       * normally — its `text` need not match the schema.
       */
      readonly outputFormat?: {
          readonly type: 'json_schema';
          readonly schema: Record<string, unknown>;
      };
      /**
       * Tools the model may call (1.44.0). Plugins use them for structured
       * output: define ONE tool whose `inputSchema` is the wanted shape and force
       * it with {@link LlmCompleteRequest.toolChoice}; the call's input comes back
       * parsed in {@link LlmCompleteResult.toolCalls}. Unlike `outputFormat`, a
       * tool `inputSchema` needs no `additionalProperties: false` — free-form
       * objects are allowed. The host runs no tool loop: a call is returned, never
       * executed.
       */
      readonly tools?: ReadonlyArray<LlmToolDefinition>;
      /**
       * Force a call of the named tool (1.44.0) — the answer is then that tool
       * call, with no prose. A provider or model that cannot force a tool (on
       * Anthropic e.g. `claude-opus-5-5`) degrades to "the model may call it",
       * so a plugin must still accept a text-only answer. Forcing a tool is
       * incompatible with extended thinking on Anthropic: pair it with
       * `thinking: 'off'`.
       */
      readonly toolChoice?: {
          readonly name: string;
      };
  }
  /** A tool definition for {@link LlmCompleteRequest.tools} (1.44.0). */
  export interface LlmToolDefinition {
      readonly name: string;
      readonly description: string;
      /** JSON Schema of the tool input, forwarded to the provider untouched. */
      readonly inputSchema: Record<string, unknown>;
  }
  /** One tool call of the model's answer (1.44.0). */
  export interface LlmToolCall {
      readonly name: string;
      /** the tool input as the provider parsed it (normally a JSON object) */
      readonly input: unknown;
  }
  /** One discovered MCP tool, as the host's manager reports it (issue #458). */
  export interface McpAccessorToolDescriptor {
      readonly name: string;
      readonly description?: string;
      readonly inputSchema?: Record<string, unknown>;
  }
  /**
   * Host-pooled MCP access for plugins (epic #459 W5, issue #458). Server ids
   * are the host's `mcp_servers` ids; only operator-granted servers resolve —
   * everything else throws `McpServerNotGrantedError`-shaped errors as plain
   * `Error` (plugin-api stays dependency-free). `callTool` mirrors the host
   * manager's contract: it never throws on tool failure, it returns an
   * `Error: …` string (including scan-policy denials).
   */
  export interface McpAccessor {
      /** Server ids the operator has granted to this plugin. */
      listServers(): Promise<readonly string[]>;
      listTools(serverId: string): Promise<readonly McpAccessorToolDescriptor[]>;
      callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<string>;
  }
  export interface LlmCompleteResult {
      /** Concatenated text content of the assistant turn. Tool-use finish reasons
       *  produce empty `text` — plugins should branch on `finishReason` if they
       *  enable tool-use (which is uncommon at the plugin layer; the orchestrator
       *  handles tool-loops itself). */
      readonly text: string;
      readonly model: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
      /** Provider-neutral completion-end signal — branch on THIS, not the legacy
       *  vendor `stopReason`. `end_turn`/`stop_sequence` collapse to `'stop'`;
       *  `tool_use` → `'tool_calls'`. A refusal is a `'stop'` too: check
       *  {@link LlmCompleteResult.refusal} before treating an empty or short
       *  `text` as the model's answer. Always populated by the host. */
      readonly finishReason: 'stop' | 'tool_calls' | 'max_tokens';
      /**
       * @deprecated Anthropic-specific stop reason, kept for v1 back-compat. Use
       * `finishReason` instead — it is provider-neutral. Still populated by the
       * host (the Anthropic adapter passes its raw value through) and remains
       * valid for installs pinned to Anthropic. `'refusal'` (1.22.0) when the
       * model's safety classifiers declined the request — formerly reported as
       * `'end_turn'`.
       */
      readonly stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'refusal';
      /**
       * Set when the model's safety classifiers declined the request (#1219). The
       * call still succeeds, but `text` is then empty or only a fragment — not an
       * answer. `category` is the provider's reason (`bio`, `cyber`, …), an OPEN
       * set that may be absent: never switch on it exhaustively. Absent on every
       * other outcome.
       */
      readonly refusal?: {
          readonly category?: string;
      };
      /** The model's tool calls (1.44.0), present only when the request offered
       *  {@link LlmCompleteRequest.tools} and the model called at least one. */
      readonly toolCalls?: ReadonlyArray<LlmToolCall>;
  }
  export class LlmServiceUnavailableError extends Error {
      constructor(callerAgentId: string);
  }
  export class LlmModelNotAllowedError extends Error {
      constructor(callerAgentId: string, model: string);
  }
  export class LlmBudgetExceededError extends Error {
      constructor(callerAgentId: string, budget: number);
  }
  /**
   * Provider contract — ServiceRegistry-keyed under `'llm'`. The host
   * registers an instance backed by its Anthropic client; the plugin-side
   * `LlmAccessor` resolves it lazily on first complete() call.
   */
  export interface LlmProvider {
      complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>;
  }
  export class MissingSecretError extends Error {
      constructor(agentId: string, key: string);
  }
  export class MissingConfigError extends Error {
      constructor(agentId: string, key: string);
  }
  /**
   * Context passed to `onMigrate` when a plugin package is uploaded in a new
   * version while the previous version is still installed. The hook returns the
   * new config that replaces the old one in the InstalledRegistry atomically on
   * success — or throws to abort the upload (old version stays active).
   *
   * Lifetime: the hook runs synchronously during the zip-upload flow, BEFORE the
   * v2 package swap becomes visible to the runtime. Any `ctx.secrets.set(...)` /
   * `ctx.memory.writeFile(...)` calls succeed immediately (there is no queue
   * that rolls back). If the hook throws after some writes already happened,
   * those writes are visible — the plugin author is responsible for keeping
   * migrations idempotent (re-running a partially applied migration should be a
   * no-op rather than a double-apply).
   *
   * The hook's return value MUST be JSON-serialisable — the registry persists it
   * verbatim. Secret-shaped values should be stored via `ctx.secrets.set(...)`
   * and referenced by key in the config, not inlined into newConfig.
   */
  export interface MigrationContext extends Omit<PluginContext, 'secrets'> {
      /** Manifest version that is currently installed (being replaced). */
      readonly fromVersion: string;
      /** Manifest version coming in via the upload. */
      readonly toVersion: string;
      /** Snapshot of the v1 config from InstalledRegistry at the moment the hook
       *  fires. Read-only — returning a mutated copy would be lost. */
      readonly previousConfig: Record<string, unknown>;
      /** Secrets accessor with `set`/`delete`, scoped to this plugin. Read-only
       *  plugin code (activate, tools) never gets this variant. */
      readonly secrets: SecretsReadWriteAccessor;
  }
  /** Return value of an `onMigrate` hook. */
  export interface MigrationResult {
      /** Replaces the plugin's config in InstalledRegistry. Must be JSON-serialisable.
       *  If the migration does not touch config, return `previousConfig` unchanged. */
      newConfig: Record<string, unknown>;
  }
  /** Signature a plugin exports for migrations. Opt-in — absence means the
   *  kernel carries over `previousConfig` 1:1. */
  export type MigrationHook = (ctx: MigrationContext) => Promise<MigrationResult>;
  /** Default timeout for an `onMigrate` invocation. Overridable per plugin via
   *  `manifest.lifecycle.onMigrate.timeout_ms`. */
  export const MIGRATION_TIMEOUT_MS_DEFAULT = 10000;
  export class MigrationTimeoutError extends Error {
      constructor(agentId: string, fromVersion: string, toVersion: string, timeoutMs: number);
  }
  export class MigrationHookError extends Error {
      readonly migrationCause: unknown;
      constructor(agentId: string, fromVersion: string, toVersion: string, cause: unknown);
  }
  /**
   * The shape of `permissions.sql` in a plugin manifest.
   *
   * ```yaml
   * permissions:
   *   sql:
   *     migrations: migrations   # optional; directory inside the package
   *     ledger: omadia_verifier_migrations
   *     handoff: handoff-plan.json  # optional; run before `migrations`
   * ```
   */
  export interface SqlPermission {
      /** Directory (relative to the package root) holding `*.sql` / `*.js` /
       *  `*.mjs` migration files. Defaults to `migrations`. When the manifest
       *  declares it, the kernel runs the directory automatically at activate. */
      readonly migrations?: string;
      /** The plugin-owned table recording which migrations have been applied.
       *  Must match `^[a-z][a-z0-9_]{2,62}$` AND begin with the plugin's sanitized
       *  id, so a manifest cannot nominate another plugin's ledger. */
      readonly ledger: string;
      /**
       * Path (relative to the package root) to a JSON ledger-handoff plan the
       * kernel runs BEFORE {@link SqlPermission.migrations} — epic #470 C15.
       *
       * ```json
     * {
     *   "entries": [
     *     { "filename": "0001_x.js", "witnessSql": "SELECT to_regclass('public.x') IS NOT NULL" }
     *   ],
     *   "dryRun": false
       * }
       * ```
       *
       * Same shape {@link SqlAccessor.seedLedger} accepts, and the same shape the
       * operator CLI (`middleware/scripts/plugin-ledger-handoff.mjs --plan`)
       * reads, so one file serves all three readers. A shared file MAY carry
       * `"dryRun": false`; `"dryRun": true` is refused on the kernel-run path.
       * Preview mode belongs to the CLI flag, not to plugin data: if core read a
       * plan that asked it to "write nothing", then core's own migration runner
       * would immediately apply every file underneath it, silently recreating the
       * exact "0 seeded, 9 already seeded" failure C15 exists to remove.
       *
       * DECLARE THIS RATHER THAN CALLING `seedLedger` YOURSELF when the manifest
       * also declares `migrations`. The kernel runs that directory before your
       * `activate()`, so a `seedLedger` call inside `activate()` arrives after
       * every ledger row is already written and can only ever report
       * `alreadySeeded` — the `skippedNoWitness` alarm never fires. Keeping the
       * in-`activate` call as well is safe and is the right fallback for older
       * kernels, where it does the work instead.
       */
      readonly handoff?: string;
  }
  /** What one `runMigrations` pass did. Returned rather than logged so a plugin
   *  (and a test) can assert on it instead of grepping stdout. */
  export interface MigrationReport {
      /** Filenames applied by THIS pass, in the order they ran. */
      readonly applied: readonly string[];
      /** Filenames already in the ledger and therefore not re-run. */
      readonly skipped: readonly string[];
      /** The ledger table the pass wrote to — echoed back so a caller that took
       *  the default cannot misreport which table it touched. */
      readonly ledger: string;
      /** Wall-clock duration of the pass, including lock wait. */
      readonly durationMs: number;
  }
  /** Options for one `ctx.sql.runMigrations()` call. Every field is optional —
   *  the manifest already carries the answers. */
  export interface RunMigrationsOptions {
      /** Override the manifest's `permissions.sql.migrations` directory. Still
       *  resolved inside the package root and rejected if it escapes. */
      readonly dir?: string;
      /**
       * Accept a file whose content changed after it was applied.
       *
       * Off by default, and the default is the point: an edited migration means
       * the database and the package disagree about what ran, and every
       * environment that already applied the old bytes is now silently different
       * from every environment that applies the new ones. The escape hatch exists
       * for the one legitimate case — a cosmetic edit (a comment, a reformat) the
       * author has verified is semantically identical.
       */
      readonly allowChecksumDrift?: boolean;
  }
  /** One file's claim on the core ledger, and the proof that backs it. */
  export interface LedgerSeedEntry {
      /** The plugin's OWN migration filename, exactly as it ships. Matched against
       *  the core ledger by stem, so `0022_x.js` adopts core's `0022_x.sql`. */
      readonly filename: string;
      /**
       * A single-row, single-column boolean SELECT that is true only when this
       * file's schema object exists.
       *
       * SQL text rather than a callback on purpose. A callback cannot be printed,
       * and the whole value of `dryRun` is that an operator reads the plan — WHICH
       * query proved WHICH file — before a production handoff writes anything.
       *
       * It must be safe against a database where the objects are missing, which is
       * the case it exists to detect: `to_regclass('public.t') IS NOT NULL` is
       * safe, `'public.t'::regclass` throws. Prefer catalog lookups over casts.
       */
      readonly witnessSql: string;
  }
  /** Options for one `ctx.sql.seedLedger()` call. */
  export interface SeedLedgerOptions {
      /** The files to consider. A file absent from this list is never seeded. */
      readonly entries: readonly LedgerSeedEntry[];
      /** Compute and report the plan; write nothing. Defaults to false. */
      readonly dryRun?: boolean;
      /** Override the manifest's migrations directory, as `runMigrations` does. */
      readonly dir?: string;
  }
  /** What one `seedLedger` pass did, or — under `dryRun` — would have done. */
  export interface LedgerSeedReport {
      /** Written into this plugin's ledger by this pass. */
      readonly seeded: readonly string[];
      /** Everything `runMigrations` still has to apply afterwards. Superset of
       *  {@link LedgerSeedReport.skippedNoWitness}. */
      readonly applied: readonly string[];
      /** The subset that should worry you: the core ledger records these, but
       *  their witness says the schema object is not there. Empty on a healthy
       *  installation; non-empty means a restore or a rollback, and the migration
       *  runner is about to repair it. */
      readonly skippedNoWitness: readonly string[];
      /** Already in this plugin's ledger before the pass — a re-run, or a peer
       *  replica that got there first. */
      readonly alreadySeeded: readonly string[];
      /** Which requested files the core ledger actually records. Reported, not
       *  obeyed. */
      readonly donorRecorded: readonly string[];
      /** This plugin's ledger table. */
      readonly ledger: string;
      /** The core ledger the rows were read from. Core-supplied — a plugin does
       *  not name it and cannot choose it. */
      readonly donorLedger: string;
      readonly dryRun: boolean;
      readonly durationMs: number;
  }
  /** Plugin-facing migration runner. See {@link PluginContext.sql}. */
  export interface SqlAccessor {
      /** The ledger table this plugin owns, as resolved from its manifest. */
      readonly ledger: string;
      /**
       * Apply every not-yet-applied migration in the plugin's migrations
       * directory, in filename order, inside ONE transaction held under an
       * advisory lock keyed on the ledger.
       *
       * `.sql` files are executed verbatim. `.js` / `.mjs` files must
       * `export default async (client) => { … }` and receive the same
       * transaction-bound client — that is the codegen target described in
       * `implementation.md` D6, where a plugin compiles its `.sql` into JS.
       *
       * Throws rather than returning a partial result: an empty directory
       * ({@link SqlMigrationError}) is a misconfiguration, and a checksum change
       * on an already-applied file is a divergence. Both are conditions where
       * continuing quietly is worse than failing loudly.
       */
      runMigrations(opts?: RunMigrationsOptions): Promise<MigrationReport>;
      /**
       * Adopt an existing installation's schema: record files as applied when a
       * witness proves the schema object they create is already there.
       *
       * Call this BEFORE {@link SqlAccessor.runMigrations}, and guard it — the
       * method was added in plugin-api 1.3.0 and is `undefined` on an older core,
       * where the correct behaviour is simply to let `runMigrations` apply the
       * (idempotent) files:
       *
       * ```ts
       * await ctx.sql.seedLedger?.({ entries: HANDOFF_ENTRIES });
       * await ctx.sql.runMigrations();
       * ```
       *
       * Never deletes anything from the core ledger. Those rows are the rollback
       * path: while core still ships the same files, removing them would make
       * core's own migrator re-run them on the next boot.
       */
      seedLedger?(opts: SeedLedgerOptions): Promise<LedgerSeedReport>;
  }
  /**
   * Thrown when a plugin reaches for a database capability it has not been
   * cleared for.
   *
   * Deliberately distinct from {@link ServiceNotDeclaredError}: that one means
   * "your manifest is missing a line", which the plugin author fixes alone. This
   * one can additionally mean "the operator has not agreed", which the author
   * cannot fix at all — so the two must not be reported the same way.
   */
  export class SqlPermissionError extends Error {
      readonly pluginId: string;
      readonly capability: string;
      /** `undeclared` → the manifest lacks `permissions.sql`.
       *  `ungranted`  → declared, but no operator grant is on record. */
      readonly reason: 'undeclared' | 'ungranted';
      constructor(pluginId: string, capability: string, reason: 'undeclared' | 'ungranted');
  }
  /**
   * Thrown when a manifest nominates a ledger table this plugin may not own.
   *
   * The name is interpolated into DDL as a quoted identifier, so it is also the
   * one plugin-supplied string in this subsystem that reaches SQL outside a bind
   * parameter. It is validated against a charset allowlist BEFORE it is quoted,
   * never by escaping afterwards — an allowlist that rejects `"` cannot be
   * defeated by a cleverer `"`.
   */
  export class LedgerNameError extends Error {
      readonly pluginId: string;
      readonly ledger: string;
      constructor(pluginId: string, ledger: string, why: string);
  }
  /** Thrown for migration-run failures that are the plugin package's fault:
   *  an empty or missing directory, or a file whose bytes changed after it was
   *  applied. Both are recoverable by fixing the package, which is why they are
   *  one type and not folded into a generic Error. */
  export class SqlMigrationError extends Error {
      readonly pluginId: string;
      readonly ledger: string;
      constructor(pluginId: string, ledger: string, why: string);
  }

  // ──────────────────────────────────────────────────────────────────────
  // toolErrorNotice.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * The withheld tool-error notice — the text a model receives in place of an
   * exception message.
   *
   * An exception message is not sanitized text. An ORM echoes the failing row, a
   * driver echoes the bound parameters, an HTTP client echoes the response body:
   * `Fault: Invalid field 'x' on record {'name': 'Jane Doe', 'email': …}` is an
   * ordinary Odoo error. Handing that string to the model as a tool result puts
   * whatever the failing layer was holding on the provider wire, into the chat
   * transcript and into the persisted session — behind the Privacy Shield's back,
   * because the shield only ever sees what a tool RETURNS.
   *
   * So the policy follows provenance: a message that came out of an exception is
   * never a tool result. The model gets the exception's class name, a sanitised
   * error code (a Postgres SQLSTATE such as `22P02`, a Node `ECONNREFUSED`, a
   * numeric XML-RPC fault code) and a log reference. The full error — message,
   * stack, cause — goes to the server log under that reference, where an operator
   * debugging their own integration finds it.
   *
   * Two kinds of producer build this notice:
   *  - the kernel's dispatch seams (`@omadia/orchestrator`, `toolErrorRedaction`)
   *    for an exception a tool handler THREW, with the turn id as the reference;
   *  - tool wrappers that catch an exception themselves and would otherwise
   *    return `Error: ${err.message}` ({@link toolErrorFromException}), with a
   *    fresh per-error reference.
   *
   * The notice keeps the `Error:` prefix, so the dispatch loops still derive
   * `is_error` from it and {@link isControlFlowToolResult} still recognizes it.
   *
   * An exception says nothing about how far the call got: a write can commit
   * upstream and its response then time out. So the notice tells the model the
   * outcome is unknown and not to repeat a call that changes data, and a
   * sub-agent loop refuses an identical repeat of a call that ended this way
   * ({@link isWithheldToolErrorNotice}).
   *
   * One kind of exception is written FOR the model: a refusal
   * ({@link ToolRefusalError}, and the kernel's own `ctx.http` permission errors).
   * The tool did not carry the call out, and its message says why and what an
   * operator can change. That message reaches the model as a refusal notice
   * ({@link refusedToolErrorNotice}) — without the "outcome is unknown" clause,
   * because nothing happened. It is still an `Error:` result, so the dispatch
   * seams run it through the Privacy Shield's free-text redactor like any other
   * returned error text.
   */
  /** What of an exception may reach a model: its class name and a sanitised code. */
  export interface ThrownErrorDescription {
      /** `err.name` when it is a plain identifier, otherwise `'Error'`. */
      readonly name: string;
      /** `err.code` (or `err.faultCode`) when it is a short plain token. */
      readonly code?: string;
  }
  /**
   * Describe a caught value by its class name and code only. Never reads the
   * message, never stringifies a non-Error throw (a thrown string IS a message).
   */
  export function describeThrownError(err: unknown): ThrownErrorDescription;
  /**
   * A fresh log reference for one withheld error: `err_` plus 12 hex digits. It
   * starts with a letter and contains no separator, so no word-boundary-anchored
   * PII pattern (phone, id number) can match inside it — a notice carrying it
   * passes a later redaction pass byte-identical.
   */
  export function newToolErrorRef(): string;
  /**
   * The model-facing text for a withheld exception. PII-free by construction:
   * the tool name the caller dispatched, the class name, a sanitised code, and
   * the log reference.
   */
  export function withheldToolErrorNotice(toolName: string, err: unknown, ref: string): string;
  /**
   * True when `text` is a notice {@link withheldToolErrorNotice} built: a tool
   * call that ended in an exception, so whether it took effect is unknown. The
   * kernel's sub-agent loop uses it to refuse an identical repeat of a call
   * whose wrapper caught the exception itself ({@link toolErrorFromException}).
   *
   * Recognised by its shape, which any tool can imitate. Use it only to RESTRICT
   * what happens next, never to exempt a text from a check.
   */
  export function isWithheldToolErrorNotice(text: string): boolean;
  export interface ToolErrorFromExceptionOptions {
      /** Log reference. Default: a fresh {@link newToolErrorRef}. */
      readonly ref?: string;
      /** Log prefix naming the producer, e.g. `dynamic-agent`. Default `tool`. */
      readonly site?: string;
      /**
       * Where the FULL error goes. Default `console.error`. `null` when the caller
       * logs the error itself (it must then log the same `ref`).
       */
      readonly log?: ((line: string, err: unknown) => void) | null;
  }
  /**
   * For a tool wrapper that catches an exception and must answer with a tool
   * result: logs the full error under a reference and returns the withheld
   * notice. Use this instead of `Error: ${err.message}`. A refusal — a
   * {@link ToolRefusalError} or a kernel `ctx.http` permission error — is the
   * exception: its message was written for the model, so it comes back as the
   * refusal notice ({@link refusedToolErrorNotice}) and is still logged under the
   * ref.
   */
  export function toolErrorFromException(toolName: string, err: unknown, options?: ToolErrorFromExceptionOptions): string;
  /** The `name` a {@link ToolRefusalError} carries, and the one it is recognised by. */
  export const TOOL_REFUSAL_ERROR_NAME = "ToolRefusalError";
  /** Longest refusal text a notice carries; the rest is cut. */
  export const MAX_REFUSAL_MESSAGE_CHARS = 600;
  /**
   * A tool refusing a call, with a message written for the model.
   *
   * Throw it when the tool did NOT carry the call out (nothing was read from or
   * written to anything upstream) and the reason is something the model can act
   * on or tell the user: a host the audit mode forbids, a target that could not
   * be reached, a precondition the operator has to change. The message reaches
   * the model as written (one line, trimmed to {@link MAX_REFUSAL_MESSAGE_CHARS},
   * control characters removed; a message with line breaks stays withheld)
   * instead of the withheld notice, so write it yourself and keep it free of
   * data: no record, no response body, no upstream error text. Because nothing
   * was carried out, the model is not told the outcome is unknown, and a
   * sub-agent may repeat the call. Every other exception stays withheld.
   *
   * Recognised by its `name`, not by `instanceof`: a plugin bundles its own copy
   * of this package, and a plugin that must run on a host older than plugin-api
   * 1.28.0 can throw `Object.assign(new Error(msg), { name: 'ToolRefusalError' })`
   * instead of importing the class. An older host withholds it like any error.
   */
  export class ToolRefusalError extends Error {
      constructor(message: string, options?: {
          readonly cause?: unknown;
      });
  }
  /**
   * The message of a caught value when it is written for the model: a
   * {@link ToolRefusalError} (by name) or one of the kernel's `ctx.http`
   * permission errors (by name and message shape). `undefined` for anything else,
   * which stays withheld. The returned text is cleaned and bounded.
   */
  export function modelReadableToolErrorMessage(err: unknown): string | undefined;
  /** True for a {@link ToolRefusalError}, recognised by `name`. */
  export function isToolRefusalError(err: unknown): boolean;
  /**
   * The model-facing text for a refused call: the tool name and the refusal's
   * own message. No "outcome is unknown" clause — the call was not carried out.
   * `message` must already be cleaned ({@link modelReadableToolErrorMessage}).
   */
  export function refusedToolErrorNotice(toolName: string, message: string): string;
  /**
   * The model-facing text for a kernel `ctx.http` block the tool did not catch.
   * omadia refused that request, but the tool may have done something before it
   * (written a record, then failed to notify a host), so unlike a
   * {@link ToolRefusalError} the outcome stays unknown.
   */
  export function blockedToolErrorNotice(toolName: string, message: string): string;
  /** A readable notice for a caught value, and whether the call was refused
   *  before doing anything (`refused`) or its outcome stays unknown. */
  export interface ReadableToolErrorNotice {
      readonly text: string;
      readonly refused: boolean;
  }
  /**
   * The notice for an exception whose message may reach the model: a
   * {@link ToolRefusalError} ({@link refusedToolErrorNotice}, `refused: true`)
   * or a kernel `ctx.http` block ({@link blockedToolErrorNotice},
   * `refused: false`). `undefined` for every other exception, which stays
   * withheld ({@link withheldToolErrorNotice}).
   */
  export function readableToolErrorNotice(toolName: string, err: unknown): ReadableToolErrorNotice | undefined;
  /**
   * True when `text` is a notice for a call whose outcome is unknown: the
   * withheld notice ({@link isWithheldToolErrorNotice}) or a kernel block
   * ({@link blockedToolErrorNotice}). The kernel's sub-agent loop refuses an
   * identical repeat of such a call. Recognised by shape, which any tool can
   * imitate: use it only to RESTRICT what happens next.
   */
  export function isUnknownOutcomeToolErrorNotice(text: string): boolean;

  // ──────────────────────────────────────────────────────────────────────
  // limitSignal.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Runtime limit signal (plugin self-extension, Layer A — additive plugin-api).
   *
   * A Tier-3 tool that hits a *structural* wall at runtime — a server-side row
   * cap, an unsupported query operation, a truncated page — emits a structured
   * {@link LimitSignal} alongside its result instead of silently degrading. The
   * orchestrator surfaces the signal so the agent can decide to PROPOSE a
   * self-extension (a new tool that lifts the wall) rather than returning partial
   * data and pretending it was complete.
   *
   * This is the deterministic counterpart to the Dynamics aggregate-query
   * analysis (the `$top`=50 cap, missing `$apply`): the tool that hit the cap is
   * the one place that knows the exact shape of the limit, so it is the place
   * that declares it — no guessing downstream.
   *
   * Ships the TYPES + a pure constructor. The field is attached additively to
   * {@link import('./localSubAgentTool.js').LocalSubAgentToolResult.limitSignal};
   * classic consumers that only read `output` ignore it, exactly like the
   * `structured` envelope.
   */
  export type LimitSignalKind = 
  /** A server-side result cap was hit (e.g. OData `$top`=50, page size). */
  'row_cap'
  /** The result set was truncated mid-stream (cursor/nextLink not followed). */
   | 'page_truncated'
  /** The backend cannot express the requested operation (e.g. no `$apply`
   *  aggregation, no server-side group-by). */
   | 'unsupported_operation'
  /** A rate/quota limit forced an incomplete read. */
   | 'rate_limited'
  /** The tool needs a capability it does not currently have. */
   | 'missing_capability';
  /**
   * A structured description of a runtime limit a tool hit. Deliberately small
   * and free of remediation *code* — it points at WHAT was hit and (optionally)
   * a human-readable hint; turning that into a concrete extension proposal is the
   * agent's + operator's job, gated by the escalation guard.
   */
  export interface LimitSignal {
      readonly kind: LimitSignalKind;
      /** One-line, human-facing description of the limit. */
      readonly detail: string;
      /** The hard cap that was hit, when numeric (e.g. `50`). */
      readonly cap?: number;
      /** What was actually observed/available, when known (e.g. `8300` rows
       *  matched the filter but only `50` were returned). */
      readonly observed?: number;
      /** Optional remediation hint, free-form (e.g. `"use $apply aggregation"`). */
      readonly hint?: string;
  }
  /** Pure constructor — keeps the optional fields off the object when absent so
   *  equality checks in tests stay tight. */
  export function makeLimitSignal(kind: LimitSignalKind, detail: string, extra?: {
      cap?: number;
      observed?: number;
      hint?: string;
  }): LimitSignal;
  /**
   * Render a {@link LimitSignal} as a compact, machine-parseable note the agent
   * can read in the tool result. Deterministic and PII-free, so it is safe to
   * fold into a string that flows through the privacy data-plane. Returns the
   * empty string for an absent signal so callers can unconditionally append.
   */
  export function formatLimitSignalNote(signal: LimitSignal | undefined): string;
  /**
   * Append the limit note to a tool-result string, separated by a blank line.
   * No-op when there is no signal. Pure.
   */
  export function appendLimitSignalNote(output: string, signal: LimitSignal | undefined): string;

  // ──────────────────────────────────────────────────────────────────────
  // localSubAgentTool.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Sub-agent tool surface, shared between the kernel-side `LocalSubAgent`
   * runner (which consumes a list of tools) and any plugin that wants to
   * register a tool with that runner. The `harness-verifier` plugin's
   * `createGraphLookupTool` factory is the first plugin-side producer.
   *
   * The `input_schema` shape mirrors what Anthropic's `messages.create({
   * tools })` expects — duplicated here instead of importing the SDK type
   * to keep the seam loose (no plugin-api consumer needs to depend on the
   * Anthropic SDK).
   */
  export interface LocalSubAgentToolSpec {
      name: string;
      description: string;
      input_schema: {
          type: 'object';
          properties: Record<string, unknown>;
          required: string[];
      };
  }
  /**
   * Structured tool-result with optional postcondition-violation marker
   * (#130). `handle` returns either a bare string (legacy contract — all
   * existing plugins do this) or this shape when the bridge has run the
   * optional `output` Zod schema and detected a mismatch. The verifier
   * picks up `postcondition` and raises a `tool_postcondition` claim that
   * drives the existing correctionPrompt retry loop.
   */
  export interface LocalSubAgentToolResult {
      readonly output: string;
      readonly postcondition?: {
          readonly issues: readonly string[];
      };
      /**
       * Optional structured output (Omadia UI, additive). Ignored by the existing
       * `string | LocalSubAgentToolResult` downcast in the sub-agent runner; the
       * canvas orchestrator (PR-9) is the first consumer that threads it.
       */
      readonly structured?: StructuredToolOutput;
      /**
       * Optional runtime limit signal (plugin self-extension, Layer A — additive).
       * A tool that hits a structural wall (row cap, unsupported operation, …)
       * sets this so the orchestrator can surface "this result is bounded — a
       * self-extension could lift it" instead of the agent treating partial data
       * as complete. Ignored by the legacy `string | LocalSubAgentToolResult`
       * downcast. See `./limitSignal.js`.
       */
      readonly limitSignal?: LimitSignal;
  }
  /**
   * Optional structured-output envelope (Omadia UI, additive). The typed
   * alternative to embedding a `_pendingStructuredPayload` JSON sentinel inside
   * the `output` string: a canvas-aware tool can hand Tier 2 structured data
   * directly. Classic consumers read `output`; canvas-aware consumers read
   * `structured`. `kind` discriminates the payload so the consumer can narrow
   * `data` (e.g. `'structuredPayload'`, `'canvasTree'`).
   */
  export interface StructuredToolOutput {
      readonly kind: string;
      readonly data: unknown;
      /** optional human-facing prose (rendered by non-canvas consumers). */
      readonly prose?: string;
  }
  export interface LocalSubAgentTool {
      spec: LocalSubAgentToolSpec;
      handle(input: unknown): Promise<string | LocalSubAgentToolResult>;
      /**
       * Privacy-Shield v3 (stable-id tokenization, slice 1) — optional PII
       * field annotations. When present, the harness runs a stable-id
       * tokenization pass on the tool's raw result JSON BEFORE serialising
       * to string and BEFORE the NER-based detectors run. Each annotated
       * field gets a stable token of the form `«<TYPE>_<id>»` where
       * `<id>` is the value at `idPath`.
       *
       * Annotations live on the wrapper (not on `spec`) because Anthropic's
       * tool-spec contract rejects unknown fields and PII metadata is a
       * runtime concern, not a model-facing one.
       *
       * See `@omadia/plugin-api`'s `piiAnnotation.ts` for the full schema
       * and path-syntax rationale.
       */
      piiFields?: readonly ToolPIIField[];
  }

  // ──────────────────────────────────────────────────────────────────────
  // piiAnnotation.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Tool-side PII field annotations — Privacy-Shield v3 (stable-id
   * tokenization).
   *
   * Motivation
   * ----------
   * An earlier slice tokenized PII with an NER sidecar (Microsoft Presidio +
   * spaCy DE/EN) that ran *after* a tool had already serialized its result to a
   * string. German names tripped that detector in three failure modes that
   * surfaced in the live HR-routine v149..v152:
   *
   *   - Partial-name leaks: NER hits "Marvin" → `«PERSON_N»` but leaves
   *     "Vomberg" plaintext, producing rows like `«PERSON_53» Vomberg`.
   *   - Counter drift: every NER hit mints a fresh token, so the same
   *     employee can end up as `«PERSON_3»` in one row and `«PERSON_47»`
   *     in another within the same tool call — restoration aligns to
   *     positions, not identities, and table cells get the wrong name.
   *   - False-positive cascades: "Krankheit" → ADDRESS,
   *     "Abwesenheitstyp" → PERSON. Allowlists patch case-by-case but
   *     never exhaustively.
   *
   * Stable-id tokenization sidesteps all three: tools whose underlying
   * data store gives them a stable identifier per entity (e.g. Odoo
   * `employee_id`, Confluence `accountId`) declare the JSON path to
   * that identifier alongside the PII-bearing field. The privacy-guard
   * mints `«PERSON_<id>»` tokens deterministically from that id, so:
   *
   *   1. The whole value is masked as a single unit (no partial leak).
   *   2. The same identifier yields the same token across rows /
   *      paragraphs / tool calls within a turn (no doubles).
   *   3. Masking no longer depends on a probabilistic detector at all.
   *
   * The NER sidecar has since been removed entirely: redaction is now the
   * Privacy Shield v4 Data-Plane Boundary (@omadia/plugin-privacy-guard), which
   * interns every tool result into a server-held Dataset Store and lets only a
   * shape-classified, masked Digest cross the LLM wire. These tool-side
   * annotations remain the precise, id-anchored layer on top of that boundary.
   *
   * Annotations live on the *tool wrapper*, never on the spec sent to
   * the public LLM. Anthropic's `messages.create({ tools })` rejects
   * unknown fields on a tool spec — and PII metadata is a runtime
   * concern of the harness, not something the model needs to see.
   *
   * Path syntax
   * -----------
   * `path` and `idPath` are step sequences. Each step is one of:
   *
   *   - `key`   — descend into an object property (`name`, `partner`).
   *   - `[]`    — spread across every element of an array. May appear at
   *               the head of the path when the tool result is itself a
   *               top-level array (Odoo `search_read` → `[{…}]`).
   *   - `[N]`   — descend into a fixed array index. The motivating case
   *               is Odoo's many2one wire format `field: [id, label]`,
   *               where `field[1]` is the label and `field[0]` the id.
   *
   * Supported shapes:
   *
   *   - `"name"`                       — top-level object field
   *   - `"user.name"`                  — nested object
   *   - `"employees[].name"`           — array of objects, one per row
   *   - `"employees[].partner.name"`   — array of nested objects
   *   - `"[].name"`                    — TOP-LEVEL array of objects
   *   - `"[].employee_id[1]"`          — top-level array + many2one label
   *   - `"emails[]"`                   — array of leaf strings
   *
   * Both `path` and `idPath` must walk through the SAME number of `[]`
   * spreads in the same order so the two leaf lists zip 1:1 — e.g.
   * `[].employee_id[1]` pairs with `[].employee_id[0]`. Fixed `[N]`
   * indices do not multiply, so they need not match in count.
   *
   * For Odoo many2one fields, use the {@link odooMany2OnePiiField} and
   * {@link odooSearchReadPiiFields} helpers below instead of spelling
   * the `[id, label]` index paths out by hand.
   *
   * Type vocabulary
   * ---------------
   * Mirrors the `«TYPE_N»` token type set the LLM directive describes
   * (`PERSON`, `EMAIL`, `PHONE`, `IBAN`, `CARD`, `ADDRESS`, `ORG`,
   * `APIKEY`). Default is `PERSON` because that is by far the most
   * common annotation in HR / CRM tool results — the place stable-id
   * tokenization pays off most.
   */
  export type PIIFieldType = 'PERSON' | 'EMAIL' | 'PHONE' | 'IBAN' | 'CARD' | 'ADDRESS' | 'ORG' | 'APIKEY';
  export interface ToolPIIField {
      /** JSON path to the PII-bearing field, e.g. `"employees[].name"`. */
      readonly path: string;
      /**
       * JSON path to the stable identifier the privacy-guard uses as the
       * token DEDUP KEY, e.g. `"employees[].employee_id"`. Must walk
       * through the same `[]` spreads as `path`. The identifier is
       * stringified, so numeric ids (Odoo) and opaque strings (Confluence
       * `accountId`) both work. Same id → same token across rows; two
       * homonyms with different ids → distinct tokens. The id itself is
       * never embedded in the token name (the token stays `«TYPE_N»` with
       * a map-local counter), so it never crosses the wire.
       */
      readonly idPath: string;
      /** PII type. Defaults to `PERSON` when omitted. */
      readonly type?: PIIFieldType;
  }
  export interface OdooMany2OneOptions {
      /** PII type for the many2one label. Defaults to `PERSON`. */
      readonly type?: PIIFieldType;
      /**
       * Object path to the array of Odoo records. Defaults to `''` — the
       * records ARE the top-level array, which is what `search_read`
       * returns directly. Pass e.g. `"records"` when the tool wraps the
       * rows in an envelope: `{ records: [{…}], meta: {…} }`.
       */
      readonly recordsAt?: string;
  }
  /**
   * Build a {@link ToolPIIField} for a single Odoo many2one field.
   *
   * `odooMany2OnePiiField("employee_id")` →
   *   `{ path: "[].employee_id[1]", idPath: "[].employee_id[0]" }`
   *
   * The label (index 1) is the PII leaf that gets tokenised; the id
   * (index 0) is the stable identifier. A record whose relation is
   * empty (`employee_id: false`) contributes no leaf on either path,
   * so the 1:1 zip stays aligned and the record is simply skipped.
   */
  export function odooMany2OnePiiField(field: string, options?: OdooMany2OneOptions): ToolPIIField;
  /**
   * Build a {@link ToolPIIField} list for several Odoo many2one fields
   * at once. The common case for an HR / CRM `search_read` tool:
   *
   * ```ts
   * piiFields: odooSearchReadPiiFields({
   *   employee_id: 'PERSON',
   *   user_id: 'PERSON',
   *   partner_id: 'PERSON',
   * })
   * ```
   *
   * Pass `{ recordsAt: 'records' }` as the second argument when the
   * tool wraps the rows in an envelope object.
   */
  export function odooSearchReadPiiFields(fields: Readonly<Record<string, PIIFieldType>>, options?: Pick<OdooMany2OneOptions, 'recordsAt'>): ToolPIIField[];

  // ──────────────────────────────────────────────────────────────────────
  // selfExtend.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Plugin self-extension — the plugin-side SDK contract (additive, plugin-api).
   *
   * This is how a hand-written / side-loaded plugin (one WITHOUT a Builder
   * `AgentSpec` draft, e.g. an integration developed in its own repo and uploaded
   * as a ZIP) opts into operator-gated self-extension. The host cannot codegen a
   * new tool into an arbitrary repo — so the plugin itself ships the materialiser:
   *
   *   - `templates`  — declarative, parametric extension points the plugin
   *                    supports (id + params schema + the privilege sub-surface
   *                    each one needs). The host reads these to (a) offer them to
   *                    the operator and (b) prove `requires ⊆ manifest surface`
   *                    in the escalation guard, BEFORE anything is approved.
   *   - `apply()`    — given an APPROVED extension, the plugin's OWN code builds
   *                    the new tool(s) and registers them via `ctx.tools.register`,
   *                    using the SAME capability-scoped `ctx` it always had. The
   *                    non-escalation guarantee is therefore structural: the
   *                    plugin physically cannot exceed its manifest permissions.
   *
   * The host persists approved extensions per plugin and re-invokes `apply()` on
   * every activation, so a self-extension survives restarts without ever writing
   * into the (read-only) package directory.
   *
   * A plugin opts in by exporting `selfExtend` next to `activate`:
   *   export const selfExtend: SelfExtendContract = { templates: [...], apply };
   */
  /**
   * The privilege sub-surface a template needs, expressed in the SAME vocabulary
   * as the host's permission surface. Every field is OPTIONAL and defaults to
   * least-privilege; the host checks each listed item is covered by the plugin's
   * installed-manifest surface (wildcards honoured). Most read-only templates
   * (thin wrappers over an existing client) require NOTHING here.
   */
  export interface ExtensionRequiredSurface {
      readonly graphReads?: readonly string[];
      readonly graphWrites?: readonly string[];
      readonly graphEntitySystems?: readonly string[];
      readonly subAgentCalls?: readonly string[];
      readonly llmModels?: readonly string[];
      readonly networkOutbound?: readonly string[];
      readonly webScanner?: boolean;
  }
  /** A declarative, parametric extension point a plugin supports. */
  export interface ExtensionTemplate {
      /** Stable id, e.g. `"odata.delta"`. Referenced by an approved extension. */
      readonly id: string;
      readonly title: string;
      readonly description: string;
      /**
       * JSON-Schema for the `params` an operator/agent fills (the plugin validates
       * them in `apply`). Kept as a plain object so plugin-api stays validator-free.
       */
      readonly paramsSchema: Record<string, unknown>;
      /**
       * The privilege sub-surface this template needs. MUST be ⊆ the plugin's
       * installed-manifest surface — the escalation guard auto-denies otherwise.
       * Omit (or leave empty) for a template that only wraps existing capabilities.
       */
      readonly requires?: ExtensionRequiredSurface;
  }
  /** An operator-approved instantiation of a template. Persisted by the host and
   *  replayed into `apply()` on every activation. */
  export interface ApprovedExtension {
      readonly templateId: string;
      readonly params: Record<string, unknown>;
  }
  /**
   * The contract a self-extendable plugin exports as `selfExtend`. `apply` returns
   * a dispose handle the host calls on deactivation (symmetry with `activate`'s
   * close handle).
   */
  export interface SelfExtendContract {
      readonly templates: readonly ExtensionTemplate[];
      apply(approved: ApprovedExtension, ctx: PluginContext): Promise<() => void> | (() => void);
  }

  // ──────────────────────────────────────────────────────────────────────
  // pkce.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * RFC 7636 — PKCE helpers, exported as pure SDK functions (spec 004 FR-B4).
   *
   * Lifted from the kernel's `src/plugins/oauth/pkce.ts` so any plugin running
   * its own redirect flow (the GitHub App-Manifest dance, a device flow, a
   * bespoke OAuth client) can mint a verifier/challenge pair without reaching
   * back into the middleware. The kernel re-exports these same functions, so
   * there is a single implementation.
   *
   * Verifier is a high-entropy (32-byte) URL-safe base64 string; challenge is
   * the S256 hash of the verifier in URL-safe base64. Both are fully stateless —
   * the caller stores the verifier and sends the challenge through the IdP
   * round-trip.
   */
  /** Generate a fresh PKCE code-verifier. The caller MUST store this securely
   *  until the callback redeems the auth-code. */
  export function generateCodeVerifier(): string;
  /** Compute the S256 code-challenge for a verifier. The challenge is the value
   *  that goes into the authorize-URL; the verifier stays on the server. */
  export function computeCodeChallenge(verifier: string): string;

  // ──────────────────────────────────────────────────────────────────────
  // conversation.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * A single user/assistant exchange. Channels emit these as conversation
   * history; the orchestrator-extras topic-detector reads them; the kernel-
   * side ConversationHistoryStore stores them. The shape is the cross-package
   * contract — keep it stable.
   */
  export interface ConversationTurn {
      userMessage: string;
      assistantAnswer: string;
      /** Unix millis of the user message. Used for TTL + debug logs. */
      at: number;
  }

  // ──────────────────────────────────────────────────────────────────────
  // targetRef.ts
  // ──────────────────────────────────────────────────────────────────────

  /**
   * `TargetRef` — the single canonical way to address "a target" anywhere in the
   * Omadia UI canvas protocol. Beam targets, Class-D `_pendingMutation.target`,
   * `suggestedActions.target`, `surface_local_action.target` and
   * `surface_mutation_resolved` correlation all use this one discriminated union.
   *
   * Targets address data by STABLE id/hash, never by view position ("row 3 on
   * screen" is not addressable). Tier 1 resolves a `TargetRef` against its current
   * tree + view-state by switching on `kind`; an unknown `kind` is rejected.
   *
   * Additive: new to the plugin-api surface. No existing type references it; it is
   * a fresh shared contract consumed by the channel-sdk (`IncomingTurn.target`,
   * `surface_local_action`) and future canvas plugins.
   */
  export type TargetRef = {
      kind: 'canvas';
      canvasSessionId: string;
  } | {
      kind: 'container';
      containerId: string;
  }
  /** any non-data primitive (heading, divider, status, …) */
   | {
      kind: 'element';
      elementId: string;
  } | {
      kind: 'rowField';
      containerId: string;
      rowKey: string;
      fieldKey: string;
  }
  /** list / tree node */
   | {
      kind: 'item';
      containerId: string;
      itemKey: string;
  }
  /** chart data point */
   | {
      kind: 'point';
      containerId: string;
      pointKey: string;
  } | {
      kind: 'textRange';
      anchor: TextRangeAnchor;
  }
  /** pixel / canvas-region region */
   | {
      kind: 'region';
      region: BufferRegion;
  }
  /** whole-buffer reference (canvas-region / media) */
   | {
      kind: 'buffer';
      primitiveId: string;
      bufferContentHash: string;
  }
  /**
   * media / timeline trim / splice / scrub. `trackId` scopes to one track on a
   * multi-track timeline; `clipId` targets a specific clip on that track rather
   * than a raw time interval. For single-buffer media omit both; for a
   * multi-track timeline `trackId` is required and `clipId` optional.
   */
   | {
      kind: 'timeRange';
      primitiveId: string;
      bufferContentHash: string;
      start: number;
      end: number;
      unit: 'seconds' | 'samples' | 'frames';
      trackId?: string;
      clipId?: string;
  };
  /**
   * Stable anchor for a range within a `text` primitive. Naked numeric offsets are
   * unstable as soon as the text is patched, so the offsets are bound to a content
   * hash; on a hash miss the client re-anchors via `fallbackSegment`.
   */
  export interface TextRangeAnchor {
      /** the text primitive's containerId or elementId */
      primitiveId: string;
      /** sha256[:16] of the text primitive's content at anchoring time */
      contentHash: string;
      /** byte offset within that exact content */
      start: number;
      /** byte offset within that exact content */
      end: number;
      /** optional string snippets for re-resolution on a hash miss */
      fallbackSegment?: {
          /** ~32 chars of context before the selection */
          before: string;
          /** the selected text itself */
          selection: string;
          /** ~32 chars of context after the selection */
          after: string;
      };
  }
  /**
   * Region addressing on `canvas-region` and `media` buffers, in buffer-native
   * (not viewport / display) coordinates so zoom + pan do not invalidate it. A
   * `bufferContentHash` mismatch means the buffer changed and the region can no
   * longer be safely interpreted.
   */
  export interface BufferRegion {
      /** the canvas-region or media primitive's elementId */
      primitiveId: string;
      /** sha256[:16] of the buffer at anchoring time (resolution fails on mismatch) */
      bufferContentHash: string;
      /** axis-aligned bounding box in buffer pixels */
      bbox: {
          x: number;
          y: number;
          w: number;
          h: number;
      };
      /** optional shape for non-rect selections (lasso, magic-wand) */
      shape?: {
          kind: 'rect' | 'polygon' | 'mask';
          /** for 'polygon' */
          points?: Array<[number, number]>;
          /** for 'mask' — content-hash of a binary mask sized to bbox */
          maskHash?: string;
      };
  }

  // ──────────────────────────────────────────────────────────────────────
  // knowledgeGraph.ts (only the types the context above references)
  // ──────────────────────────────────────────────────────────────────────

  export interface GraphNode {
      id: string;
      type: GraphNodeType;
      props: Readonly<Record<string, unknown>>;
      entryType?: EntryType;
      visibility?: Visibility;
      tier?: Tier;
      accessedAt?: string | null;
      accessCount?: number;
      decayScore?: number;
      contentHash?: string | null;
      manuallyAuthored?: boolean;
      taskStatus?: TaskStatus | null;
      /** Significance score in [0, 1]; null = not classified yet (Phase 2). */
      significance?: number | null;
  }

  export type GraphNodeType = 'Session' | 'Turn' | 'OdooEntity' | 'ConfluencePage'
  /** OB-29-2 — generic plugin-namespaced entity. system+model+id live in
   *  `props`; the namespace string is what the plugin declared in its
   *  manifest's `permissions.graph.entity_systems`. */
   | 'PluginEntity'
  /** Slice 1b — channel-agnostic Omadia identity (cluster root). */
   | 'User'
  /** Slice 1b — channel-bound leaf node carrying raw platform id +
   *  optional verified email for cross-channel cluster-merge. */
   | 'ChannelIdentity' | 'Run' | 'AgentInvocation' | 'ToolCall' | 'Fact'
  /** Slice 2 — first-class curated memory entity between atomic Fact
   *  and verbatim Turn. Carries the ACL (Slice 3) and is the sink for
   *  the Palaia significance-promotion pipeline (Slice 4). */
   | 'MemorableKnowledge'
  /** Slice 6.5 — verbatim text snippet from the original turn that
   *  underpins a MemorableKnowledge. Stable provenance anchor;
   *  carries `text`, `position` (0-4), `source` ('llm'|'hint'|
   *  'fallback') in `props`. Linked to its parent MK via
   *  `EXCERPT_OF`. */
   | 'PalaiaExcerpt'
  /** Slice 9 — contradiction marker between two semantically-similar
   *  MemorableKnowledge nodes whose content disagrees. Carries
   *  `summary`, `severity`, `status`, `resolution` in `props`. Linked
   *  to BOTH offending MKs via `CONFLICTS_WITH`. */
   | 'Inconsistency'
  /** Slice 10 — near-duplicate marker between two MKs whose cosine
   *  similarity is ≥ 0.95. No contradiction; just redundancy. Carries
   *  `cosine_sim`, `status`, `resolution` in `props`. Linked to BOTH
   *  MKs via `DUPLICATE_OF`. */
   | 'MergeCandidate'
  /** Slice 11 — cluster of semantically-related MemorableKnowledge
   *  nodes, named by Haiku. Aggregate metadata; lifetime is until the
   *  next operator-triggered re-cluster. */
   | 'Topic'
  /** Slice 12 — near-duplicate marker between two PalaiaExcerpts
   *  (cosine ≥ 0.97). Mirror of Slice 10 MergeCandidate at the
   *  excerpt layer. Linked to BOTH excerpts via DUPLICATE_EXCERPT_OF. */
   | 'ExcerptMergeCandidate'
  /** #133 (plan-as-data) — per-turn plan DAG root. */
   | 'Plan'
  /** #133 — typed sub-goal node under a Plan; status lives in `props.status`. */
   | 'PlanStep';

  export type GraphEdgeType = 'IN_SESSION' | 'NEXT_TURN' | 'CAPTURED' | 'BELONGS_TO' | 'EXECUTED' | 'INVOKED_AGENT' | 'INVOKED_TOOL' | 'PRODUCED' | 'DERIVED_FROM' | 'MENTIONS'
  /** Slice 1b — ChannelIdentity → User-Cluster cross-link. */
   | 'IS_IDENTITY_OF'
  /** Slice 2 — MemorableKnowledge → User-Cluster, participating users. */
   | 'INVOLVED'
  /** Slice 2 — MemorableKnowledge → Entity (Odoo/Confluence/Plugin),
   *  domain references the MK is anchored to. */
   | 'REQUIRES'
  /** Slice 6.5 — PalaiaExcerpt → MemorableKnowledge. The verbatim
   *  source-snippet "belongs to" the curated memory it underpins. */
   | 'EXCERPT_OF'
  /** Slice 9 — Inconsistency → MemorableKnowledge. Two edges per
   *  Inconsistency, one per conflicting MK. Direction: from the
   *  marker to the MKs it flags. */
   | 'CONFLICTS_WITH'
  /** Slice 10 — MergeCandidate → MemorableKnowledge. Two edges per
   *  MergeCandidate, one per near-duplicate MK. Same direction
   *  convention as CONFLICTS_WITH. */
   | 'DUPLICATE_OF'
  /** Slice 11 — MemorableKnowledge → Topic. 1:1 per MK; re-cluster
   *  wipes and rebuilds every edge so the cardinality stays clean. */
   | 'HAS_TOPIC'
  /** Slice 12 — ExcerptMergeCandidate → PalaiaExcerpt. Two edges per
   *  ExcerptMergeCandidate, one per near-duplicate excerpt. Same
   *  direction convention as DUPLICATE_OF. */
   | 'DUPLICATE_EXCERPT_OF'
  /** #133 (plan-as-data) — PlanStep → Plan membership. */
   | 'STEP_OF'
  /** #133 — PlanStep → PlanStep DAG dependency. */
   | 'DEPENDS_ON'
  /** #133 — Plan → Turn provenance. */
   | 'PLAN_OF';

  /** Memory-typing axis: long-term recall vs. how-to vs. open work item. */
  export type EntryType = 'memory' | 'process' | 'task';

  /**
   * Visibility scope of a memory entry. `'shared:<project>'` is a free-form
   * suffix (no DB CHECK constraint) so per-project shares can scale without
   * a schema migration.
   *
   * NOTE: distinct from `graph_nodes.scope` (the session-scope, e.g. 'demo'),
   * which is unrelated to memory visibility.
   */
  export type Visibility = 'private' | 'team' | 'public' | `shared:${string}`;

  /** Lifecycle bucket: HOT = active recall, WARM = aging, COLD = archival. */
  export type Tier = 'HOT' | 'WARM' | 'COLD';

  /** Open / closed state for `entryType === 'task'` rows. */
  export type TaskStatus = 'open' | 'done';

  export type FactSeverity = 'info' | 'warning' | 'critical';

  /**
   * One business entity staged into the graph outside a turn context. Mirrors
   * the shape that would otherwise arrive via `EntityRef` on a completed turn,
   * but carries enough metadata to stand on its own — display label + optional
   * extra properties for the UI (e.g. partner email, employee department).
   *
   * `system` is a free-form string namespace (OB-29-2). Built-in values:
   *   - `'odoo'` → maps to GraphNodeType `'OdooEntity'`
   *   - `'confluence'` → maps to GraphNodeType `'ConfluencePage'`
   *   - any other string → maps to GraphNodeType `'PluginEntity'` (generic
   *     plugin-namespaced entity). Plugins MUST declare their custom system
   *     strings in `permissions.graph.entity_systems` and ingest through
   *     `ctx.knowledgeGraph` so the accessor can enforce the namespace.
   */
  export interface EntityIngest {
      system: string;
      model: string;
      /** External id in the source system (Odoo numeric id, Confluence page id). */
      id: string | number;
      displayName?: string;
      /** Free-form extras stored on the node properties. Keep small — this is
       *  indexed via GIN, so huge blobs hurt. */
      extras?: Record<string, unknown>;
  }

  export interface EntityIngestResult {
      /** External ids ("odoo:res.partner:42") in the order they were inserted. */
      entityIds: string[];
      inserted: number;
      updated: number;
  }

  /**
   * A single atomic fact extracted from a Turn. Subject-predicate-object triples
   * are the Haiku classifier's output shape — keep them short so they stay
   * composable across sessions. `sourceTurnId` is the external id of the Turn
   * that produced the fact (scheme `turn:<scope>:<time>`); the graph uses it to
   * wire the `DERIVED_FROM` edge.
   */
  export interface FactIngest {
      /** Stable deterministic id from `factNodeId(sourceTurnId, subject, predicate, object)`. */
      factId: string;
      sourceTurnId: string;
      subject: string;
      predicate: string;
      object: string;
      /** Haiku-reported confidence in [0, 1]. Lets us filter on recall later. */
      confidence?: number;
      /** Cross-fact severity axis. `critical` ranks insolvency above a name change. */
      severity?: FactSeverity;
      /** External ids of entities this fact references (`<system>:<model>:<id>`). */
      mentionedEntityIds?: string[];
  }

  export interface FactIngestResult {
      factIds: string[];
      inserted: number;
      updated: number;
  }

  export interface GraphStats {
      nodes: number;
      edges: number;
      byNodeType: Record<GraphNodeType, number>;
      byEdgeType: Record<GraphEdgeType, number>;
  }

  export interface SearchTurnsOptions {
      /** Free-text query. Empty string / whitespace → returns []. */
      query: string;
      /** Restrict to turns belonging to this user. Recommended for production. */
      userId?: string;
      /** Drop hits from this session scope (usually the ongoing chat). */
      excludeScope?: string;
      /** Drop specific Turn external ids (usually the current turn). */
      excludeTurnIds?: readonly string[];
      /**
       * Restrict to turns whose `scope` begins with this agent prefix
       * (`<agentSlug>::`). Omit for the legacy cross-agent view. See
       * {@link agentScopePrefix} — per-orchestrator KG isolation.
       */
      agentScopePrefix?: string;
      /**
       * Member-scoped memory — keep only turns whose `owners` include EVERY id
       * here (the room's audience ⊆ the turn's owners). A turn without `owners`
       * never matches. Omit for no owner filter. See {@link TurnIngest.owners}.
       */
      audienceOwners?: readonly string[];
      /** Hard cap on returned hits. Defaults to 5. */
      limit?: number;
      /**
       * #1507 — leave out turns stored `unprotected` (see `TurnIngest`). Set by a
       * recall that runs under a Privacy Shield.
       */
      excludeUnprotected?: boolean;
  }

  export interface TurnSearchHit {
      turnId: string;
      scope: string;
      time: string;
      userMessage: string;
      assistantAnswer: string;
      /** Normalised relevance score in [0, 1]; higher is better. */
      rank: number;
      /** Memory classification of the turn. Optional — undefined = unknown. */
      entryType?: EntryType;
      /** True when the turn was manually authored (operator/admin capture).
       *  The assembler applies a score boost to TRUE hits. */
      manuallyAuthored?: boolean;
  }

  export interface EntityCapturedTurnsOptions {
      /** Candidate terms extracted from the current user message. */
      terms: readonly string[];
      /** Restrict the returned turns to this user. */
      userId?: string;
      /** Drop capturing turns from this scope. */
      excludeScope?: string;
      /**
       * Restrict the capturing turns to those whose `scope` begins with this
       * agent prefix (`<agentSlug>::`). Entity NODES stay global (shared
       * vocabulary); only the CAPTURED→Turn recall is agent-isolated. Omit for
       * the legacy cross-agent view. See {@link agentScopePrefix}.
       */
      agentScopePrefix?: string;
      /**
       * Member-scoped memory — keep only turns whose `owners` include EVERY id
       * here (the room's audience ⊆ the turn's owners). A turn without `owners`
       * never matches. Omit for no owner filter. See {@link TurnIngest.owners}.
       */
      audienceOwners?: readonly string[];
      /** Max turns to return per matched entity. Default 2. */
      perEntityLimit?: number;
      /** Hard cap on distinct entities to return. Default 5. */
      entityLimit?: number;
      /**
       * #1507 — leave out turns stored `unprotected` (see `TurnIngest`). Set by a
       * recall that runs under a Privacy Shield.
       */
      excludeUnprotected?: boolean;
  }

  export interface EntityCapturedTurnsHit {
      entity: GraphNode;
      turns: Array<{
          turnId: string;
          scope: string;
          time: string;
          userMessage: string;
          assistantAnswer: string;
      }>;
  }

  // ──────────────────────────────────────────────────────────────────────
  // writeCapabilities.ts (only the types the context above references)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Omadia UI — write-tool capability contract (additive, plugin-api).
   *
   * A Tier-3 tool that mutates data declares its write capabilities in its
   * manifest so Tier 2 can derive inline-edit affordances (`editable` /
   * `canAddItems` / `canRemoveItems` / `canReorder`) DETERMINISTICALLY — without
   * guessing from free-form tool names, which produces silent rollback-hell. A
   * tool that lacks this annotation is simply not exposed for direct manipulation
   * (it still works via beam, which routes through the agent's full reasoning).
   *
   * This module ships the TYPES + the pure derivation helper. Wiring (manifest-
   * loader parsing into the tool spec + system-prompt emission) lands with the
   * canvas orchestrator (PR-9), which is the first consumer.
   */
  export type WriteOperation = 'update' | 'create' | 'delete' | 'reorder';

  /** Per-field editability + client-checkable constraints (for `update`). */
  export interface WriteCapabilityField {
      name: string;
      /** client-checkable type hint (e.g. `'string'`, `'integer'`, `'enum'`). */
      type?: string;
      /** whether the client may inline-edit this field. */
      editable: boolean;
      /** allowed values, when `type === 'enum'`. */
      values?: readonly unknown[];
      pattern?: string;
      min?: number;
      max?: number;
      maxLength?: number;
  }

  /** One write capability a tool declares for a data class. */
  export interface WriteCapability {
      /** the data class this applies to (e.g. `"jira.ticket"`). */
      dataClass: string;
      operation: WriteOperation;
      targetSchema?: {
          /** primary-key field, for `update` / `delete`. */
          idField?: string;
          /** per-field editability + constraints, for `update`. */
          fields?: readonly WriteCapabilityField[];
          /** preferred container primitive, for `create` / `reorder`. */
          containerHint?: string;
          /** required fields of the new-item template, for `create`. */
          requiredFields?: readonly string[];
          /** field carrying display order, for `reorder`. */
          orderField?: string;
      };
  }


  // Only the `export`ed declarations above are part of the module.
  export {};
}
