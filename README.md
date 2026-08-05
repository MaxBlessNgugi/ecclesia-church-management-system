# ECCLESIA ChMS — Church Management System (Parish ERP)

Full-stack church management system: **React 19 frontend** + **local SQLite backend**.

---

## Run everything locally (2 terminals)

### 1. Install (once)

```bash
npm run setup
```

This installs frontend + backend deps, creates the local SQLite database, and seeds **you** as Super Admin.

### 2. Start backend

```bash
npm run backend
```

→ API at **http://localhost:5000**

### 3. Start frontend (new terminal)

```bash
npm run dev
```

→ App at **http://localhost:3000**  
(Vite proxies `/api` → backend automatically)

---

## Super Admin login

| Field | Value |
|-------|--------|
| Email | `SUPER_ADMIN_EMAIL` from `backend/.env` (default `maxblessngugi@ecclesia.local`) |
| Password | `SUPER_ADMIN_PASSWORD` if set in `backend/.env`, otherwise **random** — printed **once** on first seed |
| Role | `super_admin` (full access) |

The seeded account is created with a temporary password and **must be changed at first sign-in**. Only this account can add other users.

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
├── backend/             # Production API (Express + Prisma + SQLite)
│   ├── src/routes/      # All REST endpoints
│   ├── prisma/          # Schema + seed
│   └── start-local.sh
├── server/              # Old in-memory reference (deprecated)
├── API.md               # REST contract
└── package.json
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run setup` | Install both sides + create DB + seed admin |
| `npm run backend` | Start API on port 5000 |
| `npm run dev` | Start frontend on port 3000 |
| `npm run build` | Build frontend for production |
| `npm run backend:build` + `npm start` | Run the whole app as one process (see "Production" above) |

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
- Nothing else (SQLite is a local file)

Private — Max Bless Ngugi / Ecclesia
