# resolvetrace-examples

Reference integrations for [ResolveTrace](https://resolvetrace.com). Each
subdirectory is a **self-contained, runnable** example showing how to wire
a ResolveTrace SDK into a single tech stack. Examples are intended to be
copy-paste starting points for your own apps — pick the folder that matches
your stack and go.

## Available examples

| Path | Stack | What it demonstrates |
|---|---|---|
| [`web/vite-vanilla-ts`](./web/vite-vanilla-ts) | Vite + TypeScript (vanilla, no framework) | Browser SDK talking to a local OSS ingest server end-to-end. |

Planned: `web/react-ts`, `web/next-app-router`, `web/sveltekit`,
`backend/node-express`, `backend/python-fastapi`, `mobile/react-native`.

## Folder conventions

Examples are grouped by category:

```
resolvetrace-examples/
├── web/          # browser / front-end (TS or JS)
├── backend/      # server-side by language (Node, Python, Go, …)
└── mobile/       # native / hybrid (React Native, Flutter, …)
```

Each example ships with the same three things so deployment is consistent:

| File | Purpose |
|---|---|
| `README.md` | Prerequisites, run instructions, expected behavior. |
| `Dockerfile` | Reproducible container image. |
| `docker-compose.yml` | One-command local + cloud run. |
| `.env.example` | All runtime config documented. |

## Quickstart

Every example has the same two deploy paths — pick whichever fits your
environment.

### Local dev (fastest iteration)

```bash
cd web/vite-vanilla-ts
npm install
npm run dev       # http://localhost:5173
```

### Any machine with Docker (laptop, VM, cloud server)

```bash
cd web/vite-vanilla-ts
docker compose up --build    # http://localhost:8080
```

Set `VITE_RT_ENDPOINT` / `VITE_RT_API_KEY` in a `.env` next to the
compose file to point at your actual ingest server — defaults target a
local `resolvetrace-core` stack on `localhost:4317`.

## SDK source resolution

Until the SDK publishes to npm, examples pull the SDK directly from the
`resolvetrace-contract` repo. Clone it **as a sibling** of this repo:

```
parent/
├── resolvetrace-contract/
└── resolvetrace-examples/     <-- this repo
```

Once `@peaktek/resolvetrace-sdk` is on npm, each example will switch to a
normal `dependencies` entry and this sibling-checkout requirement goes
away.

## License

[Apache-2.0](./LICENSE). Example code is permissively licensed so you can
lift it into your own projects without friction.
