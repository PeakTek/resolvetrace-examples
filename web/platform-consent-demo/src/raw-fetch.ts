/**
 * The original `fetch`, captured at module load — BEFORE the SDK's auto-capture
 * wraps `window.fetch` with its API-breadcrumb source (that happens during
 * `createClient`).
 *
 * Demo *instrumentation* (the SDK transport wrapper + the `/api/*` calls) uses
 * this so it does NOT trip the breadcrumb source. Otherwise every telemetry
 * upload would be re-captured as a `perf.api_latency` event, which is itself
 * queued and uploaded — a feedback loop that floods the session with API-call
 * breadcrumbs. The demo's deliberate "Slow fetch" / "Failed API call" buttons
 * still use the normal (wrapped) `fetch` so they DO demonstrate capture.
 *
 * This module must be imported before the client is created; ES module
 * evaluation guarantees that (imports resolve before the importing module's
 * body runs, and `createClient` runs in that body).
 */
export const rawFetch: typeof fetch = globalThis.fetch.bind(globalThis);
