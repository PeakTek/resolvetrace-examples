import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Resolve the SDK package name to its TypeScript source so the demo runs
// without a separate "build the SDK" step. A consumer installing the SDK
// from npm would simply drop this alias.
//
// Override via `RESOLVETRACE_SDK_SRC=/abs/path/to/src/index.ts` when the
// sibling checkout lives somewhere non-default (e.g. Docker build).
const sdkSrc =
  process.env.RESOLVETRACE_SDK_SRC ??
  resolve(
    here,
    '../../../resolvetrace-contract/sdk/typescript/src/index.ts',
  );

export default defineConfig({
  resolve: {
    alias: {
      '@peaktek/resolvetrace-sdk': sdkSrc,
    },
  },
  // The entry module awaits a capability probe at top level (one build serves
  // both OSS and Platform backends). Target a baseline that supports top-level
  // await + ES2022 — all current evergreen browsers.
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
