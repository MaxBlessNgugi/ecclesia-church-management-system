# ECCLESIA Church Management System (ChMS)
## Status & Capability Report

**Version:** 1.0.0 (production-ready) · **Date:** 10 August 2026
**Prepared by:** Max Bless Ngugi · **Status:** Confidential — for internal review

---

## 1. Executive Summary

ECCLESIA is a complete **parish church management system** that runs as a native
**Windows desktop application** on the parish's own computer. It manages the full
life of a parish: the member register, sacraments, contributions and collections,
finance, inventory, and staff/payroll — all in one program, with **no internet
connection required** and **no monthly subscription**.

**Current status:** Version 1.0.0 is feature-complete and packaged. A ready-to-install
Windows installer (282 MB) was built and verified on 10 August 2026, the app's brand
icon was finalized, and a step-by-step installation guide (`INSTALL.md`) was written
so a non-technical person can put the system on any parish PC. The application is
running and working on this machine as a native desktop window.

**Why it matters:** the parish owns its software and its data outright. Records never
leave the parish office, there are no recurring fees, and a one-click installer
handles setup. This is a commercial-grade product ready for first deployments and
sales demonstrations.

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

1. **100% offline and local-first.** All data lives in a single SQLite database file on
   the parish PC. No cloud, no internet dependency, no third party holding parish data.
2. **No monthly fees.** One-time setup; the parish owns the software outright.
3. **One-click install.** A double-click installer (or `install-parish.cmd`) performs
   the whole setup, including registering the app to **start automatically on boot**.
4. **Role-based security.** Four roles with per-module permissions; forced password
   change on first sign-in; login lockout after 5 failed attempts.
5. **Audit trail and trash.** Every deletion is soft, logged with the actor, and
   restorable — nothing is silently destroyed.
6. **Automatic backups.** The system snapshots the database on a schedule (default
   daily, keeping 14 copies) and can mirror copies to an off-site folder (e.g. a
   cloud-synced drive) for disaster safety.
7. **The parish owns its data.** JSON, CSV, or the raw database file can be exported
   at any time — a genuine "exit path."
8. **Professional branding.** Custom-designed app icon (dark charcoal tile with a
   silver E+Cross monogram and ECCLESIA lettering) applied across the installer,
   desktop shortcut, taskbar, and system tray.

---

## 4. Technical Overview

| Layer | Technology |
|-------|-----------|
| Desktop shell | **Electron 43** — native Windows application (window + system tray, "close to tray" behavior) |
| Frontend | React 19 + Vite + Tailwind CSS |
| Backend | Node.js + Express + Prisma ORM |
| Database | SQLite (single local file — easy to back up and move) |
| Authentication | JWT with login rate-limiting, account lockout, forced first-login password change, admin reset codes |
| Deployment | One Windows PC; optional HTTPS via Caddy for LAN/domain access |

The app serves itself: the desktop shell starts the backend and frontend together as
**one process on one port** (5000), so there is nothing for a parish IT person to
configure. Development mode additionally runs a Vite server for the frontend.

**Installation paths (all documented in `INSTALL.md`):**
- **A — Windows installer (.exe):** copy `release/ECCLESIA-ChMS-Setup-1.0.0.exe` (282 MB) to any
  Windows 10/11 PC and double-click. No Node.js needed. Creates desktop/Start-Menu
  shortcuts; data stored under `%APPDATA%\ECCLESIA\`.
- **B — Portable source folder:** copy the project, install Node.js 18+, run
  `npm run setup` once, then `start-app.cmd` / `npm run dev`.
- **C — One-click parish installer (`install-parish.cmd`):** automated clean database,
  JWT secret generation, build, and **auto-start on boot** (Windows service or
  scheduled task), then opens the app window.

---

## 5. Data & Privacy

- **Storage:** `%APPDATA%\ECCLESIA\ecclesia.db` on the parish PC. Nothing is stored
  in the cloud.
- **Backups:** automatic scheduled snapshots (default daily; keep 14), plus optional
  off-site mirroring to a cloud-synced folder. A backup is a consistent snapshot,
  safe to copy even while the system is running.
- **Exit path:** the parish can export all data (JSON/CSV) or take the raw database
  file at any time — data is never held hostage.
- **Uninstall safety:** the installer deliberately never deletes parish data on
  uninstall; data removal is always an explicit, separate action.

---

## 6. Security

- Strong, randomly generated `JWT_SECRET` enforced in production (the app refuses to
  start with a weak secret).
- Login rate-limiting (10 attempts / 15 min per IP) and account lockout after
  5 failed attempts (15-minute lock).
- Forced password change on first sign-in for the super admin and all new users.
- Single-use, hashed, 30-minute admin reset codes for offline password resets.
- Role-based, per-module permissions (Super Admin, Admin, Staff, Viewer).
- Optional HTTPS via Caddy for LAN or domain access.
- Full audit trail of deletions and price changes (with the acting user).

**Outstanding security item:** the installer is currently **unsigned**, so Windows
SmartScreen shows a "Run anyway" warning on first install. A code-signing certificate
is the recommended next purchase for frictionless distribution.

---

## 7. Current Status

| Item | Status |
|------|--------|
| Core product (v1.0.0, all modules) | ✅ Complete |
| Native desktop app (Electron window, tray) | ✅ Working |
| Brand icon (installer, taskbar, tray) | ✅ Finalized and verified in the built installer |
| Windows installer (`ECCLESIA-ChMS-Setup-1.0.0.exe`, 282 MB) | ✅ Built 10 Aug 2026, verified |
| Installation guide for another PC (`INSTALL.md`) | ✅ Written |
| Auto-start on boot (parish setup) | ✅ Built into `install-parish.cmd` |
| Demo dataset for sales pitches | ✅ Available (30-member realistic parish) |
| Code signing (SmartScreen) | ⏳ Recommended next |
| Auto-update channel | ⏳ Planned (electron-updater) |
| HTTPS in production deployments | ⏳ Available via Caddy, per-deployment |

---

## 8. Next Steps / Roadmap

1. **Code-sign the installer** — removes the SmartScreen warning for clean
   commercial rollout.
2. **Deploy pilot installs** — use `INSTALL.md` Option A/C on 1–2 parish PCs to
   validate in the field.
3. **Add automatic updates** — so installed parishes receive future versions
   without a technician visiting.
4. **Sales readiness** — demo data + script already prepared (`docs/pitch/`); the
   feature sheet and pricing are ready for presentations.

---

## 9. Conclusion

ECCLESIA ChMS is a complete, working, **commercially presentable** parish management
system. Version 1.0.0 is packaged as a verified Windows installer with professional
branding, full documentation, and a one-click deployment path — ready for pilot
installations and sales demonstrations. The only notable gap before wide distribution
is code signing, which is a straightforward next investment.

---

*Private & confidential — prepared for internal review. For technical details see
`docs/OPERATIONS.md` (backups, security, runbook) and `INSTALL.md` (deployment).*
