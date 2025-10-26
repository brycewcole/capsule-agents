# syntax=docker/dockerfile:1.7-labs

ARG DENO_VERSION=2.5.2

# ─── Stage 1: Build Vite frontend (Deno) ─────────────────────────
FROM denoland/deno:${DENO_VERSION} AS frontend-builder

ENV DENO_NO_UPDATE_CHECK=1 \
  DENO_NO_PROMPT=1 \
  DENO_DIR=/deno-dir

WORKDIR /home/app/capsule-agents-frontend

# 1) Copy deno.json first to maximize caching
COPY capsule-agents-frontend/deno.json ./

# 2) Copy source files (needed for deno install to work properly)
COPY capsule-agents-frontend/ ./

# 3) Install dependencies and build
RUN --mount=type=cache,target=/deno-dir \
  deno install && \
  deno task build

# ─── Stage 2: Build/Cache Deno backend ───────────────────────────
FROM denoland/deno:${DENO_VERSION} AS backend-builder

ENV DENO_NO_UPDATE_CHECK=1 \
  DENO_NO_PROMPT=1 \
  DENO_DIR=/deno-dir
WORKDIR /app

# COPY --chown=deno:deno capsule-agents-backend/deno.lock ./deno.lock
COPY --chown=deno:deno capsule-agents-backend/deno.json ./
COPY --chown=deno:deno capsule-agents-backend/src ./src

# Warm Deno cache and keep it across builds
RUN --mount=type=cache,target=/deno-dir \
  deno cache src/index.ts

# ─── Stage 3: Final runtime image (merge UI + API) ───────────────
FROM denoland/deno:${DENO_VERSION} AS runtime

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
RUN install -d -o deno -g deno /app/data /app/agent-workspace /app/static /app/config /app/node_modules
USER deno

# Create default config directory and ensure it's writable
EXPOSE 80
# Disable automatic lockfile writes in runtime container to avoid
# permission issues when writing /app/deno.lock
CMD ["deno", "run", "--allow-all", "--unstable-cron", "--node-modules-dir", "--no-lock", "src/index.ts"]
