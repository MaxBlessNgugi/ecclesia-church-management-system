# Ecclesia Backend — 100% Local

No PostgreSQL. No cloud. No Docker.  
Uses a **SQLite file** on your machine.

---

## One-command local start

```bash
cd ecclesia-backend
chmod +x start-local.sh
./start-local.sh
```

Or step by step:

```bash
npm install
cp .env.example .env
npx prisma db push
npm run db:seed
npm run dev
```

API: **http://localhost:5000**  
Health: `curl http://localhost:5000/api/health`

---

## Frontend (run in a second terminal)

```bash
cd ECCLESIA-ChMS
npm install
echo 'VITE_API_BASE_URL=http://localhost:5000/api' > .env
npm run dev
```

Open **http://localhost:3000**

---

## Your Super Admin login

| Field    | Value |
|----------|-------|
| Email    | `maxblessngugi@ecclesia.local` |
| Password | `ChangeMeImmediately123!` |
| Role     | `super_admin` (full access) |

Only **you** can add other users. Change the password after first login.

---

## Requirements

- **Node.js 18+** only  
- Nothing else

Database file is created automatically at `prisma/dev.db` (gitignored).

---

## Scripts

| Command | What it does |
|---------|----------------|
| `./start-local.sh` | Install + DB + seed + start |
| `npm run dev` | API with hot reload |
| `npm run db:push` | Create/update SQLite schema |
| `npm run db:seed` | Create Super Admin |
| `npm run db:studio` | Local database GUI |

---

Private — Max Bless Ngugi / Ecclesia
