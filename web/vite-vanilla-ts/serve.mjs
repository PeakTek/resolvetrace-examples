/**
 * Minimal static server for the OSS demo image.
 *
 * Writes `config.js` from container env at startup (so the browser reads its
 * endpoint + events:write key from `window.__RT_CONFIG__` — see src/config.ts),
 * then serves the built app. The OSS demo has NO managed backend, so there is
 * deliberately no `/api/*` here. Dependency-free (Node builtins only) to keep
 * the runtime image small.
 *
 * Env:
 *   RT_INGEST_ENDPOINT    data-plane URL the browser SDK posts to (required)
 *   RT_PUBLIC_TENANT_KEY  browser-exposed tenant key, events:write only (required)
 *   PORT                  default 8080
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// Static root. In the image the build lands at /app/public (see Dockerfile);
// override with SERVE_ROOT for local runs against a `dist/` tree.
const ROOT = process.env.SERVE_ROOT
  ? resolve(process.env.SERVE_ROOT)
  : join(here, 'public');
const PORT = Number(process.env.PORT ?? '8080');

// Endpoint + key come from container env in a real deployment. The container
// sets NODE_ENV=production and MUST provide both (fail-fast). For local runs
// (`node serve.mjs`) we fall back to dev defaults so the demo serves without
// env — matching resolvetrace-core's deploy/docker-compose.yml.
const endpoint = process.env.RT_INGEST_ENDPOINT ?? 'http://localhost:4317';
const apiKey =
  process.env.RT_PUBLIC_TENANT_KEY ?? 'replace-me-with-long-random-string';

if (process.env.NODE_ENV === 'production') {
  for (const k of ['RT_INGEST_ENDPOINT', 'RT_PUBLIC_TENANT_KEY']) {
    if (!process.env[k]) {
      console.error(`oss-demo: missing required env ${k}`);
      process.exit(1);
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

// Materialize the browser runtime config from env, before serving. JSON.stringify
// gives safe escaping; nothing environment-specific is baked into the bundle.
await writeFile(
  join(ROOT, 'config.js'),
  `window.__RT_CONFIG__ = ${JSON.stringify({ endpoint, apiKey })};\n`,
  'utf8',
);

/** Map a request path to a file under ROOT, confined to ROOT, with SPA fallback. */
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const full = join(ROOT, clean);
  if (!full.startsWith(ROOT)) return join(ROOT, 'index.html'); // path traversal → app shell
  return clean === '' || clean.endsWith('/') ? join(full, 'index.html') : full;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  const path = (req.url ?? '/').split('?')[0];
  if (path === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
    return;
  }

  let ext;
  let data;
  try {
    const file = resolveFile(req.url ?? '/');
    try {
      data = await readFile(file);
      ext = extname(file);
    } catch {
      data = await readFile(join(ROOT, 'index.html')); // SPA fallback
      ext = '.html';
    }
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    res.writeHead(500);
    res.end();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`oss-demo: serving ${ROOT} on :${PORT} → ${endpoint}`);
});
