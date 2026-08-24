# ECCLESIA ChMS — Church Management System (Parish ERP)

Multi-user church management system: **React 19 frontend** + **Express + Prisma + PostgreSQL backend**.

> **For management/executive audiences:** see **[REPORT.md](REPORT.md)** (status &
> capability report) — and **[INSTALL.md](INSTALL.md)** for deploying on another PC.

---

## Architecture Overview

ECCLESIA is a **client-server application** designed for multi-user access on a local network:

- **Server**: Runs on a dedicated parish computer (office PC, mini-server, or NAS)
- **Clients**: Access the app through web browsers or a thin Electron shell
- **Real-time sync**: All changes appear instantly on all connected devices via Socket.IO
- **Friendly URL**: Access at `http://ecclesia.local` on your parish network

```
┌─────────────────────────────────────────────────────────────────┐
│                        PARISH NETWORK                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   Admin PC   │    │  Treasurer   │    │   Secretary  │      │
│  │   (Browser)  │    │   (Browser)  │    │   (Browser)  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                  │
│                    http://ecclesia.local                        │
│                             │                                  │
│                    ┌────────▼────────┐                         │
│                    │  ECCLESIA Server │                         │
│                    │  (Express + DB)  │                         │
│                    └─────────────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start (Server Setup)

### 1. Install prerequisites

- **Node.js 18+** (https://nodejs.org)
- A dedicated computer on your parish network

### 2. Download and setup

```bash
# Clone or download the repository
git clone https://github.com/MaxBlessNgugi/ecclesia-church-management-system.git
cd ecclesia-church-management-system

# Install dependencies and setup database
npm run setup
```

### 3. Configure the friendly hostname (ecclesia.local)

```bash
# Linux (Ubuntu/Debian)
sudo bash scripts/setup-hostname.sh

# Windows (Run as Administrator)
powershell -ExecutionPolicy Bypass -File scripts\setup-hostname.ps1
```

### 4. Start the server

```bash
cd backend
npm start
```

The server is now accessible at:
- **http://ecclesia.local:5000** (from any computer on your network)
- Or **https://ecclesia.local** (if using Caddy for HTTPS)

---

## Client Access

From any computer on the same network:

1. Open a web browser (Chrome, Firefox, Edge, or Safari)
2. Go to: **http://ecclesia.local**
3. First time: Click **Connect to Server** (address should be pre-filled)
4. Log in with your credentials
5. Start using ECCLESIA!

See **[CLIENT_SETUP.md](CLIENT_SETUP.md)** for detailed instructions.

---

## Run as a desktop app (Electron)

ECCLESIA also has an **Electron desktop app** that connects to the server:

```bash
npm run dev
```

→ Opens the native **ECCLESIA desktop window** that connects to the server.
On Windows you can also double-click **`start-app.cmd`** for the same result.

For a distributable Windows installer: `npm run dist:win` (output in `release/`).

---

## Run in the browser instead (developers only)

While `npm run dev` is running, the Vite dev server is still available at
**http://localhost:3000** in any browser (it proxies `/api` → backend automatically) —
useful for responsive-mode testing. The Electron window opens on top by default.

For browser-only development without the Electron window:

```bash
npm run backend   # terminal 1 → API at http://localhost:5000
npx vite          # terminal 2 → app at http://localhost:3000
```

---

## Super Admin login

| Field | Value |
|-------|--------|
| Email | `SUPER_ADMIN_EMAIL` from `backend/.env` (default `maxblessngugi@ecclesia.local`) |
| Password | `SUPER_ADMIN_PASSWORD` if set in `backend/.env`, otherwise **random** — printed **once** on first seed |
| Role | `super_admin` (full access) |

The seeded account is created with a temporary password and **must be changed at first sign-in**. Only this account can add other users.

---

## Demo Mode (for sales pitches)

A believable, fully-populated parish dataset makes the app instantly demoable.
It loads 30 members, contributions, finance, ledgers, inventory, HR and more:

```bash
cd backend
npm run db:seed:demo
```

Demo logins (no forced password change):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@demo.ecclesia.local` | `AdminDemo123!` |
| Cashier | `cashier@demo.ecclesia.local` | `CashierDemo123!` |
| Viewer | `viewer@demo.ecclesia.local` | `ViewerDemo123!` |

**This never affects a commercial install.** The standard `npm run setup`
flow does not run the demo seed. To wipe demo data before going live:

```bash
cd backend
npm run db:clear:demo
```

That removes every business record and the demo users, returning the system to
its pristine post-install state. For an iron-clad commercial build you can also
delete `backend/prisma/seed-demo.ts` and `backend/scripts/clear-demo.ts`.

---

## Production (one process, one port)

The Express server serves the built frontend **and** the API together:

```bash
npm run build                 # 1. build the frontend (repo root)
cd backend
npm run build                 # 2. compile the backend (TypeScript -> dist/)
npm start                     # 3. run — serves the app on http://localhost:5000
```

Before deploying set a strong secret in `backend/.env` and force production mode:

```
NODE_ENV=production
JWT_SECRET=<48+ random hex chars>
```

The backend **refuses to start** in production with a missing or default `JWT_SECRET`
(see `docs/OPERATIONS.md`). For HTTPS on the LAN or a domain, drop Caddy in front:

```bash
caddy run          # uses the Caddyfile at the repo root
```

---

## Project structure

```
.
├── src/                 # React frontend
├── backend/             # Production API (Express + Prisma + PostgreSQL)
│   ├── src/routes/      # All REST endpoints
│   ├── prisma/          # Schema + seed (+ seed-demo.ts, demo only)
│   └── start-local.sh
├── API.md               # REST contract
└── package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install both sides + create DB + seed admin |
| `npm run backend` | Start API on port 5000 |
| `npm run dev` | Open the desktop app (Electron window) — starts Vite + backend |
| `npm run build` | Build frontend for production |
| `cd backend && npm run db:seed:demo` | Load realistic demo data for pitches |
| `cd backend && npm run db:clear:demo` | Wipe demo data (commercial handover) |

---

## Backend only

```bash
cd backend
./start-local.sh
```

Or: `npm run backend:setup` then `npm run backend`

---

## Requirements

- Node.js 18+
- PostgreSQL 14+ (or use Docker for easy setup)

Private — Max Bless Ngugi / Ecclesia
