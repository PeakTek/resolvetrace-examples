/**
 * OSS features page — the baseline SDK surface that works on the self-hosted
 * open-source build (and on any backend). Creates ONE `auto`-mode client
 * (whole-session, all-or-nothing masked replay) and exercises the public
 * capture / lifecycle / auto-capture primitives.
 *
 * A real single-backend app looks like this file: `createClient(...)` with a
 * hardcoded replay mode, then `track` / `capture`. No capability probing here —
 * everything on this page works everywhere.
 */

import {
  $,
  buildClient,
  makeLogger,
  redactKey,
  renderDiagnostics,
} from './shared';

const log = makeLogger();

// Whole-session masked replay ('auto') with a persisted on/off master switch.
const replayEnabled =
  (localStorage.getItem('demo.replay.enabled') ?? 'true') === 'true';

const { rt, config } = await buildClient({
  replayMode: 'auto',
  replayEnabled,
  log,
});

$('cfg-endpoint').textContent = config.endpoint;
$('cfg-apikey').textContent = redactKey(config.apiKey);

log(`Client created (replay mode: auto). Endpoint: ${config.endpoint}`, 'success');
renderDiagnostics(rt);

const bootId = rt.track('page_view', {
  path: window.location.pathname,
  referrer: document.referrer || null,
  userAgent: navigator.userAgent,
});
log(`track('page_view') → ${bootId}`);
renderDiagnostics(rt);

// --- Session replay (auto / whole-session) ---------------------------------

const chkReplay = $<HTMLInputElement>('chk-replay-enabled');
$('replay-mode').textContent = 'auto';
chkReplay.checked = replayEnabled;
chkReplay.addEventListener('change', () => {
  localStorage.setItem('demo.replay.enabled', String(chkReplay.checked));
  log(
    `replay ${chkReplay.checked ? 'enabled' : 'disabled'} — reloading to apply (policy resolves at client creation)`,
    'warn',
  );
  window.setTimeout(() => location.reload(), 400);
});

// --- Support code + report -------------------------------------------------

const supportCodeEl = $('support-code');
const btnCopyCode = $<HTMLButtonElement>('btn-copy-code');
const btnReport = $<HTMLButtonElement>('btn-report');

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

// --- Capture buttons -------------------------------------------------------

const btnTrackPageView = $<HTMLButtonElement>('btn-track-pageview');
const btnTrackClick = $<HTMLButtonElement>('btn-track-click');
const btnCaptureSignup = $<HTMLButtonElement>('btn-capture-signup');
const btnCapturePii = $<HTMLButtonElement>('btn-capture-pii');
const btnFlush = $<HTMLButtonElement>('btn-flush');
const btnDiagnostics = $<HTMLButtonElement>('btn-diagnostics');
const btnShutdown = $<HTMLButtonElement>('btn-shutdown');

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
    attributes: { plan: 'pro', source: 'web-demo', referrer: document.referrer || 'direct' },
  });
  log(`capture('app.signup.completed') → ${id}`);
  renderDiagnostics(rt);
});

btnCapturePii.addEventListener('click', () => {
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
    for (const b of [btnTrackPageView, btnTrackClick, btnCaptureSignup, btnCapturePii, btnFlush]) {
      b.disabled = true;
    }
  } catch (err) {
    log(`shutdown() failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
  } finally {
    renderDiagnostics(rt);
  }
});

// --- Auto-capture triggers -------------------------------------------------

const btnRage = $<HTMLButtonElement>('btn-rage');
const btnDead = $<HTMLButtonElement>('btn-dead');
const btnJsError = $<HTMLButtonElement>('btn-jserror');
const btnFetchFail = $<HTMLButtonElement>('btn-fetch-fail');
const btnFetchSlow = $<HTMLButtonElement>('btn-fetch-slow');
const btnLongTask = $<HTMLButtonElement>('btn-longtask');
const autoForm = $<HTMLFormElement>('auto-form');

btnRage.addEventListener('click', () => {
  log('rage target clicked (click rapidly 3x+ to trigger ux.rage_click)');
});
btnDead.addEventListener('click', () => {
  /* Deliberately no DOM change / nav / fetch → ux.dead_click. */
});
btnJsError.addEventListener('click', () => {
  log('throwing uncaught error in 0ms (→ error.js)…', 'warn');
  setTimeout(() => {
    throw new TypeError('Demo: cannot read properties of undefined (reading "x")');
  }, 0);
});
btnFetchFail.addEventListener('click', () => {
  log('failed API call (→ error.api)…', 'warn');
  void fetch(`${config.endpoint}/__demo_missing__/${Date.now()}`).catch(() => {
    /* swallow — the SDK's api source records the error.api outcome */
  });
});
btnFetchSlow.addEventListener('click', () => {
  log('slow fetch (~600ms, → perf.api_latency)…');
  const url = `${config.endpoint}/health?slow=${Date.now()}`;
  const start = performance.now();
  void (async () => {
    await fetch(url).catch(() => undefined);
    log(`slow fetch returned in ${Math.round(performance.now() - start)}ms`);
  })();
});
btnLongTask.addEventListener('click', () => {
  log('blocking main thread ~120ms (→ perf.long_task)…');
  const end = performance.now() + 120;
  while (performance.now() < end) {
    /* spin */
  }
  log('long task done');
});
autoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  log('form submitted (submit 2x+ within 3s → ux.repeated_submit)');
});

// --- Best-effort flush on hide (keep the session across a refresh) ----------

const flushOnHide = (): void => {
  void rt.flush({ keepalive: true });
};
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});
