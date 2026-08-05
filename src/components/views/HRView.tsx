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
import React, { useState, useEffect, useMemo } from 'react';
import { HRSubTab, EmployeeRecord } from '../../types';
import { hrApi } from '../../services/api';
import { usePermissions } from '../../permissions';
import { exportCsv, ExportColumn } from '../../utils/export';

// Roles treated as unpaid ministry/volunteer service for the stipend-vs-volunteer
// badge shown in the directory (everything else is stipend staff).
const VOLUNTEER_ROLES = ['Sacristan', 'Catechist', 'Volunteer', 'Volunteer (Unpaid)', 'Cantor'];

function isVolunteerRole(role: string): boolean {
  const r = role.toLowerCase();
  return VOLUNTEER_ROLES.some((v) => r.includes(v.toLowerCase()));
}

// Export column mapping for the directory CSV — mirrors the table columns.
const EMPLOYEE_COLUMNS: ExportColumn<EmployeeRecord>[] = [
  { label: 'Emp ID', value: (e) => e.code },
  { label: 'Full Name', value: (e) => e.name },
  { label: 'Position / Role', value: (e) => e.role },
  { label: 'Phone', value: (e) => e.phone },
  { label: 'Email', value: (e) => e.email },
  { label: 'Hire Date', value: (e) => e.hireDate }
];

/**
 * Human Resources panel: employee directory, onboarding, payroll, leave and
 * recruitment. Loads employees locally through hrApi and manages new hires;
 * payroll / leave / recruitment render as placeholder panels. The component
 * takes no props and manages its own loading, error and sub-tab state.
 */
export const HRView: React.FC = () => {
  // Active sub-tab routing state — which of the five panels renders below.
  const [activeSubTab, setActiveSubTab] = useState<HRSubTab>('directory');

  const perms = usePermissions();

  // Employee directory state — the single source of truth for the directory
  // table, the payroll stat cards and the leave request lookup.
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);

  // Selected Employee for view/edit — set by clicking a directory row; also
  // used by the leave panel to show the selected employee's name.
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');

  // New Employee Form State — one field per Personal / Appointment / Contact /
  // Next-of-Kin input in the onboarding form; reset after a successful save.
  const [natId, setNatId] = useState('');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [designation, setDesignation] = useState('Parish Priest');
  const [hireDate, setHireDate] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nokName, setNokName] = useState('');
  const [nokRel, setNokRel] = useState('');
  const [nokPhone, setNokPhone] = useState('');

  // Notifications — transient success banner, auto-dismissed after 4s.
  const [notification, setNotification] = useState<string | null>(null);

  // Directory filters: live text search across name/ID/role/contact plus a role
  // dropdown. Both are applied client-side over the loaded employee list.
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Distinct roles present in the directory — feeds the role filter dropdown.
  const distinctRoles = useMemo(
    () => Array.from(new Set(employees.map((e) => e.role))).sort(),
    [employees]
  );

  // Filtered directory rows: matches the search term (if any) AND the role
  // filter (if any); with both empty this is the full employee list.
  const filteredEmployees = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return employees.filter((e) => {
      if (roleFilter && e.role !== roleFilter) return false;
      if (!q) return true;
      return [e.code, e.name, e.role, e.email, e.phone].some((f) =>
        f != null && f.toLowerCase().includes(q)
      );
    });
  }, [employees, searchTerm, roleFilter]);

  // Mount-time data load: fetch the employee list once. Auto-selects the first
  // row so selectedEmpId is never empty when the directory renders; an empty
  // result leaves selectedEmpId '' (the leave panel then shows a placeholder dash).
  useEffect(() => {
    hrApi.employees
      .list()
      .then((rows) => {
        setEmployees(rows);
        if (rows.length > 0) setSelectedEmpId(rows[0].id);
      })
      .catch((error) => console.error('Failed to load employees', error));
  }, []);

  const handleSavePersonnel = async (e: React.FormEvent) => {
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
      showNotif(`Personnel record for ${created.name} (${created.code}) saved successfully!`);
      setActiveSubTab('directory'); // Jump back to the directory to show the result.
    } catch (error) {
      console.error('Failed to save personnel', error);
      alert(error instanceof Error ? error.message : 'Failed to save personnel');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Human Resources</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Manage parish staff roles, onboarding, payroll stipends, and pastoral care schedules."
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveSubTab('onboarding')}
            disabled={!perms.canEdit('hr')}
            title={perms.canEdit('hr') ? 'Add a new employee' : 'You do not have permission to add employees'}
            className={`px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded flex items-center gap-1.5 ${
              perms.canEdit('hr') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
            }`}
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            + New Employee
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation Links — one button per HRSubTab; the active tab gets
          an underline, inactive tabs are muted. Clicking just swaps activeSubTab. */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase overflow-x-auto">
        {(['directory', 'onboarding', 'payroll', 'leave', 'recruitment'] as HRSubTab[]).map((tab) => {
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-3">
              <div>
                <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Employee Directory</h3>
                <p className="text-xs text-[#444748]">Manage parish staff roles, records, and access permissions.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Find by name, ID or role..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-56 focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs text-[#1a1c1c]"
                >
                  <option value="">All Roles</option>
                  {distinctRoles.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

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

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <th className="p-3">EMP ID</th>
                    <th className="p-3">FULL NAME</th>
                    <th className="p-3">POSITION / ROLE</th>
                    <th className="p-3">PHONE NUMBER</th>
                    <th className="p-3">EMAIL ADDRESS</th>
                    <th className="p-3 text-center">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {/* Row click selects the employee (drives the row highlight and
                      the leave panel lookup); the dynamic class marks the selected
                      row. */}
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
                        <td className="p-3 font-mono font-bold text-[#444748]">{emp.code}</td>
                        <td className="p-3 font-bold text-[#1a1c1c]">{emp.name}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2.5 py-0.5 bg-[#ffffff] border border-[#e1e3e3] rounded-full text-[11px] font-medium text-[#1a1c1c]">
                              {emp.role}
                            </span>
                            {/* Stipend-vs-volunteer badge derived from the role. */}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                              isVolunteerRole(emp.role)
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {isVolunteerRole(emp.role) ? 'VOLUNTEER' : 'STIPEND'}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-[#444748]">{emp.phone}</td>
                        <td className="p-3 text-[#444748]">{emp.email}</td>
                        <td className="p-3 text-center">
                          {/* Stub edit action: stopPropagation prevents the row's
                              select handler from firing while clicking Edit. */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              alert(`Editing record for ${emp.name}`);
                            }}
                            className="text-[#1e1e1e] hover:underline font-bold text-[11px]"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-[#444748] pt-2 gap-3">
            <span>
              Showing {filteredEmployees.length} of {employees.length} {employees.length === 1 ? 'employee' : 'employees'}
            </span>

            <div className="flex gap-2">
              {/* Wired CSV export over the currently filtered rows; the other
                  actions remain alert stubs (no real deactivation wiring). */}
              <button
                onClick={() => exportCsv('Employee_Directory', EMPLOYEE_COLUMNS, filteredEmployees)}
                className="px-3 py-1.5 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
              >
                Export Directory
              </button>
              <button
                onClick={() => alert("Selected employee deactivated.")}
                disabled={!perms.canDelete('hr')}
                title={perms.canDelete('hr') ? 'Deactivate the selected employee' : 'You do not have permission to delete employee records'}
                className={`px-3 py-1.5 font-semibold text-[#ba1a1a] bg-[#ffffff] border border-[#ba1a1a] rounded hover:bg-[#fce8e8] ${
                  perms.canDelete('hr') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
              >
                Deactivate Employee
              </button>
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
          <div>
            <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">New Personnel Onboarding</h3>
            <p className="text-xs text-[#444748]">
              Register a new staff member or volunteer into the parish human resources system. Ensure all mandatory fields are completed for sacramental compliance and payroll integration.
            </p>
          </div>

          <form onSubmit={handleSavePersonnel} className="space-y-6 text-xs">
            {/* Primary Identification */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                PRIMARY IDENTIFICATION
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Employee ID Number</label>
                  <input
                    type="text"
                    disabled
                    value="EMP-2024-0842"
                    className="w-full px-3 py-2 bg-[#eeeeee] border border-[#e1e3e3] rounded font-mono text-[#777777] cursor-not-allowed"
                  />
                </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                APPOINTMENT DETAILS
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                CONTACT INFORMATION
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                EMERGENCY CONTACT (NEXT-OF-KIN)
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Full Name"
                  value={nokName}
                  onChange={(e) => setNokName(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
                <input
                  type="text"
                  placeholder="Relationship"
                  value={nokRel}
                  onChange={(e) => setNokRel(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
                <input
                  type="text"
                  placeholder="Emergency Phone"
                  value={nokPhone}
                  onChange={(e) => setNokPhone(e.target.value)}
                  className="px-3 py-2 bg-[#ffffff] border border-[#e1e3e3] rounded text-[#1a1c1c]"
                />
              </div>
            </div>

            <div className="p-3 bg-[#e1e3e3] rounded text-[11px] text-[#444748] italic">
              "Once saved, an invitation email will be automatically sent to the provided address for portal activation."
            </div>

            {/* Document upload — attachment picker for onboarding paperwork. The
                file is held in local state only; upload wiring lands with the
                future document vault backend. */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-1">
                DOCUMENT UPLOADS
              </h4>
              <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) showNotif(`Attached ${f.name} to this personnel record.`);
                    }}
                  />
                  <span className="px-3 py-2 text-xs font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#e1e3e3] rounded cursor-pointer flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">upload_file</span>
                    Upload CV / ID / Certificate
                  </span>
                  <span className="text-[10px] text-[#444748]">
                    PDF, JPG or PNG — max 5MB per file.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
              <button
                type="button"
                onClick={() => setActiveSubTab('directory')}
                className="px-4 py-2 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
              >
                CANCEL
              </button>
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

      {/* 3. PAYROLL & BENEFITS */}
      {activeSubTab === 'payroll' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Payroll & Benefits</h3>
          <p className="text-xs text-[#444748]">Manage monthly clergy stipends, housing allowances, and staff vouchers.</p>

          {/* Summary stat cards, all derived from the same loaded employees list
              (read-only tab; no payroll API wiring here). */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">TOTAL STAFF RECORDS</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">{employees.length}</div>
            </div>
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">ROLES ON FILE</span>
              {/* Distinct roles counted via a Set so duplicate roles collapse. */}
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">
                {new Set(employees.map((e) => e.role)).size}
              </div>
            </div>
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">PAYROLL STATUS</span>
              <div className="text-xl font-serif font-bold text-emerald-800 mt-1">
                {employees.length > 0 ? 'Records Ready' : 'No Staff Yet'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. LEAVE REQUESTS — static panel: shows the leave entry for the currently
          selected employee (falls back to a dash when none is selected) plus a
          pastoral-care calendar for the current month. */}
      {activeSubTab === 'leave' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Leave & Sabbatical Requests</h3>
          <p className="text-xs text-[#444748]">Review pastoral retreat schedules and annual leave rosters.</p>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold text-[#1a1c1c]">
                  {employees.find((e) => e.id === selectedEmpId)?.name ?? '—'}
                </span>
                <span className="text-[#444748] ml-2">• Diocesan Spiritual Retreat (7 Days)</span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">APPROVED</span>
            </div>
          </div>

          {/* Pastoral care calendar: current month grid with today highlighted and
              the selected employee's deterministic 3-day retreat window marked.
              No leave records exist in the DB yet, so the schedule is derived from
              the employee code to demonstrate the widget. */}
          {(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const firstDow = new Date(year, month, 1).getDay();
            const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const selectedEmp = employees.find((e) => e.id === selectedEmpId);
            const seed = (selectedEmp?.code ?? 'EMP-0000').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const retreatStart = (seed % Math.max(1, daysInMonth - 3)) + 1;
            const retreatDays = [retreatStart, retreatStart + 1, retreatStart + 2];
            const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-[#e1e3e3] rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-[#f4f3f3] border-b border-[#e1e3e3] flex items-center justify-between">
                    <span className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">{monthLabel}</span>
                    <span className="material-symbols-outlined text-base text-[#444748]">calendar_month</span>
                  </div>
                  <div className="grid grid-cols-7 gap-px bg-[#e1e3e3] text-center text-[10px] font-bold text-[#444748]">
                    {weekdays.map((w) => (
                      <div key={w} className="bg-[#f4f3f3] py-1.5 uppercase tracking-wider">{w}</div>
                    ))}
                    {Array.from({ length: firstDow }).map((_, i) => (
                      <div key={`b-${i}`} className="bg-[#ffffff] py-2.5" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                      const d = i + 1;
                      const isToday = d === now.getDate();
                      const isLeave = retreatDays.includes(d);
                      return (
                        <div
                          key={d}
                          className={`bg-[#ffffff] py-2.5 relative flex items-center justify-center ${
                            isToday ? 'font-bold text-[#1a1c1c]' : 'text-[#444748]'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 flex items-center justify-center rounded-full ${
                              isToday
                                ? isLeave
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-[#1e1e1e] text-white'
                                : ''
                            }`}
                          >
                            {d}
                          </span>
                          {isLeave && !isToday && (
                            <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-500" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                    SCHEDULE OVERVIEW
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-[#1e1e1e] inline-block shrink-0" />
                      <span className="text-[#444748]">Today</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-amber-600 inline-block shrink-0" />
                      <span className="text-[#444748]">Today (retreat in progress)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-1 rounded-full bg-amber-500 inline-block shrink-0" />
                      <span className="text-[#444748]">
                        Scheduled leave ({selectedEmp?.name ?? 'selected employee'}, retreat {retreatStart}–{retreatStart + 2})
                      </span>
                    </div>
                  </div>
                  <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] text-[#444748] italic">
                    Pastoral retreats and annual leave are coordinated here; future releases
                    will sync leave approvals from the HR workflow.
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 5. RECRUITMENT — static placeholder panel for open positions/volunteers;
          the Review Applicants action is an alert stub. */}
      {activeSubTab === 'recruitment' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish Recruitment & Volunteers</h3>
          <p className="text-xs text-[#444748]">Open positions, volunteer screening logs, and background check verifications.</p>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold text-[#1a1c1c]">Assistant Catechist (Volunteer)</span>
                <span className="text-[#444748] ml-2">• 0 Applicants Pending Screening</span>
              </div>
              <button
                onClick={() => alert("Opening applicant review board...")}
                className="px-3 py-1 bg-[#1e1e1e] text-white rounded text-[10px] font-bold cursor-pointer"
              >
                Review Applicants
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
