# syntax=docker/dockerfile:1.6
#
# Multi-stage build for the Vite vanilla-TS example.
#
# Build context MUST be the parent directory that contains BOTH
# `resolvetrace-examples/` and `resolvetrace-contract/` side-by-side.
# The companion `docker-compose.yml` sets this up automatically; the
# raw CLI equivalent is:
#
#   cd <parent-of-both-repos>
#   docker build \
#     -f resolvetrace-examples/web/vite-vanilla-ts/Dockerfile \
#     --build-arg VITE_RT_ENDPOINT=http://my-ingest:4317 \
#     --build-arg VITE_RT_API_KEY=... \
#     -t resolvetrace-web-demo .
#
# Once `@peaktek/resolvetrace-sdk` is published to npm, the sibling
# checkout of resolvetrace-contract is no longer needed — drop the
# COPY of that tree and switch the example's package.json to a real
# dependency.

# ---- Stage 1: build -------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /build

# Copy only what the Vite build actually needs. See `.dockerignore` for
# the exclusions that keep this context lean.
COPY resolvetrace-contract/sdk/typescript \
     /build/resolvetrace-contract/sdk/typescript
COPY resolvetrace-examples/web/vite-vanilla-ts \
     /build/resolvetrace-examples/web/vite-vanilla-ts

WORKDIR /build/resolvetrace-examples/web/vite-vanilla-ts

# Install deps. Use `npm ci` when a lockfile ships with the repo;
# `npm install` is the fallback so the scaffold builds out of the box.
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# Vite inlines `import.meta.env.VITE_*` at build time. Override via
# --build-arg at `docker build` time.
ARG VITE_RT_ENDPOINT=http://localhost:4317
ARG VITE_RT_API_KEY=replace-me-with-long-random-string
ENV VITE_RT_ENDPOINT=${VITE_RT_ENDPOINT}
ENV VITE_RT_API_KEY=${VITE_RT_API_KEY}

RUN npm run build

# ---- Stage 2: runtime (static) --------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY resolvetrace-examples/web/vite-vanilla-ts/nginx.conf \
     /etc/nginx/conf.d/default.conf

COPY --from=builder \
     /build/resolvetrace-examples/web/vite-vanilla-ts/dist \
     /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
