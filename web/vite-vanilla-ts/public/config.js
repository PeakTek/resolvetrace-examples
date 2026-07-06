// Dev placeholder — served as-is by `npm run dev` and copied into the build.
// Each hosting container OVERWRITES this file from its env at startup
// (endpoint always; apiKey only for the OSS demo — the managed demo omits it
// and the app mints a per-visitor key). See src/config.ts.
window.__RT_CONFIG__ = {
  endpoint: 'http://localhost:4317',
  apiKey: 'replace-me-with-long-random-string',
};
