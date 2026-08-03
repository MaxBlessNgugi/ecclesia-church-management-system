# Ecclesia - Church Management System (Parish ERP)

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
| Email | `maxblessngugi@ecclesia.local` |
| Password | `ChangeMeImmediately123!` |
| Role | `super_admin` (full access) |

Only this account can add other users. **Change the password after first login.**

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
