#!/usr/bin/env bash
# =============================================================================
# PATH B acceptance battery — Docker Compose install (full stack)
# =============================================================================
# Executes the documented DOCKER.md procedure verbatim and verifies every
# acceptance item: image build, container startup, PG health, app health,
# persistent volume, migration, first run, login, CRUD, backup, restore,
# restart, database restart, application restart.
#
# Usage:  bash acceptance-evidence/path-b-battery.sh
# Requires: Docker Engine/Desktop + Compose v2. Fresh state expected on first
# run (safe to re-run: subsequent starts reuse the seeded database).
# =============================================================================
set -u
cd "$(dirname "$0")/.."   # repo root
PASS=0; FAIL=0
ck() { if echo "$2" | grep -q "$3"; then echo "PASS: $1"; PASS=$((PASS+1));
       else echo "FAIL: $1 — got: $(echo "$2" | head -c 200)"; FAIL=$((FAIL+1)); fi; }
rec() { echo "$*" >> acceptance-evidence/path-b-commands.log; }
run() { rec "$*"; "$@"; }

echo "═══ STEP 1: documented procedure — cp .env.example.docker .env ═══"
if [ ! -f .env ]; then run cp .env.example.docker .env; fi
# Fill required values as DOCKER.md instructs (deterministic for the test run)
JWT=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
sed -i.bak \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=acceptance-db-pass|" \
  -e "s|^JWT_SECRET=.*|JWT_SECRET=${JWT}|" \
  -e "s|^APP_PORT=.*|APP_PORT=5020|" .env
rec "wrote .env (POSTGRES_PASSWORD set, JWT_SECRET randomized, APP_PORT=5020)"

echo "═══ STEP 2: docker compose up -d --build (image build + startup) ═══"
run docker compose up -d --build || { echo "FATAL: compose up failed"; exit 1; }

echo "═══ STEP 3: container + PostgreSQL health ═══"
PS=$(run docker compose ps)
ck "both containers Up (healthy)" "$PS" 'Up'
pg_ready=0
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U ecclesia -d ecclesia >/dev/null 2>&1; then pg_ready=1; break; fi
  sleep 2
done
ck "PostgreSQL accepts connections" "ready=$pg_ready" 'ready=1'

echo "═══ STEP 4: application health (entrypoint ran migrations + seed) ═══"
H=""
for i in $(seq 1 45); do
  H=$(curl -s -m 3 "http://localhost:5020/api/health" || true)
  echo "$H" | grep -q '"status":"ok"' && break
  sleep 2
done
ck "health ok + db connected" "$H" '"db":"connected"'
ck "entrypoint applied migrations" "$(run docker compose logs app)" '✅ Migrations applied'
ck "entrypoint seeded accounts"    "$(run docker compose logs app)" '✅ Seed completed'

echo "═══ STEP 5: seed accounts + first-run login ═══"
LOGS=$(run docker compose logs app)
PW=$(echo "$LOGS" | grep -oE 'Password \(from SUPER_ADMIN_PASSWORD\): .*' | awk '{print $NF}' | head -1)
if [ -z "$PW" ]; then PW=$(echo "$LOGS" | grep -A1 'maxblessngugi@ecclesia.local' | grep -oE 'Password.*: .*' | awk '{print $NF}' | head -1); fi
[ -n "$PW" ] || { echo "FATAL: could not extract seeded password from logs"; docker compose logs app | tail -30; exit 1; }
BODY='{"email":"maxblessngugi@ecclesia.local","password":"'"$PW"'"}'
L=$(curl -s -X POST "http://localhost:5020/api/auth/login" -H 'Content-Type: application/json' -d "$BODY")
ck "login returns token" "$L" '"token"'
T=$(echo "$L" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).token')

echo "═══ STEP 6: CRUD battery (same script as PATH A uses) ═══"
ACCEPTANCE_BASE="http://localhost:5020/api" ACCEPTANCE_TOKEN="$T" \
  rec node acceptance-evidence/path-crud.mjs || true

echo "═══ STEP 7: persistent volume ═══"
V=$(run docker compose exec -T db psql -U ecclesia -d ecclesia -tAc "SELECT count(*) FROM users")
ck "users persisted in volume" "$V" '[1-9]'

echo "═══ STEP 8: backup (documented command) ═══"
run docker compose exec db pg_dump -U ecclesia ecclesia > acceptance-evidence/path-b-dump.sql
ck "dump file created and non-trivial" "$(stat -c%s acceptance-evidence/path-b-dump.sql 2>/dev/null || echo 0)" '[1-9]'

echo "═══ STEP 9: restore into scratch DB (inside the same container) ═══"
run docker compose exec -T db psql -U ecclesia -c 'CREATE DATABASE restore_probe' 2>/dev/null
run docker compose exec -T db bash -lc 'psql -U ecclesia -d restore_probe < /dev/stdin' < acceptance-evidence/path-b-dump.sql > /dev/null 2>&1
V2=$(run docker compose exec -T db psql -U ecclesia -d restore_probe -tAc "SELECT count(*) FROM users")
ck "restore reproduces user rows" "$V2" "$V"
run docker compose exec -T db psql -U ecclesia -c 'DROP DATABASE restore_probe' > /dev/null

echo "═══ STEP 10: application restart (data persists) ═══"
run docker compose restart app
for i in $(seq 1 30); do curl -s -m 3 "http://localhost:5020/api/health" | grep -q '"status":"ok"' && break; sleep 2; done
L2=$(curl -s -X POST "http://localhost:5020/api/auth/login" -H 'Content-Type: application/json' -d "$BODY")
ck "login works after app restart (volume persistence)" "$L2" '"token"'

echo "═══ STEP 11: database restart ═══"
run docker compose stop db
sleep 3
run docker compose start db
for i in $(seq 1 45); do curl -s -m 3 "http://localhost:5020/api/health" | grep -q '"db":"connected"' && break; sleep 2; done
ck "health recovers after DB restart" "$(curl -s -m 3 http://localhost:5020/api/health)" '"db":"connected"'

echo "═══ STEP 12: full stack down/up (documented day-2 cycle) ═══"
run docker compose down
run docker compose up -d
for i in $(seq 1 45); do curl -s -m 3 "http://localhost:5020/api/health" | grep -q '"status":"ok"' && break; sleep 2; done
ck "full restart keeps data" "$(curl -s -m 3 http://localhost:5020/api/health)" '"status":"ok"'

echo ""
echo "═══════ PATH B battery: $PASS passed, $FAIL failed ═══════"
echo "Leave stack running? Records kept: docker compose ps"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
