# Changelog

All notable changes to this repository are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This repository does not follow a single version number — each example has
its own release cadence if and when it needs one. Dates are used as the
top-level grouping instead.

## [Unreleased]

### Changed
- **Split into two focused examples.** The one tier-adaptive app became two
  self-contained examples, each simple for its audience:
  - [`web/vite-vanilla-ts`](./web/vite-vanilla-ts) is now the **minimal OSS
    quickstart** — one page, one `main.ts`, `createClient` + `track`/`capture` +
    PII scrubbing + `auto` masked replay + auto-capture + lifecycle. No tier
    probe, no key-minting, no inspecting transport (the SDK sends its own uploads
    with the original `fetch`, so there's no feedback loop to work around).
  - [`web/platform-consent-demo`](./web/platform-consent-demo) is the new
    **Platform sales demo** — consent/record toggles, guided demo, live
    `201`/`403 consent_required` verdicts, and the operator panel. It keeps the
    capability probe, per-visitor key-minting, and inspecting transport, and is
    served by a managed backend that provides the `/api/*` contract.

  The landing/OSS-features/Platform-features pages and the shared tier machinery
  are gone.
- **Split into three pages.** The single tabbed page is now a landing page
  (`index.html`) linking to an **OSS features** page (`oss.html`, one
  `auto`-mode client) and a **Platform features** page (`platform.html`, one
  `manual`-mode client). Each page hardcodes the SDK replay mode that matches its
  backend — closer to what a real single-backend app looks like — and the same
  built `dist/` still serves all three against any backend (multi-page Vite
  build; the landing + Platform pages still probe `GET /api/capabilities`).
- **Consent-gated replay is now two toggles.** The Platform page replaces the
  Allow / No-thanks / Grant / Withdraw / Reset buttons with two independent
  switches — **Replay consent** (Allow ⇄ Withdraw, recorded server-side) and
  **Record replay** (Start ⇄ Stop, driving `replay.start()/stop()`) — plus a live
  status line, so the enforcement gap is visible: recording while consent is
  withdrawn yields `403 consent_required`; allowing flips it to `201`.
- **Guided demo on the Platform page.** A one-click **Run guided demo** auto-drives
  the enforcement story in ~30s (allow + record → `201`; withdraw while recording
  → `403 consent_required`; re-allow → `201`), narrated step-by-step and paced by
  the server's actual verdicts. Adds a buyer-facing "why this matters" callout
  (data-plane enforcement, auditable, GDPR/CCPA/PIPEDA) and a **Reset demo**
  button for a clean slate between runs.

### Removed
- The **Enterprise** teaser section (SSO/SAML, dedicated isolation, audit export)
  — out of scope for this demo for now.

### Changed
- **Runtime configuration.** The demo now reads its endpoint + key at runtime
  from `window.__RT_CONFIG__` (a `config.js` the hosting container writes from
  its env at startup) instead of build-time `VITE_RT_*` inlining. The same image
  runs against any environment — nothing environment-specific is baked. Env vars
  are now `RT_INGEST_ENDPOINT` / `RT_PUBLIC_TENANT_KEY` (container env, not build
  args).
- The Docker image serves via a small dependency-free Node static server
  (`serve.mjs`) that writes `config.js` from env and serves the build (replacing
  the nginx runtime stage).

### Added
- Managed (ResolveTrace Platform) support: when the injected config carries no
  key, the app requests a short-lived, `events:write`-only key per visitor from
  the hosting backend (`POST /api/session-key`) and rotates it on expiry — so a
  browser-exposed key is short-lived rather than static.

## [2026-06-28] — web/vite-vanilla-ts v0.2.0

Paired with `@peaktek/resolvetrace-sdk` v0.2.0.

### Added
- Initial repository scaffold (`.gitattributes`, `.gitignore`, `LICENSE`,
  top-level `README.md`, CI workflow).
- First example: `web/vite-vanilla-ts` — browser SDK demo against a local
  OSS ingest server, deployable via `npm run dev` or `docker compose up`.

### Fixed
- The "Failed fetch" button hit a same-origin path that the Vite dev server and
  the production nginx config SPA-fallback to `index.html` (HTTP 200), so it
  emitted `perf.api_latency` instead of `error.api`. It now calls the ingest API
  (a real 4xx) and is relabeled "Failed API call (4xx)".

### Changed
- Replaced the `beforeunload → rt.shutdown()` unload handler (which ended the
  session on every refresh) with a `pagehide` / `visibilitychange→hidden` flush
  via `rt.flush({ keepalive: true })` — a best-effort final flush that does not
  end the session, so a refresh resumes the same session while a tab close still
  yields a fresh one.
