# ─── Stage 1: Build Vite frontend ────────────────────────────────
FROM node:24-alpine AS frontend-builder

# 1) create a non-root user for consistent file ownership
RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app/capsule-agents-frontend

# 2) copy only package manifests and install deps
COPY --chown=app:app capsule-agents-frontend/package.json ./
COPY --chown=app:app capsule-agents-frontend/package-lock.json ./
RUN npm install --force

# 3) copy the rest of your source and build with Vite
COPY --chown=app:app capsule-agents-frontend/ ./
RUN npm run build

# ─── Stage 2: Build/Cache Deno backend ───────────────────────
FROM denoland/deno:2.1.0 AS backend-builder

# Set Deno environment variables for production builds
ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /app

# Copy dependency manifest first for better caching
COPY --chown=deno:deno capsule-agents-backend/deno.json ./

# Copy source files
COPY --chown=deno:deno capsule-agents-backend/src ./src

# Cache dependencies (no native compilation needed with Deno SQLite)
RUN deno cache src/index.ts

# ─── Stage 3: Final runtime image (merge UI + API) ────────────────────────
FROM denoland/deno:2.1.0 AS runtime

# Set production environment variables
ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PROMPT=1

WORKDIR /app

# Copy cached dependencies and compiled code from builder
COPY --from=backend-builder /app ./

# Create directories with proper permissions
USER root
RUN mkdir -p ./static && chown -R deno:deno ./static
RUN mkdir -p ./agent-workspace && chown -R deno:deno ./agent-workspace
RUN mkdir -p ./data && chown -R deno:deno ./data
USER deno

# Copy Vite's dist/ into static for Hono to serve
COPY --from=frontend-builder --chown=deno:deno /home/app/capsule-agents-frontend/dist/ ./static/

EXPOSE 80

# Add healthcheck for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD deno run --allow-net --no-prompt -q -A - <<< "const resp = await fetch('http://localhost:80/api/health'); if (!resp.ok) throw new Error('Health check failed');"

# Run the Deno application with necessary permissions
CMD ["deno", "run", "--allow-all", "src/index.ts"]
