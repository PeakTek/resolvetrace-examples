/**
 * ResolveTrace SDK browser demo.
 *
 * One demo, every backend. It probes the deployment's capabilities and adapts:
 * against an open-source (self-hosted) server it shows the baseline surface
 * (capture, sessions, whole-session masked replay, report widget); against a
 * ResolveTrace Platform server it additionally activates the consent-gated
 * replay flow + a small operator panel. Platform/Enterprise-only sections are
 * badged; baseline features are not.
 *
 * Configuration is read at startup from `window.__RT_CONFIG__` (a `config.js`
 * the hosting container writes from its env), so the built bundle bakes no
 * endpoint or key — one image runs against any environment. The OSS demo ships
 * a static events:write key in that config; the managed demo omits it and the
 * client mints a short-lived key per visitor (see `config.ts`). Falls back to
 * defaults matching `resolvetrace-core`'s `deploy/docker-compose.yml`.
 */

import { createClient, type ResolveTraceClient } from '@peaktek/resolvetrace-sdk';
import { probeCapabilities, type Capabilities } from './capabilities';
import { activatePlatformSections } from './platform';
import { rawFetch } from './raw-fetch';
import { resolveRuntimeConfig } from './config';

const { endpoint, apiKey, mintKey } = await resolveRuntimeConfig();

// The key the SDK's requests are sent with. Starts as the initial key; on the
// managed demo it may be rotated by the inspecting transport (below) when a
// short-lived minted key expires.
let currentKey = apiKey;

// --- UI refs ---------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const cfgEndpoint = $('cfg-endpoint');
const cfgApiKey = $('cfg-apikey');
const tierBadge = $('tier-badge');
const diagBox = $<HTMLPreElement>('diag-box');
const logBox = $('log-box');

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

// --- Capability probe (fail-closed to OSS) ---------------------------------

const caps: Capabilities = await probeCapabilities();
tierBadge.textContent =
  caps.tier === 'platform'
    ? 'Platform'
    : caps.tier === 'enterprise'
      ? 'Enterprise'
      : 'OSS';
tierBadge.className = `tier tier-${caps.tier}`;
log(`deployment tier: ${caps.tier}${caps.consent ? ' (consent-gated replay)' : ''}`);

// --- Inspecting transport --------------------------------------------------
// Wrap the SDK's fetch so replay upload verdicts are visible — especially the
// managed 403 upload_denied (reason: consent_required). Purely observational,
// with one active concern: it keeps the Authorization header on the *current*
// key. On the managed demo the per-visitor key is short-lived, so on a 401 we
// mint a fresh one and retry once — the SDK bakes the key at creation, and
// stamping it here lets a rotated key take effect without recreating the client.

const urlOf = (input: RequestInfo | URL): string =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;

const isIngestCall = (url: string): boolean =>
  url.includes('/v1/events') ||
  url.includes('/v1/session/') ||
  url.includes('/v1/replay/');

/** Reissue `init` with the current key stamped over any Authorization header. */
const withCurrentKey = (init?: RequestInit): RequestInit | undefined => {
  if (!currentKey || !init) return init;
  const headers = new Headers(init.headers);
  if (headers.has('authorization')) {
    headers.set('authorization', `Bearer ${currentKey}`);
  }
  return { ...init, headers };
};

const inspectingFetch: typeof fetch = async (input, init) => {
  const url = urlOf(input);

  // rawFetch (pre-wrap) so the SDK's own uploads aren't re-captured as
  // perf.api_latency breadcrumbs (which would feed back into the queue).
  let res = await rawFetch(input, withCurrentKey(init));

  // Managed demo: a short-lived minted key can expire mid-session. Mint a fresh
  // one and retry the ingest/replay call once.
  if (res.status === 401 && mintKey && isIngestCall(url)) {
    try {
      currentKey = await mintKey();
      log('session key expired — minted a fresh one', 'info');
      res = await rawFetch(input, withCurrentKey(init));
    } catch (err) {
      log(
        `session-key re-mint failed: ${err instanceof Error ? err.message : String(err)}`,
        'warn',
      );
    }
  }

  try {
    if (url.includes('/v1/replay/')) {
      const leg = url.includes('signed-url')
        ? 'signed-url'
        : url.includes('complete')
          ? 'complete'
          : 'replay';
      let reason: string | undefined;
      if (!res.ok) {
        const b = (await res.clone().json().catch(() => null)) as
          | { reason?: string; error?: string }
          | null;
        reason = b?.reason ?? b?.error;
      }
      const ok = res.ok;
      log(
        `replay ${leg}: ${res.status}${reason ? ` (${reason})` : ''}`,
        ok ? 'success' : 'warn',
      );
      document.dispatchEvent(
        new CustomEvent('rt:replay-verdict', {
          detail: { leg, status: res.status, reason },
        }),
      );
    }
  } catch {
    /* never break the transport over instrumentation */
  }
  return res;
};

// --- Client ----------------------------------------------------------------

// Baseline replay is all-or-nothing ('auto' records the whole session; the SDK
// also defines 'off' and 'manual'). The SDK replay mode is the APP's choice:
// this one universal demo derives it from the detected backend — 'manual'
// against ResolveTrace Platform (which supports consent-gated replay; the
// consent section below obtains consent and drives replay.start()/stop()),
// else 'auto'. A real single-backend app just hardcodes the mode it needs —
// 'manual' is a Platform-only capability. maskAllText:false keeps static page
// text readable in replay; form INPUTS are always masked.
const replayMode = caps.consent ? 'manual' : 'auto';
const replayEnabled =
  (localStorage.getItem('demo.replay.enabled') ?? 'true') === 'true';

const rt = createClient({
  apiKey,
  endpoint,
  debug: true,
  transport: inspectingFetch,
  autoCapture: {
    replay: {
      mode: replayMode,
      enabled: replayEnabled,
      sampleRate: 1,
      maskAllText: false,
    },
  },
  onError(err) {
    log(`SDK transport error: ${err.message}`, 'error');
    renderDiagnostics(rt);
  },
});

log(`Client created. Endpoint: ${endpoint}`, 'success');
renderDiagnostics(rt);

const bootId = rt.track('page_view', {
  path: window.location.pathname,
  referrer: document.referrer || null,
  userAgent: navigator.userAgent,
});
log(`track('page_view') → ${bootId}`);
renderDiagnostics(rt);

// --- Session replay (baseline) ---------------------------------------------

const replayModeEl = $('replay-mode');
const chkReplay = $<HTMLInputElement>('chk-replay-enabled');
replayModeEl.textContent = replayMode;
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
  log(`reportProblem() → ${id} — support.report_submitted; see portal → Reports`, 'success');
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
  const id = rt.track('page_view', { path: window.location.pathname, trigger: 'manual' });
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

// --- Wave 21 auto-capture triggers -----------------------------------------

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
  void fetch(`${endpoint}/__demo_missing__/${Date.now()}`).catch(() => {
    /* swallow — the SDK's api source records the error.api outcome */
  });
});
btnFetchSlow.addEventListener('click', () => {
  log('slow fetch (~600ms, → perf.api_latency)…');
  const url = `${endpoint}/health?slow=${Date.now()}`;
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

// --- View navigation (OSS features / Platform features) --------------------

const viewOss = $('view-oss');
const viewPlatform = $('view-platform');
const navOss = $<HTMLButtonElement>('nav-oss');
const navPlatform = $<HTMLButtonElement>('nav-platform');

function showView(v: 'oss' | 'platform'): void {
  viewOss.hidden = v !== 'oss';
  viewPlatform.hidden = v !== 'platform';
  navOss.classList.toggle('active', v === 'oss');
  navPlatform.classList.toggle('active', v === 'platform');
}
navOss.addEventListener('click', () => showView('oss'));
navPlatform.addEventListener('click', () => showView('platform'));

// --- Platform-tier activation ----------------------------------------------

if (caps.consent) {
  activatePlatformSections(rt, log);
  log('consent-gated replay active — see the Platform features tab', 'success');
} else {
  // OSS backend: the Platform tab shows availability teasers.
  $('platform-teaser-banner').hidden = false;
  for (const id of ['sec-consent', 'sec-operator']) {
    const sec = $(id);
    sec.classList.add('is-teaser');
    sec.querySelectorAll('button').forEach((b) => (b.disabled = true));
  }
}

// Land on the tab that matches the backend.
showView(caps.consent ? 'platform' : 'oss');

// --- Best-effort flush on hide (keep the session across a refresh) ----------

const flushOnHide = (): void => {
  void rt.flush({ keepalive: true });
};
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});
