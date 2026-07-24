# Changelog

All notable changes to this repository are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This repository does not follow a single version number — each example has
its own release cadence if and when it needs one. Dates are used as the
top-level grouping instead.

## [Unreleased]

### Changed
- **`web/vite-storefront-ts` gains multi-clip record mode.** The deliberately
  buggy storefront's **Report a problem** widget now runs in record mode —
  `autoCapture.replay.mode: 'review'` + `reportWidget: { record: { clips: 'multi' } }`
  — so a user records, pauses/resumes to capture several masked clips, removes any
  they don't want, and submits them with the report (buffered locally, uploaded
  only on Submit; Discard drops them). This replaces the previous automatic
  whole-session replay; JS/API-error auto-capture is unchanged, and a clip
  recorded across routes still stays one continuous recording (the SPA rationale).
  Pure client config — the SDK wires the widget recorder onto `client.replay.*`,
  no imperative mount. The tenant's replay policy must be `auto` for the clip
  uploads to be accepted (no consent step, unlike `platform-consent-demo`).

## [2026-07-16] — v0.3.0

The `web/platform-consent-demo` becomes a user-driven **record → review →
submit** demo built on the SDK's record-mode report widget (contract v0.3.0),
tier-adaptive (Platform multi-clip curation vs. OSS whole-session).

### Fixed
- **Platform demo verdict hero stayed out of sync.** The hero now ignores replay
  verdicts that no longer apply — none while stopped (so it no longer stuck at
  `200` after you turned Session replay off), and none that contradict the
  current intent (a stale `200` from the server's ~5s consent-verdict cache right
  after a withdrawal). **Reset** now aborts a running guided demo cleanly
  (stops recording, re-enables the toggle) instead of fighting it.
- **Portal timeline was noisy with dead-click events.** Disabled the frustration
  heuristics (`deadClick` / `rageClick` / `repeatedSubmit`) in the Platform demo
  — every click on a control that doesn't mutate the DOM was reading as a dead
  click. Error/network breadcrumbs stay on (`errorJs` etc. are unchanged).

### Added
- **A "Core capture" demonstration** on the Platform demo — *Throw a JS error* /
  *Failed API call*, framed as "events and errors flow to the portal regardless
  of replay consent; only the rich session replay is consent-gated". Shows the
  SDK's auto-capture (`error.js` / `error.api`) works with no `capture()` call.
- **One-click "Report a problem"** on the Platform demo (the SDK's built-in
  report widget) — carries the recent breadcrumb trail and correlates to the
  session's masked replay by support code. The **Support code** is now
  click-to-copy.

### Changed
- **Reorganized the demo page + widget polish.** Sections now read top-to-bottom
  **Core capture** (badge: *Automatic · no code*) → **Explicit capture** (badge:
  *Your code*, a `rt.track()` example) → **Record an issue** (bottom), which opens
  the widget from a page button. The report widget mounts as a compact **icon**
  launcher (`launcher: 'icon'`) with a **consent notice + Privacy Policy link**
  above Record; Submit now disables immediately + confirms + auto-closes; the
  controls bar is draggable.
- **Reworked the demo into a user-driven record → review → submit flow.** The
  consent-gated section (the `Session replay` toggle, guided demo, and live
  verdict hero) is gone; recording is now driven from the SDK's **report widget
  in `record` mode** — a Record button, a full-screen red recording frame, and
  pause / curate / submit controls. Replay is **buffered locally and uploaded
  only on Submit** (`autoCapture.replay.mode: 'review'`); Discard drops it. The
  widget is **tier-adaptive**: Platform unlocks multi-clip curation and records
  consent on the Record click (`POST /api/consent`, so the managed server admits
  the submit); OSS records the whole session as one clip with no consent step.
  Supersedes the consent-toggle / guided-demo iterations below.
- Removed the redundant `PLATFORM` badges from the Platform demo.
- **Simplified the Platform demo to its essence.** Merged the two switches
  (consent + record) into **one** `Session replay` toggle — one click records
  consent and starts recording, like a real integration. The enforcement story
  (recording continues while the server refuses on withdrawal → `403`) now lives
  entirely in the guided demo, which drives the two independently. Removed the
  operator panel, the diagnostics dump, the event log, the raw verdict feed, the
  "Generate replay activity" button, and the Endpoint/API-key readouts — leaving
  the why-panel, the one toggle, the guided demo, and the verdict hero.
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
