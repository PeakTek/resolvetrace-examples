# web/vite-vanilla-ts

The **smallest browser reference** for `@peaktek/resolvetrace-sdk` → a
ResolveTrace ingest server. Vanilla TypeScript, Vite tooling, no frontend
framework, one file of app code ([`src/main.ts`](./src/main.ts)).

A real single-backend app looks like this: `createClient({ apiKey, endpoint })`,
then `track` / `capture`. No tier probing, no key-minting, no custom transport.

> Looking for the managed, consent-gated replay demo (the Platform sales demo)?
> That's the sibling [`web/platform-consent-demo`](../platform-consent-demo).

## What it demonstrates

- Creating a client with `createClient({ apiKey, endpoint })`
- `track(name, attrs)` and `capture({ type, attributes })` — the two capture entry points
- The built-in Stage-1 scrubber redacting PII before the batch leaves the browser
- Whole-session masked replay (`autoCapture.replay.mode: 'auto'`) + an on/off toggle
- Browser auto-capture (rage/dead clicks, uncaught JS errors, failed fetches) — no explicit `capture()` call
- The per-session support code + `reportProblem()`
- `flush()`, `shutdown()`, `getDiagnostics()` — lifecycle + observability

## Prerequisites

- Node.js 20+, npm 10+
- Docker (optional — only for the containerised path)
- A running ResolveTrace ingest server. The fastest one to stand up is
  [`resolvetrace-core`](https://github.com/PeakTek/resolvetrace-core)'s
  docker-compose stack.
- **For now:** `resolvetrace-contract` cloned as a sibling directory (the SDK
  source is resolved from there via a Vite alias until the SDK publishes to npm).

## Run it — three ways

### 1. Local dev server (fastest iteration)

```bash
npm install
npm run dev                        # http://localhost:5173
```

Point it at a different ingest server by editing `public/config.js` (dev) or the
container env (Docker, below).

### 2. Local production preview

```bash
npm install
npm run build                      # tsc --noEmit && vite build → dist/
npm run preview                    # serves dist/ on http://localhost:8080
```

### 3. Docker / any cloud server

```bash
cp .env.example .env               # edit to taste
docker compose up --build          # http://localhost:8080
```

Override the listening port with `DEMO_PORT=9000 docker compose up --build`.

## Configuration

The demo reads its config at **runtime**, not build time — the image bakes
nothing environment-specific. The runtime server (`serve.mjs`) writes a
`config.js` from container env at startup (setting `window.__RT_CONFIG__`, loaded
before the app), so the same image runs against any ingest server.

| Var | Default | Purpose |
|---|---|---|
| `RT_INGEST_ENDPOINT` | `http://localhost:4317` | Ingest server base URL. |
| `RT_PUBLIC_TENANT_KEY` | `replace-me-with-long-random-string` | events:write-only key, browser-exposed by design. Must match a key the server accepts. |

## How the SDK is wired in

Until the SDK is on npm, the example references it via a Vite alias in
[`vite.config.ts`](./vite.config.ts):

```ts
alias: {
  '@peaktek/resolvetrace-sdk': '<sibling>/resolvetrace-contract/sdk/typescript/src/index.ts',
}
```

Once `@peaktek/resolvetrace-sdk` ships on npm: add it to `dependencies`, delete
the `alias` in `vite.config.ts` and the `paths` entry in `tsconfig.json`.
`src/main.ts` does not change.
