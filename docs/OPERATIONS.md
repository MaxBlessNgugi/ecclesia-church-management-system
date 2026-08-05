# Ecclesia — Operations Runbook

Practical procedures for running an Ecclesia parish install commercially.
All paths are relative to the `backend/` directory unless noted.

## 1. Backups

The backend snapshots the SQLite database automatically:

- **Where:** `backend/backups/ecclesia-backup-<timestamp>.db`
- **When:** once on boot if a backup is due, then every 6h it re-checks and backs
  up when the last snapshot is older than `BACKUP_INTERVAL_HOURS` (default 24).
- **Rotation:** keeps the newest `BACKUP_KEEP` snapshots (default 14).
- **Off-site mirror:** set `BACKUP_DEST_DIR` in `backend/.env` to a network share
  or cloud-synced folder (e.g. Google Drive) to copy every snapshot there.

Manual operations:

```bash
npm run backup                          # snapshot right now (server may be running)
npm run restore -- --file=../backups/ecclesia-backup-xxx.db --yes   # server MUST be stopped
```

> A backup is a consistent snapshot (SQLite `VACUUM INTO`) — safe to copy even
> mid-write. Always keep at least one copy OFF the parish PC.

## 2. Security

- **JWT secret:** production refuses to start unless `JWT_SECRET` is a strong
  random value. Generate one:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  and put it in `backend/.env`. In development a random secret is generated and
  persisted automatically on first start.
- **Super admin:** the seeder generates a random password (or uses
  `SUPER_ADMIN_PASSWORD` if set), prints it **once**, and flags the account to
  force a password change at first sign-in. New users created by an admin are
  also forced to change their temporary password on first login.
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

## 3. Data export / exit path

```bash
npm run export           # writes JSON + a CSV per table into backend/exports/
```

Or via the UI: **Admin > Users > Export Data** (downloads the JSON bundle).
The JSON bundle can be re-imported onto a fresh install (server-side, super
admin only). The parish owns its data: JSON, CSV, or the raw `.db` file on
request, any time.

## 4. Diagnostics & support

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

## 5. First-run checklist for a new parish

1. `npm run setup` (root) — installs, creates DB, seeds super admin.
2. Copy the printed super admin password; set `SUPER_ADMIN_PASSWORD` env if a
   known value is preferred.
3. Set a real `JWT_SECRET` in `backend/.env` and `NODE_ENV=production` when
   deploying beyond localhost.
4. Configure `BACKUP_DEST_DIR` to an off-site folder.
5. Put Caddy (or another TLS proxy) in front of the API.
6. Sign in as super admin, change the forced password, create staff accounts.
7. Verify: Admin > Users > **Backup Now** and **Export Data** both work.
