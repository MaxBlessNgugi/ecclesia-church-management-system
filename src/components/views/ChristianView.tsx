// =============================================================================
// ChristianView — Parishioner Registry panel (Add / Find / Delete sub-tabs)
// -----------------------------------------------------------------------------
// Owns all local state for the three registry workflows and reports back to the
// parent (App.tsx) through callbacks; it performs NO direct API calls — records
// are persisted in App.tsx via christiansApi.create / christiansApi.remove.
//
// Props: christians (registry rows), onAddChristian, onDeleteChristian,
//        onSelectMemberForSacrament, onSelectMemberForPayment, initialSubTab.
// Data flow: biodata form -> handleSave -> onAddChristian(newRecord) -> API.
//            Find/Delete filters run purely against the `christians` prop.
// Internal state: subTab (active sub-panel), formData (biodata form),
//        savedSuccess (transient save toast), findSearch (find filter),
//        deleteSearch + memberToDelete + showConfirmModal (delete workflow).
// =============================================================================
import React, { useState } from 'react';
import { ChristianRecord, ChristianSubTab } from '../../types';
import { usePermissions } from '../../permissions';
import { useParishInfo } from '../../hooks/useParishInfo';

/**
 * Props for the Christian Registry panel.
 *
 * @param christians - Full parishioner list rendered by the Find/Delete sub-tabs;
 *   owned by App.tsx and refreshed after every create/delete round-trip.
 * @param onAddChristian - Fired on form submit with a fully-built ChristianRecord
 *   (id prefixed `c_`); parent persists it and prepends it to the registry.
 * @param onDeleteChristian - Fired after modal confirmation with the record id;
 *   parent soft-deletes the record (restorable from Trash & Audit).
 * @param onSelectMemberForSacrament - Row action that pre-selects a member and
 *   redirects App.tsx to the Sacraments panel (update_card sub-tab).
 * @param onSelectMemberForPayment - Row action that pre-selects a member and
 *   redirects App.tsx to the Activities panel (receive_payment sub-tab).
 * @param initialSubTab - Sub-tab opened on first mount (driven by nav clicks in
 *   App.tsx); defaults to 'add'. Only seeds state — later switches are local.
 */
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
  // Permission object exposing canEdit/canDelete checks gated by the current
  // user's role; used to disable the Save and Delete buttons when the user
  // lacks the required privilege.
  const perms = usePermissions();

  // Active sub-panel: 'add' | 'find' | 'delete'. Switching tabs mounts/unmounts
  // the matching block below; find/delete filters re-evaluate every render.
  const [subTab, setSubTab] = useState<ChristianSubTab>(initialSubTab);

  // Parish settings — diocese and parish name are fixed constants from ParishSettings
  const parish = useParishInfo();

  // Form State for Add New Christian — diocese/parish omitted (injected from ParishSettings)
  const [formData, setFormData] = useState({
    nationalId: '',
    baptismalName: '',
    secondName: '',
    sirName: '',
    phone: '',
    localChurch: '',
    scc: ''
  });

  // Transient flag for the "record saved" toast; auto-clears after 3s (see handleSave).
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Search state for Find — the live text the user types into the parishioner
  // directory search box; drives the filteredFind computation on every render.
  const [findSearch, setFindSearch] = useState('');

  // Delete search & modal state
  const [deleteSearch, setDeleteSearch] = useState('');
  // Holds the full ChristianRecord once an exact-match lookup succeeds so the
  // confirm modal can display the member's details before the user confirms.
  const [memberToDelete, setMemberToDelete] = useState<ChristianRecord | null>(null);
  // Controls visibility of the full-screen confirmation overlay; toggled by the
  // Delete Record button and dismissed by Cancel / after a successful delete.
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleClear = () => {
    setFormData({
      nationalId: '',
      baptismalName: '',
      secondName: '',
      sirName: '',
      phone: '',
      localChurch: '',
      scc: ''
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    // Manual required-field guard: `secondName` is optional and the HTML
    // `required` attributes only cover a few inputs, so validate the full set
    // here before building the record.
    if (
      !formData.baptismalName ||
      !formData.sirName ||
      !formData.nationalId ||
      !formData.phone ||
      !formData.localChurch ||
      !formData.scc
    ) {
      alert('Please complete all required fields: names, National ID, phone, local church and SCC.');
      return;
    }

    // Client-side id from the timestamp (prefixed `c_`) so the new row is keyable
    // immediately; regNo is left empty and assigned upstream on save (matches the
    // "auto-generated on save" UI hint in the form header).
    const newRecord: ChristianRecord = {
      id: `c_${Date.now()}`,
      regNo: '',
      nationalId: formData.nationalId,
      baptismalName: formData.baptismalName,
      secondName: formData.secondName,
      sirName: formData.sirName,
      phone: formData.phone,
      diocese: parish.diocese,
      parish: parish.name,
      localChurch: formData.localChurch,
      scc: formData.scc,
      status: 'Active'
    };

    // Hand the record to the parent for persistence, then show a transient
    // success toast (auto-dismisses after 3s) and reset the form for the next entry.
    onAddChristian(newRecord);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    handleClear();
  };

  // Live directory filter — case-insensitive substring match across name, ID and
  // reg fields. An empty term matches everything ('' is contained in any string),
  // so the table shows the full registry until the user types.
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

  // Delete lookup uses EXACT matches (==, not substring) on regNo / baptismalName /
  // nationalId, so the user must type the full identifier — prevents accidentally
  // staging a similar-named member. Empty/whitespace input yields null.
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
      {/* Header bar — flexbox layout that stacks vertically on mobile, horizontal on sm+;
          contains the section title/description on the left and the sub-tab pill buttons
          on the right. White card with subtle border. */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title block — left-aligned heading and subheading describing the section's purpose */}
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Christian Registry
          </h2>
          <p className="text-xs text-[#444748]">
            Manage parishioner demographic cards, sacrament logs, and membership status
          </p>
        </div>

        {/* Sub-tab Pills — each button swaps `subTab`; the active pill is inverted
            (dark bg + light text) via the conditional Tailwind classes below. */}
        {/* Pill-shaped toggle bar — grey background with padding, rounded corners; contains
            three buttons that switch the visible sub-panel. */}
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

      {/* SUCCESS NOTIFICATION BANNER — transient (3s) confirmation after a save;
          the ✕ button dismisses it early. */}
      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>Christian record registered successfully into the Parish Roll!</span>
          </div>
          <button onClick={() => setSavedSuccess(false)} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* 1. ADD NEW CHRISTIAN — biodata capture form; the only sub-tab that WRITES
          new data (via onAddChristian). regNo is left empty and auto-generated
          upstream on save. */}
      {subTab === 'add' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs">
          {/* Form header — flex row with title on left and registration number
              badge on right, separated by a bottom border */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#e1e3e3]">
            <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
              BIODATA INPUT FORM
            </h3>
            {/* Badge showing that regNo is auto-generated — monospace font,
                grey background, positioned at top-right of form header */}
            <span className="text-xs font-mono bg-[#f4f3f3] text-[#1e1e1e] px-2.5 py-1 rounded border border-[#e1e3e3]">
              Registration No: auto-generated on save
            </span>
          </div>

          {/* Form element — wraps all inputs, submits via handleSave on enter/button click */}
          <form onSubmit={handleSave} className="space-y-6">
            {/* 3-column responsive grid layout for form fields; collapses to single column on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* ID Number — required field validated in handleSave; stores the
                  national identification number string */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  National ID Number
                </label>
                {/* Text input for national ID — no HTML required attribute because
                    validation is handled in handleSave's manual guard; placeholder
                    provides an example format; onChange updates formData.nationalId
                    via spread-update pattern */}
                <input
                  type="text"
                  placeholder="e.g. 12345678"
                  value={formData.nationalId}
                  onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Baptismal Name — required field; the primary first name used in
                  parish records and displayed in the directory; marked with
                  red asterisk to indicate mandatory status */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Baptismal Name <span className="text-[#ba1a1a]">*</span>
                </label>
                {/* Text input with HTML required attribute — browser enforces non-empty
                    on submit as a first line of defense; handleSave also checks it
                    explicitly for the alert message; placeholder suggests format */}
                <input
                  type="text"
                   placeholder="First name"
                  required
                  value={formData.baptismalName}
                  onChange={(e) => setFormData({ ...formData, baptismalName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Second Name — optional field; middle name; no required attribute
                  and not validated in handleSave guard */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Second Name
                </label>
                {/* Text input — no required attribute; empty value is acceptable;
                    onChange updates formData.secondName via spread-update */}
                <input
                  type="text"
                   placeholder="Second name"
                  value={formData.secondName}
                  onChange={(e) => setFormData({ ...formData, secondName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Sir Name / Surname — required field; family name displayed in
                  directory and used for exact-match lookups; red asterisk indicates mandatory */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Sir Name / Surname <span className="text-[#ba1a1a]">*</span>
                </label>
                {/* Text input with required attribute — both browser and handleSave
                    enforce non-empty; placeholder shows example surname format */}
                <input
                  type="text"
                  placeholder="e.g. Smith"
                  required
                  value={formData.sirName}
                  onChange={(e) => setFormData({ ...formData, sirName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Phone Number — required field; stored as string; used for
                  directory search and contact; no HTML required attribute but
                  validated in handleSave guard */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Phone Number
                </label>
                {/* Text input for phone — placeholder shows international format;
                    onChange updates formData.phone; validated in handleSave */}
                <input
                  type="text"
                  placeholder="e.g. +254 700 000 000"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                />
              </div>

              {/* Local Church / Outstation — the specific
                  chapel or outstation within the parish; validated in handleSave */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Local Church / Outstation
                </label>
                {/* Select dropdown — represents the outstation/chapel level of the
                    church hierarchy; options are hardcoded; onChange updates
                    formData.localChurch */}
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

              {/* SCC (Jumuiya) — required dropdown; the Small Christian Community
                  the member belongs to; validated in handleSave; used for
                  community-level reporting */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Small Christian Community (SCC / Jumuiya)
                </label>
                {/* Select dropdown — SCC is the smallest grouping unit in the
                    Kenyan Catholic structure; options list available Jumuiyas;
                    onChange updates formData.scc */}
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

            {/* Form Actions — bottom-right aligned button row; Clear Form resets all
                fields, Save Christian Record submits the form; Save is disabled when
                the user lacks christian edit permission */}
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
                disabled={!perms.canEdit('christian')}
                className="px-6 py-2 text-xs font-bold text-[#ffffff] bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">save</span>
                Save Christian Record
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. FIND A CHRISTIAN — read-only directory; filters `christians` live and
          hands a row off to Sacraments (update_card) or Activities (payments). */}
      {subTab === 'find' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Search header — flex row that stacks vertically on mobile; contains
              section title on left and search input on right */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
              PARISHIONER DIRECTORY
            </h3>
            {/* Search input wrapper — fixed-width on sm+, full-width on mobile;
                relative positioning allows the search icon to be absolutely placed
                inside the input field */}
            <div className="w-full sm:w-72 relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-sm text-[#444748]">
                search
              </span>
              {/* Live search input — filters the table on every keystroke via
                  findSearch state; placeholder indicates searchable fields;
                  left padding accommodates the search icon */}
              <input
                type="text"
                placeholder="Search by ID, Reg No, or Name..."
                value={findSearch}
                onChange={(e) => setFindSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
            </div>
          </div>

          {/* Scrollable table wrapper — horizontal scroll on small screens;
              border + rounded corners frame the table visually */}
          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            {/* Data table — full-width, left-aligned, collapsed borders;
                thead provides column headers, tbody renders filteredFind rows */}
            <table className="w-full text-left border-collapse">
              <thead>
                {/* Table header row — grey background, uppercase small text,
                    each column has padding and bold font weight for clarity */}
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
              {/* Table body — vertical dividers between rows; text-xs for compact
                  display; conditionally renders empty state or data rows */}
              <tbody className="divide-y divide-[#e1e3e3] text-xs">
                {/* Empty state: a single colspan row when the filter matches nothing —
                    distinguishes "no data" from a populated-but-filtered list. */}
                {filteredFind.length === 0 ? (
                  <tr>
                    {/* Colspan 7 covers all columns (Reg No through Actions) */}
                    <td colSpan={7} className="p-6 text-center text-[#444748]">
                      No Christian records match your search criteria.
                    </td>
                  </tr>
                ) : (
                  filteredFind.map((member) => (
                    <tr key={member.id} className="hover:bg-[#f9f9f9]">
                      {/* Reg No cell — monospace font for alignment, bold weight
                          for visual emphasis; displays the auto-generated regNo */}
                      <td className="p-3 font-mono text-[11px] font-semibold text-[#1e1e1e]">
                        {member.regNo}
                      </td>
                      {/* Full Name cell — bold font; concatenates baptismalName,
                          secondName, and sirName with spaces to form the display name */}
                      <td className="p-3 font-bold text-[#1a1c1c]">
                        {member.baptismalName} {member.secondName} {member.sirName}
                      </td>
                      {/* Phone cell — neutral color, displays the contact number */}
                      <td className="p-3 text-[#444748]">{member.phone}</td>
                      {/* Local Church cell — displays the outstation/chapel name */}
                      <td className="p-3 text-[#1a1c1c]">{member.localChurch}</td>
                      {/* SCC cell — displays the Small Community / Jumuiya name */}
                      <td className="p-3 text-[#1a1c1c]">{member.scc}</td>
                      {/* Status cell — contains a colored pill that reflects the
                          member's current status in the parish roll */}
                      <td className="p-3">
                        {/* Status pill — green for Active, gray for Deceased,
                            amber fallback for Transferred/Inactive. */}
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
                      {/* Actions cell — right-aligned buttons; Sacrament Card opens the
                          sacrament update view, Pay/Tithe opens the payment view;
                          both call parent callbacks that switch panels */}
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

      {/* 3. DELETE CHRISTIAN — exact-match lookup; renders the found member as a
          preview card with a Delete button that opens the confirm modal below. */}
      {subTab === 'delete' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          {/* Header block — red-tinted title and instructional subtext, separated
              by a bottom border from the rest of the panel */}
          <div className="border-b border-[#e1e3e3] pb-4">
            <h3 className="text-sm font-bold text-[#ba1a1a] uppercase tracking-wide">
              DELETE / DEACTIVATE CHRISTIAN RECORD
            </h3>
            <p className="text-xs text-[#444748] mt-1">
               Search by Reg No or National ID to delete or archive a record.
            </p>
          </div>

          {/* Search input area — max width constrained to md; contains label and
              a flex row with the text input */}
          <div className="max-w-md space-y-3">
            <label className="block text-xs font-medium text-[#1a1c1c]">
              Enter Registration No or Name
            </label>
            {/* Input row — full-width text field; onChange updates deleteSearch;
                exact-match lookup runs on every render via memberFoundForDelete */}
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

          {/* Three-state edge case: exact match found -> preview card; no match but
              non-empty query -> "no matching record" notice; empty query -> render
              nothing (avoids a noisy error while the user is still typing). */}
          {memberFoundForDelete ? (
            <div className="p-4 bg-[#f9f9f9] border border-[#e1e3e3] rounded-lg max-w-lg space-y-3">
              {/* Card header row — flex between layout; left side has reg number,
                  full name, and SCC/church info; right side has status pill */}
              <div className="flex justify-between items-start">
                <div>
                  {/* Registration number — monospace bold for visual prominence */}
                  <div className="text-xs font-mono font-bold text-[#1e1e1e]">
                    {memberFoundForDelete.regNo}
                  </div>
                  {/* Full name — large bold text for immediate identification */}
                  <div className="text-base font-bold text-[#1a1c1c]">
                    {memberFoundForDelete.baptismalName} {memberFoundForDelete.secondName} {memberFoundForDelete.sirName}
                  </div>
                  {/* SCC and local church — smaller neutral text with dot separator */}
                  <div className="text-xs text-[#444748]">
                    SCC: {memberFoundForDelete.scc} • {memberFoundForDelete.localChurch}
                  </div>
                </div>
                {/* Status pill — same color scheme as the Find directory; shows
                    current membership status at a glance */}
                <span className="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 rounded font-bold">
                  {memberFoundForDelete.status}
                </span>
              </div>

              {/* Delete action row — right-aligned; top border separates from card info */}
              <div className="pt-2 border-t border-[#e1e3e3] flex justify-end">
                {/* Stage the found member and open the modal — deletion is deferred
                    until the user confirms, so no data is touched here. */}
                <button
                  onClick={() => {
                    setMemberToDelete(memberFoundForDelete);
                    setShowConfirmModal(true);
                  }}
                  disabled={!perms.canDelete('christian')}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded transition-colors opacity-50 cursor-not-allowed flex items-center gap-1.5"
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

      {/* CONFIRM DELETE MODAL — full-screen overlay guarded by BOTH showConfirmModal
          and a non-null memberToDelete. Confirm fires onDeleteChristian then resets
          all delete-related state and clears the search box. */}
      {showConfirmModal && memberToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          {/* Modal card — white background, rounded corners, shadow-xl for depth;
              max-w-md constrains width; space-y-4 adds vertical gaps between
              the warning header, message, and action buttons */}
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            {/* Warning header — red icon and text to signal destructive action */}
            <div className="flex items-center gap-3 text-[#ba1a1a]">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h4 className="text-base font-bold">Confirm Deletion</h4>
            </div>

            {/* Confirmation message — names the member and registration number;
                explains the soft-delete behavior and that records can be restored
                from Trash & Audit */}
            <p className="text-xs text-[#444748]">
              Are you sure you want to delete the Christian record for{' '}
              <strong className="text-[#1a1c1c]">
                {memberToDelete.baptismalName} {memberToDelete.sirName}
              </strong>{' '}
              ({memberToDelete.regNo})? The record will be soft-deleted and can be restored from Trash &amp; Audit.
            </p>

            {/* Action buttons — right-aligned with gap; Cancel closes the modal,
                Confirm Delete fires the actual deletion and resets all state */}
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
                disabled={!perms.canDelete('christian')}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded opacity-50 cursor-not-allowed"
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
