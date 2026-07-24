/**
 * Nimbus Supply Co. — a deliberately buggy demo storefront on
 * `@peaktek/resolvetrace-sdk`.
 *
 * The entire SDK integration is the single `createClient(...)` below. From that
 * one call you get, with no per-event code:
 *   - automatic capture of uncaught JS errors (`error.js`) and failed API calls
 *     (`error.api`) — these are ON BY DEFAULT, so we don't configure them;
 *   - whole-session masked replay that records the user's journey — including
 *     the client-side route changes between "pages" — as ONE continuous
 *     recording (we opt into replay, off by default);
 *   - a floating "Report a problem" widget for user-reported issues.
 *
 * Config (endpoint + key) is read at startup from `window.__RT_CONFIG__` (a
 * `config.js` the hosting container writes from env — see serve.mjs), so the
 * built bundle bakes in no endpoint or key.
 */

import { createClient, type ResolveTraceClient } from '@peaktek/resolvetrace-sdk';
import type { PageContext } from './context';
import { route, setNotFound, onNavigate, navigate, startRouter } from './router';
import { $ } from './helpers';
import { onCartChange } from './store';
import { renderHome } from './pages/home';
import { renderProducts } from './pages/products';
import { renderProduct } from './pages/product';
import { renderCart } from './pages/cart';
import { renderCheckout } from './pages/checkout';
import { renderOrder } from './pages/order';

declare global {
  interface Window {
    __RT_CONFIG__?: { endpoint?: unknown; apiKey?: unknown };
  }
}

const injected = window.__RT_CONFIG__ ?? {};
const endpoint =
  typeof injected.endpoint === 'string' && injected.endpoint
    ? injected.endpoint
    : 'http://localhost:4317';
const apiKey =
  typeof injected.apiKey === 'string' && injected.apiKey
    ? injected.apiKey
    : 'replace-me-with-long-random-string';

// The whole integration. Auto-capture (JS + API errors) is on by default, so
// there is nothing to configure for exceptions. The report widget runs in
// RECORD mode: replay is `review` (spans are buffered locally and uploaded only
// on Submit). `record: true` opts in — the SERVER decides how many clips the
// widget offers: a single clip against OSS core, or pause/resume multi-clip
// curation when the backend advertises it (a Platform tenant). No client change
// switches between them. maskAllText:false keeps static page text readable; form
// INPUTS are always masked. The SDK wires the widget's recorder onto
// client.replay.* from this config — no extra app code.
const rt: ResolveTraceClient = createClient({
  apiKey,
  endpoint,
  debug: true,
  autoCapture: {
    replay: { mode: 'review', enabled: true, sampleRate: 1, maskAllText: false },
  },
  reportWidget: {
    record: true,
    buttonText: 'Report a problem',
    recordButtonText: 'Record the issue',
    submitClipsText: 'Submit',
    discardText: 'Discard',
    consentNotice: 'Recordings are masked — form fields never leave your browser.',
  },
  onError(err) {
    // With no ingest server reachable, uploads fail — but capture still runs in
    // the browser. Surface it so the demo is legible offline.
    showStatus(
      `Not connected to a ResolveTrace ingest server at ${endpoint} — events are ` +
        `still being captured in the browser; point config.js at a running ` +
        `server to see them land in a portal. (${err.message})`,
    );
  },
});

const outlet = $('#app');
const ctx: PageContext = { rt, outlet, navigate };

route('/', () => renderHome(ctx));
route('/products', () => renderProducts(ctx));
route('/product/:id', (params) => renderProduct(ctx, params));
route('/cart', () => renderCart(ctx));
route('/checkout', () => renderCheckout(ctx));
route('/order', () => renderOrder(ctx));
setNotFound(() => {
  outlet.innerHTML = `
    <section class="page">
      <h1>Page not found</h1>
      <a class="btn primary" href="/" data-link>← Back home</a>
    </section>`;
});

// A lightweight navigation breadcrumb per route change. Session replay already
// captures the transition visually; this also puts it on the event timeline.
onNavigate((path) => {
  rt.track('nimbus.navigate', { to: path });
});

// Header widgets: live cart count + the per-session support code.
onCartChange((count) => {
  $('#cart-count').textContent = String(count);
});

const supportEl = $('#support-code');
const supportPoll = window.setInterval(() => {
  const code = rt.session.supportCode;
  if (code) {
    supportEl.textContent = code;
    window.clearInterval(supportPoll);
  }
}, 500);

startRouter(outlet);

// Best-effort flush when the tab is hidden/closed so the session tail survives.
const flushOnHide = (): void => void rt.flush({ keepalive: true });
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});

function showStatus(message: string): void {
  const strip = document.getElementById('status-strip');
  if (!strip) return;
  strip.textContent = message;
  strip.hidden = false;
}
