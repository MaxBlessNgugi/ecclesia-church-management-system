# ECCLESIA Church Management System — Server Setup Guide

This guide explains how to set up the ECCLESIA server on a dedicated parish computer. The server hosts the database and API that all client devices connect to over the local network.

## Quick Start

### Prerequisites

- **Windows 10/11**, **macOS**, or **Linux** (Ubuntu, Debian, etc.)
- **Node.js 18+** (download from https://nodejs.org)
- **PostgreSQL 14+** (download from https://postgresql.org)
- **Git** (optional, for cloning the repository)

### Step 1: Install Node.js and PostgreSQL

**Node.js:**
1. Download the **LTS version** from https://nodejs.org
2. Run the installer and follow the prompts
3. Verify installation:
   ```bash
   node --version
   npm --version
   ```

**PostgreSQL:**
1. Download from https://postgresql.org/download
2. Run the installer — remember the **postgres** user password
3. Create the database:
   ```bash
   psql -U postgres -c "CREATE DATABASE ecclesia;"
   ```

### Step 2: Download ECCLESIA

**Option A: Download ZIP**
1. Go to https://github.com/MaxBlessNgugi/ecclesia-church-management-system
2. Click **Code** → **Download ZIP**
3. Extract to a folder like `C:\Ecclesia` or `/opt/ecclesia`

**Option B: Clone with Git**
```bash
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system
```

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

# Client URL for Socket.IO CORS (set to your production domain in production)
CLIENT_URL="http://localhost:3000"
```

**Generate a secure JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Step 4: Install Dependencies

```bash
npm install
cd backend
npm install
cd ..
```

### Step 5: Initialize the Database

```bash
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

The seed creates three super_admin accounts. **Write down the credentials.**

### Step 6: Build the Frontend

```bash
cd ..
npm run build
```

### Step 7: Start the Server

```bash
cd backend
npm start
```

The server starts on port 5000 and serves the frontend. You should see:
```
Ecclesia Server running on http://0.0.0.0:5000
```

---

## Setting Up the Friendly Hostname (ecclesia.local)

The recommended way to access ECCLESIA is using the friendly name **ecclesia.local**.

### Automatic Setup (Recommended)

**Linux servers:**
```bash
sudo bash scripts/setup-hostname.sh
```

**Windows servers (Run as Administrator):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
```

### Manual Setup

#### Linux (Avahi)

1. Set the hostname:
   ```bash
   sudo hostnamectl set-hostname ecclesia
   ```

2. Install and configure Avahi:
   ```bash
   sudo apt update
   sudo apt install avahi-daemon avahi-utils
   ```

3. Create service file (`/etc/avahi/services/ecclesia.service`):
   ```xml
   <?xml version="1.0" standalone='no'?>
   <!DOCTYPE service-group SYSTEM "avahi-service.dtd">
   <service-group>
     <name replace-wildcards="yes">Ecclesia Church Management - %h</name>
     <service>
       <type>_http._tcp</type>
       <port>5000</port>
     </service>
   </service-group>
   ```

4. Restart Avahi:
   ```bash
   sudo systemctl restart avahi-daemon
   sudo systemctl enable avahi-daemon
   ```

#### Windows

1. Set the computer name to "ecclesia" (Settings → System → About → Rename)
2. Install Bonjour Print Services from https://support.apple.com/kb/DL999
3. Ensure "Bonjour Service" is running (services.msc)

### Static IP + Hostname (Most Reliable)

1. Set a static IP on the server
2. Add a hosts file entry on each client:
   ```
   192.168.1.100    ecclesia ecclesia.local
   ```

---

## Enabling HTTPS with Caddy (Optional but Recommended)

### Setup

1. Install Caddy from https://caddyserver.com/download
2. Build the frontend: `npm run build` (from repo root)
3. Start the backend: `cd backend && npm start`
4. Run Caddy: `caddy run` (uses the Caddyfile at the repo root)
5. Access at **https://ecclesia.local** (accept self-signed cert warning on first visit)

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

1. Create `start-ecclesia.bat`:
   ```batch
   @echo off
   cd /d C:\Ecclesia\backend
   call npm start
   ```
2. Place a shortcut in Startup folder (`shell:startup`)

### macOS (launchd)

Create `~/Library/LaunchAgents/com.ecclesia.server.plist` and load:
```bash
launchctl load ~/Library/LaunchAgents/com.ecclesia.server.plist
```

---

## Backup Strategy

PostgreSQL backups use `pg_dump` and are stored in `backend/backups/`.

**Manual Backup:**
```bash
pg_dump -U postgres ecclesia > backups/ecclesia-backup-$(date +%Y%m%d).sql
```

**Automated Backup (Linux cron):**
```bash
crontab -e
# Add: 0 2 * * * pg_dump -U postgres ecclesia > /opt/ecclesia/backups/ecclesia-$(date +\%Y\%m\%d).sql
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "ecclesia.local" doesn't work | Try the IP address, add a hosts file entry, check mDNS |
| "Cannot connect to server" | Check firewall (port 5000), verify server is running |
| "Database connection refused" | Check PostgreSQL is running, verify DATABASE_URL |
| "Port 5000 already in use" | Change PORT in backend/.env |
| Certificate warnings with Caddy | Normal for self-signed certs — click Advanced → Proceed |

---

## Quick Reference

### Server Access URLs

| URL | Description |
|-----|-------------|
| `http://ecclesia.local:5000` | Default (mDNS) |
| `https://ecclesia.local` | HTTPS via Caddy |
| `http://<server-ip>:5000` | Direct IP access |

### Ports

| Port | Service |
|------|---------|
| 5000 | ECCLESIA backend (API + frontend) |
| 443 | HTTPS (if using Caddy) |
| 80 | HTTP redirect to HTTPS (if using Caddy) |

---

*Private — Max Bless Ngugi / Ecclesia*
