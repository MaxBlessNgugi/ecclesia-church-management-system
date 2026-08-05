// =============================================================================
// REST API client layer
// -----------------------------------------------------------------------------
// Thin typed wrappers over fetch for every backend endpoint. Centralizes:
//   - BASE_URL resolution (VITE_API_BASE_URL or same-origin /api)
//   - the `ecclesia_token` Bearer header injection
//   - JSON error extraction into a typed ApiError (status + message + body)
//   - query-string building that skips empty/undefined params
//
// Views import these objects directly (e.g. christiansApi.list). The shapes
// returned are the types from src/types.ts — the backend already un-strings the
// JSON columns, so no parsing is needed here.
// =============================================================================
import {
  AuthSession,
  BilledItemReceipt,
  ChristianRecord,
  ContributionRecord,
  ContributionReportRow,
  CreditorRecord,
  CashierReportRow,
  DashboardSummary,
  DeathRecord,
  DebtorRecord,
  DeliveryRecord,
  DepositRecord,
  EmployeeOnboardingInput,
  EmployeeRecord,
  ExpenseRecord,
  InventoryItem,
  LedgerMovement,
  LedgerRecord,
  LoginRequest,
  PanelPermissions,
  PushPaymentSettings,
  RegisterRequest,
  SacramentReportRow,
  SaleRecord,
  SalesReportRow,
  StockIssueRecord,
  StockTakeRecord,
  TransferRecord,
  AuditLogEntry,
  UserAccount,
  InventoryPriceAuditLog,
  UserRole,
  ExportBundle,
  DiagnosticsInfo
} from '../types';

/**
 * API client for the Ecclesia backend.
 *
 * Base URL resolution order:
 *   1. `VITE_API_BASE_URL` env var (see .env.example)
 *   2. `/api` (same-origin — served by the backend, or the Vite dev proxy in dev)
 *
 * Every resource maps 1:1 to the REST contract documented in `API.md`.
 * The backend developer implements these endpoints; the frontend simply calls them.
 *
 * NOTE: `remove` (DELETE) methods call the SOFT-delete endpoints — records are
 * never physically destroyed; they land in the Admin > Trash & Audit view.
 */
const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Core fetch wrapper. Always attaches the JWT (when present), parses JSON on
 * success, and normalizes failures into ApiError. A 204 response returns
 * undefined as T (used by DELETE endpoints).
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('ecclesia_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = await res.json();
      details = body;
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Builds a `?a=b&c=d` string, dropping undefined and empty-string params. */
function buildQuery(params?: QueryParams): string {
  if (!params) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

// ---------- Auth ----------

export const authApi = {
  login: (body: LoginRequest) =>
    request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: RegisterRequest) =>
    request<AuthSession>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request<AuthSession['user']>('/auth/me'),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>('/auth/change-password', { method: 'PUT', body: JSON.stringify(body) }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),
  resetPassword: (body: { token: string; newPassword: string }) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body)
    })
};

// ---------- Christians (member registry) ----------

export const christiansApi = {
  list: (params?: QueryParams) => request<ChristianRecord[]>(`/christians${buildQuery(params)}`),
  get: (id: string) => request<ChristianRecord>(`/christians/${id}`),
  create: (body: Partial<ChristianRecord>) =>
    request<ChristianRecord>('/christians', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<ChristianRecord>) =>
    request<ChristianRecord>(`/christians/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: string) => request<void>(`/christians/${id}`, { method: 'DELETE' }),
  updateSacraments: (id: string, body: Partial<ChristianRecord>) =>
    request<ChristianRecord>(`/christians/${id}/sacraments`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
};

// ---------- Contributions (activities) ----------

export const contributionsApi = {
  list: () => request<ContributionRecord[]>('/contributions'),
  create: (body: Omit<ContributionRecord, 'id'>) =>
    request<ContributionRecord>('/contributions', { method: 'POST', body: JSON.stringify(body) })
};

export const transfersApi = {
  list: () => request<TransferRecord[]>('/transfers'),
  create: (body: Omit<TransferRecord, 'id'>) =>
    request<TransferRecord>('/transfers', { method: 'POST', body: JSON.stringify(body) })
};

export const billedItemsApi = {
  list: () => request<BilledItemReceipt[]>('/billed-items'),
  create: (body: Omit<BilledItemReceipt, 'id'>) =>
    request<BilledItemReceipt>('/billed-items', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Sacraments / deaths ----------

export const deathsApi = {
  list: () => request<DeathRecord[]>('/deaths'),
  create: (body: Omit<DeathRecord, 'id'>) =>
    request<DeathRecord>('/deaths', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Finance ----------

export const depositsApi = {
  list: () => request<DepositRecord[]>('/deposits'),
  create: (body: Omit<DepositRecord, 'id'>) =>
    request<DepositRecord>('/deposits', { method: 'POST', body: JSON.stringify(body) })
};

export const creditorsApi = {
  list: () => request<CreditorRecord[]>('/creditors'),
  create: (body: Omit<CreditorRecord, 'id'>) =>
    request<CreditorRecord>('/creditors', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<CreditorRecord>) =>
    request<CreditorRecord>(`/creditors/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  markPaid: (id: string) =>
    request<CreditorRecord>(`/creditors/${id}/paid`, { method: 'PATCH' })
};

export const debtorsApi = {
  list: () => request<DebtorRecord[]>('/debtors'),
  create: (body: Omit<DebtorRecord, 'id'>) =>
    request<DebtorRecord>('/debtors', { method: 'POST', body: JSON.stringify(body) }),
  recordPayment: (id: string, amountPaid: number) =>
    request<DebtorRecord>(`/debtors/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amountPaid })
    })
};

export const expensesApi = {
  list: () => request<ExpenseRecord[]>('/expenses'),
  create: (body: Omit<ExpenseRecord, 'id'>) =>
    request<ExpenseRecord>('/expenses', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Ledgers ----------

export const ledgersApi = {
  list: () => request<LedgerRecord[]>('/ledgers'),
  create: (body: Omit<LedgerRecord, 'id'>) =>
    request<LedgerRecord>('/ledgers', { method: 'POST', body: JSON.stringify(body) }),
  transfer: (body: { fromLedgerId: string; toLedgerId: string; amount: number; notes?: string }) =>
    request<LedgerMovement>('/ledgers/transfer', { method: 'POST', body: JSON.stringify(body) }),
  movements: () => request<LedgerMovement[]>('/ledgers/movements')
};

// ---------- Inventory ----------

export const inventoryApi = {
  items: {
    list: () => request<InventoryItem[]>('/inventory/items'),
    create: (body: Omit<InventoryItem, 'id'>) =>
      request<InventoryItem>('/inventory/items', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<InventoryItem>) =>
      request<InventoryItem>(`/inventory/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      }),
    remove: (id: string) => request<void>(`/inventory/items/${id}`, { method: 'DELETE' }),
    history: (id: string) => request<InventoryPriceAuditLog[]>(`/inventory/items/${id}/history`),
    batchUpdate: (
      updates: { id: string; name?: string; category?: string; cost?: number; price?: number; reorder?: number }[]
    ) =>
      request<InventoryItem[]>('/inventory/items/batch-update', {
        method: 'POST',
        body: JSON.stringify({ updates })
      })
  },
  deliveries: {
    list: () => request<DeliveryRecord[]>('/inventory/deliveries'),
    create: (body: Omit<DeliveryRecord, 'id'>) =>
      request<DeliveryRecord>('/inventory/deliveries', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  },
  sales: {
    list: () => request<SaleRecord[]>('/inventory/sales'),
    create: (body: Omit<SaleRecord, 'id'>) =>
      request<SaleRecord>('/inventory/sales', { method: 'POST', body: JSON.stringify(body) })
  },
  stockTakes: {
    list: () => request<StockTakeRecord[]>('/inventory/stock-takes'),
    create: (body: Omit<StockTakeRecord, 'id'>) =>
      request<StockTakeRecord>('/inventory/stock-takes', {
        method: 'POST',
        body: JSON.stringify(body)
      }),
    updatePhysical: (id: string, physical: number) =>
      request<StockTakeRecord>(`/inventory/stock-takes/${id}/physical`, {
        method: 'PATCH',
        body: JSON.stringify({ physical })
      })
  },
  issues: {
    list: () => request<StockIssueRecord[]>('/inventory/issues'),
    create: (body: Omit<StockIssueRecord, 'id'>) =>
      request<StockIssueRecord>('/inventory/issues', { method: 'POST', body: JSON.stringify(body) })
  }
};

// ---------- HR ----------

export const hrApi = {
  employees: {
    list: () => request<EmployeeRecord[]>('/hr/employees'),
    create: (body: EmployeeOnboardingInput) =>
      request<EmployeeRecord>('/hr/employees', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<EmployeeRecord>) =>
      request<EmployeeRecord>(`/hr/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) })
  }
};

// ---------- Administration ----------

export const adminApi = {
  rights: {
    get: () => request<PanelPermissions>('/admin/rights'),
    update: (body: PanelPermissions) =>
      request<PanelPermissions>('/admin/rights', { method: 'PUT', body: JSON.stringify(body) })
  },
  users: {
    list: () => request<UserAccount[]>('/admin/users'),
    create: (body: { name: string; email: string; password: string; role: UserRole; title?: string }) =>
      request<UserAccount>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<UserAccount> & { password?: string }) =>
      request<UserAccount>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id: string) =>
      request<{ code: string; expiresInMinutes: number }>(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
  },
  permissions: {
    get: (userId: string) => request<PanelPermissions>(`/admin/users/${userId}/permissions`),
    update: (userId: string, body: PanelPermissions) =>
      request<PanelPermissions>(`/admin/users/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })
  },
  pushPayments: {
    get: () => request<PushPaymentSettings>('/admin/push-payments'),
    update: (body: PushPaymentSettings) =>
      request<PushPaymentSettings>('/admin/push-payments', {
        method: 'PUT',
        body: JSON.stringify(body)
      })
  },
  audit: {
    list: (params?: { entity?: string; action?: string; from?: string; to?: string; actor?: string }) =>
      request<AuditLogEntry[]>(`/admin/audit-logs${buildQuery(params)}`),
    current: (id: string) =>
      request<{ current: Record<string, unknown> | null }>(`/admin/audit-logs/${id}/current`),
    restore: (id: string) =>
      request<{ message: string }>(`/admin/audit-logs/${id}/restore`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
    restoreBulk: (ids: string[]) =>
      request<{ restored: number; failed: number }>(`/admin/audit-logs/restore-bulk`, {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
  },
  ops: {
    backup: () =>
      request<{ file: string; sizeBytes: number; at: string }>('/admin/backup', {
        method: 'POST',
        body: JSON.stringify({})
      }),
    exportData: () => request<ExportBundle>('/admin/export'),
    importData: (bundle: ExportBundle) =>
      request<{ message: string }>('/admin/import', {
        method: 'POST',
        body: JSON.stringify({ confirm: true, bundle })
      }),
    diagnostics: () => request<DiagnosticsInfo>('/admin/diagnostics')
  }
};

// ---------- Reports ----------

export const reportsApi = {
  sacraments: (params?: QueryParams) =>
    request<SacramentReportRow[]>(`/reports/sacraments${buildQuery(params)}`),
  contributions: (params?: QueryParams) =>
    request<ContributionReportRow[]>(`/reports/contributions${buildQuery(params)}`),
  sales: (params?: QueryParams) => request<SalesReportRow[]>(`/reports/sales${buildQuery(params)}`),
  cashiers: (params?: QueryParams) =>
    request<CashierReportRow[]>(`/reports/cashiers${buildQuery(params)}`)
};

// ---------- Dashboard ----------

export const dashboardApi = {
  summary: () => request<DashboardSummary>('/dashboard/summary')
};
