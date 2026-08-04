import React, { useState } from 'react';
import { ChristianRecord, ChristianSubTab } from '../../types';

interface ChristianViewProps {
  christians: ChristianRecord[];
  onAddChristian: (newMember: ChristianRecord) => void;
  onDeleteChristian: (id: string) => void;
  onSelectMemberForSacrament: (member: ChristianRecord) => void;
  onSelectMemberForPayment: (member: ChristianRecord) => void;
  initialSubTab?: ChristianSubTab;
}

export const ChristianView: React.FC<ChristianViewProps> = ({
  christians,
  onAddChristian,
  onDeleteChristian,
  onSelectMemberForSacrament,
  onSelectMemberForPayment,
  initialSubTab = 'add'
}) => {
  const [subTab, setSubTab] = useState<ChristianSubTab>(initialSubTab);

  // Form State for Add New Christian
  const [formData, setFormData] = useState({
    nationalId: '',
    baptismalName: '',
    secondName: '',
    sirName: '',
    phone: '',
    diocese: '',
    parish: '',
    localChurch: '',
    scc: ''
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  // Search state for Find
  const [findSearch, setFindSearch] = useState('');

  // Delete search & modal state
  const [deleteSearch, setDeleteSearch] = useState('');
  const [memberToDelete, setMemberToDelete] = useState<ChristianRecord | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleClear = () => {
    setFormData({
      nationalId: '',
      baptismalName: '',
      secondName: '',
      sirName: '',
      phone: '',
      diocese: '',
      parish: '',
      localChurch: '',
      scc: ''
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.baptismalName ||
      !formData.sirName ||
      !formData.nationalId ||
      !formData.phone ||
      !formData.diocese ||
      !formData.parish ||
      !formData.localChurch ||
      !formData.scc
    ) {
      alert('Please complete all required fields: names, National ID, phone, diocese, parish, local church and SCC.');
      return;
    }

    const newRecord: ChristianRecord = {
      id: `c_${Date.now()}`,
      regNo: '',
      nationalId: formData.nationalId,
      baptismalName: formData.baptismalName,
      secondName: formData.secondName,
      sirName: formData.sirName,
      phone: formData.phone,
      diocese: formData.diocese,
      parish: formData.parish,
      localChurch: formData.localChurch,
      scc: formData.scc,
      status: 'Active'
    };

    onAddChristian(newRecord);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    handleClear();
  };

  const filteredFind = christians.filter((c) => {
    const term = findSearch.toLowerCase();
    return (
      c.baptismalName.toLowerCase().includes(term) ||
      c.sirName.toLowerCase().includes(term) ||
      c.regNo.toLowerCase().includes(term) ||
      c.nationalId.toLowerCase().includes(term) ||
      c.phone.includes(term)
    );
  });

  const memberFoundForDelete = christians.find((c) => {
    const term = deleteSearch.trim().toLowerCase();
    if (!term) return false;
    return (
      c.regNo.toLowerCase() === term ||
      c.baptismalName.toLowerCase() === term ||
      c.nationalId.toLowerCase() === term
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title & Navigation Sub-Tabs */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Christian Registry
          </h2>
          <p className="text-xs text-[#444748]">
            Manage parishioner demographic cards, sacrament logs, and membership status
          </p>
        </div>

        {/* Sub-tab Pills */}
        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
          <button
            onClick={() => setSubTab('add')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'add'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            ADD NEW CHRISTIAN
          </button>
          <button
            onClick={() => setSubTab('find')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'find'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            FIND A CHRISTIAN
          </button>
          <button
            onClick={() => setSubTab('delete')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'delete'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            DELETE CHRISTIAN
          </button>
        </div>
      </div>

      {/* SUCCESS NOTIFICATION BANNER */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>Christian record registered successfully into the Parish Roll!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* 1. ADD NEW CHRISTIAN */}
      {subTab === 'add' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs">
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#e1e3e3]">
            <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
              BIODATA INPUT FORM
            </h3>
            <span className="text-xs font-mono bg-[#f4f3f3] text-[#1e1e1e] px-2.5 py-1 rounded border border-[#e1e3e3]">
              Registration No: auto-generated on save
            </span>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* ID Number */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  National ID Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 12345678"
                  value={formData.nationalId}
                  onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Baptismal Name */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Baptismal Name <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                   placeholder="First name"
                  required
                  value={formData.baptismalName}
                  onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Second Name */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Second Name
                </label>
                <input
                  type="text"
                   placeholder="Second name"
                  value={formData.secondName}
                  onChange={(e) => setFormData({ ...formData, secondName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Sir Name */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Sir Name / Surname <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Smith"
                  required
                  value={formData.sirName}
                  onChange={(e) => setFormData({ ...formData, sirName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. +254 700 000 000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Diocese */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Diocese
                </label>
                <select
                  value={formData.diocese}
                  onChange={(e) => setFormData({ ...formData, diocese: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  <option value="">Select Diocese...</option>
                  <option value="Archdiocese of Nairobi">Archdiocese of Nairobi</option>
                  <option value="Diocese of Nakuru">Diocese of Nakuru</option>
                  <option value="Diocese of Machakos">Diocese of Machakos</option>
                  <option value="Diocese of Mombasa">Diocese of Mombasa</option>
                </select>
              </div>

              {/* Parish */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Parish
                </label>
                <select
                  value={formData.parish}
                  onChange={(e) => setFormData({ ...formData, parish: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  <option value="">Select Parish...</option>
                  <option value="St. Mary's Parish">St. Mary's Parish</option>
                  <option value="St. Joseph Parish">St. Joseph Parish</option>
                  <option value="Holy Family Cathedral">Holy Family Cathedral</option>
                </select>
              </div>

              {/* Local Church */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Local Church / Outstation
                </label>
                <select
                  value={formData.localChurch}
                  onChange={(e) => setFormData({ ...formData, localChurch: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  <option value="">Select Local Church...</option>
                  <option value="Our Lady of Sorrows">Our Lady of Sorrows</option>
                  <option value="St. Peters Center">St. Peters Center</option>
                  <option value="St. Teresa Chapel">St. Teresa Chapel</option>
                </select>
              </div>

              {/* SCC (Jumuiya) */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Small Christian Community (SCC / Jumuiya)
                </label>
                <select
                  value={formData.scc}
                  onChange={(e) => setFormData({ ...formData, scc: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  <option value="">Select SCC / Jumuiya...</option>
                  <option value="St. Jude">St. Jude</option>
                  <option value="St. Francis">St. Francis</option>
                  <option value="St. Anne">St. Anne</option>
                  <option value="St. Anthony">St. Anthony</option>
                  <option value="St. Monica">St. Monica</option>
                </select>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#e1e3e3]">
              <button
                type="button"
                onClick={handleClear}
                className="px-4 py-2 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded transition-colors cursor-pointer"
              >
                Clear Form
              </button>
              <button
                type="submit"
                className="px-6 py-2 text-xs font-bold text-[#ffffff] bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                Save Christian Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. FIND A CHRISTIAN */}
      {subTab === 'find' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
              PARISHIONER DIRECTORY
            </h3>
            <div className="w-full sm:w-72 relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-sm text-[#444748]">
                search
              </span>
              <input
                type="text"
                placeholder="Search by ID, Reg No, or Name..."
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                  <th className="p-3">Reg No</th>
                  <th className="p-3">Full Name</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Local Church</th>
                  <th className="p-3">SCC</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e3e3] text-xs">
                {filteredFind.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-[#444748]">
                      No Christian records match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredFind.map((member) => (
                    <tr key={member.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-mono text-[11px] font-semibold text-[#1e1e1e]">
                        {member.regNo}
                      </td>
                      <td className="p-3 font-bold text-[#1a1c1c]">
                        {member.baptismalName} {member.secondName} {member.sirName}
                      </td>
                      <td className="p-3 text-[#444748]">{member.phone}</td>
                      <td className="p-3 text-[#1a1c1c]">{member.localChurch}</td>
                      <td className="p-3 text-[#1a1c1c]">{member.scc}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            member.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : member.status === 'Deceased'
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {member.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => onSelectMemberForSacrament(member)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#1e1e1e] bg-[#f4f3f3] hover:bg-[#eeeeee] border border-[#c4c7c7] rounded transition-colors cursor-pointer"
                        >
                          Sacrament Card
                        </button>
                        <button
                          onClick={() => onSelectMemberForPayment(member)}
                          className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors cursor-pointer"
                        >
                          Pay / Tithe
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. DELETE CHRISTIAN */}
      {subTab === 'delete' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          <div className="border-b border-[#e1e3e3] pb-4">
            <h3 className="text-sm font-bold text-[#ba1a1a] uppercase tracking-wide">
              DELETE / DEACTIVATE CHRISTIAN RECORD
            </h3>
            <p className="text-xs text-[#444748] mt-1">
               Search by Reg No or National ID to delete or archive a record.
            </p>
          </div>

          <div className="max-w-md space-y-3">
            <label className="block text-xs font-medium text-[#1a1c1c]">
              Enter Registration No or Name
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                 placeholder="e.g. REG-YYYY-NNNN"
                value={deleteSearch}
                onChange={(e) => setDeleteSearch(e.target.value)}
                className="flex-1 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>
          </div>

          {memberFoundForDelete ? (
            <div className="p-4 bg-[#f9f9f9] border border-[#e1e3e3] rounded-lg max-w-lg space-y-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs font-mono font-bold text-[#1e1e1e]">
                    {memberFoundForDelete.regNo}
                  </div>
                  <div className="text-base font-bold text-[#1a1c1c]">
                    {memberFoundForDelete.baptismalName} {memberFoundForDelete.secondName} {memberFoundForDelete.sirName}
                  </div>
                  <div className="text-xs text-[#444748]">
                    SCC: {memberFoundForDelete.scc} • {memberFoundForDelete.localChurch}
                  </div>
                </div>
                <span className="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded font-bold">
                  {memberFoundForDelete.status}
                </span>
              </div>

              <div className="pt-2 border-t border-[#e1e3e3] flex justify-end">
                <button
                  onClick={() => {
                    setMemberToDelete(memberFoundForDelete);
                    setShowConfirmModal(true);
                  }}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">delete</span>
                  Delete Record
                </button>
              </div>
            </div>
          ) : deleteSearch.trim() ? (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600 max-w-lg">
              No matching record found for "{deleteSearch}". Please verify the exact Registration Number.
            </div>
          ) : null}
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {showConfirmModal && memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-[#ba1a1a]">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h4 className="text-base font-bold">Confirm Deletion</h4>
            </div>

            <p className="text-xs text-[#444748]">
              Are you sure you want to delete the Christian record for{' '}
              <strong className="text-[#1a1c1c]">
                {memberToDelete.baptismalName} {memberToDelete.sirName}
              </strong>{' '}
              ({memberToDelete.regNo})? The record will be soft-deleted and can be restored from Trash &amp; Audit.
            </p>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-1.5 text-xs font-medium text-[#444748] hover:bg-[#f4f3f3] rounded cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteChristian(memberToDelete.id);
                  setShowConfirmModal(false);
                  setMemberToDelete(null);
                  setDeleteSearch('');
                  alert('Record successfully removed.');
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
