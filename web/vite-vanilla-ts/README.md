# web/vite-vanilla-ts

Browser demo that drives `@peaktek/resolvetrace-sdk` against a ResolveTrace
ingest server. Vanilla TypeScript, Vite tooling, no frontend framework —
intended as the **smallest possible reference** for "SDK → ingest server".

**One build, three pages.** A landing page (`index.html`) links to two feature
surfaces:

- **OSS features** (`oss.html`) — the baseline SDK surface that works on the
  self-hosted open-source build (and any backend). One `auto`-mode client
  (whole-session masked replay) exercising the public capture / lifecycle /
  auto-capture primitives.
- **Platform features** (`platform.html`) — the managed (**ResolveTrace
  Platform**) differentiators: consent-gated `manual` replay with live server
  verdicts, plus an operator panel. Against a plain OSS backend these render as
  disabled previews.

Each page hardcodes the one SDK replay `mode` that matches its backend — `auto`
on the OSS page, `manual` on the Platform page (a **Platform-only** capability).
A real single-backend app looks like one of these pages. (`mode` is the SDK's
host-set `autoCapture.replay.mode` — distinct from the operator panel's *tenant
replay policy*, a server-side setting the `/api/replay-mode` route reads/writes.)

The landing and Platform pages probe the deployment (`GET /api/capabilities`,
fail-closed to OSS): the landing page badges the detected tier and highlights the
matching card; the Platform page activates its controls against a Platform
backend and shows disabled previews otherwise. The same built `dist/` serves all
three pages against any backend.

## What it demonstrates

**OSS features page** (`oss.html` — works on the self-hosted OSS build):

- Creating a client with `createClient({ apiKey, endpoint })`
- `track(name, attrs)` and `capture({ type, attributes })` — the two main capture entry points
- `flush()`, `shutdown()`, `getDiagnostics()` — lifecycle + observability
- The built-in Stage-1 scrubber redacting PII before the batch leaves the browser
- Whole-session masked replay (`autoCapture.replay.mode: 'auto'`) + an on/off toggle
- Browser auto-capture (rage/dead clicks, repeated submit, JS errors,
  failed/slow fetches, long tasks) + the per-session support code

**Platform features page** (`platform.html` — active against a Platform backend;
disabled previews otherwise):

- Consent-gated **manual** replay driven by two independent switches:
  - **Replay consent** (Allow ⇄ Withdraw) — records the end-user decision
    server-side (`POST /api/consent`); this is the evidence the server checks.
  - **Record replay** (Start ⇄ Stop) — drives the public
    `client.replay.start()/stop()` capture span (recording is client-side).
  A live status line + verdict panel show the enforcement: recording with consent
  allowed uploads `201`; withdraw consent while still recording and the server
  rejects new chunks `403 consent_required` (the gate is in the data plane, not
  the client).
- A small operator panel — read/switch the tenant's replay mode and list
  consent records (audit trail).

## Deployment tiers &amp; the `/api` contract

The Platform sections call a small, same-origin `/api/*` contract that the
**hosting deployment provides** when the demo is served against ResolveTrace
Platform (its implementation is not part of this example):

| Route | Purpose |
|---|---|
| `GET /api/capabilities` | `{ tier, consent }` — landing badge + Platform-page activation |
| `POST /api/session-key` | mint a short-lived events:write key (managed demo) |
| `POST /api/consent` | record a consent decision for the current session |
| `GET`/`PUT /api/replay-mode` | read / set the demo tenant's replay mode |
| `GET /api/consent-records` | list recorded consent decisions |

Against a plain OSS server none of these exist; the probe fails closed and the
Platform page renders its controls as disabled previews. The demo carries no
tier or consent logic of its own — it only exercises public SDK primitives plus
this deployment-provided contract.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (optional — only for the containerised path)
- A running ResolveTrace ingest server. The fastest one to stand up is
  [`resolvetrace-core`](https://github.com/PeakTek/resolvetrace-core)'s
  docker-compose stack.
- **For now:** `resolvetrace-contract` cloned as a sibling directory (the
  SDK source is resolved from there via a Vite alias until the SDK
  publishes to npm).

Expected on-disk layout:

```
parent/
├── resolvetrace-contract/
└── resolvetrace-examples/
    └── web/vite-vanilla-ts/       ← you are here
```

## Run it — three ways

### 1. Local dev server (fastest iteration)

```bash
npm install
npm run dev                        # http://localhost:5173
```

Vite hot-reloads on every save. Point it at a different ingest server by
copying `.env.example` to `.env.local` and editing the values.

### 2. Local production preview

```bash
npm install
npm run build                      # tsc --noEmit && vite build → dist/
npm run preview                    # serves dist/ on http://localhost:8080
```

### 3. Docker / any cloud server

One-command stand-up on any machine that has Docker:

```bash
cp .env.example .env               # edit to taste
docker compose up --build          # http://localhost:8080
```

On a cloud VM (DigitalOcean, EC2, Hetzner, etc.) the workflow is identical:
`ssh`, `git clone` both repos side-by-side, `docker compose up -d --build`,
then point your browser at `http://<host>:8080`.

Override the listening port:

```bash
DEMO_PORT=9000 docker compose up --build
```

## Configuration

The demo reads its config at **runtime**, not build time — the image bakes
nothing environment-specific. Each hosting container writes a `config.js` from
its own env at startup (setting `window.__RT_CONFIG__`, loaded before the app),
so the same image runs against any ingest server. Defaults match
`resolvetrace-core`'s docker-compose stack, so the zero-config path works out of
the box.

| Var | Default | Purpose |
|---|---|---|
| `RT_INGEST_ENDPOINT` | `http://localhost:4317` | Ingest server base URL. |
| `RT_PUBLIC_TENANT_KEY` | `replace-me-with-long-random-string` | events:write-only key, browser-exposed by design. Must match a key the server accepts. |

For Docker: set them in a `.env` next to `docker-compose.yml` (they become
container env). For local dev (`npm run dev`): Vite serves the placeholder
`public/config.js` — edit its values, or just run against a local OSS server on
`localhost:4317`.

> On a managed (ResolveTrace Platform) deployment the backend mints a
> short-lived events:write key **per visitor**, so `RT_PUBLIC_TENANT_KEY` is
> omitted there and the app requests a fresh key at startup.

## Verifying events reach the server

With the default `resolvetrace-core` compose stack running locally:

```bash
curl http://localhost:4317/health                 # → {"status":"ok"}
docker compose -f <core-repo>/deploy/docker-compose.yml logs -f resolvetrace
```

Every `POST /v1/events` from the demo should land as a `202` with an
`accepted` count matching the queue depth at flush time.

## How the SDK is wired in

Until the SDK is on npm, the example references it via a Vite alias
declared in [`vite.config.ts`](./vite.config.ts):

```ts
alias: {
  '@peaktek/resolvetrace-sdk': '<sibling>/resolvetrace-contract/sdk/typescript/src/index.ts',
}
```

Override the path (useful for Docker builds with non-standard layouts) by
exporting `RESOLVETRACE_SDK_SRC=/absolute/path/to/src/index.ts` before
running Vite.

Once `@peaktek/resolvetrace-sdk` ships on npm, three small changes retire
this workaround:

1. Add `"@peaktek/resolvetrace-sdk": "^x.y.z"` to `dependencies` in `package.json`.
2. Delete the `alias` in `vite.config.ts`.
3. Delete the `paths` entry in `tsconfig.json`.

The page modules (`src/entry.ts`, `src/oss.ts`, `src/platform.ts`) do not change.
