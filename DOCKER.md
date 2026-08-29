# ECCLESIA — Docker Deployment Guide

Run the full ECCLESIA stack (app + database) using Docker. No Node.js or
PostgreSQL installation required on the host — just Docker Desktop.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **Docker Desktop** | Windows 10/11 or macOS — [install guide](https://docs.docker.com/desktop/install/windows-install/) |
| **Docker Engine + Compose** | Linux — [install guide](https://docs.docker.com/engine/install/) |
| **4 GB RAM** | PostgreSQL + Node.js run together |
| **10 GB disk** | Containers + database volume |

> **Windows users:** Install Docker Desktop with WSL 2 backend (enabled by
> default). All commands below work in PowerShell, Command Prompt, or Git Bash.

---

## First-Time Setup

### 1. Get the code

```bash
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system
```

Or download the ZIP from GitHub and extract it.

### 2. Create your environment file

**Windows (PowerShell):**
```powershell
Copy-Item .env.example.docker .env
```

**Linux / macOS:**
```bash
cp .env.example.docker .env
```

Open `.env` in a text editor and set **two required values**:

```ini
# A strong database password (any random string)
POSTGRES_PASSWORD=your-strong-database-password

# A random secret for JWT tokens (96+ hex characters)
# Generate one with:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Or on Linux/macOS:
#   openssl rand -hex 48
JWT_SECRET=your-random-jwt-secret-here
```

> ⚠️ **Never use weak or default secrets in production.** The app will refuse
> to start if `JWT_SECRET` is missing or matches the development default.

### 3. Build and start

```bash
docker compose up -d --build
```

What happens:
1. Pulls PostgreSQL 16 image
2. Builds the Ecclesia image (3-stage build: install → compile → runtime)
3. Starts PostgreSQL, waits for it to be healthy
4. Runs database migrations (`prisma migrate deploy`)
5. Seeds initial admin accounts (idempotent — safe on restart)
6. Starts the Ecclesia server on port 5000

**First build takes 3–5 minutes.** Subsequent starts take ~15 seconds.

### 4. Get the admin password

After the first start, check the logs for the generated admin password:

**Windows (PowerShell):**
```powershell
docker compose logs app | Select-String "SEED ACCOUNTS" -Context 0,10
```

**Linux / macOS:**
```bash
docker compose logs app | grep -A 10 "SEED ACCOUNTS"
```

Or view the full startup log:
```bash
docker compose logs app
```

You'll see:
```
═══════════════════════════════════════════════════════════════
  SEED ACCOUNTS CREATED
═══════════════════════════════════════════════════════════════
  super_admin: maxblessngugi@ecclesia.local
  Password (random, shown once): AbC123xYz789!@#
  → SHOWN ONLY ONCE. All accounts require a password change at first login.
═══════════════════════════════════════════════════════════════
```

### 5. Open the app

```
http://localhost:5000
```

Log in with the admin credentials from step 4. On first login you'll be
guided through the **Parish Setup Wizard** — a one-time configuration of
your parish name, logo, and identity.

---

## Accessing from Other Computers (LAN)

If the server runs on a parish PC and staff access it from other computers:

1. **Find the server's LAN IP:**

   | OS | Command |
   |----|---------|
   | Windows | `ipconfig` → "IPv4 Address" (e.g., `192.168.1.100`) |
   | Linux | `hostname -I` or `ip addr` |
   | macOS | System Settings → Network |

2. **Open from any client computer:**
   ```
   http://192.168.1.100:5000
   ```

3. **(Optional) Restrict CORS to your LAN:**

   Edit `.env`:
   ```ini
   CLIENT_URL=http://192.168.1.100:5000
   CORS_ORIGINS=http://localhost:5000,http://192.168.1.100:5000
   ```

   Then restart:
   ```bash
   docker compose up -d
   ```

4. **(Optional) Set up `ecclesia.local` hostname:**

   See the hostname setup instructions in [INSTALL.md](INSTALL.md#setting-up-the-friendly-hostname-ecclesialocal).
   Works the same with Docker — just make sure port 5000 is accessible.

---

## Day-to-Day Commands

| Action | Command |
|--------|---------|
| **Start** | `docker compose up -d` |
| **Stop** | `docker compose down` |
| **Restart** | `docker compose restart` |
| **View app logs** | `docker compose logs -f app` |
| **View DB logs** | `docker compose logs -f db` |
| **Check status** | `docker compose ps` |
| **Open DB shell** | `docker compose exec db psql -U ecclesia` |
| **Rebuild after code changes** | `docker compose up -d --build` |

---

## Updating

When a new version is released:

```bash
git pull
docker compose up -d --build
```

What happens:
- New image is built with the latest code
- Container is replaced (old one is removed)
- **Database data persists** — the named volume is not affected
- Migrations run automatically on startup
- Seed runs automatically (creates any new users from the release)

Your parish data is safe. Only the application container is rebuilt.

---

## Backup & Restore

### Quick Backup (from the running container)

**Windows (PowerShell):**
```powershell
docker compose exec db pg_dump -U ecclesia ecclesia > ecclesia-backup-$(Get-Date -Format yyyyMMdd).sql
```

**Linux / macOS:**
```bash
docker compose exec db pg_dump -U ecclesia ecclesia > ecclesia-backup-$(date +%Y%m%d).sql
```

### Restore

```bash
# Stop the app (keeps the database running)
docker compose stop app

# Restore from backup
cat ecclesia-backup-20260101.sql | docker compose exec -T db psql -U ecclesia ecclesia

# Restart
docker compose start app
```

### Full Volume Backup

```bash
# Stop everything
docker compose down

# Backup the entire PostgreSQL data directory
docker run --rm \
  -v ecclesia-church-management-system_ecclesia-pgdata:/data \
  -v "$(pwd):/backup" \
  alpine \
  tar czf /backup/pgdata-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restart
docker compose up -d
```

### ⚠️ Data Safety

- `docker compose down` does **NOT** delete volumes. Your data survives.
- Only `docker compose down -v` removes volumes — **never use `-v`** unless
  you intentionally want to destroy the database.
- Always back up before major changes.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **"Password authentication failed" for DB** | Check `POSTGRES_PASSWORD` in `.env` matches what you set |
| **"JWT_SECRET not set" or app won't start** | Set `JWT_SECRET` in `.env` (see generation instructions above) |
| **"Port 5000 already in use"** | Change `APP_PORT=5001` in `.env`, or stop the other process |
| **Cannot connect from another PC** | Check Windows Firewall allows port 5000; use server's LAN IP |
| **App starts but API returns errors** | Wait 30 seconds; the entrypoint retries DB connection automatically |
| **"relation does not exist"** | Migrations failed — check `docker compose logs app` for errors |
| **First build is slow** | Normal — installs ~200MB of deps + compiles frontend + generates Prisma |
| **Container keeps restarting** | Check logs: `docker compose logs app` — usually a config issue |
| **Need to reset everything** | `docker compose down -v` (⚠️ destroys DB data!) then `docker compose up -d --build` |
| **`docker-entrypoint.sh: invalid format`** | Line ending issue — ensure the file has Unix (LF) endings, not Windows (CRLF) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Parish Server (Docker Desktop)                     │
│                                                     │
│  ┌──────────────────┐   ┌────────────────────────┐  │
│  │ PostgreSQL 16     │   │ Ecclesia App            │  │
│  │ (container: db)   │◄──│ (container: app)        │  │
│  │                   │   │                         │  │
│  │ Port 5432         │   │ Port 5000 → host 5000   │  │
│  │ (internal only)   │   │                         │  │
│  │                   │   │ Express + Socket.IO      │  │
│  │ Volume:           │   │ + Vite SPA              │  │
│  │ ecclesia-pgdata   │   │                         │  │
│  └──────────────────┘   └────────────────────────┘  │
│                                                     │
│  Browsers: http://localhost:5000                     │
│  LAN:      http://192.168.x.x:5000                  │
└─────────────────────────────────────────────────────┘
```

**Data flow:**
- Browser → port 5000 → Express (REST API + static SPA)
- Express → Docker network → PostgreSQL (port 5432, internal)
- Socket.IO: same port 5000 (WebSocket upgrade on HTTP)

---

*Ecclesia Church Management System — Docker Level 2*
