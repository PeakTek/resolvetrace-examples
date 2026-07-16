/**
 * ResolveTrace demo — a user-driven "record an issue → review → submit" flow
 * built on the SDK's report widget in `record` mode.
 *
 * Clicking Record starts a buffered replay span AND (against a managed backend)
 * records the user's consent server-side, so the managed server admits the
 * later submit. Nothing uploads until the user presses Submit; Discard drops
 * everything. The widget adapts to the backend it detects:
 *
 *   • Platform — pause/resume accrues multiple clips the user can curate.
 *   • OSS      — the whole session records as one clip (submit or discard).
 *
 * Everything is built on the public SDK primitives (`client.replay.*` +
 * `mountReportWidget`) plus the small `/api/*` contract the hosting deployment
 * provides (capability probe + consent record).
 */

import {
  mountReportWidget,
  type ReportWidgetClient,
} from '@peaktek/resolvetrace-sdk';
import { probeCapabilities } from './capabilities';
import { $, buildClient, makeLogger } from './client';
import { rawFetch } from './raw-fetch';

const log = makeLogger();
const caps = await probeCapabilities();

// A `review`-mode client: user-driven start/stop spans that BUFFER locally and
// upload only on submit(). `enabled: true` — the master switch is on; the
// widget's Record button drives the capture spans.
const { rt, config } = await buildClient({
  replayMode: 'review',
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

log(`Client created (replay mode: review). Endpoint: ${config.endpoint}`, 'success');
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

// --- Record widget (tier-adaptive) -----------------------------------------
// Multi-clip curation is a Platform capability; OSS is whole-session single-clip.
const platform = caps.tier === 'platform';
$('tier-note').textContent = platform
  ? 'Pause and resume to capture several clips, and remove any you don’t want.'
  : 'The whole session records as one clip.';

const widgetClient: ReportWidgetClient = {
  reportProblem: (input) => rt.reportProblem(input),
  recorder: {
    start: () => rt.replay.start(),
    stop: () => rt.replay.stop(),
    listClips: () =>
      rt.replay.listClips().map((c) => ({ id: c.clipId, durationMs: c.durationMs })),
    removeClip: (id) => {
      rt.replay.removeClip(id);
    },
    submit: async () => {
      await rt.replay.submit();
    },
    discard: () => rt.replay.discard(),
  },
};

mountReportWidget(widgetClient, {
  record: { clips: platform ? 'multi' : 'single' },
  // Against a managed backend the Record click records consent server-side, so
  // the server admits the later submit. Fail-closed: if the consent POST
  // throws, recording never starts. An OSS backend admits replay without one → omit.
  onRecordStart: caps.consent
    ? async () => {
        await recordConsent(true);
      }
    : undefined,
  buttonText: 'Report / record an issue',
  recordButtonText: 'Record',
  submitClipsText: 'Submit',
  discardText: 'Discard',
});

// --- Core capture (always on, independent of replay) -----------------------
// Events and errors are captured + sent regardless of replay; these work on any
// backend, so they're wired unconditionally.
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

async function api(path: string, init?: RequestInit): Promise<{ status: number }> {
  // rawFetch (pre-wrap) so these demo /api calls don't add API-call breadcrumbs
  // to the session being recorded.
  const res = await rawFetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  return { status: res.status };
}

/**
 * Record the user's replay consent server-side (managed backend). Throws on a
 * non-2xx so the widget's fail-closed `onRecordStart` aborts recording — no
 * consent record ⇒ the server would refuse the submit anyway.
 */
async function recordConsent(granted: boolean): Promise<void> {
  const { status } = await api('/consent', {
    method: 'POST',
    body: JSON.stringify({
      subjectId: subjectId(),
      sessionId: rt.session.id,
      granted,
      source: 'prompt',
    }),
  });
  const ok = status >= 200 && status < 300;
  log(
    `consent ${granted ? 'allowed' : 'withdrawn'} → POST /api/consent ${status}`,
    ok ? 'success' : 'error',
  );
  if (!ok) throw new Error(`consent POST failed: ${status}`);
}
