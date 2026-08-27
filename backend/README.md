# Ecclesia Backend — PostgreSQL Multi-User Server

Requires **PostgreSQL** for concurrent multi-user access.

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
npx prisma generate
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
npm run dev
```

Open **http://localhost:3000**

---

## Super Admin accounts

Three super_admin accounts are seeded on first run, each with full access:

| Email | Name | Role |
|-------|------|------|
| `maxblessngugi@ecclesia.local` | Max Bless Ngugi | `super_admin` |
| `josephndung'u@ecclesia.local` | Joseph Ndung'u | `super_admin` |
| `anko@ecclesia.local` | Anko | `super_admin` |

All seeded accounts require a password change at first login.
Any super_admin can add other users.

---

## Requirements

- **Node.js 18+**
- **PostgreSQL 14+** (or use Docker for easy setup)

Configure the database connection in `backend/.env`:
```
DATABASE_URL="postgresql://postgres:ecclesia@localhost:5432/ecclesia?schema=public"
```

---

## Scripts

| Command | What it does |
|---------|----------------|
| `./start-local.sh` | Install + DB + seed + start |
| `npm run dev` | API with hot reload |
| `npm run db:push` | Sync schema to PostgreSQL |
| `npm run db:seed` | Create super_admin accounts |
| `npm run db:studio` | Database GUI |

---

Private — Max Bless Ngugi / Ecclesia
