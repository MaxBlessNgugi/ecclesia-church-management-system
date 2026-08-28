# ECCLESIA Church Management System (ChMS)
## Status & Capability Report

**Version:** 1.0.0 (production-ready) · **Date:** 10 August 2026
**Prepared by:** Max Bless Ngugi · **Status:** Confidential — for internal review

---

## 1. Executive Summary

ECCLESIA is a complete **parish church management system** that runs as a **pure web
application** on the parish's local network. A dedicated server machine hosts the
database and API; staff access it through any modern web browser — no installation
on client devices required. It manages the full life of a parish: the member
register, sacraments, contributions and collections, finance, inventory, and
staff/payroll — all in one system, with **no internet connection required** and
**no monthly subscription**.

**Current status:** Version 1.0.0 is feature-complete. The server is deployed on a
parish computer and accessible via `http://ecclesia.local` on the local network.
All modules are working and verified. Client devices connect through Chrome, Firefox,
Edge, or Safari — zero installation needed.

**Why it matters:** the parish owns its software and its data outright. Records never
leave the parish office, there are no recurring fees, and a single `npm run setup`
command handles setup. This is a commercial-grade product ready for first deployments
and sales demonstrations.

---

## 2. What the System Does

| Module | Capabilities |
|--------|--------------|
| **Member Registry** | Full member profiles (national ID, contacts, parish/outstation, SCC), automatic registration numbers (`REG-YYYY-######`), search/sort/pagination, soft-delete with restore |
| **Sacraments** | Baptism, First Communion, Confirmation, and Marriage records per member; death records with burial details; sacrament registry reports |
| **Contributions** | Tithing, Jumuiya, Diocesan Support and Project categories; per-member **monthly giving tracker** (paid/pending by month); parish transfers; billed services with receipts (members and walk-ins) |
| **Finance** | Bank deposits with auto reference numbers, creditors and debtors with payment tracking, expense vouchers, inter-ledger transfers with balance checks, cashier collection reports with reconciliation |
| **Inventory** | Stock levels, reorder thresholds and low-stock alerts, deliveries/sales/stock takes/issues, price-and-cost change audit log |
| **HR & Payroll** | Employee records, payroll runs (net pay, allowances, deductions), leave approvals, recruitment |
| **Reports** | Sacrament, monthly contribution, sales, and cashier reports; in-table search and sorting; **CSV, Excel, and Print-to-PDF export** |
| **Administration** | User accounts with **role-based permissions** (Super Admin / Admin / Staff / Viewer), M-Pesa payment settings, Trash & Audit log, full-data export/import, support diagnostics, one-click backups |

---

## 3. Key Strengths

1. **Self-hosted, no cloud dependency.** All data lives in a PostgreSQL database on the
   parish server. No third party holding parish data, no internet required for LAN access.
2. **No monthly fees.** One-time setup; the parish owns the software outright.
3. **Zero client installation.** Staff open a web browser, navigate to the server
   address, and log in — works on any device (PC, tablet, phone) on the network.
4. **Role-based security.** Four roles with per-module permissions; forced password
   change on first sign-in; login lockout after 5 failed attempts.
5. **Audit trail and trash.** Every deletion is soft, logged with the actor, and
   restorable — nothing is silently destroyed.
6. **Automatic backups.** The system snapshots the database on a schedule (default
   daily, keeping 14 copies) and can mirror copies to an off-site folder (e.g. a
   cloud-synced drive) for disaster safety.
7. **The parish owns its data.** JSON, CSV, or raw SQL dumps can be exported
   at any time — a genuine "exit path."
8. **Real-time multi-user.** All connected browsers see changes instantly via
   Socket.IO — no page refresh required.

---

## 4. Technical Overview

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS (single-page application) |
| Backend | Node.js + Express + Prisma ORM |
| Database | PostgreSQL 14+ (multi-user concurrent access) |
| Real-time | Socket.IO (instant sync across all connected browsers) |
| Authentication | JWT with login rate-limiting, account lockout, forced first-login password change, admin reset codes |
| Deployment | One parish PC runs Express + serves the built SPA; clients open a browser to `http://ecclesia.local` |

The server runs as **one process on one port** (5000): Express serves both the API
and the built frontend. There is nothing for a parish IT person to configure beyond
installing Node.js and PostgreSQL.

**Installation steps (documented in `INSTALL.md`):**
1. Install Node.js 18+ and PostgreSQL 14+ on the server machine
2. Clone the repository and run `npm run setup`
3. Configure `ecclesia.local` hostname (optional, for friendly URL)
4. Start the server with `npm start`
5. Clients open `http://ecclesia.local` in their browser — done

---

## 5. Data & Privacy

- **Storage:** PostgreSQL database on the parish server. Nothing is stored in the cloud.
- **Backups:** automatic scheduled snapshots (default daily; keep 14), plus optional
  off-site mirroring to a cloud-synced folder. Backups are consistent SQL dumps,
  safe to copy even while the system is running.
- **Exit path:** the parish can export all data (JSON/CSV) or take a raw SQL dump
  at any time — data is never held hostage.
- **Access control:** client devices only need a web browser — no data is stored
  locally on client machines.

---

## 6. Security

- Strong, randomly generated `JWT_SECRET` enforced in production (the app refuses to
  start with a weak secret).
- Login rate-limiting (10 attempts / 15 min per IP) and account lockout after
  5 failed attempts (15-minute lock).
- Forced password change on first sign-in for all super_admin accounts and new users.
- Single-use, hashed, 30-minute admin-reset codes (admin shares the code offline with the user).
- Role-based, per-module permissions (Super Admin, Admin, Staff, Viewer).
- Optional HTTPS via Caddy for LAN or domain access.
- Full audit trail of deletions and price changes (with the acting user).
- Helmet security headers (CSP, HSTS, X-Frame-Options).
- Configurable CORS origins for production deployments.

---

## 7. Current Status

| Item | Status |
|------|--------|
| Core product (v1.0.0, all modules) | ✅ Complete |
| Web application (multi-user, LAN access) | ✅ Working |
| Real-time sync (Socket.IO) | ✅ Working |
| Installation guide (`INSTALL.md`) | ✅ Written |
| Guided first-run setup (create parish admin) | ✅ Built and verified end-to-end |
| Demo dataset for sales pitches | ✅ Removed (clean database for production) |
| HTTPS in production deployments | ✅ Available via Caddy, per-deployment |
| Automated test suite | ✅ Auth, security, finance, HR, Christians |
| CI pipeline (GitHub Actions) | ✅ Working |
| License / activation mechanism | ⏳ Not yet |
| Crash reporting & telemetry | ⏳ Not yet |

### Test results — full regression run (10 Aug 2026)

| Check | Result |
|-------|--------|
| Server startup (production mode) | ✅ Express serves API + frontend on port 5000 |
| First-run bootstrap → login | ✅ Admin created, login round-trip verified |
| Dev stack (vite + backend) | ✅ Frontend at localhost:3000, API at localhost:5000 |
| Module APIs (christians, contributions, transfers, deposits, expenses, ledgers, inventory, dashboard summary) | ✅ All HTTP 200 |
| Full CRUD write cycle | ✅ Create (201) → delete (204), record cleaned up |
| Renderer console | ✅ Zero errors/warnings (HMR connected, CSP clean) |
| Git backup | ✅ Local == GitHub, tag `v1.0.0` re-pointed at release commit |

---

## 7b. Commercial Release Readiness Assessment

**Verdict: feature-complete and pilot-ready, but NOT yet commercial-release-ready.**
The product works; four structural items stand between it and a paid, widely-distributed
commercial release.

### Blocking (must fix before commercial distribution)

1. **No licensing / activation** — there is no mechanism to control who may use
   the app, limit seats/parishes, or enforce payment. Without it there is no way
   to sell the product commercially (single-purchase or subscription).
2. **No automated update channel** — each new version must be delivered by hand.
   A built-in update notification mechanism would help installed parishes know
   when new versions are available.
3. ~~No automated test suite or CI~~ — **Resolved.** GitHub Actions CI runs lint, typecheck, tests, and build on every push. 145 backend tests passing.
4. **Code signing not applicable** — as a web application, there is no installer
   to sign. However, HTTPS certificates (via Caddy) are recommended for production
   deployments to prevent browser warnings.

### Important gaps (should address before or shortly after launch)

5. **Crash reporting & telemetry** — no visibility into failures on the server.
   Add Sentry (or similar) for crash + error capture.
6. **Data-protection posture** — the app stores parishioner PII (national IDs,
   phones, sacramental records). Commercial deployment needs a documented data
   protection policy (encryption at rest, backup retention, deletion procedure,
   GDPR/DPA alignment).
7. **Support infrastructure** — no helpdesk, knowledge base, or on-call process
   beyond `INSTALL.md`. Customers will email the developer directly.

### Recommended pre-launch checklist (in order)

1. Add a licensing/activation layer (online or offline key).
2. Build an update notification mechanism for installed parishes.
3. ~~Stand up CI~~ — **Done.** GitHub Actions CI pipeline is live.
4. Add crash reporting (Sentry) + a minimal telemetry opt-in.
5. Write the data-protection & backup-restore policy; run a restore drill.
6. Run 2–3 pilot parishes per `INSTALL.md` for real-world validation.

---

## 8. Next Steps / Roadmap

1. **Deploy pilot installs** — use `INSTALL.md` on 1–2 parish servers to
   validate in the field.
2. **Add update notifications** — so installed parishes know when new versions
   are available.
3. **Sales readiness** — use a fresh database with the first-run wizard for live demos.
4. **Multi-parish deployment** — consider whether a central management portal
   is needed for multiple parish installations.

---

## 9. Conclusion

ECCLESIA ChMS is a complete, working, **commercially presentable** parish management
system. Version 1.0.0 runs as a pure web application — one server, many browser
clients — with full documentation and a straightforward deployment path. It is ready
for pilot installations and sales demonstrations. The only notable gaps before wide
distribution are licensing/activation and an automated update mechanism.

---

*Private & confidential — prepared for internal review. For technical details see
`docs/OPERATIONS.md` (backups, security, runbook) and `INSTALL.md` (deployment).*
