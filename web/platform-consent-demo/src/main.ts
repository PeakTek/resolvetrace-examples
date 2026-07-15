/**
 * Platform features page — the ResolveTrace Platform differentiators:
 * consent-gated replay + a small operator panel. Creates ONE `manual`-mode
 * client (the Platform-only capability) and drives replay recording with two
 * independent switches so the enforcement story is visible:
 *
 *   • Replay consent   — records the end-user's decision server-side
 *                        (POST /api/consent). This is the evidence the managed
 *                        server checks before admitting replay chunks.
 *   • Record replay    — drives the SDK's `replay.start()` / `replay.stop()`
 *                        capture span (recording happens in the browser).
 *
 * The point is the *interaction*: the browser records whenever "Record" is on,
 * but the server only ADMITS chunks when consent is on file. Turn Record on with
 * consent allowed → uploads 201. Withdraw consent while still recording → the
 * server rejects new chunks 403 consent_required (enforcement in the data plane,
 * not a client-side honor system). Re-allow → 201 within ~5s (verdict cache).
 *
 * Everything here is built on the public SDK primitives plus the small `/api/*`
 * contract the hosting deployment provides against Platform. It is a demo-local
 * banner, not a turnkey consent feature — a managed backend provides that; here
 * we just wire the public primitives end-to-end. Against an OSS backend the
 * capability probe fails closed and the sections render as disabled teasers.
 */

import type { ResolveTraceClient } from '@peaktek/resolvetrace-sdk';
import { probeCapabilities } from './capabilities';
import { $, buildClient, makeLogger, type Logger } from './client';
import { rawFetch } from './raw-fetch';

const log = makeLogger();
const caps = await probeCapabilities();

// Build a `manual`-mode client even against an OSS backend, so the page stays a
// faithful reference; the controls stay disabled until a Platform backend is
// detected. `enabled: true` — the master switch is on; the recording *span* is
// what the Record toggle drives.
const { rt, config } = await buildClient({
  replayMode: 'manual',
  replayEnabled: true,
  log,
});

// --- Theme toggle (persisted; defaults to the OS preference) ---------------
const themeToggle = $<HTMLButtonElement>('theme-toggle');
const savedTheme = localStorage.getItem('demo.theme');
if (savedTheme === 'light' || savedTheme === 'dark') {
  document.documentElement.setAttribute('data-theme', savedTheme);
}
themeToggle.addEventListener('click', () => {
  const root = document.documentElement;
  const current =
    root.getAttribute('data-theme') ??
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  localStorage.setItem('demo.theme', next);
});

log(`Client created (replay mode: manual). Endpoint: ${config.endpoint}`, 'success');
rt.track('page_view', { path: window.location.pathname });

// Surface the per-session support code (this is a live session).
const supportCodeEl = $('support-code');
const supportPoll = window.setInterval(() => {
  const code = rt.session.supportCode;
  if (code) {
    supportCodeEl.textContent = code;
    window.clearInterval(supportPoll);
  }
}, 500);

// One-click copy of the support code.
const copyHint = $('copy-hint');
$<HTMLButtonElement>('support-code-copy').addEventListener('click', () => {
  const code = rt.session.supportCode;
  if (!code) return;
  void navigator.clipboard?.writeText(code).then(
    () => {
      copyHint.textContent = 'Copied ✓';
      window.setTimeout(() => (copyHint.textContent = 'Copy'), 1500);
    },
    () => (copyHint.textContent = 'Copy failed'),
  );
});

if (caps.consent) {
  activatePlatform(rt, log);
  log('consent-gated replay active', 'success');
} else {
  $('platform-teaser-banner').hidden = false;
  for (const id of ['sec-consent']) {
    const sec = $(id);
    sec.classList.add('is-teaser');
    sec
      .querySelectorAll('button, input')
      .forEach((el) => ((el as HTMLButtonElement | HTMLInputElement).disabled = true));
  }
}

// --- Core capture (always on, independent of replay consent) ---------------
// Events and errors are captured + sent regardless of consent — only replay
// chunks are consent-gated. These auto-capture sources work on any backend, so
// they're wired here (not gated on the Platform activation above).
const captureNote = $('capture-note');
$<HTMLButtonElement>('btn-throw-error').addEventListener('click', () => {
  captureNote.textContent =
    '✓ threw an uncaught error → captured automatically as error.js. See the portal timeline.';
  window.setTimeout(() => {
    throw new TypeError('Demo: cannot read properties of undefined (reading "checkout")');
  }, 0);
});
$<HTMLButtonElement>('btn-fetch-fail').addEventListener('click', () => {
  captureNote.textContent =
    '✓ failed API call → captured automatically as error.api. See the portal timeline.';
  void fetch(`${config.endpoint}/__demo_missing__/${Date.now()}`).catch(() => {
    /* swallow — the SDK's api source records the error.api outcome */
  });
});

// --- Best-effort flush on hide (keep the session across a refresh) ----------

const flushOnHide = (): void => {
  void rt.flush({ keepalive: true });
};
window.addEventListener('pagehide', flushOnHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushOnHide();
});

// ===========================================================================

/** Stable per-browser subject id, so consent rows correlate across sessions. */
function subjectId(): string {
  let s = localStorage.getItem('demo.subject');
  if (!s) {
    s = crypto.randomUUID?.() ?? `subj-${Date.now()}`;
    localStorage.setItem('demo.subject', s);
  }
  return s;
}

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

async function api(path: string, init?: RequestInit): Promise<ApiResult> {
  // rawFetch (pre-wrap) so these demo /api calls don't add API-call breadcrumbs
  // to the session being demonstrated.
  const res = await rawFetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

function activatePlatform(rt: ResolveTraceClient, log: Logger): void {
  const subj = subjectId();

  const replayToggle = $<HTMLInputElement>('toggle-replay');
  const replayStateEl = $('replay-state');
  const heroEl = $('verdict-hero');
  const vhCode = $('vh-code');
  const vhTitle = $('vh-title');
  const vhSub = $('vh-sub');
  const sink = $('activity-sink');

  // Two bits of state: whether a recording span is active (client-side), and
  // what the app currently believes the server should do with chunks — used to
  // ignore stale verdicts from the server's ~5s consent-verdict cache.
  let recording = false;
  let expecting: 'accept' | 'reject' = 'accept';

  // Guided-demo run state, so Reset can abort a tour cleanly.
  let tourRunning = false;
  let tourAbort = false;

  // Invisible DOM churn so rrweb always has mutations → replay chunks keep
  // uploading. The guided demo calls this; there's no user-facing "activity"
  // control (that only ever confused — its job was to feed the recorder).
  let pokeN = 0;
  function pokeActivity(): void {
    pokeN += 1;
    sink.textContent = `activity ${pokeN}`;
  }

  // The verdict hero — the live admission state, at a glance.
  function setHero(
    state: 'idle' | 'ok' | 'deny',
    code: string,
    title: string,
    sub: string,
  ): void {
    heroEl.className = `verdict-hero ${state}`;
    vhCode.textContent = code;
    vhTitle.textContent = title;
    vhSub.textContent = sub;
  }

  function pulseHero(): void {
    heroEl.classList.remove('flip');
    void heroEl.offsetWidth; // reflow so the animation restarts on each verdict
    heroEl.classList.add('flip');
  }

  // The hero reflects the CURRENT intent immediately; verdicts (below) confirm
  // it with a pulse. Keeping these consistent is what stops the "still shows 200
  // after I turned it off / withdrew consent" desync.
  function renderStatus(): void {
    replayStateEl.textContent = recording ? 'recording' : 'off';
    if (!recording) {
      setHero('idle', '—', 'Session replay off',
        'Turn Session replay on to record — the server admits chunks only with consent on file.');
    } else if (expecting === 'accept') {
      setHero('ok', '201', 'Recording with consent',
        'Consent is on file and the session is recording — chunks upload as 201 accepted.');
    } else {
      setHero('deny', '403', 'Recording — consent withdrawn',
        'The browser is still recording, but the server refuses new chunks (403 consent_required).');
    }
  }
  renderStatus();

  // The server's real replay verdicts confirm the hero with a pulse. Ignore
  // verdicts that no longer apply: none while stopped, and none that contradict
  // the current intent (a stale 200 from the ~5s cache right after a withdrawal,
  // or a stale 403 right after re-consent).
  document.addEventListener('rt:replay-verdict', (e) => {
    if (!recording) return;
    const { status, reason } = (e as CustomEvent).detail as {
      status: number;
      reason?: string;
    };
    const ok = status >= 200 && status < 300;
    if (expecting === 'accept' && !ok) return;
    if (expecting === 'reject' && ok) return;
    if (ok) {
      setHero('ok', String(status), 'Server admitting replay',
        'Latest chunk accepted — consent is on file for this session.');
    } else {
      setHero('deny', String(status), 'Server rejecting replay',
        `Latest chunk refused: ${status}${reason ? ` (${reason})` : ''}.`);
    }
    pulseHero();
  });

  // Low-level primitives. The single toggle couples them; the guided demo drives
  // them independently to show the server enforce consent on its own.
  async function recordConsent(granted: boolean): Promise<void> {
    const { status } = await api('/consent', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: subj,
        sessionId: rt.session.id,
        granted,
        source: 'prompt',
      }),
    });
    log(
      `consent ${granted ? 'allowed' : 'withdrawn'} → POST /api/consent ${status}`,
      status >= 200 && status < 300 ? 'success' : 'error',
    );
  }

  // The single user-facing control: one click = record consent + start recording
  // (or stop + withdraw). This is what a real app wires to an "Allow replay" UI.
  async function setReplay(on: boolean): Promise<void> {
    recording = on;
    expecting = 'accept';
    replayToggle.checked = on;
    renderStatus(); // reflect intent immediately (off → idle; on → admitting)
    if (on) {
      await recordConsent(true);
      await rt.replay.start();
    } else {
      rt.replay.stop();
      await recordConsent(false);
    }
    renderStatus();
  }
  replayToggle.addEventListener('change', () => void setReplay(replayToggle.checked));

  // --- Guided demo: the enforcement story ----------------------------------
  // Drives consent + recording INDEPENDENTLY (which a real one-click UI does
  // not) so you can watch the server admit, refuse, then re-admit replay as
  // consent changes — each step paced by the server's actual verdict.
  const btnGuided = $<HTMLButtonElement>('btn-guided-demo');
  const tourBanner = $('tour-banner');
  const tourStep = $('tour-step');
  const tourMsg = $('tour-msg');

  const sleep = (ms: number): Promise<void> =>
    new Promise((r) => window.setTimeout(r, ms));

  /**
   * Resolve when the next replay verdict matches `want` — or on timeout, or when
   * the tour is aborted (so Reset stops the demo promptly rather than hanging on
   * a pending verdict).
   */
  function waitForVerdict(want: 'accept' | 'reject', timeoutMs = 15000): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (matched: boolean): void => {
        if (done) return;
        done = true;
        document.removeEventListener('rt:replay-verdict', onVerdict);
        window.clearTimeout(timer);
        window.clearInterval(abortPoll);
        resolve(matched);
      };
      const onVerdict = (e: Event): void => {
        const { status } = (e as CustomEvent).detail as { status: number };
        const ok = status >= 200 && status < 300;
        if ((want === 'accept' && ok) || (want === 'reject' && !ok)) finish(true);
      };
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      const abortPoll = window.setInterval(() => {
        if (tourAbort) finish(false);
      }, 150);
      document.addEventListener('rt:replay-verdict', onVerdict);
    });
  }

  async function runGuidedTour(): Promise<void> {
    if (tourRunning) return;
    tourRunning = true;
    tourAbort = false;
    btnGuided.disabled = true;
    replayToggle.disabled = true;
    tourBanner.hidden = false;

    const narrate = (n: number, msg: string): void => {
      tourStep.textContent = `Step ${n} / 4`;
      tourMsg.textContent = msg;
    };

    try {
      // Step 1 — allow consent + record → server admits (201).
      if (tourAbort) return;
      expecting = 'accept';
      await recordConsent(true);
      if (tourAbort) return;
      await rt.replay.start();
      recording = true;
      replayToggle.checked = true;
      renderStatus();
      pokeActivity();
      narrate(1, 'A user allows session replay — consent is recorded and the browser starts capturing (expecting 201 accepted)…');
      const a1 = await waitForVerdict('accept');
      if (tourAbort) return;
      narrate(1, a1
        ? '✓ Server accepted the chunk (201). Replay is stored for this consented session.'
        : '…still waiting for the first chunk — replay uploads every few seconds.');
      await sleep(2600);
      if (tourAbort) return;

      // Step 2 — withdraw consent, keep recording → server refuses (403).
      expecting = 'reject';
      renderStatus();
      narrate(2, 'Now the user withdraws consent — but the browser is still recording. Watch the server refuse new chunks on its own…');
      await recordConsent(false);
      pokeActivity();
      const a2 = await waitForVerdict('reject');
      if (tourAbort) return;
      narrate(2, a2
        ? '✗ Server rejected the chunk (403 consent_required). Enforcement is server-side — the client cannot override it.'
        : '…a just-withdrawn grant can linger in the server’s verdict cache for ~5s.');
      await sleep(2600);
      if (tourAbort) return;

      // Step 3 — restore consent → server admits again (201).
      expecting = 'accept';
      renderStatus();
      narrate(3, 'Consent restored — the server admits chunks again within ~5s…');
      await recordConsent(true);
      pokeActivity();
      const a3 = await waitForVerdict('accept');
      if (tourAbort) return;
      narrate(3, a3
        ? '✓ Back to 201 accepted. Consent is the switch; the data plane honors it live.'
        : '…waiting for the next chunk after re-consent.');
      await sleep(2600);
      if (tourAbort) return;

      narrate(4, 'That’s the Platform difference: consent enforced in the data plane, recorded as an auditable decision, reversible in real time. (Left on and consented.)');
    } finally {
      tourRunning = false;
      replayToggle.disabled = false;
      btnGuided.disabled = false;
      // If Reset aborted us mid-tour, make sure we don't leave a dangling
      // recording span — stop and return to the idle state.
      if (tourAbort) {
        rt.replay.stop();
        recording = false;
        expecting = 'accept';
        replayToggle.checked = false;
        renderStatus();
        void recordConsent(false);
      }
    }
  }
  btnGuided.addEventListener('click', () => void runGuidedTour());

  // --- Reset: stop everything (aborts a running guided demo) ---------------
  $<HTMLButtonElement>('btn-reset-demo').addEventListener('click', async () => {
    tourBanner.hidden = true;
    if (tourRunning) {
      // Signal the tour to bail; its `finally` stops recording + resets state.
      tourAbort = true;
    } else {
      await setReplay(false);
    }
    log('demo reset — session replay off, consent withdrawn');
  });
}
