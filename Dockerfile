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

# ─── Stage 2: Build Hono backend ───────────────────────
FROM node:24-alpine AS backend-builder

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app/capsule-agents-backend

COPY --chown=app:app capsule-agents-backend/package.json ./
COPY --chown=app:app capsule-agents-backend/package-lock.json ./
RUN npm install --force

COPY --chown=app:app capsule-agents-backend/ ./
# Rebuild native modules for Alpine Linux
RUN npm rebuild better-sqlite3
# The tsconfig.json specifies that the output is in the dist directory
RUN npm run build

# ─── Stage 3: Final image (merge UI + API) ────────────────────────
FROM node:24-alpine AS runtime

RUN addgroup -S app && adduser -S app -G app
USER app

WORKDIR /home/app

# Copy built backend
COPY --from=backend-builder /home/app/capsule-agents-backend/dist ./dist
COPY --from=backend-builder /home/app/capsule-agents-backend/node_modules ./node_modules

# Create static directory for the Vite-built assets
RUN mkdir -p ./static

# Add agent-workspace directory in user home
RUN mkdir -p ./agent-workspace

# Copy Vite's dist/ into static for Hono to serve
COPY --from=frontend-builder /home/app/capsule-agents-frontend/dist/ ./static/

EXPOSE 80

# Use node to run the Hono server
ENTRYPOINT ["node", "dist/index.js"]
