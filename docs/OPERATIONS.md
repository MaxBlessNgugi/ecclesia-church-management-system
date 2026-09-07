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

## 11. LAN hostname (`ecclesia.local`) — network DNS runbook

Goal: every device on the parish LAN resolves `http://ecclesia.local` to the
server (currently `DESKTOP-6J958TJ`, Wi-Fi at `192.168.100.10`, gateway
`192.168.100.1`). The app itself is already LAN-ready: the backend binds
`0.0.0.0:80` and serves both the SPA and the API from one port.

### A. Router configuration (the durable fix — needs admin login)

Log in to the router admin UI (on this network: `https://192.168.100.1`,
self-signed certificate — accept the warning). Then:

1. **DHCP reservation** (usually under *DHCP* / *LAN Setup* / *Address
   Reservation*): bind the server's MAC address (`30-24-A9-50-5C-D1` for the
   Ethernet port, `08-5B-D6-94-F1-2E` for Wi-Fi) to a fixed address —
   `192.168.100.10` today. Without this, a lease renewal can move the server's
   IP and every DNS record below goes stale.
2. **Local DNS record** (usually under *DNS* / *Local DNS* / *Custom DNS*):
   add an A record `ecclesia.local → 192.168.100.10`.
3. Save and reboot the router if the UI asks. No client changes needed — every
   device already uses the router as its DNS server.

Router-specific notes:

- Some ISP firmwares (this one identifies as `dev.opt`) name local DNS
  "Static DNS" or "Host Mapping". If truly absent, two fallbacks: (a) flash
  OpenWrt on supported hardware, which gives full dnsmasq control; or
  (b) run a small always-on DNS box (a Raspberry Pi running Pi-hole or dnsmasq
  with `address=/ecclesia.local/192.168.100.10`) and hand out *its* IP as the
  DNS server in the router's DHCP settings.
- `.local` is reserved for mDNS (RFC 6762). Consumer routers generally hand
  out `.local` records fine; if a device's browser refuses, it is an mDNS-only
  resolver — see section C.

### B. Verify (from any LAN device)

1. DNS: `ping ecclesia.local` → replies from `192.168.100.10`.
2. App: open `http://ecclesia.local` → sign-in screen; health endpoint
   `http://ecclesia.local/api/health` returns `"status":"ok"`.
3. Real-time: changes in one browser appear in another (Socket.IO, same port).

### C. Stopgap until router access is available

Nothing installed on the *server* can change how *other* devices resolve
names (their DNS queries go to the router), so per-device setup is the only
client-side interim:

- **Windows / macOS / Linux clients:** add one line to the hosts file
  (`C:\Windows\System32\drivers\etc\hosts`, `/etc/hosts`):
  `192.168.100.10    ecclesia.local`
- **Android:** Chrome does not resolve `.local` via mDNS and there is no hosts
  file without root — use `http://192.168.100.10` directly (the app's server
  connection screen accepts it).
- **iOS/macOS:** resolve mDNS only for names a device advertises; hosts-file
  or router-DNS approach is required for `ecclesia.local`.

### D. Server-side operational notes

- The server is currently on **Wi-Fi with a 24 h DHCP lease**. After the
  reservation is in place, prefer the Ethernet port (cable) for stability and
  update the reservation to the Ethernet MAC above.
- Windows firewall already allows inbound Node.js on Private/Public profiles.
  The **Public** profile rule matters: Wi-Fi networks without a router-
  declared profile fall back to Public.
- The hostname mapping for the server itself lives in the local hosts file
  (`127.0.0.1 ecclesia.local`) and is unrelated to LAN clients.
