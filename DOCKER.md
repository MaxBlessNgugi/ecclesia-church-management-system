# ECCLESIA — Docker Deployment Guide

This guide covers running ECCLESIA via Docker Compose (Level 2 installation).
Both PostgreSQL and the Ecclesia app run inside containers — no host Node.js or
PostgreSQL required for day-to-day operation.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Docker Desktop** | Windows 10/11 or macOS — [download](https://docs.docker.com/desktop/install/windows-install/) |
| **Docker Engine + Compose** | Linux — [install guide](https://docs.docker.com/engine/install/) |
| **4 GB RAM** minimum | PostgreSQL + Node.js run together |
| **10 GB disk** | Containers + database volume |

> **Windows users:** Install Docker Desktop with WSL 2 backend enabled (default
> during install). The commands below work in PowerShell, Command Prompt, or Git Bash.

---

## First-Time Setup

### 1. Clone or download the project

```bash
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system
```

Or download the ZIP from GitHub and extract it.

### 2. Create your environment file

```bash
cp .env.example.docker .env
```

Open `.env` in a text editor and set **two required values**:

```ini
# Replace with a strong random password
POSTGRES_PASSWORD=your-strong-database-password

# Replace with a random secret (96+ characters)
# Generate one: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=your-random-jwt-secret-here
```

> ⚠️ **Never use default or weak secrets in production.** The app will refuse
> to start if `JWT_SECRET` is missing or still the dev default.

### 3. Build and start

```bash
docker compose up -d --build
```

This will:
1. Pull the PostgreSQL 16 image
2. Build the Ecclesia app image (multi-stage: install → compile → runtime)
3. Start PostgreSQL, wait for it to be healthy
4. Run database migrations
5. Seed initial admin accounts
6. Start the Ecclesia server on port 5000

**First build takes 3–5 minutes.** Subsequent starts take ~15 seconds.

### 4. Get the admin password

After the first start, check the logs to find the generated admin password:

**Windows PowerShell / Linux / macOS:**
```bash
docker compose logs app | grep -A 5 "SEED ACCOUNTS"
```

Or view the full startup log:
```bash
docker compose logs app
```

You'll see output like:
```
═══════════════════════════════════════════════════════════════
  SEED ACCOUNTS CREATED
═══════════════════════════════════════════════════════════════
  super_admin: maxblessngugi@ecclesia.local
  Password (random, shown once): AbC123!@#xYz789
  → SHOWN ONLY ONCE. All accounts require a password change at first login.
═══════════════════════════════════════════════════════════════
```

### 5. Open the app

Open your browser and go to:

```
http://localhost:5000
```

On first login you'll be guided through the **Parish Setup Wizard** — a
one-time configuration of your parish name, logo, and identity.

---

## Accessing from Other Computers (LAN)

If the server is on a parish PC and staff access it from other computers:

1. Find the server's LAN IP address:
   - **Windows:** `ipconfig` → look for "IPv4 Address" (e.g., `192.168.1.100`)
   - **Linux:** `ip addr` or `hostname -I`
   - **macOS:** System Preferences → Network

2. Open the app on any client computer:
   ```
   http://192.168.1.100:5000
   ```

3. (Optional) Update `.env` to allow CORS from the LAN IP:
   ```ini
   CLIENT_URL=http://192.168.1.100:5000
   CORS_ORIGINS=http://localhost:5000,http://192.168.1.100:5000
   ```
   Then restart: `docker compose up -d`

---

## Day-to-Day Commands

| Action | Command |
|--------|---------|
| **Start** | `docker compose up -d` |
| **Stop** | `docker compose down` |
| **Restart** | `docker compose restart` |
| **View logs** | `docker compose logs -f app` |
| **View DB logs** | `docker compose logs -f db` |
| **Check status** | `docker compose ps` |
| **Open DB shell** | `docker compose exec db psql -U ecclesia` |

---

## Updating

When a new version is released:

```bash
git pull
docker compose up -d --build
```

The database data persists in the Docker volume — migrations run automatically
on startup. Your parish data is safe.

---

## Backup & Restore

### Backup (from the running container)

```bash
# Create a backup
docker compose exec db pg_dump -U ecclesia ecclesia > ecclesia-backup-$(date +%Y%m%d).sql

# Or save to the mounted backups directory
docker compose exec db pg_dump -U ecclesia ecclesia > ./backups/ecclesia-backup-$(date +%Y%m%d).sql
```

### Restore

```bash
# Stop the app first
docker compose stop app

# Restore from backup
cat ecclesia-backup-20260101.sql | docker compose exec -T db psql -U ecclesia ecclesia

# Restart
docker compose start app
```

### Backup the entire database volume

```bash
# Stop everything
docker compose down

# Backup the volume
docker run --rm -v ecclesia-church-management-system_ecclesia-pgdata:/data -v $(pwd):/backup alpine \
  tar czf /backup/pgdata-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restart
docker compose up -d
```

> ⚠️ **`docker compose down` does NOT delete volumes.** Your data survives
> restarts. Only `docker compose down -v` removes volumes — never use `-v`
> unless you intentionally want to destroy the database.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Password authentication failed"** | Check `POSTGRES_PASSWORD` in `.env` matches what you set |
| **"JWT_SECRET not set"** | Set `JWT_SECRET` in `.env` (see generate command above) |
| **"Port 5000 already in use"** | Change `APP_PORT=5001` in `.env`, or stop the other process |
| **"Cannot connect from another PC"** | Check Windows Firewall allows port 5000; use the server's LAN IP |
| **App starts but DB not ready** | Wait 30 seconds; the entrypoint retries automatically |
| **"relation does not exist"** | Migrations failed — check `docker compose logs app` for errors |
| **First build is slow** | Normal — Node modules install + Prisma generate + Vite build |
| **Container keeps restarting** | Check logs: `docker compose logs app` — usually a config issue |
| **Need to reset everything** | `docker compose down -v` (destroys DB data!) then `docker compose up -d --build` |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Host Machine (Parish PC)                   │
│                                             │
│  ┌─────────────────┐  ┌──────────────────┐ │
│  │  PostgreSQL 16   │  │  Ecclesia App    │ │
│  │  (container)     │  │  (container)     │ │
│  │  Port: internal  │  │  Port: 5000 →    │ │
│  │  only (5432)     │  │  host 5000       │ │
│  └────────┬─────────┘  └────────┬─────────┘ │
│           │  Docker network     │           │
│           └─────────────────────┘           │
│                                             │
│  Browsers: http://localhost:5000            │
│  LAN:      http://192.168.x.x:5000         │
└─────────────────────────────────────────────┘
```

**Data flow:**
- Browser → port 5000 → Express (API + static frontend)
- Express → Docker network → PostgreSQL (port 5432 internal)
- Socket.IO: same port 5000 (WebSocket upgrade)

---

*Ecclesia Church Management System — Docker Level 2*
