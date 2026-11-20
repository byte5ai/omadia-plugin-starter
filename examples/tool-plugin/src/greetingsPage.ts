import express, { type Router } from 'express';
import type { TeamsSsoUser } from '@omadia/plugin-api';

export interface GreetingsStats {
  served: number;
  lastName: string | null;
}

/** Escape text for an HTML text node or a double-quoted attribute. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The page that shows plugin data. The SAME router is mounted twice by
 * plugin.ts: behind the omadia session for browsers, and behind the kernel's
 * Teams SSO check for Teams tabs. On the Teams mount the kernel has put the
 * verified user on `req.teamsSsoUser`.
 */
export function createGreetingsRouter(stats: () => GreetingsStats): Router {
  const router = express.Router();
  router.get('/greetings', (req, res) => {
    const viewer = (req as { teamsSsoUser?: TeamsSsoUser }).teamsSsoUser;
    const { served, lastName } = stats();
    const viewerLine = viewer
      ? `<p>Signed in through Teams as ${escapeHtml(viewer.upn ?? viewer.oid)}.</p>`
      : '';
    res
      .type('html')
      .set('Cache-Control', 'no-store')
      .send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Greetings</title></head>
  <body>
    <h1>Greetings</h1>
    <p>Greetings served since activation: ${String(served)}</p>
    <p>Last greeted: ${lastName === null ? 'nobody yet' : escapeHtml(lastName)}</p>
    ${viewerLine}
  </body>
</html>`);
  });
  return router;
}
