# ECCLESIA Church Management System — Server Setup Guide

This guide explains how to set up the ECCLESIA server on a dedicated parish computer. The server hosts the database and API that all client devices connect to over the local network.

## Quick Start

### Prerequisites

- **Windows 10/11**, **macOS**, or **Linux** (Ubuntu, Debian, etc.)
- **Node.js 18+** (download from https://nodejs.org)
- **Git** (optional, for cloning the repository)

### Step 1: Install Node.js

1. Download the **LTS version** from https://nodejs.org
2. Run the installer and follow the prompts
3. Verify installation by opening a terminal and typing:
   ```bash
   node --version
   npm --version
   ```

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

### Step 3: Install Dependencies

Open a terminal in the ECCLESIA folder and run:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
cd ..
```

### Step 4: Configure the Server

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

### Step 5: Initialize the Database

```bash
cd backend
npx prisma generate
npx prisma db push
npm run db:seed
```

The seed creates three admin accounts:
- `maxblessngugi@ecclesia.local` (super_admin)
- `josephndung'u@ecclesia.local` (admin)
- `johnmusoma@ecclesia.local` (admin)

**Default password:** `ChangeMeImmediately123!`
(You'll be forced to change it on first login)

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

The server will start on port 5000 and serve the frontend. You should see:
```
Ecclesia Server running on http://0.0.0.0:5000
```

---

## Setting Up the Friendly Hostname (ecclesia.local)

The recommended way to access ECCLESIA is using the friendly name **ecclesia.local** instead of an IP address. This makes it easy for all users to remember and access the app.

### Option A: Automatic Setup (Recommended)

**For Linux servers (Ubuntu/Debian):**
```bash
sudo bash scripts/setup-hostname.sh
```

**For Windows servers (Run as Administrator):**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
```

These scripts will:
1. Set the system hostname to "ecclesia"
2. Install and configure mDNS (Avahi on Linux, Bonjour on Windows)
3. Create the necessary service files
4. Verify the setup

### Option B: Manual Setup

#### Linux (Avahi)

1. **Set the hostname:**
   ```bash
   sudo hostnamectl set-hostname ecclesia
   ```

2. **Install Avahi:**
   ```bash
   sudo apt update
   sudo apt install avahi-daemon avahi-utils
   ```

3. **Configure Avahi** (`/etc/avahi/avahi-daemon.conf`):
   ```ini
   [server]
   hostname=ecclesia
   domain-name=local
   use-ipv4=yes
   use-ipv6=yes
   ```

4. **Create service file** (`/etc/avahi/services/ecclesia.service`):
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

5. **Restart Avahi:**
   ```bash
   sudo systemctl restart avahi-daemon
   sudo systemctl enable avahi-daemon
   ```

#### Windows

1. **Set the computer name:**
   - Open **Settings** → **System** → **About**
   - Click **Rename this PC**
   - Enter "ecclesia" and restart

2. **Install Bonjour Print Services:**
   - Download from: https://support.apple.com/kb/DL999
   - Install and restart if prompted

3. **Verify Bonjour is running:**
   - Open **Services** (services.msc)
   - Find "Bonjour Service"
   - Ensure it's running and set to Automatic

### Option C: Static IP + Hostname (Most Reliable)

For maximum reliability, use a static IP address:

1. **Set a static IP on the server:**
   - Windows: Settings → Network → Ethernet → Edit IP assignment → Manual
   - Linux: Edit `/etc/netplan/*.yaml` or use your distro's network manager

2. **Add a hosts file entry on each client computer:**
   - **Windows:** Edit `C:\Windows\System32\drivers\etc\hosts`
   - **macOS/Linux:** Edit `/etc/hosts`
   
   Add this line (replace `192.168.1.100` with your server's IP):
   ```
   192.168.1.100    ecclesia ecclesia.local
   ```

3. **Or configure your router:**
   - Log into your router admin panel
   - Find DHCP reservations or static leases
   - Reserve an IP for the server's MAC address
   - Set the hostname to "ecclesia"

---

## Enabling HTTPS with Caddy (Optional but Recommended)

HTTPS provides secure, encrypted communication. Caddy can automatically set up HTTPS for your local network.

### Prerequisites

1. **Install Caddy:**
   - Windows: Download from https://caddyserver.com/download
   - Linux: `sudo apt install -y caddy` or download from https://caddyserver.com/download
   - macOS: `brew install caddy`

### Setup

1. **Build the frontend:**
   ```bash
   cd /path/to/ecclesia
   npm run build
   ```

2. **Start the backend:**
   ```bash
   cd backend
   npm start
   ```

3. **Run Caddy** (from the ECCLESIA root directory):
   ```bash
   caddy run
   ```

4. **Access the app:**
   - Open a browser on any client computer
   - Go to: **https://ecclesia.local**
   - Accept the self-signed certificate warning (first visit only)
   - The app should load with HTTPS

### How It Works

- Caddy automatically creates a self-signed certificate for `ecclesia.local`
- All traffic is encrypted (HTTPS)
- HTTP requests are redirected to HTTPS
- The app is accessible at `https://ecclesia.local`

### Certificate Warnings

On first visit, browsers will show a security warning because the certificate is self-signed. This is normal for LAN installations. Users should:

1. Click "Advanced" or "Show Details"
2. Click "Proceed to ecclesia.local (unsafe)" or "Accept the Risk"
3. The app will load and the warning won't appear again

---

## Network Configuration

### Firewall Setup

**Windows:**
1. Open **Windows Defender Firewall** → **Advanced Settings**
2. Click **Inbound Rules** → **New Rule**
3. Select **Port** → **TCP** → Enter `5000`
4. Select **Allow the connection**
5. Check **Domain**, **Private**, **Public**
6. Name it "Ecclesia Server"

**Linux (UFW):**
```bash
sudo ufw allow 5000/tcp
sudo ufw reload
```

**Linux (firewalld):**
```bash
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --reload
```

### Port Configuration

Default ports:
- **5000**: ECCLESIA backend (API + frontend)
- **443**: HTTPS (if using Caddy)
- **80**: HTTP redirect to HTTPS (if using Caddy)

If you need to change the backend port:
1. Edit `backend/.env`: `PORT=5001`
2. Update `Caddyfile` if using Caddy: `reverse_proxy 127.0.0.1:5001`

---

## Running as a Service (Auto-Start)

### Windows

1. Create a batch file `start-ecclesia.bat`:
   ```batch
   @echo off
   cd /d C:\Ecclesia\backend
   call npm start
   ```

2. Place a shortcut in the Startup folder:
   - Press `Win+R`, type `shell:startup`, press Enter
   - Create a shortcut to `start-ecclesia.bat` in this folder

### Linux (systemd)

1. Create `/etc/systemd/system/ecclesia.service`:
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

2. Enable and start:
   ```bash
   sudo systemctl enable ecclesia
   sudo systemctl start ecclesia
   ```

### macOS (launchd)

1. Create `~/Library/LaunchAgents/com.ecclesia.server.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.ecclesia.server</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/local/bin/node</string>
           <string>/opt/ecclesia/backend/dist/index.js</string>
       </array>
       <key>WorkingDirectory</key>
       <string>/opt/ecclesia/backend</string>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
       <key>EnvironmentVariables</key>
       <dict>
           <key>NODE_ENV</key>
           <string>production</string>
           <key>PORT</key>
           <string>5000</string>
       </dict>
   </dict>
   </plist>
   ```

2. Load the service:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.ecclesia.server.plist
   ```

---

## Backup Strategy

The PostgreSQL database is backed up automatically using `pg_dump`. Backups are stored in `backend/backups/` and rotated (keeping 14 by default).

**Manual Backup:**
```bash
# Using the admin API endpoint
POST /api/admin/backup

# Or using pg_dump directly
pg_dump -U postgres ecclesia > backups/ecclesia-backup-$(date +%Y%m%d).sql
```

**Automated Backup (Linux cron):**
```bash
crontab -e
# Add: 0 2 * * * cp /opt/ecclesia/backend/dev.db /opt/ecclesia/backups/ecclesia-$(date +\%Y\%m\%d).db
```

---

## Troubleshooting

### "ecclesia.local" doesn't work

1. **Check if mDNS is working:**
   - Linux: `avahi-resolve -n ecclesia.local`
   - Windows: `ping ecclesia.local`
   - macOS: `ping ecclesia.local`

2. **Try the IP address directly:**
   - Find the server's IP: `hostname -I` (Linux) or `ipconfig` (Windows)
   - Open `http://<IP>:5000` in a browser

3. **Add hosts file entry:**
   - See "Option C: Static IP + Hostname" above

4. **Check firewall:**
   - Ensure port 5000 is open
   - Try temporarily disabling the firewall to test

### "Cannot connect to server"

1. Verify the server is running: `curl http://localhost:5000/api/health`
2. Check the firewall (see above)
3. Ensure the client is on the same network
4. Try pinging the server: `ping 192.168.1.100`

### "Database locked"

1. Stop the server
2. Delete `backend/dev.db-journal` if it exists
3. Restart the server

### "Port 5000 already in use"

Change the port in `backend/.env`:
```
PORT=5001
```

Clients will need to connect with the new port.

### Certificate warnings with Caddy

This is normal for self-signed certificates on a LAN. Users should:
1. Click "Advanced" in the browser warning
2. Click "Proceed to ecclesia.local (unsafe)"
3. The warning won't appear again for that browser

---

## Security Notes

- **Do NOT expose the server to the internet** without proper security
- **Use HTTPS** if handling sensitive data (see Caddy setup above)
- **Change the JWT_SECRET** from the default value
- **Regular backups** protect against data loss
- **Strong passwords** for all admin accounts
- **Keep the server updated** with security patches

---

## Next Steps

- [CLIENT_SETUP.md](CLIENT_SETUP.md) — Set up client devices
- [ELECTRON_SETUP.md](ELECTRON_SETUP.md) — Set up the desktop app

---

## Quick Reference

### Server Access URLs

| URL | Description |
|-----|-------------|
| `http://ecclesia.local:5000` | Direct access (no HTTPS) |
| `https://ecclesia.local` | HTTPS via Caddy (recommended) |
| `http://<server-ip>:5000` | IP-based access |
| `https://<server-ip>` | HTTPS via Caddy with IP |

### Default Ports

| Port | Service |
|------|---------|
| 5000 | ECCLESIA backend |
| 443 | HTTPS (Caddy) |
| 80 | HTTP redirect to HTTPS (Caddy) |
