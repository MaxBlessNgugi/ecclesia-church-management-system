# Ecclesia — Operations Runbook

Practical procedures for running an Ecclesia parish install commercially.
All paths are relative to the `backend/` directory unless noted.

## 1. Backups

The backend snapshots the PostgreSQL database automatically using `pg_dump`:

- **Where:** `backend/backups/ecclesia-backup-<timestamp>.sql`
- **When:** once on boot if a backup is due, then every 6h it re-checks and backs
  up when the last snapshot is older than `BACKUP_INTERVAL_HOURS` (default 24).
- **Rotation:** keeps the newest `BACKUP_KEEP` snapshots (default 14).
- **Off-site mirror:** set `BACKUP_DEST_DIR` in `backend/.env` to a network share
  or cloud-synced folder (e.g. Google Drive) to copy every snapshot there.
- **Requires:** `pg_dump` must be in PATH.

Manual operations:

```bash
npm run backup                          # snapshot right now (server may be running)
npm run restore -- --file=../backups/ecclesia-backup-xxx.sql --yes   # server MUST be stopped
```

> A backup is a consistent SQL dump — safe to copy even mid-write.
> Always keep at least one copy OFF the parish server.

## 2. Database Migrations

The project uses **Prisma Migrate** for schema management (replaced the earlier
`prisma db push` workflow). Migration files live in `backend/prisma/migrations/`.

### Development workflow

When you change `schema.prisma`:

```bash
cd backend
npx prisma migrate dev --name describe_your_change
```

This creates a timestamped migration directory with the SQL and applies it to
your local dev database. Commit the migration files to git.

### Production / parish server

```bash
cd backend
npx prisma migrate deploy
```

This applies any pending migrations that haven't been run yet. Safe to run
repeatedly — it only executes unapplied migrations.

### One-time baseline adoption (existing installs)

If your database was originally created with `prisma db push` (before the
migration workflow was introduced), you need to adopt the baseline once:

```bash
cd backend
# 1. Mark the baseline migration as applied (without running it)
npx prisma migrate resolve --applied 20260827040000_baseline
# 2. Future changes now use: npx prisma migrate dev --name <name>
# 3. Production deploys use: npx prisma migrate deploy
```

This tells Prisma the schema already matches the baseline, so future migrations
build on top of it correctly.

### Quick escape hatch

`npm run db:push` is still available for rapid prototyping but should **not**
be used in production or on parish servers. It bypasses migration tracking.

## 3. Security

- **JWT secret:** production refuses to start unless `JWT_SECRET` is a strong
  random value. Generate one:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  and put it in `backend/.env`. In development a random secret is generated and
  persisted automatically on first start.
- **Super admin accounts:** the seeder creates three super_admin accounts, each
  with a random password (or `SUPER_ADMIN_PASSWORD` if set for the primary).
  Passwords are printed **once** and all accounts force a password change at
  first sign-in. Any super_admin can create new users.
- **Login protection:** `POST /auth/login` is rate-limited (10/15min per IP) and
  each account locks for 15 minutes after 5 failed attempts.
- **Password resets:** the offline admin-reset flow (Admin > Users > Reset Pwd)
  issues a single-use 8-char code, hashed at rest, valid 30 minutes. Codes never
  leave the system except in the admin's hands.
- **HTTPS:** behind a reverse proxy. Simplest option is **Caddy** (auto
  self-signed on LAN, or Let's Encrypt with a domain). Example `Caddyfile`:

  ```caddyfile
  parish.example.com {
      reverse_proxy localhost:5000
  }
  ```

## 4. Data export / exit path

```bash
npm run export           # writes JSON + a CSV per table into backend/exports/
```

Or via the UI: **Admin > Users > Export Data** (downloads the JSON bundle).
The JSON bundle can be re-imported onto a fresh install (server-side, super
admin only). The parish owns its data: JSON, CSV, or raw SQL dumps on
request, any time.

## 5. Diagnostics & support

- **Live health snapshot:** `GET /api/admin/diagnostics` (admin auth) returns
  version, uptime, DB size, per-table row counts, last backup, disk free — no
  secrets. Load it in a browser after logging in, or via the support bundle.
- **Support bundle:** run
  `powershell -ExecutionPolicy Bypass -File scripts/support-bundle.ps1`
  from the repo root. It zips redacted `.env`, logs, versions, the newest
  backup, and (if you paste an admin JWT) the diagnostics snapshot into
  `support-bundles/`. Send that to the engineer instead of debugging blind.
- **Error log:** all handled errors are appended to `backend/logs/error.log`
  with a timestamp and the request that failed.

## 6. First-run checklist for a new parish

1. Install Node.js 18+ and PostgreSQL 14+ on the server.
2. `npm run setup` (root) — installs, creates DB, seeds three super_admin accounts.
3. Copy the printed passwords; set `SUPER_ADMIN_PASSWORD` env if a
   known value is preferred for the primary account.
4. Set a real `JWT_SECRET` in `backend/.env` and `NODE_ENV=production` when
   deploying beyond localhost.
5. Configure `BACKUP_DEST_DIR` to an off-site folder.
6. Put Caddy (or another TLS proxy) in front of the API if needed.
7. Sign in as any super_admin account, change the forced password, create staff accounts.
8. Complete the first-run parish setup wizard.
9. Verify: Admin > Users > **Backup Now** and **Export Data** both work.

## 7. Demo data (sales pitches only)

## 8. License / Activation

Not yet implemented. A future version may add an offline license-key check
stored in `ParishSettings`. For now, the product is free to use.

## 9. Automatic Updates

Not applicable for a self-hosted web application. Parishes update by pulling
new code and rebuilding:

```bash
git pull
npm install
cd backend && npm install && npx prisma generate && npx prisma migrate deploy
cd ..
npm run build
cd backend && npm restart
```

## 10. Crash Reporting

Not yet implemented. A future version may add Sentry integration behind an
environment variable (`SENTRY_DSN`). For now, errors are logged to
`backend/logs/error.log`.
