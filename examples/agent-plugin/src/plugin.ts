import type { PluginContext } from '@omadia/plugin-api';

/**
 * Reverse-DNS identity — MUST equal `identity.id` in manifest.yaml and the
 * `name` field of package.json.
 */
export const AGENT_ID = '@acme/agent-hello' as const;

export interface AgentHandle {
  close(): Promise<void>;
}

/**
 * Agent plugins export `activate(ctx)`. The host calls it once, scoped to this
 * plugin's identity, and keeps the returned handle until shutdown.
 */
export async function activate(ctx: PluginContext): Promise<AgentHandle> {
  ctx.log('activating', { agentId: AGENT_ID });

  // Manifest `setup.fields` arrive via ctx.config (plain values) and
  // ctx.secrets (vault-encrypted). Always provide a sensible fallback.
  const greeting = ctx.config.get<string>('greeting') ?? 'Hello';

  // Register one native tool. Its `name` + `input_schema` MUST match the
  // matching entry under `capabilities` in manifest.yaml.
  ctx.tools.register(
    {
      name: 'say_hello',
      description: 'Returns a friendly greeting for the given name.',
      input_schema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Who to greet.' },
        },
        required: ['name'],
      },
    },
    async (input) => {
      const { name } = (input ?? {}) as { name?: string };
      const who = (name ?? '').trim() || 'world';
      // A native tool ALWAYS returns a string — usually JSON the model reads.
      return JSON.stringify({ message: `${greeting}, ${who}!` });
    },
  );

  ctx.log('activated', { tools: ['say_hello'] });

  return {
    async close() {
      ctx.log('deactivating');
    },
  };
}

export default { AGENT_ID, activate };
