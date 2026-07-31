import React, { useState } from 'react';
import { AdminSubTab } from '../../types';

export const AdminView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('rights');

  // Selected staff member for rights management
  const [selectedStaff, setSelectedStaff] = useState('Evelyn Vance (Administrator)');

  // Panel Permissions State
  const [panels, setPanels] = useState({
    christian: true,
    activities: true,
    sacraments: true,
    finance: false,
    ledgers: false,
    inventory: true,
    reports: true,
    hr: false,
    administration: true
  });

  // Action Permissions State
  const [actions, setActions] = useState({
    view: true,
    edit: true,
    delete: false
  });

  // Online & Push Payments state
  const [paybill, setPaybill] = useState('522522');
  const [accountFormat, setAccountFormat] = useState('ST MARYS PARISH TITHE');
  const [consumerKey, setConsumerKey] = useState('ck_live_992184019284012');
  const [consumerSecret, setConsumerSecret] = useState('cs_live_449201948201948');
  const [testPhone, setTestPhone] = useState('254700000000');
  const [testAmount, setTestAmount] = useState('100');

  const [notification, setNotification] = useState<string | null>(null);

  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleTogglePanel = (key: keyof typeof panels) => {
    setPanels({ ...panels, [key]: !panels[key] });
  };

  const handleToggleAction = (key: keyof typeof actions) => {
    setActions({ ...actions, [key]: !actions[key] });
  };

  const handleResetRights = () => {
    setPanels({
      christian: true,
      activities: true,
      sacraments: true,
      finance: false,
      ledgers: false,
      inventory: true,
      reports: true,
      hr: false,
      administration: true
    });
    setActions({ view: true, edit: true, delete: false });
    showNotif('Permissions reset to default role profile.');
  };

  const handleSaveRights = (e: React.FormEvent) => {
    e.preventDefault();
    showNotif(`Access permissions updated for ${selectedStaff}!`);
  };

  const handleSendTestStk = (e: React.FormEvent) => {
    e.preventDefault();
    showNotif(`STK Push prompt sent to ${testPhone} for KES ${testAmount}.`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">System Access Management</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Configure role rights, system security, panel permissions, and online & push payment gateways."
          </p>
        </div>
      </div>

      {/* Sub-tab Navigation Links */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase">
        <button
          onClick={() => setActiveSubTab('rights')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'rights'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          RIGHTS CENTRE
        </button>
        <button
          onClick={() => setActiveSubTab('push_payments')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'push_payments'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          ONLINE & PUSH PAYMENTS
        </button>
      </div>

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. RIGHTS CENTRE */}
      {activeSubTab === 'rights' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6 max-w-4xl">
          <div>
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">System Access Management</h3>
            <p className="text-xs text-[#444748] mt-1">
              Configure granular security clearance and module access for parish staff and clergy.
            </p>
          </div>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
            <label className="block text-xs font-bold text-[#1a1c1c]">Select Staff Member</label>
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
            >
              <option value="Evelyn Vance (Administrator)">Evelyn Vance (Administrator)</option>
              <option value="Fr. Thomas (Priest-in-Charge)">Fr. Thomas (Priest-in-Charge)</option>
              <option value="Sarah Jenkins (Head Cashier)">Sarah Jenkins (Head Cashier)</option>
              <option value="Peter Njuguna (Inventory Clerk)">Peter Njuguna (Inventory Clerk)</option>
            </select>
            <p className="text-[10px] text-[#777777] italic">
              Modifying permissions for the selected staff account.
            </p>
          </div>

          <form onSubmit={handleSaveRights} className="space-y-6 text-xs">
            {/* Panel Access Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                PANEL ACCESS PERMISSIONS
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { key: 'christian', label: 'Christian Directory' },
                  { key: 'activities', label: 'Activities & Payments' },
                  { key: 'sacraments', label: 'Sacramental Registry' },
                  { key: 'finance', label: 'Finance & Banking' },
                  { key: 'ledgers', label: 'General Ledgers' },
                  { key: 'inventory', label: 'Inventory Vault' },
                  { key: 'reports', label: 'Reporting Panel' },
                  { key: 'hr', label: 'Human Resources' },
                  { key: 'administration', label: 'Administration' }
                ].map((item) => {
                  const k = item.key as keyof typeof panels;
                  return (
                    <label key={k} className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors">
                      <input
                        type="checkbox"
                        checked={panels[k]}
                        onChange={() => handleTogglePanel(k)}
                        className="accent-[#1e1e1e] w-4 h-4"
                      />
                      <span className="font-medium text-[#1a1c1c]">{item.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Level Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                ACTION LEVEL PERMISSIONS
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {[
                  { key: 'view', label: 'View Records' },
                  { key: 'edit', label: 'Create / Edit Records' },
                  { key: 'delete', label: 'Delete Records' }
                ].map((act) => {
                  const k = act.key as keyof typeof actions;
                  return (
                    <label key={k} className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors">
                      <input
                        type="checkbox"
                        checked={actions[k]}
                        onChange={() => handleToggleAction(k)}
                        className="accent-[#1e1e1e] w-4 h-4"
                      />
                      <span className="font-medium text-[#1a1c1c]">{act.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="p-3 bg-[#e1e3e3] rounded text-[11px] text-[#444748] italic mt-2">
                "Delete actions are globally logged and require a reason for audit trails."
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetRights}
                className="px-4 py-2 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
              >
                RESET RIGHTS
              </button>
              <button
                type="submit"
                className="px-6 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
              >
                SAVE PERMISSIONS
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. ONLINE & PUSH PAYMENTS */}
      {activeSubTab === 'push_payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
          <div className="lg:col-span-7 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Payment Gateway Settings</h3>
            <p className="text-xs text-[#444748]">
              Configure mobile M-Pesa STK push API credentials and till numbers for direct parish collections.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); showNotif("Gateway configuration saved!"); }} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Paybill / Till Number</label>
                <input
                  type="text"
                  value={paybill}
                  onChange={(e) => setPaybill(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Account Name Format</label>
                <input
                  type="text"
                  value={accountFormat}
                  onChange={(e) => setAccountFormat(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Consumer Key</label>
                  <input
                    type="password"
                    value={consumerKey}
                    onChange={(e) => setConsumerKey(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Consumer Secret</label>
                  <input
                    type="password"
                    value={consumerSecret}
                    onChange={(e) => setConsumerSecret(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                >
                  Save Gateway Credentials
                </button>
              </div>
            </form>
          </div>

          {/* Test STK Push Simulator */}
          <div className="lg:col-span-5 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
              STK PUSH SIMULATOR
            </h4>
            <p className="text-xs text-[#444748]">
              Test real-time payment triggers directly on a test mobile line.
            </p>

            <form onSubmit={handleSendTestStk} className="space-y-3 text-xs">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Mobile Phone Number</label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                />
              </div>

              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Amount (KES)</label>
                <input
                  type="number"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-bold"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">send_to_mobile</span>
                Send Test STK Push
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
