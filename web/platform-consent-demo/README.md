# web/platform-consent-demo

The **ResolveTrace Platform** demo: consent-gated session replay that the server
enforces, plus a small operator panel. Vanilla TypeScript + Vite, driving
`@peaktek/resolvetrace-sdk` in `manual` replay mode.

This is the **sales/product demo** for the managed tier. If you just want the
smallest "SDK → ingest server" reference, see the OSS quickstart in
[`web/vite-vanilla-ts`](../vite-vanilla-ts) instead.

## What it demonstrates

Consent-gated replay is driven by **two independent switches**, so the
enforcement is visible rather than asserted:

- **Replay consent** (Allow ⇄ Withdraw) — records the end-user decision
  server-side (`POST /api/consent`). This is the evidence the server checks.
- **Record replay** (Start ⇄ Stop) — drives the public
  `client.replay.start()` / `client.replay.stop()` capture span (recording is
  client-side).

The browser records whenever **Record** is on, but the managed server only
*admits* chunks when consent is on file. Turn Record on with consent allowed →
uploads `201`. Withdraw consent while still recording → the server rejects new
chunks `403 consent_required` within ~5s (the gate is in the data plane, not the
client). A live status line + verdict panel show it as it happens.

Also here:

- **Run guided demo** — one button walks the whole `201 → 403 → 201` story in
  ~30s, narrated and paced by the server's real verdicts.
- **Operator panel** — read/switch the tenant's replay policy and list consent
  records (audit trail).

Everything is built on public SDK primitives plus the small `/api/*` contract
the hosting deployment provides. The demo carries no consent logic of its own —
it's a demo-local banner over the primitives, not the managed consent feature.

## Deployment & the `/api` contract

Unlike the OSS quickstart, this app is **served by a ResolveTrace Platform
backend**, which provides a small same-origin `/api/*` contract (the operator
credential stays server-side; the browser gets a short-lived, `events:write`-only
key minted per visitor):

| Route | Purpose |
|---|---|
| `GET /api/capabilities` | `{ tier, consent }` — activates the Platform controls |
| `POST /api/session-key` | mint a short-lived events:write key for this visitor |
| `POST /api/consent` | record a consent decision for the current session |
| `GET`/`PUT /api/replay-mode` | read / set the demo tenant's replay mode |
| `GET /api/consent-records` | list recorded consent decisions |

The endpoint (and, on the managed deployment, the absence of a static key) is
read at runtime from `window.__RT_CONFIG__` — a `config.js` the hosting backend
writes from its env at startup. Nothing environment-specific is baked into the
build.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Without a Platform backend the capability probe fails **closed**: the page loads
in teaser mode (controls disabled) — expected for `npm run dev`. Pointed at a
ResolveTrace Platform backend that serves the `/api/*` contract above, the
controls activate and the consent-enforcement flow works end to end.

The SDK is resolved from source via a Vite alias (see
[`vite.config.ts`](./vite.config.ts)) until `@peaktek/resolvetrace-sdk` publishes
to npm — identical to the other examples.
