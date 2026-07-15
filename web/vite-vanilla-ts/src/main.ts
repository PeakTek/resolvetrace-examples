/**
 * ResolveTrace SDK browser quickstart — the smallest honest "SDK → ingest
 * server" reference.
 *
 * One `auto`-mode client (whole-session masked replay), the two capture entry
 * points (`track` / `capture`), the built-in PII scrubber, browser auto-capture,
 * and the lifecycle calls (`flush` / `shutdown` / `getDiagnostics`). No tier
 * probing, no key-minting, no custom transport — a real single-backend app is
 * this small. (For the managed consent-gated replay demo, see the sibling
 * `web/platform-consent-demo`.)
 *
 * Configuration is read at startup from `window.__RT_CONFIG__` (a `config.js`
 * the hosting container writes from its env — see `serve.mjs`), so the built
 * bundle bakes no endpoint or key. Falls back to dev defaults matching
 * resolvetrace-core's `deploy/docker-compose.yml`.
 */

import { createClient, type ResolveTraceClient } from '@peaktek/resolvetrace-sdk';

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

// --- Tiny DOM + log helpers ------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

type LogLevel = 'info' | 'success' | 'warn' | 'error';
const logBox = $('log-box');
function log(message: string, level: LogLevel = 'info'): void {
  const line = document.createElement('div');
  line.className = `log-line ${level}`;
  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date().toLocaleTimeString();
  const tag = document.createElement('span');
  tag.className = 'log-level';
  tag.textContent = level.toUpperCase();
  const text = document.createElement('span');
  text.textContent = message;
  line.append(time, tag, text);
  logBox.prepend(line);
}

const diagBox = $<HTMLPreElement>('diag-box');
function renderDiagnostics(client: ResolveTraceClient): void {
  diagBox.textContent = JSON.stringify(client.getDiagnostics(), null, 2);
}

function redactKey(key: string): string {
  return key.length <= 8 ? '••••' : `${key.slice(0, 4)}••••${key.slice(-2)}`;
}

$('cfg-endpoint').textContent = endpoint;
$('cfg-apikey').textContent = redactKey(apiKey);

// --- Client ----------------------------------------------------------------

// Whole-session masked replay ('auto'), with a persisted on/off master switch.
// maskAllText:false keeps static page text readable; form INPUTS are always
// masked. This is the SDK's default transport — its own uploads are sent with
// the original `fetch` captured before auto-capture wraps it, so they are never
// re-captured as api breadcrumbs.
const replayEnabled =
  (localStorage.getItem('demo.replay.enabled') ?? 'true') === 'true';

const rt = createClient({
  apiKey,
  endpoint,
  debug: true,
  autoCapture: {
    replay: { mode: 'auto', enabled: replayEnabled, sampleRate: 1, maskAllText: false },
  },
  onError(err) {
    log(`SDK transport error: ${err.message}`, 'error');
    renderDiagnostics(rt);
  },
});

log(`Client created. Endpoint: ${endpoint}`, 'success');
renderDiagnostics(rt);

log(`track('page_view') → ${rt.track('page_view', { path: location.pathname })}`);
renderDiagnostics(rt);

// --- Session replay toggle -------------------------------------------------

const chkReplay = $<HTMLInputElement>('chk-replay-enabled');
chkReplay.checked = replayEnabled;
chkReplay.addEventListener('change', () => {
  localStorage.setItem('demo.replay.enabled', String(chkReplay.checked));
  log(`replay ${chkReplay.checked ? 'enabled' : 'disabled'} — reloading to apply`, 'warn');
  window.setTimeout(() => location.reload(), 400);
});

// --- Support code + report -------------------------------------------------

const supportCodeEl = $('support-code');
const supportPoll = window.setInterval(() => {
  const code = rt.session.supportCode;
  if (code) {
    supportCodeEl.textContent = code;
    log(`support code ready: ${code} (look it up in the portal)`, 'success');
    window.clearInterval(supportPoll);
  }
}, 500);

$<HTMLButtonElement>('btn-copy-code').addEventListener('click', () => {
  const code = rt.session.supportCode;
  if (!code) return log('no support code yet — interact with the page first', 'warn');
  void navigator.clipboard?.writeText(code).then(
    () => log(`copied support code ${code}`),
    () => log('clipboard unavailable; the code is shown above', 'warn'),
  );
});

$<HTMLButtonElement>('btn-report').addEventListener('click', () => {
  const id = rt.reportProblem({
    description: 'Checkout button did nothing after I clicked Pay (demo report).',
  });
  log(`reportProblem() → ${id} — support.report_submitted`, 'success');
  renderDiagnostics(rt);
});

// --- Capture buttons -------------------------------------------------------

$<HTMLButtonElement>('btn-track-click').addEventListener('click', () => {
  log(`track('demo.button_click') → ${rt.track('demo.button_click', { clickedAt: new Date().toISOString() })}`);
  renderDiagnostics(rt);
});

$<HTMLButtonElement>('btn-capture-signup').addEventListener('click', () => {
  const id = rt.capture({
    type: 'app.signup.completed',
    attributes: { plan: 'pro', source: 'web-demo' },
  });
  log(`capture('app.signup.completed') → ${id}`);
  renderDiagnostics(rt);
});

$<HTMLButtonElement>('btn-capture-pii').addEventListener('click', () => {
  const id = rt.capture({
    type: 'demo.pii_payload',
    attributes: {
      email: 'user.person@example.com',
      sin: '046-454-286',
      note: 'Reach me at 416-555-0199.',
      safeField: 'not redacted',
    },
  });
  log(`capture('demo.pii_payload') → ${id} (PII inside — watch redaction)`);
  renderDiagnostics(rt);
});

// --- Auto-capture triggers -------------------------------------------------

$<HTMLButtonElement>('btn-rage').addEventListener('click', () => {
  log('rage target clicked (click rapidly 3x+ to trigger ux.rage_click)');
});
$<HTMLButtonElement>('btn-dead').addEventListener('click', () => {
  /* Deliberately no DOM change / nav / fetch → ux.dead_click. */
});
$<HTMLButtonElement>('btn-jserror').addEventListener('click', () => {
  log('throwing uncaught error in 0ms (→ error.js)…', 'warn');
  setTimeout(() => {
    throw new TypeError('Demo: cannot read properties of undefined (reading "x")');
  }, 0);
});
$<HTMLButtonElement>('btn-fetch-fail').addEventListener('click', () => {
  log('failed API call (→ error.api)…', 'warn');
  void fetch(`${endpoint}/__demo_missing__/${Date.now()}`).catch(() => {
    /* swallow — the SDK's api source records the error.api outcome */
  });
});

// --- Lifecycle -------------------------------------------------------------

const btnFlush = $<HTMLButtonElement>('btn-flush');
btnFlush.addEventListener('click', async () => {
  log('flush() …');
  btnFlush.disabled = true;
  try {
    const r = await rt.flush();
    log(`flush() → completed=${r.completed} sent=${r.sent} dropped=${r.dropped}`, r.completed ? 'success' : 'warn');
  } catch (err) {
    log(`flush() failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    btnFlush.disabled = false;
    renderDiagnostics(rt);
  }
});

$<HTMLButtonElement>('btn-diagnostics').addEventListener('click', () => {
  renderDiagnostics(rt);
  log('getDiagnostics() snapshot updated');
});

$<HTMLButtonElement>('btn-shutdown').addEventListener('click', async () => {
  log('shutdown() …', 'warn');
  try {
    await rt.shutdown();
    log('shutdown() complete. Further capture() calls will be dropped.', 'warn');
  } catch (err) {
    log(`shutdown() failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    renderDiagnostics(rt);
  }
});

// --- Best-effort flush on hide (keep the session across a refresh) ----------

const flushOnHide = (): void => void rt.flush({ keepalive: true });
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});
