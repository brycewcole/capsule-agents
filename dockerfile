# ─── Stage 1: Build Vite + React frontend ─────────────────────────────
FROM node:24-alpine AS frontend-builder

# 1) create a non-root user for consistent file ownership
RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app/frontend

# 2) copy only package manifests and install deps
COPY --chown=app:app frontend/package.json frontend/package-lock.json ./
RUN npm ci

# 3) copy the rest of your source and build
COPY --chown=app:app frontend/ ./
RUN npm run build

# ─── Stage 2: Prepare Python/uv environment ───────────────────────
FROM ghcr.io/astral-sh/uv:bookworm-slim AS uv-base

# Install Rust for Python package dependencies
RUN apt-get update && apt-get install -y rustc cargo && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1) copy toml and lock, sync dependencies
COPY backend/pyproject.toml backend/uv.lock* ./
RUN uv sync --locked

# 2) copy your backend code
COPY backend/ ./backend

# ─── Stage 3: Final image (merge UI + API) ────────────────────────
FROM uv-base AS runtime
ENV PYTHONPATH=/app

# Install Node.js runtime for serving Vite static build
RUN apt-get update && apt-get install -y curl ca-certificates \ 
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \ 
    && apt-get install -y nodejs && rm -rf /var/lib/apt/lists/*

# Copy Vite static build to serve from FastAPI
WORKDIR /app
COPY --from=frontend-builder /home/app/frontend/dist ./static

EXPOSE 8000

RUN uv add fastapi-cli && uv sync --locked

# Update to JSON array format for proper signal handling
CMD ["uv", "run", "fastapi", "run", "--reload", "backend/app/main.py", "--host", "0.0.0.0", "--port", "8000"]