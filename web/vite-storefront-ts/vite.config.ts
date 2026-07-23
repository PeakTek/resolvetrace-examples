import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
// The buggy app backend, shared with serve.mjs so `npm run dev` and the
// production container return the identical 500s / 404s.
import { handleApi } from './api-bugs.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Resolve the SDK package name to its TypeScript source so the demo runs
// without a separate "build the SDK" step. A consumer installing the SDK
// from npm would simply drop this alias.
//
// Override via `RESOLVETRACE_SDK_SRC=/abs/path/to/src/index.ts` when the
// sibling checkout lives somewhere non-default (e.g. Docker build).
const sdkSrc =
  process.env.RESOLVETRACE_SDK_SRC ??
  resolve(here, '../../../resolvetrace-contract/sdk/typescript/src/index.ts');

// Serve the storefront's deliberately-broken `/api/*` in dev, exactly as the
// container's serve.mjs does in production.
function buggyApi(): Plugin {
  return {
    name: 'storefront-buggy-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handleApi(req, res)) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!handleApi(req, res)) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [buggyApi()],
  resolve: {
    alias: {
      '@peaktek/resolvetrace-sdk': sdkSrc,
    },
  },
  // The entry module awaits nothing at top level, but keep the ES2022 baseline
  // consistent with the sibling examples — all current evergreen browsers.
  build: {
    target: 'es2022',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
  },
});
