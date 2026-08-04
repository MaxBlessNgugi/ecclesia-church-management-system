export type NavigationTab =
  | 'dashboard'
  | 'christian'
  | 'activities'
  | 'sacraments'
  | 'finance'
  | 'ledgers'
  | 'inventory'
  | 'reports'
  | 'hr'
  | 'administration'
  | 'auth';

export type ChristianSubTab = 'add' | 'find' | 'delete';
export type ActivitiesSubTab = 'receive_payment' | 'transfer' | 'billed_items';
export type SacramentsSubTab = 'update_card' | 'record_death';
export type FinanceSubTab = 'make_deposit' | 'creditors' | 'debtors' | 'expenses';

export type LedgersSubTab = 'mgmt' | 'transfer';
export type InventorySubTab = 'inward' | 'sale' | 'stock_take' | 'issue' | 'edit';
export type ReportsSubTab = 'sacraments' | 'contributions' | 'sales' | 'cashiers';
export type HRSubTab = 'directory' | 'onboarding' | 'payroll' | 'leave' | 'recruitment';
export type AdminSubTab = 'rights' | 'users' | 'push_payments' | 'audit';

export interface SacramentData {
  date?: string;
  minister?: string;
  place?: string;
}

export interface ChristianRecord {
  id: string;
  regNo: string;
  nationalId: string;
  baptismalName: string;
  secondName: string;
  sirName: string;
  phone: string;
  diocese: string;
  parish: string;
  localChurch: string;
  scc: string; // Small Christian Community / Jumuiya
  status: 'Active' | 'Transferred' | 'Deceased' | 'Inactive';
  baptism?: SacramentData;
  eucharist?: SacramentData;
  confirmation?: SacramentData;
  marriage?: SacramentData;
}

export interface ContributionRecord {
  id: string;
  christianId: string;
  memberName: string;
  regNo: string;
  categories: string[];
  otherCategory?: string;
  monthlyTracker: { [month: string]: boolean }; // e.g. { JAN: true, FEB: true }
  amountKES: number;
  date: string;
}

export interface TransferRecord {
  id: string;
  christianId: string;
  memberName: string;
  diocese: string;
  parish: string;
  localChurch: string;
  scc: string;
  date: string;
}

export interface BilledItemReceipt {
  id: string;
  christianId?: string;
  memberName: string;
  isWalkIn: boolean;
  category: string;
  item: string;
  unitFee: number;
  quantity: number;
  totalAmount: number;
  date: string;
}

export interface DeathRecord {
  id: string;
  christianId: string;
  memberName: string;
  placeOfDeath: string;
  dateOfDeath: string;
  dateOfBurial: string;
  ministerName: string;
  remarks: string;
}

export interface DepositRecord {
  id: string;
  date: string;
  amount: number;
  bankName: string;
  accountNo: string;
  sourceOfCash: string;
  refNo: string;
  depositedBy: string;
}

export interface CreditorRecord {
  id: string;
  vendor: string;
  description: string;
  invoiceNo: string;
  amountOwed: number;
  dueDate: string;
  status: 'Pending' | 'Overdue' | 'Scheduled' | 'Paid';
}

export interface DebtorRecord {
  id: string;
  memberName: string;
  contributionType: string;
  amount: number;
  status: 'Outstanding' | 'Partially Paid' | 'Paid';
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  voucherNo: string;
}

// ---------- HR ----------

export interface EmployeeRecord {
  id: string;
  code: string;
  name: string;
  role: string;
  phone: string;
  email: string;
  hireDate: string;
}

export interface EmployeeOnboardingInput {
  nationalId: string;
  surname: string;
  firstName: string;
  middleName?: string;
  designation: string;
  hireDate: string;
  email: string;
  phone: string;
  nextOfKinName?: string;
  nextOfKinRelation?: string;
  nextOfKinPhone?: string;
}

// ---------- Inventory ----------

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  cost: number;
  price: number;
  stock: number;
  reorder: number;
}

export interface DeliveryRecord {
  id: string;
  supplier: string;
  inv: string;
  date: string;
  units: number;
  cat: string;
  total: number;
}

export interface SaleRecord {
  id: string;
  item: string;
  time: string;
  amount: number;
}

export interface StockTakeRecord {
  id: string;
  name: string;
  sku: string;
  system: number;
  physical: number;
  notes: string;
}

export interface StockIssueRecord {
  id: string;
  item: string;
  dest: string;
}

// ---------- Ledgers ----------

export interface LedgerRecord {
  id: string;
  name: string;
  code: string;
  type: string;
  cashier: string;
  balance: number;
}

export interface LedgerMovement {
  id: string;
  amount: number;
  time: string;
  from: string;
  to: string;
}

// ---------- Reports ----------

export interface SacramentReportRow {
  name: string;
  dob: string;
  date: string;
  scc: string;
  status: string;
}

export interface ContributionReportRow {
  memberName: string;
  category: string;
  month: string;
  amount: number;
  status: string;
}

export interface SalesReportRow {
  item: string;
  quantity: number;
  amount: number;
  date: string;
}

export interface CashierReportRow {
  cashier: string;
  sessions: number;
  collected: number;
  reconciled: number;
  status: string;
}

// ---------- Administration ----------

export type PanelKey =
  | 'christian'
  | 'activities'
  | 'sacraments'
  | 'finance'
  | 'ledgers'
  | 'inventory'
  | 'reports'
  | 'hr'
  | 'administration';

export interface PanelPermissions {
  panels: Record<PanelKey, boolean>;
  actions: { view: boolean; edit: boolean; delete: boolean };
}

export interface PushPaymentSettings {
  paybill: string;
  accountFormat: string;
  consumerKey: string;
  consumerSecret: string;
  testPhone: string;
  testAmount: string;
}

export type UserRole = 'super_admin' | 'admin' | 'staff' | 'viewer';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  entityName: string;
  entityId: string;
  action: 'DELETE' | 'RESTORE';
  deletedBy: string | null;
  deletedByName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

// ---------- Dashboard ----------

export interface DashboardSummary {
  activeMembers: number;
  totalChristians: number;
  totalDeposits: number;
  totalExpenses: number;
  pendingCreditors: number;
  outstandingDebtors: number;
  lowStockItems: number;
  totalEmployees: number;
  recentDeposits: DepositRecord[];
  recentExpenses: ExpenseRecord[];
}

// ---------- Auth ----------

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: UserRole;
  permissions: PanelPermissions;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}
