# ECCLESIA ChMS — One-Page Feature Sheet

> **Ecclesia Church Management System** — a complete parish ERP that runs entirely on the parish's own computer. No internet required. No monthly fees. Your data never leaves your office.

---

## The pitch in one line

**A church management system that runs on one parish PC — member registry, sacraments, collections, finance, inventory and staff — with full offline privacy and one-click backups.**

---

## Core benefits

| # | Benefit | Why it matters |
|---|---------|----------------|
| 1 | **100% offline & local-first** | All data lives in a SQLite file on the parish PC — no cloud, no internet dependency, no data hostage |
| 2 | **No monthly subscription** | One-time setup; the parish owns the software outright |
| 3 | **One-click install** | Double-click `install-parish.cmd` on a Windows PC with Node.js — fully automated |
| 4 | **One process, one port** | The app serves itself (frontend + API together); Caddy optional for HTTPS |
| 5 | **Role-based security** | Super Admin, Admin, Staff and Viewer roles with per-module permissions |
| 6 | **Full audit trail + trash** | Every deletion is soft, logged with the actor, and restorable |
| 7 | **One-click backups** | Automatic snapshots + optional off-site mirror to a cloud-synced folder |
| 8 | **Real exports** | CSV, Excel and Print-to-PDF reports for parishes and diocesan auditors |

---

## Feature areas

### 1. Member Registry (Christians)
- Full demographics: national ID, contact, parish/outstation, SCC (Jumuiya)
- Automatic sequential registration numbers (`REG-YYYY-######`)
- Search, sort, pagination; soft-delete with restore from Trash
- Walk-in records supported everywhere

### 2. Sacraments
- Baptism, First Communion, Confirmation, Marriage records per member
- Parishioner death records with burial details
- Dedicated sacrament registry reports by type / church / SCC

### 3. Contributions & Activities
- Tithing, Jumuiya, Diocesan Support, Parish Project categories
- Per-member **monthly giving tracker** (month-by-month Paid/Pending)
- Parish transfers (updates member status + parish details atomically)
- Billed services (mass intentions, memorials) with receipts — member or walk-in

### 4. Finance
- Bank deposits (auto reference numbers), creditors, debtors with payment tracking
- Expense vouchers (auto numbers) across categories
- Inter-ledger transfers with balance checks
- Cashier collection reports with reconciliation

### 5. Inventory
- Items with cost/price, stock levels, reorder thresholds, low-stock alerts
- Deliveries, sales, stock takes, stock issues
- **Price/cost audit history** (every change logged with actor)

### 6. HR & Payroll
- Employee onboarding, payroll runs (net pay, allowances, deductions), leave approvals, recruitment with applicants

### 7. Reports
- Sacrament registry, contribution (monthly), sales, and cashier reports
- In-table search, sorting, date presets, CSV/Excel/PDF export, master print

### 8. Administration
- User accounts + roles, per-user module permissions, rights centre
- Push-payment (M-Pesa) settings panel
- Trash & Audit, full-data export (exit path) and import
- Support diagnostics, backup now

---

## Technical snapshot

- **Frontend:** React 19 + Vite + Tailwind CSS (works in any modern browser)
- **Backend:** Node.js + Express + Prisma ORM
- **Database:** SQLite (single local file — easy to back up, easy to move)
- **Auth:** JWT with login lockout, forced first-login password change, admin reset codes
- **Deployment:** one Windows PC (Node.js LTS); HTTPS via Caddy for LAN/domain use

---

*Private & confidential — Max Bless Ngugi / Ecclesia*
