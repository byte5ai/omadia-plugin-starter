/**
 * Local type stubs for `@omadia/plugin-api`.
 *
 * The real package is provided by the Omadia host at runtime — it is NOT
 * published to npm, so you do not (and cannot) `npm install` it. These ambient
 * declarations mirror the host's public surface closely enough to compile your
 * plugin offline. At runtime the host injects the genuine implementations.
 *
 * Keep this file in sync with the Omadia version you target. When in doubt,
 * the live contract lives in the Omadia source under
 * `middleware/packages/plugin-api`.
 */
declare module '@omadia/plugin-api' {
  export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

  /** Vault-backed secrets declared as `type: secret` setup fields. */
  export interface SecretsAccessor {
    /** Returns the secret, or `undefined` if it was never set. */
    get(name: string): Promise<string | undefined>;
    /** Returns the secret, or throws if missing. */
    require(name: string): Promise<string>;
  }

  /** Plain (non-secret) setup fields from the manifest `setup.fields`. */
  export interface ConfigAccessor {
    get<T = string>(name: string): T | undefined;
  }

  /** Cross-plugin service registry. Keys are strings; contracts are by convention. */
  export interface ServicesAccessor {
    get<T>(name: string): T | undefined;
    has(name: string): boolean;
    /** Publish a service for other plugins; returns a dispose handle. */
    provide<T>(name: string, impl: T): () => void;
    replace<T>(name: string, impl: T): () => void;
  }

  /** A native tool the orchestrator can call. Mirror this under manifest `capabilities`. */
  export interface NativeToolSpec {
    readonly name: string;
    readonly description: string;
    readonly input_schema: {
      readonly type: 'object';
      readonly properties: Record<string, unknown>;
      readonly required?: readonly string[];
    };
    readonly domain?: string;
  }

  /** A native tool ALWAYS returns a string (commonly JSON the model reads). */
  export type NativeToolHandler = (input: unknown) => Promise<string>;

  export interface ToolsAccessor {
    register(spec: NativeToolSpec, handler: NativeToolHandler): void;
  }

  /**
   * Mount HTTP routes owned by this plugin. `router` is an Express `Router` at
   * runtime; typed loosely here so this stub needs no `express` dependency.
   * Returns a dispose handle that un-mounts the routes on deactivation.
   */
  export interface RoutesAccessor {
    register(prefix: string, router: unknown): () => void;
  }

  /** Same shape as RoutesAccessor, used for operator-facing admin UI routes. */
  export interface UiRoutesAccessor {
    register(prefix: string, router: unknown): () => void;
  }

  export interface HttpResponse {
    readonly status: number;
    readonly ok: boolean;
    readonly headers: Record<string, string>;
    text(): Promise<string>;
    json<T = unknown>(): Promise<T>;
  }

  /**
   * Allow-listed outbound HTTP. Present only when the manifest declares
   * `permissions.network.outbound`. All traffic is gated against that list.
   */
  export interface HttpAccessor {
    fetch(
      url: string,
      init?: { method?: string; headers?: Record<string, string>; body?: string },
    ): Promise<HttpResponse>;
  }

  export interface NotificationsAccessor {
    send(message: string, context?: Record<string, unknown>): Promise<void>;
  }

  export interface JobsAccessor {
    schedule(name: string, cron: string, handler: () => Promise<void>): () => void;
  }

  export interface ScratchDirAccessor {
    readonly path: string;
  }

  // Optional accessors — present only when the manifest declares the matching
  // permission. Typed loosely; consult the live SDK for their full shapes.
  export interface MemoryAccessor {
    [key: string]: unknown;
  }
  export interface KnowledgeGraphAccessor {
    [key: string]: unknown;
  }
  export interface LlmAccessor {
    [key: string]: unknown;
  }
  export interface SubAgentAccessor {
    [key: string]: unknown;
  }

  /**
   * The single argument the host passes to a plugin's `activate(ctx)`. Every
   * external effect (secrets, network, filesystem, memory, graph, LLM) flows
   * through a `ctx` accessor scoped by the plugin's manifest permissions.
   */
  export interface PluginContext {
    readonly agentId: string;
    readonly domain: string;
    readonly secrets: SecretsAccessor;
    readonly config: ConfigAccessor;
    readonly services: ServicesAccessor;
    /** True while the kernel validates the plugin (return mock data, skip real calls). */
    readonly smokeMode: boolean;
    readonly tools: ToolsAccessor;
    readonly routes: RoutesAccessor;
    readonly uiRoutes: UiRoutesAccessor;
    readonly notifications: NotificationsAccessor;
    readonly jobs: JobsAccessor;
    readonly scratch?: ScratchDirAccessor;
    readonly http?: HttpAccessor;
    readonly memory?: MemoryAccessor;
    readonly knowledgeGraph?: KnowledgeGraphAccessor;
    readonly llm?: LlmAccessor;
    readonly subAgent?: SubAgentAccessor;
    log(...args: unknown[]): void;
  }
}
