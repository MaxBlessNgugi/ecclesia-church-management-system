# ECCLESIA — Server Setup Guide

ECCLESIA is a **multi-user web application**. One server hosts the database and
API; staff access it from any browser on the parish network — no installation on
client devices.

> **Clients just open a browser.** See [CLIENT_SETUP.md](CLIENT_SETUP.md) for
> client instructions.

---

## Easiest Way to Install (Recommended)

**Two prerequisites, one command.** Install Node.js and PostgreSQL, then run the
installer — it does everything else.

### 1. Install prerequisites

| Program | Version | Download |
|---------|---------|----------|
| **Node.js** | 18+ (LTS) | https://nodejs.org |
| **PostgreSQL** | 14+ | https://postgresql.org |

During PostgreSQL installation, set a password for the `postgres` user.
The installer defaults to password `ecclesia` — if you chose differently,
edit `backend/.env` after install.

### 2. Run the installer

**Windows** — double-click `scripts/install-parish.cmd` or run in Command Prompt:
```
scripts\install-parish.cmd
```

**Linux / macOS** — run in Terminal:
```bash
bash scripts/install-parish.sh
```

The installer will:

1. Verify Node.js 18+ and PostgreSQL are installed and running
2. Create `backend/.env` with a strong auto-generated JWT secret
3. Install all npm dependencies (root + backend)
4. Generate the Prisma client and apply database migrations
5. Seed the initial super_admin accounts
6. Build the production frontend
7. Optionally configure the `ecclesia.local` hostname

> **Safety:** the installer never overwrites an existing `backend/.env` without
> asking first, and never drops an existing database.

### 3. Start the server

```bash
cd backend
npm start
```

Open **http://localhost:5000** (or `http://ecclesia.local` if you set up the
hostname) in any browser on the parish network. On first login you'll be guided
through a one-time Parish Setup Wizard.

---

## Advanced / Manual Setup

Use this path only if the installer doesn't work for your system, or you prefer
to manage each step yourself.

### Prerequisites

- **Windows 10/11**, **macOS**, or **Linux** (Ubuntu, Debian, etc.)
- **Node.js 18+** (https://nodejs.org)
- **PostgreSQL 14+** (https://postgresql.org)
- **Git** (optional, for cloning the repository)

---

### Step 1: Install Node.js and PostgreSQL

#### Node.js

1. Download the **LTS version** from https://nodejs.org
2. Run the installer and follow the prompts
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

#### PostgreSQL

1. Download from https://postgresql.org/download
2. Run the installer — remember the **postgres** user password
3. Verify installation:
   ```bash
   psql --version
   ```

---

### Step 2: Download ECCLESIA

**Option A: Download ZIP**
1. Go to https://github.com/MaxBlessNgugi/ecclesia-church-management-system
2. Click **Code** → **Download ZIP**
3. Extract the ZIP to a folder like `C:\Ecclesia` or `/opt/ecclesia`

**Option B: Clone with Git**
```bash
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system
```

---

### Step 3: Configure the Server

Create or edit `backend/.env`:

```bash
# PostgreSQL — multi-user concurrent database
DATABASE_URL="postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public"

# Security — CHANGE THIS to a random secret!
JWT_SECRET="your-random-secret-here"

# Server port (default 5000)
PORT=5000

# Environment
NODE_ENV=production
```

**Generate a secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

### Step 4: Install and Setup

```bash
npm install
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

The seed creates three super_admin accounts (see README.md for emails).

---

### Step 5: Build and Start

```bash
cd ..
npm run build
cd backend
npm start
```

The server starts on port 5000 and serves both the frontend and API.

---

## First-Run Wizard

On first login, after authentication you will be forced into the **Parish Setup
Wizard**. Complete all fields (parish name, diocese, local church, etc.) to
configure your parish identity. This is a one-time setup.

---

## Setting Up the Friendly Hostname (ecclesia.local)

The recommended way to access ECCLESIA is using the friendly name **ecclesia.local**.

### Linux (Avahi)

```bash
sudo bash scripts/setup-hostname.sh
```

### Windows (Bonjour/PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
```

### Manual Setup (Static IP)

1. Set a static IP on the server
2. Add a hosts file entry on each client:
   ```
   192.168.1.100    ecclesia ecclesia.local
   ```

---

## Running as a Service

### Linux (systemd)

Create `/etc/systemd/system/ecclesia.service`:
```ini
[Unit]
Description=Ecclesia Church Management System
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/opt/ecclesia/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable ecclesia
sudo systemctl start ecclesia
```

### Windows

1. Create a batch file `start-ecclesia.bat`:
   ```batch
   @echo off
   cd /d C:\Ecclesia\backend
   call npm start
   ```
2. Place a shortcut in the Startup folder (`shell:startup`)

---

## Updating

```bash
git pull
npm install
cd backend && npm install && npx prisma generate && npx prisma migrate deploy
cd ..
npm run build
cd backend && npm restart
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "ecclesia.local" doesn't work | Try the IP address directly, or add a hosts file entry |
| "Cannot connect to server" | Check firewall (port 5000), verify server is running |
| "Port 5000 already in use" | Change PORT in backend/.env |
| "Database connection refused" | Check PostgreSQL is running, verify DATABASE_URL |
| Forgot the admin password | Use **Forgot Password?** on login, or reset via database |

---

## Backup

PostgreSQL backups use `pg_dump`:

```bash
pg_dump -U postgres ecclesia > backups/ecclesia-backup-$(date +%Y%m%d).sql
```

Backups are stored in `backend/backups/` and rotated automatically (keeping 14 by default).

---

*Private — Max Bless Ngugi / Ecclesia*
