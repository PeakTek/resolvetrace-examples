# web/vite-vanilla-ts

Browser demo that drives `@peaktek/resolvetrace-sdk` against a ResolveTrace
OSS ingest server. Vanilla TypeScript, Vite tooling, no frontend framework —
intended as the **smallest possible reference** for "SDK → ingest server".

## What it demonstrates

- Creating a client with `createClient({ apiKey, endpoint })`
- `track(name, attrs)` and `capture({ type, attributes })` — the two main capture entry points
- `flush()`, `shutdown()`, `getDiagnostics()` — lifecycle + observability
- The built-in Stage-1 scrubber redacting PII before the batch leaves the browser

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

Two build-time Vite env vars drive the demo. Defaults match
`resolvetrace-core`'s docker-compose stack, so the zero-config path works
out of the box against a local OSS install.

| Var | Default | Purpose |
|---|---|---|
| `VITE_RT_ENDPOINT` | `http://localhost:4317` | Ingest server base URL. |
| `VITE_RT_API_KEY` | `replace-me-with-long-random-string` | Bearer token. Must match `OSS_API_KEY` on the server. |

For local dev (`npm run dev`): put values in `.env.local`.
For Docker: put values in a `.env` next to `docker-compose.yml`, or pass
them via `--build-arg` on `docker build`.

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

Application code in `src/main.ts` does not change.
