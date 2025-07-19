# ─── Stage 1: Build Vite frontend ────────────────────────────────
FROM node:24-alpine AS frontend-builder

# 1) create a non-root user for consistent file ownership
RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app/capsule-agents-frontend

# 2) copy only package manifests and install deps
COPY --chown=app:app capsule-agents-frontend/package.json ./
COPY --chown=app:app capsule-agents-frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# 3) copy the rest of your source and build with Vite
COPY --chown=app:app capsule-agents-frontend/ ./
RUN npm run build

# ─── Stage 2: Prepare Python/uv environment ───────────────────────
FROM ghcr.io/astral-sh/uv:bookworm-slim AS uv-base

# Install Rust for any Python packages that need it
RUN apt-get update && apt-get install -y rustc cargo && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) copy toml and lock, sync dependencies
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --locked

# 2) copy your backend code
COPY backend/ ./backend
COPY log_conf.yaml ./

# ─── Stage 3: Final image (merge UI + API) ────────────────────────
FROM uv-base AS runtime
ENV PYTHONPATH=/app
ENV STATIC_DIR=static

# Add Node.js and npm for npx support
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Create static directory for the Vite-built assets
RUN mkdir -p ./static

# Add agent-workspace directory at root
RUN mkdir /agent-workspace

# Copy Vite's dist/ into static for FastAPI to serve
COPY --from=frontend-builder /home/app/capsule-agents-frontend/dist/ ./static/

EXPOSE 80

# Use uv to invoke FastAPI; serving static at “/” via StaticFiles in your main.py
ENTRYPOINT ["uv", "run", "-m", "uvicorn", "backend.app.main:app", \
    "--host", "0.0.0.0", "--port", "80", "--log-config", "log_conf.yaml" ]
