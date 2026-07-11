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
import {
  $,
  buildClient,
  makeLogger,
  redactKey,
  renderDiagnostics,
  type Logger,
} from './shared';
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

$('cfg-endpoint').textContent = config.endpoint;
$('cfg-apikey').textContent = redactKey(config.apiKey);

const badge = $('tier-badge');
badge.textContent = caps.consent ? 'Platform' : 'OSS';
badge.className = `tier tier-${caps.consent ? 'platform' : 'oss'}`;

log(`Client created (replay mode: manual). Endpoint: ${config.endpoint}`, 'success');
renderDiagnostics(rt);
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
  for (const id of ['sec-consent', 'sec-operator']) {
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

  const consentToggle = $<HTMLInputElement>('toggle-consent');
  const recordToggle = $<HTMLInputElement>('toggle-record');
  const consentStateEl = $('consent-state');
  const recordStateEl = $('record-state');
  const sessionEl = $('consent-session');
  const statusLine = $('replay-status');
  const verdictPanel = $('verdict-panel');
  const opMode = $('op-mode');
  const opRecords = $('op-records');

  // Two independent bits of state — see the file header.
  let consentAllowed = false;
  let recording = false;

  function renderStatus(): void {
    sessionEl.textContent = rt.session.id ?? '—';
    consentStateEl.textContent = consentAllowed ? 'allowed' : 'withdrawn';
    recordStateEl.textContent = recording ? 'recording' : 'stopped';

    let msg: string;
    let cls: string;
    if (!recording) {
      msg = 'Record is off — the browser is producing no replay chunks.';
      cls = 'idle';
    } else if (consentAllowed) {
      msg = 'Recording + consent allowed → the server admits chunks (expect 201 accepted).';
      cls = 'ok';
    } else {
      msg =
        'Recording, but consent is withdrawn → the server rejects chunks (expect 403 consent_required).';
      cls = 'deny';
    }
    statusLine.textContent = msg;
    statusLine.className = `status-line ${cls}`;
  }
  renderStatus();

  // Live replay upload verdicts (dispatched by shared.ts's inspecting transport).
  document.addEventListener('rt:replay-verdict', (e) => {
    const { leg, status, reason } = (e as CustomEvent).detail as {
      leg: string;
      status: number;
      reason?: string;
    };
    const ok = status >= 200 && status < 300;
    const line = document.createElement('div');
    line.className = `verdict ${ok ? 'ok' : 'deny'}`;
    const time = new Date().toLocaleTimeString();
    line.textContent = ok
      ? `${time}  ✓ replay ${leg}: ${status} (chunk accepted)`
      : `${time}  ✗ replay ${leg}: ${status}${reason ? ` (${reason})` : ''}`;
    verdictPanel.prepend(line);
  });

  async function recordConsent(granted: boolean): Promise<void> {
    const sessionId = rt.session.id;
    const { status } = await api('/consent', {
      method: 'POST',
      body: JSON.stringify({ subjectId: subj, sessionId, granted, source: 'prompt' }),
    });
    log(
      `consent ${granted ? 'allowed' : 'withdrawn'} → POST /api/consent ${status}`,
      status >= 200 && status < 300 ? 'success' : 'error',
    );
  }

  // --- Toggle 1: Replay consent (Allow ⇄ Withdraw) -------------------------
  consentToggle.addEventListener('change', async () => {
    consentAllowed = consentToggle.checked;
    renderStatus();
    await recordConsent(consentAllowed);
    await refreshRecords();
  });

  // --- Toggle 2: Record replay (Start ⇄ Stop) ------------------------------
  recordToggle.addEventListener('change', async () => {
    recording = recordToggle.checked;
    if (recording) {
      const started = await rt.replay.start();
      log(
        started
          ? 'replay.start() → recording span began'
          : 'replay.start() was a no-op (already recording / policy gate)',
        started ? 'success' : 'warn',
      );
    } else {
      rt.replay.stop();
      log('replay.stop() → recording span ended', 'warn');
    }
    renderStatus();
  });

  $<HTMLButtonElement>('btn-clear-verdicts').addEventListener('click', () => {
    verdictPanel.replaceChildren();
  });

  // --- Activity affordance: give replay something to record ----------------
  // rrweb snapshots DOM mutations + interactions; this appends masked rows so
  // there's a steady stream of chunks to watch the server admit / reject.
  const activityFeed = $('activity-feed');
  let activityN = 0;
  $<HTMLButtonElement>('btn-activity').addEventListener('click', () => {
    activityN += 1;
    const row = document.createElement('div');
    row.className = 'activity-row';
    row.textContent = `activity #${activityN} @ ${new Date().toLocaleTimeString()}`;
    activityFeed.prepend(row);
  });

  // --- Operator panel: tenant replay policy + consent records --------------
  async function refreshMode(): Promise<void> {
    const { status, body } = await api('/replay-mode');
    opMode.textContent =
      status >= 200 && status < 300 ? String(body.mode ?? '?') : `error ${status}`;
  }

  async function setMode(mode: 'auto' | 'manual' | 'off'): Promise<void> {
    const { status } = await api('/replay-mode', {
      method: 'PUT',
      body: JSON.stringify({ mode }),
    });
    log(
      `operator set replay mode → ${mode} (PUT /api/replay-mode ${status})`,
      status >= 200 && status < 300 ? 'success' : 'error',
    );
    await refreshMode();
  }

  async function refreshRecords(): Promise<void> {
    const { status, body } = await api('/consent-records?limit=20');
    if (status < 200 || status >= 300) {
      opRecords.textContent = `error ${status}`;
      return;
    }
    const records = (body.records as Array<Record<string, unknown>>) ?? [];
    opRecords.replaceChildren();
    if (records.length === 0) {
      opRecords.textContent = '(no consent records yet)';
      return;
    }
    for (const r of records) {
      const row = document.createElement('div');
      row.className = 'record';
      row.textContent = `${r.granted ? '✓' : '✗'} ${String(r.source)} · subj ${String(r.subjectId).slice(0, 8)} · sess ${r.sessionId ? String(r.sessionId).slice(0, 10) : '—'} · ${String(r.recordedAt)}`;
      opRecords.append(row);
    }
  }

  $<HTMLButtonElement>('btn-op-auto').addEventListener('click', () => void setMode('auto'));
  $<HTMLButtonElement>('btn-op-manual').addEventListener('click', () => void setMode('manual'));
  $<HTMLButtonElement>('btn-op-off').addEventListener('click', () => void setMode('off'));
  $<HTMLButtonElement>('btn-op-refresh').addEventListener('click', () => void refreshRecords());

  void refreshMode();
  void refreshRecords();
}
