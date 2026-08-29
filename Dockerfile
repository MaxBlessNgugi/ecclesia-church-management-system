# =============================================================================
# Ecclesia CMS — Multi-stage Dockerfile
# =============================================================================
# Stage 1: deps       — install root + backend dependencies
# Stage 2: build      — compile frontend (Vite) + backend (tsc)
# Stage 3: runtime    — minimal image with compiled output + postgresql-client
#
# Build:  docker compose build  (or docker build -t ecclesia .)
# Run:    docker compose up -d
# =============================================================================

# ── Stage 1: Dependencies ──────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

# Install dependencies separately for layer caching
COPY package.json package-lock.json ./
COPY backend/package.json backend/package-lock.json backend/

# Install root deps (Vite, React, etc.) — omit devDependencies for smaller image
RUN npm ci --omit=dev

# Install backend deps (Express, Prisma, etc.) — include devDependencies for tsc
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

# Generate Prisma client (needed for backend tsc to resolve @prisma/client)
RUN npx prisma generate --schema=backend/prisma/schema.prisma

# Build frontend (Vite → dist/)
RUN npm run build

# Build backend (tsc → backend/dist/)
RUN npm run backend:build

# ── Stage 3: Runtime ──────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install postgresql-client for pg_dump backups + curl for health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r ecclesia && useradd -r -g ecclesia -d /app -s /bin/sh ecclesia

WORKDIR /app

# Copy production dependencies only
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copy compiled output
COPY --from=build /app/dist ./dist
COPY --from=build /app/backend/dist ./backend/dist

# Copy Prisma schema + migrations (needed for migrate deploy at startup)
COPY backend/prisma ./backend/prisma

# Copy generated Prisma client from build stage (it's in devDependencies)
COPY --from=build /app/backend/node_modules/.prisma ./backend/node_modules/.prisma
COPY --from=build /app/backend/node_modules/@prisma ./backend/node_modules/@prisma

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create backup directory
RUN mkdir -p /app/backups && chown -R ecclesia:ecclesia /app

# Switch to non-root user
USER ecclesia

# Environment defaults
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check — hits the existing /api/health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
