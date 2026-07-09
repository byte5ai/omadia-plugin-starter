/**
 * Local type stubs for `@omadia/channel-sdk`.
 * Last synced against byte5ai/omadia @ 327ddf89250eb36a5e0b1965dafc82139a40d4c6 (2026-07-08).
 *
 * Like `@omadia/plugin-api`, this package is provided by the Omadia host at
 * runtime and is not on npm. These declarations let a channel compile offline.
 * The live contract lives in the Omadia source under
 * `middleware/packages/harness-channel-sdk`.
 */
declare module '@omadia/channel-sdk' {
  export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

  /** Identifies the native user who sent a message. `kind` tags the platform. */
  export type ChannelUserKind =
    | 'discord-user'
    | 'teams-aad'
    | 'slack-user'
    | 'whatsapp-phone'
    | 'telegram-chat'
    | 'custom'
    // allow any other platform tag while keeping autocomplete on the known ones
    | (string & {});

  export interface ChannelUserRef {
    /** Namespace identifying the channel-user space. */
    kind: ChannelUserKind;
    /** Channel-native user id (opaque to core). */
    id: string;
    displayName?: string;
    email?: string;
  }

  export interface PlatformIdentity {
    /** v1: `${channel-kind}:${id}` */
    platformId: string;
    channelUserRef: ChannelUserRef;
    displayName?: string;
    email?: string;
  }

  /** A native event translated into the core, channel-agnostic turn shape. */
  export interface IncomingTurn {
    /** e.g. `"de.byte5.channel.teams"` */
    channelId: string;
    conversationId: string;
    /**
     * Routing selector for the binding this turn belongs to. Direct-agent
     * channels with multiple bound agents MUST set this and call
     * `resolveChatAgentForChannel` per turn instead of caching
     * `getChatAgent(ctx)`.
     */
    channelType?: string;
    /**
     * Opaque per-binding routing key for this turn. Direct-agent channels with
     * multiple bound agents MUST set this and call
     * `resolveChatAgentForChannel` per turn instead of caching
     * `getChatAgent(ctx)`.
     */
    channelKey?: string;
    userRef: ChannelUserRef;
    text: string;
    attachments?: IncomingAttachment[];
    /** Channel-specific metadata (locale, auth hints, etc.) — opaque to core. */
    metadata?: Record<string, unknown>;
    /** The original platform event, for adapters that need it on the way back. */
    rawEvent?: unknown;
    /** Per-deployment tenant id. Classic channels leave it unset. */
    tenantId?: string;
    /**
     * Canvas target for this turn (Omadia UI). Classic channels never set it.
     */
    target?: import('@omadia/plugin-api').TargetRef;
    /**
     * Per-container client view-state snapshot carried for referential
     * continuity (Omadia UI). Classic channels never set it.
     */
    viewState?: CanvasViewState;
    /**
     * `true` when the `viewState` blob or a container selection was truncated
     * to stay within the payload budget (Omadia UI).
     */
    viewStateTruncated?: boolean;
  }

  export interface IncomingAttachment {
    kind: 'image' | 'file' | 'audio' | 'video';
    url: string;
    mediaType: string;
    name?: string;
    sizeBytes?: number;
    /**
     * Optional pre-fetched bytes, base64-encoded. Channel adapters that own a
     * token-protected file URL populate this so the orchestrator can use the
     * bytes directly instead of fetching the URL.
     */
    bytesBase64?: string;
  }

  /**
   * A container's current selection in `viewState`. When the selection exceeds
   * the per-container cap it is shipped as a clearly-marked truncated sample.
   */
  export type CanvasSelection =
    | import('@omadia/plugin-api').TargetRef[]
    | {
        kind: 'truncated';
        includedCount: number;
        totalCount: number;
        /** first `includedCount` ids by viewState ordering */
        sample: import('@omadia/plugin-api').TargetRef[];
      };

  /**
   * Per-container view-state the Omadia UI client ships alongside a turn so
   * the agent can resolve references against stable ids.
   */
  export type CanvasViewState = Record<
    string,
    {
      sort?: { columnKey: string; direction: 'asc' | 'desc' };
      filter?: { predicate: string };
      group?: { columnKey: string };
      hiddenColumns?: string[];
      page?: { index: number; size: number };
      selection?: CanvasSelection;
      /** tree nodes / accordion-open rows, by stable item key */
      expanded?: string[];
      /** optional; only when referentially meaningful */
      scrollTop?: number;
    }
  >;

  /**
   * Sentinel a channel agent emits when it deliberately has nothing to say.
   * Channel adapters MUST drop this sentinel before forwarding anything to the
   * end user.
   */
  export const NO_REPLY_SENTINEL: 'NO_REPLY';

  export function isNoReply(answer: { text: string } | null | undefined): boolean;

  /** Lightweight structured log so dropped replies are observable. */
  export function logNoReplyDrop(channel: string, meta?: Record<string, unknown>): void;

  /**
   * Events emitted by `chatStream` in order, one per observable state transition
   * inside the tool loop. Local dev UIs render these as a live trace; production
   * callers can ignore everything except `done` / `error`.
   */
  export type ChatStreamEvent =
    | { type: 'iteration_start'; iteration: number }
    /**
     * Per-turn model-routing verdict. Emitted ONCE at turn start, right after the
     * Haiku classifier resolves and before the first model call - only when
     * routing is configured. Lets the UI show the triage decision inline at the
     * top of the turn card. `bucket: 'fallback'` means the classifier call failed
     * and the configured fallback model was used.
     */
    | {
        type: 'turn_routing';
        bucket: 'simple' | 'complex' | 'fallback';
        classifierModel: string;
        model: string;
      }
    /**
     * Wave 8 - per-turn direct-answer persona verdict. Emitted ONCE at turn
     * start, right after the persona classifier resolves - only when the Agent
     * has one or more persona skills attached. `skillId: null` means the
     * classifier picked the Agent's default identity (`bucket: 'none'`) or the
     * classifier call itself failed (`bucket: 'fallback'`). Lets the UI show
     * which persona is answering, the same way `turn_routing` shows the model.
     */
    | {
        type: 'turn_persona';
        bucket: 'matched' | 'none' | 'fallback';
        classifierModel: string;
        skillId: string | null;
        skillName: string | null;
      }
    | { type: 'text_delta'; text: string }
    | {
        type: 'tool_use';
        id: string;
        name: string;
        input: unknown;
        /** Set by the chat route when `name` resolves to an installed agent. */
        agent?: AgentMeta;
      }
    | { type: 'tool_result'; id: string; output: string; durationMs: number; isError?: boolean }
    /**
     * OB-77 (Palaia Phase 8) - fired AFTER the nudge pipeline has run on
     * the iteration's tool_results. Channel renderers collect these per
     * turn and render them as a consolidated list below the tool trace
     * (NOT inside any individual tool row). The pipeline's `<nudge>`
     * block is also embedded in `tool_result.content` so the agent sees
     * it on its next API call - but the UI uses this dedicated event so
     * placement + de-duplication are independent of tool-result
     * rendering. `id` is the tool_use_id the nudge fired against.
     */
    | {
        type: 'nudge';
        id: string;
        nudgeId: string;
        text: string;
        cta?: {
          label: string;
          toolName: string;
          arguments: Record<string, unknown>;
        };
      }
    /** Heartbeat every ~5s while a tool call is still in flight. Gives the UI a
     * live "still working" signal and keeps any intermediate proxy from idling
     * the stream out. elapsedMs is measured from the corresponding `tool_use`. */
    | { type: 'tool_progress'; id: string; elapsedMs: number }
    /**
     * Turn-level liveness pulse. Emitted on a fixed cadence (~2s) by the
     * route while a turn is in flight. Gives the UI a "still working" signal
     * even when no `text_delta` / `tool_use` arrived recently. Same shape as
     * the builder's `heartbeat` event so the front-ends can share the
     * liveness-rendering logic.
     */
    | {
        type: 'heartbeat';
        sinceLastActivityMs: number;
        currentIteration: number;
        toolCallsThisIter: number;
        phase?: 'thinking' | 'streaming' | 'tool_running' | 'idle';
        tokensStreamedThisIter?: number;
      }
    /**
     * Live token-stream pulse. One per assistant-text / tool-input delta the
     * model emits, throttled to the trailing-500ms window so the UI ticker
     * does not flood. `tokensPerSec` is computed from the same window.
     */
    | {
        type: 'stream_token_chunk';
        iteration: number;
        deltaTokens: number;
        cumulativeOutputTokens: number;
        tokensPerSec: number;
      }
    /**
     * Authoritative usage block read off `stream.finalMessage()` at iteration
     * end. Carries cache-read/creation input tokens so the UI can render a
     * cache-hit indicator separately from the live token-stream chunks
     * (which only see approximated output counts).
     */
    | {
        type: 'iteration_usage';
        iteration: number;
        inputTokens: number;
        outputTokens: number;
        cacheReadInputTokens: number;
        cacheCreationInputTokens: number;
      }
    /** Sub-agent iteration boundary. Surfaces the inner Claude loop so a long
     * domain-tool call is no longer an opaque black box in the UI. */
    | { type: 'sub_iteration'; parentId: string; iteration: number }
    /** Sub-agent initiated an inner tool call (e.g. odoo_execute). */
    | { type: 'sub_tool_use'; parentId: string; id: string; name: string; input: unknown }
    /** Sub-agent's inner tool call finished. */
    | {
        type: 'sub_tool_result';
        parentId: string;
        id: string;
        output: string;
        durationMs: number;
        isError: boolean;
      }
    | {
        type: 'done';
        answer: string;
        toolCalls: number;
        iterations: number;
        attachments?: DiagramAttachment[];
        fileAttachments?: OutgoingFileAttachment[];
        /**
         * Agentic run trace for this turn (same shape as ChatTurnResult.runTrace).
         * Consumed by the verifier's chatStream wrapper to run the trace-
         * cross-check rule. Clients that don't need it can ignore it.
         */
        runTrace?: RunTracePayload;
        /**
         * Present when the turn ended because Claude invoked `ask_user_choice`.
         * See ChatTurnResult.pendingUserChoice for semantics.
         */
        pendingUserChoice?: PendingUserChoice;
        /** 1-click refinement buttons attached to the answer; see
         *  ChatTurnResult.followUpOptions for semantics. */
        followUpOptions?: FollowUpOption[];
        /** Slot-picker card scheduled by `find_free_slots`. */
        pendingSlotCard?: PendingSlotCard;
        /** `true` when a calendar tool hit `consent_required` this turn. */
        pendingOAuthConsent?: boolean;
        /** Privacy-Proxy aggregate receipt for this turn. PII-free; clients
         *  render it as a collapsible disclosure under the answer. */
        privacyReceipt?: PrivacyReceipt;
        /** Privacy Shield v4 - real values in `answer` the LLM never saw;
         *  clients MAY highlight their occurrences. */
        maskedValues?: readonly string[];
        /** #133 - persisted Turn node external id (`turn:<scope>:<time>`); see
         *  ChatTurnResult.turnId. Lets the UI resolve the turn's plan DAG. */
        turnId?: string;
        /**
         * The model this turn actually ran on, resolved once at turn start by
         * the per-turn router (Haiku triage -> Sonnet/Opus). Equals the agent's
         * default model when model-routing is off. Lets the UI show which model
         * answered, alongside the live token counts.
         */
        model?: string;
        /**
         * #332 Layer 2 - Direct Line. Harness-owned verbatim sub-agent segment
         * for a user-directed specialist turn; see ChatTurnResult.delegatedAnswer.
         * The orchestrator cannot suppress or reword it.
         */
        delegatedAnswer?: DelegatedAnswer;
        /**
         * #332 Layer 1 (gap-closure) — curated, tamper-evident projection of
         * `runTrace.agentInvocations`, identical in shape and derivation to
         * `SemanticAnswer.agentsConsulted` (see `deriveAgentsConsulted` in
         * `toSemanticAnswer.ts`). Streaming clients (web-ui) previously had to
         * either re-derive this from the raw `runTrace` or go without; this
         * field gives every channel the SAME harness-built array.
         */
        agentsConsulted?: AgentConsultation[];
      }
    /**
     * Emitted after `done` by the verifier wrapper (only when enabled). The
     * client can render a badge, hide unverified facts, or simply ignore the
     * event. Never emitted by the base orchestrator.
     */
    | { type: 'verifier'; summary: VerifierResultSummary }
    /**
     * #133 (E9) - opaque turn annotation a turn-hook emitted, forwarded by the
     * orchestrator without inspecting it (it stays plan-agnostic). `channel`
     * routes it client-side (e.g. the plan-runner emits `channel: 'plan'` with a
     * plan-DAG snapshot at turn start + on every step change, so the UI renders
     * the live plan from the stream instead of polling). Additive; clients that
     * don't recognise a channel ignore the event.
     */
    | { type: 'turn_annotation'; channel: string; payload: unknown }
    /**
     * Mid-turn steering - emitted when a user message injected out-of-band via
     * `POST /chat/steer` was folded into the running conversation at an iteration
     * boundary. Lets the UI confirm the steer landed and on which iteration.
     * Additive; clients that don't recognise it ignore it.
     */
    | { type: 'steer_applied'; iteration: number; message: string }
    | { type: 'error'; message: string }
    /**
     * Omadia UI canvas surface events (omadia-canvas-protocol/1.0). Additive;
     * channels not declaring the `'canvas'` capability default-ignore these.
     */
    | SurfaceStreamEvent;

  /**
   * Opaque revision identifier for a canvas tree. Compared by EQUALITY ONLY -
   * never with `<` / `>` / arithmetic. v1 implements it as a monotonic integer
   * rendered as a string (single-writer model); v2+ shared canvases may use
   * Lamport timestamps / vector clocks / CRDT op-ids without any wire-format
   * change. The brand prevents accidental arithmetic or cross-use with a plain
   * string.
   */
  export type RevisionId = string & { readonly __brand: 'RevisionId' };

  /**
   * Canonical reference to bulk data behind a primitive. Content-addressed id,
   * HMAC-signed token, expiry. The single shape used by every trait/event that
   * references bulk data.
   */
  export interface DataRef {
    /** content-addressed identifier, e.g. `"pixel-<sha256[:16]>"` */
    id: string;
    /** HMAC signature (see Security Surface for input composition) */
    signedToken: string;
    /** ISO 8601 timestamp */
    expiresAt: string;
    /** protocol 1.1 (omadia-ui#5): true -> the server can re-resolve this data
     *  deterministically (a refresh recipe exists); the client may surface an
     *  instant-refresh affordance. Absent = unknown (agent-fallback refresh). */
    refreshable?: boolean;
    /** protocol 1.1: the canvas container this ref's data feeds (table/chart id) */
    containerId?: string;
  }

  /** Fields every surface event carries. `surfaceSeq` is server-assigned, monotonic per canvasSessionId. */
  export interface SurfaceEventBase {
    canvasSessionId: string;
    surfaceSeq: number;
  }

  /** Initial render / full replace; starts a new revision. */
  export interface SurfaceSnapshotEvent extends SurfaceEventBase {
    type: 'surface_snapshot';
    producesRevision: RevisionId;
    /** full primitive tree (validated against the protocol whitelist by Tier 1) */
    tree: unknown;
    protocolVersion: string;
    opsCatalogVersion: string;
  }

  /** Incremental update; client rejects + requests a snapshot if `basedOnRevision` mismatches. */
  export interface SurfacePatchEvent extends SurfaceEventBase {
    type: 'surface_patch';
    basedOnRevision: RevisionId;
    producesRevision: RevisionId;
    /** tree-path-targeted mutations */
    patches: unknown[];
  }

  /** Bulk data available behind a signed reference. */
  export interface SurfaceDataRefCreatedEvent extends SurfaceEventBase {
    type: 'surface_data_ref_created';
    revision: RevisionId;
    dataRef: DataRef;
    schema?: unknown;
    sizeHint?: number;
  }

  /** A reference expired / changed. */
  export interface SurfaceDataRefInvalidatedEvent extends SurfaceEventBase {
    type: 'surface_data_ref_invalidated';
    revision: RevisionId;
    id: string;
    reason: string;
  }

  /** Result of a user-triggered action. */
  export interface SurfaceActionResultEvent extends SurfaceEventBase {
    type: 'surface_action_result';
    forActionId: string;
    basedOnRevision: RevisionId;
    status: string;
    message?: string;
    followUpPatch?: unknown;
  }

  /**
   * Tier 2 instructs Tier 1 to execute a Local Operations Catalog operation.
   * `effect: 'preview'` does NOT mutate the revision (transient, locally undo-able);
   * `effect: 'durable'` is always followed by a `surface_patch` that mutates it.
   */
  export interface SurfaceLocalActionEvent extends SurfaceEventBase {
    type: 'surface_local_action';
    revision: RevisionId;
    effect: 'preview' | 'durable';
    operation: string;
    params: unknown;
    target: import('@omadia/plugin-api').TargetRef;
  }

  /** Render-side validation / dataRef denied / catalog op unknown / protocol mismatch. */
  export interface SurfaceErrorEvent extends SurfaceEventBase {
    type: 'surface_error';
    revision: RevisionId;
    severity: string;
    message: string;
    scope?: unknown;
  }

  /**
   * Resolution of a Class-D mutation, correlated to its `_pendingMutation` by
   * `forMutationId`. v2+ multi-user reserves `originAuthor` / `originSession` so a
   * member can be shown who applied a change and from which session - empty in v1.
   */
  export interface SurfaceMutationResolvedEvent extends SurfaceEventBase {
    type: 'surface_mutation_resolved';
    revision: RevisionId;
    forMutationId: string;
    status: 'success' | 'modified' | 'rejected' | 'invalid' | 'conflict';
    /** present when modified or conflict */
    actualValue?: unknown;
    /** present when rejected or invalid */
    error?: { message: string; code?: string };
    /** v2+ multi-user provenance - empty in v1 single-user */
    originAuthor?: string;
    originSession?: string;
  }

  /**
   * The `surface_*` event family added to `ChatStreamEvent`. Folded in as new arms
   * in chatAgent.ts via `| SurfaceStreamEvent`.
   */
  export type SurfaceStreamEvent =
    | SurfaceSnapshotEvent
    | SurfacePatchEvent
    | SurfaceDataRefCreatedEvent
    | SurfaceDataRefInvalidatedEvent
    | SurfaceActionResultEvent
    | SurfaceLocalActionEvent
    | SurfaceErrorEvent
    | SurfaceMutationResolvedEvent;

  /** Authenticated session identity handed to a {@link ChannelSocketHandler}.
   *  The core verifies the session cookie at upgrade time — BEFORE the
   *  handshake completes — so a handler only ever sees an authenticated peer. */
  export interface ChannelSessionClaims {
    /** Stable per-user id within the issuing provider (the session `sub`). */
    subject: string;
    email: string;
    displayName: string;
    /** Provider the session was minted by (`'local'` | `'entra'` | plugin id). */
    provider: string;
    /** Omadia-Identity cluster root in the knowledge graph, when resolved. */
    omadiaUserId?: string;
  }

  /** A transport-agnostic WebSocket the core hands to a channel. Text frames
   *  only in v1; the kernel owns the concrete `ws` implementation behind it. */
  export interface ChannelSocket {
    /** Send one text frame. */
    send(data: string): void;
    /** Subscribe to inbound text frames. */
    onMessage(cb: (data: string) => void): void;
    /** Subscribe to socket close. */
    onClose(cb: () => void): void;
    /** Close the socket (optional close code + reason). */
    close(code?: number, reason?: string): void;
    /** The upgrade request that opened this socket (read-only). */
    readonly request: {
      url: string;
      headers: Record<string, string | string[] | undefined>;
    };
  }

  /** Handler a channel registers for a WebSocket path. Invoked once per accepted
   *  connection, AFTER the core authenticated the upgrade. */
  export type ChannelSocketHandler = (
    socket: ChannelSocket,
    session: ChannelSessionClaims,
  ) => void;

  /**
   * What channels call on the core. The host passes an instance to each
   * `activate(ctx, core)`. Use it to drive turns, mount channel-scoped routes,
   * and resolve native user refs.
   */
  export interface CoreApi {
    handleTurnStream(turn: IncomingTurn): AsyncIterable<ChatStreamEvent>;
    registerRoute(channelId: string, method: HttpMethod, path: string, handler: unknown): void;
    registerRouter(channelId: string, prefix: string, router: unknown): void;
    resolveIdentity(ref: ChannelUserRef): Promise<PlatformIdentity>;
    log(level: LogLevel, message: string, context?: Record<string, unknown>): void;
    /** Register an authenticated WebSocket endpoint. Optional — present only
     *  when the kernel wired a WebSocket registry into `createCoreApi`. Channels
     *  MUST feature-detect (`typeof core.registerWebSocket === 'function'`)
     *  before using it. */
    registerWebSocket?(
      channelId: string,
      path: string,
      handler: ChannelSocketHandler,
    ): void;
  }

  /**
   * Runtime contract for channel plugins.
   *
   * Channels are user-facing inbound/outbound surfaces. Each channel package
   * implements `ChannelPlugin`; the core hands it a `PluginContext` and a
   * `CoreApi`.
   */
  export interface ChannelPlugin {
    /**
     * Called once at middleware startup or on demand when a channel is
     * installed at runtime. Mounts routes, opens connections, or starts
     * polling loops via the supplied CoreApi.
     */
    activate(
      ctx: import('@omadia/plugin-api').PluginContext,
      core: CoreApi,
    ): Promise<ChannelHandle>;
  }

  /** Opaque handle returned by `activate`. */
  export interface ChannelHandle {
    /** Release all runtime resources. */
    close(): Promise<void>;
  }

  /**
   * What ended up in the knowledge graph for a single turn — including
   * deterministic transforms (privacy-strip, hint-parse) that ran even when
   * the capture-pipeline was effectively in pass-through mode.
   *
   * Fields are intentionally projection-friendly: counts instead of contents,
   * enums instead of raw text, no PII. Connectors render this object as-is
   * without further interpretation.
   */
  export interface CaptureDisclosure {
    /** Was the turn persisted to the knowledge graph at all? */
    persisted: boolean;
    /**
     * Human-readable reason markers from the filter (`"privacy-strip:1"`,
     * `"hint-override:type=process"`, `"scorer-skipped:level=minimal"`,
     * `"dropped:significance<threshold"`). Free-form, observability only.
     */
    reasons: readonly string[];
    /**
     * Final entry-type written to the Turn node. Mirrors the
     * `entry_type` column on `graph_nodes` introduced in migration 0007.
     * Null when the turn was not persisted.
     */
    entryType: 'memory' | 'process' | 'task' | null;
    /**
     * Final visibility/scope. Free-form to match the `scope` column
     * (`'private' | 'team' | 'public' | 'shared:<project>'`). Null when the
     * turn was not persisted.
     */
    visibility: string | null;
    /**
     * Significance score in [0, 1] when the LLM scorer ran successfully.
     * Null at `capture_level=minimal/off`, on scorer timeout, or when a
     * capture-hint with `force="true"` short-circuited scoring.
     */
    significance: number | null;
    /** Did the embedding sidecar compute and write a vector for this turn? */
    embedded: boolean;
    /** Number of `<private>...</private>` blocks removed before persistence. */
    privacyBlocksStripped: number;
    /** Number of `<palaia-hint .../>` tags consumed. */
    hintTagsProcessed: number;
    /**
     * Knowledge-graph identifiers touched by this turn. Optional — exposed
     * mainly for the inline-chat dev surface (clickable graph deep-links).
     * Connectors that cannot link out (Teams: no graph UI) MAY omit display.
     */
    graphRefs?: {
      sessionId: string;
      turnId: string;
      entityNodeIds: readonly string[];
    };
  }

  /**
   * One tool whose raw result the orchestrator passed through UNINTERNED this
   * turn — i.e. the LLM saw real values, not a `[masked]` digest — because
   * the operator set the originating plugin's `_privacy_mode` to `bypass`
   * (Slice 2.5). Surfaced in the receipt so the user sees a transparency
   * notice for every bypass decision the operator made.
   *
   * MUST stay PII-free — tool name + plugin id + count of bytes only, never
   * the raw value that crossed the boundary.
   */
  export interface BypassedToolEntry {
    /** The tool name as it appears in the LLM's `tool_use` block, e.g.
     *  `confluence_get_page`. */
    readonly toolName: string;
    /** The originating plugin's agent-id (its manifest `identity.id`), e.g.
     *  `@omadia/integration-confluence`. */
    readonly pluginId: string;
    /** Why the bypass fired this turn. `operator_setting` — the operator
     *  picked `bypass` (or scoped this tool via per-tool override) on the
     *  plugin's `_privacy_mode` setting. */
    readonly reason: 'operator_setting';
    /** Byte length of the raw result that bypassed the boundary — i.e.
     *  the LLM-visible payload size. For UI transparency only. */
    readonly bytes: number;
  }

  /**
   * The per-turn user-facing privacy report. Emitted by `finalizeTurn` and
   * attached to the assistant message metadata; channel renderers (Teams
   * card, Web disclosure) consume it to build their collapsible UI.
   *
   * MUST stay PII-free — counts and verb names only, never a value.
   */
  export interface PrivacyReceipt {
    /** Tool results interned behind the data-plane boundary this turn. */
    readonly datasetsInterned: number;
    /** Fields classified `sensitive-masked` across interned datasets. */
    readonly fieldsMasked: number;
    /** Fields classified `safe-cleartext` across interned datasets. */
    readonly fieldsCleartext: number;
    /** Verb names the LLM composed and the server executed this turn. */
    readonly verbsExecuted: readonly string[];
    /** Whether the gated pseudonym-projection layer was released this turn. */
    readonly pseudonymProjectionUsed: boolean;
    /**
     * Distinct personal-identity values that reached the LLM because the
     * requester named them in the request itself — e.g. typing an employee's
     * name into the chat. This is NOT a leak of tool data (the v4 boundary
     * kept that server-side); it is a transparency notice that the user
     * themselves put a real identity on the wire to the model. `0` / absent
     * when the user named no one. Derived from the Haiku schema classifier
     * (which fields are personal-identity data) intersected with the user's
     * own message — never from deny-by-default masking, so non-PII values
     * (status codes, model names) can never inflate it.
     */
    readonly identityValuesOnWire?: number;
    /**
     * Slice 2.5 — tools whose raw results bypassed the data-plane boundary
     * this turn, per the operator's per-plugin `_privacy_mode` setting.
     * Absent / empty when no bypass fired (the universal default is
     * `guarded`). PII-free: entries carry tool name + plugin id + a byte
     * count, never a raw value.
     */
    readonly bypassedTools?: readonly BypassedToolEntry[];
  }

  /** One resumable plan from a PRIOR session. `openStepGoals` are the goals of
   *  its still-pending/in-progress steps; `completedStepGoals` are the goals of
   *  its `done` steps (in order) — surfaced so a resumed turn knows what NOT to
   *  redo. A plan with BOTH completed and open steps is *interrupted* and the
   *  recall renderer frames it as a resume hint. */
  export interface RecalledPlan {
    /** External id `plan:<planId>`. */
    planId: string;
    scope: string;
    strategy?: string;
    createdAt?: string;
    openStepGoals: string[];
    /** Goals of the `done` steps, in order — "already completed, do not redo". */
    completedStepGoals: string[];
    /** The resume-from step (first open step) was `in_progress`, i.e. it may have
     *  been mid-execution when the plan was interrupted — its effect could be
     *  partially applied. The renderer adds a "verify before re-running" caveat. */
    resumeFromInProgress: boolean;
    /** The resume-from step is flagged `sideEffecting`. Combined with
     *  `resumeFromInProgress` this is the ambiguous case `buildResumePlan` guards:
     *  a side effect that may already have fired needs confirmation before retry. */
    resumeFromSideEffecting: boolean;
    doneCount: number;
    totalCount: number;
  }

  /** One stored process matching the current message. */
  export interface RecalledProcess {
    /** External id `process:<scope>:<slug>`. */
    id: string;
    title: string;
    scope: string;
    stepCount: number;
    score: number;
  }

  /** One curated insight (MemorableKnowledge) recalled cross-session. */
  export interface RecalledInsight {
    mkId: string;
    kind: string;
    summary: string;
    score: number;
    /** True when this insight comes from the always-surface DURABLE tier
     *  (curated `manuallyAuthored` reference/decision knowledge). Durable
     *  insights render at full length (not the fuzzy cap) so the agent can
     *  trust recalled schema instead of re-discovering it via tools. */
    durable?: boolean;
  }

  /** What the cross-session probe surfaced this turn. Empty arrays when a leg
   *  found nothing or was disabled. Powers both the prompt-injected recall
   *  blocks and the visible recall card / Teams Adaptive Card. */
  export interface RecalledContext {
    plans: RecalledPlan[];
    processes: RecalledProcess[];
    insights: RecalledInsight[];
  }

  /** Image/file side-channel. `url` must be reachable by the channel. */
  export interface OutgoingAttachment {
    kind: 'image' | 'file';
    /** URL the channel fetches / displays. May be signed + TTL-bound. */
    url: string;
    /** Human-readable name. Connectors display this when rendering inline. */
    altText: string;
    mediaType?: string;
    sizeBytes?: number;
    /**
     * Connector-agnostic producer hint (e.g. `'diagram.mermaid'`,
     * `'odoo.report.pdf'`). Connectors may use this for icon/badging but
     * MUST NOT branch on it for rendering correctness.
     */
    producer?: string;
    /** Producer-specific cache-hit signal — for observability only. */
    cacheHit?: boolean;
  }

  /** Verifier result the connector renders as a visual badge. */
  export interface VerifierBadge {
    status: 'verified' | 'partial' | 'corrected' | 'failed';
    /** Optional short tooltip / long-press hint. */
    hint?: string;
  }

  /** Suggested follow-up prompt, typically rendered as a button. */
  export interface FollowUpOption {
    /** Short label (<=40 chars). */
    label: string;
    /**
     * Full user-message submitted when the user clicks. MUST stand alone —
     * the LLM should be able to answer it without the prior turn's context.
     */
    prompt: string;
  }

  /**
   * Multi-option question card. Connector renders as buttons / select / radio.
   * Value is echoed back as the user's next message; `label` is user-visible.
   */
  export interface OutgoingChoiceCard {
    kind: 'choice';
    question: string;
    rationale?: string;
    options: Array<{ label: string; value: string }>;
  }

  /**
   * Calendar-slot selection. Connector renders slots as tappable rows.
   * Each slot carries a stable id the connector echoes back when the user
   * picks it. Time-strings are ISO-8601, tz is IANA.
   */
  export interface OutgoingSlotPicker {
    kind: 'slots';
    question: string;
    subjectHint?: string;
    slots: Array<{
      slotId: string;
      start: string;
      end: string;
      timeZone: string;
      label: string;
      /** 0..1 ranking hint. Connectors MAY visualise (bold for >=0.8). */
      confidence: number;
    }>;
  }

  /**
   * Topic-scope disambiguation. Used when the orchestrator wants the user
   * to confirm which subject the answer should target (e.g. multiple matches
   * in company enrichment). Semantically a choice-card with a topic context.
   */
  export interface OutgoingTopicAsk {
    kind: 'topic';
    question: string;
    topics: Array<{ label: string; value: string; hint?: string }>;
  }

  /**
   * Routine-list smart card. Rendered when the agent answers a "show me my
   * routines" intent via `manage_routine.list` — the tool stores this on
   * its instance, the orchestrator drains it at turn end, and the channel
   * renders one row per routine with inline Pause/Resume/Löschen actions.
   *
   * `filter` is the active server-applied filter (the card lets the user
   * flip it via filter-pills that re-invoke the tool with a new value).
   * `routines` is the already-filtered list — the channel doesn't need to
   * filter again.
   *
   * Sidecar: this DOES NOT short-circuit the turn — the agent may still
   * narrate around it ("Hier deine 3 aktiven Routinen"). Connectors that
   * cannot render rich cards (Telegram, plain HTTP) ignore this and the
   * model's `text` answer carries the same information.
   */
  export interface OutgoingRoutineList {
    kind: 'routine_list';
    filter: 'all' | 'active' | 'paused';
    totals: { all: number; active: number; paused: number };
    routines: Array<{
      id: string;
      name: string;
      cron: string;
      prompt: string;
      status: 'active' | 'paused';
      lastRunAt: string | null;
      lastRunStatus: 'ok' | 'error' | 'timeout' | null;
    }>;
  }

  /** Discriminated union of interactive elements a connector may render. */
  export type OutgoingInteractive =
    | OutgoingChoiceCard
    | OutgoingSlotPicker
    | OutgoingTopicAsk
    | OutgoingRoutineList;

  /**
   * #332 Layer 1 — one curated entry per sub-agent invocation this turn.
   * Derived from the deterministic `runTrace.agentInvocations` (the choke-point
   * record), NEVER from the orchestrator's prose. Carries only what a footer
   * needs; the raw run-trace stays behind the connector boundary.
   */
  export interface AgentConsultation {
    /** Stable agent id when resolvable (e.g. `de.byte5.agent.strategist`). */
    agentId?: string;
    /** Human label for the footer (e.g. `Strategist`). Always present. */
    label: string;
    /** Deterministic outcome of the invocation. */
    status: 'success' | 'error';
    /** Wall-clock duration of the invocation, when recorded. */
    durationMs?: number;
    /** COUNT of tool calls the sub-agent made — never the orchestrator's prose. */
    toolCalls?: number;
  }

  /**
   * #332 Layer 2 — the harness-owned verbatim sub-agent segment for a
   * direct-line turn. Rendered attributed and visually separate from the
   * orchestrator's `text`. `status: 'error'` carries a faithful failure message
   * in `text` (never a cover-up or hallucinated answer).
   */
  export interface DelegatedAnswer {
    /** Stable agent id the directive resolved to. */
    agentId: string;
    /** Human label for attribution (e.g. `Strategist`). */
    label: string;
    /** The sub-agent's verbatim answer (PII-masked), or a faithful error line. */
    text: string;
    status: 'success' | 'error';
  }

  /**
   * Canvas surface payload carried on a `SemanticAnswer` (and as
   * `ChatTurnResult.surface`) when a canvas-aware turn produced an initial tree.
   * Channels not declaring `'canvas'` ignore it.
   */
  export interface OutgoingSurface {
    canvasSessionId: string;
    producesRevision: RevisionId;
    /** full primitive tree */
    tree: unknown;
    protocolVersion: string;
    opsCatalogVersion: string;
  }

  /**
   * The top-level shape the orchestrator hands to a connector for rendering.
   * Every field except `text` is optional; a plain text reply is a valid
   * SemanticAnswer. Connectors that cannot render a richer primitive (e.g. a
   * Telegram bot without inline-keyboards for a SlotPicker) SHOULD degrade
   * gracefully (render the question as plain text + slot labels numbered
   * 1..N).
   */
  export interface SemanticAnswer {
    /** The assistant's prose response. Connectors MUST render this. */
    text: string;

    /** Visual verifier state — connectors may render as badge / icon / colour. */
    verifier?: VerifierBadge;

    /** Soft-disclaimer line appended to the answer (e.g. "unverified claims"). */
    disclaimer?: string;

    /** Image / file attachments to display alongside the text. */
    attachments?: OutgoingAttachment[];

    /** Suggested next prompts, typically rendered as buttons/chips. */
    followUps?: FollowUpOption[];

    /**
     * One-shot interactive card the user must resolve before continuing
     * (choice ask, slot picker, topic-selection). At most ONE interactive
     * element per answer — connectors may refuse to render two competing
     * interactions.
     */
    interactive?: OutgoingInteractive;

    /**
     * Signalled when an external-integration tool (today: Microsoft Calendar)
     * failed this turn with `consent_required`. Semantically channel-agnostic
     * — each connector decides how to surface it:
     *   - Teams: render an OAuthCard sidecar so the user can grant the scopes
     *     in one click via the Bot-Framework `userTokenClient` flow.
     *   - Telegram / plain-web: no OBO equivalent — connectors should render
     *     the `text` answer unchanged (the orchestrator already wrote a
     *     `sso_unavailable`-style explanation in `text`).
     * Sidecar — does NOT short-circuit the turn.
     */
    oauthConsentPending?: boolean;

    /**
     * Palaia capture-disclosure (OB-81) — what the orchestrator persisted into
     * the knowledge graph for this turn. Surfaced as an expandable section by
     * connectors that can render disclosure UI (Teams Adaptive Card
     * ToggleVisibility section, inline-chat collapsible row). Omitted when the
     * capture-pipeline is inactive / disabled / pre-OB-71. Connectors that
     * cannot render rich UI MAY ignore this field.
     */
    captureDisclosure?: CaptureDisclosure;

    /**
     * Privacy-Proxy aggregate receipt for this turn — what the
     * `privacy.redact@1` provider did with the outbound payload (detected,
     * masked, routed). PII-free by construction. Connectors that can
     * render rich UI surface it as a collapsible disclosure under the
     * answer; others MAY ignore the field. Omitted when no privacy provider
     * is installed.
     */
    privacyReceipt?: PrivacyReceipt;

    /**
     * Privacy Shield v4 — real values rendered into `text` that the LLM never
     * saw (resolved server-side from ground truth behind the data-plane
     * boundary). Connectors MAY highlight their occurrences (e.g. a violet
     * tint) so the asker sees which data was protected. Omitted when the turn
     * produced no server-materialized answer or exposed no masked field.
     */
    maskedValues?: readonly string[];

    /**
     * Omadia UI canvas surface payload (omadia-canvas-protocol/1.0). Present when a
     * canvas-aware turn produced an initial primitive tree. Channels not declaring
     * the `'canvas'` capability ignore it. Additive optional field (see stability
     * contract above) — sidecar, does NOT short-circuit the answer.
     */
    surface?: OutgoingSurface;

    /**
     * Cross-session recall probe — plans/processes/insights the per-turn probe
     * surfaced from PRIOR sessions. Connectors that can render rich UI show it
     * as a collapsible "from earlier sessions" card (web-ui RecalledContextCard,
     * Teams Adaptive Card); others MAY ignore it. Omitted when nothing was
     * recalled. Sidecar — does NOT short-circuit the answer.
     */
    recalled?: RecalledContext;

    /**
     * #332 Layer 1 — tamper-evident agent transparency. A curated projection of
     * the deterministic run-trace's sub-agent invocations, built by the HARNESS
     * (not the LLM) from the choke-point trace. Lets EVERY channel — including
     * Teams / Telegram, which never see the raw `runTrace` — show which
     * specialist(s) were actually consulted this turn. If the orchestrator only
     * *claims* "I asked the Strategist" but never invoked the tool, this array is
     * empty and the contradiction is visible. Omitted when no sub-agent ran.
     * Sidecar — does NOT short-circuit the answer.
     */
    agentsConsulted?: readonly AgentConsultation[];

    /**
     * #332 Layer 2 — Direct Line. The verbatim answer of a sub-agent the USER
     * directed input at (e.g. `@omadia #strategist …`), captured at the choke
     * point and delivered as a HARNESS-owned, attributed segment INDEPENDENT of
     * the orchestrator's own `text`. The orchestrator can neither remove nor
     * rewrite it — its only sanctioned addition is an attributed, additive note
     * in `text` (never a replacement). Still PII-masked by the privacy guard.
     * Omitted on ordinary turns (no direct-line directive). Sidecar.
     */
    delegatedAnswer?: DelegatedAnswer;
  }

  /**
   * Channel-side hooks the route wires up so it can render a live "what is the
   * agent doing right now" indicator. All callbacks are optional and
   * fire-and-forget.
   */
  export interface ChatStreamObserver {
    onIteration?(ev: { iteration: number }): void;
    onIterationPhase?(ev: {
      iteration: number;
      phase: 'thinking' | 'streaming' | 'tool_running' | 'idle';
    }): void;
    onTokenChunk?(ev: {
      iteration: number;
      deltaTokens: number;
      cumulativeOutputTokens: number;
      tokensPerSec: number;
    }): void;
    onIterationUsage?(ev: {
      iteration: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadInputTokens: number;
      cacheCreationInputTokens: number;
    }): void;
  }

  export interface ChatAgent {
    chat(input: ChatTurnInput): Promise<SemanticAnswer>;
    chatStream(
      input: ChatTurnInput,
      observer?: ChatStreamObserver,
    ): AsyncGenerator<ChatStreamEvent>;
  }

  /** Inbound channel-supplied attachment (image/file/audio/video). */
  export interface ChatTurnAttachment {
    kind: 'image' | 'file' | 'audio' | 'video';
    url: string;
    mediaType: string;
    name?: string;
    sizeBytes?: number;
    /** Optional pre-fetched bytes when the channel owns a token-protected path. */
    bytesBase64?: string;
  }

  /** Diagram render produced by the `render_diagram` tool during a turn. */
  export interface DiagramAttachment {
    kind: 'image';
    url: string;
    altText: string;
    diagramKind: string;
    cacheHit: boolean;
  }

  /** Downloadable file produced by a native tool during a turn. */
  export interface OutgoingFileAttachment {
    kind: 'file';
    url: string;
    altText: string;
    mediaType: string;
    sizeBytes?: number;
    producer?: string;
  }

  /** Pending Smart-Card clarification request. */
  export interface PendingUserChoice {
    question: string;
    rationale?: string;
    options: Array<{ label: string; value: string }>;
  }

  /** Slot-picker card scheduled by `find_free_slots`. */
  export interface PendingSlotCard {
    question: string;
    subjectHint?: string;
    slots: Array<{
      slotId: string;
      start: string;
      end: string;
      timeZone: string;
      label: string;
      confidence: number;
    }>;
  }

  /** Outcome of a sub-agent run-trace (status discriminator). */
  export type RunStatus = 'success' | 'error';

  /** Per-tool-call entry in a run trace. */
  export interface RunToolCall {
    /** Unique id within the turn. */
    callId: string;
    toolName: string;
    durationMs: number;
    isError: boolean;
    /** Orchestrator-level tool: 'orchestrator'. Sub-agent tool: the agent name. */
    agentContext: string;
    /** External ids of entities produced by this call. */
    producedEntityIds?: string[];
    /** Output-schema validation issues, when present. */
    postcondition?: {
      issues: readonly string[];
    };
  }

  /** Per-sub-agent invocation entry in a run trace. */
  export interface RunAgentInvocation {
    /** 0-based index across the Run. */
    index: number;
    agentName: string;
    /** Stable agent id when resolvable (e.g. `de.byte5.agent.strategist`). Lets
     *  consumers disambiguate invocations whose human-facing label collides
     *  (#332 gap-closure). Absent when the invoked tool has no registered
     *  agentId (native/kernel tools). */
    agentId?: string;
    durationMs: number;
    subIterations: number;
    status: RunStatus;
    toolCalls: RunToolCall[];
  }

  /**
   * Run trace collected during a turn, BEFORE the session logger has stamped
   * the canonical turn id.
   */
  export interface RunTracePayload {
    scope: string;
    userId?: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    status: RunStatus;
    iterations: number;
    /** Top-level tool calls the orchestrator issued directly. */
    orchestratorToolCalls: RunToolCall[];
    /** One entry per sub-agent invocation in invocation-order. */
    agentInvocations: RunAgentInvocation[];
  }

  /** Compact verifier summary attached to `ChatTurnResult`. */
  export interface VerifierResultSummary {
    badge: 'verified' | 'partial' | 'corrected' | 'failed';
    status: 'approved' | 'approved_with_disclaimer' | 'blocked';
    claimCount: number;
    contradictionCount: number;
    unverifiedCount: number;
    retryCount: number;
    latencyMs: number;
    mode: 'shadow' | 'enforce';
  }

  /**
   * Channel-supplied per-turn input. Constructed by the channel adapter from
   * the platform-native event and handed to `ChatAgent.chat()` / `chatStream()`.
   */
  export interface ChatTurnInput {
    userMessage: string;
    /** Identifier for session-transcript bucketing. */
    sessionScope?: string;
    /**
     * Stable per-user identifier. Flows into the graph's Session/Turn nodes,
     * never the model prompt.
     */
    userId?: string;
    /**
     * Chronologically ordered previous turns of this chat (oldest first), as
     * maintained by an in-memory store outside the orchestrator.
     */
    priorTurns?: Array<{ userMessage: string; assistantAnswer: string }>;
    /**
     * Free-form addendum injected into the system prompt for this turn only.
     */
    extraSystemHint?: string;
    /**
     * Forced-delegation obligation. Unknown tool names are ignored.
     */
    expectedDomainTool?: string;
    /**
     * "Fresh check" mode — bypass the FTS context block, verbatim tail, and
     * memory-read convention for this turn only.
     */
    freshCheck?: boolean;
    /**
     * Teams SSO assertion (JWT) for the calling user. Never echoed to the
     * prompt.
     */
    ssoAssertion?: string;
    /**
     * Optional IANA time zone for the calling user. When absent, UTC.
     */
    userTimeZone?: string;
    /**
     * Inbound attachments from the channel. Today only image kinds reach the
     * model; other kinds are ignored for now.
     */
    attachments?: ChatTurnAttachment[];
    /**
     * Omadia UI canvas session id for this turn. Set only by the canvas
     * channel; classic channels leave it unset.
     */
    canvasSessionId?: string;
    /**
     * Structured UI action from an Omadia UI canvas client.
     */
    action?: { type: string; payload?: unknown; target?: unknown };
    /**
     * Omadia UI: the TargetRef a TEXT turn is bound to.
     */
    target?: unknown;
    /**
     * Omadia UI deterministic refresh: the client sends its current tree +
     * revision so a canvas-aware orchestrator can re-fetch only.
     */
    canvasRefresh?: { basedOnRevision: string; currentTree: unknown; scope?: string };
    /**
     * Omadia UI in-place action: on a structured ACTION turn the client sends
     * its current tree + revision so a canvas-aware orchestrator can
     * synthesise on top of that live tree.
     */
    canvasState?: { basedOnRevision: string; currentTree: unknown };
  }

  /** Internal canvas surface payload imported from `surface.ts` in the SDK. */
  export type PendingCanvasSurface = OutgoingSurface;

  /**
   * Internal kernel-shaped result of a single chat turn — observability-rich
   * for dev UIs, verifier evidence and session logging.
   */
  export interface ChatTurnResult {
    answer: string;
    toolCalls: number;
    iterations: number;
    /**
     * Agentic run trace for the turn, suitable for rendering a tool-trace
     * panel.
     */
    runTrace?: RunTracePayload;
    /**
     * Image attachments emitted by Orchestrator tools during this turn.
     */
    attachments?: DiagramAttachment[];
    /**
     * Downloadable files emitted by Orchestrator tools during this turn.
     */
    fileAttachments?: OutgoingFileAttachment[];
    /**
     * Answer-verifier summary. Populated only when the verifier is configured
     * and ran for this turn.
     */
    verifier?: VerifierResultSummary;
    /**
     * Set when the orchestrator short-circuits after the model invoked
     * `ask_user_choice`.
     */
    pendingUserChoice?: PendingUserChoice;
    /**
     * 1-click refinement buttons rendered below the answer.
     */
    followUpOptions?: FollowUpOption[];
    /**
     * Slot-picker card scheduled by `find_free_slots`.
     */
    pendingSlotCard?: PendingSlotCard;
    /**
     * Routine list smart-card payload scheduled by `manage_routine.list`.
     */
    pendingRoutineList?: PendingRoutineList;
    /**
     * Set to `true` when a calendar tool failed this turn with a
     * `consent_required` AAD error.
     */
    pendingOAuthConsent?: boolean;
    /**
     * Privacy-Proxy aggregate receipt for this turn.
     */
    privacyReceipt?: PrivacyReceipt;
    /**
     * Privacy Shield v4 — real values rendered into `answer` that the LLM
     * never saw.
     */
    maskedValues?: readonly string[];
    /**
     * Omadia UI canvas surface payload.
     */
    surface?: PendingCanvasSurface;
    /**
     * The persisted Turn node external id for this turn.
     */
    turnId?: string;
    /**
     * Cross-session recall probe from prior sessions for this turn.
     */
    recalled?: RecalledContext;
    /**
     * Harness-owned verbatim sub-agent segment for a user-directed specialist
     * turn.
     */
    delegatedAnswer?: DelegatedAnswer;
  }

  /**
   * Routine list payload — kernel-internal mirror of `OutgoingRoutineList`.
   */
  export interface PendingRoutineList {
    filter: 'all' | 'active' | 'paused';
    totals: { all: number; active: number; paused: number };
    routines: Array<{
      id: string;
      name: string;
      cron: string;
      prompt: string;
      status: 'active' | 'paused';
      lastRunAt: string | null;
      lastRunStatus: 'ok' | 'error' | 'timeout' | null;
    }>;
  }

  /**
   * Per-tool agent metadata. Attached by the chat route to `tool_use` events
   * so the UI can render a clickable agent pill.
   */
  export interface AgentMeta {
    id: string;
    label: string;
    tone: 'cyan' | 'navy' | 'magenta' | 'warning';
  }

  /**
   * #332 Layer 1 — plain-text fallback footer for connectors without rich-card
   * UI. Renders the harness-sourced `agentsConsulted` projection as a single
   * readable line, e.g. `🔎 Consulted: Strategist ✓ · 2 steps`. Returns
   * `undefined` when no sub-agent ran (caller appends nothing). Rich connectors
   * (web-ui, Teams) render their own UI from the structured field instead.
   */
  export function agentsConsultedFooterText(
    answer: Pick<SemanticAnswer, 'agentsConsulted'>,
  ): string | undefined;

  /**
   * #332 Layer 1 (gap-closure) — shared derivation so streaming clients
   * (web-ui) and non-streaming `toSemanticAnswer` callers (Teams et al.) build
   * the IDENTICAL curated agentsConsulted array from the same run-trace.
   */
  export function deriveAgentsConsulted(
    runTrace: Pick<RunTracePayload, 'agentInvocations'> | undefined,
  ): AgentConsultation[] | undefined;

  /**
   * Convert the internal kernel-shaped `ChatTurnResult` to the channel-agnostic
   * `SemanticAnswer` contract. Observability-only fields (runTrace, toolCalls,
   * iterations) are dropped — connectors must not see them. Retrieval of
   * `runTrace` for verifier evidence / session logs goes via
   * `Orchestrator.runTurn()` which returns the full internal shape.
   *
   * Lifted from `middleware/src/services/orchestrator.ts` in S+10-2 — colocated
   * with `SemanticAnswer` (its sibling output contract) so channel adapters
   * and the orchestrator-plugin can both import from the same package without
   * pulling in kernel-internal symbols.
   */
  export function toSemanticAnswer(r: ChatTurnResult): SemanticAnswer;

  // ── chatAgentService.ts ──────────────────────────────────────────────────

  /**
   * Service-registry key under which the orchestrator plugin publishes its
   * ChatAgent. Stable contract — channels resolve the agent by this name.
   */
  export const CHAT_AGENT_SERVICE: 'chatAgent';

  /**
   * The bundle the orchestrator publishes under {@link CHAT_AGENT_SERVICE}. The
   * SDK only types `agent` (the part channels need to drive turns); the
   * orchestrator's concrete bundle additionally carries kernel-internal handles
   * that channel plugins should NOT depend on.
   */
  export interface ChatAgentBundle {
    readonly agent: ChatAgent;
  }

  /**
   * Resolve the orchestrator bundle from a PluginContext, or `undefined` when no
   * orchestrator is installed/active.
   */
  export function getChatAgentBundle(
    ctx: import('@omadia/plugin-api').PluginContext,
  ): ChatAgentBundle | undefined;

  /**
   * Resolve the orchestrator's {@link ChatAgent} from a PluginContext. The
   * blessed way for a channel to drive a turn when it wants a folded
   * `SemanticAnswer` (`agent.chat(input)`) or a live event stream
   * (`agent.chatStream(input)`). Returns `undefined` if the orchestrator plugin
   * is not active; callers SHOULD surface a clear "orchestrator unavailable"
   * message rather than silently dropping the turn.
   */
  export function getChatAgent(
    ctx: import('@omadia/plugin-api').PluginContext,
  ): ChatAgent | undefined;

  // ── channelRouting.ts ────────────────────────────────────────────────────

  /**
   * Service-registry key under which the orchestrator plugin publishes its
   * channel resolver. Stable contract — channels resolve it by this name.
   */
  export const CHANNEL_RESOLVER_SERVICE: 'channelResolver';

  export type ChannelResolveDecision = 'bound' | 'fallback' | 'reject';

  /** What {@link ChannelBindingResolver.resolve} returns for a lookup. */
  export interface ChannelResolveResult {
    readonly decision: ChannelResolveDecision;
    /**
     * The bound (or platform-fallback) Agent's scoped {@link ChatAgent}. Present
     * iff `decision !== 'reject'`.
     */
    readonly chatAgent?: ChatAgent;
  }

  /**
   * Structural view of the orchestrator's `ChannelResolver` — the only surface a
   * channel plugin consumes. Kept structural so the SDK does not take a build
   * dependency on `@omadia/orchestrator`.
   */
  export interface ChannelBindingResolver {
    resolve(channelType: string, channelKey: string): ChannelResolveResult;
  }

  /**
   * Resolve the {@link ChatAgent} bound to a given `(channelType, channelKey)`
   * via the platform {@link CHANNEL_RESOLVER_SERVICE}, falling back to the shared
   * singleton agent ({@link getChatAgent}) when the resolver service is not
   * published or rejects the route.
   *
   * Call this **per turn**. A channel adapter that caches the result at
   * activate() defeats per-binding routing and hot config reloads — the whole
   * point of the seam. Returns `undefined` only when neither a bound agent nor
   * the singleton is available (orchestrator plugin inactive).
   */
  export function resolveChatAgentForChannel(
    ctx: import('@omadia/plugin-api').PluginContext,
    channelType: string,
    channelKey: string,
  ): ChatAgent | undefined;

  // ── stores.ts ────────────────────────────────────────────────────────────

  /** A single round-trip: user message + assistant answer. */
  export interface ConversationTurn {
    userMessage: string;
    assistantAnswer: string;
    /** Unix epoch ms. Stores MAY ignore absent values. */
    timestampMs?: number;
  }

  /**
   * Per-conversation-scope history buffer. Scope is a channel-native
   * conversation id — connectors own the scoping convention. Stores enforce a
   * retention policy (TTL, max-turns, LRU eviction) — callers MUST NOT rely on
   * unlimited history.
   */
  export interface ConversationHistoryStore {
    /** Recent turns for this scope, newest last. Returns [] if scope unknown. */
    get(scope: string): ConversationTurn[];
    /**
     * Append a completed turn. Implementations SHOULD drop empty turns
     * (both strings empty) silently.
     */
    append(scope: string, turn: ConversationTurn): void;
    /** Drop all state for a scope. Optional — not every store supports it. */
    clear?(scope: string): void;
  }

  /**
   * An attachment the orchestrator / connector has persisted for later
   * retrieval. The shape is stable across storage backends (Tigris, S3, local
   * fs, in-memory).
   */
  export interface PersistedAttachment {
    /** Storage-internal key. Connectors SHOULD treat as opaque. */
    storageKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    /** Content hash for de-duplication & cache-busting. */
    sha256: string;
    /**
     * Signed proxy URL; present iff the store was configured with a signing
     * key. Undefined means the caller must use `storageKey` + store-internal
     * retrieval.
     */
    signedUrl?: string;
    /** Producer hint (mirror of `OutgoingAttachment.producer`). */
    producer?: string;
  }

  /**
   * Input to `AttachmentStore.put`. Connectors MAY stream or pass a Buffer —
   * implementations typically accept both.
   */
  export interface AttachmentPutInput {
    fileName: string;
    contentType: string;
    /** Raw bytes. Streaming variants are backend-specific. */
    body: Buffer | Uint8Array;
    /** Producer hint. Recorded on the resulting PersistedAttachment. */
    producer?: string;
  }

  /**
   * Channel-agnostic attachment persistence. Connectors may ship their own impl
   * or share a backend via DI once a common bucket strategy is agreed.
   */
  export interface AttachmentStore {
    /** Persist a new attachment. Returns the canonical record. */
    put(input: AttachmentPutInput): Promise<PersistedAttachment>;
    /** Look up by storage key. Returns undefined if unknown / expired. */
    get(storageKey: string): Promise<PersistedAttachment | undefined>;
    /**
     * Produce a signed URL for an existing key, re-signing if the store supports
     * TTL refresh. Implementations without a signing key return undefined —
     * callers must then fall back to storage-native retrieval.
     */
    signUrl?(storageKey: string, ttlMs?: number): Promise<string | undefined>;
  }

  // ── inMemoryConversationHistory.ts ───────────────────────────────────────

  /**
   * Record of a user message that triggered the topic-detector's "ask" branch.
   * While `pending` is set on a scope, the bot is waiting for the user to pick
   * "continue" or "reset"; a fresh user message in between resolves it
   * implicitly.
   */
  export interface PendingTopicDecision {
    /** The user's original message that triggered the clarification. */
    userMessage: string;
    /** Unix millis of when we asked. */
    askedAt: number;
  }

  export interface InMemoryConversationHistoryStoreOptions {
    /** Max turns kept per scope. Oldest dropped first. Defaults to 10. */
    maxTurnsPerScope?: number;
    /** Idle expiry per scope. Defaults to 2 hours. */
    scopeTtlMs?: number;
    /** Cap on number of distinct scopes. Oldest evicted if exceeded. */
    maxScopes?: number;
  }

  /**
   * In-memory implementation of the channel-agnostic conversation history so
   * dynamic-imported channel plugins can construct their own per-channel
   * instance without depending on a kernel singleton. Its turn shape uses `at`
   * (unix millis of the user message) rather than the store contract's optional
   * `timestampMs`. Not concurrency-safe across processes; single-instance per
   * channel.
   */
  export class InMemoryConversationHistoryStore {
    constructor(opts?: InMemoryConversationHistoryStoreOptions);
    get(scope: string): Array<{ userMessage: string; assistantAnswer: string; at: number }>;
    append(
      scope: string,
      turn: { userMessage: string; assistantAnswer: string; at: number },
    ): void;
    resetTurns(scope: string): void;
    markPending(scope: string, pending: PendingTopicDecision): void;
    getPending(scope: string): PendingTopicDecision | undefined;
    clearPending(scope: string): void;
    size(): number;
    clear(): void;
  }

  // ── channelKeyDirectory.ts ───────────────────────────────────────────────

  /** One concrete (channel_type, channel_key) entry the plugin recognises. */
  export interface ChannelKeyEntry {
    /**
     * The opaque key stored in `channel_bindings.channel_key`. Stable across
     * registrations. Format is channel-specific; the platform never parses it —
     * it is treated as an opaque routing selector.
     */
    readonly key: string;
    /**
     * Operator-facing label for the picker. Should be self-describing enough
     * that two adjacent rows are distinguishable without consulting the key.
     */
    readonly label: string;
    /** Free-form context shown beside the label — environment, tenant hint,
     *  conversation name. Optional. */
    readonly hint?: string;
  }

  /**
   * Channel-key directory contract — opt-in by each channel-kind plugin so the
   * operator dashboard can present real `(channel_type, channel_key)` pairs as
   * pickable entries. Each channel-kind plugin owns this knowledge and
   * contributes a directory during activate().
   */
  export interface ChannelKeyDirectory {
    /** The channel-type string used in `channel_bindings.channel_type`. The
     *  plugin owns the canonical spelling. */
    readonly channelType: string;
    /** Display name of the contributing plugin, for the dashboard's per-row
     *  "via @omadia/channel-teams" hint. */
    readonly originPluginId: string;
    /** Returns the keys this plugin can route. Called once per
     *  `/operator/channels` page load — keep it synchronous-fast or memoise
     *  inside the plugin. Errors are caught + logged by the registry. */
    listKeys(): Promise<readonly ChannelKeyEntry[]>;
  }
}
