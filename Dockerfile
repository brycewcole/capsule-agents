# syntax=docker/dockerfile:1.7-labs

# ─── Stage 1: Build Vite frontend (pnpm) ─────────────────────────
FROM node:24-alpine AS frontend-builder

# Enable pnpm via corepack and put pnpm on PATH
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /home/app/capsule-agents-frontend

# 1) Copy lockfile & manifest first to maximize caching
COPY capsule-agents-frontend/pnpm-lock.yaml ./
COPY capsule-agents-frontend/package.json ./

# 2) Pre-fetch deps into pnpm virtual store (great for Docker layer cache)
#    Mount a persistent cache for the pnpm store so rebuilds are fast
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm fetch

# 3) Copy source and install from the local store (offline), then build
COPY capsule-agents-frontend/ ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --offline --frozen-lockfile --prod=false && \
  pnpm run build

# ─── Stage 2: Build/Cache Deno backend ───────────────────────────
FROM denoland/deno:2.1.0 AS backend-builder

ENV DENO_NO_UPDATE_CHECK=1 \
  DENO_NO_PROMPT=1 \
  DENO_DIR=/deno-dir
WORKDIR /app

# If you have a deno.lock, copy it too for deterministic deps
# COPY --chown=deno:deno capsule-agents-backend/deno.lock ./deno.lock
COPY --chown=deno:deno capsule-agents-backend/deno.json ./
COPY --chown=deno:deno capsule-agents-backend/src ./src

# Warm Deno cache and keep it across builds
RUN --mount=type=cache,target=/deno-dir \
  deno cache src/index.ts
# If you maintain a deno.lock, prefer:
# RUN --mount=type=cache,target=/deno-dir deno cache --lock=deno.lock --lock-write src/index.ts

# ─── Stage 3: Final runtime image (merge UI + API) ───────────────
FROM denoland/deno:2.1.0 AS runtime

ENV DENO_NO_UPDATE_CHECK=1 \
  DENO_NO_PROMPT=1 \
  DENO_DIR=/deno-dir
WORKDIR /app

# bring code + caches
COPY --from=backend-builder --chown=deno:deno /app ./
COPY --from=backend-builder --chown=deno:deno /deno-dir /deno-dir
COPY --from=frontend-builder --chown=deno:deno /home/app/capsule-agents-frontend/dist/ ./static/

# ensure writable runtime dirs
USER root
RUN install -d -o deno -g deno /app/data /app/agent-workspace /app/static /app/config
USER deno

# Create default config directory and ensure it's writable
# Note: Mount your config file to /app/agent.config.json or set AGENT_CONFIG_FILE env var
EXPOSE 80
CMD ["deno", "run", "--allow-all", "--node-modules-dir", "src/index.ts"]