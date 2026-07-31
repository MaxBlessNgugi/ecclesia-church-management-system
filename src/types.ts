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
export type AdminSubTab = 'rights' | 'push_payments';

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
