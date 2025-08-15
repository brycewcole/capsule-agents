# syntax=docker/dockerfile:1.7-labs

# ─── Stage 1: Build Vite frontend ────────────────────────────────
FROM node:24-alpine AS frontend-builder

# (remove USER app here)
WORKDIR /home/app/capsule-agents-frontend

# install deps (cache for speed)
ENV npm_config_cache=/root/.npm
COPY capsule-agents-frontend/package.json ./
COPY capsule-agents-frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
  npm ci --no-audit --no-fund --progress=false

# copy source & build
COPY capsule-agents-frontend/ ./
RUN --mount=type=cache,target=/root/.cache \
  npm run build

# ─── Stage 2: Build/Cache Deno backend ───────────────────────────
FROM denoland/deno:2.1.0 AS backend-builder

ENV DENO_NO_UPDATE_CHECK=1 \
  DENO_NO_PROMPT=1 \
  DENO_DIR=/deno-dir
WORKDIR /app

# Copy lockfile if you have one (recommended)
# COPY --chown=deno:deno capsule-agents-backend/deno.lock ./deno.lock
COPY --chown=deno:deno capsule-agents-backend/deno.json ./
COPY --chown=deno:deno capsule-agents-backend/src ./src

# Warm Deno cache and keep it across builds
RUN --mount=type=cache,target=/deno-dir \
  deno cache src/index.ts
# If you maintain a deno.lock, prefer:
# deno cache --lock=deno.lock --lock-write src/index.ts

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

# 🔧 ensure writable runtime dirs
USER root
RUN install -d -o deno -g deno /app/data /app/agent-workspace /app/static
USER deno

EXPOSE 80
# keep cached-only if you populated caches earlier
CMD ["deno", "run", "--allow-all", "--node-modules-dir", "src/index.ts"]