# vite-storefront-ts — a deliberately buggy demo storefront

**Nimbus Supply Co.** is a small storefront single-page app on
`@peaktek/resolvetrace-sdk`. It exists to show, in one place, how little code it
takes to get the SDK's headline value:

- **Automatic exception capture** — uncaught JS errors (`error.js`) and failed
  API calls (`error.api`) are captured with **no per-event code**. Auto-capture
  is on by default; the app never calls `capture()` for any of its bugs.
- **User-reported issues with a recorded replay** — the floating **Report a
  problem** widget runs in **record mode**: the user hits **Record**, reproduces
  the bug (browsing across routes if they like), then **Submit** to send the
  recording — or **Discard**. Nothing leaves the browser until Submit. The
  session's **support code** shows in the header.
- **A live OSS-vs-Platform differentiator, with no client change** — the widget
  adapts to whatever the **backend** advertises at session-start. Against the
  **OSS core** it records **a single clip** (the whole session). Against a
  **Platform tenant** with multi-clip granted, the same build unlocks
  **pause/resume multi-clip curation** — capture several masked clips and remove
  any before Submit. The SDK reads the server capability; the app configures
  nothing, and OSS code can't flip it on.
- **Masked session replay** — the recording is masked (form inputs never leave
  the browser); a clip recorded while navigating captures the page-to-page
  transitions as one continuous recording.

The app is intentionally broken so there is something real to capture. The whole
SDK integration is the single `createClient(...)` in [`src/main.ts`](src/main.ts)
— replay uses `autoCapture.replay.mode: 'review'` (buffer locally, upload on
Submit) and `reportWidget: { record: true }` (the SDK wires the record UI onto
`client.replay.*` for you and adapts single- vs multi-clip to the backend; no
extra app code).

> **Deployment note:** for the clip uploads to be accepted, the tenant's replay
> policy must be **`auto`** (spin it with `--replay auto`, per the platform
> runbook). Only the consent-gated `manual` policy would require recorded consent
> — which this non-consent demo doesn't do. Multi-clip curation additionally
> requires a backend that advertises it (a Platform tenant with multi-clip
> enabled); against OSS core the widget stays single-clip.

## Why a single-page app (this is the important part)

The requirement "multiple pages, to show replay capturing navigation" is met
with **client-side routes**, not separate HTML pages — on purpose.

The SDK keeps one session across a full page reload (the session id lives in
`sessionStorage`), **but the replay chunk sequence is in-memory only** and
restarts at `0` on every reload. The server keys replay chunks by
`(tenant, session, sequence)` and overwrites on a repeat — so if a recorded clip
spanned a full page load, the second page's chunks would *overwrite* the first's
and corrupt the clip. A client-side-routed SPA keeps one JS context, so a clip
recorded while the user navigates stays a single continuous recording and the
route changes show up as live DOM mutations. That is why this example routes on
the client (History API, see [`src/router.ts`](src/router.ts)).

## The intentional bugs

| Where | Action | What the SDK captures |
|---|---|---|
| Home `/` | loads | "Recommended for you" widget throws a `TypeError` → **`error.js`** |
| Shop `/products` | loads | `GET /api/products` succeeds → `perf.api_latency` (a healthy call, for contrast) |
| Product `/product/:id` | "Load reviews" | `GET /api/products/:id/reviews` → **404** → **`error.api`** |
| Product `/product/:id` | "Add to wishlist" | handler throws → **`error.js`** |
| Checkout `/checkout` | "Pay" | `POST /api/checkout` → **500** → **`error.api`**; then "Report this problem" → **`support.report_submitted`** |
| Order `/order` | "Track order" | async handler rejects, uncaught → **`error.js`** (`unhandledrejection`) |

Card fields on the checkout form are **masked in session replay** (the SDK masks
all inputs); static page text stays readable (`maskAllText: false`).

The `/api/*` routes are the storefront's **own** (broken) backend — separate from
the ResolveTrace ingest endpoint. They are served identically in dev and in the
container by [`api-bugs.mjs`](api-bugs.mjs).

## Run it

```bash
npm install            # or symlink node_modules to a sibling example's
npm run dev            # Vite dev server → http://localhost:5173

# or a production build + static server (the container's runtime):
npm run build          # tsc --noEmit && vite build → dist/
npm run preview        # → http://localhost:8080

# or the container:
cp .env.example .env   # point RT_INGEST_ENDPOINT / RT_PUBLIC_TENANT_KEY at your ingest
docker compose up --build   # → http://localhost:8080
```

To see events and replay land in a portal, point the config at a running
ResolveTrace ingest server (OSS core, or a managed tenant) and use an
`events:write` key. In `npm run dev` edit [`public/config.js`](public/config.js);
in the container set `RT_INGEST_ENDPOINT` + `RT_PUBLIC_TENANT_KEY` (serve.mjs
writes them into `config.js` at startup). With no server reachable the app still
runs and still *captures* everything — a small banner just notes it can't upload.

## How the SDK is wired in

The SDK is not on npm yet, so the example resolves `@peaktek/resolvetrace-sdk`
to the TypeScript source of a **sibling checkout** of `resolvetrace-contract`,
via a Vite `resolve.alias` (in [`vite.config.ts`](vite.config.ts)) mirrored by a
`paths` entry in [`tsconfig.json`](tsconfig.json), both pointing at
`../../../resolvetrace-contract/sdk/typescript/src/index.ts`. Once
`@peaktek/resolvetrace-sdk` publishes to npm: add it to `dependencies`, delete
the alias and the `paths` entry — `src/` does not change.
