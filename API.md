# Ecclesia REST API Contract

Single source of truth for the backend. The frontend client in
[`src/services/api.ts`](src/services/api.ts) maps 1:1 to these endpoints, and the
[reference implementation](server/index.js) implements them.

## Base URL

- Development (with `npm run dev` running the Vite dev server, which proxies `/api` → `localhost:5000`):
  `http://localhost:3000/api`
- Standalone API server (`npm run server`): `http://localhost:5000/api`
- Override the frontend base URL with the `VITE_API_BASE_URL` env var (see `.env.example`).

## Conventions

- Requests and responses are JSON (`Content-Type: application/json`).
- All mutation endpoints return the created/updated resource (201 for create, 200 for update).
- `DELETE` returns `204 No Content`.
- Errors follow this shape:

```json
{ "error": "human readable message" }
```

- IDs are server-generated strings (`uuid`). Clients send an optional `id` on create.
- Authentication (optional for now): send `Authorization: Bearer <token>`.
  The reference server accepts any token; a real backend should verify it.
- List endpoints support optional query params where noted, e.g. `GET /api/christians?status=Active&q=Maria`.

## Resources

### Auth
| Method | Path                  | Body / Notes                                            |
| ------ | --------------------- | ------------------------------------------------------- |
| POST   | `/api/auth/login`     | `{ email, password }` → `{ token, user }`               |
| POST   | `/api/auth/register`  | `{ email, password, name, role }` → `{ token, user }`   |
| GET    | `/api/auth/me`        | → `{ id, name, email, role }`                           |

`user` shape: `{ id, name, email, role }`. `token` is a string.

### Christians (member registry)
| Method | Path                            | Notes                                                        |
| ------ | ------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/christians`               | Query: `status` (`Active`/`Transferred`/`Deceased`/`Inactive`), `q` (search regNo / name / nationalId / SCC) |
| GET    | `/api/christians/:id`           |                                                              |
| POST   | `/api/christians`               | Body: `ChristianRecord` (without `id`)                       |
| PUT    | `/api/christians/:id`           | Full/partial update                                          |
| PATCH  | `/api/christians/:id/sacraments`| Update only `baptism`/`eucharist`/`confirmation`/`marriage`  |
| DELETE | `/api/christians/:id`           | Soft-delete → sets `status: "Inactive"`                      |

`ChristianRecord`:

```json
{
  "id": "c1",
  "regNo": "REG-2026-001042",
  "nationalId": "12345678",
  "baptismalName": "Maria",
  "secondName": "Magdalene",
  "sirName": "Smith",
  "phone": "+254 700 000 000",
  "diocese": "Archdiocese of Nairobi",
  "parish": "St. Mary's Parish",
  "localChurch": "Our Lady of Sorrows",
  "scc": "St. Jude",
  "status": "Active",
  "baptism":  { "date": "2010-04-15", "minister": "Rev. Fr. Joseph", "place": "St. Mary's Parish" },
  "eucharist":   { "date": "2012-05-20", "minister": "Rev. Fr. Thomas", "place": "St. Mary's Parish" },
  "confirmation":{ "date": "2016-10-12", "minister": "His Lordship Bishop Paul", "place": "Cathedral of St. Peter" },
  "marriage":    { "date": "", "minister": "", "place": "" }
}
```

`status`: `"Active" | "Transferred" | "Deceased" | "Inactive"`. Sacrament sub-objects are `SacramentData = { date?, minister?, place? }`.

### Activities
| Method | Path                   | Notes                                    |
| ------ | ---------------------- | ---------------------------------------- |
| GET    | `/api/contributions`   | Contribution / payment records           |
| POST   | `/api/contributions`   | `ContributionRecord` (without `id`)      |
| GET    | `/api/transfers`       | Parish transfer records                  |
| POST   | `/api/transfers`       | `TransferRecord` (without `id`)          |
| GET    | `/api/billed-items`    | Billed-item receipts (walk-in + members) |
| POST   | `/api/billed-items`    | `BilledItemReceipt` (without `id`)       |

```json
{
  "id": "con1",
  "christianId": "c1",
  "memberName": "Maria Magdalene Smith",
  "regNo": "REG-2026-001042",
  "categories": ["10% Tithing"],
  "monthlyTracker": { "JAN": true, "FEB": true, "MAR": true, "APR": false, "MAY": true, "JUN": false },
  "amountKES": 1500,
  "date": "2026-07-15"
}
```

```json
{
  "id": "b1",
  "christianId": "c5",
  "memberName": "Cecilia Vance",
  "isWalkIn": false,
  "category": "Certificates",
  "item": "Baptismal Certificate",
  "unitFee": 200,
  "quantity": 1,
  "totalAmount": 200,
  "date": "2026-07-10"
}
```

`TransferRecord`: `{ id, christianId, memberName, diocese, parish, localChurch, scc, date }`.

### Sacraments / Death records
| Method | Path           | Notes                              |
| ------ | -------------- | ---------------------------------- |
| GET    | `/api/deaths`  |                                    |
| POST   | `/api/deaths`  | `DeathRecord` (without `id`)       |

`DeathRecord`: `{ id, christianId, memberName, placeOfDeath, dateOfDeath, dateOfBurial, ministerName, remarks }`.

### Finance
| Method | Path                        | Notes                                    |
| ------ | --------------------------- | ---------------------------------------- |
| GET    | `/api/deposits`             |                                          |
| POST   | `/api/deposits`             | `DepositRecord` (without `id`)           |
| GET    | `/api/creditors`            |                                          |
| POST   | `/api/creditors`            | `CreditorRecord` (without `id`)          |
| PUT    | `/api/creditors/:id`        |                                          |
| PATCH  | `/api/creditors/:id/paid`   | Marks creditor `status: "Paid"`          |
| GET    | `/api/debtors`              |                                          |
| POST   | `/api/debtors`              | `DebtorRecord` (without `id`)            |
| POST   | `/api/debtors/:id/payments` | `{ amountPaid }` — reduces balance, updates status |
| GET    | `/api/expenses`             |                                          |
| POST   | `/api/expenses`             | `ExpenseRecord` (without `id`)           |

```json
{
  "id": "dep1",
  "date": "2024-05-18",
  "amount": 3450,
  "bankName": "St. Jude's Mercantile",
  "accountNo": "ac-9081",
  "sourceOfCash": "Weekly Mass Offerings",
  "refNo": "DEP-88391",
  "depositedBy": "Fr. Thomas"
}
```

`CreditorRecord`: `{ id, vendor, description, invoiceNo, amountOwed, dueDate, status }`,
status: `"Pending" | "Overdue" | "Scheduled" | "Paid"`.

`DebtorRecord`: `{ id, memberName, contributionType, amount, status }`,
status: `"Outstanding" | "Partially Paid" | "Paid"`.

`ExpenseRecord`: `{ id, date, category, description, amount, paymentMethod, voucherNo }`.

### Ledgers
| Method | Path                     | Notes                                            |
| ------ | ------------------------ | ------------------------------------------------ |
| GET    | `/api/ledgers`           |                                                  |
| POST   | `/api/ledgers`           | `LedgerRecord` (without `id`)                    |
| GET    | `/api/ledgers/movements` |                                                  |
| POST   | `/api/ledgers/transfer`  | `{ fromLedgerId, toLedgerId, amount, notes? }` → `LedgerMovement`; returns 422 on insufficient balance |

`LedgerRecord`: `{ id, name, code, type, cashier, balance }`.
`LedgerMovement`: `{ id, amount, time, from, to, notes? }`.

### Inventory
| Method | Path                               | Notes                                        |
| ------ | ---------------------------------- | -------------------------------------------- |
| GET    | `/api/inventory/items`             |                                              |
| POST   | `/api/inventory/items`             | `InventoryItem` (without `id`)               |
| PUT    | `/api/inventory/items/:id`         |                                              |
| DELETE | `/api/inventory/items/:id`         |                                              |
| GET    | `/api/inventory/deliveries`        | Goods-inward records                         |
| POST   | `/api/inventory/deliveries`        | `DeliveryRecord` (without `id`)              |
| GET    | `/api/inventory/sales`             |                                              |
| POST   | `/api/inventory/sales`             | `SaleRecord` (without `id`)                  |
| GET    | `/api/inventory/stock-takes`       |                                              |
| POST   | `/api/inventory/stock-takes`       | `StockTakeRecord` (without `id`)             |
| PATCH  | `/api/inventory/stock-takes/:id/physical` | `{ physical }`                         |
| GET    | `/api/inventory/issues`            | Stock issues / internal transfers            |
| POST   | `/api/inventory/issues`            | `StockIssueRecord` (without `id`)            |

```json
{
  "id": "1",
  "name": "Altar Wine (Reserve Premium)",
  "sku": "LIT-044",
  "category": "Liturgical Supplies",
  "cost": 12.5,
  "price": 18,
  "stock": 42,
  "reorder": 24
}
```

`DeliveryRecord`: `{ id, supplier, inv, date, units, cat, total }`.
`SaleRecord`: `{ id, item, time, amount }`.
`StockTakeRecord`: `{ id, name, sku, system, physical, notes }`.
`StockIssueRecord`: `{ id, item, dest }`.

### HR
| Method | Path                 | Notes                                       |
| ------ | -------------------- | ------------------------------------------- |
| GET    | `/api/hr/employees`  |                                             |
| POST   | `/api/hr/employees`  | Body: `EmployeeOnboardingInput` → `EmployeeRecord` (server derives `code`, `name`) |
| PUT    | `/api/hr/employees/:id` |                                          |

`EmployeeRecord`: `{ id, code, name, role, phone, email, hireDate }`.
`EmployeeOnboardingInput`: `{ nationalId, surname, firstName, middleName?, designation, hireDate, email, phone, nextOfKinName?, nextOfKinRelation?, nextOfKinPhone? }`.

### Administration
| Method | Path                         | Notes                        |
| ------ | ---------------------------- | ---------------------------- |
| GET    | `/api/admin/rights`          | `PanelPermissions`           |
| PUT    | `/api/admin/rights`          | Update panel + action rights |
| GET    | `/api/admin/push-payments`   | `PushPaymentSettings`        |
| PUT    | `/api/admin/push-payments`   | Update M-Pesa / push settings |

```json
{
  "panels": { "christian": true, "activities": true, "sacraments": true, "finance": false,
              "ledgers": false, "inventory": true, "reports": true, "hr": false, "administration": true },
  "actions": { "view": true, "edit": true, "delete": false }
}
```

`PushPaymentSettings`: `{ paybill, accountFormat, consumerKey, consumerSecret, testPhone, testAmount }`.

### Reports
| Method | Path                      | Notes                                             |
| ------ | ------------------------- | ------------------------------------------------- |
| GET    | `/api/reports/sacraments` | Query: `sacramentType`, `localChurch`, `scc`      |
| GET    | `/api/reports/contributions` | Query: `category`, `month`                      |
| GET    | `/api/reports/sales`      | Query: `item`, `date`                             |
| GET    | `/api/reports/cashiers`   |                                                   |

Row shapes: `SacramentReportRow { name, dob, date, scc, status }`,
`ContributionReportRow { memberName, category, month, amount, status }`,
`SalesReportRow { item, quantity, amount, date }`,
`CashierReportRow { cashier, sessions, collected, reconciled, status }`.

### Dashboard
| Method | Path                 | Notes                              |
| ------ | -------------------- | ---------------------------------- |
| GET    | `/api/dashboard/summary` | `DashboardSummary` KPIs + recent deposits/expenses |

```json
{
  "activeMembers": 7,
  "totalChristians": 8,
  "totalDeposits": 3450,
  "totalExpenses": 450,
  "pendingCreditors": 3,
  "outstandingDebtors": 3,
  "lowStockItems": 2,
  "totalEmployees": 5,
  "recentDeposits": [],
  "recentExpenses": []
}
```

### Health
| Method | Path           | Notes                          |
| ------ | -------------- | ------------------------------ |
| GET    | `/api/health`  | `{ status: "ok", time }`       |

## TypeScript source of truth

All types are defined in [`src/types.ts`](src/types.ts). The frontend client
[`src/services/api.ts`](src/services/api.ts) is the reference for request/response usage.
