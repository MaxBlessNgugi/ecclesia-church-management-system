# ECCLESIA — Pre-Release Security & Readiness Audit

**Date:** 2026-09-06 · **Scope:** whole project · **Method:** live probes + full test suite run during the audit

**Verified healthy during this audit:** `npm audit` 0 vulnerabilities (root + backend) · backend 166/166 tests · frontend + backend `tsc --noEmit` clean · `vite build` and backend `tsc` build succeed · Helmet CSP · rate limiters + lockouts · revocable JWTs (tokenVersion) · bcrypt cost 12 · SHA-256-hashed reset codes · encrypted-at-rest M-Pesa/mail credentials, masked in API responses · export/backup secret stripping · Docker non-root + HEALTHCHECK + required POSTGRES_PASSWORD · CI + weekly full-suite workflow · eslint/tsc lint · automatic rotating backups · support-bundle redaction · revocable sessions · SMTP onboarding wizard with verification email.

---

## P1 — Fix before selling (blocks first deployment)

1. **Watchdog for the backend process.** The recurring "tsx watch dies silently / port 5000 empty with no log output" incidents are a runtime liability: a hung process manager that surfaces no error. Production already runs compiled `node dist/index.js` (correct choice), but `npm run dev` must be documented as dev-only in README/INSTALL, and the systemd unit / Windows service should set `Restart=always` with a health-check watchdog. *(Ops)*

2. **Ship a built frontend with the server.** `servingFrontend` is false whenever `dist/index.html` is missing, so a parish that starts only the backend gets an API with no UI. Verify the install-parish scripts run the full `vite build`, and make the backend fail loudly (or log a prominent warning) when the frontend is missing in production. *(Packaging)*

3. **E2E coverage of the money paths.** Only `e2e/tests/visual-tour.spec.ts` exists. Add Playwright specs for login → contribution → ledger movement → payroll approve/pay, plus the forgot-password round-trip. Manual testing does not scale to multi-parish releases. *(QA)*

4. **Finish the OPERATIONS runbook.** `docs/OPERATIONS.md` is missing: incident response (stolen laptop, DB corruption), a documented restore drill (`restore.ts` exists but no scheduled restore test), and a go-live checklist. *(Ops)*

## P2 — Hardening (before the second/third parish)

5. **Testable restore drills.** `npm run restore` is untested in CI. A backup that has never been restored is a hope, not a backup. Add a monthly CI job: seed → backup → restore into a scratch DB → assert row counts. *(Ops/CI)*

6. **Per-route body-size limits.** The global 5 MB JSON limit (needed for base64 logos) also applies to `/api/auth/*`. Cap auth endpoints at 64 KB. *(Hardening)*

7. **Log retention/rotation.** `backend/logs/` (morgan dev logs, mail outbox) grows unbounded; add rotation and exclude the outbox from support bundles if it may contain reset codes. *(Privacy)*

8. **Secret-handling documentation.** Document `docker compose exec` as the only sanctioned path for `admin:reset`, and note that `backend/.env` on the parish PC is the crown jewel (file-permission guidance). *(Ops)*

## P3 — Post-release / nice-to-have

9. Per-user session list + admin force-signout UI (tokenVersion plumbing already exists).
10. Email queue with retry/backoff instead of fire-and-forget sending.
11. Audit-log role/permission changes (currently only deletions are audited).
12. Consider Argon2id alongside bcrypt; Redis-backed rate-limit store only if multi-instance is ever needed.
13. Accessibility pass on the setup wizard and auth screens.

---

## Change-log since the previous audit

- ✅ ~~JWT sessions not revocable~~ → tokenVersion rotation on every credential change, 5 dedicated tests
- ✅ ~~npm vulnerabilities (4)~~ → 0 in both projects (qs override in `backend/package.json` until express/body-parser ship ≥ 6.16.0 — remove it then)
- ✅ ~~SMTP not zero-config~~ → MailSettings singleton + two-step setup wizard + verification email, 6 dedicated tests

**Verdict:** close the four P1 items and this is sellable to the first parish.
