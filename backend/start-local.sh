#!/usr/bin/env bash
# =============================================================================
# One-shot local bootstrap for the backend (macOS/Linux/Git-Bash).
#  1. Installs deps if missing            -> npm install
#  2. Creates backend/.env if missing     -> cp .env.example .env
#  3. Generates Prisma Client             -> npx prisma generate
#  4. Pushes schema to PostgreSQL         -> npx prisma db push
#  5. Seeds the super admin + singletons  -> npm run db:seed
#  6. Starts the API with tsx watch       -> npm run dev
# =============================================================================
set -e
cd "$(dirname "$0")"

echo "════════════════════════════════════════"
echo "  Ecclesia Backend — Local Setup"
echo "════════════════════════════════════════"

if [ ! -d node_modules ]; then
  echo "→ Installing dependencies..."
  npm install
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "→ Created .env from .env.example"
fi

echo "→ Generating Prisma Client..."
npx prisma generate

echo "→ Pushing schema to PostgreSQL..."
npx prisma db push

echo "→ Seeding Super Admin (Max Bless Ngugi)..."
npm run db:seed

echo ""
echo "→ Starting API on http://localhost:5000"
echo "  Login: maxblessngugi@ecclesia.local / ChangeMeImmediately123!"
echo ""
npm run dev
