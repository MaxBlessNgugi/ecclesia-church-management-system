// =============================================================================
// HRView — the Human Resources panel
// -----------------------------------------------------------------------------
// Self-contained data view rendered inside the module shell. Owns its own data
// flow: on mount it fetches the full employee list via hrApi.employees.list()
// into local state. There is no loading/error UI — a fetch failure is logged to
// the console and the directory renders empty. New hires created through the
// onboarding form are prepended to the local list and auto-selected so the
// directory reflects them immediately.
//
// Sub-tabs (HRSubTab in src/types.ts): directory, onboarding, payroll, leave,
// recruitment. Only directory (read) and onboarding (create) are wired to the
// Express API; payroll, leave and recruitment are static/placeholder panels.
// selectedEmpId drives the directory row highlight and the leave panel lookup.
//
// NOTE: no delete flow exists here — "Deactivate Employee" is a stub alert.
// Real deletions elsewhere are soft deletes, restorable from Admin > Trash & Audit.
// =============================================================================
// React core imports: useState for local form/filter/tab state, useEffect for
// mount-time data fetching and sub-tab change listeners, useMemo for derived
// lists (distinctRoles, filteredEmployees) that recompute only when inputs
// change, and useCallback for stable data-loader references passed to useEffect.
import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Domain types used throughout the component: HRSubTab for tab routing,
// EmployeeRecord / PayrollRecord / LeaveRecord / RecruitmentRecord /
// RecruitmentApplicant for typed state arrays and API payloads.
import { HRSubTab, EmployeeRecord, PayrollRecord, LeaveRecord, RecruitmentRecord } from '../../types';
// hrApi — the typed HTTP client for all /api/hr/* endpoints (employees, payroll,
// leave, recruitment). Every data load and mutation flows through this module.
import { hrApi } from '../../services/api';
// usePermissions — hook returning the current user's role-based permission
// checks (canEdit, canDelete, etc.) used to disable buttons and guard actions.
import { usePermissions } from '../../permissions';
// exportCsv + ExportColumn — generic CSV exporter that accepts a column
// definition array and a rows array; used here to export the employee directory.
import { exportCsv, ExportColumn } from '../../utils/export';

// Roles treated as unpaid ministry/volunteer service for the stipend-vs-volunteer
// badge shown in the directory (everything else is stipend staff).
const VOLUNTEER_ROLES = ['Sacristan', 'Catechist', 'Volunteer', 'Volunteer (Unpaid)', 'Cantor'];

// Determines whether a given role string corresponds to an unpaid volunteer
// position. Case-insensitive substring match against the VOLUNTEER_ROLES list.
function isVolunteerRole(role: string): boolean {
  // Normalise the role to lowercase for case-insensitive comparison.
  const r = role.toLowerCase();
  // Return true if any volunteer role keyword appears inside the normalised string.
  return VOLUNTEER_ROLES.some((v) => r.includes(v.toLowerCase()));
}

// Export column mapping for the directory CSV — mirrors the table columns.
// Each ExportColumn has a human-readable label and a value accessor that
// extracts the field from an EmployeeRecord.
const EMPLOYEE_COLUMNS: ExportColumn<EmployeeRecord>[] = [
  // Employee code (e.g. EMP-2024-0001) — primary key displayed as monospaced ID.
  { label: 'Emp ID', value: (e) => e.code },
  // Full display name combining first, middle and surname.
  { label: 'Full Name', value: (e) => e.name },
  // Job title / role designation (e.g. Parish Priest, Secretary).
  { label: 'Position / Role', value: (e) => e.role },
  // Contact phone number as stored in the record.
  { label: 'Phone', value: (e) => e.phone },
  // Contact email address as stored in the record.
  { label: 'Email', value: (e) => e.email },
  // ISO date string of the employee's hire date.
  { label: 'Hire Date', value: (e) => e.hireDate }
];

/**
 * Human Resources panel: employee directory, onboarding, payroll, leave and
 * recruitment. Loads employees locally through hrApi and manages new hires;
 * payroll / leave / recruitment render as placeholder panels. The component
 * takes no props and manages its own loading, error and sub-tab state.
 */
// Functional component — no props; all state is internal. Renders one of five
// sub-panels determined by the activeSubTab state variable.
export const HRView: React.FC = () => {
  // Active sub-tab routing state — which of the five panels renders below.
  const [activeSubTab, setActiveSubTab] = useState<HRSubTab>('directory');

  // Permission object from the usePermissions hook. Provides canEdit('hr') and
  // canDelete('hr') checks that gate every write and delete action in the UI.
  const perms = usePermissions();

  // Employee directory state — the single source of truth for the directory
  // table, the payroll stat cards and the leave request lookup.
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  // Selected Employee for view/edit — set by clicking a directory row; also
  // used by the leave panel to show the selected employee's name.
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // New Employee Form State — one field per Personal / Appointment / Contact /
  // Next-of-Kin input in the onboarding form; reset after a successful save.
  // National ID / Passport number — optional government identifier for the hire.
  const [natId, setNatId] = useState('');
  // Surname (family name) — required identity field validated before save.
  const [surname, setSurname] = useState('');
  // First (given) name — required identity field validated before save.
  const [firstName, setFirstName] = useState('');
  // Middle name — optional; omitted from the API payload when left blank.
  const [middleName, setMiddleName] = useState('');
  // Job designation / role — dropdown value defaulting to 'Parish Priest'.
  const [designation, setDesignation] = useState('Parish Priest');
  // Date of hire — ISO date string; empty string means no date selected yet.
  const [hireDate, setHireDate] = useState('');
  // Contact email address — sent to the API as-is; no client-side validation
  // beyond the browser's built-in email input type.
  const [email, setEmail] = useState('');
  // Contact phone number — free-text field for any phone format.
  const [phone, setPhone] = useState('');
  // Next-of-kin full name — optional emergency contact field.
  const [nokName, setNokName] = useState('');
  // Next-of-kin relationship to the employee (e.g. "Spouse", "Parent").
  const [nokRel, setNokRel] = useState('');
  // Next-of-kin phone number — optional emergency contact phone.
  const [nokPhone, setNokPhone] = useState('');

  // Notifications — transient success banner, auto-dismissed after 4s.
  const [notification, setNotification] = useState<string | null>(null);

  // HR sub-tab data state
  // Payroll records loaded from /api/hr/payrolls when the payroll tab is active.
  const [payrolls, setPayrolls] = useState<PayrollRecord[]>([]);
  // Leave request records loaded from /api/hr/leaves when the leave tab is active.
  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
  // Recruitment position records loaded from /api/hr/recruitments when the
  // recruitment tab is active.
  const [recruitments, setRecruitments] = useState<RecruitmentRecord[]>([]);

  // Payroll form state
  // Employee ID selected for the new payroll entry; also controls visibility of
  // the inline payroll create form (non-empty = form shown).
  const [payEmployeeId, setPayEmployeeId] = useState('');
  // Pay period as YYYY-MM string; pre-populated to the current month when the
  // "New Payroll Entry" button is clicked.
  const [payPeriod, setPayPeriod] = useState('');
  // Basic salary amount — numeric string; required for save; parsed to Number.
  const [payBasic, setPayBasic] = useState('');
  // Allowances amount — optional numeric string; defaults to 0 if blank.
  const [payAllowances, setPayAllowances] = useState('');
  // Deductions amount — optional numeric string; defaults to 0 if blank.
  const [payDeductions, setPayDeductions] = useState('');
  // Free-text notes attached to the payroll entry (e.g. bonus reason).
  const [payNotes, setPayNotes] = useState('');

  // Leave form state
  // Employee ID selected for the new leave request; non-empty value shows the
  // inline leave create form.
  const [leaveEmployeeId, setLeaveEmployeeId] = useState('');
  // Leave type dropdown — defaults to 'Annual Leave'; options include Sick,
  // Compassionate, Pastoral Retreat, Study, Maternity, Other.
  const [leaveType, setLeaveType] = useState('Annual Leave');
  // Leave start date — ISO date string; required for save.
  const [leaveStart, setLeaveStart] = useState('');
  // Leave end date — ISO date string; required for save.
  const [leaveEnd, setLeaveEnd] = useState('');
  // Number of leave days — numeric string; required for save; parsed to Number.
  const [leaveDays, setLeaveDays] = useState('');
  // Free-text reason for the leave request; required for save.
  const [leaveReason, setLeaveReason] = useState('');

  // Recruitment form state
  // Position title for a new job posting; required for save.
  const [recPosition, setRecPosition] = useState('');
  // Department the position belongs to; required for save.
  const [recDepartment, setRecDepartment] = useState('');
  // Role description textarea value; required for save.
  const [recDescription, setRecDescription] = useState('');
  // Qualifications / requirements textarea value; optional.
  const [recRequirements, setRecRequirements] = useState('');
  // Application closing date — ISO date string; optional.
  const [recClosingDate, setRecClosingDate] = useState('');
  // Currently expanded recruitment card ID; controls which position's inline
  // applicant form is visible. Empty string = no form shown.
  const [selectedRecId, setSelectedRecId] = useState('');

  // Applicant form state
  // Applicant full name — required for save.
  const [appName, setAppName] = useState('');
  // Applicant email — required for save; used as the contact address.
  const [appEmail, setAppEmail] = useState('');
  // Applicant phone — optional; may be left blank.
  const [appPhone, setAppPhone] = useState('');
  // CV summary / notes — optional free-text field for the applicant.
  const [appCv, setAppCv] = useState('');

  // Directory filters: live text search across name/ID/role/contact plus a role
  // dropdown. Both are applied client-side over the loaded employee list.
  // Free-text search term; filters employees by any field matching this string.
  const [searchTerm, setSearchTerm] = useState('');
  // Role dropdown filter; when set, only employees with this exact role are shown.
  const [roleFilter, setRoleFilter] = useState('');

  // Displays a transient green success banner for 4 seconds, then auto-hides it
  // by setting the notification state back to null.
  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Data loaders for each HR sub-tab
  // Fetches the full payroll list from /api/hr/payrolls and stores it in local
  // state; errors are logged to the console (no user-facing error UI).
  const loadPayrolls = useCallback(() => {
    hrApi.payroll.list().then(setPayrolls).catch((e) => console.error('Failed to load payrolls', e));
  }, []);
  // Fetches the full leave request list from /api/hr/leaves and stores it.
  const loadLeaves = useCallback(() => {
    hrApi.leave.list().then(setLeaves).catch((e) => console.error('Failed to load leaves', e));
  }, []);
  // Fetches the full recruitment positions list from /api/hr/recruitments.
  const loadRecruitments = useCallback(() => {
    hrApi.recruitment.list().then(setRecruitments).catch((e) => console.error('Failed to load recruitments', e));
  }, []);

  // Load data when sub-tab changes
  // Side-effect that fires whenever activeSubTab changes. Fetches data for the
  // newly active tab so records are always fresh when the user switches panels.
  useEffect(() => {
    // Only load payrolls when the payroll tab becomes active.
    if (activeSubTab === 'payroll') loadPayrolls();
    // Only load leaves when the leave tab becomes active.
    if (activeSubTab === 'leave') loadLeaves();
    // Only load recruitments when the recruitment tab becomes active.
    if (activeSubTab === 'recruitment') loadRecruitments();
  }, [activeSubTab, loadPayrolls, loadLeaves, loadRecruitments]);

  // Distinct roles present in the directory — feeds the role filter dropdown.
  // Derived from the employees array; recomputes only when employees change.
  const distinctRoles = useMemo(
    () => Array.from(new Set(employees.map((e) => e.role))).sort(),
    [employees]
  );

  // Filtered directory rows: matches the search term (if any) AND the role
  // filter (if any); with both empty this is the full employee list.
  const filteredEmployees = useMemo(() => {
    // Trim and lowercase the search term for case-insensitive matching.
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((e) => {
      // If a role filter is active and this employee's role doesn't match, skip.
      if (roleFilter && e.role !== roleFilter) return false;
      // If no search term, include the employee (role filter already passed).
      if (!q) return true;
      // Check if the search term appears in any of the searchable fields.
      return [e.code, e.name, e.role, e.email, e.phone].some((f) =>
        f != null && f.toLowerCase().includes(q)
      );
    });
  }, [employees, searchTerm, roleFilter]);

  // Mount-time data load: fetch the employee list once. Auto-selects the first
  // row so selectedEmpId is never empty when the directory renders; an empty
  // result leaves selectedEmpId '' (the leave panel then shows a placeholder dash).
  useEffect(() => {
    // Call the employees list endpoint; on success populate local state.
    hrApi.employees
      .list()
      .then((rows) => {
        // Store the full employee list in state for the directory table.
        setEmployees(rows);
        // Pre-select the first employee so the row highlight and dependent
        // panels (payroll, leave) have a default selection.
        if (rows.length > 0) setSelectedEmpId(rows[0].id);
      })
      // On failure, log the error — the directory simply renders empty.
      .catch((error) => console.error('Failed to load employees', error));
  }, []);

  // Handles the onboarding form submission. Validates required fields, POSTs
  // the new employee to the API, prepends the result to the local list,
  // resets the form, and navigates back to the directory tab.
  const handleSavePersonnel = async (e: React.FormEvent) => {
    // Prevent the default browser form submission (page reload).
    e.preventDefault();
    // Guard: surname + first name are the mandatory identity fields.
    if (!surname || !firstName) {
      alert('Please enter surname and first name.');
      return;
    }
    try {
      // POST the new hire; optional next-of-kin / middle-name fields are dropped
      // from the payload (sent as undefined) when left blank to keep records clean.
      const created = await hrApi.employees.create({
        nationalId: natId,
        surname,
        firstName,
        middleName: middleName || undefined,
        designation,
        hireDate,
        email,
        phone,
        nextOfKinName: nokName || undefined,
        nextOfKinRelation: nokRel || undefined,
        nextOfKinPhone: nokPhone || undefined
      });
      // Prepend the new hire so the directory shows them first, then select them
      // so the row highlight lands on the fresh record.
      setEmployees([created, ...employees]);
      setSelectedEmpId(created.id);
      // Reset the form fields after a successful save; stale values would
      // otherwise leak into the next hire.
      setSurname('');
      setFirstName('');
      setMiddleName('');
      setEmail('');
      setPhone('');
      setNatId('');
      setHireDate('');
      // Show a success notification with the new employee's name and code.
      showNotif(`Personnel record for ${created.name} (${created.code}) saved successfully!`);
      // Jump back to the directory to show the result.
      setActiveSubTab('directory');
    } catch (error) {
      // Log the error and display the server message (or a generic fallback).
      console.error('Failed to save personnel', error);
      alert(error instanceof Error ? error.message : 'Failed to save personnel');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      {/* Header bar with title and the "+ New Employee" quick-action button; flexbox
          rows on mobile, side-by-side on md+ screens; bottom border separator. */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        {/* Left side: title and tagline describing the HR module's purpose. */}
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Human Resources</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Manage parish staff roles, onboarding, payroll stipends, and pastoral care schedules."
          </p>
        </div>

        {/* Right side: "+ New Employee" button that switches to the onboarding tab.
            Disabled when the user lacks HR edit permissions. */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSubTab('onboarding')}
            disabled={!perms.canEdit('hr')}
            title={perms.canEdit('hr') ? 'Add a new employee' : 'You do not have permission to add employees'}
            className={`px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded flex items-center gap-1.5 ${
              perms.canEdit('hr') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            {/* Material icon for "person add" action. */}
            <span className="material-symbols-outlined text-base">person_add</span>
            + New Employee
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation Links — one button per HRSubTab; the active tab gets
          an underline, inactive tabs are muted. Clicking just swaps activeSubTab. */}
      {/* Horizontal tab bar with uppercase labels; scrollable on narrow screens. */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase overflow-x-auto">
        {/* Render a tab button for each of the five HRSubTab values. */}
        {(['directory', 'onboarding', 'payroll', 'leave', 'recruitment'] as HRSubTab[]).map((tab) => {
          // Human-readable labels for each tab key.
          const labels: Record<HRSubTab, string> = {
            directory: 'EMPLOYEE MANAGEMENT',
            onboarding: 'ADD NEW EMPLOYEE',
            payroll: 'PAYROLL & BENEFITS',
            leave: 'LEAVE REQUESTS',
            recruitment: 'RECRUITMENT'
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`pb-2 transition-colors cursor-pointer whitespace-nowrap ${
                activeSubTab === tab
                  ? 'border-b-2 border-[#1e1e1e] text-[#1a1c1c]'
                  : 'text-[#444748] hover:text-[#1a1c1c]'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Success banner — appears after a successful save, auto-clears. */}
      {/* Conditionally rendered green notification bar with a checkmark icon. */}
      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. EMPLOYEE MANAGEMENT (DIRECTORY) — read-only table of the loaded
          employees with row selection and alert-stub row actions. */}
      {activeSubTab === 'directory' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Directory header row: title on the left, search + filter controls on the right;
                stacks vertically on small screens. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-3">
              {/* Left: section title and subtitle describing what this panel does. */}
              <div>
                <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Employee Directory</h3>
                <p className="text-xs text-[#444748]">Manage parish staff roles, records, and access permissions.</p>
              </div>

              {/* Right: search input and role filter dropdown side by side. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Search input wrapper — positioned relative so the search icon can be
                    absolutely placed inside it. */}
                <div className="relative">
                  {/* Search icon (magnifying glass) positioned inside the input field. */}
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
                    search
                  </span>
                  {/* Text input for live filtering of employees by name, ID, role, email or phone.
                      The searchTerm state is updated on every keystroke for instant filtering. */}
                  <input
                    type="text"
                    placeholder="Find by name, ID or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-56 focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* Role filter dropdown — populated with distinct roles from the employee list.
                    Empty value means "All Roles" (no filtering). */}
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs text-[#1a1c1c]"
                >
                  {/* Default option shows all employees regardless of role. */}
                  <option value="">All Roles</option>
                  {/* One option per distinct role found in the employee list. */}
                  {distinctRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {/* "Clear Filters" button — only visible when at least one filter is active.
                    Resets both searchTerm and roleFilter to empty strings. */}
                {(searchTerm || roleFilter) && (
                  <button
                    onClick={() => { setSearchTerm(''); setRoleFilter(''); }}
                    className="px-2.5 py-1.5 text-xs font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded-md cursor-pointer"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable table wrapper — allows horizontal scrolling on narrow screens
                while keeping the table within a rounded border. */}
            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              {/* Full-width table with collapsed borders and small text. */}
              <table className="w-full text-left border-collapse text-xs">
                {/* Table header row with grey background and uppercase column labels. */}
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    {/* Employee code column header. */}
                    <th className="p-3">EMP ID</th>
                    {/* Full name column header. */}
                    <th className="p-3">FULL NAME</th>
                    {/* Position / role column header. */}
                    <th className="p-3">POSITION / ROLE</th>
                    {/* Phone number column header. */}
                    <th className="p-3">PHONE NUMBER</th>
                    {/* Email address column header. */}
                    <th className="p-3">EMAIL ADDRESS</th>
                    {/* Actions column header — centred. */}
                    <th className="p-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                {/* Table body with vertical dividers between rows. */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Row click selects the employee (drives the row highlight and
                      the leave panel lookup); the dynamic class marks the selected
                      row. */}
                  {/* Empty state: shown when filteredEmployees is empty. Displays different
                      messages depending on whether the full list or filtered list is empty. */}
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[#444748]">
                        {employees.length === 0
                          ? 'No employee records yet. Onboard your first staff member.'
                          : 'No employees match the current search or role filter.'}
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((emp) => (
                                            <tr
                        key={emp.id}
                        onClick={() => setSelectedEmpId(emp.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedEmpId === emp.id ? 'bg-[#f4f3f3]' : 'hover:bg-[#f9f9f9]'
                        }`}
                      >
                        {/* Employee code — displayed in monospace font for alignment. */}
                        <td className="p-3 font-mono font-bold text-[#444748]">{emp.code}</td>
                        {/* Employee full name — bold for emphasis. */}
                        <td className="p-3 font-bold text-[#1a1c1c]">{emp.name}</td>
                        {/* Role cell — contains both the role badge and the stipend/volunteer badge
                            in a horizontal flex layout. */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            {/* Role badge — pill-shaped with border; shows the role text. */}
                            <span className="px-2.5 py-0.5 bg-[#ffffff] border border-[#e1e3e3] rounded-full text-[11px] font-medium text-[#1a1c1c]">
                              {emp.role}
                            </span>
                            {/* Stipend-vs-volunteer badge derived from the role. */}
                            {/* Conditional badge: amber for volunteer roles, emerald for stipend staff. */}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              isVolunteerRole(emp.role)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isVolunteerRole(emp.role) ? 'VOLUNTEER' : 'STIPEND'}
                            </span>
                          </div>
                        </td>
                        {/* Phone number — plain text. */}
                        <td className="p-3 text-[#444748]">{emp.phone}</td>
                        {/* Email address — plain text. */}
                        <td className="p-3 text-[#444748]">{emp.email}</td>
                        {/* Actions cell — centred "Payroll" link that navigates to the payroll
                            tab with this employee pre-selected. stopPropagation prevents the
                            row click handler from also firing. */}
                        <td className="p-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEmpId(emp.id);
                              setActiveSubTab('payroll');
                            }}
                            className="text-[#1e1e1e] hover:underline font-bold text-[11px]"
                          >
                            Payroll
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          {/* Bottom Action Bar */}
          {/* Footer row: count label on the left, action buttons on the right. */}
          <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-[#444748] pt-2 gap-3">
            {/* Employee count — shows filtered count vs total count with correct pluralisation. */}
            <span>
              Showing {filteredEmployees.length} of {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
            </span>

            {/* Action buttons row: export, deactivate, view/edit. */}
            <div className="flex gap-2">
              {/* Wired CSV export over the currently filtered rows; the other
                  actions remain alert stubs (no real deactivation wiring). */}
              {/* Export button — triggers a CSV download of the currently filtered
                  employee list using the EMPLOYEE_COLUMNS mapping. */}
              <button
                onClick={() => exportCsv('Employee_Directory', EMPLOYEE_COLUMNS, filteredEmployees)}
                className="px-3 py-1.5 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
              >
                Export Directory
              </button>
              {/* Deactivate button — confirms with the user, then calls the API to
                  soft-delete the selected employee, removes them from local state,
                  and shows a success notification. Requires HR delete permission. */}
              <button
                onClick={async () => {
                  // Guard: ensure an employee is selected before attempting deletion.
                  if (!selectedEmpId) { alert('Select an employee first.'); return; }
                  // Look up the employee by ID for the confirmation dialog.
                  const emp = employees.find((e) => e.id === selectedEmpId);
                  // Show a browser confirm dialog; cancellation aborts the action.
                  if (!confirm(`Deactivate ${emp?.name ?? 'this employee'}? They can be restored from Admin > Trash & Audit.`)) return;
                  try {
                    // Call the API to soft-delete the employee record.
                    await hrApi.employees.remove(selectedEmpId);
                    // Remove the deactivated employee from the local state array.
                    setEmployees((prev) => prev.filter((e) => e.id !== selectedEmpId));
                    // Clear the selection since the selected employee no longer exists.
                    setSelectedEmpId('');
                    showNotif('Employee deactivated successfully.');
                  } catch (err) {
                    // Display the server error message or a generic fallback.
                    alert(err instanceof Error ? err.message : 'Failed to deactivate employee');
                  }
                }}
                disabled={!perms.canDelete('hr') || !selectedEmpId}
                title={perms.canDelete('hr') ? 'Deactivate the selected employee' : 'You do not have permission to delete employee records'}
                className={`px-3 py-1.5 font-semibold text-[#ba1a1a] bg-[#ffffff] border border-[#ba1a1a] rounded hover:bg-[#fce8e8] ${
                  perms.canDelete('hr') && selectedEmpId ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                Deactivate Employee
              </button>
              {/* View/Edit Record — currently a stub that alerts the selected employee ID.
                  Future implementation will open a detail/edit modal or panel. */}
              <button
                onClick={() => alert(`Viewing full file for selected employee ID: ${selectedEmpId}`)}
                className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] rounded hover:bg-[#333333] cursor-pointer"
              >
                View / Edit Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. ADD NEW EMPLOYEE (ONBOARDING) — the only write-capable tab; posts to
          /hr/employees via handleSavePersonnel, then returns to the directory. */}
      {activeSubTab === 'onboarding' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6 max-w-4xl">
          {/* Form header: title and instructional subtitle. */}
          <div>
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">New Personnel Onboarding</h3>
            <p className="text-xs text-[#444748]">
              Register a new staff member or volunteer into the parish human resources system. Ensure all mandatory fields are completed for sacramental compliance and payroll integration.
            </p>
          </div>

          {/* Onboarding form — submits via handleSavePersonnel on Enter/click. */}
          <form onSubmit={handleSavePersonnel} className="space-y-6 text-xs">
            {/* Primary Identification */}
            {/* Section containing the auto-generated employee ID and the manually
                entered national ID plus full name fields. */}
            <div className="space-y-3">
              {/* Section heading with bottom border separator. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                PRIMARY IDENTIFICATION
              </h4>

              {/* Two-column grid for employee ID and national ID. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Auto-generated employee ID — disabled (read-only) input with a
                    hardcoded placeholder value. In production this would come from
                    the server. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Employee ID Number</label>
                  <input
                    type="text"
                    disabled
                    value="EMP-2024-0842"
                    className="w-full px-3 py-2 bg-[#eeeeee] border border-[#e1e3e3] rounded font-mono text-[#777777] cursor-not-allowed"
                  />
                </div>

                {/* National ID / Passport number — optional text input for
                    government identification. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">National ID / Passport Number</label>
                  <input
                    type="text"
                    placeholder="Enter National ID Number"
                    value={natId}
                    onChange={(e) => setNatId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Three-column grid for surname, first name, and middle name. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Surname — required field; validated before form submission. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Surname</label>
                  <input
                    type="text"
                    required
                    placeholder="Surname"
                    value={surname}
                    onChange={(e) => setSurname(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>

                {/* First Name — required field; validated before form submission. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    placeholder="First Name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>

                {/* Middle Name — optional; omitted from the API payload when blank. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Middle Name</label>
                  <input
                    type="text"
                    placeholder="Middle Name"
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>
              </div>
            </div>

            {/* Appointment Details */}
            {/* Section for the employee's job designation and hire date. */}
            <div className="space-y-3">
              {/* Section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                APPOINTMENT DETAILS
              </h4>

              {/* Two-column grid for designation dropdown and hire date picker. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Job Designation dropdown — hardcoded list of parish roles.
                    The selected value is sent as the "designation" field in the API payload. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Job Designation</label>
                  <select
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  >
                    <option value="Parish Priest">Parish Priest</option>
                    <option value="Assistant Priest">Assistant Priest</option>
                    <option value="Head Cashier">Head Cashier</option>
                    <option value="Inventory Clerk">Inventory Clerk</option>
                    <option value="Sacristan">Sacristan</option>
                    <option value="Catechist">Catechist</option>
                    <option value="Secretary">Secretary</option>
                    <option value="Volunteer (Unpaid)">Volunteer (Unpaid)</option>
                  </select>
                </div>

                {/* Date of Hire — HTML date picker; ISO date string stored in state. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Date of Hire</label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            {/* Section for the employee's email and phone number. */}
            <div className="space-y-3">
              {/* Section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                CONTACT INFORMATION
              </h4>

              {/* Two-column grid for email and phone inputs. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email address — uses browser email validation via type="email". */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="email@parish.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>

                {/* Phone number — free-text input accepting any phone format. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+1 (555) 000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                  />
                </div>
              </div>
            </div>

            {/* Emergency Contact */}
            {/* Grey-background card for next-of-kin details; all fields optional. */}
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-3">
              {/* Section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                EMERGENCY CONTACT (NEXT-OF-KIN)
              </h4>

              {/* Three-column grid for next-of-kin name, relationship, and phone. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Next-of-kin full name — optional text input. */}
                <input
                  type="text"
                  placeholder="Full Name"
                  value={nokName}
                  onChange={(e) => setNokName(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
                {/* Next-of-kin relationship — optional text input (e.g. "Spouse"). */}
                <input
                  type="text"
                  placeholder="Relationship"
                  value={nokRel}
                  onChange={(e) => setNokRel(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
                {/* Next-of-kin phone number — optional text input. */}
                <input
                  type="text"
                  placeholder="Emergency Phone"
                  value={nokPhone}
                  onChange={(e) => setNokPhone(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
              </div>
            </div>

            {/* Informational note about the portal invitation email sent after save. */}
            <div className="p-3 bg-[#e1e3e3] rounded text-[11px] text-[#444748] italic">
              "Once saved, an invitation email will be automatically sent to the provided address for portal activation."
            </div>

            {/* Document upload — attachment picker for onboarding paperwork. The
                file is held in local state only; upload wiring lands with the
                future document vault backend. */}
            {/* Document upload section — allows the user to attach a CV, ID or
                certificate file. Currently stores the selection in local state only;
                no actual upload occurs until a backend endpoint is implemented. */}
            <div className="space-y-3">
              {/* Section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                DOCUMENT UPLOADS
              </h4>
              {/* Upload area — grey card with a hidden file input triggered by a styled label. */}
              <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
                {/* Clickable label wrapping a hidden file input and a styled button. */}
                <label className="flex items-center gap-3 cursor-pointer">
                  {/* Hidden file input — only accepts PDF, JPG, PNG per the UI hint.
                      On change, shows a notification with the filename. */}
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) showNotif(`Attached ${f.name} to this personnel record.`);
                    }}
                  />
                  {/* Styled upload button — visually resembles a button but is a label. */}
                  <span className="px-3 py-2 text-xs font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer flex items-center gap-1.5">
                    {/* Upload file icon. */}
                    <span className="material-symbols-outlined text-base">upload_file</span>
                    Upload CV / ID / Certificate
                  </span>
                  {/* Helper text indicating accepted file types and size limit. */}
                  <span className="text-[10px] text-[#444748]">
                    PDF, JPG or PNG — max 5MB per file.
                  </span>
                </label>
              </div>
            </div>

            {/* Form action buttons: cancel (return to directory) and save (submit). */}
            <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
              {/* Cancel button — type="button" prevents form submission; switches
                  back to the directory tab without saving. */}
              <button
                type="button"
                onClick={() => setActiveSubTab('directory')}
                className="px-4 py-2 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
              >
                CANCEL
              </button>
              {/* Submit button — triggers handleSavePersonnel; disabled when the
                  user lacks HR edit permissions. */}
              <button
                type="submit"
                disabled={!perms.canEdit('hr')}
                className={`px-6 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                  perms.canEdit('hr') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                SAVE PERSONNEL RECORD
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. PAYROLL & BENEFITS — real data from /api/hr/payrolls */}
      {activeSubTab === 'payroll' && (
                <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Header row: title on the left, "+ New Payroll Entry" button on the right. */}
          <div className="flex items-center justify-between">
            {/* Left: section title and descriptive subtitle. */}
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Payroll & Benefits</h3>
              <p className="text-xs text-[#444748]">Manage monthly clergy stipends, housing allowances, and staff vouchers.</p>
            </div>
            {/* "+ New Payroll Entry" button — pre-fills form state and shows the inline form.
                Disabled when the user lacks HR edit permissions. */}
            <button
              onClick={() => {
                // Pre-select the currently selected employee (or first employee if none).
                setPayEmployeeId(selectedEmpId || (employees[0]?.id ?? ''));
                // Default the period to the current month (YYYY-MM format).
                setPayPeriod(new Date().toISOString().slice(0, 7));
                // Clear previous form values for a fresh entry.
                setPayBasic('');
                setPayAllowances('');
                setPayDeductions('');
                setPayNotes('');
              }}
              disabled={!perms.canEdit('hr')}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer"
            >
              + New Payroll Entry
            </button>
          </div>

          {/* Summary stat cards */}
          {/* Four-card grid showing total entries, draft, approved and paid counts. */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {/* Total payroll entries count. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Total Entries</span>
              <div className="text-lg font-serif font-bold text-[#1a1c1c] mt-1">{payrolls.length}</div>
            </div>
            {/* Draft entries count — styled in amber. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Draft</span>
              <div className="text-lg font-serif font-bold text-amber-700 mt-1">{payrolls.filter((p) => p.status === 'Draft').length}</div>
            </div>
            {/* Approved entries count — styled in blue. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Approved</span>
              <div className="text-lg font-serif font-bold text-blue-700 mt-1">{payrolls.filter((p) => p.status === 'Approved').length}</div>
            </div>
            {/* Paid entries count — styled in emerald. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Paid</span>
              <div className="text-lg font-serif font-bold text-emerald-700 mt-1">{payrolls.filter((p) => p.status === 'Paid').length}</div>
            </div>
          </div>

          {/* Payroll table */}
          {/* Scrollable table displaying all payroll records with actions. */}
          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              {/* Table header — grey row with uppercase column labels. */}
              <thead>
                <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                  <th className="p-3">EMPLOYEE</th>
                  <th className="p-3">PERIOD</th>
                  {/* Basic salary — right-aligned for numeric data. */}
                  <th className="p-3 text-right">BASIC</th>
                  {/* Allowances — right-aligned. */}
                  <th className="p-3 text-right">ALLOWANCES</th>
                  {/* Deductions — right-aligned. */}
                  <th className="p-3 text-right">DEDUCTIONS</th>
                  {/* Net pay — right-aligned and bold in the body. */}
                  <th className="p-3 text-right">NET PAY</th>
                  <th className="p-3">STATUS</th>
                  {/* Actions column — centred approve/pay buttons. */}
                  <th className="p-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e3e3]">
                {/* Empty state when no payroll records exist. */}
                {payrolls.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[#444748]">No payroll records yet. Create the first entry above.</td>
                  </tr>
                ) : (
                  payrolls.map((p) => (
                                        <tr key={p.id} className="hover:bg-[#f9f9f9]">
                      {/* Employee name — falls back to em-dash if not populated. */}
                      <td className="p-3 font-bold text-[#1a1c1c]">{p.employee?.name ?? '—'}</td>
                      {/* Pay period (YYYY-MM format). */}
                      <td className="p-3 text-[#444748]">{p.period}</td>
                      {/* Basic salary — formatted with locale-aware thousand separators. */}
                      <td className="p-3 text-right text-[#444748]">{p.basicSalary.toLocaleString()}</td>
                      {/* Allowances — formatted with locale-aware thousand separators. */}
                      <td className="p-3 text-right text-[#444748]">{p.allowances.toLocaleString()}</td>
                      {/* Deductions — formatted with locale-aware thousand separators. */}
                      <td className="p-3 text-right text-[#444748]">{p.deductions.toLocaleString()}</td>
                      {/* Net pay — bold for emphasis, formatted with thousand separators. */}
                      <td className="p-3 text-right font-bold text-[#1a1c1c]">{p.netPay.toLocaleString()}</td>
                      {/* Status badge — colour-coded pill: emerald=Paid, blue=Approved,
                          red=Cancelled, amber=Draft. */}
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                          p.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                          p.status === 'Cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>{p.status}</span>
                      </td>
                      {/* Action buttons — contextual based on status. */}
                      <td className="p-3 text-center space-x-1">
                        {/* "Approve" button — only shown for Draft entries; calls
                            hrApi.payroll.approve() then reloads the list. */}
                        {p.status === 'Draft' && (
                          <button onClick={async () => { await hrApi.payroll.approve(p.id); loadPayrolls(); showNotif('Payroll approved.'); }}
                            className="text-blue-700 hover:underline font-bold text-[11px]">Approve</button>
                        )}
                        {/* "Pay" button — only shown for Approved entries; calls
                            hrApi.payroll.pay() then reloads the list. */}
                        {p.status === 'Approved' && (
                          <button onClick={async () => { await hrApi.payroll.pay(p.id); loadPayrolls(); showNotif('Payroll marked as paid.'); }}
                            className="text-emerald-700 hover:underline font-bold text-[11px]">Pay</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Inline create form — shown when payEmployeeId is set (user clicked + New) */}
          {/* Payroll entry form — conditionally rendered inline below the table when
              the user clicks "+ New Payroll Entry". Hidden again after save or cancel. */}
          {payEmployeeId && (
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-3">
              {/* Form section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">NEW PAYROLL ENTRY</h4>
              {/* Three-column grid for the payroll entry fields. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Employee dropdown — lets the user choose which employee to create
                    a payroll entry for; pre-selected from the directory. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Employee</label>
                  <select value={payEmployeeId} onChange={(e) => setPayEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded">
                    {/* One option per employee in the directory, showing name and code. */}
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                  </select>
                </div>
                {/* Pay period — month picker (YYYY-MM); required for save. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Period (YYYY-MM)</label>
                  <input type="month" value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" />
                </div>
                {/* Basic salary — numeric input; required for save; min 0. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Basic Salary</label>
                  <input type="number" min="0" value={payBasic} onChange={(e) => setPayBasic(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="0" />
                </div>
                {/* Allowances — numeric input; optional, defaults to 0. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Allowances</label>
                  <input type="number" min="0" value={payAllowances} onChange={(e) => setPayAllowances(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="0" />
                </div>
                {/* Deductions — numeric input; optional, defaults to 0. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Deductions</label>
                  <input type="number" min="0" value={payDeductions} onChange={(e) => setPayDeductions(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="0" />
                </div>
                {/* Free-text notes — optional; attached to the payroll record. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Notes</label>
                  <input type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="Optional" />
                </div>
              </div>
              {/* Action buttons: cancel hides the form, save submits to the API. */}
              <div className="flex justify-end gap-2">
                {/* Cancel — hides the inline form by clearing payEmployeeId. */}
                <button onClick={() => setPayEmployeeId('')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer">Cancel</button>
                {/* Save — validates required fields, POSTs to the payroll API, clears
                    the form, reloads the list, and shows a success notification. */}
                <button onClick={async () => {
                  // Guard: period and basic salary are mandatory.
                  if (!payBasic || !payPeriod) { alert('Period and basic salary are required.'); return; }
                  try {
                    // POST the new payroll entry with parsed numeric values.
                    await hrApi.payroll.create({
                      employeeId: payEmployeeId,
                      period: payPeriod,
                      basicSalary: Number(payBasic),
                      // Allowances default to 0 if left blank.
                      allowances: Number(payAllowances) || 0,
                      // Deductions default to 0 if left blank.
                      deductions: Number(payDeductions) || 0,
                      // Notes are omitted (undefined) when blank.
                      notes: payNotes || undefined,
                    });
                    // Hide the inline form after successful save.
                    setPayEmployeeId('');
                    // Reload the full payroll list to include the new entry.
                    loadPayrolls();
                    showNotif('Payroll entry created.');
                  } catch (err) { alert(err instanceof Error ? err.message : 'Failed to create payroll entry'); }
                }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer">Save Entry</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. LEAVE REQUESTS — real data from /api/hr/leaves */}
      {activeSubTab === 'leave' && (
                <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Header row: title and subtitle on the left, "+ New Leave Request" button on the right. */}
          <div className="flex items-center justify-between">
            {/* Left: section title and descriptive subtitle. */}
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Leave & Sabbatical Requests</h3>
              <p className="text-xs text-[#444748]">Review pastoral retreat schedules and annual leave rosters.</p>
            </div>
            {/* "+ New Leave Request" button — pre-fills form with the selected employee
                and default leave type; disabled when the user lacks HR edit permissions. */}
            <button
              onClick={() => {
                // Pre-select the currently selected employee (or first employee).
                setLeaveEmployeeId(selectedEmpId || (employees[0]?.id ?? ''));
                // Reset to the default leave type.
                setLeaveType('Annual Leave');
                // Clear all date and text fields for a fresh entry.
                setLeaveStart('');
                setLeaveEnd('');
                setLeaveDays('');
                setLeaveReason('');
              }}
              disabled={!perms.canEdit('hr')}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer"
            >
              + New Leave Request
            </button>
          </div>

          {/* Summary stat cards */}
          {/* Four-card grid showing total, pending, approved and rejected leave counts. */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            {/* Total leave requests count. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Total Requests</span>
              <div className="text-lg font-serif font-bold text-[#1a1c1c] mt-1">{leaves.length}</div>
            </div>
            {/* Pending requests count — amber for attention. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Pending</span>
              <div className="text-lg font-serif font-bold text-amber-700 mt-1">{leaves.filter((l) => l.status === 'Pending').length}</div>
            </div>
            {/* Approved requests count — emerald for positive status. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Approved</span>
              <div className="text-lg font-serif font-bold text-emerald-700 mt-1">{leaves.filter((l) => l.status === 'Approved').length}</div>
            </div>
            {/* Rejected requests count — red for negative status. */}
            <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">Rejected</span>
              <div className="text-lg font-serif font-bold text-red-700 mt-1">{leaves.filter((l) => l.status === 'Rejected').length}</div>
            </div>
          </div>

          {/* Leave requests table */}
          {/* Scrollable table listing all leave requests with approve/reject actions. */}
          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              {/* Table header — grey row with uppercase column labels. */}
              <thead>
                <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                  <th className="p-3">EMPLOYEE</th>
                  <th className="p-3">TYPE</th>
                  <th className="p-3">START</th>
                  <th className="p-3">END</th>
                  {/* Days — centred for numeric data. */}
                  <th className="p-3 text-center">DAYS</th>
                  <th className="p-3">REASON</th>
                  <th className="p-3">STATUS</th>
                  {/* Actions — centred approve/reject buttons. */}
                  <th className="p-3 text-center">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e3e3]">
                {/* Empty state when no leave requests exist. */}
                {leaves.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-[#444748]">No leave requests yet. Create the first one above.</td>
                  </tr>
                ) : (
                  leaves.map((l) => (
                    <tr key={l.id} className="hover:bg-[#f9f9f9]">
                      {/* Employee name — falls back to em-dash. */}
                      <td className="p-3 font-bold text-[#1a1c1c]">{l.employee?.name ?? '—'}</td>
                      {/* Leave type (e.g. Annual Leave, Sick Leave). */}
                      <td className="p-3 text-[#444748]">{l.type}</td>
                      {/* Leave start date (ISO format). */}
                      <td className="p-3 text-[#444748]">{l.startDate}</td>
                      {/* Leave end date (ISO format). */}
                      <td className="p-3 text-[#444748]">{l.endDate}</td>
                      {/* Number of days — centred. */}
                      <td className="p-3 text-center text-[#444748]">{l.days}</td>
                      {/* Reason text — truncated to 200px to prevent layout breakage. */}
                      <td className="p-3 text-[#444748] max-w-[200px] truncate">{l.reason}</td>
                      {/* Status badge — colour-coded pill matching the status. */}
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          l.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                          l.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                          l.status === 'Cancelled' ? 'bg-gray-100 text-gray-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>{l.status}</span>
                      </td>
                      {/* Action buttons — only shown for Pending requests. */}
                      <td className="p-3 text-center space-x-1">
                        {l.status === 'Pending' && (
                          <>
                            {/* Approve button — calls hrApi.leave.approve() and reloads. */}
                            <button onClick={async () => { await hrApi.leave.approve(l.id); loadLeaves(); showNotif('Leave approved.'); }}
                              className="text-emerald-700 hover:underline font-bold text-[11px]">Approve</button>
                            {/* Reject button — prompts for an optional rejection reason,
                                then calls hrApi.leave.reject() with that note. */}
                            <button onClick={async () => {
                              const notes = prompt('Rejection reason (optional):');
                              await hrApi.leave.reject(l.id, notes ?? undefined); loadLeaves(); showNotif('Leave rejected.');
                            }}
                              className="text-red-700 hover:underline font-bold text-[11px]">Reject</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Inline create form */}
          {/* Leave request form — conditionally rendered inline when the user clicks
              "+ New Leave Request". Hidden after save or cancel. */}
          {leaveEmployeeId && (
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-3">
              {/* Form section heading. */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">NEW LEAVE REQUEST</h4>
              {/* Three-column grid for the leave request fields. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                {/* Employee dropdown — choose which employee the leave is for. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Employee</label>
                  <select value={leaveEmployeeId} onChange={(e) => setLeaveEmployeeId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded">
                    {/* One option per employee, showing name and code. */}
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.code})</option>)}
                  </select>
                </div>
                {/* Leave type dropdown — standard parish leave categories. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Leave Type</label>
                  <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded">
                    <option>Annual Leave</option>
                    <option>Sick Leave</option>
                    <option>Compassionate Leave</option>
                    <option>Pastoral Retreat</option>
                    <option>Study Leave</option>
                    <option>Maternity Leave</option>
                    <option>Other</option>
                  </select>
                </div>
                {/* Number of days — numeric input; required for save; min 1. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Number of Days</label>
                  <input type="number" min="1" value={leaveDays} onChange={(e) => setLeaveDays(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="e.g. 7" />
                </div>
                {/* Start date — HTML date picker; required for save. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Start Date</label>
                  <input type="date" value={leaveStart} onChange={(e) => setLeaveStart(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" />
                </div>
                {/* End date — HTML date picker; required for save. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">End Date</label>
                  <input type="date" value={leaveEnd} onChange={(e) => setLeaveEnd(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" />
                </div>
                {/* Reason — free-text input; required for save. */}
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Reason</label>
                  <input type="text" value={leaveReason} onChange={(e) => setLeaveReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="Brief reason" />
                </div>
              </div>
              {/* Action buttons: cancel hides the form, save submits to the API. */}
              <div className="flex justify-end gap-2">
                {/* Cancel — hides the inline form by clearing leaveEmployeeId. */}
                <button onClick={() => setLeaveEmployeeId('')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer">Cancel</button>
                {/* Save — validates all required fields, POSTs to the leave API,
                    clears the form, reloads the list, and shows a success notification. */}
                <button onClick={async () => {
                  // Guard: all fields are mandatory for a leave request.
                  if (!leaveStart || !leaveEnd || !leaveDays || !leaveReason) { alert('All fields are required.'); return; }
                  try {
                    // POST the new leave request with parsed numeric days.
                    await hrApi.leave.create({
                      employeeId: leaveEmployeeId,
                      type: leaveType,
                      startDate: leaveStart,
                      endDate: leaveEnd,
                      days: Number(leaveDays),
                      reason: leaveReason,
                    });
                    // Hide the inline form after successful save.
                    setLeaveEmployeeId('');
                    // Reload the full leave list to include the new request.
                    loadLeaves();
                    showNotif('Leave request submitted.');
                  } catch (err) { alert(err instanceof Error ? err.message : 'Failed to submit leave request'); }
                }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer">Submit Request</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. RECRUITMENT — real data from /api/hr/recruitments */}
      {activeSubTab === 'recruitment' && (
                <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Header row: title and subtitle on the left, "+ New Position" button on the right. */}
          <div className="flex items-center justify-between">
            {/* Left: section title and descriptive subtitle. */}
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish Recruitment & Volunteers</h3>
              <p className="text-xs text-[#444748]">Open positions, volunteer screening logs, and background check verifications.</p>
            </div>
            {/* "+ New Position" button — resets the recruitment form fields; does NOT
                show the inline form directly; the form is in a collapsible <details>
                element below. Disabled when the user lacks HR edit permissions. */}
            <button
              onClick={() => {
                // Clear all recruitment form fields for a fresh entry.
                setRecPosition('');
                setRecDepartment('');
                setRecDescription('');
                setRecRequirements('');
                setRecClosingDate('');
              }}
              disabled={!perms.canEdit('hr')}
              className="px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer"
            >
              + New Position
            </button>
          </div>

          {/* Positions list */}
          {/* Vertical stack of position cards; each card shows details, applicants,
              and an inline applicant form when expanded. */}
          <div className="space-y-3">
            {/* Empty state when no recruitment positions exist. */}
            {recruitments.length === 0 ? (
              <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs text-center text-[#444748]">
                No open positions yet. Create the first one above.
              </div>
            ) : (
              recruitments.map((rec) => (
                <div key={rec.id} className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-2">
                  {/* Top row: position info on the left, action buttons on the right. */}
                  <div className="flex justify-between items-start">
                    {/* Left: position title, department, status badge, description,
                        requirements, and posting dates. */}
                    <div className="space-y-1">
                      {/* Position title, department, and status badge in a row. */}
                      <div className="flex items-center gap-2">
                        {/* Position title — bold for emphasis. */}
                        <span className="font-bold text-[#1a1c1c]">{rec.position}</span>
                        {/* Department — separated by a bullet. */}
                        <span className="text-[#444748]">• {rec.department}</span>
                        {/* Status badge — colour-coded pill: emerald=Open, grey=Closed,
                            amber=On Hold, red=Canceled. */}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rec.status === 'Open' ? 'bg-emerald-100 text-emerald-800' :
                          rec.status === 'Closed' ? 'bg-gray-100 text-gray-800' :
                          rec.status === 'On Hold' ? 'bg-amber-100 text-amber-800' :
                          'bg-red-100 text-red-800'
                        }`}>{rec.status}</span>
                      </div>
                      {/* Role description text. */}
                      <p className="text-[#444748]">{rec.description}</p>
                      {/* Requirements — shown only when present; italicised. */}
                      {rec.requirements && <p className="text-[10px] text-[#444748] italic">Requirements: {rec.requirements}</p>}
                      {/* Posting date and optional closing date. */}
                      <p className="text-[10px] text-[#444748]">
                        Posted: {rec.datePosted}{rec.closingDate ? ` • Closes: ${rec.closingDate}` : ''}
                      </p>
                    </div>
                    {/* Right: action buttons — "Close" for open positions, "Add Applicant"
                        to toggle the inline applicant form. Buttons don't shrink. */}
                    <div className="flex gap-1 shrink-0">
                      {/* "Close" button — only shown for Open positions; calls
                          hrApi.recruitment.update() to change status to Closed. */}
                      {rec.status === 'Open' && (
                        <button onClick={async () => {
                          await hrApi.recruitment.update(rec.id, { status: 'Closed' });
                          loadRecruitments();
                          showNotif('Position closed.');
                        }} className="px-2 py-1 text-[10px] font-bold text-[#ba1a1a] bg-[#ffffff] border border-[#ba1a1a] rounded hover:bg-[#fce8e8] cursor-pointer">
                          Close
                        </button>
                      )}
                      {/* Toggle button — shows/hides the inline applicant form for
                          this position. Clears form fields when hiding. */}
                      <button onClick={async () => {
                        // Toggle the selectedRecId: if already selected, deselect;
                        // otherwise select this position and clear the form.
                        setSelectedRecId(selectedRecId === rec.id ? '' : rec.id);
                        if (selectedRecId !== rec.id) {
                          setAppName(''); setAppEmail(''); setAppPhone(''); setAppCv('');
                        }
                      }} className="px-2 py-1 text-[10px] font-bold text-[#1e1e1e] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer">
                        {selectedRecId === rec.id ? 'Hide' : 'Add Applicant'}
                      </button>
                    </div>
                  </div>

                  {/* Applicant list for this position */}
                  {/* Shown only when the position has at least one applicant. Displays a
                      count header and a stack of applicant rows. */}
                  {rec.applicants && rec.applicants.length > 0 && (
                    <div className="border-t border-[#e1e3e3] pt-2 mt-2">
                      {/* Applicant count label with correct pluralisation. */}
                      <span className="text-[10px] font-bold text-[#444748] uppercase">{rec.applicants.length} Applicant{rec.applicants.length !== 1 ? 's' : ''}</span>
                      {/* Stack of applicant rows — each shows name, email, phone, and status. */}
                      <div className="mt-1 space-y-1">
                        {rec.applicants.map((a) => (
                          <div key={a.id} className="flex items-center justify-between bg-[#ffffff] border border-[#e1e3e3] rounded px-3 py-1.5">
                            {/* Left: applicant name (bold), email, and optional phone. */}
                            <div>
                              <span className="font-bold text-[#1a1c1c]">{a.name}</span>
                              <span className="text-[#444748] ml-2">{a.email}</span>
                              {a.phone && <span className="text-[#444748] ml-2">{a.phone}</span>}
                            </div>
                            {/* Right: applicant status badge — colour-coded pill:
                                emerald=Accepted, red=Rejected, blue=Interviewed,
                                purple=Reviewed, amber=Pending. */}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              a.status === 'Accepted' ? 'bg-emerald-100 text-emerald-800' :
                              a.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                              a.status === 'Interviewed' ? 'bg-blue-100 text-blue-800' :
                              a.status === 'Reviewed' ? 'bg-purple-100 text-purple-800' :
                              'bg-amber-100 text-amber-800'
                            }`}>{a.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Applicant form — inline under this position */}
                  {/* Inline applicant creation form — shown only when this position
                      is the selectedRecId. Contains name, email, phone inputs and
                      a save button. */}
                  {selectedRecId === rec.id && (
                    <div className="border-t border-[#e1e3e3] pt-2 mt-2 space-y-2">
                      {/* Form section heading. */}
                      <span className="text-[10px] font-bold text-[#444748] uppercase">ADD APPLICANT</span>
                      {/* Four-column grid: name, email, phone, and save button. */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        {/* Applicant full name — required for save. */}
                        <input type="text" placeholder="Full Name" value={appName} onChange={(e) => setAppName(e.target.value)}
                          className="px-3 py-1.5 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]" />
                        {/* Applicant email — required for save. */}
                        <input type="email" placeholder="Email" value={appEmail} onChange={(e) => setAppEmail(e.target.value)}
                          className="px-3 py-1.5 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]" />
                        {/* Applicant phone — optional. */}
                        <input type="text" placeholder="Phone (optional)" value={appPhone} onChange={(e) => setAppPhone(e.target.value)}
                          className="px-3 py-1.5 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]" />
                        {/* Save button — validates name and email, POSTs to the recruitment
                            API's addApplicant endpoint, clears the form, reloads, and
                            shows a success notification. */}
                        <button onClick={async () => {
                          // Guard: name and email are mandatory for an applicant.
                          if (!appName || !appEmail) { alert('Name and email are required.'); return; }
                          try {
                            // POST the new applicant to the specific recruitment position.
                            await hrApi.recruitment.addApplicant(rec.id, {
                              name: appName, email: appEmail,
                              // Phone and CV summary are optional; omitted when blank.
                              phone: appPhone || undefined, cvSummary: appCv || undefined,
                            });
                            // Clear all applicant form fields after successful save.
                            setAppName(''); setAppEmail(''); setAppPhone(''); setAppCv('');
                            // Reload the recruitment list to reflect the new applicant.
                            loadRecruitments();
                            showNotif('Applicant added.');
                          } catch (err) { alert(err instanceof Error ? err.message : 'Failed to add applicant'); }
                        }}
                          className="px-3 py-1.5 text-[10px] font-bold text-white bg-[#1e1e1e] rounded hover:bg-[#333] cursor-pointer">
                          Save
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Inline create form for new positions */}
          {/* Collapsible form for creating a new recruitment position. Only visible
              to users with HR edit permissions. Hidden when an applicant form is
              open (selectedRecId is set) to avoid UI overlap. */}
          {perms.canEdit('hr') && recruitments.length >= 0 && !selectedRecId && (
            <details className="group">
              {/* Summary acts as the toggle; ▸ arrow indicates expandability. */}
              <summary className="cursor-pointer text-xs font-bold text-[#444748] hover:text-[#1a1c1c]">
                Create New Position ▸
              </summary>
              {/* Form content — revealed when the details element is open. */}
              <div className="mt-3 p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-3">
                {/* First row: position title, department, and closing date. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Position title — required for save. */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Position Title</label>
                    <input type="text" value={recPosition} onChange={(e) => setRecPosition(e.target.value)}
                      className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="e.g. Assistant Catechist" />
                  </div>
                  {/* Department — required for save. */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Department</label>
                    <input type="text" value={recDepartment} onChange={(e) => setRecDepartment(e.target.value)}
                      className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="e.g. Religious Education" />
                  </div>
                  {/* Closing date — optional; ISO date string. */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Closing Date</label>
                    <input type="date" value={recClosingDate} onChange={(e) => setRecClosingDate(e.target.value)}
                      className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" />
                  </div>
                </div>
                {/* Second row: description and requirements textareas. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Role description — required for save; multi-line textarea. */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Description</label>
                    <textarea value={recDescription} onChange={(e) => setRecDescription(e.target.value)} rows={2}
                      className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="Role description..." />
                  </div>
                  {/* Qualifications / requirements — optional; multi-line textarea. */}
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">Requirements</label>
                    <textarea value={recRequirements} onChange={(e) => setRecRequirements(e.target.value)} rows={2}
                      className="w-full px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded" placeholder="Qualifications, experience..." />
                  </div>
                </div>
                {/* Submit button — validates required fields, POSTs to the recruitment
                    API, clears the form, reloads the list, and shows a notification. */}
                <div className="flex justify-end">
                  <button onClick={async () => {
                    // Guard: position, department and description are mandatory.
                    if (!recPosition || !recDepartment || !recDescription) { alert('Position, department, and description are required.'); return; }
                    try {
                      // POST the new recruitment position with today's date as datePosted.
                      await hrApi.recruitment.create({
                        position: recPosition, department: recDepartment,
                        description: recDescription, requirements: recRequirements || undefined,
                        // Auto-set datePosted to today's ISO date (YYYY-MM-DD).
                        datePosted: new Date().toISOString().slice(0, 10),
                        // Closing date is optional; omitted when blank.
                        closingDate: recClosingDate || undefined,
                      });
                      // Clear all form fields after successful save.
                      setRecPosition(''); setRecDepartment(''); setRecDescription('');
                      setRecRequirements(''); setRecClosingDate('');
                      // Reload the full recruitment list to include the new position.
                      loadRecruitments();
                      showNotif('Position created.');
                    } catch (err) { alert(err instanceof Error ? err.message : 'Failed to create position'); }
                  }}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333] rounded cursor-pointer">
                    Publish Position
                  </button>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
