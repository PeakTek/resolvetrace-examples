// Dev placeholder for window.__RT_CONFIG__.
//
// In the container, serve.mjs OVERWRITES this file from env at startup
// (RT_INGEST_ENDPOINT + RT_PUBLIC_TENANT_KEY). For `npm run dev` these defaults
// point at a local OSS ingest server; swap them to see events land in a portal.
window.__RT_CONFIG__ = {
  endpoint: 'http://localhost:4317',
  apiKey: 'replace-me-with-long-random-string',
};
