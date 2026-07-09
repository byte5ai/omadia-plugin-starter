import express from 'express';
import type { PluginContext } from '@omadia/plugin-api';
import {
  NO_REPLY_SENTINEL,
  isNoReply,
  type ChannelHandle,
  type CoreApi,
  type IncomingTurn,
} from '@omadia/channel-sdk';

import { createAdminRouter } from './adminRouter.js';

/** Reverse-DNS identity — MUST equal manifest `identity.id` and package "name". */
export const CHANNEL_ID = '@acme/channel-webhook' as const;

const WEBHOOK_PREFIX = '/api/example-channel';
const ADMIN_PREFIX = '/api/example-channel/admin';

/**
 * Channel plugins export `activate(ctx, core)`. `ctx` scopes secrets/config/
 * routes to this plugin; `core` drives orchestrator turns and resolves users.
 */
export async function activate(ctx: PluginContext, core: CoreApi): Promise<ChannelHandle> {
  const channelId = ctx.agentId;

  // Optional shared secret (declared as a `secret` setup field → vault).
  const signingSecret = await ctx.secrets.get('signing_secret');

  let lastDeliveryAt: string | null = null;
  let lastError: string | null = null;

  // ── Inbound: the webhook route the host exposes for this channel. ───────
  const webhookRouter = express.Router();
  webhookRouter.post('/webhook', express.json(), async (req, res) => {
    try {
      if (signingSecret && req.header('x-webhook-secret') !== signingSecret) {
        res.status(401).json({ error: 'bad signature' });
        return;
      }

      const body = (req.body ?? {}) as { text?: string; conversationId?: string; userId?: string };
      const text = (body.text ?? '').trim();
      if (!text) {
        res.status(400).json({ error: 'missing "text"' });
        return;
      }

      // Translate the native payload into the core, channel-agnostic turn.
      //
      // NOTE: this single-tenant example drives the shared orchestrator via
      // `core.handleTurnStream`. A real multi-tenant / direct-agent channel —
      // one where the operator binds several Agents to distinct routes — MUST
      // set `channelType` + `channelKey` here and resolve the bound agent per
      // turn with `resolveChatAgentForChannel(ctx, channelType, channelKey)`
      // instead of forwarding to the shared singleton.
      const turn: IncomingTurn = {
        channelId,
        conversationId: body.conversationId ?? 'default',
        text,
        userRef: { kind: 'custom', id: body.userId ?? 'anonymous' },
      };

      // Drive an orchestrator turn. `handleTurnStream` yields the full
      // ChatStreamEvent union; branch on `event.type` to consume it. This
      // minimal adapter accumulates `text_delta` chunks and prefers the
      // authoritative `done.answer`. A richer channel would also render tool
      // traces, cards, attachments and canvas `surface_*` events for the
      // platforms that support them.
      let streamed = '';
      let finalAnswer: string | null = null;
      for await (const event of core.handleTurnStream(turn)) {
        switch (event.type) {
          case 'text_delta':
            streamed += event.text;
            break;
          case 'done':
            finalAnswer = event.answer;
            break;
          case 'error':
            throw new Error(event.message);
          default:
            // tool_use / heartbeat / surface_* / … — ignored by this text-only
            // adapter.
            break;
        }
      }

      // Prefer the authoritative final answer; fall back to concatenated deltas.
      const answer = (finalAnswer ?? streamed).trim();

      lastDeliveryAt = new Date().toISOString();
      lastError = null;

      // Drop deliberate no-reply turns instead of forwarding the sentinel to the
      // user. `isNoReply` matches both the strict `NO_REPLY` answer and the
      // trailing-line "I won't reply because…" anti-pattern; the strict compare
      // against `NO_REPLY_SENTINEL` short-circuits the common case.
      if (answer === NO_REPLY_SENTINEL || isNoReply({ text: answer })) {
        core.log('info', 'dropping no-reply turn', { conversationId: turn.conversationId });
        res.status(204).end();
        return;
      }

      res.json({ reply: answer });
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      core.log('error', 'webhook delivery failed', { error: lastError });
      res.status(500).json({ error: 'internal error' });
    }
  });
  const disposeWebhook = ctx.routes.register(WEBHOOK_PREFIX, webhookRouter);

  // ── Admin UI: status iframe surfaced by the Omadia web UI. ──────────────
  const disposeAdmin = ctx.routes.register(
    ADMIN_PREFIX,
    createAdminRouter({
      smokeMode: ctx.smokeMode,
      status: () => ({
        ok: lastError === null,
        configured: Boolean(signingSecret),
        lastDeliveryAt,
        lastError,
      }),
    }),
  );

  core.log('info', 'webhook channel activated', {
    webhook: `${WEBHOOK_PREFIX}/webhook`,
    adminUi: `${ADMIN_PREFIX}/index.html`,
  });

  return {
    async close() {
      disposeWebhook();
      disposeAdmin();
    },
  };
}

export default { CHANNEL_ID, activate };
