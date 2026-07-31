import React, { useState } from 'react';
import { HRSubTab } from '../../types';

export const HRView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<HRSubTab>('directory');

  // Employee directory state
  const [employees, setEmployees] = useState([
    { id: 'emp1', code: 'EMP001', name: 'Fr. Mark Davis', role: 'Parish Priest', phone: '+254 700 000123', email: 'fr.mark@stmarys.org', hireDate: '2019-03-15' },
    { id: 'emp2', code: 'EMP002', name: 'Sarah Jenkins', role: 'Head Cashier', phone: '+254 700 000124', email: 's.jenkins@stmarys.org', hireDate: '2021-06-01' },
    { id: 'emp3', code: 'EMP003', name: 'Peter Njuguna', role: 'Inventory Clerk', phone: '+254 700 000125', email: 'p.njuguna@stmarys.org', hireDate: '2022-01-10' },
    { id: 'emp4', code: 'EMP004', name: 'Sr. Beatrice', role: 'Pastoral Coordinator', phone: '+254 700 000126', email: 'sr.beatrice@stmarys.org', hireDate: '2020-09-20' },
    { id: 'emp5', code: 'EMP005', name: 'John Kamau', role: 'Sacristan', phone: '+254 700 000127', email: 'j.kamau@stmarys.org', hireDate: '2023-04-12' }
  ]);

  // Selected Employee for view/edit
  const [selectedEmpId, setSelectedEmpId] = useState<string>('emp1');

  // New Employee Form State
  const [natId, setNatId] = useState('');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [designation, setDesignation] = useState('Parish Priest');
  const [hireDate, setHireDate] = useState('2024-08-01');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [nokName, setNokName] = useState('');
  const [nokRel, setNokRel] = useState('');
  const [nokPhone, setNokPhone] = useState('');

  const [notification, setNotification] = useState<string | null>(null);

  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSavePersonnel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!surname || !firstName) {
      alert('Please enter surname and first name.');
      return;
    }
    const newCode = `EMP00${employees.length + 1}`;
    const newEmp = {
      id: Date.now().toString(),
      code: newCode,
      name: `${firstName} ${surname}`,
      role: designation,
      phone: phone || '+254 700 000000',
      email: email || `${firstName.toLowerCase()}@stmarys.org`,
      hireDate: hireDate
    };
    setEmployees([newEmp, ...employees]);
    setSurname('');
    setFirstName('');
    setMiddleName('');
    setEmail('');
    setPhone('');
    showNotif(`Personnel record for ${newEmp.name} (${newCode}) saved successfully!`);
    setActiveSubTab('directory');
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
            className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">person_add</span>
            + New Employee
          </button>
        </div>
      </div>

      {/* Sub-tab Navigation Links */}
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

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. EMPLOYEE MANAGEMENT (DIRECTORY) */}
      {activeSubTab === 'directory' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-3">
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Employee Directory</h3>
              <p className="text-xs text-[#444748]">Manage parish staff roles, records, and access permissions.</p>
            </div>

            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
                search
              </span>
              <input
                type="text"
                placeholder="Find by name, ID or role..."
                className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-60 focus:outline-none focus:border-[#1e1e1e]"
              />
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
                {employees.map((emp) => (
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
                      <span className="px-2.5 py-0.5 bg-[#ffffff] border border-[#e1e3e3] rounded-full text-[11px] font-medium text-[#1a1c1c]">
                        {emp.role}
                      </span>
                    </td>
                    <td className="p-3 text-[#444748]">{emp.phone}</td>
                    <td className="p-3 text-[#444748]">{emp.email}</td>
                    <td className="p-3 text-center">
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center text-xs text-[#444748] pt-2 gap-3">
            <span>Showing {employees.length} of 42 employees</span>

            <div className="flex gap-2">
              <button
                onClick={() => alert("Exporting directory CSV...")}
                className="px-3 py-1.5 font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer"
              >
                Export Directory
              </button>
              <button
                onClick={() => alert("Selected employee deactivated.")}
                className="px-3 py-1.5 font-semibold text-[#ba1a1a] bg-[#ffffff] border border-[#ba1a1a] rounded hover:bg-[#fce8e8] cursor-pointer"
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

      {/* 2. ADD NEW EMPLOYEE (ONBOARDING) */}
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
                className="px-6 py-2 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">MONTHLY DISBURSEMENT</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">$8,450.00</div>
            </div>
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">CLERGY STIPENDS</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">4 Vouchers</div>
            </div>
            <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg">
              <span className="text-[10px] font-bold text-[#444748] uppercase">PAYROLL STATUS</span>
              <div className="text-xl font-serif font-bold text-emerald-800 mt-1">Approved Q3</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. LEAVE REQUESTS */}
      {activeSubTab === 'leave' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Leave & Sabbatical Requests</h3>
          <p className="text-xs text-[#444748]">Review pastoral retreat schedules and annual leave rosters.</p>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold text-[#1a1c1c]">Fr. Mark Davis</span>
                <span className="text-[#444748] ml-2">• Diocesan Spiritual Retreat (7 Days)</span>
              </div>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">APPROVED</span>
            </div>
          </div>
        </div>
      )}

      {/* 5. RECRUITMENT */}
      {activeSubTab === 'recruitment' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Parish Recruitment & Volunteers</h3>
          <p className="text-xs text-[#444748]">Open positions, volunteer screening logs, and background check verifications.</p>

          <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-bold text-[#1a1c1c]">Assistant Catechist (Volunteer)</span>
                <span className="text-[#444748] ml-2">• 3 Applicants Pending Screening</span>
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
