# ECCLESIA — Docker Deployment Guide

Run the full stack (app + database) using Docker. No Node.js or PostgreSQL
installation required on the host — just Docker Desktop.

---

## Prerequisites

- **Docker Desktop** (Windows/macOS) or **Docker Engine + Compose** (Linux)
- 4 GB RAM, 10 GB disk

---

## First-Time Setup

### 1. Get the code

```bash
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system
```

### 2. Create your environment file

```bash
cp .env.example.docker .env
```

Open `.env` and set two required values:

```ini
POSTGRES_PASSWORD=your-strong-database-password
JWT_SECRET=your-random-jwt-secret-here   # generate: openssl rand -hex 48
```

### 3. Build and start

```bash
docker compose up -d --build
```

First build takes 3–5 minutes. Subsequent starts take ~15 seconds.

### 4. Get the admin password

```bash
docker compose logs app | grep -A 10 "SEED ACCOUNTS"
```

You'll see the generated password for `maxblessngugi@ecclesia.local`.
**Shown only once — record it.**

### 5. Open the app

```
http://localhost:5000
```

Log in, complete the one-time Parish Setup Wizard.

---

## LAN Access

Find the server's LAN IP (`ipconfig` on Windows, `hostname -I` on Linux),
then open `http://192.168.x.x:5000` from any client browser.

To restrict CORS, edit `.env`:
```ini
CORS_ORIGINS=http://localhost:5000,http://192.168.x.x:5000
```
Then `docker compose up -d`.

---

## Day-to-Day Commands

| Action | Command |
|--------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Restart | `docker compose restart` |
| Logs | `docker compose logs -f app` |
| Status | `docker compose ps` |
| DB shell | `docker compose exec db psql -U ecclesia` |
| Rebuild | `docker compose up -d --build` |

---

## Updating

```bash
git pull
docker compose up -d --build
```

Database data persists in the Docker volume. Migrations run automatically.

---

## Backup & Restore

**Backup:**
```bash
docker compose exec db pg_dump -U ecclesia ecclesia > backup-$(date +%Y%m%d).sql
```

**Restore:**
```bash
docker compose stop app
cat backup.sql | docker compose exec -T db psql -U ecclesia ecclesia
docker compose start app
```

⚠️ `docker compose down` does **NOT** delete data. Only `docker compose down -v`
removes the database volume — never use `-v` unless you want to destroy all data.

---

## Verification Checklist

Run these checks before any parish pilot:

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | Both containers healthy | `docker compose ps` | Both show `Up (healthy)` |
| 2 | Health check works | `curl localhost:5000/api/health` | `{"status":"ok","db":"connected"}` |
| 3 | UI loads | Open `http://localhost:5000` | Login page renders |
| 4 | Login works | Use seed credentials from logs | Forced password change |
| 5 | Wizard completes | Fill parish info, submit | Dashboard loads |
| 6 | Data persists | `docker compose restart` → check records | Data still present |
| 7 | DB hostname correct | `docker compose exec app env \| grep DATABASE_URL` | Contains `@db:5432` |
| 8 | Non-root process | `docker compose exec app id` | `uid=1001(ecclesia)` |
| 9 | Backup works | Run backup command above | File created, size > 0 |
| 10 | App recovers | `docker compose stop db` → wait → `start db` | Health check returns ok |

**GO for pilot:** Checks 1–6 and 8 must all pass.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Port 5000 in use | Set `APP_PORT=5001` in `.env` |
| Can't connect from LAN | Check firewall allows port 5000 |
| DB auth failed | Verify `POSTGRES_PASSWORD` in `.env` |
| JWT error | Set a strong `JWT_SECRET` in `.env` |
| Container restarting | `docker compose logs app` — usually a config issue |
| Reset everything | `docker compose down -v && docker compose up -d --build` ⚠️ destroys data |

---

*Ecclesia Church Management System — Docker Level 2*
