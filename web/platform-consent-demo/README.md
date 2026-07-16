# web/platform-consent-demo

The **ResolveTrace demo**: a user-driven "record an issue → review → submit"
flow built on the SDK's "Report a problem" widget in `record` mode. Vanilla
TypeScript + Vite, driving `@peaktek/resolvetrace-sdk` in `review` replay mode.

If you just want the smallest "SDK → ingest server" reference, see the OSS
quickstart in [`web/vite-vanilla-ts`](../vite-vanilla-ts) instead.

## What it demonstrates

The report widget gains a **Record** button. Clicking it starts a masked session
recording and — against a managed backend — records the user's consent
server-side. A **red frame** around the screen shows recording is live, and an
unobtrusive controls bar lets the user curate before anything is sent:

- **Nothing uploads until Submit.** Replay chunks are buffered locally
  (`autoCapture.replay.mode: 'review'`); **Submit** uploads the kept clips,
  **Discard** throws them away.
- **The widget adapts to the backend it detects** (via `GET /api/capabilities`):
  - **Platform** — **Pause/Resume** accrues multiple clips the user can remove
    individually before submitting; the Record click records consent
    (`POST /api/consent`) so the managed server admits the submit.
  - **OSS** — the whole session records as one clip (submit or discard); no
    consent step (the OSS server admits replay without one).

Core capture (JS errors, failed API calls) flows to the portal regardless of
replay — the two buttons on the page demonstrate it.

Everything is built on public SDK primitives — `client.replay.{start, stop,
listClips, removeClip, submit, discard}` + `mountReportWidget({ record })` with a
neutral `onRecordStart` hook — plus the small `/api/*` contract the hosting
deployment provides. The demo carries no consent logic of its own; the SDK
carries no tier/consent logic at all.

## Deployment & the `/api` contract

Served by a ResolveTrace Platform backend that provides a small same-origin
`/api/*` contract (the operator credential stays server-side; the browser gets a
short-lived, `events:write`-only key minted per visitor):

| Route | Purpose |
|---|---|
| `GET /api/capabilities` | `{ tier, consent }` — picks single- vs multi-clip mode |
| `POST /api/session-key` | mint a short-lived events:write key for this visitor |
| `POST /api/consent` | record the consent decision on the Record click |

The endpoint (and, on the managed deployment, the absence of a static key) is
read at runtime from `window.__RT_CONFIG__` — a `config.js` the hosting backend
writes from its env at startup. Nothing environment-specific is baked into the
build.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
```

Without a Platform backend the capability probe fails **closed** to OSS: the
widget runs in single-clip mode (record → submit or discard the whole session),
which is the correct OSS behavior. Pointed at a ResolveTrace Platform backend, it
unlocks multi-clip curation and records consent on the Record click.

The SDK is resolved from source via a Vite alias (see
[`vite.config.ts`](./vite.config.ts)) until `@peaktek/resolvetrace-sdk` publishes
to npm — identical to the other examples.
