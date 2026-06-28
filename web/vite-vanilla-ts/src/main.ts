/**
 * ResolveTrace SDK browser demo.
 *
 * Creates a single client against a locally-running OSS ingest server and
 * exposes a handful of buttons that exercise the public SDK surface:
 *   - `track(name, attrs)`
 *   - `capture({ type, attributes })`
 *   - `flush()`
 *   - `getDiagnostics()`
 *   - `shutdown()`
 *
 * Configuration comes from Vite env (`VITE_RT_ENDPOINT` / `VITE_RT_API_KEY`)
 * with defaults that match `resolvetrace-core`'s `deploy/docker-compose.yml`.
 */

import { createClient, type ResolveTraceClient } from '@peaktek/resolvetrace-sdk';

const endpoint =
  import.meta.env.VITE_RT_ENDPOINT ?? 'http://localhost:4317';
const apiKey =
  import.meta.env.VITE_RT_API_KEY ?? 'replace-me-with-long-random-string';

// --- UI refs ---------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const cfgEndpoint = $('cfg-endpoint');
const cfgApiKey = $('cfg-apikey');
const diagBox = $<HTMLPreElement>('diag-box');
const logBox = $('log-box');

const btnTrackPageView = $<HTMLButtonElement>('btn-track-pageview');
const btnTrackClick = $<HTMLButtonElement>('btn-track-click');
const btnCaptureSignup = $<HTMLButtonElement>('btn-capture-signup');
const btnCapturePii = $<HTMLButtonElement>('btn-capture-pii');
const btnFlush = $<HTMLButtonElement>('btn-flush');
const btnDiagnostics = $<HTMLButtonElement>('btn-diagnostics');
const btnShutdown = $<HTMLButtonElement>('btn-shutdown');

cfgEndpoint.textContent = endpoint;
cfgApiKey.textContent = redactKey(apiKey);

// --- Logging helpers -------------------------------------------------------

type LogLevel = 'info' | 'success' | 'warn' | 'error';

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

function renderDiagnostics(client: ResolveTraceClient): void {
  diagBox.textContent = JSON.stringify(client.getDiagnostics(), null, 2);
}

function redactKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-2)}`;
}

// --- Client ----------------------------------------------------------------

const rt = createClient({
  apiKey,
  endpoint,
  debug: true,
  // Browser auto-capture: frustration signals + error/network/perf breadcrumbs,
  // plus masked session replay. Replay upload works locally because the stack
  // sets S3_PUBLIC_ENDPOINT=http://localhost:9000, so the server signs upload
  // URLs for a host the browser can reach (the server still talks to MinIO at
  // minio:9000 internally).
  //
  // maskAllText:false keeps static page text (labels/headings/buttons) readable
  // in replay; form INPUTS are still always masked. Tag any sensitive static
  // text with `data-rt-mask` / `data-private` to mask it.
  autoCapture: { replay: { enabled: true, sampleRate: 1, maskAllText: false } },
  onError(err) {
    log(`SDK transport error: ${err.message}`, 'error');
    renderDiagnostics(rt);
  },
});

log(`Client created. Endpoint: ${endpoint}`, 'success');
renderDiagnostics(rt);

// Auto-emit a page_view on load so there is always something in the queue.
const bootId = rt.track('page_view', {
  path: window.location.pathname,
  referrer: document.referrer || null,
  userAgent: navigator.userAgent,
});
log(`track('page_view') → ${bootId}`);
renderDiagnostics(rt);

// --- Support code, report, replay ------------------------------------------

const supportCodeEl = $('support-code');
const btnCopyCode = $<HTMLButtonElement>('btn-copy-code');
const btnReport = $<HTMLButtonElement>('btn-report');

// The server mints the support code on session start; the SDK exposes it on
// `rt.session.supportCode` once the start response resolves (null until then).
const supportCodePoll = window.setInterval(() => {
  const code = rt.session.supportCode;
  if (code) {
    supportCodeEl.textContent = code;
    log(`support code ready: ${code} (look it up in the portal)`, 'success');
    window.clearInterval(supportCodePoll);
  }
}, 500);

btnCopyCode.addEventListener('click', () => {
  const code = rt.session.supportCode;
  if (!code) {
    log('no support code yet — interact with the page first', 'warn');
    return;
  }
  void navigator.clipboard?.writeText(code).then(
    () => log(`copied support code ${code}`),
    () => log('clipboard unavailable; the code is shown above', 'warn'),
  );
});

btnReport.addEventListener('click', () => {
  const id = rt.reportProblem({
    description: 'Checkout button did nothing after I clicked Pay (demo report).',
  });
  log(
    `reportProblem() → ${id} — support.report_submitted; see portal → Reports`,
    'success',
  );
  renderDiagnostics(rt);
});

// --- Button handlers -------------------------------------------------------

btnTrackPageView.addEventListener('click', () => {
  const id = rt.track('page_view', {
    path: window.location.pathname,
    trigger: 'manual',
  });
  log(`track('page_view') → ${id}`);
  renderDiagnostics(rt);
});

btnTrackClick.addEventListener('click', () => {
  const id = rt.track('demo.button_click', {
    button: 'demo.button_click',
    clickedAt: new Date().toISOString(),
  });
  log(`track('demo.button_click') → ${id}`);
  renderDiagnostics(rt);
});

btnCaptureSignup.addEventListener('click', () => {
  const id = rt.capture({
    type: 'app.signup.completed',
    attributes: {
      plan: 'pro',
      source: 'web-demo',
      referrer: document.referrer || 'direct',
    },
  });
  log(`capture('app.signup.completed') → ${id}`);
  renderDiagnostics(rt);
});

btnCapturePii.addEventListener('click', () => {
  const id = rt.capture({
    type: 'demo.pii_payload',
    attributes: {
      // Stage-1 scrubber should redact these before the request leaves.
      email: 'user.person@example.com',
      sin: '046-454-286',
      note: 'Reach me at 416-555-0199.',
      safeField: 'not redacted',
    },
  });
  log(`capture('demo.pii_payload') → ${id} (PII inside — watch redaction)`);
  renderDiagnostics(rt);
});

btnFlush.addEventListener('click', async () => {
  log('flush() …');
  btnFlush.disabled = true;
  try {
    const result = await rt.flush();
    log(
      `flush() → completed=${result.completed} sent=${result.sent} dropped=${result.dropped}`,
      result.completed ? 'success' : 'warn',
    );
  } catch (err) {
    log(`flush() failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    btnFlush.disabled = false;
    renderDiagnostics(rt);
  }
});

btnDiagnostics.addEventListener('click', () => {
  renderDiagnostics(rt);
  log('getDiagnostics() snapshot updated');
});

btnShutdown.addEventListener('click', async () => {
  log('shutdown() …', 'warn');
  btnShutdown.disabled = true;
  try {
    await rt.shutdown();
    log('shutdown() complete. Further capture() calls will be dropped.', 'warn');
    disableCaptureButtons();
  } catch (err) {
    log(
      `shutdown() failed: ${err instanceof Error ? err.message : String(err)}`,
      'error',
    );
  } finally {
    renderDiagnostics(rt);
  }
});

function disableCaptureButtons(): void {
  for (const b of [
    btnTrackPageView,
    btnTrackClick,
    btnCaptureSignup,
    btnCapturePii,
    btnFlush,
  ]) {
    b.disabled = true;
  }
}

// --- Wave 21 auto-capture triggers -----------------------------------------
// These drive the SDK's browser auto-capture sources so the portal timeline
// has real frustration / error / network / perf breadcrumbs to render.

const btnRage = $<HTMLButtonElement>('btn-rage');
const btnDead = $<HTMLButtonElement>('btn-dead');
const btnJsError = $<HTMLButtonElement>('btn-jserror');
const btnFetchFail = $<HTMLButtonElement>('btn-fetch-fail');
const btnFetchSlow = $<HTMLButtonElement>('btn-fetch-slow');
const btnLongTask = $<HTMLButtonElement>('btn-longtask');
const autoForm = $<HTMLFormElement>('auto-form');

// Rage click: the SDK flags >=3 clicks on the same target within 1s. This
// handler intentionally does nothing observable.
btnRage.addEventListener('click', () => {
  log('rage target clicked (click rapidly 3x+ to trigger ux.rage_click)');
});

// Dead click: an interactive target whose click produces no DOM mutation,
// navigation, or network within the window (~2.5s) → ux.dead_click.
btnDead.addEventListener('click', () => {
  // Deliberately no DOM change / nav / fetch.
});

btnJsError.addEventListener('click', () => {
  log('throwing uncaught error in 0ms (→ error.js)…', 'warn');
  // Throw out of the current stack so it surfaces as window.onerror.
  setTimeout(() => {
    throw new TypeError('Demo: cannot read properties of undefined (reading "x")');
  }, 0);
});

btnFetchFail.addEventListener('click', () => {
  log('fetch → 404 (→ error.api)…', 'warn');
  // A same-origin path that 404s; status >= threshold → error.api.
  void fetch('/__demo_missing__/' + Date.now()).catch(() => {
    /* swallow — the SDK records the outcome */
  });
});

btnFetchSlow.addEventListener('click', () => {
  log('slow fetch (~600ms, → perf.api_latency)…');
  // httpbin-style delay via the ingest health endpoint won't be slow, so we
  // hit a public delay endpoint. Falls back gracefully if offline.
  const url = `${endpoint}/health?slow=${Date.now()}`;
  const start = performance.now();
  void (async () => {
    // Artificially serialize a few requests so duration is measurable even
    // against a fast local endpoint.
    await fetch(url).catch(() => undefined);
    log(`slow fetch returned in ${Math.round(performance.now() - start)}ms`);
  })();
});

btnLongTask.addEventListener('click', () => {
  log('blocking main thread ~120ms (→ perf.long_task)…');
  const end = performance.now() + 120;
  // Busy-wait to produce a Long Task (>50ms) the PerformanceObserver records.
  while (performance.now() < end) {
    // spin
  }
  log('long task done');
});

autoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  log('form submitted (submit 2x+ within 3s → ux.repeated_submit)');
});

// Best-effort shutdown on tab close — flushes the final queue.
window.addEventListener('beforeunload', () => {
  void rt.shutdown({ timeoutMs: 250 });
});
