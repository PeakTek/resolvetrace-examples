/**
 * Platform-tier demo wiring: the consent-gated replay flow + a small operator
 * panel. Active only when the capability probe reports a Platform backend.
 *
 * This is a *demo-local* consent banner built entirely on the public SDK
 * primitives (`client.replay.start()/stop()`, `client.session.id`) plus the
 * deployment-provided `/api/*` contract. It is NOT a ResolveTrace consent
 * product — a managed deployment ships the real thing; here we just show the
 * primitives end-to-end.
 *
 * The `/api/*` routes (`consent`, `replay-mode`, `consent-records`) are provided
 * by the hosting deployment when the demo runs against ResolveTrace Platform;
 * they proxy to the managed admin surface server-side (the demo browser never
 * holds an operator credential).
 */

import type { ResolveTraceClient } from '@peaktek/resolvetrace-sdk';

export type Logger = (
  msg: string,
  level?: 'info' | 'success' | 'warn' | 'error',
) => void;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

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
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

export function activatePlatformSections(
  rt: ResolveTraceClient,
  log: Logger,
): void {
  for (const id of ['sec-consent', 'sec-operator']) {
    const sec = $(id);
    sec.hidden = false;
    sec.classList.remove('is-teaser');
  }

  const subj = subjectId();
  const stateEl = $('consent-state');
  const sessionEl = $('consent-session');
  const verdictPanel = $('verdict-panel');
  const opMode = $('op-mode');
  const opRecords = $('op-records');

  const renderState = (state: string): void => {
    stateEl.textContent = state;
    sessionEl.textContent = rt.session.id ?? '—';
  };
  renderState('unknown');

  // Replay upload verdicts (dispatched by main.ts's inspecting transport).
  document.addEventListener('rt:replay-verdict', (e) => {
    const { leg, status, reason } = (e as CustomEvent).detail as {
      leg: string;
      status: number;
      reason?: string;
    };
    const ok = status >= 200 && status < 300;
    const line = document.createElement('div');
    line.className = `verdict ${ok ? 'ok' : 'deny'}`;
    line.textContent = ok
      ? `✓ replay ${leg}: ${status} (chunk accepted)`
      : `✗ replay ${leg}: ${status}${reason ? ` (${reason})` : ''}`;
    verdictPanel.prepend(line);
  });

  async function recordDecision(
    granted: boolean,
    source: 'prompt' | 'headless',
  ): Promise<void> {
    const sessionId = rt.session.id;
    const { status } = await api('/consent', {
      method: 'POST',
      body: JSON.stringify({ subjectId: subj, sessionId, granted, source }),
    });
    log(
      `consent ${granted ? 'granted' : 'withdrawn'} (${source}) → POST /api/consent ${status}`,
      status >= 200 && status < 300 ? 'success' : 'error',
    );
  }

  async function grant(source: 'prompt' | 'headless'): Promise<void> {
    // Record the consent evidence first, then begin the capture span, so the
    // server has a grant on file before the first chunk uploads.
    await recordDecision(true, source);
    const started = await rt.replay.start();
    renderState(started ? 'granted (recording)' : 'granted (start no-op)');
  }

  async function withdraw(source: 'prompt' | 'headless'): Promise<void> {
    rt.replay.stop();
    await recordDecision(false, source);
    renderState('withdrawn');
  }

  // Consent prompt (Allow / No thanks) — dismiss on either choice.
  const prompt = $('consent-prompt');
  $('btn-consent-allow').addEventListener('click', () => {
    void grant('prompt');
    prompt.hidden = true;
  });
  $('btn-consent-decline').addEventListener('click', () => {
    void withdraw('prompt');
    prompt.hidden = true;
  });

  // Headless API buttons (for customers with their own CMP).
  $('btn-consent-grant').addEventListener('click', () => void grant('headless'));
  $('btn-consent-withdraw').addEventListener('click', () =>
    void withdraw('headless'),
  );
  $('btn-consent-reset').addEventListener('click', () => {
    rt.replay.stop();
    verdictPanel.replaceChildren();
    prompt.hidden = false;
    renderState('unknown');
    log('consent reset — reload to record a fresh session decision', 'warn');
  });

  // --- Operator panel ------------------------------------------------------

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
    log(`operator set replay mode → ${mode} (PUT /api/replay-mode ${status})`,
      status >= 200 && status < 300 ? 'success' : 'error');
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

  $('btn-op-auto').addEventListener('click', () => void setMode('auto'));
  $('btn-op-manual').addEventListener('click', () => void setMode('manual'));
  $('btn-op-off').addEventListener('click', () => void setMode('off'));
  $('btn-op-refresh').addEventListener('click', () => void refreshRecords());

  void refreshMode();
  void refreshRecords();
}
