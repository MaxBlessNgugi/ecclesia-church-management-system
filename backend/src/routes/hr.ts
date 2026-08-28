// =============================================================================
// HR MODULE - Human Resources Route Definitions
// =============================================================================
//
// This file defines all HTTP endpoints for the HR (Human Resources) module of the
// church management system. It covers five sub-domains:
//
//   1. EMPLOYEES     – CRUD for church staff/employee records.
//   2. PAYROLL       – Payroll processing, approval, and payment tracking.
//   3. LEAVE         – Leave request submission, approval, and rejection.
//   4. RECRUITMENT   – Job posting management (open positions).
//   5. APPLICANTS    – Candidate tracking for each recruitment posting.
//
// SOFT-DELETE PATTERN:
//   Every DELETE endpoint uses the `softDelete` helper rather than physically
//   removing rows. The helper sets a `deletedAt` timestamp (and records the actor)
//   so the record is excluded from normal queries but can be restored or audited.
//
// AUTHENTICATION & AUTHORIZATION:
//   Two middleware layers are applied to every route in this file:
//     • requireAuth  – Ensures the request carries a valid session/JWT.
//     • requireModule('hr') – Ensures the authenticated user has the 'hr' module permission.
//
// VALIDATION:
//   Request bodies are validated with Zod schemas defined inline in each handler.
//   Malformed input automatically returns a 400-level error before any DB work.
//
// ERROR HANDLING:
//   Each handler wraps its logic in try/catch and forwards unexpected errors to
//   Express's `next(e)` so the global error middleware can log and format them.
//
// =============================================================================

// ---- Import: Express Router factory ---------------------------------------------------
// Provides the `Router` class used to group related route handlers together.
// All endpoints defined in this file are mounted on a single router instance
// that is later mounted at a prefix (e.g. '/api/hr') in the main app.
import { Router } from 'express';

// ---- Import: Zod schema & validation --------------------------------------------------
// Zod is a TypeScript-first schema validation library. It is used throughout this
// file to validate incoming request bodies before any database interaction.
// Using Zod ensures type safety and auto-generates meaningful error messages.
import { z } from 'zod';

// ---- Import: Prisma client singleton --------------------------------------------------
// `appPrisma` is the project-wide Prisma Client instance that provides typed
// access to all database tables (Employee, Payroll, Leave, etc.).
// Importing it here gives every route handler a reference to the ORM.
import { appPrisma } from '../lib/prisma.js';

// ---- Import: Authentication middleware -------------------------------------------------
// `requireAuth` is an Express middleware that rejects unauthenticated requests.
// It verifies the presence and validity of a session token (JWT or cookie) and
// populates `req.user` with the authenticated user's profile.
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

// ---- Import: Module-level permission middleware ----------------------------------------
// `requireModule` is a higher-order middleware that checks whether the
// authenticated user has permission to access the specified module ('hr').
// It returns 403 if the user lacks the required role/permission.
import { requireModule } from '../middleware/perms.js';

// ---- Import: Soft-delete & actor resolution helpers -----------------------------------
// `softDelete(tableName, id, actor)` marks a record as deleted without removing
// it from the database (sets `deletedAt` and logs the actor).
// `resolveActor(userId)` looks up the User record for the given ID and returns
// an actor object suitable for audit trail fields.
import { softDelete, resolveActor } from '../lib/audit.js';
import { emitChange } from '../lib/events.js';

// =============================================================================
// ROUTER INITIALIZATION
// =============================================================================

// Create a new Express Router instance that will hold all HR-related endpoints.
const router = Router();

// ---- Global middleware: authentication ------------------------------------------------
// Every request to any HR endpoint must be authenticated.
// Unauthenticated requests will receive a 401 response before reaching any handler.
router.use(requireAuth);

// ---- Global middleware: module-level authorization ------------------------------------
// Every request must also carry the 'hr' module permission.
// Users without this permission receive a 403 Forbidden response.
router.use(requireModule('hr'));

// =============================================================================
// EMPLOYEES
// =============================================================================
//
// The Employees sub-module manages church staff records. Each employee has a
// unique code (EMP-XXXX), a composite display name, role, contact info, and
// hire date. Next-of-kin details are accepted during creation but stored
// separately (not shown in the current Prisma schema mapping below).
//
// Endpoints:
//   GET    /employees       – List all employees
//   GET    /employees/:id   – Get a single employee by ID
//   POST   /employees       – Create a new employee
//   PUT    /employees/:id   – Update an existing employee
//   DELETE /employees/:id   – Soft-delete an employee
// =============================================================================

// ---- GET /employees -------------------------------------------------------------------
// Lists all active (non-soft-deleted) employees in ascending order of their
// employee code (EMP-0001, EMP-0002, …).
// Returns: JSON array of employee objects.
router.get('/employees', async (_req, res, next) => {
  try {
    // Query the Employee table for all records, sorted by code ascending.
    res.json(await appPrisma.employee.findMany({ orderBy: { code: 'asc' } }));
  } catch (e) { next(e); }
});

// ---- GET /employees/:id ---------------------------------------------------------------
// Retrieves a single employee record by its unique ID.
// Returns: JSON employee object, or 404 if not found.
router.get('/employees/:id', async (req, res, next) => {
  try {
    // Look up the employee by primary key (UUID).
    const emp = await appPrisma.employee.findUnique({ where: { id: req.params.id } });
    // If no employee matches the given ID, respond with 404.
    if (!emp) return next(new AppError('Employee not found', 404, 'NOT_FOUND'));
    res.json(emp);
  } catch (e) { next(e); }
});

// ---- POST /employees ------------------------------------------------------------------
// Creates a new employee record. The handler:
//   1. Validates the request body with Zod.
//   2. Builds a composite display name from first/middle/surname.
//   3. Generates a unique employee code (EMP-XXXX).
//   4. Inserts the record into the Employee table.
// Returns: 201 with the newly created employee object.
router.post('/employees', async (req, res, next) => {
  try {
    // Zod schema for employee creation:
    const data = z.object({
      // nationalId: National identity number (e.g. SSN, NIN). Optional.
      nationalId: z.string().optional(),
      // surname: Employee's last name / family name. Required.
      surname: z.string(),
      // firstName: Employee's given / first name. Required.
      firstName: z.string(),
      // middleName: Employee's middle name. Optional.
      middleName: z.string().optional(),
      // designation: Job title or role description (e.g. "Pastor", "Admin"). Required.
      designation: z.string(),
      // hireDate: Date the employee was hired (ISO string). Required.
      hireDate: z.string(),
      // email: Employee's email address. Must be valid email format. Required.
      email: z.string().email(),
      // phone: Employee's phone number. Required.
      phone: z.string(),
      // nextOfKinName: Name of the employee's next of kin. Optional.
      nextOfKinName: z.string().optional(),
      // nextOfKinRelation: Relationship to the next of kin (e.g. "Spouse"). Optional.
      nextOfKinRelation: z.string().optional(),
      // nextOfKinPhone: Phone number of the next of kin. Optional.
      nextOfKinPhone: z.string().optional(),
    }).parse(req.body);

    // Build a composite display name: "FirstName MiddleName Surname".
    // `.filter(Boolean)` removes any undefined/empty middle name parts.
    const name = [data.firstName, data.middleName, data.surname].filter(Boolean).join(' ');

    // Count existing employees to determine the next sequential code.
    const count = await appPrisma.employee.count();

    // Generate a zero-padded employee code: EMP-0001, EMP-0002, etc.
    const code = `EMP-${String(count + 1).padStart(4, '0')}`;

    // Insert the new employee into the database with the generated code and name.
    const created = await appPrisma.employee.create({
      data: {
        code,          // Unique employee identifier
        name,          // Composite display name
        role: data.designation,  // Job title stored as 'role' column
        phone: data.phone,       // Contact phone
        email: data.email,       // Contact email
        hireDate: data.hireDate, // Employment start date
      },
    });
    // Return 201 Created with the new employee record.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('employees', 'created', created);
  } catch (e) { next(e); }
});

// ---- PUT /employees/:id ---------------------------------------------------------------
// Updates an existing employee record. All fields are optional (partial update).
// Returns: JSON of the updated employee, or 404 if not found.
router.put('/employees/:id', async (req, res, next) => {
  try {
    // Zod schema for employee update (all fields optional for partial updates):
    const data = z.object({
      // name: Composite display name. Optional.
      name: z.string().optional(),
      // role: Job title / designation. Optional.
      role: z.string().optional(),
      // phone: Contact phone number. Optional.
      phone: z.string().optional(),
      // email: Contact email (must be valid if provided). Optional.
      email: z.string().email().optional(),
      // hireDate: Employment start date (ISO string). Optional.
      hireDate: z.string().optional(),
    }).parse(req.body);

    // Update the employee record by primary key with the provided fields.
    const updated = await appPrisma.employee.update({ where: { id: req.params.id }, data });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('employees', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- DELETE /employees/:id ------------------------------------------------------------
// Soft-deletes an employee by marking the record as deleted (sets `deletedAt`)
// and recording the actor who performed the deletion. The row is NOT physically
// removed, preserving audit trail integrity.
// Returns: 204 No Content on success.
router.delete('/employees/:id', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object for the audit trail.
    const actor = await resolveActor(req.user!.id);
    // Soft-delete the Employee record, logging the actor.
    await softDelete('Employee', req.params.id, actor);
    // 204 No Content – the deletion was successful, no body returned.
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('employees', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// =============================================================================
// PAYROLL
// =============================================================================
//
// The Payroll sub-module handles salary records for each employee per pay period.
// Each payroll record tracks basic salary, allowances, deductions, and a computed
// net pay. Records can transition through statuses: Draft → Approved → Paid
// (or Cancelled at any point).
//
// Endpoints:
//   GET    /payrolls              – List all payroll records (newest first)
//   GET    /payrolls/:id          – Get a single payroll record by ID
//   POST   /payrolls              – Create a new payroll record
//   PUT    /payrolls/:id          – Update an existing payroll record
//   DELETE /payrolls/:id          – Soft-delete a payroll record
//   PATCH  /payrolls/:id/approve  – Approve a draft payroll record
//   PATCH  /payrolls/:id/pay      – Mark an approved payroll record as paid
// =============================================================================

// ---- GET /payrolls --------------------------------------------------------------------
// Lists all payroll records ordered by creation date (newest first).
// Includes the related employee object via Prisma `include`.
// Filters out any records whose associated employee has been soft-deleted.
// Returns: JSON array of payroll objects with embedded employee data.
router.get('/payrolls', async (_req, res, next) => {
  try {
    // Fetch all payroll records, newest first, with the employee relation included.
    const rows = await appPrisma.payroll.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
    });
    // Filter out records where the linked employee no longer exists (was deleted).
    // This prevents orphaned payroll records from appearing in the UI.
    res.json(rows.filter((r: any) => r.employee != null));
  } catch (e) { next(e); }
});

// ---- GET /payrolls/:id ----------------------------------------------------------------
// Retrieves a single payroll record by ID, including its associated employee.
// Returns: JSON payroll object with employee data, or 404 if not found.
router.get('/payrolls/:id', async (req, res, next) => {
  try {
    // Look up the payroll record by primary key, including the employee relation.
    const row = await appPrisma.payroll.findUnique({
      where: { id: req.params.id },
      include: { employee: true },
    });
    // If no payroll record matches the given ID, respond with 404.
    if (!row) return next(new AppError('Payroll record not found', 404, 'NOT_FOUND'));
    res.json(row);
  } catch (e) { next(e); }
});

// ---- POST /payrolls -------------------------------------------------------------------
// Creates a new payroll record for a given employee and pay period.
// The handler validates input, computes net pay, and inserts the record.
// Returns: 201 with the newly created payroll object (including employee data).
router.post('/payrolls', async (req, res, next) => {
  try {
    // Zod schema for payroll creation:
    const data = z.object({
      // employeeId: Foreign key to the Employee table. Required.
      employeeId: z.string(),
      // period: Pay period identifier (e.g. "2025-01" for January 2025). Required.
      period: z.string(),
      // basicSalary: Base salary for the period. Must be ≥ 0. Required.
      basicSalary: z.number().min(0),
      // allowances: Additional pay (housing, transport, etc.). Must be ≥ 0. Defaults to 0.
      allowances: z.number().min(0).optional(),
      // deductions: Subtractions (tax, pension, loans, etc.). Must be ≥ 0. Defaults to 0.
      deductions: z.number().min(0).optional(),
      // notes: Free-text notes about this payroll record. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Compute net pay: basic salary + allowances − deductions.
    // `?? 0` provides a default of 0 when allowances/deductions are undefined.
    // Rounded to 2 decimal places to avoid floating point precision issues.
    const netPay = Math.round((data.basicSalary + (data.allowances ?? 0) - (data.deductions ?? 0)) * 100) / 100;

    // Insert the new payroll record into the database, including the employee relation.
    const created = await appPrisma.payroll.create({
      data: {
        employeeId: data.employeeId,      // Link to employee
        period: data.period,              // Pay period
        basicSalary: data.basicSalary,    // Base salary
        allowances: data.allowances ?? 0, // Default to 0 if not provided
        deductions: data.deductions ?? 0, // Default to 0 if not provided
        netPay,                           // Computed net pay
        notes: data.notes,                // Optional notes
      },
      include: { employee: true },
    });
    // Return 201 Created with the new payroll record and its employee.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('payrolls', 'created', created);
  } catch (e) { next(e); }
});

// ---- PUT /payrolls/:id ----------------------------------------------------------------
// Updates an existing payroll record. The handler:
//   1. Fetches the existing record to get current values for partial updates.
//   2. Validates the incoming data.
//   3. Recomputes net pay using the merged (new or existing) values.
//   4. Updates the database record.
// Returns: JSON of the updated payroll object with employee data.
router.put('/payrolls/:id', async (req, res, next) => {
  try {
    // Fetch the current payroll record to serve as defaults for optional fields.
    const existing = await appPrisma.payroll.findUnique({ where: { id: req.params.id } });
    // If the payroll record doesn't exist, respond with 404.
    if (!existing) return next(new AppError('Payroll record not found', 404, 'NOT_FOUND'));

    // Zod schema for payroll update (all fields optional for partial updates):
    const data = z.object({
      // period: Pay period identifier. Optional.
      period: z.string().optional(),
      // basicSalary: Base salary. Must be ≥ 0. Optional.
      basicSalary: z.number().min(0).optional(),
      // allowances: Additional pay. Must be ≥ 0. Optional.
      allowances: z.number().min(0).optional(),
      // deductions: Subtractions. Must be ≥ 0. Optional.
      deductions: z.number().min(0).optional(),
      // status: Payroll workflow status. Must be one of the enum values. Optional.
      status: z.enum(['Draft', 'Approved', 'Paid', 'Cancelled']).optional(),
      // notes: Free-text notes. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Merge new values with existing values for net pay calculation.
    // If a field is not provided in the update, use the existing value.
    const basic = data.basicSalary ?? existing.basicSalary;
    const allow = data.allowances ?? existing.allowances;
    const deduct = data.deductions ?? existing.deductions;

    // Recompute net pay from the merged values.
    const netPay = basic + allow - deduct;

    // Update the payroll record with the merged data and recomputed net pay.
    const updated = await appPrisma.payroll.update({
      where: { id: req.params.id },
      data: { ...data, netPay },   // Spread all fields + override netPay
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('payrolls', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- DELETE /payrolls/:id -------------------------------------------------------------
// Soft-deletes a payroll record (sets `deletedAt` and logs the actor).
// The record is NOT physically removed from the database.
// Returns: 204 No Content on success.
router.delete('/payrolls/:id', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object for the audit trail.
    const actor = await resolveActor(req.user!.id);
    // Soft-delete the Payroll record, logging the actor.
    await softDelete('Payroll', req.params.id, actor);
    // 204 No Content – deletion successful.
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('payrolls', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ---- PATCH /payrolls/:id/approve ------------------------------------------------------
// Transitions a payroll record from 'Draft' to 'Approved' status.
// This is a partial update (PATCH) that only changes the status field.
// Returns: JSON of the updated payroll record with employee data.
router.patch('/payrolls/:id/approve', async (req, res, next) => {
  try {
    // Update only the status field to 'Approved'.
    const updated = await appPrisma.payroll.update({
      where: { id: req.params.id },
      data: { status: 'Approved' },
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('payrolls', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- PATCH /payrolls/:id/pay ----------------------------------------------------------
// Transitions a payroll record from 'Approved' to 'Paid' status.
// This is a partial update (PATCH) that only changes the status field.
// Returns: JSON of the updated payroll record with employee data.
router.patch('/payrolls/:id/pay', async (req, res, next) => {
  try {
    // Update only the status field to 'Paid'.
    const updated = await appPrisma.payroll.update({
      where: { id: req.params.id },
      data: { status: 'Paid' },
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('payrolls', 'updated', updated);
  } catch (e) { next(e); }
});

// =============================================================================
// LEAVE
// =============================================================================
//
// The Leave sub-module manages employee leave requests (vacation, sick leave,
// personal leave, etc.). Each leave record tracks the employee, leave type,
// date range, number of days, reason, and workflow status.
//
// Workflow: Pending → Approved / Rejected (or Cancelled at any point).
//
// Endpoints:
//   GET    /leaves              – List all leave records (newest first)
//   GET    /leaves/:id          – Get a single leave record by ID
//   POST   /leaves              – Submit a new leave request
//   PUT    /leaves/:id          – Update an existing leave request
//   DELETE /leaves/:id          – Soft-delete a leave record
//   PATCH  /leaves/:id/approve  – Approve a pending leave request
//   PATCH  /leaves/:id/reject   – Reject a pending leave request
// =============================================================================

// ---- GET /leaves ----------------------------------------------------------------------
// Lists all leave records ordered by creation date (newest first).
// Includes the related employee object via Prisma `include`.
// Returns: JSON array of leave objects with embedded employee data.
router.get('/leaves', async (_req, res, next) => {
  try {
    // Fetch all leave records, newest first, with the employee relation included.
    const rows = await appPrisma.leave.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: true },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// ---- GET /leaves/:id ------------------------------------------------------------------
// Retrieves a single leave record by ID, including its associated employee.
// Returns: JSON leave object with employee data, or 404 if not found.
router.get('/leaves/:id', async (req, res, next) => {
  try {
    // Look up the leave record by primary key, including the employee relation.
    const row = await appPrisma.leave.findUnique({
      where: { id: req.params.id },
      include: { employee: true },
    });
    // If no leave record matches the given ID, respond with 404.
    if (!row) return next(new AppError('Leave record not found', 404, 'NOT_FOUND'));
    res.json(row);
  } catch (e) { next(e); }
});

// ---- POST /leaves ---------------------------------------------------------------------
// Submits a new leave request for an employee. The handler validates the input
// and inserts a new leave record with status 'Pending' by default.
// Returns: 201 with the newly created leave object (including employee data).
router.post('/leaves', async (req, res, next) => {
  try {
    // Zod schema for leave creation:
    const data = z.object({
      // employeeId: Foreign key to the Employee table. Required.
      employeeId: z.string(),
      // type: Type of leave (e.g. "Annual", "Sick", "Maternity"). Required.
      type: z.string(),
      // startDate: First day of leave (ISO date string). Required.
      startDate: z.string(),
      // endDate: Last day of leave (ISO date string). Required.
      endDate: z.string(),
      // days: Number of leave days requested. Must be an integer ≥ 1. Required.
      days: z.number().int().min(1),
      // reason: Explanation for the leave request. Required.
      reason: z.string(),
    }).parse(req.body);

    // Insert the new leave record into the database, including the employee relation.
    const created = await appPrisma.leave.create({
      data,                     // All validated fields
      include: { employee: true },
    });
    // Return 201 Created with the new leave record and its employee.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('leaves', 'created', created);
  } catch (e) { next(e); }
});

// ---- PUT /leaves/:id ------------------------------------------------------------------
// Updates an existing leave request. All fields are optional (partial update).
// Can also update the workflow status and approver information.
// Returns: JSON of the updated leave object with employee data.
router.put('/leaves/:id', async (req, res, next) => {
  try {
    // Zod schema for leave update (all fields optional for partial updates):
    const data = z.object({
      // type: Type of leave. Optional.
      type: z.string().optional(),
      // startDate: First day of leave. Optional.
      startDate: z.string().optional(),
      // endDate: Last day of leave. Optional.
      endDate: z.string().optional(),
      // days: Number of leave days. Must be integer ≥ 1. Optional.
      days: z.number().int().min(1).optional(),
      // reason: Explanation for the leave. Optional.
      reason: z.string().optional(),
      // status: Leave workflow status. Must be one of the enum values. Optional.
      status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled']).optional(),
      // approvedBy: Name or ID of the approver. Optional.
      approvedBy: z.string().optional(),
      // notes: Additional notes about the leave. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Update the leave record by primary key with the provided fields.
    const updated = await appPrisma.leave.update({
      where: { id: req.params.id },
      data,
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('leaves', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- DELETE /leaves/:id ---------------------------------------------------------------
// Soft-deletes a leave record (sets `deletedAt` and logs the actor).
// The record is NOT physically removed from the database.
// Returns: 204 No Content on success.
router.delete('/leaves/:id', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object for the audit trail.
    const actor = await resolveActor(req.user!.id);
    // Soft-delete the Leave record, logging the actor.
    await softDelete('Leave', req.params.id, actor);
    // 204 No Content – deletion successful.
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('leaves', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// ---- PATCH /leaves/:id/approve --------------------------------------------------------
// Approves a pending leave request. Sets the status to 'Approved' and records
// the approving actor's name in the `approvedBy` field.
// Returns: JSON of the updated leave record with employee data.
router.patch('/leaves/:id/approve', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object (to record the approver).
    const actor = await resolveActor(req.user!.id);

    // Update the leave status to 'Approved' and set the approver's name.
    // `actor.name` falls back to `actor.id` if the name is not set.
    const updated = await appPrisma.leave.update({
      where: { id: req.params.id },
      data: { status: 'Approved', approvedBy: actor.name ?? actor.id },
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('leaves', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- PATCH /leaves/:id/reject ---------------------------------------------------------
// Rejects a pending leave request. Sets the status to 'Rejected' and optionally
// stores rejection notes (e.g. reason for rejection).
// Returns: JSON of the updated leave record with employee data.
router.patch('/leaves/:id/reject', async (req, res, next) => {
  try {
    // Zod schema for rejection notes (optional):
    const data = z.object({
      // notes: Optional rejection reason or comments.
      notes: z.string().optional(),
    }).parse(req.body ?? {});   // Default to empty object if body is null/undefined

    // Update the leave status to 'Rejected' with optional notes.
    const updated = await appPrisma.leave.update({
      where: { id: req.params.id },
      data: { status: 'Rejected', notes: data.notes },
      include: { employee: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('leaves', 'updated', updated);
  } catch (e) { next(e); }
});

// =============================================================================
// RECRUITMENT
// =============================================================================
//
// The Recruitment sub-module manages job postings (open positions) within the
// church organization. Each recruitment record tracks the position title,
// department, description, requirements, posting dates, and status.
//
// Workflow: Open → Closed / On Hold / Cancelled.
//
// Endpoints:
//   GET    /recruitments       – List all recruitment records (newest first)
//   GET    /recruitments/:id   – Get a single recruitment record by ID
//   POST   /recruitments       – Create a new recruitment posting
//   PUT    /recruitments/:id   – Update an existing recruitment posting
//   DELETE /recruitments/:id   – Soft-delete a recruitment record
// =============================================================================

// ---- GET /recruitments ----------------------------------------------------------------
// Lists all recruitment records ordered by creation date (newest first).
// Includes the related applicants array via Prisma `include`.
// Returns: JSON array of recruitment objects with embedded applicant data.
router.get('/recruitments', async (_req, res, next) => {
  try {
    // Fetch all recruitment records, newest first, with the applicants relation included.
    const rows = await appPrisma.recruitment.findMany({
      orderBy: { createdAt: 'desc' },
      include: { applicants: true },
    });
    res.json(rows);
  } catch (e) { next(e); }
});

// ---- GET /recruitments/:id ------------------------------------------------------------
// Retrieves a single recruitment record by ID, including all its applicants.
// Returns: JSON recruitment object with applicants array, or 404 if not found.
router.get('/recruitments/:id', async (req, res, next) => {
  try {
    // Look up the recruitment record by primary key, including the applicants relation.
    const row = await appPrisma.recruitment.findUnique({
      where: { id: req.params.id },
      include: { applicants: true },
    });
    // If no recruitment record matches the given ID, respond with 404.
    if (!row) return next(new AppError('Recruitment record not found', 404, 'NOT_FOUND'));
    res.json(row);
  } catch (e) { next(e); }
});

// ---- POST /recruitments ---------------------------------------------------------------
// Creates a new job posting (recruitment record). The handler validates the
// input and inserts the record with default status 'Open'.
// Returns: 201 with the newly created recruitment object (including applicants array).
router.post('/recruitments', async (req, res, next) => {
  try {
    // Zod schema for recruitment creation:
    const data = z.object({
      // position: Job title for the open position (e.g. "Worship Leader"). Required.
      position: z.string(),
      // department: Department the position belongs to (e.g. "Music Ministry"). Required.
      department: z.string(),
      // description: Detailed job description and responsibilities. Required.
      description: z.string(),
      // requirements: Qualifications, skills, or experience needed. Optional.
      requirements: z.string().optional(),
      // datePosted: Date the posting was made public (ISO string). Required.
      datePosted: z.string(),
      // closingDate: Deadline for applications (ISO string). Optional.
      closingDate: z.string().optional(),
      // notes: Additional notes about the position. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Insert the new recruitment record into the database, including the applicants relation.
    const created = await appPrisma.recruitment.create({
      data,                     // All validated fields
      include: { applicants: true },
    });
    // Return 201 Created with the new recruitment record.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('recruitments', 'created', created);
  } catch (e) { next(e); }
});

// ---- PUT /recruitments/:id ------------------------------------------------------------
// Updates an existing recruitment posting. All fields are optional (partial update).
// Can also update the workflow status.
// Returns: JSON of the updated recruitment object with applicants array.
router.put('/recruitments/:id', async (req, res, next) => {
  try {
    // Zod schema for recruitment update (all fields optional for partial updates):
    const data = z.object({
      // position: Job title. Optional.
      position: z.string().optional(),
      // department: Department name. Optional.
      department: z.string().optional(),
      // description: Job description. Optional.
      description: z.string().optional(),
      // requirements: Qualifications. Optional.
      requirements: z.string().optional(),
      // status: Recruitment workflow status. Must be one of the enum values. Optional.
      status: z.enum(['Open', 'Closed', 'On Hold', 'Cancelled']).optional(),
      // closingDate: Application deadline. Optional.
      closingDate: z.string().optional(),
      // notes: Additional notes. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Update the recruitment record by primary key with the provided fields.
    const updated = await appPrisma.recruitment.update({
      where: { id: req.params.id },
      data,
      include: { applicants: true },
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('recruitments', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- DELETE /recruitments/:id ---------------------------------------------------------
// Soft-deletes a recruitment record (sets `deletedAt` and logs the actor).
// The record is NOT physically removed from the database.
// Returns: 204 No Content on success.
router.delete('/recruitments/:id', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object for the audit trail.
    const actor = await resolveActor(req.user!.id);
    // Soft-delete the Recruitment record, logging the actor.
    await softDelete('Recruitment', req.params.id, actor);
    // 204 No Content – deletion successful.
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('recruitments', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// =============================================================================
// RECRUITMENT APPLICANTS
// =============================================================================
//
// The Applicants sub-module tracks candidates who have applied to a specific
// recruitment posting. Each applicant record is linked to a Recruitment record
// via `recruitmentId`. Applicants go through a review pipeline:
//
//   Pending → Reviewed → Interviewed → Accepted / Rejected.
//
// Endpoints:
//   POST   /recruitments/:id/applicants  – Add an applicant to a recruitment posting
//   PUT    /applicants/:id               – Update an applicant's details/status
//   DELETE /applicants/:id               – Soft-delete an applicant record
// =============================================================================

// ---- POST /recruitments/:id/applicants -----------------------------------------------
// Adds a new applicant to an existing recruitment posting.
// The recruitment ID is taken from the URL parameter, and applicant details
// are validated from the request body.
// Returns: 201 with the newly created applicant object.
router.post('/recruitments/:id/applicants', async (req, res, next) => {
  try {
    // Zod schema for applicant creation:
    const data = z.object({
      // name: Full name of the applicant. Required.
      name: z.string(),
      // email: Applicant's email address. Must be valid email format. Required.
      email: z.string().email(),
      // phone: Applicant's phone number. Optional.
      phone: z.string().optional(),
      // cvSummary: Brief summary of the applicant's CV/resume. Optional.
      cvSummary: z.string().optional(),
      // notes: Additional notes about the applicant. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Insert the new applicant into the RecruitmentApplicant table,
    // linking them to the recruitment posting via `recruitmentId`.
    const created = await appPrisma.recruitmentApplicant.create({
      data: { ...data, recruitmentId: req.params.id },   // Spread applicant fields + link to recruitment
    });
    // Return 201 Created with the new applicant record.
    res.status(201).json(created);

    // Broadcast real-time event to all connected clients.
    emitChange('recruitment-applicants', 'created', created);
  } catch (e) { next(e); }
});

// ---- PUT /applicants/:id --------------------------------------------------------------
// Updates an existing applicant's details or workflow status.
// All fields are optional (partial update).
// Returns: JSON of the updated applicant object.
router.put('/applicants/:id', async (req, res, next) => {
  try {
    // Zod schema for applicant update (all fields optional for partial updates):
    const data = z.object({
      // name: Applicant's full name. Optional.
      name: z.string().optional(),
      // email: Applicant's email (must be valid if provided). Optional.
      email: z.string().email().optional(),
      // phone: Applicant's phone number. Optional.
      phone: z.string().optional(),
      // cvSummary: CV/resume summary. Optional.
      cvSummary: z.string().optional(),
      // status: Applicant review status. Must be one of the enum values. Optional.
      status: z.enum(['Pending', 'Reviewed', 'Interviewed', 'Accepted', 'Rejected']).optional(),
      // notes: Additional notes about the applicant. Optional.
      notes: z.string().optional(),
    }).parse(req.body);

    // Update the applicant record by primary key with the provided fields.
    const updated = await appPrisma.recruitmentApplicant.update({
      where: { id: req.params.id },
      data,
    });
    res.json(updated);

    // Broadcast real-time event to all connected clients.
    emitChange('recruitment-applicants', 'updated', updated);
  } catch (e) { next(e); }
});

// ---- DELETE /applicants/:id -----------------------------------------------------------
// Soft-deletes an applicant record (sets `deletedAt` and logs the actor).
// The record is NOT physically removed from the database.
// Returns: 204 No Content on success.
router.delete('/applicants/:id', async (req: any, res, next) => {
  try {
    // Resolve the authenticated user into an actor object for the audit trail.
    const actor = await resolveActor(req.user!.id);
    // Soft-delete the RecruitmentApplicant record, logging the actor.
    await softDelete('RecruitmentApplicant', req.params.id, actor);
    // 204 No Content – deletion successful.
    res.status(204).send();

    // Broadcast real-time event to all connected clients.
    emitChange('recruitment-applicants', 'deleted', { id: req.params.id });
  } catch (e) { next(e); }
});

// =============================================================================
// EXPORT
// =============================================================================

// Export the configured router so it can be mounted in the main Express app.
export default router;
