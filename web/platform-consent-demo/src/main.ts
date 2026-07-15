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

const badge = $('tier-badge');
badge.textContent = caps.consent ? 'Platform' : 'OSS';
badge.className = `tier tier-${caps.consent ? 'platform' : 'oss'}`;

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

  // The single toggle couples consent + recording (like a real integration).
  let recording = false;

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

  function renderStatus(): void {
    replayStateEl.textContent = recording ? 'recording' : 'off';
    if (!recording) {
      setHero('idle', '—', 'Session replay off',
        'Turn Session replay on to record — the server admits chunks only with consent on file.');
    } else {
      setHero('ok', '201', 'Recording with consent',
        'Consent is on file and the session is recording — chunks upload as 201 accepted.');
    }
  }
  renderStatus();

  // The server's real replay verdicts (dispatched by the inspecting transport)
  // drive the hero — the flip between admit (201) and refuse (403).
  document.addEventListener('rt:replay-verdict', (e) => {
    const { status, reason } = (e as CustomEvent).detail as {
      status: number;
      reason?: string;
    };
    if (status >= 200 && status < 300) {
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
    replayToggle.checked = on;
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

  /** Resolve when the next replay verdict matches `want` (or on timeout). */
  function waitForVerdict(want: 'accept' | 'reject', timeoutMs = 15000): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (matched: boolean): void => {
        if (done) return;
        done = true;
        document.removeEventListener('rt:replay-verdict', onVerdict);
        window.clearTimeout(timer);
        resolve(matched);
      };
      const onVerdict = (e: Event): void => {
        const { status } = (e as CustomEvent).detail as { status: number };
        const ok = status >= 200 && status < 300;
        if ((want === 'accept' && ok) || (want === 'reject' && !ok)) finish(true);
      };
      const timer = window.setTimeout(() => finish(false), timeoutMs);
      document.addEventListener('rt:replay-verdict', onVerdict);
    });
  }

  async function runGuidedTour(): Promise<void> {
    btnGuided.disabled = true;
    replayToggle.disabled = true;
    tourBanner.hidden = false;

    const narrate = (n: number, msg: string): void => {
      tourStep.textContent = `Step ${n} / 4`;
      tourMsg.textContent = msg;
    };

    try {
      narrate(1, 'A user allows session replay — consent is recorded and the browser starts capturing (expecting 201 accepted)…');
      await recordConsent(true);
      await rt.replay.start();
      recording = true;
      replayToggle.checked = true;
      renderStatus();
      pokeActivity();
      const a1 = await waitForVerdict('accept');
      narrate(1, a1
        ? '✓ Server accepted the chunk (201). Replay is stored for this consented session.'
        : '…still waiting for the first chunk — replay uploads every few seconds.');
      await sleep(2600);

      narrate(2, 'Now the user withdraws consent — but the browser is still recording. Watch the server refuse new chunks on its own…');
      await recordConsent(false);
      pokeActivity();
      const a2 = await waitForVerdict('reject');
      narrate(2, a2
        ? '✗ Server rejected the chunk (403 consent_required). Enforcement is server-side — the client cannot override it.'
        : '…a just-withdrawn grant can linger in the server’s verdict cache for ~5s.');
      await sleep(2600);

      narrate(3, 'Consent restored — the server admits chunks again within ~5s…');
      await recordConsent(true);
      pokeActivity();
      const a3 = await waitForVerdict('accept');
      narrate(3, a3
        ? '✓ Back to 201 accepted. Consent is the switch; the data plane honors it live.'
        : '…waiting for the next chunk after re-consent.');
      await sleep(2600);

      narrate(4, 'That’s the Platform difference: consent enforced in the data plane, recorded as an auditable decision, reversible in real time. (Left on and consented.)');
    } finally {
      replayToggle.disabled = false;
      btnGuided.disabled = false;
    }
  }
  btnGuided.addEventListener('click', () => void runGuidedTour());

  // --- Reset: clean slate between prospects --------------------------------
  $<HTMLButtonElement>('btn-reset-demo').addEventListener('click', async () => {
    tourBanner.hidden = true;
    await setReplay(false);
    log('demo reset — session replay off, consent withdrawn');
  });
}
