# ECCLESIA Dual-Installation Acceptance — Evidence

## PATH A — Native Node.js + PostgreSQL (EXECUTED, PASSING)

**Environment:** brand-new PostgreSQL 18 cluster (`initdb`, port 5433, scram auth,
empty data directory) + a clean copy of the release-candidate source tree at
`%TEMP%/ecclesia-acceptance/native/ecclesia` — no dev-machine `.env`, no dev
database, no node_modules reused.

**Recorded procedure (INSTALL.md, followed literally):**

| Step | Command | Result |
|------|---------|--------|
| Env | write `backend/.env` per INSTALL.md Step 3 | ✅ |
| Deps | `npm install` (root + backend) | ✅ |
| Migration | `npx prisma migrate deploy` | ❌→✅ **caught bug #1** (see below) |
| Seed | `npm run db:seed` | ✅ 3 super_admins, forced pw change |
| Build | `npm run build` | ✅ |
| Start | `node dist/index.js` | ✅ (PORT from env; see doc-gap #2) |
| Health | `GET /api/health` | ✅ ok + db connected |
| Battery | `node acceptance-evidence/path-a-battery.mjs` | ✅ **17/17** |
| Backup | `npm run backup` | ❌→✅ **caught bug #2** |
| Restore | `npm run restore -- --file=… --yes` into scratch DB | ✅ 8/8 tables row-for-row |
| Multi-user | 2nd admin login, staff registration, 403 enforcement | ✅ |

Log: `path-a-battery-final.log`.

**Product bugs caught by the clean-room run (all fixed in the repo):**

1. `backend/prisma/migrations/20260921080000_add_concurrency_unique_constraints/migration.sql`
   used unquoted camelCase identifiers (`refNo`, `voucherNo`, `deposits`,
   `expenses`) in the backfill SQL → `column "refno" does not exist`,
   `migrate deploy` hard-fails on every fresh database. Never seen in dev
   because the dev DB was built with `prisma db push`. Fixed; verified from
   zero twice.
2. **`npm run backup` (the documented backup path) failed on the documented
   DATABASE_URL.** At HEAD, the shared `parsePgUrl` in `src/lib/backup.ts`
   kept `?schema=public` glued to the database name →
   `pg_dump: invalid connection option "ecclesia?schema"` with the repo's own
   documented URL format. Already fixed in the release candidate (WHATWG URL
   parser); the clean run re-proved the failure on HEAD code and the fix on
   RC code.
3. `scripts/reset-admin-password.ts` (`npm run admin:reset`, the documented
   lost-admin-password procedure) never loaded `backend/.env` → Prisma
   P1012 "Environment variable not found: DATABASE_URL" on every machine.
   Fixed with `import 'dotenv/config'`.

**Documentation gaps found and fixed (see INSTALL.md / DOCKER.md diffs):**

- No `createdb` step anywhere; fresh installs depend on Prisma auto-creating
  the database (engine/version-dependent). INSTALL.md Step 4 now creates it.
- Windows PostgreSQL installs don't add `bin` to PATH → both installers died
  at Step 1 on stock installs. `install-parish.cmd` now probes
  `C:\Program Files\PostgreSQL\*\bin`.
- INSTALL.md "Updating" referenced non-existent `npm restart`.
- Docker ships `BACKUP_DISABLED=true` silently — DOCKER.md now states that
  Docker has no automatic backup scheduler and schedules `pg_dump` itself.
- Troubleshooting rows added for P1003, PATH-less psql, and the correct
  lost-admin-password remedy (`admin:reset`, not email codes).

## PATH B — Docker Compose (SCRIPTED; execution pending Docker install)

Docker is not installed on this machine and the elevation prompt to enable
WSL2 was not approved in-session. The complete battery is ready:

```bash
bash acceptance-evidence/path-b-battery.sh
```

It executes the documented DOCKER.md procedure verbatim (`.env.example.docker`
→ `docker compose up -d --build`) and verifies: image build, container/PG/app
health, entrypoint migrations + seed, first login, the **same** CRUD battery
as PATH A (`path-crud.mjs`), persistent volume, backup, restore-into-scratch,
app restart, DB restart, and full `down`/`up` — 12 steps with PASS/FAIL
accounting and a command log (`path-b-commands.log`).

## Reproducing PATH A anywhere

```bash
# 1. PostgreSQL: install, then create an empty cluster/database for the test
# 2. Clean source tree: git archive HEAD (plus release-candidate fixes)
# 3. Follow INSTALL.md Steps 3–5 with DATABASE_URL pointed at the test DB
# 4. cd backend && npm run build (root) ; PORT=<free> node dist/index.js
# 5. ACCEPTANCE_BACKEND=<path>/backend node acceptance-evidence/path-a-battery.mjs
# 6. npm run backup && create scratch DB && npm run restore -- --file=… --yes
```
