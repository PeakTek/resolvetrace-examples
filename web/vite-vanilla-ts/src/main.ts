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

// Best-effort shutdown on tab close — flushes the final queue.
window.addEventListener('beforeunload', () => {
  void rt.shutdown({ timeoutMs: 250 });
});
