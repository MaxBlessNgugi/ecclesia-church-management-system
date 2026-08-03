#!/usr/bin/env bash
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

echo "→ Creating / updating local SQLite database..."
npx prisma db push

echo "→ Seeding Super Admin (Max Bless Ngugi)..."
npm run db:seed

echo ""
echo "→ Starting API on http://localhost:5000"
echo "  Login: maxblessngugi@ecclesia.local / ChangeMeImmediately123!"
echo ""
npm run dev
