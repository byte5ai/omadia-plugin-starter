/**
 * Local type stubs for `@omadia/channel-sdk`.
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
    kind: ChannelUserKind;
    id: string;
    display?: string;
  }

  export interface PlatformIdentity {
    id: string;
    userRef: ChannelUserRef;
  }

  /** A native event translated into the core, channel-agnostic turn shape. */
  export interface IncomingTurn {
    channelId: string;
    conversationId: string;
    text: string;
    userRef: ChannelUserRef;
  }

  /**
   * The orchestrator emits a stream of these per turn. The full discriminated
   * union is defined by the SDK; treated permissively here so adapters can read
   * whatever fields their Omadia version emits (text deltas, a terminal event,
   * tool activity, …).
   */
  export interface ChatStreamEvent {
    type: string;
    text?: string;
    [key: string]: unknown;
  }

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
  }

  /** Returned from a channel's `activate`; `close()` tears the channel down. */
  export interface ChannelHandle {
    close(): Promise<void>;
  }
}
