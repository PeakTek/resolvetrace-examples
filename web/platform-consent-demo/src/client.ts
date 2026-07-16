/**
 * Client factory + DOM/log helpers for the demo.
 *
 * `buildClient` wraps `createClient` in a thin transport that re-mints a
 * short-lived per-visitor key on a `401` (managed deployment). A plain
 * single-backend app needs none of this — the minimal OSS quickstart in
 * `web/vite-vanilla-ts` just calls `createClient` directly.
 */

import { createClient, type ResolveTraceClient } from '@peaktek/resolvetrace-sdk';
import { rawFetch } from './raw-fetch';
import { resolveRuntimeConfig, type RuntimeConfig } from './config';

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type Logger = (message: string, level?: LogLevel) => void;

/** Build a logger that prepends lines into the `#log-box` element, if present. */
export function makeLogger(boxId = 'log-box'): Logger {
  const logBox = document.getElementById(boxId);
  return (message, level: LogLevel = 'info') => {
    if (!logBox) return;
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
  };
}

export function redactKey(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-2)}`;
}

export function renderDiagnostics(
  rt: ResolveTraceClient,
  boxId = 'diag-box',
): void {
  const box = document.getElementById(boxId);
  if (box) box.textContent = JSON.stringify(rt.getDiagnostics(), null, 2);
}

export interface BuiltClient {
  rt: ResolveTraceClient;
  config: RuntimeConfig;
}

export interface BuildClientOptions {
  /**
   * SDK replay trigger model. This is the APP's choice. This demo uses
   * `'review'`: user-driven start/stop spans that BUFFER locally and upload only
   * on `client.replay.submit()`. (The minimal OSS quickstart uses `'auto'`.)
   */
  replayMode: 'auto' | 'off' | 'manual' | 'review';
  /** Master replay switch. Default true. */
  replayEnabled?: boolean;
  /** rrweb `maskAllText`: false keeps static text readable; inputs stay masked. */
  maskAllText?: boolean;
  log: Logger;
}

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

/**
 * Create the SDK client wrapped in an inspecting transport.
 *
 * The wrapper is purely observational with two active concerns: (1) it keeps the
 * Authorization header on the *current* key and, on the managed demo, mints a
 * fresh short-lived key on a `401` and retries once; (2) it surfaces replay
 * upload verdicts — logging them and dispatching a `rt:replay-verdict`
 * DOM event the Platform page listens for (201 accepted vs 403 consent_required).
 * Uses `rawFetch` (pre-wrap) so the SDK's own uploads aren't re-captured as
 * `perf.api_latency` breadcrumbs.
 */
export async function buildClient(
  opts: BuildClientOptions,
): Promise<BuiltClient> {
  const { log } = opts;
  const config = await resolveRuntimeConfig();
  const { endpoint, mintKey } = config;
  let currentKey = config.apiKey;

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
    let res = await rawFetch(input, withCurrentKey(init));

    // Managed demo: a short-lived minted key can expire mid-session. Mint a
    // fresh one and retry the ingest/replay call once.
    if (res.status === 401 && mintKey && isIngestCall(url)) {
      try {
        currentKey = await mintKey();
        log('session key expired — minted a fresh one');
        res = await rawFetch(input, withCurrentKey(init));
      } catch (err) {
        log(
          `session-key re-mint failed: ${err instanceof Error ? err.message : String(err)}`,
          'warn',
        );
      }
    }

    return res;
  };

  const rt = createClient({
    apiKey: config.apiKey,
    endpoint,
    debug: true,
    transport: inspectingFetch,
    autoCapture: {
      replay: {
        mode: opts.replayMode,
        enabled: opts.replayEnabled ?? true,
        sampleRate: 1,
        maskAllText: opts.maskAllText ?? false,
      },
      // Frustration heuristics are noise in a click-driven demo (every click on a
      // control that doesn't mutate the DOM reads as a "dead click"). Error and
      // network breadcrumbs stay on by default — those are the signals worth
      // seeing in the portal.
      deadClick: false,
      rageClick: false,
      repeatedSubmit: false,
    },
    // The "Report a problem" widget is mounted DIRECTLY in main.ts (not via this
    // config) so it can receive the record-mode + onRecordStart consent hook,
    // which are functions and can't ride the serializable client config.
    onError(err) {
      log(`SDK transport error: ${err.message}`, 'error');
      renderDiagnostics(rt);
    },
  });

  return { rt, config };
}
