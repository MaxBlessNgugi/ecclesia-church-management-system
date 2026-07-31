# Ecclesia - Church Management System (Parish ERP)

Ecclesia is a full-featured, enterprise-grade Church Management System (ERP) built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.

---

## 🚀 Quick Start Guide (VS Code IDE)

Follow these simple steps to run this project in **VS Code** with zero friction:

### 1. Prerequisites
Ensure you have **Node.js** (v18 or higher) installed on your system.
- Check version: `node -v`

### 2. Installation
Open VS Code in this project root directory, open the integrated terminal (`Ctrl + ~` or `Cmd + ~`), and run:

```bash
npm install
```

### 3. Start Development Server
Run the local Vite development server:

```bash
npm run dev
```

Open your browser and navigate to: **`http://localhost:3000`** (or the port displayed in your terminal).

---

## 📁 Project Directory Structure

```text
.
├── .vscode/                 # Recommended VS Code editor settings & extensions
│   ├── settings.json        # Auto-format on save, Tailwind CSS configuration
│   └── extensions.json      # Recommended VS Code plugins (Tailwind, ESLint, React Snippets)
├── src/
│   ├── components/          # Reusable UI & Layout Components
│   │   ├── Header.tsx       # Top navigation header with view triggers & quick actions
│   │   ├── Sidebar.tsx      # Main navigation drawer & sub-tab menus
│   │   ├── Footer.tsx       # Sacred footer & system status info
│   │   ├── GlobalSearchModal.tsx # Keyboard-shortcut (Ctrl+K) search modal
│   │   ├── index.ts         # Central export barrel for components
│   │   └── views/           # Modular View Panels (Each tab has its own view)
│   │       ├── DashboardView.tsx   # Overview metrics, charts, & action shortcuts
│   │       ├── ChristianView.tsx   # Christian Directory (Add, Find, Delete)
│   │       ├── ActivitiesView.tsx  # Payments, Transfers, Billed Items
│   │       ├── SacramentsView.tsx  # Baptism, Confirmation, Marriage, Death
│   │       ├── FinanceView.tsx     # Bank Deposits, Creditors, Debtors, Expenses
│   │       ├── LedgersView.tsx     # General Ledgers & Journal Transfers
│   │       ├── InventoryView.tsx   # Stock Vault, Purchases, Sales, Issue
│   │       ├── ReportsView.tsx     # Audit Reports & Exports
│   │       ├── HRView.tsx          # Staff Directory, Payroll, Leave
│   │       ├── AdminView.tsx       # User Rights Centre & Payment Gateways
│   │       ├── AuthView.tsx        # Access Portal & Login
│   │       └── index.ts            # Central export barrel for view modules
│   ├── data/
│   │   └── mockData.ts      # Seed records (Christians, Deposits, Creditors, Expenses)
│   ├── types.ts             # Global TypeScript interfaces, type definitions, and enums
│   ├── App.tsx              # Root application state & router controller
│   ├── main.tsx             # React DOM entry point
│   └── index.css            # Global CSS, Tailwind import, and custom typography
├── index.html               # Main HTML entry point (Loads Google Fonts & Icons)
├── package.json             # NPM dependencies & scripts
├── tsconfig.json            # TypeScript configuration with @/ path alias
├── vite.config.ts           # Vite bundler configuration
├── src/services/api.ts      # Typed frontend API client (maps 1:1 to the REST contract)
├── server/index.js          # Reference Express REST API (in-memory store, mirrors mock data)
└── API.md                   # Full REST API contract for the backend developer
```

---

## 🛠️ How to Extend & Modify the App

### 1. Adding a New View / Tab
1. Open `src/types.ts` and add your tab key to `NavigationTab`:
   ```ts
   export type NavigationTab = 'dashboard' | 'christian' | 'my_new_tab';
   ```
2. Create `src/components/views/MyNewView.tsx`.
3. Export it in `src/components/views/index.ts`:
   ```ts
   export { MyNewView } from './MyNewView';
   ```
4. In `src/App.tsx`, import `MyNewView` from `./components/views` and add a conditional render block:
   ```tsx
   {currentTab === 'my_new_tab' && <MyNewView />}
   ```
5. In `src/components/Header.tsx` and `src/components/Sidebar.tsx`, add the button link for the tab.

### 2. Modifying Data Schemas
- Edit interface definitions in `src/types.ts`.
- Update seed mock data in `src/data/mockData.ts`.

### 3. Path Aliases
You can import modules using the `@/` alias (resolves to `./src/`):
```ts
import { ChristianRecord } from '@/types';
import { Header } from '@/components';
```

---

## ⚡ Useful NPM Scripts

- `npm run dev` — Starts the local dev server.
- `npm run server` — Starts the reference Express API on port 5000 (`/api/health`).
- `npm run build` — Builds production-ready bundle in `dist/`.
- `npm run preview` — Previews production build locally.
- `npm run lint` — Runs TypeScript type-check to ensure zero syntax or type errors.

---

## 🔌 Backend Integration

The frontend currently runs on client-side mock data. The backend contract is ready to implement:

- **Contract**: [`API.md`](API.md) — every endpoint, JSON shape, and status code.
- **Typed client**: [`src/services/api.ts`](src/services/api.ts) — the frontend already has typed functions for every resource; point it at the backend with `VITE_API_BASE_URL`.
- **Reference server**: [`server/index.js`](server/index.js) — a working Express API implementing the full contract with an in-memory store seeded like `src/data/mockData.ts`.

### Run frontend + reference API together

```bash
npm run server   # terminal 1 → API on http://localhost:5000
npm run dev      # terminal 2 → frontend on http://localhost:3000 (proxies /api → :5000)
```

Smoke test: `curl http://localhost:5000/api/health` → `{"status":"ok"}`.

### What the backend developer needs to do

1. Read [`API.md`](API.md) and keep endpoint paths + JSON shapes in sync with [`src/services/api.ts`](src/services/api.ts) and [`src/types.ts`](src/types.ts).
2. Replace the in-memory store in `server/index.js` with a real database (PostgreSQL/MySQL/Mongo) and add real authentication, authorization (rights), and validation.
3. Wire the frontend views to the client functions in `src/services/api.ts` (swap mock state initializers for API calls) and set `VITE_API_BASE_URL`.

---

## 🎨 UI & Design Palette

- **Primary Canvas**: `#f9f9f9` (Off-white sacred canvas)
- **Primary Text**: `#1a1c1c` (Deep dark slate)
- **Accent Dark**: `#1e1e1e` (Charcoal black)
- **Borders & Dividers**: `#e1e3e3` / `#c4c7c7`
- **Typography**: `Source Serif 4` (Headings & Body), `Libre Franklin` (UI elements)
- **Icons**: Material Symbols Outlined & Lucide Icons
