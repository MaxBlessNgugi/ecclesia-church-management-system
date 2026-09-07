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

> **Which port does the app use?** The app listens on **port 5000 inside the
> container**. `APP_PORT` in `.env` is the port mapped on the *host* — this is
> the port you type in the browser. `.env.example.docker` ships with
> `APP_PORT=80`, so the app is reached at a **bare URL with no `:port`
> suffix**: `http://localhost` on the server itself, `http://ecclesia.local`
> (or `http://<server-ip>`) from other devices. All examples below use that
> port-80 form; if you set `APP_PORT` to something else (e.g. `5000` when
> another service owns port 80), add `:<APP_PORT>` to every URL in this guide:
> `http://localhost:5000`, `http://192.168.1.20:5000`.
>
> **Real-time sync & origins:** leave `CLIENT_URL` and `CORS_ORIGINS` empty in
> `.env` (the shipped default). The app then accepts any browser that reached
> it, so live updates work at `http://ecclesia.local`, `http://localhost`, or
> an IP address alike. Only a locked-down deployment (e.g. HTTPS behind Caddy)
> should set them — see [docs/OPERATIONS.md](docs/OPERATIONS.md).

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
http://localhost        # APP_PORT=80 (default) — no :port needed
http://localhost:5000   # only if you set APP_PORT=5000 in .env
```

Log in, complete the one-time Parish Setup Wizard.

---

## LAN Access

Find the server's LAN IP (`ipconfig` on Windows, `hostname -I` on Linux),
then open it from any client browser — `http://192.168.1.20` when `APP_PORT=80`,
or `http://192.168.1.20:<APP_PORT>` otherwise.

To restrict CORS, edit `.env` and list exactly the origins clients use — with a
`:<APP_PORT>` suffix unless your `APP_PORT` is 80 (as shown):

```ini
CORS_ORIGINS=http://ecclesia.local,http://192.168.1.20
# With APP_PORT=5000 that would be:
# CORS_ORIGINS=http://ecclesia.local:5000,http://192.168.1.20:5000
```

Then `docker compose up -d`. Leaving `CORS_ORIGINS` empty keeps the
trusted-LAN default where every origin is accepted.

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

Run these checks before any parish pilot. Substitute `:<APP_PORT>` everywhere
below if your `APP_PORT` is not 80 (the shipped default):

| # | Check | Command | Expected |
|---|-------|---------|----------|
| 1 | Both containers healthy | `docker compose ps` | Both show `Up (healthy)` |
| 2 | Health check works | `curl http://localhost/api/health` | `{"status":"ok","db":"connected"}` |
| 3 | UI loads | Open `http://localhost` | Login page renders |
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
| Host port `APP_PORT` in use | Set a free port, e.g. `APP_PORT=5001`, in `.env`, then `docker compose up -d` |
| Can't connect from LAN | Check the firewall allows your `APP_PORT` on the host |
| DB auth failed | Verify `POSTGRES_PASSWORD` in `.env` |
| JWT error | Set a strong `JWT_SECRET` in `.env` |
| Container restarting | `docker compose logs app` — usually a config issue |
| Reset everything | `docker compose down -v && docker compose up -d --build` ⚠️ destroys data |

---

*Ecclesia Church Management System — Docker Level 2*
