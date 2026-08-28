# Ecclesia CMS — Status Report

**Version:** 1.0.0 | **Date:** August 26, 2026

---

## What Is It?

A complete Church Management System that runs on a single computer — no internet, no monthly fees, no per-user charges. Staff access it through a web browser like any website.

---

## What It Does

| Area | What You Can Do |
|---|---|
| **Members** | Register members, track sacraments (baptism, communion, confirmation, marriage), manage families |
| **Money** | Record contributions, manage expenses, track creditors/debtors, bank deposits, financial ledgers |
| **Inventory** | Track stock, deliveries, sales, stock-takes, price changes |
| **Staff** | Employee records, payroll, leave management, recruitment |
| **Reports** | Generate reports on any module, export to Excel/PDF |
| **SMS** | Send messages to members via Africa's Talking |
| **Users & Security** | Role-based access (Admin/Manager/Staff/Viewer), audit trail, login protection |

---

## How to Access It

- **URL:** http://ecclesia.local
- **Login:** admin@ecclesia.local
- **Password:** Admin@123

---

## Current Status

| Item | Status |
|---|---|
| All core modules | Working |
| Database | Seeded with sample data |
| Tests | 565 passing |
| Real-time sync | Working (WebSocket) |
| Security | JWT auth, rate limiting, audit trail, RBAC |

---

## What You Need to Run It

- Any PC with Windows 10+, macOS, or Linux
- A web browser (Chrome, Edge, Firefox)
- Node.js and PostgreSQL installed

No special hardware. No cloud hosting. Runs entirely on your local network.

---

## What's Not Done Yet

- Licensing/activation system
- Automatic updates
- Multi-parish support
- Mobile app

---

## Bottom Line

The system is built and functional. It's ready for a pilot test at a parish to validate workflows with real data before commercial release.
