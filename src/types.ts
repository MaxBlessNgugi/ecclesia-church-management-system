// =============================================================================
// Ecclesia CMS — Shared Frontend Domain Types
// =============================================================================
//
// PURPOSE
//   Single source of truth for all payload shapes crossing the API boundary.
//   These interfaces mirror the backend Zod schemas and Prisma models 1:1.
//   If a backend field changes, update the matching interface HERE.
//   Field names are kept IDENTICAL to JSON API responses so the service layer
//   (src/services/api.ts) needs NO remapping — request/response bodies are
//   already correctly typed.
//
// CONVENTIONS
//   - *SubTab unions        → Drive which form/table renders inside each panel
//   - *Record interfaces    → What list views receive and render (table rows)
//   - *CreateInput types    → POST payloads (omit id, createdAt, computed fields)
//   - *UpdateInput types    → PUT/PATCH payloads (all fields optional)
//   - JSON-ish backend columns (sacraments, monthlyTracker, permissions)
//     are ALREADY parsed into plain objects/arrays by the API layer.
//
// MODULE MAP (NavigationTab → View Component → SubTab Union)
//   ┌────────────────┬──────────────────┬──────────────────────────────────────┐
//   │ NavigationTab  │ View Component   │ SubTab Union                         │
//   ├────────────────┼──────────────────┼──────────────────────────────────────┤
//   │ 'dashboard'    │ DashboardView    │ (none — summary cards + quick links) │
//   │ 'christian'    │ ChristianView    │ ChristianSubTab: 'add'|'find'|'del'  │
//   │ 'activities'   │ ActivitiesView   │ ActivitiesSubTab: payment|transfer|  │
//   │                │                  │   billed_items                       │
//   │ 'sacraments'   │ SacramentsView   │ SacramentsSubTab: 'update_card'|     │
//   │                │                  │   'record_death'                     │
//   │ 'finance'      │ FinanceView      │ FinanceSubTab: deposit|creditors|    │
//   │                │                  │   debtors|expenses                   │
//   │ 'ledgers'      │ LedgersView      │ LedgersSubTab: 'mgmt'|'transfer'     │
//   │ 'inventory'    │ InventoryView    │ InventorySubTab: inward|sale|        │
//   │                │                  │   stock_take|issue|edit              │
//   │ 'reports'      │ ReportsView      │ ReportsSubTab: sacraments|contrib|   │
//   │                │                  │   sales|cashiers                     │
//   │ 'hr'           │ HRView           │ HRSubTab: directory|onboarding|      │
//   │                │                  │   payroll|leave|recruitment          │
//   │ 'administration'│ AdminView       │ AdminSubTab: rights|users|push_pay|  │
//   │                │                  │   audit                              │
//   │ 'auth'         │ AuthView         │ (none — login/password reset)        │
//   └────────────────┴──────────────────┴──────────────────────────────────────┘
//
// DATA FLOW: BACKEND → FRONTEND
//   1. Prisma model (snake_case) → Zod schema → JSON response (camelCase)
//   2. api.ts request<T>() parses JSON, returns typed T
//   3. View receives T[] or T, renders via *Record interface
//   4. Mutations send *CreateInput/*UpdateInput, receive updated *Record
//
// RELATED FILES
//   - backend/prisma/schema.prisma  → Source of truth for DB columns
//   - backend/src/routes/*.ts       → Zod validation schemas (match these)
//   - src/services/api.ts           → Typed fetch wrappers (consumes these)
//   - src/components/views/*.tsx    → Components rendering these shapes
// =============================================================================

/**
 * Union of all top-level navigation panel identifiers.
 * Each value maps to a view component and (optionally) a sub-tab union.
 * Used by App.tsx to determine which view to render and by Sidebar/Header for navigation.
 */
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

/**
 * Sub-tab identifiers for the Christian (Parish Registry) panel.
 * - 'add': Form to register a new parishioner
 * - 'find': Search/browse existing parishioner records
 * - 'delete': Soft-delete a parishioner record
 */
export type ChristianSubTab = 'add' | 'find' | 'delete';

/**
 * Sub-tab identifiers for the Activities panel.
 * - 'receive_payment': Log a contribution/payment from a parishioner
 * - 'transfer': Transfer a parishioner to another parish
 * - 'billed_items': Issue receipts for billable items (funeral, etc.)
 */
export type ActivitiesSubTab = 'receive_payment' | 'transfer' | 'billed_items';

/**
 * Sub-tab identifiers for the Sacraments panel.
 * - 'update_card': Update a member's sacramental records (Baptism, Confirmation, Matrimony, Eucharist)
 * - 'record_death': Record the death of a parishioner
 */
export type SacramentsSubTab = 'update_card' | 'record_death';

/**
 * Sub-tab identifiers for the Finance panel.
 * - 'make_deposit': Record a new bank/cash deposit
 * - 'creditors': Manage parish vendor payables (creditors)
 * - 'debtors': Manage member receivables (debtors)
 * - 'expenses': Record operating expenses
 */
export type FinanceSubTab = 'make_deposit' | 'creditors' | 'debtors' | 'expenses';

/**
 * Sub-tab identifiers for the Ledgers panel.
 * - 'mgmt': View and manage ledger accounts
 * - 'transfer': Transfer funds between ledger accounts
 */
export type LedgersSubTab = 'mgmt' | 'transfer';

/**
 * Sub-tab identifiers for the Inventory panel.
 * - 'inward': Record stock deliveries/inward movement
 * - 'sale': Record a sale transaction
 * - 'stock_take': Perform a physical stock count reconciliation
 * - 'issue': Issue/dispense stock items
 * - 'edit': Edit inventory item details
 */
export type InventorySubTab = 'inward' | 'sale' | 'stock_take' | 'issue' | 'edit';

/**
 * Sub-tab identifiers for the Reports panel.
 * - 'sacraments': Sacrament-related reports
 * - 'contributions': Contribution/payment reports
 * - 'sales': Sales and inventory reports
 * - 'cashiers': Cashier session and reconciliation reports
 */
export type ReportsSubTab = 'sacraments' | 'contributions' | 'sales' | 'cashiers';

/**
 * Sub-tab identifiers for the HR panel.
 * - 'directory': Employee directory listing
 * - 'onboarding': New employee onboarding forms
 * - 'payroll': Payroll management and payslips
 * - 'leave': Leave request management
 * - 'recruitment': Job posting and applicant tracking
 */
export type HRSubTab = 'directory' | 'onboarding' | 'payroll' | 'leave' | 'recruitment';

/**
 * Sub-tab identifiers for the Administration panel.
 * - 'rights': Permission rights centre (panel/action access control)
 * - 'users': User account management
 * - 'push_payments': M-Pesa push payment configuration
 * - 'audit': Soft-delete audit trail and trash
 */
export type AdminSubTab = 'rights' | 'users' | 'push_payments' | 'audit';

/**
 * Represents sacramental data for a single sacrament (Baptism, Confirmation, etc.).
 * Each sacrament on a ChristianRecord stores one of these as an optional nested object.
 */
export interface SacramentData {
  /** ISO date string (YYYY-MM-DD) when the sacrament was administered. */
  date?: string;
  /** Name of the minister/priest who administered the sacrament. */
  minister?: string;
  /** Location/church where the sacrament was administered. */
  place?: string;
}

/**
 * Core parishioner record — the central entity of the church management system.
 * Mirrors the backend Prisma Christian model. All fields are read from the API;
 * mutations use Partial<ChristianRecord> for updates.
 */
export interface ChristianRecord {
  /** Unique identifier (UUID) assigned by the backend on creation. */
  id: string;
  /** Parish registration number (human-readable, e.g. "REG-001"). */
  regNo: string;
  /** National ID / passport number for official identification. */
  nationalId: string;
  /** Baptismal name (first name given at baptism). */
  baptismalName: string;
  /** Second/middle name. */
  secondName: string;
  /** Sir name (surname / family name). */
  sirName: string;
  /** Contact phone number (E.164 or local format). */
  phone: string;
  /** Diocese the parishioner belongs to. */
  diocese: string;
  /** Parish the parishioner is registered in. */
  parish: string;
  /** Local church (outstation) within the parish. */
  localChurch: string;
  /** Small Christian Community / Jumuiya grouping. */
  scc: string;
  /** Membership status: 'Active' | 'Transferred' | 'Deceased' | 'Inactive'. */
  status: 'Active' | 'Transferred' | 'Deceased' | 'Inactive';
  /** Baptism sacramental record (optional if not yet baptized). */
  baptism?: SacramentData;
  /** Eucharist sacramental record (optional if not yet received). */
  eucharist?: SacramentData;
  /** Confirmation sacramental record (optional if not yet confirmed). */
  confirmation?: SacramentData;
  /** Holy Matrimony sacramental record (optional if not married in church). */
  marriage?: SacramentData;
}

/**
 * Contribution/payment record — logs a parishioner's financial contribution.
 * Used by the Activities panel to track tithes, offerings, and other contributions.
 */
export interface ContributionRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the contributing Christian's ID. */
  christianId: string;
  /** Full name of the contributing member (denormalized for display). */
  memberName: string;
  /** Registration number of the contributing member (denormalized for display). */
  regNo: string;
  /** List of contribution categories (e.g. ['Tithe', 'Building Fund']). */
  categories: string[];
  /** Free-text category if 'Other' was selected. */
  otherCategory?: string;
  /** Monthly tracking map: month abbreviation → whether contribution was made for that month. */
  monthlyTracker: { [month: string]: boolean }; // e.g. { JAN: true, FEB: true }
  /** Total contribution amount in Kenyan Shillings (KES). */
  amountKES: number;
  /** ISO date string (YYYY-MM-DD) when the contribution was recorded. */
  date: string;
}

/**
 * Parish transfer record — logs when a member is transferred to another parish.
 * Created when a member's parish affiliation changes.
 */
export interface TransferRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the transferring Christian's ID. */
  christianId: string;
  /** Full name of the transferring member (denormalized for display). */
  memberName: string;
  /** Destination diocese name. */
  diocese: string;
  /** Destination parish name. */
  parish: string;
  /** Destination local church name. */
  localChurch: string;
  /** Destination Small Christian Community name. */
  scc: string;
  /** ISO date string (YYYY-MM-DD) when the transfer was recorded. */
  date: string;
}

/**
 * Billed item receipt — logs a billable transaction (funeral services, hall rental, etc.).
 * Can be issued to a registered member or a walk-in customer.
 */
export interface BilledItemReceipt {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the Christian's ID (undefined for walk-in customers). */
  christianId?: string;
  /** Full name of the customer (member or walk-in). */
  memberName: string;
  /** Whether the customer is a walk-in (not a registered parishioner). */
  isWalkIn: boolean;
  /** Category of the billed item (e.g. 'Funeral', 'Hall Rental'). */
  category: string;
  /** Specific item description. */
  item: string;
  /** Unit fee in KES for a single item. */
  unitFee: number;
  /** Quantity of items billed. */
  quantity: number;
  /** Total amount in KES (unitFee × quantity). */
  totalAmount: number;
  /** ISO date string (YYYY-MM-DD) when the receipt was issued. */
  date: string;
}

/**
 * Death record — logs the death of a parishioner.
 * Created by the Sacraments panel when a member passes away.
 * Automatically updates the associated ChristianRecord status to 'Deceased'.
 */
export interface DeathRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the deceased Christian's ID. */
  christianId: string;
  /** Full name of the deceased member (denormalized for display). */
  memberName: string;
  /** Location where the death occurred. */
  placeOfDeath: string;
  /** ISO date string (YYYY-MM-DD) of the death. */
  dateOfDeath: string;
  /** ISO date string (YYYY-MM-DD) of the burial. */
  dateOfBurial: string;
  /** Name of the minister who conducted the burial rites. */
  ministerName: string;
  /** Additional remarks or notes about the death/burial. */
  remarks: string;
}

/**
 * Deposit record — logs a bank or cash deposit into the church treasury.
 * Used by the Finance panel to track all incoming funds.
 */
export interface DepositRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** ISO date string (YYYY-MM-DD) when the deposit was made. */
  date: string;
  /** Deposit amount in KES. */
  amount: number;
  /** Name of the receiving bank. */
  bankName: string;
  /** Bank account number. */
  accountNo: string;
  /** Description of where the cash came from (e.g. 'Sunday Collection', 'Tithe'). */
  sourceOfCash: string;
  /** Transaction reference number (bank slip number, M-Pesa code, etc.). */
  refNo: string;
  /** Name of the person who made the deposit. */
  depositedBy: string;
}

/**
 * Creditor record — logs a vendor payable / obligation the church owes.
 * Used by the Finance panel to track outstanding bills and vendor payments.
 */
export interface CreditorRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Name of the vendor or service provider. */
  vendor: string;
  /** Description of the goods or services purchased. */
  description: string;
  /** Vendor invoice reference number. */
  invoiceNo: string;
  /** Amount owed in KES. */
  amountOwed: number;
  /** ISO date string (YYYY-MM-DD) when the payment is due. */
  dueDate: string;
  /** Payment status: 'Pending' | 'Overdue' | 'Scheduled' | 'Paid'. */
  status: 'Pending' | 'Overdue' | 'Scheduled' | 'Paid';
}

/**
 * Debtor record — logs a member receivable / amount owed to the church.
 * Used by the Finance panel to track outstanding member balances.
 */
export interface DebtorRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Full name of the debtor (denormalized for display). */
  memberName: string;
  /** Type of contribution or obligation the debt relates to. */
  contributionType: string;
  /** Outstanding amount in KES. */
  amount: number;
  /** Amount already paid toward this debtor (cumulative). */
  amountPaid: number;
  /** Payment status: 'Outstanding' | 'Partially Paid' | 'Paid'. */
  status: 'Outstanding' | 'Partially Paid' | 'Paid';
}

/**
 * Expense record — logs an operating expense incurred by the church.
 * Used by the Finance panel to track all outgoing funds.
 */
export interface ExpenseRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** ISO date string (YYYY-MM-DD) when the expense was incurred. */
  date: string;
  /** Expense category (e.g. 'Utilities', 'Maintenance', 'Salaries'). */
  category: string;
  /** Description of the expense. */
  description: string;
  /** Expense amount in KES. */
  amount: number;
  /** Payment method used (e.g. 'Cash', 'Bank Transfer', 'M-Pesa'). */
  paymentMethod: string;
  /** Voucher or receipt reference number. */
  voucherNo: string;
}

// ---------- HR ----------

/**
 * Employee record — represents a staff member in the HR directory.
 * Used by the HR panel for directory, payroll, and leave management.
 */
export interface EmployeeRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Employee code / staff number (human-readable, e.g. "EMP-001"). */
  code: string;
  /** Full name of the employee. */
  name: string;
  /** Job title or role designation. */
  role: string;
  /** Contact phone number. */
  phone: string;
  /** Work email address. */
  email: string;
  /** ISO date string (YYYY-MM-DD) when the employee was hired. */
  hireDate: string;
}

/**
 * Input payload for creating a new employee via the HR onboarding workflow.
 * Contains all required personal and employment details.
 */
export interface EmployeeOnboardingInput {
  /** National ID number for official identification. */
  nationalId: string;
  /** Employee's surname / family name. */
  surname: string;
  /** Employee's first/given name. */
  firstName: string;
  /** Employee's middle name (optional). */
  middleName?: string;
  /** Job title or designation assignment. */
  designation: string;
  /** ISO date string (YYYY-MM-DD) of the hire date. */
  hireDate: string;
  /** Work email address. */
  email: string;
  /** Contact phone number. */
  phone: string;
  /** Next of kin full name (optional, for emergency contact). */
  nextOfKinName?: string;
  /** Relationship to next of kin (optional, e.g. 'Spouse', 'Parent'). */
  nextOfKinRelation?: string;
  /** Next of kin phone number (optional). */
  nextOfKinPhone?: string;
}

/**
 * Input payload for updating an existing employee record.
 * All fields are optional — only provided fields are updated.
 */
export interface EmployeeUpdateInput {
  /** Updated full name. */
  name?: string;
  /** Updated job title or role. */
  role?: string;
  /** Updated contact phone number. */
  phone?: string;
  /** Updated email address. */
  email?: string;
  /** Updated hire date (ISO YYYY-MM-DD). */
  hireDate?: string;
}

/**
 * Payroll record — represents a single payslip for an employee.
 * Created by the HR Payroll sub-tab after salary calculations.
 */
export interface PayrollRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the employee's ID. */
  employeeId: string;
  /** Full employee record (denormalized for display without extra lookup). */
  employee: EmployeeRecord;
  /** Pay period identifier (e.g. "2026-01" for January 2026). */
  period: string;
  /** Base salary amount in KES before allowances and deductions. */
  basicSalary: number;
  /** Total allowances added to the base salary in KES. */
  allowances: number;
  /** Total deductions subtracted from gross pay in KES. */
  deductions: number;
  /** Net pay amount in KES (basicSalary + allowances - deductions). */
  netPay: number;
  /** Payslip status: 'Draft' | 'Approved' | 'Paid' | 'Cancelled'. */
  status: 'Draft' | 'Approved' | 'Paid' | 'Cancelled';
  /** Optional notes or remarks for this payslip. */
  notes?: string;
  /** ISO date-time string when the payslip record was created. */
  createdAt: string;
}

/**
 * Input payload for creating a new payroll record.
 * Allowances and deductions default to 0 if omitted.
 */
export interface PayrollCreateInput {
  /** Foreign key referencing the employee's ID. */
  employeeId: string;
  /** Pay period identifier (e.g. "2026-01"). */
  period: string;
  /** Base salary amount in KES. */
  basicSalary: number;
  /** Total allowances in KES (defaults to 0). */
  allowances?: number;
  /** Total deductions in KES (defaults to 0). */
  deductions?: number;
  /** Optional notes for this payslip. */
  notes?: string;
}

/**
 * Leave record — represents a leave request submitted by an employee.
 * Tracked by the HR Leave sub-tab.
 */
export interface LeaveRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the employee's ID. */
  employeeId: string;
  /** Full employee record (denormalized for display). */
  employee: EmployeeRecord;
  /** Leave type (e.g. 'Annual', 'Sick', 'Maternity', 'Compassionate'). */
  type: string;
  /** ISO date string (YYYY-MM-DD) when the leave starts. */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) when the leave ends. */
  endDate: string;
  /** Number of leave days requested. */
  days: number;
  /** Reason or justification for the leave request. */
  reason: string;
  /** Request status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'. */
  status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
  /** Name of the approver (null if not yet reviewed). */
  approvedBy?: string;
  /** Optional admin notes or comments on the request. */
  notes?: string;
  /** ISO date-time string when the leave request was created. */
  createdAt: string;
}

/**
 * Input payload for creating a new leave request.
 * All fields are required to submit a complete leave application.
 */
export interface LeaveCreateInput {
  /** Foreign key referencing the employee's ID. */
  employeeId: string;
  /** Leave type (e.g. 'Annual', 'Sick'). */
  type: string;
  /** ISO date string (YYYY-MM-DD) of leave start. */
  startDate: string;
  /** ISO date string (YYYY-MM-DD) of leave end. */
  endDate: string;
  /** Number of leave days. */
  days: number;
  /** Reason for the leave request. */
  reason: string;
}

/**
 * Recruitment record — represents a job posting and its applicant pool.
 * Used by the HR Recruitment sub-tab to track hiring pipelines.
 */
export interface RecruitmentRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Job position title (e.g. 'Parish Secretary'). */
  position: string;
  /** Department or unit the position belongs to. */
  department: string;
  /** Full job description and responsibilities. */
  description: string;
  /** Qualifications and requirements for applicants (optional). */
  requirements?: string;
  /** ISO date string (YYYY-MM-DD) when the position was posted. */
  datePosted: string;
  /** ISO date string (YYYY-MM-DD) when applications close (optional, open-ended if omitted). */
  closingDate?: string;
  /** Recruitment status: 'Open' | 'Closed' | 'On Hold' | 'Cancelled'. */
  status: 'Open' | 'Closed' | 'On Hold' | 'Cancelled';
  /** Internal admin notes about the recruitment. */
  notes?: string;
  /** List of applicants who have applied for this position. */
  applicants: RecruitmentApplicant[];
  /** ISO date-time string when the recruitment record was created. */
  createdAt: string;
}

/**
 * Input payload for creating a new recruitment posting.
 */
export interface RecruitmentCreateInput {
  /** Job position title. */
  position: string;
  /** Department name. */
  department: string;
  /** Full job description. */
  description: string;
  /** Qualifications and requirements (optional). */
  requirements?: string;
  /** ISO date string (YYYY-MM-DD) when the position was posted. */
  datePosted: string;
  /** ISO date string (YYYY-MM-DD) application closing date (optional). */
  closingDate?: string;
  /** Internal notes (optional). */
  notes?: string;
}

/**
 * Applicant record — represents an individual who has applied for a recruitment posting.
 * Nested inside RecruitmentRecord.applicants.
 */
export interface RecruitmentApplicant {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the parent recruitment posting's ID. */
  recruitmentId: string;
  /** Full name of the applicant. */
  name: string;
  /** Applicant's email address. */
  email: string;
  /** Applicant's phone number (optional). */
  phone?: string;
  /** Brief CV/resume summary or highlights (optional). */
  cvSummary?: string;
  /** Application review status: 'Pending' | 'Reviewed' | 'Interviewed' | 'Accepted' | 'Rejected'. */
  status: 'Pending' | 'Reviewed' | 'Interviewed' | 'Accepted' | 'Rejected';
  /** Admin notes about the applicant (optional). */
  notes?: string;
}

/**
 * Input payload for adding a new applicant to a recruitment posting.
 */
export interface ApplicantCreateInput {
  /** Full name of the applicant. */
  name: string;
  /** Applicant's email address. */
  email: string;
  /** Applicant's phone number (optional). */
  phone?: string;
  /** CV/resume summary (optional). */
  cvSummary?: string;
}

// ---------- Inventory ----------

/**
 * Inventory item — represents a product or supply tracked in the church inventory.
 * Used by the Inventory panel for stock management, sales, and stock-take.
 */
export interface InventoryItem {
  /** Unique identifier (UUID). */
  id: string;
  /** Item name / product title. */
  name: string;
  /** Stock Keeping Unit (SKU) code for unique identification. */
  sku: string;
  /** Item category (e.g. 'Stationery', 'Vehicles', 'Liturgical'). */
  category: string;
  /** Cost price in KES (what the church pays per unit). */
  cost: number;
  /** Retail/selling price in KES (what customers pay per unit). */
  price: number;
  /** Current stock quantity on hand. */
  stock: number;
  /** Reorder threshold — trigger restock when stock falls below this level. */
  reorder: number;
}

/**
 * Delivery record — logs an inward stock movement (supplier delivery).
 * Used by the Inventory Inward sub-tab to record incoming stock.
 */
export interface DeliveryRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Name of the supplier who delivered the goods. */
  supplier: string;
  /** Invoice or delivery note reference number. */
  inv: string;
  /** ISO date string (YYYY-MM-DD) when the delivery was received. */
  date: string;
  /** Number of units delivered. */
  units: number;
  /** Item category (denormalized for display). */
  cat: string;
  /** Total cost of the delivery in KES. */
  total: number;
}

/**
 * Sale record — logs a point-of-sale transaction from inventory.
 * Used by the Inventory Sale sub-tab to record outgoing stock via sales.
 */
export interface SaleRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Name of the item sold. */
  item: string;
  /** ISO time string (HH:MM:SS) or date-time when the sale occurred. */
  time: string;
  /** Sale amount in KES. */
  amount: number;
}

/**
 * Stock-take record — logs a physical inventory count reconciliation.
 * Compares system stock levels against physically counted quantities.
 */
export interface StockTakeRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Item name. */
  name: string;
  /** Stock Keeping Unit (SKU). */
  sku: string;
  /** System-recorded stock quantity (what the app thinks is on hand). */
  system: number;
  /** Physically counted stock quantity (what is actually on hand). */
  physical: number;
  /** Notes explaining any discrepancies or observations. */
  notes: string;
}

/**
 * Stock issue record — logs when inventory items are dispensed or issued to a destination.
 * Used by the Inventory Issue sub-tab.
 */
export interface StockIssueRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Name of the item being issued. */
  item: string;
  /** Destination or recipient of the issued stock. */
  dest: string;
}

/**
 * One append-only entry in an inventory item's price history (cost or retail
 * price change, recorded with the actor who made it).
 */
export interface InventoryPriceAuditLog {
  /** Unique identifier (UUID). */
  id: string;
  /** Foreign key referencing the inventory item's ID. */
  itemId: string;
  /** Name of the inventory item (denormalized for display). */
  itemName: string;
  /** SKU of the inventory item (denormalized for display). */
  sku: string;
  /** Previous cost price in KES (null if this is the initial cost entry). */
  oldCost: number | null;
  /** New cost price in KES. */
  newCost: number | null;
  /** Previous retail price in KES (null if this is the initial price entry). */
  oldPrice: number | null;
  /** New retail price in KES. */
  newPrice: number | null;
  /** Name of the user who made the price change. */
  actorName: string;
  /** ISO date-time string when the price change was recorded. */
  createdAt: string;
}

// ---------- Ledgers ----------

/**
 * Ledger record — represents a financial ledger account in the church accounting system.
 * Used by the Ledgers panel to track balances across different accounts.
 */
export interface LedgerRecord {
  /** Unique identifier (UUID). */
  id: string;
  /** Ledger account name (e.g. 'Building Fund', 'General Offering'). */
  name: string;
  /** Short code / reference number for the ledger account. */
  code: string;
  /** Ledger type or classification. */
  type: string;
  /** Name of the cashier responsible for this ledger. */
  cashier: string;
  /** Current balance in KES. */
  balance: number;
}

/**
 * Ledger movement record — logs a fund transfer between two ledger accounts.
 * Used by the Ledgers Transfer sub-tab.
 */
export interface LedgerMovement {
  /** Unique identifier (UUID). */
  id: string;
  /** Amount transferred in KES. */
  amount: number;
  /** ISO date-time string when the transfer occurred. */
  time: string;
  /** Name of the source ledger (from which funds were debited). */
  from: string;
  /** Name of the destination ledger (to which funds were credited). */
  to: string;
}

// ---------- Reports ----------

/**
 * Sacrament report row — a single row in the sacrament statistics table.
 * Used by the Reports panel to display sacrament data in tabular form.
 */
export interface SacramentReportRow {
  /** Member's full name. */
  name: string;
  /** Date of birth (ISO YYYY-MM-DD). */
  dob: string;
  /** Date the sacrament was administered (ISO YYYY-MM-DD). */
  date: string;
  /** Small Christian Community (Jumuiya) assignment. */
  scc: string;
  /** Current membership status ('Active', 'Transferred', etc.). */
  status: string;
}

/**
 * Contribution report row — a single row in the contribution statistics table.
 * Used by the Reports panel to display contribution data in tabular form.
 */
export interface ContributionReportRow {
  /** Full name of the contributing member. */
  memberName: string;
  /** Contribution category (e.g. 'Tithe', 'Building Fund'). */
  category: string;
  /** Month identifier (e.g. 'JAN', 'FEB'). */
  month: string;
  /** Contribution amount in KES. */
  amount: number;
  /** Payment status (e.g. 'Paid', 'Pending'). */
  status: string;
}

/**
 * Sales report row — a single row in the sales statistics table.
 * Used by the Reports panel to display inventory sales data.
 */
export interface SalesReportRow {
  /** Name of the item sold. */
  item: string;
  /** Number of units sold. */
  quantity: number;
  /** Total sales amount in KES. */
  amount: number;
  /** ISO date string (YYYY-MM-DD) of the sale. */
  date: string;
}

/**
 * Cashier report row — a single row in the cashier session summary table.
 * Used by the Reports panel to display cashier reconciliation data.
 */
export interface CashierReportRow {
  /** Name of the cashier. */
  cashier: string;
  /** Number of cashier sessions / shifts worked. */
  sessions: number;
  /** Total amount collected in KES. */
  collected: number;
  /** Total amount reconciled (verified against records) in KES. */
  reconciled: number;
  /** Reconciliation status (e.g. 'Reconciled', 'Pending', 'Discrepancy'). */
  status: string;
}

// ---------- Administration ----------

/**
 * Union of all management panel keys.
 * Maps 1:1 to the sub-set of NavigationTab values that represent admin panels
 * (excludes 'dashboard' and 'auth' which are always accessible).
 */
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

/**
 * Permission configuration for a user — controls which panels they can access
 * and which actions (view, edit, delete) they can perform within those panels.
 * Stored as a JSON column on the User model in the backend.
 */
export interface PanelPermissions {
  /** Map of panel keys to boolean access flags (true = allowed, false = denied). */
  panels: Record<PanelKey, boolean>;
  /** Global action-level permissions that apply across all panels. */
  actions: { view: boolean; edit: boolean; delete: boolean };
}

/**
 * M-Pesa push payment configuration — stores Safaricom Daraja API credentials
 * and sandbox/live mode settings for the church's M-Pesa integration.
 */
export interface PushPaymentSettings {
  /** Business paybill number registered with Safaricom. */
  paybill: string;
  /** Account number format pattern used in the paybill. */
  accountFormat: string;
  /** Safaricom Daraja API consumer key (may be masked in responses). */
  consumerKey: string;
  /** Safaricom Daraja API consumer secret (may be masked in responses). */
  consumerSecret: string;
  /** API environment mode: 'sandbox' for testing, 'live' for production. */
  mode: 'sandbox' | 'live';
  /** Phone number used for sandbox test transactions. */
  testPhone: string;
  /** Amount used for sandbox test transactions. */
  testAmount: string;
  /** Whether a consumer key is configured (masked in responses for security). */
  hasConsumerKey?: boolean;
  /** Whether a consumer secret is configured (masked in responses for security). */
  hasConsumerSecret?: boolean;
}

/**
 * Parish-level system settings — singleton row storing the parish identity
 * and first-run wizard state. Sourced from GET /api/settings; the receipt and
 * certificate views use parishName/diocese instead of hardcoded placeholders.
 */
export interface SystemSettings {
  /** Singleton id ("default"). */
  id: string;
  /** Name of the parish as configured during setup. */
  parishName: string;
  /** Diocese the parish belongs to (e.g. "Archdiocese of Nairobi"). */
  diocese: string;
  /** Whether the first-run setup wizard has been completed. */
  setupCompleted: boolean;
  /** Current step of the first-run setup wizard. */
  setupStep: number;
}

/**
 * User role identifiers — determines the base level of system access.
 * Role-based access is supplemented by per-panel permissions in PanelPermissions.
 */
export type UserRole = 'super_admin' | 'admin' | 'staff' | 'viewer';

/**
 * User account record — represents a system user (staff member with login access).
 * Used by the Administration Users sub-tab for user management.
 */
export interface UserAccount {
  /** Unique identifier (UUID). */
  id: string;
  /** Display name of the user. */
  name: string;
  /** Login email address (unique). */
  email: string;
  /** Job title or position (optional). */
  title: string | null;
  /** System role: 'super_admin' | 'admin' | 'staff' | 'viewer'. */
  role: UserRole;
  /** Whether the user account is active (can log in). */
  isActive: boolean;
  /** ISO date-time string of the user's last successful login (null if never logged in). */
  lastLoginAt: string | null;
  /** ISO date-time string of the user's most recent activity (null if no activity). */
  lastActiveAt: string | null;
  /** ISO date-time string when the user account was created. */
  createdAt: string;
}

/**
 * Audit log entry — records a soft-delete or restore action on any entity.
 * Used by the Administration Audit sub-tab to track data lifecycle events.
 */
export interface AuditLogEntry {
  /** Unique identifier (UUID). */
  id: string;
  /** Name of the entity type that was affected (e.g. 'Christian', 'Deposit'). */
  entityName: string;
  /** Unique ID of the affected entity record. */
  entityId: string;
  /** Action performed: 'DELETE' (soft-delete) or 'RESTORE' (undo soft-delete). */
  action: 'DELETE' | 'RESTORE';
  /** Name of the user who performed the action (null if system-generated). */
  deletedBy: string | null;
  /** Display name of the user who performed the action (null if system-generated). */
  deletedByName: string | null;
  /** ISO date-time string when the action was performed. */
  createdAt: string;
  /** Additional metadata about the action (e.g. entity snapshot before deletion). */
  metadata: Record<string, unknown> | null;
}

// ---------- Dashboard ----------

/**
 * Dashboard summary — aggregated statistics for the main dashboard view.
 * Provides a quick overview of parish health and operational metrics.
 */
export interface DashboardSummary {
  /** Number of parishioners with 'Active' status. */
  activeMembers: number;
  /** Total number of all parishioner records (all statuses). */
  totalChristians: number;
  /** Total value of all deposits in KES. */
  totalDeposits: number;
  /** Total value of all expenses in KES. */
  totalExpenses: number;
  /** Number of creditors with non-'Paid' status (outstanding obligations). */
  pendingCreditors: number;
  /** Number of debtors with non-'Paid' status (outstanding receivables). */
  outstandingDebtors: number;
  /** Number of inventory items where stock ≤ reorder threshold. */
  lowStockItems: number;
  /** Total number of employee records in the HR directory. */
  totalEmployees: number;
  /** Most recent deposit records (for the dashboard widget). */
  recentDeposits: DepositRecord[];
  /** Most recent expense records (for the dashboard widget). */
  recentExpenses: ExpenseRecord[];
}

// ---------- Auth ----------

/**
 * Login request payload — sent to POST /api/auth/login.
 */
export interface LoginRequest {
  /** User's login email address. */
  email: string;
  /** User's password (transmitted over HTTPS). */
  password: string;
}

/**
 * Registration request payload — sent to POST /api/auth/register.
 * Used by admin to create new user accounts.
 */
export interface RegisterRequest {
  /** New user's email address (must be unique). */
  email: string;
  /** Initial password for the new account. */
  password: string;
  /** Display name for the new user. */
  name: string;
  /** Role assignment for the new user (e.g. 'staff', 'admin'). */
  role: string;
}

/**
 * Authenticated user object — returned by GET /api/auth/me after JWT validation.
 * Contains the user's identity, role, and resolved permissions.
 */
export interface AuthUser {
  /** Unique identifier (UUID). */
  id: string;
  /** Display name of the user. */
  name: string;
  /** Login email address. */
  email: string;
  /** Job title or position (optional). */
  title: string | null;
  /** System role: 'super_admin' | 'admin' | 'staff' | 'viewer'. */
  role: UserRole;
  /** Whether the user must change their password on next login. */
  mustChangePassword: boolean;
  /** Resolved panel and action permissions for this user. */
  permissions: PanelPermissions;
}

/**
 * Auth session — returned by POST /api/auth/login upon successful authentication.
 * Contains the JWT token and the authenticated user's profile.
 */
export interface AuthSession {
  /** JWT bearer token for subsequent API requests. */
  token: string;
  /** Authenticated user's profile and permissions. */
  user: AuthUser;
}

// ---------- Administration / Ops ----------

/**
 * Export bundle — contains a snapshot of all database tables for backup/export.
 * Generated by the Administration panel's export functionality.
 */
export interface ExportBundle {
  /** ISO date-time string when the export was generated. */
  exportedAt: string;
  /** Application version string (e.g. "1.0.0"). */
  appVersion: string;
  /** Map of table names to their row arrays (all columns included). */
  tables: Record<string, unknown[]>;
}

/**
 * Diagnostics info — system health and environment information.
 * Used by the Administration panel to display server diagnostics.
 */
export interface DiagnosticsInfo {
  /** ISO date-time string when the diagnostics were captured. */
  timestamp: string;
  /** Application version string. */
  appVersion: string;
  /** Node.js runtime version (e.g. "v20.11.0"). */
  nodeVersion: string;
  /** Operating system platform (e.g. "win32", "linux"). */
  platform: string;
  /** Server uptime in seconds since last restart. */
  uptimeSeconds: number;
  /** Runtime environment variables (node environment, port). */
  env: { nodeEnv?: string; port?: string };
  /** Database connection information. */
  db: { connected: boolean; provider: string; freeBytes: number | null };
  /** Row counts for all database tables. */
  rowCounts: Record<string, number>;
  /** Backup directory information. */
  backups: { dir: string; last: string | null; count: number };
}
