# Ecclesia Church Management System — Partner Status Report

**Date:** August 26, 2026  
**Version:** 1.0.0  
**Prepared by:** Development Team

---

## Executive Summary

Ecclesia is a self-hosted, offline-capable Church Management System (ChMS) built for parishes that need a complete digital solution without recurring costs or internet dependency. The system covers member management, sacraments, finances, inventory, HR, and reporting — all running on a single local machine.

**Current state:** The system is fully functional and deployed locally for testing. All core modules are operational with a seeded database containing sample data.

---

## What the System Does

### Core Modules

| Module | Capabilities |
|---|---|
| **Member Registry** | Full member profiles, registration numbers, search, soft-delete, family links |
| **Sacraments** | Baptism, First Communion, Confirmation, Marriage — linked to member records |
| **Activities** | Contributions (member & walk-in), transfers, billed items (receipts) |
| **Finance** | Bank deposits, creditors, debtors, expense vouchers, ledger management |
| **Inventory** | Stock items, deliveries, sales, stock-takes, stock issues, price audit trail |
| **HR & Payroll** | Employee records, payroll runs, leave management, recruitment pipeline |
| **Reports** | Sacrament reports, contribution reports, sales reports, CSV/Excel/PDF export |
| **Admin** | User accounts, role-based permissions, M-Pesa push payments, audit log |
| **Dashboard** | Real-time summary counts and recent activity on the home screen |
| **SMS** | Africa's Talking integration for sending messages to members |
| **Settings** | Parish identity configuration, first-run setup wizard |

### Additional Features

- **Real-time sync** — All connected browsers see updates instantly via WebSocket
- **Offline-capable** — PWA with service worker for areas with unreliable internet
- **No client install** — Works in any modern browser (Chrome, Edge, Firefox, Safari)
- **Audit trail** — Every data change is logged with timestamp and user
- **Role-based access** — Admin, Manager, Staff, Viewer roles with granular permissions
- **Auto backups** — Scheduled database backups with configurable retention

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL 18 |
| ORM | Prisma 5.22 |
| Real-time | Socket.IO 4.8 |
| Auth | JWT + bcrypt |
| Security | Helmet, CORS, rate limiting, Zod validation |
| Testing | Vitest + Supertest (565 tests) |

---

## Current Deployment

### Access

| | |
|---|---|
| **URL** | http://ecclesia.local |
| **Login** | admin@ecclesia.local / Admin@123 |
| **Server** | Local machine, port 80 |

### Infrastructure

- PostgreSQL 18 installed and running
- Database `ecclesia` created and seeded with sample data
- 28 database tables across all modules
- `ecclesia.local` mapped to 127.0.0.1 in hosts file

### Health Status

```
GET /api/health → 200 OK
{
  "status": "ok",
  "db": "connected",
  "uptime": <seconds>
}
```

---

## Security

| Feature | Status |
|---|---|
| JWT authentication | Implemented |
| Password hashing (bcrypt) | Implemented |
| Account lockout (5 failed attempts) | Implemented |
| Rate limiting (5 req/15min login, 200 req/15min API) | Implemented |
| Role-based access control (4 roles) | Implemented |
| Content Security Policy (CSP) | Implemented |
| CORS configuration | Implemented |
| Audit logging | Implemented |
| Helmet security headers | Implemented |

---

## Test Coverage

- **565 tests** across 11 test suites
- All tests passing
- Covers: auth, members, activities, finance, inventory, HR, admin, reports, settings, dashboard, security

---

## Known Limitations

| Area | Status |
|---|---|
| Licensing / activation | Not yet implemented |
| Auto-update mechanism | Not yet implemented |
| CI/CD pipeline | Not yet configured |
| Multi-parish support | Planned for future |
| Mobile app | Not yet planned |
| Crash reporting | Not yet implemented |
| Data encryption at rest | Not yet implemented |

---

## What You Need to Run It

### Minimum Hardware

- Any modern PC (Windows 10+, macOS, or Linux)
- 4 GB RAM (8 GB recommended)
- 10 GB disk space

### Software Requirements

- Node.js 18+
- PostgreSQL 14+
- Modern web browser

### Installation

```bash
git clone <repo-url>
cd ecclesia-church-management-system
npm install
cd backend && npm install && cd ..
npm run build
npx prisma db push
npx prisma db seed
npm start
```

The server starts on port 80 and serves both the API and the frontend from a single process.

---

## Next Steps

1. **Pilot deployment** — Install on a parish PC and test with real data
2. **Partner feedback** — Collect usability feedback from parish staff
3. **Licensing system** — Implement activation keys for commercial release
4. **Auto-updates** — Enable seamless updates for installed parishes
5. **CI/CD** — Automate testing and deployment pipeline

---

## Contact

For questions or to schedule a demo, contact the development team.

**Ecclesia ChMS** — Built for parishes, by people who understand parish life.
