# ECCLESIA — Server Setup Guide

This guide explains how to set up the ECCLESIA server on a dedicated parish computer.
The server hosts the database and API that all client devices connect to over the local network.

> **Clients do not need any installation.** They simply open a web browser and
> navigate to the server address. See [CLIENT_SETUP.md](CLIENT_SETUP.md) for
> client instructions.

---

## Easiest Way to Install (Recommended)

If you are setting up ECCLESIA for your parish, use the one-command installer.
It handles everything automatically: checks prerequisites, configures the
database, installs dependencies, and builds the application.

### Prerequisites

Before running the installer, install these two programs:

1. **Node.js 18+** — download from https://nodejs.org (choose the LTS version)
2. **PostgreSQL 14+** — download from https://postgresql.org
   - During installation, set a password for the `postgres` user
   - The installer uses the default password `ecclesia`
     (if you chose a different password, edit `backend/.env` after install)

### Run the Installer

**Windows:**
Double-click `scripts/install-parish.cmd` or run in Command Prompt:
```
scripts\install-parish.cmd
```

**Linux / macOS:**
```bash
bash scripts/install-parish.sh
```

The installer will:
- Check that Node.js and PostgreSQL are installed
- Create a secure configuration file (`backend/.env`)
- Install all dependencies
- Set up the database schema
- Create the initial super_admin accounts
- Build the frontend
- Optionally configure the `ecclesia.local` hostname

### Start the Server

After installation completes:
```bash
cd backend
npm start
```

Then open **http://localhost:5000** in any browser on the parish network.

> **First time?** You will be guided through a Parish Setup Wizard to configure
> your parish name, logo, diocese, and other identity details.

---

## Advanced / Manual Setup

If you prefer to set things up manually (or the installer doesn't work for your
system), follow the steps below.

### Prerequisites

- **Windows 10/11**, **macOS**, or **Linux** (Ubuntu, Debian, etc.)
- **Node.js 18+** (download from https://nodejs.org)
- **PostgreSQL 14+** (download from https://postgresql.org)
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
npx prisma db push
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
cd backend && npm install && npx prisma generate && npx prisma db push
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
