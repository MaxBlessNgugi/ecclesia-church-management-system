// =============================================================================
// FinanceView — finance & accounting panel: deposits, creditors, debtors, expenses
// -----------------------------------------------------------------------------
// Four sub-tabs (the FinanceSubTab union) each rendering a form + table pair.
// All list data (deposits, creditors, debtors, expenses) is lifted from the
// parent via props and every mutation flows back up through callbacks:
// onAddDeposit, onAddCreditor, onMarkCreditorPaid, onRecordDebtorPayment and
// onAddExpense. This component makes no API calls — it is a pure stateful form
// shell over parent-owned records.
//
// Internal state: `subTab` swaps the visible panel; each panel owns its local
// form fields. Two modals are gated by showCreditorModal (new debt invoice) and
// showDebtorModal (pledge payment), with activeDebtor holding the row being
// settled. Derived aggregates (totalCreditorsOwed, totalDebtorsOwed, overdue
// count, collectionRate) are recomputed on every render from the lifted arrays
// and feed the header badges and the collection-rate progress bar.
// =============================================================================
import React, { useState } from 'react';
import {
  FinanceSubTab,
  DepositRecord,
  CreditorRecord,
  DebtorRecord,
  ExpenseRecord
} from '../../types';
import { usePermissions } from '../../permissions';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';
import { useToast } from '../Toast';

/**
 * Props for the FinanceView panel.
 */
interface FinanceViewProps {
  /** All recorded bank deposits (rendered in the MAKE DEPOSIT table) */
  deposits: DepositRecord[];
  /** All outstanding invoices from vendors (rendered in the CREDITORS table) */
  creditors: CreditorRecord[];
  /** All outstanding member pledges (rendered in the DEBTORS table) */
  debtors: DebtorRecord[];
  /** All logged expense vouchers (rendered in the EXPENSES table) */
  expenses: ExpenseRecord[];
  /** Which sub-tab to open on mount; defaults to 'make_deposit' */
  initialSubTab?: FinanceSubTab;
  /** Callback lifting a newly recorded bank deposit to the parent */
  onAddDeposit: (deposit: DepositRecord) => void;
  /** Callback lifting a newly logged vendor invoice to the parent */
  onAddCreditor: (creditor: CreditorRecord) => void;
  /** Callback marking a creditor invoice as fully settled */
  onMarkCreditorPaid: (creditorId: string) => void;
  /** Callback recording a partial/full pledge payment against a debtor */
  onRecordDebtorPayment: (debtorId: string, amount: number) => void;
  /** Callback lifting a newly logged expense voucher to the parent */
  onAddExpense: (expense: ExpenseRecord) => void;
  /** Soft-delete a deposit record */
  onDeleteDeposit: (id: string) => void;
  /** Soft-delete a creditor record */
  onDeleteCreditor: (id: string) => void;
  /** Soft-delete a debtor record */
  onDeleteDebtor: (id: string) => void;
  /** Soft-delete an expense record */
  onDeleteExpense: (id: string) => void;
}

/**
 * FinanceView — top-level finance & accounting panel component.
 * Renders a tabbed interface (deposits, creditors, debtors, expenses) with
 * forms for data entry and tables displaying lifted records from the parent.
 * Manages local form state and delegates all mutations to parent callbacks.
 */
export const FinanceView: React.FC<FinanceViewProps> = ({
  deposits,
  creditors,
  debtors,
  expenses,
  initialSubTab = 'make_deposit',
  onAddDeposit,
  onAddCreditor,
  onMarkCreditorPaid,
  onRecordDebtorPayment,
  onAddExpense,
  onDeleteDeposit,
  onDeleteCreditor,
  onDeleteDebtor,
  onDeleteExpense
}) => {
  // Access the permissions hook to determine if the current user can edit finance data
  const perms = usePermissions();
  // Tracks which sub-tab (deposit/creditors/debtors/expenses) is currently active
  const [subTab, setSubTab] = useState<FinanceSubTab>(initialSubTab);

  // 1. Deposit Form State
  // Date of the deposit, defaults to today in ISO format (YYYY-MM-DD)
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Monetary amount being deposited, must be > 0 for validation
  const [depositAmount, setDepositAmount] = useState<number>(0);
  // Bank name where the deposit was made, required
  const [bankName, setBankName] = useState('');
  // Bank account number, required
  const [accountNo, setAccountNo] = useState('');
  // Source of the cash (e.g., offerings, tithes), required
  const [sourceOfCash, setSourceOfCash] = useState('');
  // Deposit slip or reference number, optional
  const [refNo, setRefNo] = useState('');
  // Name of the person making the deposit, required
  const [depositedBy, setDepositedBy] = useState('');

  // 2. Log New Creditor Modal
  // Controls visibility of the creditor invoice modal
  const [showCreditorModal, setShowCreditorModal] = useState(false);
  // Vendor/supplier name for the new creditor, required
  const [newVendor, setNewVendor] = useState('');
  // Description of the vendor invoice, optional (defaults to 'Parish Services')
  const [newVendorDesc, setNewVendorDesc] = useState('');
  // Invoice number, required for tracking
  const [newInvoiceNo, setNewInvoiceNo] = useState('');
  // Amount owed to the vendor, required
  const [newVendorAmount, setNewVendorAmount] = useState<number>(0);
  // Due date for the invoice, optional (defaults to 'Next Month')
  const [newVendorDueDate, setNewVendorDueDate] = useState('');

  // 3. Record Debtor Payment Modal
  // Controls visibility of the debtor payment modal
  const [showDebtorModal, setShowDebtorModal] = useState(false);
  // The debtor record currently being paid (set when 'Record Payment' is clicked)
  const [activeDebtor, setActiveDebtor] = useState<DebtorRecord | null>(null);
  // Amount the user wants to pay toward the debtor's pledge, defaults to full amount
  const [debtorPayAmount, setDebtorPayAmount] = useState<number>(100);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string; details: string[] } | null>(null);

  // Toast notifications
  const { showSuccess, showError, toastEl } = useToast();

  // 4. Expense Form State
  // Date of the expense, defaults to today in ISO format (YYYY-MM-DD)
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Category of expense (Utilities, Sanctuary Maintenance, etc.)
  const [expenseCategory, setExpenseCategory] = useState('Utilities');
  // Payee or description of what was paid, required
  const [expensePayee, setExpensePayee] = useState('');
  // Monetary amount of the expense, must be > 0 for validation
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  // Payment method used (Check/Voucher, Cash, M-Pesa)
  const [expenseMethod, setExpenseMethod] = useState('Check / Voucher');
  // Voucher number for tracking, optional
  const [expenseVoucher, setExpenseVoucher] = useState('');

  /**
   * Validates the required deposit fields (amount > 0, bank, account, source,
   * depositor), builds a DepositRecord with a timestamp-based id, trims the
   * optional ref number, then lifts it and clears the form for the next entry.
   */
  const handleDepositSubmit = (e: React.FormEvent) => {
    // Prevent default form submission to handle validation manually
    e.preventDefault();
    // Validate all required fields are present and amount is positive
    if (!depositAmount || depositAmount <= 0 || !bankName || !accountNo || !sourceOfCash || !depositedBy) {
      showError('Please complete all deposit fields.');
      return;
    }
    // Build the deposit record with a unique timestamp-based ID
    const newDep: DepositRecord = {
      id: `dep_${Date.now()}`,
      date: depositDate,
      amount: depositAmount,
      bankName,
      accountNo,
      sourceOfCash,
      refNo: refNo.trim(),
      depositedBy
    };
    // Lift the new deposit to the parent component
    onAddDeposit(newDep);
    showSuccess(`Deposit slip (KSh ${depositAmount.toFixed(2)}) recorded into parish accounts!`);
    // Reset form fields for the next entry
    setDepositAmount(0);
    setBankName('');
    setAccountNo('');
    setSourceOfCash('');
    setRefNo('');
    setDepositedBy('');
  };

  /**
   * Validates vendor and invoice number (both required), then builds a
   * CreditorRecord. Free-text fields fall back to defaults: empty description
   * becomes 'Parish Services', empty due date 'Next Month'; status starts at
   * 'Pending' until it is later marked paid/overdue.
   */
  const handleAddCreditorSubmit = (e: React.FormEvent) => {
    // Prevent default form submission
    e.preventDefault();
    // Validate vendor name is provided
    if (!newVendor) return;
    // Validate invoice number is provided
    if (!newInvoiceNo) {
      showError('Please enter the vendor invoice number.');
      return;
    }
    // Build the creditor record with defaults for optional fields
    const newCred: CreditorRecord = {
      id: `cr_${Date.now()}`,
      vendor: newVendor,
      description: newVendorDesc || 'Parish Services',
      invoiceNo: newInvoiceNo,
      amountOwed: newVendorAmount,
      dueDate: newVendorDueDate || 'Next Month',
      status: 'Pending'
    };
    // Lift the new creditor to the parent component
    onAddCreditor(newCred);
    // Close the modal
    setShowCreditorModal(false);
    // Reset all modal form fields
    setNewVendor('');
    setNewVendorDesc('');
    setNewInvoiceNo('');
    setNewVendorAmount(0);
    setNewVendorDueDate('');
    showSuccess(`New debt invoice recorded for ${newVendor}!`);
  };

  /**
   * Validates a payee and a positive amount, builds an ExpenseRecord (trimming
   * the optional voucher number), lifts it to the parent, then resets the
   * payee/amount/voucher fields.
   */
  const handleExpenseSubmit = (e: React.FormEvent) => {
    // Prevent default form submission
    e.preventDefault();
    // Validate payee and amount are provided and amount is positive
    if (!expensePayee || !expenseAmount || expenseAmount <= 0) {
      showError('Please enter a payee and a positive amount.');
      return;
    }
    // Build the expense record with a unique timestamp-based ID
    const newExp: ExpenseRecord = {
      id: `exp_${Date.now()}`,
      date: expenseDate,
      category: expenseCategory,
      description: expensePayee,
      amount: expenseAmount,
      paymentMethod: expenseMethod,
      voucherNo: expenseVoucher.trim()
    };
    // Lift the new expense to the parent component
    onAddExpense(newExp);
    showSuccess(`Expense voucher (KSh ${expenseAmount.toFixed(2)}) saved!`);
    // Reset form fields for the next entry
    setExpensePayee('');
    setExpenseAmount(0);
    setExpenseVoucher('');
  };

  // Derived metrics recomputed on each render from the lifted arrays. The sums
  // exclude already-settled rows (status 'Paid'); collectionRate is the share of
  // debtors fully paid, rounded to one decimal (0 when no debtors exist).
  // Total amount owed by all unpaid creditors (excludes 'Paid' status)
  const totalCreditorsOwed = creditors.reduce((sum, c) => sum + (c.status !== 'Paid' ? c.amountOwed : 0), 0);
  // Total amount owed by all unpaid debtors (excludes 'Paid' status)
  const totalDebtorsOwed = debtors.reduce((sum, d) => sum + (d.status !== 'Paid' ? d.amount : 0), 0);
  // Count of creditors with 'Overdue' status for the red badge
  const overdueCreditors = creditors.filter((c) => c.status === 'Overdue').length;
  // Count of debtors with 'Paid' status for collection rate calculation
  const paidDebtors = debtors.filter((d) => d.status === 'Paid').length;
  // Collection rate as percentage (paid / total), rounded to 1 decimal place
  const collectionRate = debtors.length > 0 ? Math.round((paidDebtors / debtors.length) * 1000) / 10 : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {toastEl}
      {/* Title & Navigation Sub-Tabs */}
      {/* Header card with title and tab switcher */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left side: component title and description */}
        <div>
          {/* Main heading for the finance panel */}
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Finance & Accounting
          </h2>
          {/* Subtitle describing the panel's capabilities */}
          <p className="text-xs text-[#444748]">
            Manage bank deposits, accounts payable (creditors), receivable (debtors) and expenses
          </p>
        </div>

        {/* Sub-tab switcher — each button flips subTab; the active one gets the
            dark highlight via the conditional Tailwind class below. */}
        {/* Tab button container: gray background, rounded corners, horizontal flex */}
        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
          {/* Tab button: MAKE DEPOSIT - shows bank deposit form and table */}
          <button
            onClick={() => setSubTab('make_deposit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'make_deposit'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            MAKE DEPOSIT
          </button>
          {/* Tab button: CREDITORS - shows accounts payable (vendor invoices) */}
          <button
            onClick={() => setSubTab('creditors')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'creditors'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            CREDITORS
          </button>
          {/* Tab button: DEBTORS - shows pledge receivables from members */}
          <button
            onClick={() => setSubTab('debtors')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'debtors'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            DEBTORS
          </button>
          {/* Tab button: EXPENSES - shows operating expense log */}
          <button
            onClick={() => setSubTab('expenses')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'expenses'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            EXPENSES
          </button>
        </div>
      </div>

      {/* 1. MAKE DEPOSIT — bank deposit form + recent deposits table.
          The date defaults to today (ISO slice), and the ref/slip number is
          optional (left blank it just renders as-is on the row). */}
      {/* Conditional rendering: only shown when subTab is 'make_deposit' */}
      {subTab === 'make_deposit' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          {/* Header section with title and audit integrity badge */}
          <div className="flex justify-between items-center pb-4 border-b border-[#e1e3e3]">
            {/* Left side: section title and description */}
            <div>
              {/* Section heading */}
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                BANK DEPOSIT RECORDING
              </h3>
              {/* Instructional text for the form */}
              <p className="text-xs text-[#444748]">
                Record cash collections deposited into official parish bank accounts
              </p>
            </div>
            {/* Audit integrity status badge */}
            <span className="text-xs font-mono bg-[#f4f3f3] text-[#1e1e1e] px-2.5 py-1 rounded border border-[#e1e3e3]">
              Audit Integrity Check: Active
            </span>
          </div>

          {/* Warning banner about accounting integrity requirements */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
            {/* Verified user icon for the warning */}
            <span className="material-symbols-outlined text-sm">verified_user</span>
            {/* Warning text about bank teller slips */}
            <span>
              Accounting Integrity Alert: All cash deposits require verified bank teller slips before final audit reconciliation.
            </span>
          </div>

          {/* Deposit form: handles submission and field validation */}
          <form onSubmit={handleDepositSubmit} className="space-y-6">
            {/* 3-column responsive grid for form fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Date input field */}
              <div>
                {/* Label for the deposit date */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposit Date
                </label>
                {/* Date picker input, defaults to today */}
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              {/* Amount input field */}
              <div>
                {/* Label for the deposit amount */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Amount Collected ($)
                </label>
                {/* Numeric input with 2 decimal precision, required > 0 */}
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                />
              </div>

              {/* Bank name text input */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. KCB Bank, Equity Bank, Co-operative Bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
                <p className="text-[10px] text-[#888] mt-0.5">Full name of the bank where the deposit was made</p>
              </div>

              {/* Account number text input */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Bank Account No
                </label>
                <input
                  type="text"
                  placeholder="e.g. 1234567890, KCB-0123456789"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
                <p className="text-[10px] text-[#888] mt-0.5">Account number or name (e.g. General Parish Operating, Building Fund)</p>
              </div>

              {/* Source of cash text input */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Source of Cash
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sunday Mass collections, Building fund drive, Wedding fees"
                  value={sourceOfCash}
                  onChange={(e) => setSourceOfCash(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
                <p className="text-[10px] text-[#888] mt-0.5">Where the cash came from (e.g. Weekly tithes, Easter offering, Funeral contributions)</p>
              </div>

              {/* Reference/slip number input field */}
              <div>
                {/* Label for the deposit slip reference */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposit Slip / Ref No
                </label>
                {/* Text input for optional reference number */}
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              {/* Deposited by input field */}
              <div>
                {/* Label for the depositor's name */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposited By
                </label>
                {/* Text input for the person making the deposit, required */}
                <input
                  type="text"
                  value={depositedBy}
                  onChange={(e) => setDepositedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>
            </div>

            {/* Form action buttons: clear form and save */}
            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end gap-3">
              {/* Clear Form button: resets all deposit fields */}
              <button
                type="button"
                onClick={() => setDepositAmount(0)}
                className="px-4 py-2 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded cursor-pointer"
              >
                Clear Form
              </button>
              {/* Save & Record Deposit button: submits the form if user has finance edit permission */}
              <button
                type="submit"
                disabled={!perms.canEdit('finance')}
                className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                {/* Wallet icon for the save button */}
                <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                Save & Record Deposit
              </button>
            </div>
          </form>

          {/* Recent Deposits Table — rendered from the lifted deposits array;
              if it is empty the tbody renders nothing (no explicit empty state). */}
          {/* Container for the deposits table section */}
          <div className="pt-6 border-t border-[#e1e3e3] space-y-3">
            {/* Table section heading */}
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              RECENT BANK DEPOSITS
            </h4>
            {/* Scrollable table container */}
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              {/* Deposits table */}
              <table className="w-full text-left border-collapse text-xs">
                {/* Table header row */}
                <thead>
                  {/* Header cells: Ref Slip, Date, Bank & Account, Source, Amount, Depositor */}
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    {/* Ref Slip column header */}
                    <th className="p-3">Ref Slip</th>
                    {/* Date column header */}
                    <th className="p-3">Date</th>
                    {/* Bank & Account column header */}
                    <th className="p-3">Bank & Account</th>
                    {/* Source column header */}
                    <th className="p-3">Source</th>
                    {/* Amount column header */}
                    <th className="p-3">Amount</th>
                    {/* Depositor column header */}
                    <th className="p-3">Depositor</th>
                    {/* Actions column header */}
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                {/* Table body: rows for each deposit record */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Map over deposits array to render each row */}
                  {deposits.map((d) => (
                    <tr key={d.id} className="hover:bg-[#f9f9f9]">
                      {/* Reference/slip number in monospace font */}
                      <td className="p-3 font-mono font-bold text-[#1e1e1e]">{d.refNo}</td>
                      {/* Deposit date */}
                      <td className="p-3 text-[#444748]">{d.date}</td>
                      {/* Bank name and account number combined */}
                      <td className="p-3 text-[#1a1c1c]">
                        {d.bankName} ({d.accountNo})
                      </td>
                      {/* Source of the cash */}
                      <td className="p-3 text-[#444748]">{d.sourceOfCash}</td>
                      {/* Deposit amount formatted as currency */}
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      {/* Name of person who made the deposit */}
                      <td className="p-3 text-[#444748]">{d.depositedBy}</td>
                      <td className="p-3 text-right">
                        {perms.canDelete('finance') ? (
                          <button
                            onClick={() => setDeleteTarget({ type: 'deposit', id: d.id, label: `${d.bankName} deposit of $${d.amount.toLocaleString()}`, details: [`Ref: ${d.refNo}`, `Date: ${d.date}`, `Source: ${d.sourceOfCash}`, `Deposited by: ${d.depositedBy}`] })}
                            className="text-[#ba1a1a] hover:text-red-700 text-xs"
                            title="Delete deposit"
                            aria-label="Delete deposit"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#ccc]" title="You do not have permission to delete deposits">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. CREDITORS — accounts payable: header shows total outstanding and an
          overdue-count badge; rows are lifted from the creditors array. */}
      {/* Conditional rendering: only shown when subTab is 'creditors' */}
      {subTab === 'creditors' && (
        <div className="space-y-6">
          {/* Header card with title, overdue badge, and total outstanding */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Left side: title and outstanding amount */}
            <div>
              {/* Title with overdue count badge */}
              <div className="flex items-center gap-2">
                {/* Section heading */}
                <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                  CREDITORS & ACCOUNTS PAYABLE
                </h3>
                {/* Red badge showing overdue invoice count */}
                <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-800 rounded font-bold">
                  {overdueCreditors} {overdueCreditors === 1 ? 'Invoice' : 'Invoices'} Overdue
                </span>
              </div>
              {/* Total outstanding amount display */}
              <p className="text-xs text-[#444748] mt-1">
                Total Outstanding:{' '}
                {/* Bold monetary value */}
                <strong className="text-[#1a1c1c] text-sm">
                  ${totalCreditorsOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>{' '}
                across verified vendors
              </p>
            </div>

            {/* Button to open the new creditor invoice modal */}
            <button
              onClick={() => setShowCreditorModal(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              {/* Add icon */}
              <span className="material-symbols-outlined text-sm">add</span>
              Log New Debt Invoice
            </button>
          </div>

          {/* Creditors Table — status badge is color-coded via the conditional
              Tailwind classes (emerald=Paid, red=Overdue, amber=Pending).
              'Mark Paid' is only rendered for unsettled rows. */}
          {/* Table container card */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Scrollable table wrapper */}
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              {/* Creditors data table */}
              <table className="w-full text-left border-collapse text-xs">
                {/* Table header */}
                <thead>
                  {/* Header row with column labels */}
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    {/* Vendor/Supplier name column */}
                    <th className="p-3">Vendor / Supplier</th>
                    {/* Description column */}
                    <th className="p-3">Description</th>
                    {/* Invoice number column */}
                    <th className="p-3">Invoice #</th>
                    {/* Amount owed column */}
                    <th className="p-3">Amount Owed</th>
                    {/* Due date column */}
                    <th className="p-3">Due Date</th>
                    {/* Status column with color-coded badges */}
                    <th className="p-3">Status</th>
                    {/* Actions column (right-aligned) */}
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                {/* Table body: rows for each creditor record */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Map over creditors array to render each row */}
                  {creditors.map((cred) => (
                    <tr key={cred.id} className="hover:bg-[#f9f9f9]">
                      {/* Vendor name in bold */}
                      <td className="p-3 font-bold text-[#1a1c1c]">{cred.vendor}</td>
                      {/* Invoice description */}
                      <td className="p-3 text-[#444748]">{cred.description}</td>
                      {/* Invoice number in monospace font */}
                      <td className="p-3 font-mono text-[#1e1e1e]">{cred.invoiceNo}</td>
                      {/* Amount owed formatted as currency */}
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${cred.amountOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      {/* Due date */}
                      <td className="p-3 text-[#444748]">{cred.dueDate}</td>
                      {/* Status badge with color coding */}
                      <td className="p-3">
                        {/* Status badge: emerald for Paid, red for Overdue, amber for Pending */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            cred.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : cred.status === 'Overdue'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {cred.status}
                        </span>
                      </td>                      {/* Action column: Mark Paid + Delete buttons */}
                      <td className="p-3 text-right">
                        {cred.status !== 'Paid' && (
                          <button
                            onClick={() => onMarkCreditorPaid(cred.id)}
                            disabled={!perms.canEdit('finance')}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded opacity-50 cursor-not-allowed"
                          >
                            Mark Paid
                          </button>
                        )}
                        {perms.canDelete('finance') ? (
                          <button
                            onClick={() => setDeleteTarget({ type: 'creditor', id: cred.id, label: `${cred.vendor} invoice (${cred.invoiceNo})`, details: [`Amount: $${cred.amountOwed.toLocaleString()}`, `Due: ${cred.dueDate}`, `Status: ${cred.status}`] })}
                            className="ml-1 text-[#ba1a1a] hover:text-red-700 text-xs"
                            title="Delete creditor"
                            aria-label="Delete creditor"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        ) : (
                          <span className="ml-1 text-xs text-[#ccc]" title="You do not have permission to delete creditors">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. DEBTORS — pledge receivables: header shows outstanding total plus a
          collection-rate progress bar driven by the derived metric. */}
      {/* Conditional rendering: only shown when subTab is 'debtors' */}
      {subTab === 'debtors' && (
        <div className="space-y-6">
          {/* Header card with title, outstanding total, and collection rate */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Left side: title and outstanding amount */}
            <div>
              {/* Section heading */}
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                DEBTORS & PLEDGE RECEIVABLES
              </h3>
              {/* Outstanding pledges amount and collection rate */}
              <p className="text-xs text-[#444748] mt-1">
                Outstanding Pledges:{' '}
                {/* Bold monetary value */}
                <strong className="text-[#1a1c1c] text-sm">
                  ${totalDebtorsOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>{' '}
                • Collection Rate: {collectionRate}%
              </p>
            </div>

            {/* Progress bar showing collection rate */}
            <div className="w-48 bg-[#f4f3f3] h-3 rounded-full overflow-hidden border border-[#e1e3e3]">
              {/* Filled portion of the bar representing collection percentage */}
              <div className="bg-[#1e1e1e] h-full" style={{ width: `${collectionRate}%` }} />
            </div>
          </div>

          {/* Debtors Table — status badge colors follow Paid/Partially Paid/
              Outstanding. 'Record Payment' opens the modal and pre-fills the
              amount with the remaining owed value. */}
          {/* Table container card */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Scrollable table wrapper */}
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              {/* Debtors data table */}
              <table className="w-full text-left border-collapse text-xs">
                {/* Table header */}
                <thead>
                  {/* Header row with column labels */}
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    {/* Member name column */}
                    <th className="p-3">Member Name</th>
                    {/* Contribution/pledge type column */}
                    <th className="p-3">Contribution / Pledge Type</th>
                    {/* Amount column */}
                    <th className="p-3">Amount</th>
                    {/* Status column with color-coded badges */}
                    <th className="p-3">Status</th>
                    {/* Actions column (right-aligned) */}
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                {/* Table body: rows for each debtor record */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Map over debtors array to render each row */}
                  {debtors.map((debt) => (
                    <tr key={debt.id} className="hover:bg-[#f9f9f9]">
                      {/* Member name in bold */}
                      <td className="p-3 font-bold text-[#1a1c1c]">{debt.memberName}</td>
                      {/* Contribution type (e.g., Building Fund, Tithe) */}
                      <td className="p-3 text-[#444748]">{debt.contributionType}</td>
                      {/* Pledge amount formatted as currency */}
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${debt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      {/* Status badge with color coding */}
                      <td className="p-3">
                        {/* Status badge: emerald for Paid, amber for Partially Paid, red for Outstanding */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            debt.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : debt.status === 'Partially Paid'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {debt.status}
                        </span>
                      </td>                      {/* Action column: Record Payment + Delete buttons */}
                      <td className="p-3 text-right">
                        {debt.status !== 'Paid' && (
                          <button
                            onClick={() => {
                              setActiveDebtor(debt);
                              setDebtorPayAmount(debt.amount);
                              setShowDebtorModal(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                          >
                            Record Payment
                          </button>
                        )}
                        {perms.canDelete('finance') ? (
                          <button
                            onClick={() => setDeleteTarget({ type: 'debtor', id: debt.id, label: `${debt.memberName} — ${debt.contributionType}`, details: [`Amount: $${debt.amount.toLocaleString()}`, `Status: ${debt.status}`] })}
                            className="ml-1 text-[#ba1a1a] hover:text-red-700 text-xs"
                            title="Delete debtor"
                            aria-label="Delete debtor"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        ) : (
                          <span className="ml-1 text-xs text-[#ccc]" title="You do not have permission to delete debtors">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. EXPENSES — operating expense log: form plus recent voucher table.
          The voucher number is optional (trimmed on save). */}
      {/* Conditional rendering: only shown when subTab is 'expenses' */}
      {subTab === 'expenses' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          {/* Header section with title */}
          <div className="flex justify-between items-center pb-4 border-b border-[#e1e3e3]">
            {/* Left side: section title and description */}
            <div>
              {/* Section heading */}
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                PARISH EXPENSE LOG & VOUCHER ENTRY
              </h3>
              {/* Instructional text for the form */}
              <p className="text-xs text-[#444748]">
                Log operating expenses, sanctuary upkeep, and liturgical supplies
              </p>
            </div>
          </div>

          {/* Expense form: handles submission and field validation */}
          <form onSubmit={handleExpenseSubmit} className="space-y-6">
            {/* 3-column responsive grid for form fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Date input field */}
              <div>
                {/* Label for the expense date */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">Date</label>
                {/* Date picker input, defaults to today */}
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Expense Category
                </label>
                <input
                  type="text"
                  placeholder="e.g. Utilities, Sanctuary Maintenance, Liturgical Supplies"
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
                <p className="text-[10px] text-[#888] mt-0.5">Type of expense (e.g. Electricity bill, Roof repair, Candles & incense)</p>
              </div>

              {/* Description/payee input field */}
              <div>
                {/* Label for payee/description */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Description / Payee
                </label>
                {/* Text input for payee name or expense description, required */}
                <input
                  type="text"
                  value={expensePayee}
                  onChange={(e) => setExpensePayee(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              {/* Amount input field */}
              <div>
                {/* Label for expense amount */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Amount Paid ($)
                </label>
                {/* Numeric input with 2 decimal precision, required > 0 */}
                <input
                  type="number"
                  step="0.01"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Payment Method
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cash, Check/Voucher, M-Pesa, Bank Transfer"
                  value={expenseMethod}
                  onChange={(e) => setExpenseMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
                <p className="text-[10px] text-[#888] mt-0.5">How the expense was paid (e.g. Cash from petty fund, M-Pesa, cheque)</p>
              </div>

              {/* Voucher number input field */}
              <div>
                {/* Label for voucher number */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Voucher Number
                </label>
                {/* Text input for optional voucher reference number */}
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={expenseVoucher}
                  onChange={(e) => setExpenseVoucher(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>
            </div>

            {/* Form action button: save expense */}
            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end gap-3">
              {/* Save & Record Expense button: submits the form if user has finance edit permission */}
              <button
                type="submit"
                disabled={!perms.canEdit('finance')}
                className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                {/* Receipt icon for the save button */}
                <span className="material-symbols-outlined text-sm">receipt</span>
                Save & Record Expense
              </button>
            </div>
          </form>

          {/* Recent Expenses List — rendered from the lifted expenses array;
              empty array yields an empty tbody (no explicit empty state). */}
          {/* Container for the expenses table section */}
          <div className="pt-6 border-t border-[#e1e3e3] space-y-3">
            {/* Table section heading */}
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              RECENT EXPENSE VOUCHERS
            </h4>
            {/* Scrollable table container */}
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              {/* Expenses data table */}
              <table className="w-full text-left border-collapse text-xs">
                {/* Table header */}
                <thead>
                  {/* Header row with column labels */}
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    {/* Voucher number column */}
                    <th className="p-3">Voucher #</th>
                    {/* Date column */}
                    <th className="p-3">Date</th>
                    {/* Category column */}
                    <th className="p-3">Category</th>
                    {/* Description/paye column */}
                    <th className="p-3">Description / Payee</th>
                    {/* Amount column */}
                    <th className="p-3">Amount</th>
                    {/* Payment method column */}
                    <th className="p-3">Payment Method</th>
                    {/* Actions column */}
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                {/* Table body: rows for each expense record */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Map over expenses array to render each row */}
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-[#f9f9f9]">
                      {/* Voucher number in monospace font */}
                      <td className="p-3 font-mono font-bold text-[#1e1e1e]">{exp.voucherNo}</td>
                      {/* Expense date */}
                      <td className="p-3 text-[#444748]">{exp.date}</td>
                      {/* Expense category */}
                      <td className="p-3 text-[#1a1c1c]">{exp.category}</td>
                      {/* Description or payee name */}
                      <td className="p-3 text-[#444748]">{exp.description}</td>
                      {/* Amount formatted as currency in red */}
                      <td className="p-3 font-bold text-[#ba1a1a]">
                        ${exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      {/* Payment method used */}
                      <td className="p-3 text-[#444748]">{exp.paymentMethod}</td>
                      {/* Delete button */}
                      <td className="p-3 text-right">
                        {perms.canDelete('finance') ? (
                          <button
                            onClick={() => setDeleteTarget({ type: 'expense', id: exp.id, label: `${exp.category} expense ($${exp.amount.toLocaleString()})`, details: [`Voucher: ${exp.voucherNo}`, `Date: ${exp.date}`, `Payee: ${exp.description}`, `Method: ${exp.paymentMethod}`] })}
                            className="text-[#ba1a1a] hover:text-red-700 text-xs"
                            title="Delete expense"
                            aria-label="Delete expense"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        ) : (
                          <span className="text-xs text-[#ccc]" title="You do not have permission to delete expenses">
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LOG NEW CREDITOR MODAL — controlled form for a new vendor invoice;
          description and due date are optional and fall back to defaults. */}
      {/* Modal: only rendered when showCreditorModal is true */}
      {showCreditorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          {/* Modal content card */}
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            {/* Modal heading */}
            <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Log New Debt Invoice</h4>
            {/* Creditor form: handles submission and field validation */}
            <form onSubmit={handleAddCreditorSubmit} className="space-y-3 text-xs">
              {/* Vendor name input field */}
              <div>
                {/* Label for vendor/supplier name */}
                <label className="block text-[#444748] mb-1">Vendor / Supplier Name</label>
                {/* Text input with example placeholder, required */}
                <input
                  type="text"
                  required
                  placeholder="e.g. Beacon Structural Eng."
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              {/* Description input field */}
              <div>
                {/* Label for invoice description */}
                <label className="block text-[#444748] mb-1">Description</label>
                {/* Text input with example placeholder, optional */}
                <input
                  type="text"
                  placeholder="e.g. Roof Repair"
                  value={newVendorDesc}
                  onChange={(e) => setNewVendorDesc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              {/* Invoice number input field */}
              <div>
                {/* Label for invoice number */}
                <label className="block text-[#444748] mb-1">Invoice #</label>
                {/* Text input with example placeholder, required */}
                <input
                  type="text"
                  required
                  placeholder="e.g. INV-2024-0012"
                  value={newInvoiceNo}
                  onChange={(e) => setNewInvoiceNo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              {/* Amount and due date in a 2-column grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Amount input field */}
                <div>
                  {/* Label for invoice amount */}
                  <label className="block text-[#444748] mb-1">Amount ($)</label>
                  {/* Numeric input for amount owed */}
                  <input
                    type="number"
                    value={newVendorAmount}
                    onChange={(e) => setNewVendorAmount(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded font-bold"
                  />
                </div>
                {/* Due date input field */}
                <div>
                  {/* Label for due date */}
                  <label className="block text-[#444748] mb-1">Due Date</label>
                  {/* Text input with example placeholder, optional */}
                  <input
                    type="text"
                    placeholder="e.g. Nov 15, 2024"
                    value={newVendorDueDate}
                    onChange={(e) => setNewVendorDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                  />
                </div>
              </div>
              {/* Modal action buttons: cancel and save */}
              <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                {/* Cancel button: closes the modal without saving */}
                <button
                  type="button"
                  onClick={() => setShowCreditorModal(false)}
                  className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                {/* Save button: submits the creditor form if user has finance edit permission */}
                <button
                  type="submit"
                  disabled={!perms.canEdit('finance')}
                  className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded opacity-50 cursor-not-allowed"
                >
                  Save Debt Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD DEBTOR PAYMENT MODAL — settles a pledge for activeDebtor (the
          row whose 'Record Payment' was clicked); amount starts at the remaining
          balance. Confirm lifts the payment via onRecordDebtorPayment. */}
      {/* Modal: only rendered when showDebtorModal is true and activeDebtor is set */}
      {showDebtorModal && activeDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          {/* Modal content card */}
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
            {/* Modal heading */}
            <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Record Pledge Payment</h4>
            {/* Debtor information display */}
            <div className="text-xs space-y-1">
              {/* Member name */}
              <p>
                <strong>Member:</strong> {activeDebtor.memberName}
              </p>
              {/* Contribution type */}
              <p>
                <strong>Pledge Type:</strong> {activeDebtor.contributionType}
              </p>
            </div>
            {/* Payment amount input */}
            <div className="space-y-2">
              {/* Label for payment amount */}
              <label className="block text-xs font-medium">Payment Amount Received ($)</label>
              {/* Numeric input for payment amount, pre-filled with full balance */}
              <input
                type="number"
                value={debtorPayAmount}
                onChange={(e) => setDebtorPayAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-sm font-bold"
              />
            </div>
            {/* Modal action buttons: cancel and confirm */}
            <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
              {/* Cancel button: closes the modal without recording payment */}
              <button
                onClick={() => setShowDebtorModal(false)}
                className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
              >
                Cancel
              </button>
              {/* Confirm Payment button: records the payment and closes modal */}
              <button
                onClick={() => {
                  // Call the parent callback to record the payment
                  onRecordDebtorPayment(activeDebtor.id, debtorPayAmount);
                  // Close the modal
                  setShowDebtorModal(false);
                  // Clear the active debtor reference
                  setActiveDebtor(null);
                  // Show confirmation toast
                  showSuccess('Pledge payment recorded!');
                }}
                disabled={!perms.canEdit('finance')}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] rounded opacity-50 cursor-not-allowed"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <DeleteConfirmationModal
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : ''}`}
        recordLabel={deleteTarget?.label ?? ''}
        recordDetails={deleteTarget?.details}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            if (deleteTarget.type === 'deposit') await onDeleteDeposit(deleteTarget.id);
            else if (deleteTarget.type === 'creditor') await onDeleteCreditor(deleteTarget.id);
            else if (deleteTarget.type === 'debtor') await onDeleteDebtor(deleteTarget.id);
            else if (deleteTarget.type === 'expense') await onDeleteExpense(deleteTarget.id);
            setDeleteTarget(null);
            showSuccess('Record moved to Trash. You can restore it from Administration → Trash & Audit.');
          } catch {
            showError('Failed to delete record. Please try again.');
          }
        }}
      />
    </div>
  );
};
