import React, { useState, useEffect } from 'react';
import {
  AdminSubTab,
  PanelPermissions,
  PushPaymentSettings,
  UserAccount,
  UserRole
} from '../../types';
import { adminApi } from '../../services/api';

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer'
};

const PANEL_ITEMS: { key: keyof PanelPermissions['panels']; label: string }[] = [
  { key: 'christian', label: 'Christian Directory' },
  { key: 'activities', label: 'Activities & Payments' },
  { key: 'sacraments', label: 'Sacramental Registry' },
  { key: 'finance', label: 'Finance & Banking' },
  { key: 'ledgers', label: 'General Ledgers' },
  { key: 'inventory', label: 'Inventory Vault' },
  { key: 'reports', label: 'Reporting Panel' },
  { key: 'hr', label: 'Human Resources' },
  { key: 'administration', label: 'Administration' }
];

const ACTION_ITEMS: { key: keyof PanelPermissions['actions']; label: string }[] = [
  { key: 'view', label: 'View Records' },
  { key: 'edit', label: 'Create / Edit Records' },
  { key: 'delete', label: 'Delete Records' }
];

const ALL_PANELS: PanelPermissions['panels'] = {
  christian: true,
  activities: true,
  sacraments: true,
  finance: true,
  ledgers: true,
  inventory: true,
  reports: true,
  hr: true,
  administration: true
};

export const AdminView: React.FC<{ currentUserId: string | null }> = ({ currentUserId }) => {
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('rights');

  // User accounts
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Add User Modal
  const [showAddUser, setShowAddUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newTitle, setNewTitle] = useState('');

  // Edit User Modal
  const [showEditUser, setShowEditUser] = useState(false);
  const [editUserId, setEditUserId] = useState<string>('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editPassword, setEditPassword] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Delete confirm
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Panel Permissions State (of the selected user)
  const [panels, setPanels] = useState<PanelPermissions['panels']>({ ...ALL_PANELS });
  const [actions, setActions] = useState<PanelPermissions['actions']>({
    view: true,
    edit: true,
    delete: true
  });

  // Online & Push Payments state
  const [paybill, setPaybill] = useState('');
  const [accountFormat, setAccountFormat] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [testPhone, setTestPhone] = useState('254700000000');
  const [testAmount, setTestAmount] = useState('100');

  const [notification, setNotification] = useState<string | null>(null);

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const isSelf = (userId: string) => userId === currentUserId;

  const loadPermissions = async (userId: string) => {
    try {
      const p = await adminApi.permissions.get(userId);
      setPanels(p.panels);
      setActions(p.actions);
    } catch (error) {
      console.error('Failed to load panel permissions', error);
    }
  };

  const loadUsers = async () => {
    try {
      const rows = await adminApi.users.list();
      setUsers(rows);
      if (rows.length > 0) {
        setSelectedUserId(rows[0].id);
        await loadPermissions(rows[0].id);
      }
    } catch (error) {
      console.error('Failed to load users', error);
    }
  };

  useEffect(() => {
    void loadUsers();
    adminApi.pushPayments
      .get()
      .then((s: PushPaymentSettings) => {
        setPaybill(s.paybill);
        setAccountFormat(s.accountFormat);
        setConsumerKey(s.consumerKey);
        setConsumerSecret(s.consumerSecret);
        setTestPhone(s.testPhone);
        setTestAmount(s.testAmount);
      })
      .catch((error) => console.error('Failed to load push payment settings', error));
  }, []);

  const handleSelectUser = async (userId: string) => {
    setSelectedUserId(userId);
    await loadPermissions(userId);
  };

  const handleTogglePanel = (key: keyof typeof panels) => {
    setPanels({ ...panels, [key]: !panels[key] });
  };

  const handleToggleAction = (key: keyof typeof actions) => {
    setActions({ ...actions, [key]: !actions[key] });
  };

  const handleResetRights = () => {
    setPanels({ ...ALL_PANELS });
    setActions({ view: true, edit: true, delete: true });
    showNotif('Permissions reset to full access.');
  };

  const handleSaveRights = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      alert('Please select a user first.');
      return;
    }
    try {
      await adminApi.permissions.update(selectedUserId, { panels, actions });
      showNotif(`Access permissions updated for ${selectedUser?.name ?? 'user'}!`);
    } catch (error) {
      console.error('Failed to save permissions', error);
      alert(error instanceof Error ? error.message : 'Failed to save permissions');
    }
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newEmail || !newPassword) {
      alert('Please fill in name, email and password.');
      return;
    }
    try {
      const created = await adminApi.users.create({
        name: newName,
        email: newEmail,
        password: newPassword,
        role: newRole,
        title: newTitle || undefined,
      });
      setUsers([...users, created]);
      setShowAddUser(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('staff');
      setNewTitle('');
      showNotif(`User account created for ${created.name}.`);
    } catch (error) {
      console.error('Failed to create user', error);
      alert(error instanceof Error ? error.message : 'Failed to create user');
    }
  };

  const openEditUser = (u: UserAccount) => {
    setEditUserId(u.id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditTitle(u.title ?? '');
    setEditRole(u.role);
    setEditPassword('');
    setEditActive(u.isActive);
    setShowEditUser(true);
  };

  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserId) return;
    try {
      const body: any = { name: editName, email: editEmail, title: editTitle || undefined, role: editRole, isActive: editActive };
      if (editPassword) body.password = editPassword;
      const updated = await adminApi.users.update(editUserId, body);
      setUsers(users.map((u) => (u.id === editUserId ? updated : u)));
      setShowEditUser(false);
      showNotif(`User ${updated.name} updated.`);
    } catch (error) {
      console.error('Failed to update user', error);
      alert(error instanceof Error ? error.message : 'Failed to update user');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Remove this user account permanently? This action cannot be undone.')) return;
    try {
      await adminApi.users.remove(userId);
      setUsers(users.filter((u) => u.id !== userId));
      if (selectedUserId === userId && users.length > 1) {
        const next = users.find((u) => u.id !== userId);
        if (next) {
          setSelectedUserId(next.id);
          await loadPermissions(next.id);
        }
      }
      setDeleteTargetId(null);
      showNotif('User removed.');
    } catch (error) {
      console.error('Failed to remove user', error);
      alert(error instanceof Error ? error.message : 'Failed to remove user');
    }
  };

  const handleUpdateRole = async (user: UserAccount, role: UserRole) => {
    try {
      const updated = await adminApi.users.update(user.id, { role });
      setUsers(users.map((u) => (u.id === user.id ? updated : u)));
      showNotif(`Role updated for ${updated.name}: ${ROLE_LABELS[role]}`);
    } catch (error) {
      console.error('Failed to update role', error);
      alert(error instanceof Error ? error.message : 'Failed to update role');
    }
  };

  const handleToggleActive = async (user: UserAccount) => {
    try {
      const updated = await adminApi.users.update(user.id, { isActive: !user.isActive });
      setUsers(users.map((u) => (u.id === user.id ? updated : u)));
      showNotif(`${updated.name} account ${updated.isActive ? 'activated' : 'deactivated'}.`);
    } catch (error) {
      console.error('Failed to toggle active', error);
      alert(error instanceof Error ? error.message : 'Failed to toggle active');
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.pushPayments.update({
        paybill,
        accountFormat,
        consumerKey,
        consumerSecret,
        testPhone,
        testAmount
      });
      showNotif('Gateway configuration saved!');
    } catch (error) {
      console.error('Failed to save gateway settings', error);
      alert(error instanceof Error ? error.message : 'Failed to save gateway settings');
    }
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
            Manage user accounts, role authorities, panel permissions, and online & push payment gateways.
          </p>
        </div>
      </div>

      {/* Sub-tab Navigation Links */}
      <div className="flex flex-wrap border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase">
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
          onClick={() => setActiveSubTab('users')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'users'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          USERS
        </button>
        <button
          onClick={() => setActiveSubTab('push_payments')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'push_payments'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          PUSH PAYMENTS
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
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Per-User Authority Centre</h3>
            <p className="text-xs text-[#444748] mt-1">
              Configure granular security clearance and module access for each parish user account.
            </p>
          </div>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
            <label className="block text-xs font-bold text-[#1a1c1c]">Select User Account</label>
            <select
              value={selectedUserId}
              onChange={(e) => void handleSelectUser(e.target.value)}
              className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
            >
              {users.length === 0 && <option value="">No users yet</option>}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#777777] italic">
              Modifying access for the selected account. Changes take effect at next login.
            </p>
          </div>

          <form onSubmit={handleSaveRights} className="space-y-6 text-xs">
            {/* Panel Access Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                PANEL ACCESS PERMISSIONS
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {PANEL_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={panels[item.key]}
                      onChange={() => handleTogglePanel(item.key)}
                      className="accent-[#1e1e1e] w-4 h-4"
                    />
                    <span className="font-medium text-[#1a1c1c]">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Action Level Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                ACTION LEVEL PERMISSIONS
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {ACTION_ITEMS.map((act) => (
                  <label
                    key={act.key}
                    className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={actions[act.key]}
                      onChange={() => handleToggleAction(act.key)}
                      className="accent-[#1e1e1e] w-4 h-4"
                    />
                    <span className="font-medium text-[#1a1c1c]">{act.label}</span>
                  </label>
                ))}
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
                RESET TO FULL ACCESS
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

      {/* 2. USERS */}
      {activeSubTab === 'users' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish User Accounts</h3>
              <p className="text-xs text-[#444748] mt-1">
                Create accounts for staff and clergy, assign roles, and control who can sign in.
              </p>
            </div>
            <button
              onClick={() => setShowAddUser(true)}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">person_add</span>
              Add New User
            </button>
          </div>

           <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
             <table className="w-full text-left border-collapse text-xs">
               <thead>
                 <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                   <th className="p-3">Name</th>
                   <th className="p-3">Title</th>
                   <th className="p-3">Email</th>
                   <th className="p-3">Role</th>
                   <th className="p-3 text-center">Status</th>
                   <th className="p-3 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-[#e1e3e3]">
                 {users.length === 0 ? (
                   <tr>
                     <td colSpan={6} className="p-6 text-center text-[#444748]">
                       No user accounts yet. Click "Add New User" to create one.
                     </td>
                   </tr>
                 ) : (
                   users.map((u) => (
                     <tr key={u.id} className="hover:bg-[#f9f9f9]">
                       <td className="p-3 font-bold text-[#1a1c1c]">{u.name}</td>
                       <td className="p-3 text-[#444748]">{u.title ?? '—'}</td>
                       <td className="p-3 text-[#444748]">{u.email}</td>
                       <td className="p-3">
                         <select
                           value={u.role}
                           onChange={(e) => void handleUpdateRole(u, e.target.value as UserRole)}
                           className="px-2 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] font-semibold text-[#1a1c1c]"
                         >
                           {Object.entries(ROLE_LABELS).map(([value, label]) => (
                             <option key={value} value={value}>
                               {label}
                             </option>
                           ))}
                         </select>
                       </td>
                       <td className="p-3 text-center">
                         <span
                           className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                             u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                           }`}
                         >
                           {u.isActive ? 'ACTIVE' : 'DISABLED'}
                         </span>
                       </td>
                       <td className="p-3 text-right space-x-2">
                         <button
                           onClick={() => openEditUser(u)}
                           className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
                         >
                           Edit
                         </button>
                         <button
                           onClick={() => void handleToggleActive(u)}
                           className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
                         >
                           {u.isActive ? 'Disable' : 'Enable'}
                         </button>
                         <button
                           onClick={() => setDeleteTargetId(u.id)}
                           disabled={isSelf(u.id)}
                           className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer ${
                             isSelf(u.id)
                               ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                               : 'bg-red-100 text-red-700 hover:bg-red-200'
                           }`}
                         >
                           Remove
                         </button>
                         <button
                           onClick={() => {
                             setSelectedUserId(u.id);
                             setActiveSubTab('rights');
                           }}
                           className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                         >
                           Permissions
                         </button>
                       </td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>

           {/* Delete Confirmation */}
           {deleteTargetId && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
               <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
                 <h4 className="text-sm font-bold text-[#1a1c1c]">Remove User Account</h4>
                 <p className="text-xs text-[#444748]">
                   Are you sure you want to permanently remove this user? This action cannot be undone.
                 </p>
                 <div className="flex justify-end gap-2 pt-2">
                   <button
                     onClick={() => setDeleteTargetId(null)}
                     className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
                   >
                     Cancel
                   </button>
                   <button
                     onClick={() => void handleDeleteUser(deleteTargetId!)}
                     className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded cursor-pointer"
                   >
                     Remove
                   </button>
                 </div>
               </div>
             </div>
           )}
         </div>
       )}

      {/* 3. ONLINE & PUSH PAYMENTS */}
      {activeSubTab === 'push_payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
          <div className="lg:col-span-7 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Payment Gateway Settings</h3>
            <p className="text-xs text-[#444748]">
              Configure mobile M-Pesa STK push API credentials and till numbers for direct parish collections.
            </p>

            <form onSubmit={handleSaveGateway} className="space-y-4 text-xs">
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

       {/* EDIT USER MODAL */}
       {showEditUser && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
           <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
             <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Edit User Account</h4>
             <form onSubmit={handleEditUserSubmit} className="space-y-3 text-xs">
               <div>
                 <label className="block text-[#444748] mb-1">Full Name</label>
                 <input
                   type="text"
                   required
                   value={editName}
                   onChange={(e) => setEditName(e.target.value)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Email Address</label>
                 <input
                   type="email"
                   required
                   value={editEmail}
                   onChange={(e) => setEditEmail(e.target.value)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Title / Role</label>
                 <input
                   type="text"
                   value={editTitle}
                   onChange={(e) => setEditTitle(e.target.value)}
                   placeholder="e.g. Primary Developer"
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Role</label>
                 <select
                   value={editRole}
                   onChange={(e) => setEditRole(e.target.value as UserRole)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                 >
                   <option value="staff">Staff</option>
                   <option value="admin">Admin (Full Oversight)</option>
                   <option value="viewer">Viewer (Read-only)</option>
                 </select>
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">New Password (leave blank to keep current)</label>
                 <input
                   type="password"
                   value={editPassword}
                   onChange={(e) => setEditPassword(e.target.value)}
                   placeholder="••••••••"
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <label className="flex items-center gap-1.5 cursor-pointer">
                 <input
                   type="checkbox"
                   checked={editActive}
                   onChange={(e) => setEditActive(e.target.checked)}
                   className="accent-[#1e1e1e]"
                 />
                 <span className="text-[#1a1c1c]">Active</span>
               </label>
               <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                 <button
                   type="button"
                   onClick={() => setShowEditUser(false)}
                   className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                 >
                   Cancel
                 </button>
                 <button
                   type="submit"
                   className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded cursor-pointer"
                 >
                   Save Changes
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}

       {/* ADD NEW USER MODAL */}
       {showAddUser && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
           <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
             <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Create User Account</h4>
             <form onSubmit={handleAddUserSubmit} className="space-y-3 text-xs">
               <div>
                 <label className="block text-[#444748] mb-1">Full Name</label>
                 <input
                   type="text"
                   required
                   placeholder="e.g. Full Name"
                   value={newName}
                   onChange={(e) => setNewName(e.target.value)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Email Address</label>
                 <input
                   type="email"
                   required
                   placeholder="e.g. name@parish.org"
                   value={newEmail}
                   onChange={(e) => setNewEmail(e.target.value)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Title / Role</label>
                 <input
                   type="text"
                   value={newTitle}
                   onChange={(e) => setNewTitle(e.target.value)}
                   placeholder="e.g. Primary Developer"
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Temporary Password (min 8 chars)</label>
                 <input
                   type="password"
                   required
                   placeholder="••••••••"
                   value={newPassword}
                   onChange={(e) => setNewPassword(e.target.value)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                 />
               </div>
               <div>
                 <label className="block text-[#444748] mb-1">Role</label>
                 <select
                   value={newRole}
                   onChange={(e) => setNewRole(e.target.value as UserRole)}
                   className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                 >
                   <option value="staff">Staff</option>
                   <option value="admin">Admin (Full Oversight)</option>
                   <option value="viewer">Viewer (Read-only)</option>
                 </select>
               </div>
               <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                 <button
                   type="button"
                   onClick={() => setShowAddUser(false)}
                   className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                 >
                   Cancel
                 </button>
                 <button
                   type="submit"
                   className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded cursor-pointer"
                 >
                   Create Account
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}
     </div>
   );
 };
