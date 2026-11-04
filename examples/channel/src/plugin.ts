import { createHmac, timingSafeEqual } from 'node:crypto';

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

/**
 * The inbound webhook. It must be reachable WITHOUT an omadia session (the
 * sender is an external system), so it is registered with `auth: 'custom'` and
 * this exact prefix is declared in manifest `permissions.public_paths`. The
 * operator has to grant it after install; until then it is not served.
 */
const WEBHOOK_PREFIX = '/api/example-channel/webhook';
/** The admin UI stays behind the operator session (the default). */
const ADMIN_PREFIX = '/api/example-channel/admin';

const SIGNATURE_HEADER = 'x-signature-256';

/**
 * `sha256=<hex>` HMAC over the raw request bytes, compared in constant time.
 * Never sign `JSON.stringify(req.body)`: re-serialising changes the bytes.
 */
function hasValidSignature(raw: Buffer, given: string | undefined, secret: string): boolean {
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const actual = Buffer.from(given ?? '');
  // timingSafeEqual throws on a length mismatch, hence the length check first.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface WebhookBody {
  text?: unknown;
  conversationId?: unknown;
  userId?: unknown;
}

function parseBody(raw: Buffer): WebhookBody | null {
  try {
    const parsed: unknown = JSON.parse(raw.toString('utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as WebhookBody) : null;
  } catch {
    return null;
  }
}

/**
 * Channel plugins export `activate(ctx, core)`. `ctx` scopes secrets/config/
 * routes to this plugin; `core` drives orchestrator turns and resolves users.
 */
export async function activate(ctx: PluginContext, core: CoreApi): Promise<ChannelHandle> {
  const channelId = ctx.agentId;

  // `auth: 'custom'` promises that this plugin authenticates EVERY request
  // itself, so the webhook refuses everything until a signing secret is set.
  const signingSecret = await ctx.secrets.get('signing_secret');
  if (signingSecret) {
    ctx.status.clear();
  } else {
    ctx.status.report({
      state: 'needs_action',
      title: 'Signing secret missing',
      detail: 'Set the webhook signing secret; until then every webhook call is refused.',
    });
  }

  let lastDeliveryAt: string | null = null;
  let lastError: string | null = null;

  // ── Inbound: the webhook route, mounted at WEBHOOK_PREFIX. ──────────────
  const webhookRouter = express.Router();
  webhookRouter.post('/', async (req, res) => {
    try {
      if (!signingSecret) {
        res.status(503).json({ error: 'webhook not configured' });
        return;
      }
      // `body: 'raw'` hands over the untouched bytes as a Buffer.
      const raw: unknown = req.body;
      if (!Buffer.isBuffer(raw) || !hasValidSignature(raw, req.get(SIGNATURE_HEADER), signingSecret)) {
        res.status(401).json({ error: 'bad signature' });
        return;
      }

      const body = parseBody(raw);
      const text = typeof body?.text === 'string' ? body.text.trim() : '';
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
        conversationId: typeof body?.conversationId === 'string' ? body.conversationId : 'default',
        text,
        userRef: { kind: 'custom', id: typeof body?.userId === 'string' ? body.userId : 'anonymous' },
      };

      // Drive an orchestrator turn. `handleTurnStream` yields the full
      // ChatStreamEvent union; branch on `event.type` to consume it. This
      // minimal adapter accumulates the `text_delta` preview (minus what
      // `text_retract` takes back) and prefers the authoritative `done.answer`.
      // A richer channel would also render tool traces, cards, attachments and
      // canvas `surface_*` events for the platforms that support them.
      let streamed = '';
      let finalAnswer: string | null = null;
      for await (const event of core.handleTurnStream(turn)) {
        switch (event.type) {
          case 'text_delta':
            streamed += event.text;
            break;
          case 'text_retract':
            streamed = streamed.slice(0, Math.max(0, streamed.length - event.chars));
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

      // Prefer the authoritative final answer; fall back to the preview.
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
  const disposeWebhook = ctx.routes.register(WEBHOOK_PREFIX, webhookRouter, {
    auth: 'custom',
    body: 'raw',
  });

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
    { auth: 'session' },
  );

  core.log('info', 'webhook channel activated', {
    webhook: WEBHOOK_PREFIX,
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
