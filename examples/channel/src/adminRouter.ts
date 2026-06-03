import express, { type Router } from 'express';

export interface AdminStatus {
  ok: boolean;
  configured: boolean;
  lastDeliveryAt: string | null;
  lastError: string | null;
}

export interface AdminRouterDeps {
  /** True while the kernel validates the plugin — return deterministic mock data. */
  smokeMode: boolean;
  status: () => AdminStatus;
}

/**
 * Builds the admin Router the Omadia web UI renders in an iframe (the path is
 * declared as `admin_ui_path` in manifest.yaml). It serves a tiny status page
 * at `/index.html` and a JSON probe at `/api/status`.
 */
export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = express.Router();

  router.get('/api/status', (_req, res) => {
    if (deps.smokeMode) {
      res.json({ ok: true, configured: true, lastDeliveryAt: null, lastError: null, smoke: true });
      return;
    }
    res.json(deps.status());
  });

  router.get(['/', '/index.html'], (_req, res) => {
    res.type('html').send(PAGE);
  });

  return router;
}

const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Webhook channel</title>
    <style>
      body { font: 14px system-ui, sans-serif; margin: 2rem; color: #111; }
      code { background: #f3f3f3; padding: .1rem .3rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>Webhook channel</h1>
    <p id="status">Loading status…</p>
    <p>
      POST messages to <code>/api/example-channel/webhook</code> as
      <code>{ "text": "…", "conversationId": "…", "userId": "…" }</code>.
    </p>
    <script>
      fetch('api/status')
        .then((r) => r.json())
        .then((d) => {
          document.getElementById('status').textContent =
            (d.ok ? '● connected' : '● error') +
            (d.lastError ? ' — ' + d.lastError : '');
        })
        .catch(() => {
          document.getElementById('status').textContent = '● status unavailable';
        });
    </script>
  </body>
</html>`;
