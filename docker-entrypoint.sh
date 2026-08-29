#!/bin/sh
# =============================================================================
# Ecclesia CMS — Docker Entrypoint
# =============================================================================
# 1. Wait for PostgreSQL to accept connections
# 2. Run Prisma migrations (non-destructive, idempotent)
# 3. Seed initial data (idempotent — never overwrites existing users)
# 4. Start the Node.js server
# =============================================================================
set -e

# ── Configuration ──────────────────────────────────────────────────────────
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
MAX_RETRIES=30
RETRY_INTERVAL=2

# ── Step 1: Wait for PostgreSQL ────────────────────────────────────────────
echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

retries=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$MAX_RETRIES" ]; then
    echo "❌ PostgreSQL did not become ready after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  ↳ PostgreSQL not ready (attempt ${retries}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done

echo "✅ PostgreSQL is ready."

# ── Step 2: Run Prisma Migrations ─────────────────────────────────────────
echo "📦 Applying database migrations..."
npx prisma migrate deploy --schema=backend/prisma/schema.prisma
echo "✅ Migrations applied."

# ── Step 3: Seed (idempotent) ─────────────────────────────────────────────
echo "🌱 Seeding initial data (idempotent — skips existing users)..."
npx tsx backend/prisma/seed.ts
echo "✅ Seed completed."

# ── Step 4: Start Server ──────────────────────────────────────────────────
echo "🚀 Starting Ecclesia server..."
exec "$@"
