/**
 * Local type stubs for `@omadia/plugin-api`.
 * Last synced against byte5ai/omadia @ 744af1386cd782c7e46fe3679e9f270c0c5f8d0e (2026-07-06).
 *
 * The real package is provided by the Omadia host at runtime — it is NOT
 * published to npm, so you do not (and cannot) `npm install` it. These ambient
 * declarations mirror the host's public surface closely enough to compile your
 * plugin offline. At runtime the host injects the genuine implementations.
 *
 * Keep this file in sync with the Omadia version you target. When in doubt,
 * the live contract lives in the Omadia source under
 * `middleware/packages/plugin-api` (`src/pluginContext.ts`). This stub covers
 * the plugin-authoring surface; host-internal types (memory store, capability
 * parsing, knowledge-graph DTOs, canvas/privacy contracts) are intentionally
 * omitted or kept loose — consult the live SDK when you need their full shapes.
 */
declare module '@omadia/plugin-api' {
  export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

  // ──────────────────────────────────────────────────────────────────────
  // Secrets & config — per-plugin, vault- and registry-backed.
  // ──────────────────────────────────────────────────────────────────────

  /** Vault-backed secrets declared as `type: secret` setup fields. Scoped to
   *  this plugin — there is no API to reach another plugin's secrets. */
  export interface SecretsAccessor {
    /** Returns the secret, or `undefined` if it was never set. */
    get(key: string): Promise<string | undefined>;
    /** Returns the secret, or throws `MissingSecretError` if missing. */
    require(key: string): Promise<string>;
    /** Keys present in the vault for this plugin. Never returns values. */
    keys(): Promise<string[]>;
    /** Create or overwrite a secret in THIS plugin's namespace. Present only
     *  when the manifest declares `permissions.secrets.runtime_write`. Guard
     *  with `if (ctx.secrets.set)`. */
    set?(key: string, value: string): Promise<void>;
    /** Remove a secret from this plugin's namespace. No-op if absent. Present
     *  only with `permissions.secrets.runtime_write`. */
    delete?(key: string): Promise<void>;
  }

  /** Plain (non-secret) setup fields from the manifest `setup.fields`. */
  export interface ConfigAccessor {
    /** Returns the config value, or `undefined` if not present. */
    get<T = unknown>(key: string): T | undefined;
    /** Returns the config value, or throws `MissingConfigError`. */
    require<T = unknown>(key: string): T;
    /** Persist a NON-secret config value (must be a declared, non-secret setup
     *  field — secrets go through `secrets.set`). Present only when the manifest
     *  declares `permissions.secrets.runtime_write`. Guard with
     *  `if (ctx.config.set)`. */
    set?(key: string, value: unknown): Promise<void>;
  }

  /** Write-capable secrets accessor — handed out ONLY inside an `onMigrate`
   *  hook. Normal plugin code receives the read-only `SecretsAccessor`. */
  export interface SecretsReadWriteAccessor extends SecretsAccessor {
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Cross-plugin service registry.
  // ──────────────────────────────────────────────────────────────────────

  /** Services come from OTHER plugins (e.g. `@omadia/knowledge-graph` provides
   *  'graph', 'bus', 'embeddings'). Keys are strings; contracts are by
   *  convention and documented alongside the providing plugin. */
  export interface ServicesAccessor {
    /** The registered provider for a service, or `undefined` if none installed. */
    get<T>(name: string): T | undefined;
    /** Whether a provider is currently registered. */
    has(name: string): boolean;
    /** Register THIS plugin as the provider for a service. Returns a dispose
     *  handle the plugin's `close()` MUST invoke. Throws on duplicate-provider. */
    provide<T>(name: string, impl: T): () => void;
    /** Wrap an already-registered provider with a decorator (privileged — only
     *  for the canonical decorator of a capability). Throws if none exists yet. */
    replace<T>(name: string, impl: T): () => void;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Native tools — contributed to the orchestrator.
  // ──────────────────────────────────────────────────────────────────────

  /** A native tool the orchestrator can call, in the shape Anthropic's Messages
   *  API accepts. Mirror `name` + `input_schema` under manifest `capabilities`. */
  export interface NativeToolSpec {
    readonly name: string;
    readonly description: string;
    readonly input_schema: {
      readonly type: 'object';
      readonly properties: Record<string, unknown>;
      readonly required?: readonly string[];
    };
    /** Per-spec Domain override. When omitted, the kernel inherits `ctx.domain`
     *  at registration time. Set only when one plugin contributes tools spanning
     *  multiple semantic domains (rare). */
    readonly domain?: string;
  }

  export const PLUGIN_DOMAIN_REGEX: RegExp;

  /**
   * Validation helper for domain strings — used by the manifest loader and by
   * tests that exercise the contract. Returns the validated domain or a
   * structured error so callers can decide between fail-fast and warn-fallback.
   */
  export function validatePluginDomain(
    value: unknown,
  ): { ok: true; domain: string } | { ok: false; message: string };

  /** A native tool ALWAYS returns a string (commonly JSON the model reads).
   *  Thrown errors are wrapped by the kernel into `Error: <message>`. */
  export type NativeToolHandler = (input: unknown) => Promise<string>;

  /** Opaque per-turn attachment payload (image URLs, cards, …). The shape is
   *  kernel-internal; channel adapters downcast to their richer types. */
  export interface NativeToolAttachment {
    readonly kind: string;
    readonly payload: unknown;
  }

  /** Optional per-turn attachment sink. Called once at the end of each turn so
   *  the plugin can return media produced this turn and clear its buffer.
   *  Return `undefined` when the tool did not fire — the common, cheap case. */
  export type NativeToolAttachmentSink = () =>
    | NativeToolAttachment[]
    | undefined;

  export interface ToolRegistrationOptions {
    /** System-prompt documentation block, spliced verbatim into the tool list
     *  (keep it to one paragraph, ≈4–8 sentences). */
    readonly promptDoc?: string;
    /** Per-turn attachment collector. See `NativeToolAttachmentSink`. */
    readonly attachmentSink?: NativeToolAttachmentSink;
  }

  export interface ToolsAccessor {
    /** Contribute a tool. Returns a dispose handle that unregisters it — call
     *  it from `close()` so deactivation removes the tool from the prompt and
     *  dispatch table. */
    register(
      spec: NativeToolSpec,
      handler: NativeToolHandler,
      options?: ToolRegistrationOptions,
    ): () => void;
    /** Register a handler for a tool whose spec the kernel emits itself (e.g.
     *  Anthropic-native `memory_*` tools with a `{type, name}` wire shape). */
    registerHandler(
      name: string,
      handler: NativeToolHandler,
      options?: ToolRegistrationOptions,
    ): () => void;
    /** Invoke a registered native tool OUTSIDE the orchestrator turn loop.
     *  Optional — narrow contexts need not implement it. */
    invoke?(name: string, input: unknown): Promise<string>;
  }

  // ──────────────────────────────────────────────────────────────────────
  // HTTP routes & UI surfaces.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Mount HTTP routes owned by this plugin. `router` is an Express `Router` at
   * runtime; typed loosely here so this stub needs no `express` dependency.
   * Returns a dispose handle that un-mounts the routes on deactivation.
   */
  export interface RoutesAccessor {
    register(prefix: string, router: unknown): () => void;
  }

  /** Stable id within the plugin combined with pluginId to form a catalogue key. */
  export interface UiRouteDescriptorInput {
    /** Stable id within the plugin (e.g. `'dashboard'`, `'absences'`). */
    readonly routeId: string;
    /** Path relative to the plugin's `/p/<pluginId>` mount (must start with `/`). */
    readonly path: string;
    /** Human-readable label shown in Hubs, dropdowns, and Tab titles. */
    readonly title: string;
    /** Optional one-line summary surfaced as a tooltip / card subtitle. */
    readonly description?: string;
    /** Optional ordering hint — lower comes first. Defaults to 100. */
    readonly order?: number;
  }

  /**
   * Plugin-served UI surface registry. Register a clickable surface (Teams Tab,
   * Hub card, web link) so downstream surfaces discover it automatically. The
   * HTTP route itself is registered separately via `ctx.routes.register(...)`;
   * the descriptor just makes the surface discoverable. Returns a dispose handle.
   */
  export interface UiRoutesAccessor {
    register(descriptor: UiRouteDescriptorInput): () => void;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Notifications — cross-channel fan-out.
  // ──────────────────────────────────────────────────────────────────────

  export interface NotificationPayload {
    readonly title: string;
    readonly body: string;
    /** Optional relative path users land on when they activate the
     *  notification. Channel handlers resolve it against the web-ui origin. */
    readonly deepLink?: string;
    /** v1 supports `'broadcast'` only; v2 will accept a concrete user-id list. */
    readonly recipients?: 'broadcast' | readonly string[];
  }

  export interface NotificationDispatchResult {
    /** channelIds whose handler completed without throwing. */
    readonly delivered: readonly string[];
    /** channelIds whose handler threw, with the error message. */
    readonly failed: readonly { readonly channelId: string; readonly error: string }[];
    /** False means the notification went nowhere (no registered handlers). */
    readonly anyHandlerPresent: boolean;
  }

  /** Payload as it lands inside a channel handler — kernel-filled `pluginId`
   *  and normalised `recipients`. */
  export interface ResolvedNotificationPayload {
    readonly pluginId: string;
    readonly title: string;
    readonly body: string;
    readonly deepLink?: string;
    readonly recipients: 'broadcast' | readonly string[];
  }

  export type ChannelNotificationHandler = (
    payload: ResolvedNotificationPayload,
  ) => Promise<void>;

  export interface NotificationsAccessor {
    /** Dispatch a notification to all registered channel handlers. `pluginId`
     *  is auto-injected. Never throws on handler errors — partial failures are
     *  reported in the result. */
    send(payload: NotificationPayload): Promise<NotificationDispatchResult>;
    /** Channel plugins register an inbound handler keyed by channelId. Returns
     *  a dispose handle the channel MUST call from its `close()`. */
    registerChannel(
      channelId: string,
      handler: ChannelNotificationHandler,
    ): () => void;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Scheduled jobs.
  // ──────────────────────────────────────────────────────────────────────

  /** Either a 5/6-field cron expression (croner syntax) or a fixed interval. */
  export type JobSchedule = { readonly cron: string } | { readonly intervalMs: number };

  export interface JobSpec {
    /** Unique WITHIN the plugin — the singleton-lock key. */
    readonly name: string;
    readonly schedule: JobSchedule;
    /** Per-run timeout. Defaults to 30_000ms. */
    readonly timeoutMs?: number;
    /** `'skip'` (default) drops a late tick; `'queue'` enqueues exactly one. */
    readonly overlap?: 'skip' | 'queue';
  }

  /** The supplied `AbortSignal` is aborted on deactivate or timeout — respect
   *  it. Throwing is logged but does NOT cancel future ticks. */
  export type JobHandler = (signal: AbortSignal) => Promise<void>;

  export interface JobsAccessor {
    /** Register a job. Returns a dispose handle the plugin's `close()` MUST
     *  invoke. Jobs declared in the manifest `jobs:` block are pre-registered;
     *  a duplicate `name` for the same plugin throws. */
    register(spec: JobSpec, handler: JobHandler): () => void;
  }

  export class JobValidationError extends Error {
    constructor(message: string);
  }

  export class JobAlreadyRegisteredError extends Error {
    constructor(agentId: string, name: string);
  }

  /** Outcome of emitting a domain event — how many Conductor workflows matched
   *  and started. */
  export interface EmitResult {
    eventId: string;
    matchedWorkflows: number;
    startedRuns: Array<{ workflowSlug: string; runId: string }>;
  }

  export interface EventsAccessor {
    /** Emit a declared domain event with a JSON payload. Routes to every
     *  subscribed Conductor workflow (matched by event id + optional payload
     *  filter). Throws if the plugin did not declare `id` as an emittable
     *  event. */
    emit(id: string, payload: Record<string, unknown>): Promise<EmitResult>;
  }

  export class EventNotDeclaredError extends Error {
    constructor(agentId: string, eventId: string);
  }

  /** Thrown by `ctx.events.emit` when no Conductor event router is registered
   *  in this host — e.g. the in-memory backend, or before the Conductor
   *  subsystem has finished wiring. A typed error so plugins can detect
   *  "Conductor not available here" and degrade, rather than parsing a generic
   *  message. */
  export class ConductorUnavailableError extends Error {
    constructor();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Capabilities — manifest-declared contracts between plugins.
  // ──────────────────────────────────────────────────────────────────────

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
   * Throws `CapabilityParseError` on malformed input.
   */
  export function parseCapabilityRef(raw: string): CapabilityRef;

  /** Same name + same major. */
  export function capabilitiesMatch(
    provider: CapabilityRef,
    consumer: CapabilityRef,
  ): boolean;

  // ──────────────────────────────────────────────────────────────────────
  // Filesystem scratch & outbound HTTP.
  // ──────────────────────────────────────────────────────────────────────

  /** Per-plugin scratch directory. Present only when the manifest declares
   *  `filesystem.scratch: true`. */
  export interface ScratchDirAccessor {
    /** Absolute path to the scratch directory. Creates it on first call. */
    path(): Promise<string>;
  }

  /**
   * Allow-listed outbound HTTP — a thin wrapper around global `fetch` that
   * enforces the `permissions.network.outbound` allow-list and a per-plugin
   * rate limit (60 req/rolling minute in v1). Present only when the manifest
   * declares at least one outbound host. Unknown-host requests throw
   * `HttpForbiddenError`; rate-limit violations throw `HttpRateLimitError`.
   *
   * Signature mirrors the platform `fetch` (`RequestInit`/`Response` globals
   * come from `@types/node`).
   */
  export interface HttpAccessor {
    fetch(url: string, init?: RequestInit): Promise<Response>;
  }

  export class HttpForbiddenError extends Error {}
  export class HttpRateLimitError extends Error {}

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
    connect(options: NetConnectOptions): Promise<import('node:net').Socket>;
  }

  export class NetForbiddenError extends Error {
    constructor(agentId: string, target: string);
  }

  export class NetRateLimitError extends Error {
    constructor(agentId: string);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Per-plugin memory store.
  // ──────────────────────────────────────────────────────────────────────

  export interface MemoryEntryInfo {
    /** Path relative to the plugin's scope — the same shape callers pass in. */
    readonly relPath: string;
    readonly isDirectory: boolean;
    readonly sizeBytes: number;
  }

  /**
   * Per-plugin memory store, scoped to `/memories/agents/<agentId>/`. All paths
   * are RELATIVE; absolute paths, `..` segments, and null bytes are rejected.
   * Present when the manifest declares `permissions.memory.reads` OR
   * `permissions.memory.writes` with at least one entry.
   */
  export interface MemoryAccessor {
    /** Read a file. Throws on missing path or if it is a directory. */
    readFile(relPath: string): Promise<string>;
    /** Create-or-overwrite. Intermediate directories are created as needed. */
    writeFile(relPath: string, content: string): Promise<void>;
    /** Create, fail-if-exists. Use when two writers must not race. */
    createFile(relPath: string, content: string): Promise<void>;
    /** Remove a file or directory (recursive). */
    delete(relPath: string): Promise<void>;
    /** List immediate entries under `relPath`. */
    list(relPath: string): Promise<readonly MemoryEntryInfo[]>;
    /** True if the path resolves to an existing file OR directory. */
    exists(relPath: string): Promise<boolean>;
  }

  export class MemoryPathError extends Error {}

  // ──────────────────────────────────────────────────────────────────────
  // Sub-agent delegation (gated by `permissions.subAgents.calls`).
  // ──────────────────────────────────────────────────────────────────────

  export interface SubAgentAccessor {
    /** Ask the named agent a single-turn question; returns the final answer. */
    ask(targetAgentId: string, question: string): Promise<string>;
    /** Whether a given target agent is reachable (no permission filter). */
    has(targetAgentId: string): boolean;
    /** Snapshot of every reachable target agentId (no permission filter). */
    list(): readonly string[];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Knowledge graph (gated by `permissions.graph.entity_systems`).
  // Method names mirror the live contract; DTOs are kept loose here — consult
  // `middleware/packages/plugin-api/src/knowledgeGraph.ts` for full shapes.
  // ──────────────────────────────────────────────────────────────────────

  export interface KnowledgeGraphAccessor {
    /** Persist entities as `PluginEntity` nodes. Each `system` MUST be in the
     *  manifest's `permissions.graph.entity_systems`, else throws
     *  `KgEntityNamespaceError`. */
    ingestEntities(entities: readonly unknown[]): Promise<unknown>;
    /** Persist atomic facts. */
    ingestFacts(facts: readonly unknown[]): Promise<unknown>;
    /** Full-text search over Turn nodes. Read-only, no namespace check. */
    searchTurns(opts: unknown): Promise<unknown[]>;
    /** Entity-anchored Turn lookup. Read-only, no namespace check. */
    findEntityCapturedTurns(opts: unknown): Promise<unknown[]>;
    /** Direct neighbours of a node. Read-only, no namespace check. */
    getNeighbors(nodeId: string): Promise<unknown[]>;
    /** Coarse counts for the UI / sanity checks. */
    stats(): Promise<unknown>;
    /** The namespaces this accessor was created with. */
    readonly entitySystems: readonly string[];
  }

  export class KgEntityNamespaceError extends Error {}
  export class KgServiceUnavailableError extends Error {}

  // ──────────────────────────────────────────────────────────────────────
  // Host LLM (gated by `permissions.llm.models_allowed`). The host pays —
  // plugins do NOT bring their own API keys.
  // ──────────────────────────────────────────────────────────────────────

  export interface LlmCompleteRequest {
    /** Model id (e.g. `'claude-haiku-4-5'`). MUST match the manifest whitelist. */
    readonly model: string;
    readonly system?: string;
    readonly messages: ReadonlyArray<{
      readonly role: 'user' | 'assistant';
      readonly content: string;
    }>;
    /** Silently clamped to `permissions.llm.max_tokens_per_call`. */
    readonly maxTokens?: number;
    readonly temperature?: number;
  }

  export interface LlmCompleteResult {
    readonly text: string;
    readonly model: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Provider-neutral end signal — branch on THIS, not the legacy stopReason. */
    readonly finishReason: 'stop' | 'tool_calls' | 'max_tokens';
    /** @deprecated Anthropic-specific. Use `finishReason`. */
    readonly stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  }

  export interface LlmAccessor {
    complete(req: LlmCompleteRequest): Promise<LlmCompleteResult>;
    /** Snapshot of the model whitelist for plugin-side introspection. */
    readonly modelsAllowed: readonly string[];
  }

  export class LlmServiceUnavailableError extends Error {}
  export class LlmModelNotAllowedError extends Error {}
  export class LlmBudgetExceededError extends Error {}

  // ──────────────────────────────────────────────────────────────────────
  // Redirect/callback flows (gated by `permissions.flows: true`).
  // ──────────────────────────────────────────────────────────────────────

  export interface FlowsAccessor {
    /** Resolve the browser-facing absolute URL for one of this plugin's own
     *  routes — the value to hand an external IdP as a `redirect_url`. Pass
     *  `opts.prefix` to disambiguate when several routes are registered. */
    publicUrl(relPath: string, opts?: { prefix?: string }): string;
    /** Sign claims into a short-lived (10-min default) HS512 state token,
     *  audience-bound to this plugin. Use as the flow's `state` query-param. */
    signState(
      claims: Record<string, unknown>,
      opts?: { ttl?: string },
    ): Promise<string>;
    /** Verify a state token returned on the callback. Throws on bad signature,
     *  wrong audience, or expiry. Returns the decoded claims. */
    verifyState(token: string): Promise<Record<string, unknown>>;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Operator-facing status (always present, ungated).
  // ──────────────────────────────────────────────────────────────────────

  export type PluginActionState = 'ok' | 'needs_action' | 'error';

  export interface PluginActionStatus {
    readonly state: PluginActionState;
    /** Short label for the badge/banner (e.g. "Not connected"). */
    readonly title?: string;
    /** One-line detail / next step. */
    readonly detail?: string;
  }

  /** Push-based status reporter, bound to the calling plugin's id. Re-report on
   *  `activate()` so it self-heals after a restart (in-memory, no history). */
  export interface StatusAccessor {
    report(status: PluginActionStatus): void;
    clear(): void;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Plugin self-extension.
  // ──────────────────────────────────────────────────────────────────────

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
    apply(
      approved: ApprovedExtension,
      ctx: PluginContext,
    ): Promise<() => void> | (() => void);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Runtime limit signal.
  // ──────────────────────────────────────────────────────────────────────

  export type LimitSignalKind =
    /** A server-side result cap was hit (e.g. OData `$top`=50, page size). */
    | 'row_cap'
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
  export function makeLimitSignal(
    kind: LimitSignalKind,
    detail: string,
    extra?: { cap?: number; observed?: number; hint?: string },
  ): LimitSignal;

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
  export function appendLimitSignalNote(
    output: string,
    signal: LimitSignal | undefined,
  ): string;

  // ──────────────────────────────────────────────────────────────────────
  // The plugin context.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * The single argument the host passes to a plugin's `activate(ctx)`. Every
   * external effect (secrets, network, filesystem, memory, graph, LLM) flows
   * through a `ctx` accessor scoped by the plugin's manifest permissions.
   * Optional accessors are present ONLY when the matching manifest permission
   * is declared — always guard with `if (ctx.<accessor>)`.
   */
  export interface PluginContext {
    readonly agentId: string;
    /** Manifest-declared lowercase dotted domain (e.g. `confluence`, `odoo.hr`).
     *  Inherited onto every tool the plugin registers. */
    readonly domain: string;

    readonly secrets: SecretsAccessor;
    readonly config: ConfigAccessor;
    readonly services: ServicesAccessor;

    /** True only when the kernel activated this plugin for a smoke probe.
     *  Plugins MAY branch on it to return mock data instead of hitting
     *  non-idempotent production APIs. Reading it is optional. */
    readonly smokeMode: boolean;

    readonly tools: ToolsAccessor;
    readonly routes: RoutesAccessor;
    readonly uiRoutes: UiRoutesAccessor;
    readonly notifications: NotificationsAccessor;
    readonly jobs: JobsAccessor;
    /** Always present, ungated — a plugin reports only its OWN status. */
    readonly status: StatusAccessor;

    readonly scratch?: ScratchDirAccessor;
    readonly http?: HttpAccessor;
    readonly memory?: MemoryAccessor;
    readonly subAgent?: SubAgentAccessor;
    readonly knowledgeGraph?: KnowledgeGraphAccessor;
    readonly llm?: LlmAccessor;
    readonly flows?: FlowsAccessor;

    log(...args: unknown[]): void;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Migration hook (opt-in plugin export `onMigrate`).
  // ──────────────────────────────────────────────────────────────────────

  /** Context passed to `onMigrate` when a new version is uploaded over an
   *  installed one. Returns the new config (atomically swapped on success) or
   *  throws to abort the upload (old version stays active). Keep migrations
   *  idempotent — partial writes are visible if the hook throws midway. */
  export interface MigrationContext extends Omit<PluginContext, 'secrets'> {
    readonly fromVersion: string;
    readonly toVersion: string;
    /** Snapshot of the previous config. Read-only. */
    readonly previousConfig: Record<string, unknown>;
    /** Write-capable secrets, scoped to this plugin. */
    readonly secrets: SecretsReadWriteAccessor;
  }

  export interface MigrationResult {
    /** Replaces the plugin's config (must be JSON-serialisable). Return
     *  `previousConfig` unchanged if the migration does not touch config. */
    newConfig: Record<string, unknown>;
  }

  /** Signature a plugin exports for migrations. Absence means the kernel
   *  carries over `previousConfig` 1:1. */
  export type MigrationHook = (ctx: MigrationContext) => Promise<MigrationResult>;

  // ──────────────────────────────────────────────────────────────────────
  // Error classes the host throws (declared so plugin code can `instanceof`).
  // ──────────────────────────────────────────────────────────────────────

  export class MissingSecretError extends Error {}
  export class MissingConfigError extends Error {}
  export class SubAgentPermissionDeniedError extends Error {}
  export class SubAgentRecursionError extends Error {}
  export class SubAgentBudgetExceededError extends Error {}
  export class UnknownSubAgentError extends Error {}

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
  export type TargetRef =
    | { kind: 'canvas'; canvasSessionId: string }
    | { kind: 'container'; containerId: string }
    /** any non-data primitive (heading, divider, status, …) */
    | { kind: 'element'; elementId: string }
    | { kind: 'rowField'; containerId: string; rowKey: string; fieldKey: string }
    /** list / tree node */
    | { kind: 'item'; containerId: string; itemKey: string }
    /** chart data point */
    | { kind: 'point'; containerId: string; pointKey: string }
    | { kind: 'textRange'; anchor: TextRangeAnchor }
    /** pixel / canvas-region region */
    | { kind: 'region'; region: BufferRegion }
    /** whole-buffer reference (canvas-region / media) */
    | { kind: 'buffer'; primitiveId: string; bufferContentHash: string }
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
    bbox: { x: number; y: number; w: number; h: number };
    /** optional shape for non-rect selections (lasso, magic-wand) */
    shape?: {
      kind: 'rect' | 'polygon' | 'mask';
      /** for 'polygon' */
      points?: Array<[number, number]>;
      /** for 'mask' — content-hash of a binary mask sized to bbox */
      maskHash?: string;
    };
  }

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

  export class OAuthTokenError extends Error {
    readonly code: OAuthTokenErrorCode;
    constructor(code: OAuthTokenErrorCode, message: string);
  }

  /** RFC 7636 §4.1 verifier length is 43-128 chars; 32 random bytes ≈ 43
   *  base64url chars, the minimum spec-allowed. 32B already gives 256 bits of
   *  entropy. */
  export function generateCodeVerifier(): string;

  /** Compute the S256 code-challenge for a verifier. The challenge is the value
   *  that goes into the authorize-URL; the verifier stays on the server. */
  export function computeCodeChallenge(verifier: string): string;

  /** Default timeout for an `onMigrate` invocation. Overridable per plugin via
   *  `manifest.lifecycle.onMigrate.timeout_ms`. */
  export const MIGRATION_TIMEOUT_MS_DEFAULT: number;

  export class MigrationTimeoutError extends Error {
    constructor(agentId: string, fromVersion: string, toVersion: string, timeoutMs: number);
  }

  export class MigrationHookError extends Error {
    readonly migrationCause: unknown;
    constructor(agentId: string, fromVersion: string, toVersion: string, cause: unknown);
  }

  export interface PluginContext {
    /** Raw-TCP egress for line protocols `ctx.http` cannot speak (SMTP, IMAP,
     *  …). Present only when the manifest declares
     *  `permissions.network.outbound_tcp` and the referenced operator config
     *  resolves to a concrete host:port. Every `connect` is pinned to that
     *  exact allow-listed target. Undefined otherwise — guard with `if
     *  (ctx.net)` so a Hub plugin tolerates an older core that lacks it. */
    readonly net?: NetAccessor;

    /** US4 (Conductor Surface) — emit a domain event the plugin declared. Present iff the manifest
     *  declares `permissions.events.emit: true`. A plugin may only emit an event id it declared via an
     *  `{ id, event_emit: true }` capability (deny-by-default → `EventNotDeclaredError`). `emit` throws
     *  `ConductorUnavailableError` when no Conductor event router is registered in this host (e.g. the
     *  in-memory backend, or during boot before Conductor has wired) — presence of the accessor does
     *  NOT guarantee the router. A successful emit is routed to every subscribed Conductor workflow. */
    readonly events?: EventsAccessor;

    /** Spec 005 — broker-acquired OAuth access tokens. Present iff the manifest
     *  declares a `type:oauth` setup field (resolved through an `oauth_providers`
     *  descriptor) AND the core ships the broker. `get(fieldKey)` returns a
     *  valid access token, refreshing under a 5-minute margin kernel-side; the
     *  refresh token never reaches plugin code. Guard with `if (ctx.oauthTokens)`
     *  — a Hub plugin may land on an older core without the broker. */
    readonly oauthTokens?: OAuthTokensAccessor;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Tool-side PII field annotations.
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
  export type PIIFieldType =
    | 'PERSON'
    | 'EMAIL'
    | 'PHONE'
    | 'IBAN'
    | 'CARD'
    | 'ADDRESS'
    | 'ORG'
    | 'APIKEY';

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

  // ---------------------------------------------------------------------------
  // Odoo many2one helpers.
  //
  // Odoo's `search_read` returns a top-level array of records; every
  // many2one field is serialised as a two-element tuple `[id, label]`
  // (an empty relation is `false`, which the walker skips gracefully).
  // Spelling the `[1]` / `[0]` index paths out by hand for every PII
  // field is noisy and error-prone — these helpers centralise the
  // convention so an Odoo tool annotates its result with a one-liner.
  // ---------------------------------------------------------------------------

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
  export function odooMany2OnePiiField(
    field: string,
    options?: OdooMany2OneOptions,
  ): ToolPIIField;

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
  export function odooSearchReadPiiFields(
    fields: Readonly<Record<string, PIIFieldType>>,
    options?: Pick<OdooMany2OneOptions, 'recordsAt'>,
  ): ToolPIIField[];

  // ──────────────────────────────────────────────────────────────────────
  // Local sub-agent tools.
  // ──────────────────────────────────────────────────────────────────────

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
}
