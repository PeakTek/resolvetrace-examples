# Changelog

All notable changes to this repository are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This repository does not follow a single version number — each example has
its own release cadence if and when it needs one. Dates are used as the
top-level grouping instead.

## [Unreleased]

*No changes yet.*

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
