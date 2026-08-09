// =============================================================================
// Barrel export for panel views — one import per panel in App.tsx.
// =============================================================================
// Re-exports every view component so App.tsx (and other consumers) can import
// them from a single path ('./components/views') instead of reaching into
// individual files. Each export corresponds to one top-level panel in the
// sidebar navigation of the church management system.
// =============================================================================

// DashboardView — the home/landing panel with overview KPIs and quick actions
export { DashboardView } from './DashboardView';

// ChristianView — the parishioner directory: CRUD, search, and member detail cards
export { ChristianView } from './ChristianView';

// ActivitiesView — contributions (tithes), parish transfers, and billed item receipts
export { ActivitiesView } from './ActivitiesView';

// SacramentsView — sacrament register (Baptism/Eucharist/Confirmation/Marriage)
// and memorial death-record entry
export { SacramentsView } from './SacramentsView';

// FinanceView — banking operations: deposits, expenses, creditors, and debtors
export { FinanceView } from './FinanceView';

// LedgersView — general ledger management: create ledgers, assign cashiers,
// and execute inter-ledger fund transfers
export { LedgersView } from './LedgersView';

// InventoryView — inventory management: goods inward, sales, stock takes,
// stock issues, and item editing
export { InventoryView } from './InventoryView';

// ReportsView — reporting panel: sacrament reports, contribution reports,
// sales reports, and cashier collection reports with CSV/Excel/PDF export
export { ReportsView } from './ReportsView';

// HRView — human resources: employee directory, payroll, and HR management
export { HRView } from './HRView';

// AdminView — system access management: user accounts, role permissions,
// M-Pesa gateway config, and trash/audit log
export { AdminView } from './AdminView';

// AuthView — authentication screens: login, registration, and password reset
export { AuthView } from './AuthView';
