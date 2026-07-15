// Dev placeholder — served as-is by `npm run dev`.
//
// In a real deployment the hosting ResolveTrace Platform backend OVERWRITES
// this file from its env at startup, writing only the `endpoint` (the managed
// demo mints a short-lived events:write key per visitor via POST
// /api/session-key — see src/config.ts). For local `npm run dev` there is no
// such backend, so we ship a dev `apiKey` too, and the app runs in teaser mode
// (the capability probe fails closed without the /api/* contract).
window.__RT_CONFIG__ = {
  endpoint: 'http://localhost:4317',
  apiKey: 'replace-me-with-long-random-string',
};
