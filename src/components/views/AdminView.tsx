// =============================================================================
// AdminView — system access management panel (admin-only)
// -----------------------------------------------------------------------------
// The single admin surface in the app. Renders a sub-tabbed UI that owns:
//   1. 'rights'          — Rights Centre: per-user panel + action permission
//                          toggles (adminApi.permissions.get/update)
//   2. 'users'           — Parish user account CRUD, role assignment, and
//                          activate/deactivate (adminApi.users.list/create/
//                          update/remove)
//   3. 'push_payments'   — M-Pesa STK push gateway config (paybill, account
//                          format, consumer key/secret, test simulator) via
//                          adminApi.pushPayments.get/update
//   4. 'audit'           — Trash & Audit: soft-deleted record log with entity
//                          and action filters, metadata snapshot, and Restore
//                          (adminApi.audit.list/restore)
//
// State flow: on mount the component fetches the user list (auto-selecting the
// first user and loading that user's permissions) plus the stored gateway
// settings. Selecting a different user re-fetches their permissions; the audit
// log re-queries whenever the entity/action filters change. Mutations update
// local state after the server responds — only the Rights Centre toggles are
// optimistic, and they are flushed to the server on SAVE PERMISSIONS.
//
// Edge cases: super_admin is never assignable from these forms (it is excluded
// from the role dropdowns), and the signed-in user (currentUserId) cannot
// delete their own account (Remove is disabled) — the UI's hard self-guard.
// =============================================================================
// React core: component framework, local state, side-effects, and derived state via useMemo
import React, { useState, useEffect, useMemo } from 'react';
// Domain types for admin sub-tabs, audit logs, permission panels, gateway settings,
// user accounts, and role labels
import {
  AdminSubTab,
  AuditLogEntry,
  PanelPermissions,
  PushPaymentSettings,
  UserAccount,
  UserRole
} from '../../types';
// API client for all admin endpoints: users, permissions, push payments, audit, and ops
import { adminApi } from '../../services/api';
import { ParishIdentitySection } from './ParishIdentitySection';
// Permission hook — provides canEdit / canDelete / canView gates per module key
import { usePermissions } from '../../permissions';

// Human-readable labels for the UserRole union, shown in dropdowns and tables.
const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  staff: 'Staff',
  viewer: 'Viewer'
};

// Ordered list of toggleable module panels, used to render the Rights Centre grid.
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

// The three cross-cutting action levels shared by every panel toggle.
const ACTION_ITEMS: { key: keyof PanelPermissions['actions']; label: string }[] = [
  { key: 'view', label: 'View Records' },
  { key: 'edit', label: 'Create / Edit Records' },
  { key: 'delete', label: 'Delete Records' }
];

// Baseline "full access" set — the reset target and the pre-load fallback.
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

// Default permission profile per role, used to flag Rights Centre overrides.
// A toggle that matches its role's baseline reads "default"; anything else is
// marked "custom" so admins can see at a glance what deviates from the norm.
const ROLE_BASELINE: Record<UserRole, PanelPermissions> = {
  super_admin: {
    panels: { ...ALL_PANELS },
    actions: { view: true, edit: true, delete: true }
  },
  admin: {
    panels: { ...ALL_PANELS },
    actions: { view: true, edit: true, delete: true }
  },
  staff: {
    panels: {
      christian: true,
      activities: true,
      sacraments: true,
      finance: false,
      ledgers: true,
      inventory: true,
      reports: true,
      hr: true,
      administration: false
    },
    actions: { view: true, edit: true, delete: false }
  },
  viewer: {
    panels: {
      christian: true,
      activities: false,
      sacraments: true,
      finance: false,
      ledgers: false,
      inventory: false,
      reports: true,
      hr: false,
      administration: false
    },
    actions: { view: true, edit: false, delete: false }
  }
};

// Counts how many panel/action toggles deviate from the role's baseline profile
// (a read-only summary; the return values are just used for display).
function countBaselineDiff(role: UserRole, panels: PanelPermissions['panels'], actions: PanelPermissions['actions']): number {
  const base = ROLE_BASELINE[role];
  let diff = 0;
  (Object.keys(panels) as (keyof typeof panels)[]).forEach((k) => {
    if (base.panels[k] !== panels[k]) diff += 1;
  });
  (Object.keys(actions) as (keyof typeof actions)[]).forEach((k) => {
    if (base.actions[k] !== actions[k]) diff += 1;
  });
  return diff;
}

// Maps backend entity names (Prisma model names recorded on audit rows) to
// user-friendly labels for the filter dropdown and the audit table.
const ENTITY_LABELS: Record<string, string> = {
  User: 'User Account',
  Christian: 'Christian',
  Contribution: 'Contribution',
  Transfer: 'Transfer',
  BilledItem: 'Billed Item',
  Death: 'Death Record',
  Deposit: 'Deposit',
  Creditor: 'Creditor',
  Debtor: 'Debtor',
  Expense: 'Expense',
  Ledger: 'Ledger',
  LedgerMovement: 'Ledger Movement',
  InventoryItem: 'Inventory Item',
  Delivery: 'Delivery',
  Sale: 'Sale',
  StockTake: 'Stock Take',
  StockIssue: 'Stock Issue',
  Employee: 'Employee'
};

// Metadata keys excluded from snapshot previews: identifiers, audit timestamps,
// and the password hash must never be rendered in the UI.
const SKIP_KEYS = new Set(['id', 'isDeleted', 'deletedAt', 'createdAt', 'updatedAt', 'passwordHash']);

/**
 * Builds a compact inline preview of an audit log's metadata snapshot.
 * Objects are JSON-stringified so nested payloads still render; output is
 * capped at six keys with an ellipsis to keep table rows short.
 */
function snapshotPreview(meta: Record<string, unknown> | null): string {
  // Null metadata shows a dash placeholder
  if (!meta) return '—';
  // Filter out sensitive/excluded keys, then format as "key: value" pairs
  const entries = Object.entries(meta)
    .filter(([k]) => !SKIP_KEYS.has(k))
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  // Cap at 6 entries and add ellipsis if truncated
  return entries.slice(0, 6).join(', ') + (entries.length > 6 ? '…' : '');
}

// Renders a single field value compactly for the diff modal (objects are
// JSON-stringified; undefined shows a dash).
function formatDiffValue(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Represents one row in the JSON diff view between a pre-delete snapshot and current state
export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  status: 'added' | 'removed' | 'changed' | 'same';
}

// Compares the pre-delete snapshot against the record's current state and
// labels every key as added / removed / changed / unchanged. Identity and audit
// timestamps are filtered out (see SKIP_KEYS) so the modal shows only the real
// data differences.
function buildDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): DiffRow[] {
  // Union of all keys from both snapshots
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const rows: DiffRow[] = [];
  keys.forEach((k) => {
    // Skip excluded keys
    if (SKIP_KEYS.has(k)) return;
    const b = before?.[k];
    const a = after?.[k];
    // Classify each key's change status
    if (a === undefined) rows.push({ key: k, before: b, after: undefined, status: 'removed' });
    else if (b === undefined) rows.push({ key: k, before: undefined, after: a, status: 'added' });
    else if (JSON.stringify(b) !== JSON.stringify(a)) rows.push({ key: k, before: b, after: a, status: 'changed' });
    else rows.push({ key: k, before: b, after: a, status: 'same' });
  });
  // Sort: removed first, then added, then changed, then same
  return rows.sort((x, y) => {
    const order = { removed: 0, added: 1, changed: 2, same: 3 } as const;
    return order[x.status] - order[y.status];
  });
}

// Formats an ISO timestamp for display; falls back to the raw value when the
// string is not a parseable date (defensive against malformed backend data).
function formatDateTime(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * AdminView — the admin-only system access management panel.
 *
 * Props:
 *   currentUserId — id of the signed-in user, used to disable the "Remove"
 *   button on the user's own row so an admin cannot soft-delete (and lock out)
 *   themself. null while auth state is still loading.
 */
export const AdminView: React.FC<{ currentUserId: string | null }> = ({ currentUserId }) => {
  // Controls which of the four admin sub-tabs is currently rendered
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('rights');

  // Permission instance — checked before every submit to gate mutation buttons
  const perms = usePermissions();

  // User accounts
  // Full list of user accounts fetched from the server on mount
  const [users, setUsers] = useState<UserAccount[]>([]);
  // ID of the user selected in the Rights Centre dropdown — drives permission loading
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  // Users tab filters: text search across name/email/title plus role and status
  // dropdowns. The displayed rows are derived via useMemo (see filteredUsers).
  // Free-text search query across user name, email, and title
  const [userSearch, setUserSearch] = useState('');
  // Role filter — empty string means "All Roles"
  const [userRoleFilter, setUserRoleFilter] = useState('');
  // Status filter — empty string means "All Statuses", 'active' or 'disabled'
  const [userStatusFilter, setUserStatusFilter] = useState('');

  // Confirmation target for enable/disable toggles (mirrors the delete modal).
  const [toggleTarget, setToggleTarget] = useState<UserAccount | null>(null);

  // Add User Modal
  // Controls visibility of the "Create User Account" modal
  const [showAddUser, setShowAddUser] = useState(false);
  // New user form fields — name, email, password, role, and title
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // Default role for new users is 'staff'
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [newTitle, setNewTitle] = useState('');

  // Edit User Modal
  // Controls visibility of the "Edit User Account" modal
  const [showEditUser, setShowEditUser] = useState(false);
  // ID of the user being edited
  const [editUserId, setEditUserId] = useState<string>('');
  // Edit form fields — name, email, title, role, password, and active status
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('staff');
  // Password field — blank means "keep current password"
  const [editPassword, setEditPassword] = useState('');
  // Active status toggle for the edited account
  const [editActive, setEditActive] = useState(true);

  // Delete confirm
  // ID of the user targeted for soft-delete — null means no modal is open
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Password reset: target user + the one-time code shown only once.
  // User whose password is being reset
  const [resetTarget, setResetTarget] = useState<UserAccount | null>(null);
  // The one-time reset code returned by the server
  const [resetCode, setResetCode] = useState('');
  // Loading flag while the reset code is being generated
  const [resetting, setResetting] = useState(false);

  // Panel Permissions State (of the selected user)
  // Panel access toggles — initialized to full access as a pre-load fallback
  const [panels, setPanels] = useState<PanelPermissions['panels']>({ ...ALL_PANELS });
  // Action level toggles — initialized to full access
  const [actions, setActions] = useState<PanelPermissions['actions']>({
    view: true,
    edit: true,
    delete: true
  });

  // Online & Push Payments state
  // M-Pesa paybill / till number
  const [paybill, setPaybill] = useState('');
  // Account name format template
  const [accountFormat, setAccountFormat] = useState('');
  // Consumer key for the M-Pesa API
  const [consumerKey, setConsumerKey] = useState('');
  // Consumer secret for the M-Pesa API
  const [consumerSecret, setConsumerSecret] = useState('');
  // Test phone number for the STK push simulator
  const [testPhone, setTestPhone] = useState('254700000000');
  // Test amount for the STK push simulator
  const [testAmount, setTestAmount] = useState('100');

  // Gateway environment toggle: 'sandbox' exercises the test API endpoints,
  // 'live' targets the production M-Pesa endpoints. Persisted with the settings.
  const [gatewayMode, setGatewayMode] = useState<'sandbox' | 'live'>('sandbox');

  // Whether stored gateway credentials exist (surfaced from the masked GET
  // response) — drives the "STORED" badges next to the secret fields.
  const [hasConsumerKey, setHasConsumerKey] = useState(false);
  const [hasConsumerSecret, setHasConsumerSecret] = useState(false);

  // Per-field reveal toggles: the credential inputs render type="password" and
  // only expose their value while the matching eye icon is pressed.
  const [showConsumerKey, setShowConsumerKey] = useState(false);
  const [showConsumerSecret, setShowConsumerSecret] = useState(false);

  // Trash & Audit state
  // List of audit log entries fetched from the server
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  // Entity filter — empty means "All entities"
  const [auditEntity, setAuditEntity] = useState('');
  // Action filter — empty means "All actions"
  const [auditAction, setAuditAction] = useState('');
  // Date range filters — from and to ISO date strings
  const [auditFrom, setAuditFrom] = useState('');
  const [auditTo, setAuditTo] = useState('');
  // Actor filter — free-text match on the user who performed the action
  const [auditActor, setAuditActor] = useState('');
  // Loading flag for the audit log fetch
  const [auditLoading, setAuditLoading] = useState(false);
  // ID of the row currently being restored — disables its Restore button during flight
  const [restoringId, setRestoringId] = useState<string | null>(null);
  // Set of audit log IDs selected via checkboxes for bulk restore
  const [selectedAuditIds, setSelectedAuditIds] = useState<Set<string>>(new Set());
  // Loading flag while a bulk restore request is in flight
  const [bulkRestoring, setBulkRestoring] = useState(false);
  // Audit log entry currently being viewed in the JSON diff modal
  const [diffLog, setDiffLog] = useState<AuditLogEntry | null>(null);
  // Current state of the record being diffed — undefined = loading, null = deleted
  const [diffCurrent, setDiffCurrent] = useState<Record<string, unknown> | null | undefined>(undefined);

  // Transient success notification message — auto-dismisses after 4 seconds
  const [notification, setNotification] = useState<string | null>(null);

  // Derived lookup of the account selected in the Rights Centre dropdown.
  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null;

  // Transient success banner; auto-dismisses after 4s (errors use alert instead).
  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // True when a row belongs to the signed-in user — gates the Remove button.
  const isSelf = (userId: string) => userId === currentUserId;

  // Users tab rows after applying the text/role/status filters. The search term
  // is matched case-insensitively against name, email and title.
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      // Free-text search across name, email, and title
      if (q && !`${u.name} ${u.email} ${u.title ?? ''}`.toLowerCase().includes(q)) return false;
      // Role filter — skip if the user's role doesn't match
      if (userRoleFilter && u.role !== userRoleFilter) return false;
      // Status filter — active accounts only
      if (userStatusFilter === 'active' && !u.isActive) return false;
      // Status filter — disabled accounts only
      if (userStatusFilter === 'disabled' && u.isActive) return false;
      return true;
    });
  }, [users, userSearch, userRoleFilter, userStatusFilter]);

  // Fetches one user's panel/action permissions and loads them into the Rights Centre.
  const loadPermissions = async (userId: string) => {
    try {
      const p = await adminApi.permissions.get(userId);
      setPanels(p.panels);
      setActions(p.actions);
    } catch (error) {
      console.error('Failed to load panel permissions', error);
    }
  };

  // Loads all accounts and auto-selects the first one, pulling its permissions too.
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

  // Reloads the audit log filtered by the current entity/action/date/actor
  // selection. Empty-string filters are dropped from the query so "All" sends
  // no param.
  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const rows = await adminApi.audit.list({
        entity: auditEntity || undefined,
        action: auditAction || undefined,
        from: auditFrom || undefined,
        to: auditTo || undefined,
        actor: auditActor || undefined
      });
      setAuditLogs(rows);
    } catch (error) {
      console.error('Failed to load audit logs', error);
    } finally {
      setAuditLoading(false);
    }
  };

  // Mount effect: fetch users (with the first user's permissions) and hydrate
  // the push-payment gateway form from the stored settings.
  useEffect(() => {
    void loadUsers();
    adminApi.pushPayments
      .get()
      .then((s: PushPaymentSettings) => {
        // Hydrate all gateway form fields from the stored settings
        setPaybill(s.paybill);
        setAccountFormat(s.accountFormat);
        setConsumerKey(s.consumerKey);
        setConsumerSecret(s.consumerSecret);
        setTestPhone(s.testPhone);
        setTestAmount(s.testAmount);
        setGatewayMode(s.mode ?? 'sandbox');
        setHasConsumerKey(s.hasConsumerKey ?? false);
        setHasConsumerSecret(s.hasConsumerSecret ?? false);
      })
      .catch((error) => console.error('Failed to load push payment settings', error));
  }, []);

  // Re-query the audit log whenever any filter changes.
  // (exhaustive-deps is suppressed deliberately — only the filters retrigger.)
  useEffect(() => {
    void loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditEntity, auditAction, auditFrom, auditTo, auditActor]);

  // Restore flow: confirm -> POST restore -> success banner -> reload the log so
  // the row flips from "Deleted" to "Restored". The button is disabled while its
  // own row is in flight (restoringId).
  const handleRestore = async (log: AuditLogEntry) => {
    // Ask the operator to confirm before restoring
    if (!confirm(`Restore this ${ENTITY_LABELS[log.entityName] ?? log.entityName}?`)) return;
    // Mark this row as in-flight to disable its Restore button
    setRestoringId(log.id);
    try {
      await adminApi.audit.restore(log.id);
      showNotif(`${ENTITY_LABELS[log.entityName] ?? log.entityName} restored successfully.`);
      // Reload the audit log so the restored row updates
      void loadAudit();
    } catch (error) {
      console.error('Failed to restore record', error);
      alert(error instanceof Error ? error.message : 'Failed to restore record');
    } finally {
      setRestoringId(null);
    }
  };

  // --- Bulk restore + JSON diff (Trash & Audit) ---

  // Toggles one row's selection checkbox.
  const toggleAuditSelect = (id: string) => {
    setSelectedAuditIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selects every restorable (DELETE) row, or clears when all are selected.
  const toggleSelectAllAudit = () => {
    setSelectedAuditIds((prev) => {
      // If all restorable rows are already selected, clear the selection
      if (prev.size > 0 && prev.size === auditLogs.filter((l) => l.action === 'DELETE').length) {
        return new Set();
      }
      // Otherwise select all DELETE rows
      return new Set(auditLogs.filter((l) => l.action === 'DELETE').map((l) => l.id));
    });
  };

  // Restores every selected row in one request; counts come back from the API.
  const handleBulkRestore = async () => {
    // Guard: nothing to restore
    if (selectedAuditIds.size === 0) return;
    // Confirm the bulk action
    if (!confirm(`Restore ${selectedAuditIds.size} selected record(s)?`)) return;
    setBulkRestoring(true);
    try {
      const res = await adminApi.audit.restoreBulk(Array.from(selectedAuditIds));
      showNotif(`Restored ${res.restored} record(s).${res.failed > 0 ? ` ${res.failed} could not be restored.` : ''}`);
      // Clear selection and reload the audit log
      setSelectedAuditIds(new Set());
      void loadAudit();
    } catch (error) {
      console.error('Failed to restore records', error);
      alert(error instanceof Error ? error.message : 'Failed to restore records');
    } finally {
      setBulkRestoring(false);
    }
  };

  // Opens the JSON diff modal: fetches the record's current state and compares
  // it against the pre-delete snapshot stored on the audit log.
  const handleOpenDiff = async (log: AuditLogEntry) => {
    // Set the audit log entry for the modal header
    setDiffLog(log);
    // Set to undefined to show "Loading current record…"
    setDiffCurrent(undefined);
    try {
      const res = await adminApi.audit.current(log.id);
      setDiffCurrent(res.current);
    } catch (error) {
      console.error('Failed to load current record', error);
      // null means the record no longer exists (only the snapshot remains)
      setDiffCurrent(null);
    }
  };

  // Changing the Rights Centre dropdown loads the newly selected user's permissions.
  const handleSelectUser = async (userId: string) => {
    setSelectedUserId(userId);
    await loadPermissions(userId);
  };

  // Immutable single-bit toggle for the Rights Centre checkboxes. Changes are
  // NOT persisted until SAVE PERMISSIONS serializes { panels, actions } as the
  // PanelPermissions payload (adminApi.permissions.update).
  const handleTogglePanel = (key: keyof typeof panels) => {
    setPanels({ ...panels, [key]: !panels[key] });
  };

  // Same toggle pattern as panels, for the view/edit/delete action level.
  const handleToggleAction = (key: keyof typeof actions) => {
    setActions({ ...actions, [key]: !actions[key] });
  };

  // Bulk toggles for the Rights Centre grids — set every panel / action bit at
  // once instead of clicking each checkbox individually.
  const handleSetAllPanels = (value: boolean) => {
    setPanels(
      Object.fromEntries(PANEL_ITEMS.map((item) => [item.key, value])) as PanelPermissions['panels']
    );
  };

  const handleSetAllActions = (value: boolean) => {
    setActions({ view: value, edit: value, delete: value });
  };

  // Number of toggles that differ from the selected user's role baseline — feeds
  // the "customised from {role} default" summary line in the Rights Centre.
  const baselineDiff = useMemo(
    () => (selectedUser ? countBaselineDiff(selectedUser.role, panels, actions) : 0),
    [selectedUser, panels, actions]
  );

  // Resets both permission groups to full access locally (not saved until SAVE).
  const handleResetRights = () => {
    setPanels({ ...ALL_PANELS });
    setActions({ view: true, edit: true, delete: true });
    showNotif('Permissions reset to full access.');
  };

  // Persists the toggle state for the selected user; alerts if none is selected.
  const handleSaveRights = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: a user must be selected before saving permissions
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

  // Create account: required-field guard -> POST -> prepend returned record ->
  // reset the form and close the modal.
  const handleAddUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: name, email, and password are all required
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
      // Prepend the new user to the local list
      setUsers([...users, created]);
      // Close the modal and reset form fields
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

  // Pre-fills the edit modal from an existing account. Password stays blank so
  // an unchanged password is never re-submitted.
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

  // Update account: the password is only sent when a new one was typed; role and
  // isActive are always included. The returned record replaces its row in state.
  const handleEditUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: an edit must target a real user
    if (!editUserId) return;
    try {
      // Build the update payload — password is optional
      const body: any = { name: editName, email: editEmail, title: editTitle || undefined, role: editRole, isActive: editActive };
      if (editPassword) body.password = editPassword;
      const updated = await adminApi.users.update(editUserId, body);
      // Replace the updated user in the local list
      setUsers(users.map((u) => (u.id === editUserId ? updated : u)));
      setShowEditUser(false);
      showNotif(`User ${updated.name} updated.`);
    } catch (error) {
      console.error('Failed to update user', error);
      alert(error instanceof Error ? error.message : 'Failed to update user');
    }
  };

  // Soft-delete flow: confirm -> DELETE -> drop from the list. If the removed
  // account was selected in Rights Centre, auto-select the first remaining user
  // and reload its permissions.
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Remove this user account? It will be soft-deleted and can be restored from Trash & Audit.')) return;
    try {
      await adminApi.users.remove(userId);
      // Remove the user from the local list
      setUsers(users.filter((u) => u.id !== userId));
      // If the deleted user was selected in Rights Centre, switch to the next one
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

  // Generates a one-time reset code for a user and displays it in a modal.
  const handleResetPassword = async (u: UserAccount) => {
    setResetting(true);
    try {
      const res = await adminApi.users.resetPassword(u.id);
      setResetCode(res.code);
      setResetTarget(u);
    } catch (error) {
      console.error('Failed to generate reset code', error);
      alert(error instanceof Error ? error.message : 'Failed to generate reset code');
    } finally {
      setResetting(false);
    }
  };

  // Copies the reset code to the clipboard for easy sharing
  const handleCopyCode = () => {
    void navigator.clipboard.writeText(resetCode);
    showNotif('Reset code copied to clipboard.');
  };

  // Downloads the full parish data bundle (all tables, secrets stripped) — the
  // exit / hand-over path. The JSON can be re-imported onto another install.
  const handleExportData = async () => {
    try {
      const data = await adminApi.ops.exportData();
      // Create a Blob from the JSON data and trigger a browser download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecclesia-export-${data.exportedAt.replace(/[:.]/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showNotif('Data export downloaded.');
    } catch (error) {
      console.error('Failed to export data', error);
      alert(error instanceof Error ? error.message : 'Failed to export data');
    }
  };

  // Manual backup trigger — creates a consistent snapshot right now.
  const handleBackupNow = async () => {
    try {
      const info = await adminApi.ops.backup();
      showNotif(`Backup created: ${info.file} (${(info.sizeBytes / 1024).toFixed(0)} KB)`);
    } catch (error) {
      console.error('Failed to create backup', error);
      alert(error instanceof Error ? error.message : 'Failed to create backup');
    }
  };

  // Inline role dropdown save in the users table — a single PUT per change.
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

  // Quick enable/disable from the table row without opening the edit modal.
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

  // Persists the M-Pesa gateway config. The backend returns masked placeholders
  // for stored credentials; submitting an untouched placeholder keeps the stored
  // value, while typing a new value (or clearing the field) replaces it.
  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.pushPayments.update({
        paybill,
        accountFormat,
        consumerKey,
        consumerSecret,
        mode: gatewayMode,
        testPhone,
        testAmount
      });
      // A non-empty submitted field means a credential is now on file (a
      // placeholder sentinel still counts as "stored" — it represents one).
      setHasConsumerKey(Boolean(consumerKey));
      setHasConsumerSecret(Boolean(consumerSecret));
      showNotif('Gateway configuration saved!');
    } catch (error) {
      console.error('Failed to save gateway settings', error);
      alert(error instanceof Error ? error.message : 'Failed to save gateway settings');
    }
  };

  // Test-push simulator: in this build it only surfaces a notification; no real
  // STK request is dispatched from the UI. The notice names the active gateway
  // environment so the operator can see which endpoints would receive the push.
  const handleSendTestStk = (e: React.FormEvent) => {
    e.preventDefault();
    const env = gatewayMode === 'live' ? 'LIVE' : 'SANDBOX';
    showNotif(`STK Push prompt sent to ${testPhone} for KES ${testAmount} (${env} mode).`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          {/* Page title */}
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">System Access Management</h2>
          {/* Subtitle describing the panel's functions */}
          <p className="text-xs text-[#444748] italic mt-1">
            Manage user accounts, role authorities, panel permissions, and online & push payment gateways.
          </p>
        </div>
      </div>

      {/* Sub-tab Navigation Links */}
      <div className="flex flex-wrap border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase">
        {/* RIGHTS CENTRE tab — permission toggles per user */}
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
        {/* USERS tab — account CRUD and role management */}
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
        {/* PUSH PAYMENTS tab — M-Pesa gateway configuration */}
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
        {/* TRASH & AUDIT tab — soft-deleted record log */}
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'audit'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          TRASH &amp; AUDIT
        </button>
        {/* PARISH tab — parish identity settings */}
        <button
          onClick={() => setActiveSubTab('parish')}
          className={`pb-2 transition-colors cursor-pointer ${
            activeSubTab === 'parish'
              ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
              : 'text-[#444748] hover:text-[#1a1c1c]'
          }`}
        >
          PARISH IDENTITY
        </button>
      </div>

      {/* Transient success notification banner — auto-dismisses after 4 seconds */}
      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. RIGHTS CENTRE — per-user permission toggles */}
      {activeSubTab === 'rights' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6 max-w-4xl">
          <div>
            {/* Section title */}
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Per-User Authority Centre</h3>
            {/* Subtitle describing the Rights Centre's purpose */}
            <p className="text-xs text-[#444748] mt-1">
              Configure granular security clearance and module access for each parish user account.
            </p>
          </div>

          {/* User selector card */}
          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
            {/* Label for the user dropdown */}
            <label className="block text-xs font-bold text-[#1a1c1c]">Select User Account</label>
            {/* Dropdown listing all user accounts with name, email, and role */}
            <select
              value={selectedUserId}
              onChange={(e) => void handleSelectUser(e.target.value)}
              className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
            >
              {/* Empty state when no users exist */}
              {users.length === 0 && <option value="">No users yet</option>}
              {/* One option per user account */}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email}) — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>
            {/* Helper text explaining that changes take effect at next login */}
            <p className="text-[10px] text-[#777777] italic">
              Modifying access for the selected account. Changes take effect at next login.
            </p>
          </div>

          {/* Permission form — panel access + action levels + save/reset */}
          <form onSubmit={handleSaveRights} className="space-y-6 text-xs">
            {/* Panel Access Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              {/* Header row with title and bulk Enable/Disable buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e3e3] pb-2">
                <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                  PANEL ACCESS PERMISSIONS
                </h4>
                <div className="flex gap-2">
                  {/* Enable All — sets every panel toggle to true */}
                  <button
                    type="button"
                    onClick={() => handleSetAllPanels(true)}
                    className="px-2.5 py-1 font-bold text-[#1a1c1c] bg-[#f4f3f3] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer"
                  >
                    Enable All
                  </button>
                  {/* Disable All — sets every panel toggle to false */}
                  <button
                    type="button"
                    onClick={() => handleSetAllPanels(false)}
                    className="px-2.5 py-1 font-bold text-[#1a1c1c] bg-[#f4f3f3] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer"
                  >
                    Disable All
                  </button>
                </div>
              </div>

              {/* Customisation summary: how many toggles deviate from the role's default profile. */}
              {selectedUser && (
                <div className={`p-2.5 rounded text-[10px] font-bold ${
                  baselineDiff === 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                }`}>
                  {baselineDiff === 0
                    ? `${ROLE_LABELS[selectedUser.role]} profile — all toggles match the ${ROLE_LABELS[selectedUser.role]} baseline.`
                    : `${baselineDiff} toggle${baselineDiff === 1 ? '' : 's'} customised from the ${ROLE_LABELS[selectedUser.role]} baseline.`}
                </div>
              )}

              {/* Panel toggle grid — one checkbox per module */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {PANEL_ITEMS.map((item) => {
                  // Check if this toggle matches the role's baseline
                  const isDefault = selectedUser && ROLE_BASELINE[selectedUser.role].panels[item.key] === panels[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors"
                    >
                      {/* Checkbox input — toggles this panel's access */}
                      <input
                        type="checkbox"
                        checked={panels[item.key]}
                        onChange={() => handleTogglePanel(item.key)}
                        className="accent-[#1e1e1e] w-4 h-4"
                      />
                      {/* Module label */}
                      <span className="font-medium text-[#1a1c1c]">{item.label}</span>
                      {/* Default/custom badge — shows when a toggle deviates from baseline */}
                      {selectedUser && (
                        <span
                          className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            isDefault ? 'bg-[#e1e3e3] text-[#444748]' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isDefault ? 'default' : 'custom'}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Level Permissions */}
            <div className="p-5 border border-[#e1e3e3] rounded-xl space-y-3">
              {/* Header row with title and bulk Enable/Disable buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1e3e3] pb-2">
                <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                  ACTION LEVEL PERMISSIONS
                </h4>
                <div className="flex gap-2">
                  {/* Enable All — sets view/edit/delete all to true */}
                  <button
                    type="button"
                    onClick={() => handleSetAllActions(true)}
                    className="px-2.5 py-1 font-bold text-[#1a1c1c] bg-[#f4f3f3] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer"
                  >
                    Enable All
                  </button>
                  {/* Disable All — sets view/edit/delete all to false */}
                  <button
                    type="button"
                    onClick={() => handleSetAllActions(false)}
                    className="px-2.5 py-1 font-bold text-[#1a1c1c] bg-[#f4f3f3] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer"
                  >
                    Disable All
                  </button>
                </div>
              </div>

              {/* Action toggle grid — one checkbox per action level */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {ACTION_ITEMS.map((act) => {
                  const isDefault = selectedUser && ROLE_BASELINE[selectedUser.role].actions[act.key] === actions[act.key];
                  return (
                    <label
                      key={act.key}
                      className="flex items-center gap-2.5 p-2 bg-[#f4f3f3] rounded border border-[#e1e3e3] cursor-pointer hover:bg-[#e1e3e3] transition-colors"
                    >
                      {/* Checkbox input — toggles this action level */}
                      <input
                        type="checkbox"
                        checked={actions[act.key]}
                        onChange={() => handleToggleAction(act.key)}
                        className="accent-[#1e1e1e] w-4 h-4"
                      />
                      {/* Action label */}
                      <span className="font-medium text-[#1a1c1c]">{act.label}</span>
                      {/* Default/custom badge */}
                      {selectedUser && (
                        <span
                          className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            isDefault ? 'bg-[#e1e3e3] text-[#444748]' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {isDefault ? 'default' : 'custom'}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {/* Info note about delete logging */}
              <div className="p-3 bg-[#e1e3e3] rounded text-[11px] text-[#444748] italic mt-2">
                "Delete actions are globally logged and require a reason for audit trails."
              </div>
            </div>

            {/* Reset and Save buttons */}
            <div className="flex justify-end gap-3 pt-2">
              {/* Reset to Full Access — reverts all toggles to full access locally */}
              <button
                type="button"
                onClick={handleResetRights}
                className="px-4 py-2 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
              >
                RESET TO FULL ACCESS
              </button>
              {/* Save Permissions — persists the toggle state to the server */}
              <button
                type="submit"
                disabled={!perms.canEdit('administration')}
                className={`px-6 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                  perms.canEdit('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                SAVE PERMISSIONS
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. USERS — account CRUD, role management, and operational buttons */}
      {activeSubTab === 'users' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Header row: title on the left, action buttons on the right */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              {/* Section title */}
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish User Accounts</h3>
              {/* Subtitle */}
              <p className="text-xs text-[#444748] mt-1">
                Create accounts for staff and clergy, assign roles, and control who can sign in.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Backup Now — creates a manual database snapshot */}
              <button
                onClick={() => void handleBackupNow()}
                className="px-4 py-2 text-xs font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">backup</span>
                Backup Now
              </button>
              {/* Export Data — downloads the full parish data bundle as JSON */}
              <button
                onClick={() => void handleExportData()}
                className="px-4 py-2 text-xs font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                Export Data
              </button>
              {/* Add New User — opens the create-user modal */}
              <button
                onClick={() => setShowAddUser(true)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">person_add</span>
                Add New User
              </button>
            </div>
          </div>

          {/* User filters: text search + role + status dropdowns. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            {/* Search input — live-filters the user table by name, email, or title */}
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">search</span>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by name, email or title..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>
            {/* Role filter dropdown */}
            <select
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
            >
              <option value="">All Roles</option>
              {/* One option per role label */}
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {/* Status filter dropdown */}
            <select
              value={userStatusFilter}
              onChange={(e) => setUserStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

           {/* User accounts table */}
           <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
             <table className="w-full text-left border-collapse text-xs">
               <thead>
                  {/* Table header row — column labels */}
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <th className="p-3">Name</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Last Login</th>
                    <th className="p-3">Last Active</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Empty state when no users match the filters */}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[#444748]">
                        {users.length === 0
                          ? 'No user accounts yet. Click "Add New User" to create one.'
                          : 'No users match the current search or filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                     <tr key={u.id} className="hover:bg-[#f9f9f9]">
                       {/* User name — bold */}
                       <td className="p-3 font-bold text-[#1a1c1c]">{u.name}</td>
                       {/* Job title — italic, dash if null */}
                       <td className="p-3 text-[#444748]">{u.title ?? '—'}</td>
                       {/* Email address */}
                       <td className="p-3 text-[#444748]">{u.email}</td>
                       {/* Role — inline dropdown for quick role change */}
                       <td className="p-3">
                         <select
                           value={u.role}
                           onChange={(e) => void handleUpdateRole(u, e.target.value as UserRole)}
                           className="px-2 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] font-semibold text-[#1a1c1c]"
                         >
                           {/* One option per role */}
                           {Object.entries(ROLE_LABELS).map(([value, label]) => (
                             <option key={value} value={value}>
                               {label}
                             </option>
                           ))}
                         </select>
                       </td>
                        {/* Active/Disabled status badge */}
                        <td className="p-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {u.isActive ? 'ACTIVE' : 'DISABLED'}
                          </span>
                        </td>
                        {/* Last login timestamp */}
                        <td className="p-3 text-[#444748] whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}</td>
                        {/* Last active timestamp */}
                        <td className="p-3 text-[#444748] whitespace-nowrap">{u.lastActiveAt ? formatDateTime(u.lastActiveAt) : '—'}</td>
                        {/* Action buttons — Edit, Disable/Enable, Reset Password, Remove, Permissions */}
                        <td className="p-3 text-right space-x-2">
                          {/* Edit — opens the edit-user modal */}
                          <button
                            onClick={() => openEditUser(u)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
                          >
                            Edit
                          </button>
                          {/* Disable/Enable — opens the confirmation modal */}
                          <button
                             onClick={() => setToggleTarget(u)}
                             disabled={isSelf(u.id)}
                             className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                           >
                             {u.isActive ? 'Disable' : 'Enable'}
                           </button>
                          {/* Reset Password — generates a one-time code */}
                          <button
                            onClick={() => void handleResetPassword(u)}
                            disabled={isSelf(u.id) || resetting}
                            className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSelf(u.id) ? 'Self' : 'Reset Pwd'}
                          </button>
                          {/* Remove — soft-deletes the account (disabled for self and non-deleters) */}
                          <button
                            onClick={() => setDeleteTargetId(u.id)}
                            disabled={isSelf(u.id) || !perms.canDelete('administration')}
                            className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer ${
                              isSelf(u.id) || !perms.canDelete('administration')
                                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                            }`}
                          >
                            Remove
                          </button>
                          {/* Permissions — jumps to the Rights Centre with this user preselected */}
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

           {/* Delete Confirmation Modal — shown when deleteTargetId is set */}
           {deleteTargetId && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
               <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
                  {/* Modal title */}
                  <h4 className="text-sm font-bold text-[#1a1c1c]">Remove User Account</h4>
                  {/* Explanation that the user will be soft-deleted */}
                  <p className="text-xs text-[#444748]">
                    This user will be soft-deleted and moved to Trash &amp; Audit. The record can be restored at any time.
                  </p>
                 <div className="flex justify-end gap-2 pt-2">
                   {/* Cancel — closes the modal */}
                   <button
                     onClick={() => setDeleteTargetId(null)}
                     className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
                   >
                     Cancel
                   </button>
                   {/* Confirm Delete — performs the soft-delete */}
                   <button
                     onClick={() => void handleDeleteUser(deleteTargetId!)}
                     disabled={!perms.canDelete('administration')}
                     className={`px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded ${
                       perms.canDelete('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                     }`}
                   >
                     Remove
                   </button>
                 </div>
               </div>
             </div>
           )}

           {/* Enable/Disable Confirmation Modal — shown when toggleTarget is set */}
           {toggleTarget && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
               <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
                 {/* Modal title — "Disable User Account" or "Enable User Account" */}
                 <h4 className="text-sm font-bold text-[#1a1c1c]">{toggleTarget.isActive ? 'Disable User Account' : 'Enable User Account'}</h4>
                 {/* Explanation of what will happen */}
                 <p className="text-xs text-[#444748]">
                   {toggleTarget.isActive
                     ? `${toggleTarget.name} will no longer be able to sign in until re-enabled.`
                     : `${toggleTarget.name} will regain sign-in access to the system.`}
                 </p>
                 <div className="flex justify-end gap-2 pt-2">
                   {/* Cancel — closes the modal */}
                   <button
                     onClick={() => setToggleTarget(null)}
                     className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
                   >
                     Cancel
                   </button>
                   {/* Confirm — performs the enable/disable toggle */}
                   <button
                     onClick={() => {
                       void handleToggleActive(toggleTarget);
                       setToggleTarget(null);
                     }}
                     className={`px-3 py-1.5 text-xs font-bold text-white rounded cursor-pointer ${
                       toggleTarget.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-800 hover:bg-emerald-900'
                     }`}
                   >
                     {toggleTarget.isActive ? 'Disable' : 'Enable'}
                   </button>
                 </div>
               </div>
             </div>
           )}

           {/* Reset Password Confirmation — shows the one-time code exactly once. */}
           {resetTarget && resetCode && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
               <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-sm w-full shadow-xl space-y-4">
                 {/* Modal title */}
                 <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Password Reset Code</h4>
                 {/* Instructional text with the target user's name */}
                 <p className="text-xs text-[#444748]">
                   Share this code securely with <span className="font-semibold text-[#1a1c1c]">{resetTarget.name}</span>.
                   They must enter it together with a new password.
                 </p>
                 {/* Code display box — large mono font for easy copying */}
                 <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-center">
                   <p className="text-2xl font-mono font-bold tracking-[0.35em] text-[#1a1c1c]">
                     {resetCode}
                   </p>
                   {/* Expiry warning */}
                   <p className="text-[10px] text-red-700 font-semibold mt-2">
                     This code is shown only once and expires in 30 minutes.
                   </p>
                 </div>
                 <div className="flex justify-end gap-2 pt-2">
                   {/* Close — dismisses the modal */}
                   <button
                     onClick={() => setResetTarget(null)}
                     className="px-3 py-1.5 text-xs text-[#444748] bg-gray-100 rounded cursor-pointer"
                   >
                     Close
                   </button>
                   {/* Copy Code — copies to clipboard */}
                   <button
                     onClick={handleCopyCode}
                     className="px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                   >
                     Copy Code
                   </button>
                 </div>
               </div>
             </div>
           )}
         </div>
       )}

      {/* 3. ONLINE & PUSH PAYMENTS — M-Pesa gateway configuration */}
      {activeSubTab === 'push_payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-5xl">
          {/* Gateway configuration form */}
          <div className="lg:col-span-7 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Section title */}
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Payment Gateway Settings</h3>
            {/* Subtitle */}
            <p className="text-xs text-[#444748]">
              Configure mobile M-Pesa STK push API credentials and till numbers for direct parish collections.
            </p>

            {/* Gateway settings form */}
            <form onSubmit={handleSaveGateway} className="space-y-4 text-xs">
              {/* Paybill / Till Number input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Paybill / Till Number</label>
                <input
                  type="text"
                  value={paybill}
                  onChange={(e) => setPaybill(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                />
              </div>

              {/* Account Name Format input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Account Name Format</label>
                <input
                  type="text"
                  value={accountFormat}
                  onChange={(e) => setAccountFormat(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
              </div>

              {/* Consumer Key and Secret — side by side on larger screens */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Consumer Key field with reveal toggle and STORED badge */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[#1a1c1c] font-medium">Consumer Key</label>
                    {/* STORED badge — shown when a key exists on the server */}
                    {hasConsumerKey && (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        STORED
                      </span>
                    )}
                  </div>
                  {/* Password field with eye toggle */}
                  <div className="relative">
                    <input
                      type={showConsumerKey ? 'text' : 'password'}
                      value={consumerKey}
                      onChange={(e) => setConsumerKey(e.target.value)}
                      className="w-full px-3 py-2 pr-9 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                    />
                    {/* Eye icon toggle — reveals/hides the credential */}
                    <button
                      type="button"
                      onClick={() => setShowConsumerKey((v) => !v)}
                      title={showConsumerKey ? 'Hide credential' : 'Reveal credential'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">
                        {showConsumerKey ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Consumer Secret field with reveal toggle and STORED badge */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[#1a1c1c] font-medium">Consumer Secret</label>
                    {/* STORED badge — shown when a secret exists on the server */}
                    {hasConsumerSecret && (
                      <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                        STORED
                      </span>
                    )}
                  </div>
                  {/* Password field with eye toggle */}
                  <div className="relative">
                    <input
                      type={showConsumerSecret ? 'text' : 'password'}
                      value={consumerSecret}
                      onChange={(e) => setConsumerSecret(e.target.value)}
                      className="w-full px-3 py-2 pr-9 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                    />
                    {/* Eye icon toggle — reveals/hides the credential */}
                    <button
                      type="button"
                      onClick={() => setShowConsumerSecret((v) => !v)}
                      title={showConsumerSecret ? 'Hide credential' : 'Reveal credential'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">
                        {showConsumerSecret ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Credential security notice */}
              <p className="text-[11px] text-[#444748] italic">
                Credentials are masked for security and are never shown in full. Leave a field unchanged to keep the
                stored value, or type a new value (or clear it) to replace it.
              </p>

              {/* Environment toggle: sandbox (test API) vs live (production). The
                  active mode is persisted with the rest of the gateway settings. */}
              <div className="pt-1">
                <span className="block text-[#1a1c1c] font-medium mb-1">Environment Mode</span>
                {/* Toggle buttons — Sandbox vs Live */}
                <div className="inline-flex rounded-md border border-[#c4c7c7] overflow-hidden text-xs font-bold">
                  {/* Sandbox mode — amber highlight when active */}
                  <button
                    type="button"
                    onClick={() => setGatewayMode('sandbox')}
                    className={`px-4 py-1.5 cursor-pointer flex items-center gap-1.5 transition-colors ${
                      gatewayMode === 'sandbox'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-[#ffffff] text-[#444748] hover:bg-[#f4f3f3]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">science</span>
                    SANDBOX
                  </button>
                  {/* Live mode — emerald highlight when active */}
                  <button
                    type="button"
                    onClick={() => setGatewayMode('live')}
                    className={`px-4 py-1.5 cursor-pointer flex items-center gap-1.5 transition-colors ${
                      gatewayMode === 'live'
                        ? 'bg-emerald-100 text-emerald-900'
                        : 'bg-[#ffffff] text-[#444748] hover:bg-[#f4f3f3]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">rocket_launch</span>
                    LIVE
                  </button>
                </div>
                {/* Contextual description of the selected environment */}
                <p className="text-[11px] text-[#444748] mt-1.5">
                  {gatewayMode === 'sandbox'
                    ? 'Sandbox mode uses the Safaricom test environment — safe for testing without real money movement.'
                    : 'Live mode targets the production M-Pesa endpoints. Confirm the credentials above before enabling.'}
                </p>
              </div>

              {/* Save button — permission-gated */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={!perms.canEdit('administration')}
                  className={`px-5 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                    perms.canEdit('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  Save Gateway Credentials
                </button>
              </div>
            </form>
          </div>

          {/* Test STK Push Simulator */}
          <div className="lg:col-span-5 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Section title */}
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
              STK PUSH SIMULATOR
            </h4>
            {/* Subtitle */}
            <p className="text-xs text-[#444748]">
              Test real-time payment triggers directly on a test mobile line.
            </p>

            {/* Test STK push form */}
            <form onSubmit={handleSendTestStk} className="space-y-3 text-xs">
              {/* Mobile phone number input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Mobile Phone Number</label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-mono"
                />
              </div>

              {/* Test amount input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Amount (KES)</label>
                <input
                  type="number"
                  value={testAmount}
                  onChange={(e) => setTestAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] font-bold"
                />
              </div>

              {/* Send Test STK Push button — emerald green, full width */}
              <button
                type="submit"
                disabled={!perms.canEdit('administration')}
                className={`w-full py-2.5 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded flex items-center justify-center gap-1.5 ${
                  perms.canEdit('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                <span className="material-symbols-outlined text-base">send_to_mobile</span>
                Send Test STK Push
              </button>
            </form>
          </div>
        </div>
      )}

       {/* 4. TRASH & AUDIT HISTORY — soft-deleted record log with restore */}
       {activeSubTab === 'audit' && (
         <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
           {/* Section header */}
           <div>
             {/* Title */}
             <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Trash &amp; Audit History</h3>
             {/* Subtitle explaining the audit log's purpose */}
             <p className="text-xs text-[#444748] mt-1">
               Every deleted record is soft-deleted, kept in the database, and logged here with its original data
               and the person who deleted it. Restore any record to bring it back into normal use.
             </p>
           </div>

           {/* Filter controls row — entity, action, date range, and actor filters */}
           <div className="flex flex-col lg:flex-row lg:items-center gap-3">
             {/* Entity filter dropdown */}
             <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
               <span className="font-semibold">Entity</span>
               <select
                 value={auditEntity}
                 onChange={(e) => setAuditEntity(e.target.value)}
                 className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#1a1c1c]"
               >
                 <option value="">All entities</option>
                 {/* One option per entity type */}
                 {Object.entries(ENTITY_LABELS).map(([value, label]) => (
                   <option key={value} value={value}>
                     {label}
                   </option>
                 ))}
               </select>
             </label>
             {/* Action filter dropdown */}
             <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
               <span className="font-semibold">Action</span>
               <select
                 value={auditAction}
                 onChange={(e) => setAuditAction(e.target.value)}
                 className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#1a1c1c]"
               >
                 <option value="">All actions</option>
                 <option value="DELETE">Deleted</option>
                 <option value="RESTORE">Restored</option>
               </select>
             </label>
             {/* From date input */}
             <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
               <span className="font-semibold">From</span>
               <input
                 type="date"
                 value={auditFrom}
                 onChange={(e) => setAuditFrom(e.target.value)}
                 className="px-2 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#1a1c1c]"
               />
             </label>
             {/* To date input */}
             <label className="flex items-center gap-2 text-xs text-[#1a1c1c]">
               <span className="font-semibold">To</span>
               <input
                 type="date"
                 value={auditTo}
                 onChange={(e) => setAuditTo(e.target.value)}
                 className="px-2 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#1a1c1c]"
               />
             </label>
             {/* Actor search input */}
             <div className="relative">
               <span className="material-symbols-outlined absolute left-2 top-1.5 text-sm text-[#444748]">person_search</span>
               <input
                 type="text"
                 value={auditActor}
                 onChange={(e) => setAuditActor(e.target.value)}
                 placeholder="Acted by..."
                 className="pl-7 pr-2 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#1a1c1c] w-40 focus:outline-none focus:border-[#1e1e1e]"
               />
             </div>
             {/* Clear Dates button — only shown when date/actor filters are active */}
             {(auditFrom || auditTo || auditActor) && (
               <button
                 onClick={() => { setAuditFrom(''); setAuditTo(''); setAuditActor(''); }}
                 className="px-2.5 py-1.5 text-[11px] font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
               >
                 Clear Dates
               </button>
             )}
           </div>

           {/* Bulk restore bar — appears once rows are selected. */}
           {selectedAuditIds.size > 0 && (
             <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs animate-in fade-in">
               {/* Count of selected rows */}
               <span className="font-bold text-[#1a1c1c]">
                 {selectedAuditIds.size} selected
               </span>
               <div className="flex gap-2">
                 {/* Clear Selection — deselects all rows */}
                 <button
                   onClick={() => setSelectedAuditIds(new Set())}
                   className="px-3 py-1.5 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#e1e3e3] cursor-pointer"
                 >
                   Clear Selection
                 </button>
                 {/* Restore Selected — performs the bulk restore */}
                 <button
                   onClick={() => void handleBulkRestore()}
                   disabled={bulkRestoring}
                   className="px-3 py-1.5 font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded cursor-pointer disabled:opacity-60"
                 >
                   {bulkRestoring ? 'Restoring…' : `Restore Selected (${selectedAuditIds.size})`}
                 </button>
               </div>
             </div>
           )}

           {/* Audit log table */}
           <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
             <table className="w-full text-left border-collapse text-xs">
               <thead>
                 {/* Table header — checkboxes, entity, action, actor, timestamp, details, actions */}
                 <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                   {/* Select-all checkbox column */}
                   <th className="p-3 w-10">
                     <input
                       type="checkbox"
                       checked={selectedAuditIds.size > 0 && selectedAuditIds.size === auditLogs.filter((l) => l.action === 'DELETE').length && auditLogs.some((l) => l.action === 'DELETE')}
                       onChange={toggleSelectAllAudit}
                       className="accent-[#1e1e1e] w-4 h-4"
                       aria-label="Select all restorable"
                     />
                   </th>
                   <th className="p-3">Entity</th>
                   <th className="p-3">Action</th>
                   <th className="p-3">Deleted / Acted By</th>
                   <th className="p-3">When</th>
                   <th className="p-3">Original Details</th>
                   <th className="p-3 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-[#e1e3e3]">
                 {/* Loading state */}
                 {auditLoading ? (
                   <tr>
                     <td colSpan={7} className="p-6 text-center text-[#444748]">
                       Loading audit history…
                     </td>
                   </tr>
                 ) : /* Empty state */
                 auditLogs.length === 0 ? (
                   <tr>
                     <td colSpan={7} className="p-6 text-center text-[#444748]">
                       No audit records found. Deleted items will appear here.
                     </td>
                   </tr>
                 ) : (
                   auditLogs.map((log) => (
                     <tr key={log.id} className={`hover:bg-[#f9f9f9] ${selectedAuditIds.has(log.id) ? 'bg-emerald-50/60' : ''}`}>
                       {/* Row selection checkbox — disabled for RESTORE actions */}
                       <td className="p-3">
                         <input
                           type="checkbox"
                           checked={selectedAuditIds.has(log.id)}
                           onChange={() => toggleAuditSelect(log.id)}
                           disabled={log.action !== 'DELETE'}
                           className="accent-[#1e1e1e] w-4 h-4 disabled:opacity-30"
                           aria-label="Select for restore"
                         />
                       </td>
                       {/* Entity name — mapped to a user-friendly label */}
                       <td className="p-3 font-semibold text-[#1a1c1c]">
                         {ENTITY_LABELS[log.entityName] ?? log.entityName}
                       </td>
                       {/* Action badge — red for DELETE, green for RESTORE */}
                       <td className="p-3">
                         <span
                           className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                             log.action === 'DELETE'
                               ? 'bg-red-100 text-red-800'
                               : 'bg-emerald-100 text-emerald-800'
                           }`}
                         >
                           {log.action === 'DELETE' ? 'DELETED' : 'RESTORED'}
                         </span>
                       </td>
                       {/* Actor who performed the action */}
                       <td className="p-3 text-[#444748]">
                         {log.deletedByName ?? log.deletedBy ?? '—'}
                       </td>
                       {/* Timestamp */}
                       <td className="p-3 text-[#444748] whitespace-nowrap">
                         {formatDateTime(log.createdAt)}
                       </td>
                         {/* Metadata snapshot — compact preview with full JSON on hover */}
                         <td className="p-3 text-[#444748] max-w-md">
                           {/* Hovering reveals the full raw JSON; the cell shows a compact preview. */}
                           <span title={log.metadata ? JSON.stringify(log.metadata, null, 2) : undefined}>
                            {snapshotPreview(log.metadata)}
                          </span>
                        </td>
                        {/* Action buttons — Diff and Restore */}
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          {/* Diff — opens the JSON diff modal */}
                          <button
                            onClick={() => void handleOpenDiff(log)}
                            className="px-2.5 py-1 text-[11px] font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
                          >
                            Diff
                          </button>
                          {/* Restore — only shown for DELETE actions; disabled during flight */}
                          {log.action === 'DELETE' && (
                            <button
                              onClick={() => void handleRestore(log)}
                              disabled={restoringId === log.id}
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded cursor-pointer disabled:opacity-60"
                            >
                              {restoringId === log.id ? 'Restoring…' : 'Restore'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
               </tbody>
             </table>
           </div>
         </div>
       )}

        {/* JSON Diff Modal — compares the pre-delete snapshot against the record's
            current state, colouring added/removed/changed fields. */}
        {diffLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs" onClick={() => setDiffLog(null)}>
            {/* Modal card — stopPropagation prevents backdrop click from closing */}
            <div
              className="bg-white border border-[#e1e3e3] rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl animate-in fade-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header — entity label, diff title, and close button */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#e1e3e3]">
                <div>
                  {/* Entity name and "JSON Diff" label */}
                  <h4 className="text-sm font-bold text-[#1a1c1c]">
                    {ENTITY_LABELS[diffLog.entityName] ?? diffLog.entityName} — JSON Diff
                  </h4>
                  {/* Timestamp of the snapshot */}
                  <p className="text-[11px] text-[#444748]">
                    Snapshot (at {formatDateTime(diffLog.createdAt)}) vs. current record state
                  </p>
                </div>
                {/* Close button */}
                <button
                  onClick={() => setDiffLog(null)}
                  className="text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Diff content — scrollable body */}
              <div className="overflow-y-auto p-5">
                {/* Loading state */}
                {diffCurrent === undefined ? (
                  <p className="text-xs text-[#444748] text-center py-8">Loading current record…</p>
                ) : /* Record no longer exists — only the snapshot remains */
                diffCurrent === null ? (
                  <p className="text-xs text-[#444748] text-center py-8">
                    Current record no longer exists — only the stored snapshot remains.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {buildDiff(diffLog.metadata, diffCurrent).map((row) => {
                      // Status-based styling — emerald for added, rose for removed,
                      // amber for changed, neutral for unchanged
                      const statusStyles =
                        row.status === 'added'
                          ? 'bg-emerald-50 border-emerald-300'
                          : row.status === 'removed'
                            ? 'bg-rose-50 border-rose-300'
                            : row.status === 'changed'
                              ? 'bg-amber-50 border-amber-300'
                              : 'bg-[#f4f3f3] border-[#e1e3e3]';
                      // Status label text
                      const label =
                        row.status === 'added' ? 'ADDED'
                        : row.status === 'removed' ? 'REMOVED'
                        : row.status === 'changed' ? 'CHANGED'
                        : 'unchanged';
                      return (
                        <div key={row.key} className={`p-2.5 rounded border ${statusStyles} text-xs`}>
                          <div className="flex items-center justify-between gap-2">
                            {/* Field name — monospaced */}
                            <span className="font-mono font-bold text-[#1a1c1c]">{row.key}</span>
                            {/* Status label — colour matches the row */}
                            <span className={`text-[9px] font-bold uppercase ${
                              row.status === 'added' ? 'text-emerald-700'
                              : row.status === 'removed' ? 'text-rose-700'
                              : row.status === 'changed' ? 'text-amber-700'
                              : 'text-[#777777]'
                            }`}>
                              {label}
                            </span>
                          </div>
                          {/* Before value — shown unless the field was added */}
                          {row.status !== 'added' && (
                            <div className="mt-1 text-[#444748]">
                              <span className="text-[10px] uppercase text-[#777777] mr-1">Before:</span>
                              <span className="font-mono">{formatDiffValue(row.before)}</span>
                            </div>
                          )}
                          {/* After value — shown unless the field was removed */}
                          {row.status !== 'removed' && (
                            <div className="mt-0.5 text-[#444748]">
                              <span className="text-[10px] uppercase text-[#777777] mr-1">After:</span>
                              <span className="font-mono">{formatDiffValue(row.after)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* 6. PARISH IDENTITY — same form as first-run wizard, editable by admin */}
      {activeSubTab === 'parish' && (
        <ParishIdentitySection notification={notification} showNotif={showNotif} />
      )}

       {/* EDIT USER MODAL — pre-filled form for editing an existing account */}
       {showEditUser && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
           <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
             {/* Modal title */}
             <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Edit User Account</h4>
             {/* Edit form — name, email, title, role, password, and active toggle */}
             <form onSubmit={handleEditUserSubmit} className="space-y-3 text-xs">
               {/* Full Name input — required */}
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
               {/* Email Address input — required, email type */}
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
               {/* Title / Role text input — optional */}
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
               {/* Role dropdown — excludes super_admin */}
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
               {/* New Password input — blank means keep current */}
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
               {/* Active status checkbox */}
               <label className="flex items-center gap-1.5 cursor-pointer">
                 <input
                   type="checkbox"
                   checked={editActive}
                   onChange={(e) => setEditActive(e.target.checked)}
                   className="accent-[#1e1e1e]"
                 />
                 <span className="text-[#1a1c1c]">Active</span>
               </label>
               {/* Cancel and Save Changes buttons */}
               <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                 {/* Cancel — closes the modal */}
                 <button
                   type="button"
                   onClick={() => setShowEditUser(false)}
                   className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                 >
                   Cancel
                 </button>
                 {/* Save Changes — persists the edit */}
                 <button
                   type="submit"
                   disabled={!perms.canEdit('administration')}
                   className={`px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded ${
                     perms.canEdit('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                   }`}
                 >
                   Save Changes
                 </button>
               </div>
             </form>
           </div>
         </div>
       )}

       {/* ADD NEW USER MODAL — form for creating a new account */}
       {showAddUser && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
           <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
             {/* Modal title */}
             <h4 className="text-sm font-bold text-[#1a1c1c] uppercase">Create User Account</h4>
             {/* Create form — name, email, title, password, and role */}
             <form onSubmit={handleAddUserSubmit} className="space-y-3 text-xs">
               {/* Full Name input — required */}
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
               {/* Email Address input — required, email type */}
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
               {/* Title / Role text input — optional */}
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
               {/* Temporary Password input — required, min 8 chars */}
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
               {/* Role dropdown — excludes super_admin */}
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
               {/* Cancel and Create Account buttons */}
               <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
                 {/* Cancel — closes the modal */}
                 <button
                   type="button"
                   onClick={() => setShowAddUser(false)}
                   className="px-3 py-1.5 text-[#444748] bg-gray-100 rounded cursor-pointer"
                 >
                   Cancel
                 </button>
                 {/* Create Account — persists the new user */}
                 <button
                   type="submit"
                   disabled={!perms.canEdit('administration')}
                   className={`px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded ${
                     perms.canEdit('administration') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                   }`}
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
