# ─── Stage 1: Build Next.js frontend ─────────────────────────────
FROM node:24-alpine AS frontend-builder

# 1) create a non-root user for consistent file ownership
RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app/frontend

# 2) copy only package manifests and install deps
COPY --chown=app:app frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

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

# Create static directory for the Next.js frontend
RUN mkdir -p ./static

# Copy Next.js static export to the static directory for the /editor endpoint
COPY --from=frontend-builder /home/app/frontend/out/ ./static/

EXPOSE 3000

RUN uv add fastapi-cli && uv sync --locked

# use uv to invoke the FastAPI plugin
ENTRYPOINT ["uv", "run", "fastapi", "run", \
    "--reload", "backend/app/main.py", \
    "--host", "0.0.0.0", "--port", "80"]