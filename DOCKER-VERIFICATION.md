# ECCLESIA — Level 2 Docker Verification Checklist

Execute every section in order. Each step has an exact command and an expected
result. Mark pass/fail in the scorecard at the end. **All critical checks must
pass before any parish pilot.**

---

## A. Pre-Flight

| # | Check | Command / Action | Expected Result | ✓ |
|---|-------|-----------------|-----------------|---|
| A1 | Hardware: 4 GB RAM, 10 GB disk free | OS system info | Meets minimums | ☐ |
| A2 | Docker installed | `docker --version` | Docker version ≥ 20.x | ☐ |
| A3 | Docker Compose available | `docker compose version` | Docker Compose ≥ 2.x | ☐ |
| A4 | Docker daemon running | `docker info` | Outputs container info (no error) | ☐ |
| A5 | Port 5000 free | `netstat -an \| grep :5000` (Windows) or `ss -tlnp \| grep :5000` (Linux) | No output (port free) | ☐ |
| A6 | `.env` exists with secrets | `cat .env \| grep -E "POSTGRES_PASSWORD\|JWT_SECRET"` | Both show strong non-default values | ☐ |
| A7 | No host Node.js needed | `node --version` may not be installed — that's fine | Docker handles everything | ☐ |
| A8 | No host PostgreSQL needed | `psql --version` may not be installed — that's fine | Docker handles everything | ☐ |

**If any pre-flight fails, stop and fix before proceeding.**

---

## B. Fresh Install Test (Clean Slate)

### B1. Clean any previous state

```bash
# Remove old containers, networks (NOT volumes — we want clean slate)
docker compose down

# Remove the named volume explicitly for a true fresh install
docker volume rm ecclesia-church-management-system_ecclesia-pgdata 2>/dev/null || true
```

### B2. Build and start

```bash
docker compose up -d --build
```

**Expected:** Build takes 3–5 minutes on first run. No errors in build output.

### B3. Confirm both containers are healthy

```bash
docker compose ps
```

**Expected output (similar to):**

```
NAME                          STATUS                  PORTS
ecclesia-church-management-system-db-1    Up (healthy)    5432/tcp
ecclesia-church-management-system-app-1   Up (healthy)    0.0.0.0:5000->5000/tcp
```

Both must show `Up` and `healthy` (app may take 60s to pass healthcheck).

### B4. Confirm startup sequence completed

```bash
docker compose logs app 2>&1 | head -30
```

**Expected:** Lines showing:
```
⏳ Waiting for PostgreSQL...
✅ PostgreSQL is ready.
📦 Running database migrations...
✅ Migrations applied.
🌱 Running seed (idempotent — skips existing data)...
✅ Seed completed.
🚀 Starting Ecclesia server...
Ecclesia Server running on http://0.0.0.0:5000
```

### B5. Read the admin password

```bash
docker compose logs app 2>&1 | grep -A 10 "SEED ACCOUNTS"
```

**Expected:** Shows generated password for `maxblessngugi@ecclesia.local`.
**Record this password — it is shown only once.**

### B6. Health check endpoint

```bash
curl http://localhost:5000/api/health
```

**Expected:** `{"status":"ok","db":"connected",...}`

### B7. Browser: UI loads

Open `http://localhost:5000` in a browser.

**Expected:** Login page renders (ECCLESIA branding, email/password fields).

### B8. Login with seed credentials

1. Enter `maxblessngugi@ecclesia.local` and the password from B5
2. Click Login

**Expected:** Forced to "Change Password" screen (mustChangePassword is true).

### B9. Change password

1. Enter a new password (twice)
2. Submit

**Expected:** Redirected to Parish Setup Wizard (first-run flow).

### B10. Complete Parish Setup Wizard

1. Fill in: Parish Name, Diocese, Local Church, County, etc.
2. Click Save/Finish

**Expected:** Redirected to the Dashboard. App is fully operational.

### B11. Verify real-time (Socket.IO)

1. Open a second browser tab to `http://localhost:5000`
2. In the first tab, navigate to Christian Registry
3. In the second tab, check if the view updates

**Expected:** Both tabs show the same data (real-time sync via Socket.IO).

---

## C. Persistence Test

### C1. Create an identifiable record

1. Navigate to **Finance → Make Deposit**
2. Fill in: Date=today, Amount=12345, Bank="Test Bank", Account="12345", Source="Verification Test", Deposited By="QA"
3. Click Save

**Expected:** Deposit appears in the Recent Deposits table with amount $12,345.00.

### C2. Restart the stack (data must survive)

```bash
docker compose restart
```

Wait 30 seconds for containers to come back up.

### C3. Confirm data persisted

1. Open `http://localhost:5000`
2. Log in
3. Navigate to Finance → Make Deposit

**Expected:** The $12,345.00 deposit from Test Bank is still in the table.

### C4. Down + Up test (volume must survive)

```bash
docker compose down
docker compose up -d
```

Wait 30 seconds. Log in. Check Finance → Make Deposit.

**Expected:** Deposit still present.

### C5. ⚠️ DANGER: Command that WOULD destroy data

```bash
# DO NOT RUN THIS — it deletes all parish data:
# docker compose down -v
```

**Operator note:** `docker compose down` is safe. Only `docker compose down -v`
removes the database volume. Never use `-v` unless you intentionally want to
destroy all data and start fresh.

---

## D. Config / Security Checks

### D1. App fails if JWT_SECRET is missing

1. Stop the stack: `docker compose down`
2. Edit `.env`: set `JWT_SECRET=` (empty)
3. `docker compose up -d`
4. Check logs: `docker compose logs app 2>&1 | tail -20`

**Expected:** App crashes or refuses to start with a clear error about JWT_SECRET.

5. **Restore:** Set `JWT_SECRET` back to a strong value in `.env`
6. `docker compose down && docker compose up -d`

### D2. DATABASE_URL uses `db` hostname, not `localhost`

```bash
docker compose exec app env | grep DATABASE_URL
```

**Expected:** Output contains `@db:5432/`, NOT `@localhost:5432/`.

### D3. Secrets not in image layers

```bash
docker history ecclesia-church-management-system-app --no-trunc 2>/dev/null | grep -i "password\|secret" || echo "No secrets found in image history"
```

**Expected:** `No secrets found in image history`.

### D4. App runs as non-root

```bash
docker compose exec app id
```

**Expected:** `uid=1001(ecclesia) gid=1001(ecclesia)` (not root).

### D5. DB port not exposed to host

```bash
docker compose exec app sh -c "pg_isready -h db -p 5432 -q && echo 'DB reachable from app'"
# On host — port 5432 should NOT be listening:
netstat -an | grep :5432 || ss -tlnp | grep :5432 || echo "Port 5432 not exposed on host"
```

**Expected:** DB reachable from app container; port 5432 NOT listening on host.

---

## E. Network Checks

### E1. Access from localhost

```bash
curl -s http://localhost:5000/api/health | head -1
```

**Expected:** `{"status":"ok",...}`

### E2. Access from LAN (if test device available)

From another computer on the same network:

```bash
# Find server IP first:
# Windows: ipconfig → IPv4 Address
# Linux: hostname -I

curl -s http://192.168.x.x:5000/api/health
```

**Expected:** `{"status":"ok",...}`

If blocked: check Windows Firewall allows inbound on port 5000.

### E3. ecclesia.local (if configured)

```bash
ping ecclesia.local
curl -s http://ecclesia.local:5000/api/health
```

**Expected:** Ping resolves; health check returns ok.

### E4. Socket.IO / live updates (multi-tab)

1. Open `http://localhost:5000` in Tab A and Tab B
2. In Tab A: Christian Registry → Add New Christian → fill required fields → Save
3. In Tab B: Refresh or navigate to Christian Registry

**Expected:** The new Christian appears in Tab B without manual refresh
(real-time Socket.IO update).

---

## F. Backup Path

### F1. Execute documented backup

**Windows (PowerShell):**
```powershell
docker compose exec db pg_dump -U ecclesia ecclesia > ecclesia-verify-backup.sql
```

**Linux / macOS:**
```bash
docker compose exec db pg_dump -U ecclesia ecclesia > ecclesia-verify-backup.sql
```

### F2. Confirm backup artifact exists

```bash
ls -la ecclesia-verify-backup.sql
```

**Expected:** File exists, size > 0 KB.

### F3. Inspect backup contents

```bash
head -20 ecclesia-verify-backup.sql
```

**Expected:** SQL header with `-- PostgreSQL database dump` comment, table definitions.

### F4. Clean up test backup

```bash
rm ecclesia-verify-backup.sql
```

---

## G. Failure Injection

### G1. Stop DB, observe app, recover

```bash
# Stop only the database
docker compose stop db

# Check app logs — expect DB connection errors
docker compose logs app --since 10s 2>&1 | tail -10
```

**Expected:** App logs show connection errors or health check failures.

```bash
# Restart the database
docker compose start db

# Wait 15 seconds, then check
sleep 15
curl -s http://localhost:5000/api/health
```

**Expected:** Health check returns `{"status":"ok","db":"connected"}`.
App recovers automatically.

### G2. Invalid DB password

1. `docker compose down`
2. Edit `.env`: change `POSTGRES_PASSWORD` to `wrongpassword`
3. `docker compose up -d`
4. `docker compose logs app 2>&1 | tail -10`

**Expected:** Clear error about authentication failure. App retries or exits.

5. **Restore:** Set correct `POSTGRES_PASSWORD` in `.env`
6. `docker compose down && docker compose up -d`

---

## H. Update Drill

### H1. Simulate an update (rebuild app container)

```bash
# Record current data state
docker compose exec db psql -U ecclesia ecclesia -c "SELECT COUNT(*) FROM christians;" 2>/dev/null || echo "Table may not exist yet — that's ok"

# Rebuild just the app container
docker compose up -d --build app

# Wait for health check
sleep 30

# Verify app is healthy
docker compose ps
curl -s http://localhost:5000/api/health
```

**Expected:** App rebuilds, restarts, passes health check.

### H2. Confirm data survived rebuild

1. Log in to `http://localhost:5000`
2. Check Finance → Make Deposit (or any module with data)

**Expected:** All records from previous tests are still present.

---

## I. Pass/Fail Scorecard

| ID | Check | Pass | Fail | Notes |
|----|-------|------|------|-------|
| A1 | Hardware meets minimums | ☐ | ☐ | |
| A2 | Docker ≥ 20.x | ☐ | ☐ | |
| A3 | Docker Compose ≥ 2.x | ☐ | ☐ | |
| A4 | Docker daemon running | ☐ | ☐ | |
| A5 | Port 5000 free | ☐ | ☐ | |
| A6 | .env has strong secrets | ☐ | ☐ | |
| B2 | Build completes without error | ☐ | ☐ | |
| B3 | Both containers healthy | ☐ | ☐ | |
| B4 | Startup sequence logged correctly | ☐ | ☐ | |
| B5 | Admin password readable from logs | ☐ | ☐ | |
| B6 | /api/health returns ok | ☐ | ☐ | |
| B7 | UI loads in browser | ☐ | ☐ | |
| B8 | Login works | ☐ | ☐ | |
| B9 | Password change works | ☐ | ☐ | |
| B10 | Parish Setup Wizard completes | ☐ | ☐ | |
| C1 | Record created in UI | ☐ | ☐ | |
| C3 | Data survives `restart` | ☐ | ☐ | |
| C4 | Data survives `down` + `up` | ☐ | ☐ | |
| D2 | DATABASE_URL uses `db` hostname | ☐ | ☐ | |
| D3 | No secrets in image layers | ☐ | ☐ | |
| D4 | App runs as non-root | ☐ | ☐ | |
| D5 | DB port not exposed on host | ☐ | ☐ | |
| E1 | localhost access works | ☐ | ☐ | |
| E2 | LAN access works (if tested) | ☐ | ☐ | |
| E4 | Socket.IO live updates work | ☐ | ☐ | |
| F2 | Backup file created successfully | ☐ | ☐ | |
| G1 | App recovers after DB restart | ☐ | ☐ | |
| G2 | Invalid DB password shows clear error | ☐ | ☐ | |
| H2 | Data survives app rebuild | ☐ | ☐ | |

### GO / NO-GO Criteria

**GO for parish pilot:** All of these must pass:

- [ ] B3: Both containers healthy
- [ ] B6: Health check returns ok
- [ ] B7: UI loads in browser
- [ ] B8: Login works
- [ ] B10: Parish Setup Wizard completes
- [ ] C3: Data survives restart
- [ ] D2: DATABASE_URL correct
- [ ] D4: Non-root user
- [ ] E1: localhost access
- [ ] G1: App recovers after DB restart

**NO-GO if any critical check fails.** Debug, fix, and re-run the failed section.

---

## J. Rollback

### J1. Stop the stack cleanly

```bash
docker compose down
```

**This does NOT delete data.** Containers stop; the database volume persists.

### J2. Preserve the volume

```bash
docker volume ls | grep ecclesia
```

The volume `ecclesia-church-management-system_ecclesia-pgdata` holds all data.
It survives `docker compose down`. Only `docker compose down -v` removes it.

### J3. Fall back to native Node + PostgreSQL

If Docker doesn't work on the parish machine:

1. Stop Docker: `docker compose down`
2. Install Node.js 18+ from https://nodejs.org
3. Install PostgreSQL 14+ from https://postgresql.org
4. Follow [INSTALL.md](INSTALL.md) native setup path
5. Restore data from backup if needed:
   ```bash
   psql -U postgres ecclesia < ecclesia-backup.sql
   ```

The native path and Docker path use the same PostgreSQL database — backups are
interchangeable.

---

## Appendix: Quick Reference Commands

```bash
# Start
docker compose up -d --build

# Stop (safe — preserves data)
docker compose down

# Restart
docker compose restart

# Logs
docker compose logs -f app
docker compose logs -f db

# Status
docker compose ps

# DB shell
docker compose exec db psql -U ecclesia

# Backup
docker compose exec db pg_dump -U ecclesia ecclesia > backup.sql

# Restore
docker compose stop app
cat backup.sql | docker compose exec -T db psql -U ecclesia ecclesia
docker compose start app

# Full rebuild (data survives)
docker compose up -d --build

# ⚠️ DESTRUCTIVE — destroys all data
# docker compose down -v
```

---

*Ecclesia Church Management System — Level 2 Docker Verification*
