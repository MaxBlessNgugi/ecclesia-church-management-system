# ECCLESIA — Disaster Recovery

**Status:** verified 2026-09-22. The core scenario (total database loss) was executed end-to-end by `backend/scripts/phase2-drill.ts` with result **PASS**. Companion: [BACKUP-AND-RESTORE.md](BACKUP-AND-RESTORE.md).

## 1. Objectives (measured in the Phase-2 drill)

| Metric | Value | Basis |
|---|---|---|
| RPO | up to `BACKUP_INTERVAL_HOURS` (default **24 h**; configurable to 1 h) | scheduler design; a failed backup retries at the next 6 h check |
| RTO | **< 15 minutes** end-to-end (measured core: restore 1.2 s + app boot 2.2 s at drill scale) | operator procedure dominates; assumes local artifact |
| Data fidelity after restore | **byte-equivalent business data** — counts, financial totals, inventory totals, IDs, relationships, config all matched | drill comparison stage |

## 2. Scenario playbook

### S1 — Total database loss (disk failure, corruption, ransomware)
1. Stop ECCLESIA.
2. Provision a clean PostgreSQL database (any name; update `DATABASE_URL` in `backend/.env`).
3. `cd backend && npm run restore -- --file=<artifact> --yes` (verifies checksum + decrypts automatically).
4. Start ECCLESIA. Sign in; check dashboard, registry, finance.
5. Evidence from drill: restored app served health 200, login 200, dashboard 200; baseline == restored on all compared metrics.

### S2 — Stolen/failed server, restored onto a new machine
Same as S1 plus: install prerequisites (Node 18+, PostgreSQL 14+, pg client tools), restore `backend/.env` from the password manager (including `BACKUP_ENCRYPTION_KEY` if artifacts are encrypted), reinstall the Windows service (`npm run service:install`) or systemd unit.

### S3 — Database unavailable at app runtime
- The app's `/api/health` returns 503 with `db: disconnected` (verified in code and by the weekly CI smoke path); writes fail with generic 500s; no data corruption path — transactions roll back.
- Recovery: bring PostgreSQL back; the app recovers on the next request (Prisma reconnects). If the DB was rebuilt from backup, follow S1.

### S4 — Backup failures
- Scheduler logs `Scheduled backup FAILED: <reason>` and retries at the next check; it never records a false success.
- If `BACKUP_DEST_DIR` (off-site mirror) fails, the backup command **fails** even though a local artifact exists — treat as "no off-site copy" and fix the mirror promptly.
- If artifacts fail verification (`sha256 mismatch`), do not restore them; fall back to the newest verified snapshot (`GET /api/admin/diagnostics` shows last-verified time).

### S5 — Encrypted artifacts and a lost key
- Without `BACKUP_ENCRYPTION_KEY`, restore refuses with an explicit error; with the wrong key, GCM rejects decryption.
- There is **no recovery** without the key — this is by design. Mitigation: store the key in a password manager (documented in BACKUP-AND-RESTORE.md §6) in addition to `backend/.env`.

### S6 — Bad migration / failed update
- The documented update runbook should take a manual backup **before** `prisma migrate deploy` (see OPERATIONS.md §2 and DEF-OPS-07). Rollback = restore the pre-migration backup (S1 procedure) into a corrected schema.

## 3. Drill procedure (repeat monthly)

```bash
cd backend
npx tsx scripts/phase2-drill.ts
```
The drill: creates a disposable DB → seeds the deterministic dataset → captures baseline → runs the real backup twice (plaintext + encrypted) → verifies checksum/IV/tamper/wrong-key/truncation → **drops the source DB** → restores the encrypted artifact into a fresh DB → boots the real compiled app → logs in → loads the dashboard → compares baseline vs restored → prints `PHASE-2 DRILL: PASS`. Record the output in `acceptance-evidence/`.

## 4. Standing obligations

1. Keep at least one artifact **off the parish server** (`BACKUP_DEST_DIR` to a cloud-synced folder or removable drive).
2. Monthly: run the drill; verify `GET /api/admin/diagnostics` shows a recent verified backup.
3. After any config change (`BACKUP_*`), run one manual backup and one verification.
4. Guard `backend/.env` (DB password + encryption key) — file-permission discipline.
