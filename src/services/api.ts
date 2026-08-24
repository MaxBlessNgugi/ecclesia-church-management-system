// =============================================================================
// Ecclesia CMS — REST API Client Layer
// =============================================================================
//
// PURPOSE
//   Thin typed wrappers over fetch() for EVERY backend endpoint. Centralizes:
//   - BASE_URL resolution (VITE_API_BASE_URL or same-origin /api)
//   - JWT Bearer header injection (ecclesia_token from localStorage/sessionStorage)
//   - JSON error extraction into typed ApiError (status + message + details)
//   - Query-string building that skips empty/undefined params
//
// ARCHITECTURE
//   ┌─────────────────────────────────────────────────────────────────────────┐
//   │ request<T>(path, options) — Core fetch wrapper                          │
//   │   ├── Attaches Authorization: Bearer <token> when token exists          │
//   │   ├── Sets Content-Type: application/json                               │
//   │   ├── Throws ApiError on non-2xx (status, message, parsed details)      │
//   │   ├── Returns undefined for 204 No Content (DELETE endpoints)           │
//   │   └── Returns parsed JSON as T on success                               │
//   │                                                                          │
//   │ buildQuery(params) — URLSearchParams builder                            │
//   │   ├── Drops undefined and empty-string values                           │
//   │   └── Returns '' or '?key=value&...'                                    │
//   │                                                                          │
//   │ Token Storage Helpers                                                   │
//   │   ├── getStoredToken()     → localStorage || sessionStorage             │
//   │   ├── storeToken(token, remember) → LS (remember) or SS (!remember)     │
//   │   └── clearStoredToken()   → removes from both                          │
//   │   "Remember Me" on login controls which store is used                   │
//   └─────────────────────────────────────────────────────────────────────────┘
//
// RESOURCE MAP (api object → backend router → Prisma model)
//   ┌──────────────────┬──────────────────────────┬──────────────────────────┐
//   │ API Object       │ Backend Route(s)         │ Prisma Model(s)          │
//   ├──────────────────┼──────────────────────────┼──────────────────────────┤
//   │ authApi          │ /api/auth/*              │ User                     │
//   │ christiansApi    │ /api/christians*         │ Christian                │
//   │ contributionsApi │ /api/contributions       │ Contribution             │
//   │ transfersApi     │ /api/transfers           │ Transfer                 │
//   │ billedItemsApi   │ /api/billed-items        │ BilledItem               │
//   │ deathsApi        │ /api/deaths*             │ Death                    │
//   │ depositsApi      │ /api/deposits            │ Deposit                  │
//   │ creditorsApi     │ /api/creditors*          │ Creditor                 │
//   │ debtorsApi       │ /api/debtors*            │ Debtor                   │
//   │ expensesApi      │ /api/expenses            │ Expense                  │
//   │ ledgersApi       │ /api/ledgers*            │ Ledger, LedgerMovement   │
//   │ inventoryApi     │ /api/inventory/*         │ InventoryItem, Delivery, │
//   │                  │   items/deliveries/sales │ Sale, StockTake, StockIssue│
//   │                  │   stock-takes/issues     │                          │
//   │ hrApi            │ /api/hr/*                │ Employee, Payroll, Leave,│
//   │                  │   employees/payroll/leave│ Recruitment              │
//   │                  │   /recruitment           │                          │
//   │ adminApi         │ /api/admin/*             │ User, PanelPermissions,  │
//   │                  │   users/permissions/     │ PushPaymentSettings,     │
//   │                  │   push-payments/audit    │ AuditLog                 │
//   │ reportsApi       │ /api/reports/*           │ (computed views)         │
//   └──────────────────┴──────────────────────────┴──────────────────────────┘
//
// IMPORTANT NOTES
//   - ALL .remove() methods call SOFT-delete endpoints (isDeleted=true)
//     Records are never physically destroyed; they land in Admin > Trash & Audit
//   - Backend already un-strings JSON columns (sacraments, monthlyTracker,
//     permissions) — no parsing needed in the frontend
//   - Views import these objects directly: christiansApi.list(), etc.
//   - The shapes returned are the types from src/types.ts
//
// RELATED FILES
//   - src/types.ts                    → All request/response type definitions
//   - backend/src/routes/*.ts         → Server-side route handlers
//   - backend/prisma/schema.prisma    → Database models (source of truth)
//   - API.md                          → REST contract documentation
// =============================================================================

// ---------------------------------------------------------------------------
// Type imports — every named import is a TypeScript interface or type
// defined in src/types.ts. They describe the request/response shapes for
// all backend endpoints so the API wrappers stay fully typed.
// ---------------------------------------------------------------------------

/** Session data returned after a successful login (user profile + token). */
import { AuthSession } from '../types';

/** Billed-item receipt record used in the activity / sacrament fee workflow. */
import { BilledItemReceipt } from '../types';

/** Christian (member) record — the core member registry entity. */
import { ChristianRecord } from '../types';

/** Single contribution row logged in the finance activities ledger. */
import { ContributionRecord } from '../types';

/** Aggregated row used to render the Contribution Report view. */
import { ContributionReportRow } from '../types';

/** Creditor record — the church owes money to this party. */
import { CreditorRecord } from '../types';

/** Aggregated row used to render the Cashier Report view. */
import { CashierReportRow } from '../types';

/** Death record for the sacramental death register. */
import { DeathRecord } from '../types';

/** Debtor record — this party owes money to the church. */
import { DebtorRecord } from '../types';

/** Delivery record tracking incoming stock to the inventory. */
import { DeliveryRecord } from '../types';

/** Bank / cash deposit record for the finance module. */
import { DepositRecord } from '../types';

/** Input shape for onboarding (creating) a new employee. */
import { EmployeeOnboardingInput } from '../types';

/** Full employee record with all HR fields. */
import { EmployeeRecord } from '../types';

/** Input shape for updating an existing employee (subset of fields). */
import { EmployeeUpdateInput } from '../types';

/** Expense record logged against a ledger or petty cash. */
import { ExpenseRecord } from '../types';

/** Single inventory item (product) with cost/price/stock fields. */
import { InventoryItem } from '../types';

/** Ledger movement entry — debit or credit against a ledger account. */
import { LedgerMovement } from '../types';

/** Ledger (account) record — e.g. offering, tithe, building fund. */
import { LedgerRecord } from '../types';

/** Login request body (email + password). */
import { LoginRequest } from '../types';

/** Per-panel permission map assigned to a user account. */
import { PanelPermissions } from '../types';

/** Full payroll run record for a given period. */
import { PayrollRecord } from '../types';

/** Input shape for creating a new payroll run. */
import { PayrollCreateInput } from '../types';

/** Single leave request / record for an employee. */
import { LeaveRecord } from '../types';

/** Input shape for creating a leave request. */
import { LeaveCreateInput } from '../types';

/** Recruitment posting record (job vacancy). */
import { RecruitmentRecord } from '../types';

/** Input shape for creating a recruitment posting. */
import { RecruitmentCreateInput } from '../types';

/** Individual applicant linked to a recruitment posting. */
import { RecruitmentApplicant } from '../types';

/** Input shape for adding an applicant to a recruitment posting. */
import { ApplicantCreateInput } from '../types';

/** Push-payment gateway settings (card reader / online payment config). */
import { ParishSettings, PushPaymentSettings, SystemSettings } from '../types';

/** Aggregated row for the Sacrament Report view. */
import { SacramentReportRow } from '../types';

/** Inventory sale (outgoing stock) record. */
import { SaleRecord } from '../types';

/** Aggregated row for the Sales Report view. */
import { SalesReportRow } from '../types';

/** Stock issue record — internal consumption / write-off of inventory. */
import { StockIssueRecord } from '../types';

/** Stock-take record — physical count reconciliation. */
import { StockTakeRecord } from '../types';

/** Inter-ledger transfer record (e.g. offering → building fund). */
import { TransferRecord } from '../types';

/** Audit log entry — who changed what and when (soft-delete trail). */
import { AuditLogEntry } from '../types';

/** User account (admin panel login) with role and permissions. */
import { UserAccount } from '../types';

/** Price-change audit log entry for an inventory item. */
import { InventoryPriceAuditLog } from '../types';

/** Discriminated union of user roles (admin, pastor, accountant, etc.). */
import { UserRole } from '../types';

/** Complete data bundle returned by the admin export endpoint. */
import { ExportBundle } from '../types';

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

/** localStorage key for the configured server URL. */
const SERVER_URL_KEY = 'ecclesia_server_url';

/**
 * Get the configured server URL from localStorage.
 * Returns null if no server URL is configured (first launch).
 */
export function getServerUrl(): string | null {
  return localStorage.getItem(SERVER_URL_KEY);
}

/**
 * Save the server URL to localStorage.
 * @param url - The full server URL (e.g. http://192.168.1.100:5000)
 */
export function setServerUrl(url: string): void {
  // Normalize: strip trailing slash
  localStorage.setItem(SERVER_URL_KEY, url.replace(/\/$/, ''));
}

/**
 * Clear the configured server URL from localStorage.
 */
export function clearServerUrl(): void {
  localStorage.removeItem(SERVER_URL_KEY);
}

/**
 * Base URL for all API requests.
 * Resolution order:
 *   1. Server URL from localStorage (configured by user on first launch)
 *   2. VITE_API_BASE_URL env var (for dev/testing)
 *   3. `/api` (same-origin fallback)
 */
function resolveBaseUrl(): string {
  // Check localStorage first (configured by user)
  const savedUrl = getServerUrl();
  if (savedUrl) {
    return `${savedUrl}/api`;
  }
  // Fall back to env var or same-origin
  return (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '/api';
}

const BASE_URL: string = resolveBaseUrl();

// -----------------------------------------------------------------------------
// Session token storage
// -----------------------------------------------------------------------------
// "Remember Session" on the login screen controls whether the JWT lives in
// localStorage (survives browser restart) or sessionStorage (cleared when the
// tab/browser closes). All reads/writes go through these helpers so the storage
// medium is never referenced directly elsewhere.

/** localStorage / sessionStorage key used to persist the JWT. */
const TOKEN_KEY = 'ecclesia_token';

/**
 * Retrieve the stored JWT token.
 *
 * Checks localStorage first (for "Remember Me" sessions), then falls back
 * to sessionStorage (for temporary sessions). Returns `null` if no token
 * is found in either store.
 *
 * @returns The stored JWT string, or `null` if not authenticated.
 */
export function getStoredToken(): string | null {
  // localStorage takes priority — it persists across browser restarts.
  // The nullish coalescing operator (??) falls through to sessionStorage
  // only when localStorage.getItem returns null.
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
}

/**
 * Persist a JWT token in the appropriate browser storage.
 *
 * Both stores are always cleared first to prevent stale tokens. If
 * `remember` is true the token is written to localStorage (persists
 * until explicitly cleared); otherwise sessionStorage is used (cleared
 * when the tab/browser closes).
 *
 * @param token   - The JWT string to store.
 * @param remember - When true, use localStorage; when false, use sessionStorage.
 */
export function storeToken(token: string, remember: boolean): void {
  // Clear both stores first to avoid duplicate tokens in different storage mediums.
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  // Write to the chosen store using a ternary to select the Storage object.
  (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
}

/**
 * Remove the stored JWT from both browser storage mechanisms.
 *
 * Called on logout to guarantee the token is gone regardless of which
 * store was originally used.
 */
export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/**
 * Typed error class thrown by the `request` wrapper when the backend
 * returns a non-2xx HTTP status.
 *
 * Carries the numeric status code, a human-readable message (extracted
 * from the JSON body when available), and the raw parsed error body as
 * `details` so callers can inspect validation errors, etc.
 */
export class ApiError extends Error {
  /** HTTP status code returned by the backend (e.g. 400, 401, 404, 500). */
  readonly status: number;

  /** Parsed error body from the backend — may contain validation details, etc. */
  readonly details?: unknown;

  /**
   * @param status  - HTTP status code from the failed response.
   * @param message - Human-readable error description.
   * @param details - Optional parsed JSON body of the error response.
   */
  constructor(status: number, message: string, details?: unknown) {
    // Call the parent Error constructor with the message string.
    super(message);
    // Override the default `name` so error-reporting tools show "ApiError".
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Generic key-value map for URL query-string parameters.
 * Values may be strings, numbers, booleans, or undefined (which are
 * dropped by `buildQuery`).
 */
export interface QueryParams {
  [key: string]: string | number | boolean | undefined;
}

/**
 * Core fetch wrapper. Always attaches the JWT (when present), parses JSON on
 * success, and normalizes failures into ApiError. A 204 response returns
 * undefined as T (used by DELETE endpoints).
 *
 * @typeParam T - The expected JSON response type.
 * @param path    - API path relative to BASE_URL (e.g. `/auth/login`).
 * @param options - Standard `RequestInit` options (method, body, etc.).
 * @returns The parsed JSON response typed as `T`.
 * @throws {ApiError} When the backend returns a non-2xx status code.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Retrieve the stored JWT — returns null if the user is not logged in.
  const token = getStoredToken();

  // Build the headers object, starting with Content-Type and merging any
  // caller-provided headers (which may override the default).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>)
  };

  // Attach the Bearer token only when one exists — unauthenticated
  // endpoints (e.g. login) skip this header entirely.
  if (token) headers.Authorization = `Bearer ${token}`;

  // Execute the fetch against the fully-qualified URL.
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // Handle non-2xx responses: attempt to parse a JSON error body, fall
  // back to a generic status-based message if the body isn't JSON.
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      // Try to parse the response body as JSON — the backend always
      // returns `{ error: "..." }` or `{ error: "...", details: {...} }`.
      const body = await res.json();
      details = body;
      // Prefer the structured `error` string when present.
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // Non-JSON error body (e.g. HTML 502 gateway page) — keep the
      // generic message and leave details undefined.
    }
    throw new ApiError(res.status, message, details);
  }

  // 204 No Content is returned by DELETE endpoints that succeed but
  // produce no response body — return `undefined` cast as T.
  if (res.status === 204) return undefined as T;

  // Parse and return the JSON response body typed as T.
  return (await res.json()) as T;
}

/**
 * Build a query-string suffix from a params object.
 *
 * Omits keys whose values are `undefined` or empty strings, so callers
 * can pass optional filters without worrying about empty params.
 *
 * @param params - Key-value map of query parameters (optional).
 * @returns A string like `?status=active&page=1`, or `''` when there
 *          are no valid params.
 */
function buildQuery(params?: QueryParams): string {
  // No params at all — return an empty string (no `?`).
  if (!params) return '';
  // URLSearchParams handles encoding and joining automatically.
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Skip undefined and empty-string values to keep the URL clean.
    if (value !== undefined && value !== '') qs.set(key, String(value));
  }
  const s = qs.toString();
  // Prepend `?` only when there are actual params; otherwise return ''.
  return s ? `?${s}` : '';
}

// ---------- Auth ----------------------------------------------------------------

/**
 * Authentication API — login, session retrieval, password management.
 *
 * All methods target the `/auth/*` backend routes and operate on the
 * `User` Prisma model.
 */
export const authApi = {
  /**
   * Authenticate a user with email and password.
   *
   * **POST** `/auth/login`
   *
   * @param body - Login credentials (`email` + `password`).
   * @returns The authenticated user profile and a fresh JWT token.
   * @throws {ApiError} 401 if credentials are invalid.
   */
  login: (body: LoginRequest) =>
    request<AuthSession>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Retrieve the currently authenticated user's profile.
   *
   * **GET** `/auth/me`
   *
   * Uses the Bearer token from the request header to identify the user.
   *
   * @returns The user profile object (`AuthSession['user']`).
   * @throws {ApiError} 401 if the token is missing or expired.
   */
  me: () => request<AuthSession['user']>('/auth/me'),

  /**
   * Change the authenticated user's password.
   *
   * **PUT** `/auth/change-password`
   *
   * @param body - Object containing the current password and the desired new password.
   * @returns A confirmation message.
   * @throws {ApiError} 400 if the current password is incorrect.
   */
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>('/auth/change-password', { method: 'PUT', body: JSON.stringify(body) }),

  /**
   * Request a password-reset email.
   *
   * **POST** `/auth/forgot-password`
   *
   * @param email - The email address associated with the account.
   * @returns `{ ok: true }` if the email was sent (always, to prevent enumeration).
   */
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

  /**
   * Reset a user's password using a one-time token from the reset email.
   *
   * **POST** `/auth/reset-password`
   *
   * @param body - The reset token and the desired new password.
   * @returns A confirmation message.
   * @throws {ApiError} 400 if the token is expired or invalid.
   */
  resetPassword: (body: { token: string; newPassword: string }) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body)
    }),

  /**
   * Whether the first-run administrator setup is required.
   *
   * **GET** `/auth/bootstrap-status`
   *
   * Returns `{ needsBootstrap: true }` while the database has no users yet
   * (a fresh install). The login screen shows the guided setup form then.
   */
  bootstrapStatus: () => request<{ needsBootstrap: boolean }>('/auth/bootstrap-status'),

  /**
   * Create the FIRST super admin on a fresh database.
   *
   * **POST** `/auth/bootstrap`
   *
   * @param body - The administrator's name, email, and chosen password.
   * @returns An authenticated session (`token` + `user`) — the user is signed
   *   in immediately after setup.
   * @throws {ApiError} 409 if setup was already completed.
   */
  bootstrap: (body: { name: string; email: string; password: string }) =>
    request<AuthSession>('/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(body)
    })
};

// ---------- Christians (member registry) ----------------------------------------

/**
 * Christians (Member Registry) API — CRUD for the church membership roster.
 *
 * Maps to the `Christian` Prisma model via `/api/christians*` routes.
 */
export const christiansApi = {
  /**
   * List all Christian records, with optional query-string filters.
   *
   * **GET** `/christians?...`
   *
   * @param params - Optional filters (e.g. `?search=John&status=active`).
   * @returns An array of `ChristianRecord` objects.
   */
  list: (params?: QueryParams) => request<ChristianRecord[]>(`/christians${buildQuery(params)}`),

  /**
   * Create a new Christian (member) record.
   *
   * **POST** `/christians`
   *
   * @param body - Partial record; the backend fills in `id`, timestamps, etc.
   * @returns The newly created `ChristianRecord` with its server-generated `id`.
   */
  create: (body: Partial<ChristianRecord>) =>
    request<ChristianRecord>('/christians', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Soft-delete a Christian record.
   *
   * **DELETE** `/christians/:id`
   *
   * The record is marked `isDeleted=true` and moved to the admin trash view;
   * it is never physically removed from the database.
   *
   * @param id - The unique identifier of the Christian to delete.
   */
  remove: (id: string) => request<void>(`/christians/${id}`, { method: 'DELETE' }),

  /**
   * Update the sacrament fields of an existing Christian record.
   *
   * **PATCH** `/christians/:id/sacraments`
   *
   * Only the sacrament-related columns (baptism, confirmation, marriage,
   * etc.) are modified — other record fields are left untouched.
   *
   * @param id   - The unique identifier of the Christian.
   * @param body - Partial sacrament fields to update.
   * @returns The full updated `ChristianRecord`.
   */
  updateSacraments: (body: Partial<ChristianRecord>, id?: string) =>
    request<ChristianRecord>(`/christians/${id}/sacraments`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    })
};

// ---------- Contributions (activities) -----------------------------------------

/**
 * Contributions API — log financial activities (offerings, tithes, etc.).
 *
 * Maps to the `Contribution` Prisma model via `/api/contributions` route.
 */
export const contributionsApi = {
  /**
   * Create a new contribution record.
   *
   * **POST** `/contributions`
   *
   * @param body - Contribution data without `id` (server generates it).
   * @returns The created `ContributionRecord`.
   */
  create: (body: Omit<ContributionRecord, 'id'>) =>
    request<ContributionRecord>('/contributions', { method: 'POST', body: JSON.stringify(body) })
};

/**
 * Transfers API — move funds between ledgers.
 *
 * Maps to the `Transfer` Prisma model via `/api/transfers` route.
 */
export const transfersApi = {
  /**
   * Create a new inter-ledger transfer.
   *
   * **POST** `/transfers`
   *
   * @param body - Transfer data (source ledger, destination ledger, amount, notes).
   * @returns The created `TransferRecord`.
   */
  create: (body: Omit<TransferRecord, 'id'>) =>
    request<TransferRecord>('/transfers', { method: 'POST', body: JSON.stringify(body) })
};

/**
 * Billed Items API — log sacrament / activity fees.
 *
 * Maps to the `BilledItem` Prisma model via `/api/billed-items` route.
 */
export const billedItemsApi = {
  /**
   * Create a new billed-item receipt.
   *
   * **POST** `/billed-items`
   *
   * @param body - Receipt data without `id`.
   * @returns The created `BilledItemReceipt`.
   */
  create: (body: Omit<BilledItemReceipt, 'id'>) =>
    request<BilledItemReceipt>('/billed-items', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Sacraments / deaths ------------------------------------------------

/**
 * Deaths API — maintain the death register.
 *
 * Maps to the `Death` Prisma model via `/api/deaths*` routes.
 */
export const deathsApi = {
  /**
   * List all death records.
   *
   * **GET** `/deaths`
   *
   * @returns An array of `DeathRecord` objects.
   */
  list: () => request<DeathRecord[]>('/deaths'),

  /**
   * Create a new death record.
   *
   * **POST** `/deaths`
   *
   * @param body - Death record data without `id`.
   * @returns The created `DeathRecord`.
   */
  create: (body: Omit<DeathRecord, 'id'>) =>
    request<DeathRecord>('/deaths', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Finance -------------------------------------------------------------

/**
 * Deposits API — bank / cash deposit records.
 *
 * Maps to the `Deposit` Prisma model via `/api/deposits` route.
 */
export const depositsApi = {
  /**
   * List all deposit records.
   *
   * **GET** `/deposits`
   *
   * @returns An array of `DepositRecord` objects.
   */
  list: () => request<DepositRecord[]>('/deposits'),

  /**
   * Create a new deposit record.
   *
   * **POST** `/deposits`
   *
   * @param body - Deposit data without `id`.
   * @returns The created `DepositRecord`.
   */
  create: (body: Omit<DepositRecord, 'id'>) =>
    request<DepositRecord>('/deposits', { method: 'POST', body: JSON.stringify(body) })
};

/**
 * Creditors API — manage parties the church owes money to.
 *
 * Maps to the `Creditor` Prisma model via `/api/creditors*` routes.
 */
export const creditorsApi = {
  /**
   * List all creditor records.
   *
   * **GET** `/creditors`
   *
   * @returns An array of `CreditorRecord` objects.
   */
  list: () => request<CreditorRecord[]>('/creditors'),

  /**
   * Create a new creditor record.
   *
   * **POST** `/creditors`
   *
   * @param body - Creditor data without `id`.
   * @returns The created `CreditorRecord`.
   */
  create: (body: Omit<CreditorRecord, 'id'>) =>
    request<CreditorRecord>('/creditors', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Mark a creditor as paid (settle the debt).
   *
   * **PATCH** `/creditors/:id/paid`
   *
   * @param id - The unique identifier of the creditor to mark as paid.
   * @returns The updated `CreditorRecord` with `paid=true`.
   */
  markPaid: (id: string) =>
    request<CreditorRecord>(`/creditors/${id}/paid`, { method: 'PATCH' })
};

/**
 * Debtors API — manage parties that owe money to the church.
 *
 * Maps to the `Debtor` Prisma model via `/api/debtors*` routes.
 */
export const debtorsApi = {
  /**
   * List all debtor records.
   *
   * **GET** `/debtors`
   *
   * @returns An array of `DebtorRecord` objects.
   */
  list: () => request<DebtorRecord[]>('/debtors'),

  /**
   * Create a new debtor record.
   *
   * **POST** `/debtors`
   *
   * @param body - Debtor data without `id`.
   * @returns The created `DebtorRecord`.
   */
  create: (body: Omit<DebtorRecord, 'id'>) =>
    request<DebtorRecord>('/debtors', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Record a payment against an existing debtor.
   *
   * **POST** `/debtors/:id/payments`
   *
   * The backend reduces the outstanding balance by `amountPaid`.
   *
   * @param id        - The unique identifier of the debtor.
   * @param amountPaid - The amount being paid in this transaction.
   * @returns The updated `DebtorRecord` with the reduced balance.
   */
  recordPayment: (id: string, amountPaid: number) =>
    request<DebtorRecord>(`/debtors/${id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amountPaid })
    })
};

/**
 * Expenses API — record outgoing expenditures.
 *
 * Maps to the `Expense` Prisma model via `/api/expenses` route.
 */
export const expensesApi = {
  /**
   * List all expense records.
   *
   * **GET** `/expenses`
   *
   * @returns An array of `ExpenseRecord` objects.
   */
  list: () => request<ExpenseRecord[]>('/expenses'),

  /**
   * Create a new expense record.
   *
   * **POST** `/expenses`
   *
   * @param body - Expense data without `id`.
   * @returns The created `ExpenseRecord`.
   */
  create: (body: Omit<ExpenseRecord, 'id'>) =>
    request<ExpenseRecord>('/expenses', { method: 'POST', body: JSON.stringify(body) })
};

// ---------- Ledgers -------------------------------------------------------------

/**
 * Ledgers API — manage financial accounts and inter-account movements.
 *
 * Maps to `Ledger` and `LedgerMovement` Prisma models via `/api/ledgers*` routes.
 */
export const ledgersApi = {
  /**
   * List all ledger (account) records.
   *
   * **GET** `/ledgers`
   *
   * @returns An array of `LedgerRecord` objects.
   */
  list: () => request<LedgerRecord[]>('/ledgers'),

  /**
   * Create a new ledger (account).
   *
   * **POST** `/ledgers`
   *
   * @param body - Ledger data without `id`.
   * @returns The created `LedgerRecord`.
   */
  create: (body: Omit<LedgerRecord, 'id'>) =>
    request<LedgerRecord>('/ledgers', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Transfer funds between two ledgers.
   *
   * **POST** `/ledgers/transfer`
   *
   * Debits the source ledger and credits the destination ledger in a
   * single transaction. A `LedgerMovement` record is created for audit.
   *
   * @param body - Transfer details: `fromLedgerId`, `toLedgerId`, `amount`, and optional `notes`.
   * @returns The created `LedgerMovement` record.
   */
  transfer: (body: { fromLedgerId: string; toLedgerId: string; amount: number; notes?: string }) =>
    request<LedgerMovement>('/ledgers/transfer', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * List all ledger movements (debit/credit entries) across all accounts.
   *
   * **GET** `/ledgers/movements`
   *
   * @returns An array of `LedgerMovement` objects.
   */
  movements: () => request<LedgerMovement[]>('/ledgers/movements')
};

// ---------- Inventory -----------------------------------------------------------

/**
 * Inventory API — manage products, deliveries, sales, stock-takes, and issues.
 *
 * Organised into four sub-objects (`items`, `deliveries`, `sales`, `stockTakes`,
 * `issues`), each mapping to their respective backend routes under `/api/inventory/*`.
 */
export const inventoryApi = {
  /** Sub-API for managing inventory items (products). */
  items: {
    /**
     * List all inventory items.
     *
     * **GET** `/inventory/items`
     *
     * @returns An array of `InventoryItem` objects.
     */
    list: () => request<InventoryItem[]>('/inventory/items'),

    /**
     * Update a single inventory item.
     *
     * **PUT** `/inventory/items/:id`
     *
     * @param id   - The unique identifier of the item to update.
     * @param body - Partial fields to merge into the existing record.
     * @returns The updated `InventoryItem`.
     */
    update: (id: string, body: Partial<InventoryItem>) =>
      request<InventoryItem>(`/inventory/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      }),

    /**
     * Retrieve the price-change audit history for an inventory item.
     *
     * **GET** `/inventory/items/:id/history`
     *
     * @param id - The unique identifier of the item.
     * @returns An array of `InventoryPriceAuditLog` entries.
     */
    history: (id: string) => request<InventoryPriceAuditLog[]>(`/inventory/items/${id}/history`),

    /**
     * Batch-update multiple inventory items in a single request.
     *
     * **POST** `/inventory/items/batch-update`
     *
     * Each entry in the `updates` array may specify `name`, `category`,
     * `cost`, `price`, and/or `reorder` — only provided fields are
     * overwritten on each item.
     *
     * @param updates - Array of `{ id, ...fields }` objects.
     * @returns The full list of updated `InventoryItem` records.
     */
    batchUpdate: (
      updates: { id: string; name?: string; category?: string; cost?: number; price?: number; reorder?: number }[]
    ) =>
      request<InventoryItem[]>('/inventory/items/batch-update', {
        method: 'POST',
        body: JSON.stringify({ updates })
      })
  },

  /** Sub-API for recording incoming stock deliveries. */
  deliveries: {
    /**
     * List all delivery records.
     *
     * **GET** `/inventory/deliveries`
     *
     * @returns An array of `DeliveryRecord` objects.
     */
    list: () => request<DeliveryRecord[]>('/inventory/deliveries'),

    /**
     * Create a new delivery (incoming stock) record.
     *
     * **POST** `/inventory/deliveries`
     *
     * @param body - Delivery data without `id`.
     * @returns The created `DeliveryRecord`.
     */
    create: (body: Omit<DeliveryRecord, 'id'>) =>
      request<DeliveryRecord>('/inventory/deliveries', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  },

  /** Sub-API for recording outgoing stock sales. */
  sales: {
    /**
     * List all sale records.
     *
     * **GET** `/inventory/sales`
     *
     * @returns An array of `SaleRecord` objects.
     */
    list: () => request<SaleRecord[]>('/inventory/sales'),

    /**
     * Create a new sale (outgoing stock) record.
     *
     * **POST** `/inventory/sales`
     *
     * @param body - Sale data without `id`.
     * @returns The created `SaleRecord`.
     */
    create: (body: Omit<SaleRecord, 'id'>) =>
      request<SaleRecord>('/inventory/sales', { method: 'POST', body: JSON.stringify(body) })
  },

  /** Sub-API for physical stock-take reconciliation. */
  stockTakes: {
    /**
     * List all stock-take records.
     *
     * **GET** `/inventory/stock-takes`
     *
     * @returns An array of `StockTakeRecord` objects.
     */
    list: () => request<StockTakeRecord[]>('/inventory/stock-takes'),

    /**
     * Create a new stock-take record.
     *
     * **POST** `/inventory/stock-takes`
     *
     * @param body - Stock-take data without `id`.
     * @returns The created `StockTakeRecord`.
     */
    create: (body: Omit<StockTakeRecord, 'id'>) =>
      request<StockTakeRecord>('/inventory/stock-takes', {
        method: 'POST',
        body: JSON.stringify(body)
      }),

    /**
     * Update the physically counted quantity for a stock-take.
     *
     * **PATCH** `/inventory/stock-takes/:id/physical`
     *
     * The backend recalculates the variance between the system count
     * and the physical count.
     *
     * @param id      - The unique identifier of the stock-take.
     * @param physical - The physically counted quantity.
     * @returns The updated `StockTakeRecord` with the new variance.
     */
    updatePhysical: (id: string, physical: number) =>
      request<StockTakeRecord>(`/inventory/stock-takes/${id}/physical`, {
        method: 'PATCH',
        body: JSON.stringify({ physical })
      })
  },

  /** Sub-API for recording internal stock issues (consumption / write-offs). */
  issues: {
    /**
     * List all stock-issue records.
     *
     * **GET** `/inventory/issues`
     *
     * @returns An array of `StockIssueRecord` objects.
     */
    list: () => request<StockIssueRecord[]>('/inventory/issues'),

    /**
     * Create a new stock-issue record.
     *
     * **POST** `/inventory/issues`
     *
     * @param body - Stock-issue data without `id`.
     * @returns The created `StockIssueRecord`.
     */
    create: (body: Omit<StockIssueRecord, 'id'>) =>
      request<StockIssueRecord>('/inventory/issues', { method: 'POST', body: JSON.stringify(body) })
  }
};

// ---------- HR ------------------------------------------------------------------

/**
 * Human Resources API — manage employees, payroll, leave, and recruitment.
 *
 * Organised into four sub-objects (`employees`, `payroll`, `leave`, `recruitment`),
 * each mapping to their respective backend routes under `/api/hr/*`.
 */
export const hrApi = {
  /** Sub-API for employee onboarding and records. */
  employees: {
    /**
     * List all employee records.
     *
     * **GET** `/hr/employees`
     *
     * @returns An array of `EmployeeRecord` objects.
     */
    list: () => request<EmployeeRecord[]>('/hr/employees'),

    /**
     * Retrieve a single employee by ID.
     *
     * **GET** `/hr/employees/:id`
     *
     * @param id - The unique identifier of the employee.
     * @returns The `EmployeeRecord` for the given ID.
     */
    get: (id: string) => request<EmployeeRecord>(`/hr/employees/${id}`),

    /**
     * Onboard (create) a new employee.
     *
     * **POST** `/hr/employees`
     *
     * @param body - Full onboarding data including personal, employment, and salary fields.
     * @returns The newly created `EmployeeRecord`.
     */
    create: (body: EmployeeOnboardingInput) =>
      request<EmployeeRecord>('/hr/employees', { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Update an existing employee's record.
     *
     * **PUT** `/hr/employees/:id`
     *
     * @param id   - The unique identifier of the employee.
     * @param body - Partial fields to update.
     * @returns The updated `EmployeeRecord`.
     */
    update: (id: string, body: EmployeeUpdateInput) =>
      request<EmployeeRecord>(`/hr/employees/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    /**
     * Soft-delete an employee record.
     *
     * **DELETE** `/hr/employees/:id`
     *
     * The record is marked `isDeleted=true`; it is never physically removed.
     *
     * @param id - The unique identifier of the employee to delete.
     */
    remove: (id: string) => request<void>(`/hr/employees/${id}`, { method: 'DELETE' }),
  },

  /** Sub-API for payroll runs. */
  payroll: {
    /**
     * List all payroll records.
     *
     * **GET** `/hr/payrolls`
     *
     * @returns An array of `PayrollRecord` objects.
     */
    list: () => request<PayrollRecord[]>('/hr/payrolls'),

    /**
     * Retrieve a single payroll record by ID.
     *
     * **GET** `/hr/payrolls/:id`
     *
     * @param id - The unique identifier of the payroll run.
     * @returns The `PayrollRecord` for the given ID.
     */
    get: (id: string) => request<PayrollRecord>(`/hr/payrolls/${id}`),

    /**
     * Create a new payroll run.
     *
     * **POST** `/hr/payrolls`
     *
     * @param body - Payroll data including period, employee IDs, and amounts.
     * @returns The newly created `PayrollRecord`.
     */
    create: (body: PayrollCreateInput) =>
      request<PayrollRecord>('/hr/payrolls', { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Update an existing payroll run.
     *
     * **PUT** `/hr/payrolls/:id`
     *
     * @param id   - The unique identifier of the payroll run.
     * @param body - Partial fields to update.
     * @returns The updated `PayrollRecord`.
     */
    update: (id: string, body: Partial<PayrollCreateInput>) =>
      request<PayrollRecord>(`/hr/payrolls/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    /**
     * Approve a payroll run (transition from draft to approved).
     *
     * **PATCH** `/hr/payrolls/:id/approve`
     *
     * @param id - The unique identifier of the payroll run to approve.
     * @returns The updated `PayrollRecord` with `status='approved'`.
     */
    approve: (id: string) =>
      request<PayrollRecord>(`/hr/payrolls/${id}/approve`, { method: 'PATCH' }),

    /**
     * Mark a payroll run as paid.
     *
     * **PATCH** `/hr/payrolls/:id/pay`
     *
     * @param id - The unique identifier of the payroll run to mark as paid.
     * @returns The updated `PayrollRecord` with `status='paid'`.
     */
    pay: (id: string) =>
      request<PayrollRecord>(`/hr/payrolls/${id}/pay`, { method: 'PATCH' }),

    /**
     * Soft-delete a payroll run.
     *
     * **DELETE** `/hr/payrolls/:id`
     *
     * @param id - The unique identifier of the payroll run to delete.
     */
    remove: (id: string) => request<void>(`/hr/payrolls/${id}`, { method: 'DELETE' }),
  },

  /** Sub-API for employee leave requests. */
  leave: {
    /**
     * List all leave records.
     *
     * **GET** `/hr/leaves`
     *
     * @returns An array of `LeaveRecord` objects.
     */
    list: () => request<LeaveRecord[]>('/hr/leaves'),

    /**
     * Retrieve a single leave record by ID.
     *
     * **GET** `/hr/leaves/:id`
     *
     * @param id - The unique identifier of the leave record.
     * @returns The `LeaveRecord` for the given ID.
     */
    get: (id: string) => request<LeaveRecord>(`/hr/leaves/${id}`),

    /**
     * Create a new leave request.
     *
     * **POST** `/hr/leaves`
     *
     * @param body - Leave request data (employee, type, dates, reason).
     * @returns The newly created `LeaveRecord`.
     */
    create: (body: LeaveCreateInput) =>
      request<LeaveRecord>('/hr/leaves', { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Update an existing leave record.
     *
     * **PUT** `/hr/leaves/:id`
     *
     * @param id   - The unique identifier of the leave record.
     * @param body - Partial fields to update (dates, status, notes, etc.).
     * @returns The updated `LeaveRecord`.
     */
    update: (id: string, body: Partial<LeaveCreateInput & { status: string; notes: string }>) =>
      request<LeaveRecord>(`/hr/leaves/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    /**
     * Approve a pending leave request.
     *
     * **PATCH** `/hr/leaves/:id/approve`
     *
     * @param id - The unique identifier of the leave record to approve.
     * @returns The updated `LeaveRecord` with `status='approved'`.
     */
    approve: (id: string) =>
      request<LeaveRecord>(`/hr/leaves/${id}/approve`, { method: 'PATCH' }),

    /**
     * Reject a pending leave request.
     *
     * **PATCH** `/hr/leaves/:id/reject`
     *
     * @param id    - The unique identifier of the leave record to reject.
     * @param notes - Optional rejection reason shown to the employee.
     * @returns The updated `LeaveRecord` with `status='rejected'`.
     */
    reject: (id: string, notes?: string) =>
      request<LeaveRecord>(`/hr/leaves/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ notes })
      }),

    /**
     * Soft-delete a leave record.
     *
     * **DELETE** `/hr/leaves/:id`
     *
     * @param id - The unique identifier of the leave record to delete.
     */
    remove: (id: string) => request<void>(`/hr/leaves/${id}`, { method: 'DELETE' }),
  },

  /** Sub-API for recruitment postings and applicants. */
  recruitment: {
    /**
     * List all recruitment postings.
     *
     * **GET** `/hr/recruitments`
     *
     * @returns An array of `RecruitmentRecord` objects.
     */
    list: () => request<RecruitmentRecord[]>('/hr/recruitments'),

    /**
     * Retrieve a single recruitment posting by ID.
     *
     * **GET** `/hr/recruitments/:id`
     *
     * @param id - The unique identifier of the recruitment posting.
     * @returns The `RecruitmentRecord` for the given ID.
     */
    get: (id: string) => request<RecruitmentRecord>(`/hr/recruitments/${id}`),

    /**
     * Create a new recruitment posting (job vacancy).
     *
     * **POST** `/hr/recruitments`
     *
     * @param body - Posting data (title, department, description, requirements).
     * @returns The newly created `RecruitmentRecord`.
     */
    create: (body: RecruitmentCreateInput) =>
      request<RecruitmentRecord>('/hr/recruitments', { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Update an existing recruitment posting.
     *
     * **PUT** `/hr/recruitments/:id`
     *
     * @param id   - The unique identifier of the recruitment posting.
     * @param body - Partial fields to update (title, status, etc.).
     * @returns The updated `RecruitmentRecord`.
     */
    update: (id: string, body: Partial<RecruitmentCreateInput & { status: string }>) =>
      request<RecruitmentRecord>(`/hr/recruitments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    /**
     * Soft-delete a recruitment posting.
     *
     * **DELETE** `/hr/recruitments/:id`
     *
     * @param id - The unique identifier of the recruitment posting to delete.
     */
    remove: (id: string) => request<void>(`/hr/recruitments/${id}`, { method: 'DELETE' }),

    /**
     * Add an applicant to an existing recruitment posting.
     *
     * **POST** `/hr/recruitments/:recruitmentId/applicants`
     *
     * @param recruitmentId - The posting to attach the applicant to.
     * @param body          - Applicant data (name, email, resume, etc.).
     * @returns The created `RecruitmentApplicant` record.
     */
    addApplicant: (recruitmentId: string, body: ApplicantCreateInput) =>
      request<RecruitmentApplicant>(`/hr/recruitments/${recruitmentId}/applicants`, {
        method: 'POST',
        body: JSON.stringify(body)
      }),

    /**
     * Update an existing applicant's status or details.
     *
     * **PUT** `/hr/applicants/:id`
     *
     * @param id   - The unique identifier of the applicant.
     * @param body - Partial fields to update (status, notes, etc.).
     * @returns The updated `RecruitmentApplicant`.
     */
    updateApplicant: (id: string, body: Partial<RecruitmentApplicant & { status: string }>) =>
      request<RecruitmentApplicant>(`/hr/applicants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      }),
  },
};

// ---------- Administration ------------------------------------------------------

/**
 * Administration API — manage user accounts, permissions, push-payment
 * settings, audit logs, and system operations (backup, export).
 *
 * Organised into five sub-objects (`users`, `permissions`, `pushPayments`,
 * `audit`, `ops`), each mapping to `/api/admin/*` routes.
 */
export const adminApi = {
  /** Sub-API for user account management. */
  users: {
    /**
     * List all user accounts.
     *
     * **GET** `/admin/users`
     *
     * @returns An array of `UserAccount` objects.
     */
    list: () => request<UserAccount[]>('/admin/users'),

    /**
     * Create a new user account.
     *
     * **POST** `/admin/users`
     *
     * @param body - Account data: name, email, password, role, and optional title.
     * @returns The newly created `UserAccount`.
     */
    create: (body: { name: string; email: string; password: string; role: UserRole; title?: string }) =>
      request<UserAccount>('/admin/users', { method: 'POST', body: JSON.stringify(body) }),

    /**
     * Update an existing user account.
     *
     * **PUT** `/admin/users/:id`
     *
     * @param id   - The unique identifier of the user account.
     * @param body - Partial fields to update (name, email, role, password, etc.).
     * @returns The updated `UserAccount`.
     */
    update: (id: string, body: Partial<UserAccount> & { password?: string }) =>
      request<UserAccount>(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

    /**
     * Soft-delete a user account.
     *
     * **DELETE** `/admin/users/:id`
     *
     * The account is deactivated but retained for audit purposes.
     *
     * @param id - The unique identifier of the user to delete.
     */
    remove: (id: string) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),

    /**
     * Generate a one-time password-reset code for a user.
     *
     * **POST** `/admin/users/:id/reset-password`
     *
     * The backend emails the code to the user's registered address.
     *
     * @param id - The unique identifier of the user.
     * @returns The generated code and its expiry time in minutes.
     */
    resetPassword: (id: string) =>
      request<{ code: string; expiresInMinutes: number }>(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({})
      }),
  },

  /** Sub-API for per-user panel permissions. */
  permissions: {
    /**
     * Retrieve the panel permissions for a user.
     *
     * **GET** `/admin/users/:userId/permissions`
     *
     * @param userId - The unique identifier of the user.
     * @returns The `PanelPermissions` object controlling panel access.
     */
    get: (userId: string) => request<PanelPermissions>(`/admin/users/${userId}/permissions`),

    /**
     * Update (replace) the panel permissions for a user.
     *
     * **PUT** `/admin/users/:userId/permissions`
     *
     * @param userId - The unique identifier of the user.
     * @param body   - The full `PanelPermissions` object to set.
     * @returns The updated `PanelPermissions`.
     */
    update: (userId: string, body: PanelPermissions) =>
      request<PanelPermissions>(`/admin/users/${userId}/permissions`, {
        method: 'PUT',
        body: JSON.stringify(body)
      })
  },

  /** Sub-API for push-payment (card reader / online gateway) settings. */
  pushPayments: {
    /**
     * Retrieve the current push-payment settings.
     *
     * **GET** `/admin/push-payments`
     *
     * @returns The `PushPaymentSettings` object.
     */
    get: () => request<PushPaymentSettings>('/admin/push-payments'),

    /**
     * Update the push-payment settings.
     *
     * **PUT** `/admin/push-payments`
     *
     * @param body - The full `PushPaymentSettings` object to set.
     * @returns The updated `PushPaymentSettings`.
     */
    update: (body: PushPaymentSettings) =>
      request<PushPaymentSettings>('/admin/push-payments', {
        method: 'PUT',
        body: JSON.stringify(body)
      })
  },

  /** Sub-API for audit logs and trash/restore operations. */
  audit: {
    /**
     * List audit log entries with optional filters.
     *
     * **GET** `/admin/audit-logs?...`
     *
     * @param params - Optional filters: `entity`, `action`, `from`, `to`, `actor`.
     * @returns An array of `AuditLogEntry` objects.
     */
    list: (params?: { entity?: string; action?: string; from?: string; to?: string; actor?: string }) =>
      request<AuditLogEntry[]>(`/admin/audit-logs${buildQuery(params)}`),

    /**
     * Retrieve the current live state of an entity that was soft-deleted.
     *
     * **GET** `/admin/audit-logs/:id/current`
     *
     * Returns the entity's data as it exists right now (post-deletion),
     * or `null` if the record was physically purged.
     *
     * @param id - The audit log entry ID.
     * @returns An object with a `current` field containing the entity data or null.
     */
    current: (id: string) =>
      request<{ current: Record<string, unknown> | null }>(`/admin/audit-logs/${id}/current`),

    /**
     * Restore a single soft-deleted record.
     *
     * **POST** `/admin/audit-logs/:id/restore`
     *
     * The backend unsets `isDeleted` on the original record, effectively
     * undoing the soft-delete.
     *
     * @param id - The audit log entry ID of the record to restore.
     * @returns A confirmation message.
     */
    restore: (id: string) =>
      request<{ message: string }>(`/admin/audit-logs/${id}/restore`, {
        method: 'POST',
        body: JSON.stringify({})
      }),

    /**
     * Restore multiple soft-deleted records in a single request.
     *
     * **POST** `/admin/audit-logs/restore-bulk`
     *
     * @param ids - Array of audit log entry IDs to restore.
     * @returns An object with counts of successfully restored and failed records.
     */
    restoreBulk: (ids: string[]) =>
      request<{ restored: number; failed: number }>(`/admin/audit-logs/restore-bulk`, {
        method: 'POST',
        body: JSON.stringify({ ids })
      })
  },

  /** Sub-API for system-level operations (backup, export). */
  ops: {
    /**
     * Trigger a server-side database backup.
     *
     * **POST** `/admin/backup`
     *
     * The backend creates a `.sql` or `.sqlite` file and returns its
     * metadata (filename, size, timestamp).
     *
     * @returns Backup metadata: filename, size in bytes, and ISO timestamp.
     */
    backup: () =>
      request<{ file: string; sizeBytes: number; at: string }>('/admin/backup', {
        method: 'POST',
        body: JSON.stringify({})
      }),

    /**
     * Export the entire database as a structured JSON bundle.
     *
     * **GET** `/admin/export`
     *
     * @returns A complete `ExportBundle` containing all tables/rows.
     */
    exportData: () => request<ExportBundle>('/admin/export')
  }
};

// ---------- Reports -------------------------------------------------------------

/**
 * Reports API — retrieve pre-aggregated report data for the frontend views.
 *
 * Each endpoint returns an array of pre-computed rows; the backend
 * performs all grouping, summation, and filtering before sending the
 * response. Optional `QueryParams` allow date-range and category filters.
 */
export const reportsApi = {
  /**
   * Retrieve the Sacrament Report data.
   *
   * **GET** `/reports/sacraments?...`
   *
   * @param params - Optional filters (e.g. date range, sacrament type).
   * @returns An array of `SacramentReportRow` objects.
   */
  sacraments: (params?: QueryParams) =>
    request<SacramentReportRow[]>(`/reports/sacraments${buildQuery(params)}`),

  /**
   * Retrieve the Contribution Report data.
   *
   * **GET** `/reports/contributions?...`
   *
   * @param params - Optional filters (e.g. date range, category, ledger).
   * @returns An array of `ContributionReportRow` objects.
   */
  contributions: (params?: QueryParams) =>
    request<ContributionReportRow[]>(`/reports/contributions${buildQuery(params)}`),

  /**
   * Retrieve the Sales Report data.
   *
   * **GET** `/reports/sales?...`
   *
   * @param params - Optional filters (e.g. date range, product category).
   * @returns An array of `SalesReportRow` objects.
   */
  sales: (params?: QueryParams) => request<SalesReportRow[]>(`/reports/sales${buildQuery(params)}`),

  /**
   * Retrieve the Cashier Report data.
   *
   * **GET** `/reports/cashiers?...`
   *
   * @param params - Optional filters (e.g. date range, cashier ID).
   * @returns An array of `CashierReportRow` objects.
   */
  cashiers: (params?: QueryParams) =>
    request<CashierReportRow[]>(`/reports/cashiers${buildQuery(params)}`)
};

/**
 * Parish settings API — canonical endpoint is GET/PUT /api/parish.
 * Also exposes the legacy settingsApi alias for backward compat.
 */
export const parishApi = {
  /**
   * Retrieve the full parish settings singleton.
   *
   * **GET** `/parish`
   *
   * @returns The `ParishSettings` object (created on first call).
   */
  get: () => request<ParishSettings>('/parish'),

  /**
   * Update parish settings (full or partial).
   *
   * **PUT** `/parish`
   *
   * @param body - Partial settings to update.
   * @returns The updated `ParishSettings`.
   */
  update: (body: Partial<ParishSettings>) =>
    request<ParishSettings>('/parish', {
      method: 'PUT',
      body: JSON.stringify(body)
    })
};

/**
 * @deprecated Use parishApi instead. Backward-compatible alias.
 */
export const settingsApi = {
  get: () => request<SystemSettings>('/parish'),
  update: (body: Partial<SystemSettings>) =>
    request<SystemSettings>('/parish', {
      method: 'PUT',
      body: JSON.stringify(body)
    })
};

// ---------- Offline Queue Integration ------------------------------------------

import { enqueue, setCache, getCache, getCacheTimestamp } from '../lib/db';

/**
 * Check if the browser is currently online.
 * Returns true if the network is reachable, false otherwise.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Attempt a mutation request. If the network is unavailable or the request
 * fails due to a network error, queue the mutation for later sync instead
 * of showing an error to the user.
 *
 * @param entity    - The entity type being mutated (e.g. "christian", "deposit").
 * @param operation - The operation type ("create", "update", "delete").
 * @param endpoint  - The API endpoint path (e.g. "/christians").
 * @param method    - The HTTP method.
 * @param payload   - The request body.
 * @param optimisticUpdate - Optional local state updater to apply immediately.
 * @returns The created/updated record if online, or a queued placeholder if offline.
 */
export async function requestWithQueue<T>(
  entity: string,
  operation: 'create' | 'update' | 'delete',
  endpoint: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  payload: Record<string, unknown>,
  optimisticUpdate?: (item: T) => void
): Promise<T | { queued: true; id: string }> {
  // If we think we're online, try the real request
  if (isOnline()) {
    try {
      const result = await request<T>(endpoint, {
        method,
        body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
      });
      optimisticUpdate?.(result);
      return result;
    } catch (err) {
      // Network error (fetch failed) — queue for later
      if (err instanceof TypeError || (err instanceof Error && err.message.includes('fetch'))) {
        const id = await enqueue({ entity, operation, endpoint, method, payload });
        optimisticUpdate?.(payload as T);
        return { queued: true, id };
      }
      throw err; // Re-throw non-network errors (400, 401, etc.)
    }
  }

  // Offline — queue the mutation
  const id = await enqueue({ entity, operation, endpoint, method, payload });
  optimisticUpdate?.(payload as T);
  return { queued: true, id };
}

/**
 * Cache an API response for offline use.
 */
export async function cacheApiResponse(key: string, data: unknown): Promise<void> {
  await setCache(key, data);
}

/**
 * Get a cached API response. Returns null if not cached.
 */
export async function getCachedResponse<T = unknown>(key: string): Promise<T | null> {
  return getCache<T>(key);
}

/**
 * Get the last-updated timestamp for a cached response.
 */
export async function getCachedTimestamp(key: string): Promise<string | null> {
  return getCacheTimestamp(key);
}
