#!/bin/sh
# =============================================================================
# Ecclesia CMS — Docker Entrypoint
# =============================================================================
# Runs on every container start. All operations are idempotent:
#   1. Wait for PostgreSQL to accept connections
#   2. Apply pending Prisma migrations (non-destructive)
#   3. Seed initial data (never overwrites existing users)
#   4. Exec the Node.js server
# =============================================================================
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
MAX_RETRIES="${DB_MAX_RETRIES:-30}"
RETRY_INTERVAL="${DB_RETRY_INTERVAL:-2}"

# ── 1. Wait for PostgreSQL ────────────────────────────────────────────────
echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
retries=0
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; do
  retries=$((retries + 1))
  if [ "$retries" -ge "$MAX_RETRIES" ]; then
    echo "❌ PostgreSQL not ready after ${MAX_RETRIES} attempts. Exiting."
    exit 1
  fi
  echo "  ↳ Not ready (attempt ${retries}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
  sleep "$RETRY_INTERVAL"
done
echo "✅ PostgreSQL is ready."

# ── 2. Apply Prisma migrations ───────────────────────────────────────────
# prisma migrate deploy: applies pending migrations in order, never drops
# columns, idempotent on already-applied migrations.
echo "📦 Running database migrations..."
npx prisma migrate deploy --schema=backend/prisma/schema.prisma
echo "✅ Migrations applied."

# ── 3. Seed initial data ─────────────────────────────────────────────────
# Seed is idempotent: checks for existing users before creating, uses upsert
# for singleton rows. Safe to run on every start. New users added in future
# releases are created automatically with random passwords logged to stdout.
echo "🌱 Running seed (idempotent — skips existing data)..."
npx tsx backend/prisma/seed.ts
echo "✅ Seed completed."

# ── 4. Start the server ──────────────────────────────────────────────────
# exec replaces this shell with the node process, ensuring proper signal
# handling (SIGTERM for graceful shutdown).
echo "🚀 Starting Ecclesia server..."
exec "$@"
