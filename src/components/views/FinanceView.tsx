import React, { useState } from 'react';
import {
  FinanceSubTab,
  DepositRecord,
  CreditorRecord,
  DebtorRecord,
  ExpenseRecord
} from '../../types';

interface FinanceViewProps {
  deposits: DepositRecord[];
  creditors: CreditorRecord[];
  debtors: DebtorRecord[];
  expenses: ExpenseRecord[];
  initialSubTab?: FinanceSubTab;
  onAddDeposit: (deposit: DepositRecord) => void;
  onAddCreditor: (creditor: CreditorRecord) => void;
  onMarkCreditorPaid: (creditorId: string) => void;
  onRecordDebtorPayment: (debtorId: string, amount: number) => void;
  onAddExpense: (expense: ExpenseRecord) => void;
}

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
  onAddExpense
}) => {
  const [subTab, setSubTab] = useState<FinanceSubTab>(initialSubTab);

  // 1. Deposit Form State
  const [depositDate, setDepositDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [bankName, setBankName] = useState('');
  const [accountNo, setAccountNo] = useState('');
  const [sourceOfCash, setSourceOfCash] = useState('');
  const [refNo, setRefNo] = useState('');
  const [depositedBy, setDepositedBy] = useState('');

  // 2. Log New Creditor Modal
  const [showCreditorModal, setShowCreditorModal] = useState(false);
  const [newVendor, setNewVendor] = useState('');
  const [newVendorDesc, setNewVendorDesc] = useState('');
  const [newInvoiceNo, setNewInvoiceNo] = useState('');
  const [newVendorAmount, setNewVendorAmount] = useState<number>(0);
  const [newVendorDueDate, setNewVendorDueDate] = useState('');

  // 3. Record Debtor Payment Modal
  const [showDebtorModal, setShowDebtorModal] = useState(false);
  const [activeDebtor, setActiveDebtor] = useState<DebtorRecord | null>(null);
  const [debtorPayAmount, setDebtorPayAmount] = useState<number>(100);

  // 4. Expense Form State
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseCategory, setExpenseCategory] = useState('Utilities');
  const [expensePayee, setExpensePayee] = useState('');
  const [expenseAmount, setExpenseAmount] = useState<number>(0);
  const [expenseMethod, setExpenseMethod] = useState('Check / Voucher');
  const [expenseVoucher, setExpenseVoucher] = useState('');

  const handleDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositAmount || depositAmount <= 0 || !bankName || !accountNo || !sourceOfCash || !depositedBy) {
      alert('Please complete all deposit fields.');
      return;
    }
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
    onAddDeposit(newDep);
    alert(`Deposit slip ($${depositAmount.toFixed(2)}) recorded into parish accounts!`);
    setDepositAmount(0);
    setBankName('');
    setAccountNo('');
    setSourceOfCash('');
    setRefNo('');
    setDepositedBy('');
  };

  const handleAddCreditorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVendor) return;
    if (!newInvoiceNo) {
      alert('Please enter the vendor invoice number.');
      return;
    }
    const newCred: CreditorRecord = {
      id: `cr_${Date.now()}`,
      vendor: newVendor,
      description: newVendorDesc || 'Parish Services',
      invoiceNo: newInvoiceNo,
      amountOwed: newVendorAmount,
      dueDate: newVendorDueDate || 'Next Month',
      status: 'Pending'
    };
    onAddCreditor(newCred);
    setShowCreditorModal(false);
    setNewVendor('');
    setNewVendorDesc('');
    setNewInvoiceNo('');
    setNewVendorAmount(0);
    setNewVendorDueDate('');
    alert(`New debt invoice recorded for ${newVendor}!`);
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expensePayee || !expenseAmount || expenseAmount <= 0) {
      alert('Please enter a payee and a positive amount.');
      return;
    }
    const newExp: ExpenseRecord = {
      id: `exp_${Date.now()}`,
      date: expenseDate,
      category: expenseCategory,
      description: expensePayee,
      amount: expenseAmount,
      paymentMethod: expenseMethod,
      voucherNo: expenseVoucher.trim()
    };
    onAddExpense(newExp);
    alert(`Expense voucher ($${expenseAmount.toFixed(2)}) saved!`);
    setExpensePayee('');
    setExpenseAmount(0);
    setExpenseVoucher('');
  };

  const totalCreditorsOwed = creditors.reduce((sum, c) => sum + (c.status !== 'Paid' ? c.amountOwed : 0), 0);
  const totalDebtorsOwed = debtors.reduce((sum, d) => sum + (d.status !== 'Paid' ? d.amount : 0), 0);
  const overdueCreditors = creditors.filter((c) => c.status === 'Overdue').length;
  const paidDebtors = debtors.filter((d) => d.status === 'Paid').length;
  const collectionRate = debtors.length > 0 ? Math.round((paidDebtors / debtors.length) * 1000) / 10 : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title & Navigation Sub-Tabs */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Finance & Accounting
          </h2>
          <p className="text-xs text-[#444748]">
            Manage bank deposits, accounts payable (creditors), receivable (debtors) and expenses
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
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

      {/* 1. MAKE DEPOSIT */}
      {subTab === 'make_deposit' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-[#e1e3e3]">
            <div>
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                BANK DEPOSIT RECORDING
              </h3>
              <p className="text-xs text-[#444748]">
                Record cash collections deposited into official parish bank accounts
              </p>
            </div>
            <span className="text-xs font-mono bg-[#f4f3f3] text-[#1e1e1e] px-2.5 py-1 rounded border border-[#e1e3e3]">
              Audit Integrity Check: Active
            </span>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            <span>
              Accounting Integrity Alert: All cash deposits require verified bank teller slips before final audit reconciliation.
            </span>
          </div>

          <form onSubmit={handleDepositSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposit Date
                </label>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Amount Collected ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Bank Name
                </label>
                <select
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="">Select Bank...</option>
                  <option value="National Catholic Bank">National Catholic Bank</option>
                  <option value="Ecclesia Trust Bank">Ecclesia Trust Bank</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Bank Account No
                </label>
                <select
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="">Select Account...</option>
                  <option value="General Parish Operating">General Parish Operating</option>
                  <option value="Building & Restoration">Building & Restoration</option>
                  <option value="Diocesan Development">Diocesan Development</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Source of Cash
                </label>
                <select
                  value={sourceOfCash}
                  onChange={(e) => setSourceOfCash(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="">Select Source...</option>
                  <option value="Weekly Mass Offerings">Weekly Mass Offerings</option>
                  <option value="Tithe Direct">Tithe Direct</option>
                  <option value="Building Fund Pledges">Building Fund Pledges</option>
                  <option value="Event Sacramental Fees">Event Sacramental Fees</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposit Slip / Ref No
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={refNo}
                  onChange={(e) => setRefNo(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Deposited By
                </label>
                <input
                  type="text"
                  value={depositedBy}
                  onChange={(e) => setDepositedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDepositAmount(0)}
                className="px-4 py-2 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded cursor-pointer"
              >
                Clear Form
              </button>
              <button
                type="submit"
                className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">account_balance_wallet</span>
                Save & Record Deposit
              </button>
            </div>
          </form>

          {/* Recent Deposits Table */}
          <div className="pt-6 border-t border-[#e1e3e3] space-y-3">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              RECENT BANK DEPOSITS
            </h4>
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    <th className="p-3">Ref Slip</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Bank & Account</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Depositor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {deposits.map((d) => (
                    <tr key={d.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-mono font-bold text-[#1e1e1e]">{d.refNo}</td>
                      <td className="p-3 text-[#444748]">{d.date}</td>
                      <td className="p-3 text-[#1a1c1c]">
                        {d.bankName} ({d.accountNo})
                      </td>
                      <td className="p-3 text-[#444748]">{d.sourceOfCash}</td>
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-[#444748]">{d.depositedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. CREDITORS */}
      {subTab === 'creditors' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                  CREDITORS & ACCOUNTS PAYABLE
                </h3>
                <span className="px-2 py-0.5 text-[10px] bg-red-100 text-red-800 rounded font-bold">
                  {overdueCreditors} {overdueCreditors === 1 ? 'Invoice' : 'Invoices'} Overdue
                </span>
              </div>
              <p className="text-xs text-[#444748] mt-1">
                Total Outstanding:{' '}
                <strong className="text-[#1a1c1c] text-sm">
                  ${totalCreditorsOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>{' '}
                across verified vendors
              </p>
            </div>

            <button
              onClick={() => setShowCreditorModal(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">add</span>
              Log New Debt Invoice
            </button>
          </div>

          {/* Creditors Table */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    <th className="p-3">Vendor / Supplier</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Invoice #</th>
                    <th className="p-3">Amount Owed</th>
                    <th className="p-3">Due Date</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {creditors.map((cred) => (
                    <tr key={cred.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-bold text-[#1a1c1c]">{cred.vendor}</td>
                      <td className="p-3 text-[#444748]">{cred.description}</td>
                      <td className="p-3 font-mono text-[#1e1e1e]">{cred.invoiceNo}</td>
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${cred.amountOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-[#444748]">{cred.dueDate}</td>
                      <td className="p-3">
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
                      </td>
                      <td className="p-3 text-right">
                        {cred.status !== 'Paid' && (
                          <button
                            onClick={() => onMarkCreditorPaid(cred.id)}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                          >
                            Mark Paid
                          </button>
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

      {/* 3. DEBTORS */}
      {subTab === 'debtors' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                DEBTORS & PLEDGE RECEIVABLES
              </h3>
              <p className="text-xs text-[#444748] mt-1">
                Outstanding Pledges:{' '}
                <strong className="text-[#1a1c1c] text-sm">
                  ${totalDebtorsOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </strong>{' '}
                • Collection Rate: {collectionRate}%
              </p>
            </div>

            <div className="w-48 bg-[#f4f3f3] h-3 rounded-full overflow-hidden border border-[#e1e3e3]">
              <div className="bg-[#1e1e1e] h-full" style={{ width: `${collectionRate}%` }} />
            </div>
          </div>

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    <th className="p-3">Member Name</th>
                    <th className="p-3">Contribution / Pledge Type</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {debtors.map((debt) => (
                    <tr key={debt.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-bold text-[#1a1c1c]">{debt.memberName}</td>
                      <td className="p-3 text-[#444748]">{debt.contributionType}</td>
                      <td className="p-3 font-bold text-[#1e1e1e]">
                        ${debt.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3">
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
                      </td>
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. EXPENSES */}
      {subTab === 'expenses' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-[#e1e3e3]">
            <div>
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                PARISH EXPENSE LOG & VOUCHER ENTRY
              </h3>
              <p className="text-xs text-[#444748]">
                Log operating expenses, sanctuary upkeep, and liturgical supplies
              </p>
            </div>
          </div>

          <form onSubmit={handleExpenseSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">Date</label>
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
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="Utilities">Utilities</option>
                  <option value="Sanctuary Maintenance">Sanctuary Maintenance</option>
                  <option value="Liturgical Supplies">Liturgical Supplies</option>
                  <option value="Personnel Stipend">Personnel Stipend</option>
                  <option value="Youth Ministry">Youth Ministry</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Description / Payee
                </label>
                <input
                  type="text"
                  value={expensePayee}
                  onChange={(e) => setExpensePayee(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Amount Paid ($)
                </label>
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
                <select
                  value={expenseMethod}
                  onChange={(e) => setExpenseMethod(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="Check / Voucher">Check / Voucher</option>
                  <option value="Cash Petty Fund">Cash Petty Fund</option>
                  <option value="M-Pesa Direct">M-Pesa Direct</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Voucher Number
                </label>
                <input
                  type="text"
                  placeholder="Auto-generated if left blank"
                  value={expenseVoucher}
                  onChange={(e) => setExpenseVoucher(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end gap-3">
              <button
                type="submit"
                className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">receipt</span>
                Save & Record Expense
              </button>
            </div>
          </form>

          {/* Recent Expenses List */}
          <div className="pt-6 border-t border-[#e1e3e3] space-y-3">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              RECENT EXPENSE VOUCHERS
            </h4>
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase">
                    <th className="p-3">Voucher #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description / Payee</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Payment Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-mono font-bold text-[#1e1e1e]">{exp.voucherNo}</td>
                      <td className="p-3 text-[#444748]">{exp.date}</td>
                      <td className="p-3 text-[#1a1c1c]">{exp.category}</td>
                      <td className="p-3 text-[#444748]">{exp.description}</td>
                      <td className="p-3 font-bold text-[#ba1a1a]">
                        ${exp.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-[#444748]">{exp.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LOG NEW CREDITOR MODAL */}
      {showCreditorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Log New Debt Invoice</h4>
            <form onSubmit={handleAddCreditorSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#444748] mb-1">Vendor / Supplier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Beacon Structural Eng."
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              <div>
                <label className="block text-[#444748] mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Roof Repair"
                  value={newVendorDesc}
                  onChange={(e) => setNewVendorDesc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              <div>
                <label className="block text-[#444748] mb-1">Invoice #</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. INV-2024-0012"
                  value={newInvoiceNo}
                  onChange={(e) => setNewInvoiceNo(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#444748] mb-1">Amount ($)</label>
                  <input
                    type="number"
                    value={newVendorAmount}
                    onChange={(e) => setNewVendorAmount(Number(e.target.value))}
                    className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[#444748] mb-1">Due Date</label>
                  <input
                    type="text"
                    placeholder="e.g. Nov 15, 2024"
                    value={newVendorDueDate}
                    onChange={(e) => setNewVendorDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                <button
                  type="button"
                  onClick={() => setShowCreditorModal(false)}
                  className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded cursor-pointer"
                >
                  Save Debt Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECORD DEBTOR PAYMENT MODAL */}
      {showDebtorModal && activeDebtor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
            <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Record Pledge Payment</h4>
            <div className="text-xs space-y-1">
              <p>
                <strong>Member:</strong> {activeDebtor.memberName}
              </p>
              <p>
                <strong>Pledge Type:</strong> {activeDebtor.contributionType}
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-medium">Payment Amount Received ($)</label>
              <input
                type="number"
                value={debtorPayAmount}
                onChange={(e) => setDebtorPayAmount(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-sm font-bold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
              <button
                onClick={() => setShowDebtorModal(false)}
                className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRecordDebtorPayment(activeDebtor.id, debtorPayAmount);
                  setShowDebtorModal(false);
                  setActiveDebtor(null);
                  alert(`Pledge payment recorded!`);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] rounded cursor-pointer"
              >
                Confirm Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
