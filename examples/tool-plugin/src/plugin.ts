import type { PluginContext } from '@omadia/plugin-api';

import { createGreetingsRouter, type GreetingsStats } from './greetingsPage.js';
import { TEAMS_DATA_SEGMENT, createTeamsTabRouters } from './teamsTab.js';

/**
 * Reverse-DNS identity — MUST equal `identity.id` in manifest.yaml and the
 * `name` field of package.json.
 */
export const PLUGIN_ID = '@acme/tool-hello' as const;

/** Plugin pages live under `/p/<id without scope>`; channel-teams builds tab
 *  URLs from the same rule. */
const PAGE_MOUNT = '/p/' + PLUGIN_ID.replace(/^@[^/]+\//, '');
/** Teams-tab surface. MUST equal the manifest `permissions.public_paths` entry. */
const TEAMS_MOUNT = `${PAGE_MOUNT}/teams`;

export interface PluginHandle {
  close(): Promise<void>;
}

/**
 * Capability plugins (kind `tool`) export `activate(ctx)`. The host calls it
 * once, scoped to this plugin's identity, and keeps the returned handle until
 * shutdown. The plugin registers tools and returns `{ close }`: no toolkit
 * object, no sub-agent, no system prompt, no model loop. Which agent may call
 * the tools is the operator's grant, not the plugin's business.
 */
export async function activate(ctx: PluginContext): Promise<PluginHandle> {
  ctx.log('activating', { pluginId: PLUGIN_ID });

  // Manifest `setup.fields` arrive via ctx.config (plain values) and
  // ctx.secrets (vault-encrypted). Always provide a sensible fallback.
  const greeting = ctx.config.get<string>('greeting') ?? 'Hello';

  const stats: GreetingsStats = { served: 0, lastName: null };
  const disposers: Array<() => void> = [];

  // Register every tool with ctx.tools.register(spec, handler). Names are
  // unique across the whole instance, so keep the plugin prefix (`hello_`).
  // Each name + input_schema MUST match a `capabilities` entry in
  // manifest.yaml, and that entry carries the tool's `side_effects`.
  // What an agent needs to know about a tool belongs in `description` (and in
  // the manifest's `playbook`), because the plugin has no prompt of its own.
  disposers.push(
    ctx.tools.register(
      {
        name: 'hello_say',
        description:
          'Returns a friendly greeting for the given name. Without a name it greets the world.',
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
        stats.served += 1;
        stats.lastName = who;
        // A native tool ALWAYS returns a string, usually JSON the model reads.
        return JSON.stringify({ message: `${greeting}, ${who}!` });
      },
    ),
  );

  disposers.push(
    ctx.tools.register(
      {
        name: 'hello_stats',
        description:
          'Returns how many greetings were served since activation and who was greeted last.',
        input_schema: { type: 'object', properties: {} },
      },
      async () => JSON.stringify({ served: stats.served, last_name: stats.lastName }),
    ),
  );

  // ── Optional: a page with plugin data, for browsers AND Teams tabs. ──────
  // Delete this block, greetingsPage.ts, teamsTab.ts and the manifest's
  // `public_paths` entry if your plugin has no pages.
  const greetingsRouter = createGreetingsRouter(() => ({ ...stats }));

  // 1. Browser: behind the omadia operator session. Spelled out on purpose —
  //    never flip a data route to 'public'/'custom' to "fix" a 401 in Teams.
  disposers.push(ctx.routes.register(PAGE_MOUNT, greetingsRouter, { auth: 'session' }));

  // 2. Teams: a data-free shell ('public') plus the data ('teams-sso'), both
  //    beneath the declared, operator-granted public path TEAMS_MOUNT.
  const teamsTab = createTeamsTabRouters({
    mountPath: TEAMS_MOUNT,
    pages: [{ path: '/greetings', title: 'Greetings' }],
    pageRouters: [greetingsRouter],
  });
  disposers.push(ctx.routes.register(TEAMS_MOUNT, teamsTab.shell, { auth: 'public' }));
  disposers.push(
    ctx.routes.register(TEAMS_MOUNT + TEAMS_DATA_SEGMENT, teamsTab.data, { auth: 'teams-sso' }),
  );

  // 3. Make the page discoverable (channel-teams Hub cards, tab config). The
  //    path is relative to PAGE_MOUNT and points at the Teams SHELL, because
  //    channel-teams pins it as the tab URL.
  disposers.push(
    ctx.uiRoutes.register({
      routeId: 'greetings',
      path: '/teams/greetings',
      title: 'Greetings',
      description: 'How many greetings the Hello tools served.',
    }),
  );

  ctx.log('activated', { tools: ['hello_say', 'hello_stats'], pages: [`${PAGE_MOUNT}/greetings`] });

  return {
    async close() {
      ctx.log('deactivating');
      for (const dispose of disposers.reverse()) dispose();
    },
  };
}

export default { PLUGIN_ID, activate };
