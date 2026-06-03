import express from 'express';
import type { PluginContext } from '@omadia/plugin-api';
import type { ChannelHandle, CoreApi, IncomingTurn } from '@omadia/channel-sdk';

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
      const turn: IncomingTurn = {
        channelId,
        conversationId: body.conversationId ?? 'default',
        text,
        userRef: { kind: 'custom', id: body.userId ?? 'anonymous' },
      };

      // Drive an orchestrator turn and accumulate the textual reply. The full
      // ChatStreamEvent union is defined by @omadia/channel-sdk; here we simply
      // concatenate any text the events carry. A real adapter would also render
      // cards/attachments for the platforms that support them.
      let reply = '';
      for await (const event of core.handleTurnStream(turn)) {
        if (typeof event.text === 'string') reply += event.text;
      }

      lastDeliveryAt = new Date().toISOString();
      lastError = null;
      res.json({ reply });
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
