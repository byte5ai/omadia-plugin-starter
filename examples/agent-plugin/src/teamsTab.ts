import express, { type Router } from 'express';

import { escapeHtml } from './greetingsPage.js';

/**
 * Teams tabs (byte5ai/omadia#1620). A Teams tab loads its URL as a plain GET
 * with no omadia session and no bearer token, so it gets two mounts under ONE
 * declared and operator-granted `permissions.public_paths` entry:
 *
 *   <mountPath><path>         data-free shell,  auth: 'public'
 *   <mountPath>/_data<path>   the real page,    auth: 'teams-sso'
 *
 * The shell asks Teams for an SSO token and fetches the page from the data
 * mount with it. The kernel verifies that token before the data router runs.
 */

/** Pinned Teams JS SDK + its subresource-integrity hash (same as core codegen). */
const TEAMS_JS_URL = 'https://res.cdn.office.net/teams-js/2.34.0/js/MicrosoftTeams.min.js';
const TEAMS_JS_INTEGRITY =
  'sha384-brW9AazbKR2dYw2DucGgWCCcmrm2oBFV4HQidyuyZRI/TnAkmOOnTARSTdps3Hwt';

/** Data segment below mountPath. The `_` cannot collide with a page path. */
export const TEAMS_DATA_SEGMENT = '/_data';

export interface TeamsTabPage {
  /** Path of the page, e.g. `/greetings`. */
  readonly path: string;
  readonly title: string;
}

export interface TeamsTabOptions {
  /** Absolute mount of the shell router, e.g. `/p/agent-hello/teams`. */
  readonly mountPath: string;
  readonly pages: readonly TeamsTabPage[];
  /** The router(s) that render the pages. Merged into ONE data router: the
   *  kernel dispatches a granted path to a single route entry. */
  readonly pageRouters: readonly Router[];
}

function shellScript(dataUrl: string): string {
  return `
(function () {
  var status = document.getElementById('omadia-status');
  var show = function (message) { if (status) status.textContent = message; };
  var sdk = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = ${JSON.stringify(TEAMS_JS_URL)};
    s.integrity = ${JSON.stringify(TEAMS_JS_INTEGRITY)};
    s.crossOrigin = 'anonymous';
    s.onload = function () { resolve(window.microsoftTeams); };
    s.onerror = function () { reject(new Error('Teams SDK failed to load.')); };
    document.head.appendChild(s);
  });
  var outsideTeams = new Promise(function (_resolve, reject) {
    setTimeout(function () { reject(new Error('Open this page inside Microsoft Teams.')); }, 8000);
  });
  Promise.race([
    sdk.then(function (t) { return t.app.initialize().then(function () { return t; }); }),
    outsideTeams,
  ]).then(function (t) {
    return t.authentication.getAuthToken();
  }).then(function (token) {
    return fetch(${JSON.stringify(dataUrl)} + window.location.search, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'omit',
      cache: 'no-store',
    });
  }).then(function (res) {
    if (!res.ok) throw new Error('Not authorised (' + res.status + ').');
    return res.text();
  }).then(function (page) {
    document.open();
    document.write(page);
    document.close();
  }).catch(function (err) {
    show((err && err.message) || String(err));
  });
})();`;
}

/** The shell: title and a status line, never any plugin data. */
function shellHtml(title: string, dataUrl: string): string {
  // `dataUrl` is built from this plugin's own constants, never from a request.
  const script = shellScript(dataUrl);
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(title)}</title></head>
  <body>
    <p id="omadia-status">Loading…</p>
    <script>${script}</script>
  </body>
</html>`;
}

export function createTeamsTabRouters(opts: TeamsTabOptions): { shell: Router; data: Router } {
  const shell = express.Router();
  for (const page of opts.pages) {
    const html = shellHtml(page.title, opts.mountPath + TEAMS_DATA_SEGMENT + page.path);
    shell.get(page.path, (_req, res) => {
      res.type('html').set('Cache-Control', 'no-store').send(html);
    });
  }

  const data = express.Router();
  // FIRST middleware, fail-closed: a core older than plugin-api 1.51.0 does
  // not know `auth: 'teams-sso'` and never sets `req.teamsSsoUser`. Without
  // this guard such a core could hand the pages out unauthenticated.
  data.use((req, res, next) => {
    if (!(req as { teamsSsoUser?: unknown }).teamsSsoUser) {
      res.status(401).json({ code: 'auth.teams_sso_required' });
      return;
    }
    next();
  });
  for (const router of opts.pageRouters) data.use(router);
  return { shell, data };
}
