import React, { useState } from 'react';
import { LedgersSubTab } from '../../types';

export const LedgersView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<LedgersSubTab>('mgmt');

  // Ledger state
  const [ledgers, setLedgers] = useState([
    { id: '1', name: 'Parish Main Cash', code: 'LDR-101', type: 'Asset', cashier: 'Mary Magdalene', balance: 12450.0 },
    { id: '2', name: 'Weekly Tithes', code: 'LDR-205', type: 'Revenue', cashier: 'Peter Fisher', balance: 8920.0 },
    { id: '3', name: 'Youth Outreach Fund', code: 'LDR-310', type: 'Petty Cash', cashier: 'John Beloved', balance: 1200.0 },
    { id: '4', name: 'Emergency Repair', code: 'LDR-99', type: 'Asset', cashier: 'Mary Magdalene', balance: 2850.0 },
    { id: '5', name: 'Liturgical Maintenance', code: 'LDR-402', type: 'Expense', cashier: 'Sarah Jenkins', balance: 3400.0 }
  ]);

  // Create Ledger Form State
  const [ledgerName, setLedgerName] = useState('');
  const [accountType, setAccountType] = useState('Asset');
  const [assignedCashier, setAssignedCashier] = useState('Mary Magdalene');
  const [initialBalance, setInitialBalance] = useState<string>('');
  const [description, setDescription] = useState('');

  // Inter-Ledger Transfer Form State
  const [sourceLedger, setSourceLedger] = useState('Parish Main Cash');
  const [destLedger, setDestLedger] = useState('Liturgical Maintenance');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferDate, setTransferDate] = useState('24th Oct, 2023');
  const [transferNotes, setTransferNotes] = useState('');

  // Recent Movements Log
  const [movements, setMovements] = useState([
    { id: 'm1', amount: 1200.0, time: 'Today, 09:12 AM', from: 'Gen. Fund', to: 'Maintenance' },
    { id: 'm2', amount: 5500.0, time: 'Yesterday', from: 'Donations', to: 'Restoration' },
    { id: 'm3', amount: 450.0, time: '22 Oct', from: 'Petty Cash', to: 'Office Supp.' }
  ]);

  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleClearForm = () => {
    setLedgerName('');
    setInitialBalance('');
    setDescription('');
  };

  const handleSaveLedger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerName) return;
    const newCode = `LDR-${Math.floor(100 + Math.random() * 900)}`;
    const newLedger = {
      id: Date.now().toString(),
      name: ledgerName,
      code: newCode,
      type: accountType,
      cashier: assignedCashier,
      balance: parseFloat(initialBalance) || 0.0
    };
    setLedgers([newLedger, ...ledgers]);
    handleClearForm();
    showNotification(`Ledger "${ledgerName}" created with code ${newCode}!`);
  };

  const handleExecuteTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) {
      alert('Please enter a valid transfer amount.');
      return;
    }
    const newMv = {
      id: Date.now().toString(),
      amount: amt,
      time: 'Just Now',
      from: sourceLedger.split(' ')[0],
      to: destLedger.split(' ')[0]
    };
    setMovements([newMv, ...movements]);
    setTransferAmount('');
    setTransferNotes('');
    showNotification(`Inter-ledger transfer of $${amt.toFixed(2)} executed from ${sourceLedger} to ${destLedger}!`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Ledger Panel</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Create general ledgers, assign cashiers, and manage fund transfers between different accounts with precision and stewardship."
          </p>
        </div>

        {/* Top Search & Controls */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
              search
            </span>
            <input
              type="text"
              placeholder="Search accounts..."
              className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-48 focus:outline-none focus:border-[#1e1e1e]"
            />
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="flex border-b border-[#e1e3e3] gap-8 text-xs font-bold tracking-wider uppercase">
        <button
          onClick={() => setActiveSubTab('mgmt')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'mgmt'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          LEDGER & CASHIER MGMT
        </button>
        <button
          onClick={() => setActiveSubTab('transfer')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'transfer'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          INTER-LEDGER TRANSFER
        </button>
      </div>

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* SUB-TAB 1: LEDGER & CASHIER MGMT */}
      {activeSubTab === 'mgmt' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Create Ledger & Assign Cashier Form (5 Cols) */}
          <div className="lg:col-span-5 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
              Create Ledger & Assign Cashier
            </h3>

            <form onSubmit={handleSaveLedger} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Ledger Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Main Cash, Renovations Fund"
                  value={ledgerName}
                  onChange={(e) => setLedgerName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Ledger Code</label>
                <input
                  type="text"
                  disabled
                  placeholder="LDR-2023-XXXX"
                  className="w-full px-3 py-2 bg-[#eeeeee] border border-[#e1e3e3] rounded text-xs text-[#777777] font-mono cursor-not-allowed"
                />
                <p className="text-[10px] text-[#777777] italic mt-1">
                  Code is automatically generated upon saving.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Account Type</label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    <option value="Asset">Asset</option>
                    <option value="Revenue">Revenue</option>
                    <option value="Petty Cash">Petty Cash</option>
                    <option value="Equity">Equity</option>
                    <option value="Expense">Expense</option>
                    <option value="Liability">Liability</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Assign Cashier</label>
                  <select
                    value={assignedCashier}
                    onChange={(e) => setAssignedCashier(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    <option value="Mary Magdalene">Mary Magdalene</option>
                    <option value="Peter Fisher">Peter Fisher</option>
                    <option value="John Beloved">John Beloved</option>
                    <option value="Sarah Jenkins">Sarah Jenkins</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Initial Balance</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-[#444748]">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  placeholder="Brief purpose of this ledger..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="flex-1 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded transition-colors cursor-pointer"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer"
                >
                  Save Ledger Record
                </button>
              </div>
            </form>
          </div>

          {/* Active Ledgers Directory & Sacred Stewardship Card (7 Cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-[#e1e3e3] pb-3">
                <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
                  Active Ledgers Directory
                </h3>
                <button
                  onClick={() => alert('Filtering options applied.')}
                  className="text-xs font-medium text-[#444748] hover:text-[#1a1c1c] flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">filter_list</span>
                  Filter
                </button>
              </div>

              <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                      <th className="p-3">Ledger Name</th>
                      <th className="p-3">Code</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Cashier</th>
                      <th className="p-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e1e3e3]">
                    {ledgers.map((ldr) => (
                      <tr key={ldr.id} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{ldr.name}</td>
                        <td className="p-3 font-mono text-[11px] text-[#444748]">{ldr.code}</td>
                        <td className="p-3 text-[#1a1c1c]">{ldr.type}</td>
                        <td className="p-3 italic text-[#444748]">{ldr.cashier}</td>
                        <td className="p-3 font-bold text-right text-[#1e1e1e]">
                          ${ldr.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-xs text-[#444748] pt-2">
                <span>Showing {ledgers.length} of 12 ledgers</span>
                <div className="flex gap-1">
                  <button className="px-2 py-1 border border-[#e1e3e3] rounded hover:bg-[#f4f3f3]">
                    &lt;
                  </button>
                  <button className="px-2 py-1 border border-[#e1e3e3] rounded hover:bg-[#f4f3f3]">
                    &gt;
                  </button>
                </div>
              </div>
            </div>

            {/* Sacred Stewardship Quote Box */}
            <div className="bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl p-6 flex items-start gap-4">
              <div className="p-2.5 rounded-lg bg-[#ffffff] border border-[#e1e3e3] text-[#1e1e1e]">
                <span className="material-symbols-outlined text-2xl">account_balance</span>
              </div>
              <div>
                <h4 className="text-sm font-serif font-bold text-[#1a1c1c]">Sacred Stewardship</h4>
                <p className="text-xs text-[#444748] italic mt-1 leading-relaxed">
                  "His master replied, 'Well done, good and faithful servant! You have been faithful with a few things; I will put you in charge of many things.'"
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INTER-LEDGER TRANSFER */}
      {activeSubTab === 'transfer' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Transfer Form (8 Cols) */}
          <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#e1e3e3] pb-3">
              <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
                Inter-Ledger Transfer Form
              </h3>
              <span className="px-2.5 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] font-mono text-[#444748]">
                REF: ILT-2023-0842
              </span>
            </div>

            <form onSubmit={handleExecuteTransfer} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">
                    Source Ledger (From)
                  </label>
                  <select
                    value={sourceLedger}
                    onChange={(e) => setSourceLedger(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-[#444748] italic mt-1">
                    Available balance: $42,250.00
                  </p>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">
                    Destination Ledger (To)
                  </label>
                  <select
                    value={destLedger}
                    onChange={(e) => setDestLedger(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.name}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">
                    Transfer Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-[#444748]">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Transfer Date</label>
                  <input
                    type="text"
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">
                  Authorization / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide justification or reference for this internal movement..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
                <button
                  type="button"
                  onClick={() => setTransferAmount('')}
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">sync_alt</span>
                  Execute Fund Transfer
                </button>
              </div>
            </form>
          </div>

          {/* Recent Internal Movements & Sacred Stewardship Dark Card (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-[#e1e3e3] pb-2 text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                <span className="material-symbols-outlined text-base">history</span>
                RECENT INTERNAL MOVEMENTS
              </div>

              <div className="space-y-3">
                {movements.map((mv) => (
                  <div key={mv.id} className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3] space-y-1">
                    <div className="flex justify-between items-center text-xs font-bold text-[#1a1c1c]">
                      <span>${mv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-[#444748] font-normal">{mv.time}</span>
                    </div>
                    <div className="text-[11px] text-[#444748] flex items-center gap-1">
                      <span>{mv.from}</span>
                      <span className="material-symbols-outlined text-xs">arrow_forward</span>
                      <span>{mv.to}</span>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => alert("Displaying full inter-ledger audit logs.")}
                className="w-full py-2 text-xs text-[#1a1c1c] hover:bg-[#f4f3f3] border border-[#e1e3e3] rounded font-medium cursor-pointer"
              >
                View Full Audit History
              </button>
            </div>

            {/* Sacred Stewardship Dark Card */}
            <div className="bg-[#1e1e1e] text-white rounded-xl p-6 shadow-md space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-amber-400">shield</span>
                <h4 className="text-sm font-serif font-bold tracking-wide">Sacred Stewardship</h4>
              </div>
              <p className="text-xs text-[#e1e3e3] leading-relaxed">
                Ensure every cent is accounted for. These records form the temporal foundation of our spiritual mission.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
