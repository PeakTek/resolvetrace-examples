# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the Vite storefront example (a deliberately buggy demo).
#
# The image is environment-agnostic: no endpoint/key is baked. At startup the
# runtime server (serve.mjs) writes `config.js` from container env
# (RT_INGEST_ENDPOINT + RT_PUBLIC_TENANT_KEY), so the SAME image runs against
# any deployment.
#
# Build context MUST be the parent directory that contains BOTH
# `resolvetrace-examples/` and `resolvetrace-contract/` side-by-side (the Vite
# build bundles the SDK from source). The companion `docker-compose.yml` sets
# this up automatically; the raw CLI equivalent is:
#
#   cd <parent-of-both-repos>
#   docker build \
#     -f resolvetrace-examples/web/vite-storefront-ts/Dockerfile \
#     -t resolvetrace-storefront-demo .
#
# Once `@peaktek/resolvetrace-sdk` is published to npm, drop the COPY of the
# contract tree and switch the example's package.json to a real dependency.

# ---- Stage 1: build -------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /build

# Copy only what the Vite build needs. See `.dockerignore` for the exclusions.
COPY resolvetrace-contract/sdk/typescript \
     /build/resolvetrace-contract/sdk/typescript
COPY resolvetrace-examples/web/vite-storefront-ts \
     /build/resolvetrace-examples/web/vite-storefront-ts

# The Vite build bundles the SDK from source (see the alias in vite.config.ts),
# so the SDK's own runtime deps (e.g. rrweb, imported lazily) must be installed
# in the SDK tree for the alias to resolve. Drop once the SDK ships from npm.
WORKDIR /build/resolvetrace-contract/sdk/typescript
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

WORKDIR /build/resolvetrace-examples/web/vite-storefront-ts
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

# No VITE_* build args: the demo reads its endpoint + key at runtime from
# config.js (written by serve.mjs from container env).
RUN npm run build

# ---- Stage 2: runtime (node static server) --------------------------------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# serve.mjs imports api-bugs.mjs at runtime — copy both.
COPY resolvetrace-examples/web/vite-storefront-ts/serve.mjs ./serve.mjs
COPY resolvetrace-examples/web/vite-storefront-ts/api-bugs.mjs ./api-bugs.mjs
COPY --from=builder \
     /build/resolvetrace-examples/web/vite-storefront-ts/dist \
     /app/public

# serve.mjs writes /app/public/config.js from env at startup, so USER node must
# own that tree. A plain `RUN chown/chmod` works on BOTH the classic and
# BuildKit builders (unlike `COPY --chmod`, which needs BuildKit).
RUN chown -R node:node /app && chmod 0644 serve.mjs api-bugs.mjs

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "serve.mjs"]
