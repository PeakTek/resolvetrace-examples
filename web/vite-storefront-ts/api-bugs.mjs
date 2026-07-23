/**
 * The storefront's own (deliberately broken) API — `/api/*`.
 *
 * This is the APP's backend, NOT the ResolveTrace ingest endpoint. It is
 * intentionally buggy so the SDK's automatic API-error capture has something to
 * catch: the browser calls these, they fail, and `error.api` breadcrumbs are
 * recorded with no code in the app.
 *
 * One dependency-free handler, shared by BOTH runtimes so dev and prod behave
 * identically:
 *   - `serve.mjs` (production container) calls it before static serving.
 *   - `vite.config.ts` mounts it as dev middleware (`npm run dev` / preview).
 *
 * `handleApi(req, res)` returns `true` when it handled the request (so the
 * caller stops), `false` when the path is not an `/api/*` route (fall through
 * to static files / the SPA shell).
 *
 * The intentional failures:
 *   GET  /api/products                  → 200  (the ONE working call — a
 *                                               `perf.api_latency` success breadcrumb)
 *   GET  /api/products/:id/reviews      → 404  ("reviews service" not wired up)
 *   POST /api/checkout                  → 500  (payment gateway blows up)
 */

/** The catalog. Server-owned; the browser renders whatever it receives. */
export const PRODUCTS = [
  { id: 'aurora-lamp', name: 'Aurora Desk Lamp', price: 89, blurb: 'Warm, dimmable, and quietly overpriced.', emoji: '💡' },
  { id: 'nimbus-chair', name: 'Nimbus Task Chair', price: 349, blurb: 'Lumbar support for people who ship on Fridays.', emoji: '🪑' },
  { id: 'tidal-bottle', name: 'Tidal Water Bottle', price: 28, blurb: 'Keeps cold things cold. Revolutionary.', emoji: '🍶' },
  { id: 'ember-mug', name: 'Ember Travel Mug', price: 42, blurb: 'Your coffee, still warm three meetings later.', emoji: '☕' },
  { id: 'summit-pack', name: 'Summit Daypack', price: 120, blurb: '18L of "I could leave for the mountains right now".', emoji: '🎒' },
  { id: 'drift-headphones', name: 'Drift Headphones', price: 199, blurb: 'Noise-cancelling, including your inbox.', emoji: '🎧' },
];

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/**
 * Handle an `/api/*` request. Returns true if handled.
 * Works with both Node's raw http server and Vite/connect middleware
 * (both give Node IncomingMessage / ServerResponse).
 */
export function handleApi(req, res) {
  const method = (req.method ?? 'GET').toUpperCase();
  const path = (req.url ?? '/').split('?')[0];

  if (!path.startsWith('/api/')) return false;

  // GET /api/products — the one call that WORKS (success breadcrumb).
  if (method === 'GET' && path === '/api/products') {
    sendJson(res, 200, { products: PRODUCTS });
    return true;
  }

  // GET /api/products/:id/reviews — 404: the reviews service was never built.
  const reviews = path.match(/^\/api\/products\/([^/]+)\/reviews$/);
  if (method === 'GET' && reviews) {
    sendJson(res, 404, {
      error: 'not_found',
      message: `No reviews service for product "${decodeURIComponent(reviews[1])}".`,
    });
    return true;
  }

  // POST /api/checkout — 500: the "payment gateway" always falls over.
  if (method === 'POST' && path === '/api/checkout') {
    // Body is intentionally ignored — this route always fails.
    sendJson(res, 500, {
      error: 'payment_gateway_error',
      message: 'The payment gateway returned an unexpected error. Please try again.',
    });
    return true;
  }

  // Any other /api/* path — 404 so it still reads as an API error, not the SPA.
  sendJson(res, 404, { error: 'not_found', message: `No route for ${method} ${path}.` });
  return true;
}
