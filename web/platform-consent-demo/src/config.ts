/**
 * Runtime demo configuration — read at page load, never baked at build time.
 *
 * The demo image is environment-agnostic. Each hosting container writes a
 * static `config.js` from its own env at startup; that file sets
 * `window.__RT_CONFIG__` before this module runs (it's loaded via a plain
 * `<script src="/config.js">` in index.html, so the read is synchronous — no
 * `/api/config` fetch and nothing environment-specific in the bundle).
 *
 * Key delivery differs by deployment tier:
 *   - OSS demo: the (browser-exposed, events:write-only) tenant key ships in
 *     `config.js` as `apiKey`. A static per-deployment key, bounded server-side
 *     by per-tenant rate limits + scheduled rotation.
 *   - Managed demo: `config.js` carries only the `endpoint`. The key is minted
 *     per visitor by the hosting proxy at `POST /api/session-key` — a
 *     short-lived, events:write-only key — so a scraped key expires in minutes,
 *     not a year. The proxy holds the operator credential server-side.
 *
 * With neither (a plain static host / `npm run dev`) we fall back to dev
 * defaults that match resolvetrace-core's `deploy/docker-compose.yml`.
 */

import { rawFetch } from './raw-fetch';

export interface RuntimeConfig {
  /** Data-plane ingest base URL the SDK posts to. */
  endpoint: string;
  /** Initial bearer key the SDK is created with. */
  apiKey: string;
  /**
   * Re-mint a fresh short-lived key (managed demo only); `null` when the key is
   * static (OSS / dev). The inspecting transport calls this on a `401` to
   * rotate an expired per-visitor key without recreating the client.
   */
  mintKey: (() => Promise<string>) | null;
}

interface InjectedConfig {
  endpoint?: unknown;
  apiKey?: unknown;
  /** Optional branding (see `Branding`) — lets one built image serve
   * differently-branded deployments purely via config.js. */
  brandName?: unknown;
  accent?: unknown;
  tagline?: unknown;
}

/**
 * Optional per-deployment branding injected via `config.js`. All fields are
 * optional; absent fields keep the stock look, so existing deployments are
 * unaffected.
 */
export interface Branding {
  /** Product/company name shown as the page title + heading. */
  brandName: string | null;
  /** Accent color (any CSS color) applied to the `--accent` variable. */
  accent: string | null;
  /** Short line rendered under the heading. */
  tagline: string | null;
}

/** Read the injected branding synchronously (config.js runs before us). */
export function resolveBranding(): Branding {
  const injected = window.__RT_CONFIG__;
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim().length > 0 ? v : null;
  return {
    brandName: str(injected?.brandName),
    accent: str(injected?.accent),
    tagline: str(injected?.tagline),
  };
}

declare global {
  interface Window {
    /** Injected by the hosting container's `config.js` (written from env). */
    __RT_CONFIG__?: InjectedConfig;
  }
}

const DEV_DEFAULTS = {
  endpoint: 'http://localhost:4317',
  apiKey: 'replace-me-with-long-random-string',
} as const;

/** Same-origin endpoint the managed proxy exposes to mint per-visitor keys. */
const MINT_PATH = '/api/session-key';

/**
 * Mint a short-lived `events:write`-only key from the hosting proxy. Uses
 * `rawFetch` (pre-wrap) so the mint call itself isn't captured as an SDK
 * api-latency breadcrumb.
 */
async function mintSessionKey(): Promise<string> {
  const res = await rawFetch(MINT_PATH, {
    method: 'POST',
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`session-key mint failed: ${res.status}`);
  const body = (await res.json()) as { apiKey?: unknown };
  if (typeof body.apiKey !== 'string' || !body.apiKey) {
    throw new Error('session-key mint returned no apiKey');
  }
  return body.apiKey;
}

export async function resolveRuntimeConfig(): Promise<RuntimeConfig> {
  const injected = window.__RT_CONFIG__;

  const endpoint =
    injected && typeof injected.endpoint === 'string' && injected.endpoint
      ? injected.endpoint
      : DEV_DEFAULTS.endpoint;

  // Static key present (OSS demo, or a dev config.js) → use it verbatim.
  if (injected && typeof injected.apiKey === 'string' && injected.apiKey) {
    return { endpoint, apiKey: injected.apiKey, mintKey: null };
  }

  // A config.js was injected but carried no key → managed demo: mint per
  // visitor. Keep `mintKey` even if the first mint fails so the transport can
  // retry on a later 401; the endpoint (from config.js) stays correct so the
  // failure surfaces as a visible 401 rather than a wrong-host misconfig.
  if (injected) {
    let apiKey: string = DEV_DEFAULTS.apiKey;
    try {
      apiKey = await mintSessionKey();
    } catch {
      /* transport re-mints on the first 401 */
    }
    return { endpoint, apiKey, mintKey: mintSessionKey };
  }

  // No config.js at all (plain static host / `npm run dev`).
  return { endpoint, apiKey: DEV_DEFAULTS.apiKey, mintKey: null };
}
