# =============================================================================
# Ecclesia CMS — Multi-stage Dockerfile
# =============================================================================
# Stage 1: deps       — install root + backend dependencies
# Stage 2: build      — compile frontend (Vite) + backend (tsc) + prisma generate
# Stage 3: runtime    — compiled output only, postgresql-client, non-root user
#
# Build:  docker compose build  (or docker build -t ecclesia .)
# Run:    docker compose up -d
# =============================================================================

# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Copy lockfiles first for layer caching (changes rarely)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json backend/

# Root: production only (Vite, React, socket.io-client — build-time only)
RUN npm ci --omit=dev

# Backend: all deps including devDependencies (tsc, vitest, tsx needed for build)
RUN npm ci --prefix backend

# ── Stage 2: Build ─────────────────────────────────────────────────────────
FROM node:20-slim AS build

WORKDIR /app

# Copy installed dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy source files needed for build
COPY package.json vite.config.ts tsconfig.json index.html ./
COPY src/ src/
COPY public/ public/
COPY backend/package.json backend/tsconfig.json backend/
COPY backend/src/ backend/src/
COPY backend/prisma/ backend/prisma/

# Generate Prisma Client (produces .prisma/client/ in backend/node_modules/)
# Required for: (1) backend tsc to resolve @prisma/client types
#               (2) runtime to execute Prisma queries
RUN npx prisma generate --schema=backend/prisma/schema.prisma

# Build frontend (Vite → repo-root dist/)
RUN npm run build

# Build backend (tsc → backend/dist/)
RUN npm run backend:build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install postgresql-client (pg_dump for backups) + curl (healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r ecclesia && useradd -r -g ecclesia -d /app -s /bin/sh ecclesia

WORKDIR /app

# ── Dependencies ─────────────────────────────────────────────────────────
# Root: production only (not strictly needed at runtime, but keeps layer simple)
COPY --from=deps /app/node_modules ./node_modules

# Backend: from BUILD stage (includes @prisma/client + generated .prisma/client/
# + prisma CLI + all runtime deps). Stage 1's backend/node_modules lacks the
# generated Prisma Client, so we must use stage 2's copy.
COPY --from=build /app/backend/node_modules ./backend/node_modules

# ── Compiled output ──────────────────────────────────────────────────────
# Frontend: repo-root dist/ (backend resolves ../../dist from backend/dist/)
COPY --from=build /app/dist ./dist

# Backend: backend/dist/index.js
COPY --from=build /app/backend/dist ./backend/dist

# ── Prisma schema + migrations ───────────────────────────────────────────
# Needed by entrypoint: `npx prisma migrate deploy --schema=backend/prisma/schema.prisma`
COPY backend/prisma/ backend/prisma/

# ── Entrypoint ───────────────────────────────────────────────────────────
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# ── Final setup ──────────────────────────────────────────────────────────
RUN mkdir -p /app/backups && chown -R ecclesia:ecclesia /app

USER ecclesia

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check: verify the app is serving and the database is reachable
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
