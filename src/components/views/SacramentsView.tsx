// =============================================================================
// SacramentsView — Sacrament Register & Memorial panel (update_card / record_death)
// -----------------------------------------------------------------------------
// Manages the four sacramental fields (Baptism, Eucharist, Confirmation,
// Marriage) on a member's Christian card, plus parishioner death records.
// Persistence happens in App.tsx (christiansApi.updateSacraments / deathsApi.create);
// this component only assembles payloads and reports through callbacks.
//
// Props: christians, selectedMember (optionally pre-selected by ChristianView's
//        "Sacrament Card" action), deathRecords, initialSubTab, onUpdateSacraments,
//        onRecordDeath.
// Data flow: sacrament forms -> handleSaveSacraments -> onUpdateSacraments(memberId, {...}).
//            death form -> handleDeathSubmit -> onRecordDeath(DeathRecord) -> parent
//            persists it and flips the member's status to Deceased.
// Internal state: subTab; activeMember + per-sacrament form slices (baptism/
//        eucharist/confirmation/marriage) re-synced from activeMember via useEffect;
//        showCertModal (printable certificate); death-record fields (deceasedMember,
//        placeOfDeath, dateOfDeath, dateOfBurial, deathMinister, remarks).
// =============================================================================
import React, { useState, useEffect } from 'react';
import { ChristianRecord, SacramentsSubTab, DeathRecord } from '../../types';
import { usePermissions } from '../../permissions';

/**
 * Props for the Sacrament Register & Memorial panel.
 *
 * @param christians - Full registry list; sources both the member dropdowns and
 *   the default activeMember/deceasedMember (first / second list entry).
 * @param selectedMember - Member pre-selected from another panel (e.g. ChristianView's
 *   "Sacrament Card" action); when set, it overrides activeMember via useEffect.
 *   Optional — defaults to null.
 * @param deathRecords - Existing memorial entries rendered in the right-hand
 *   "Recent Memorial Entries" feed (most-recent-first).
 * @param initialSubTab - Sub-tab opened on first mount; defaults to 'update_card'.
 *   Only seeds state — later switches are internal.
 * @param onUpdateSacraments - Fired on sacrament save with the member id and a
 *   partial ChristianRecord containing only the four sacrament slices; parent
 *   merges it back into the member and persists via christiansApi.
 * @param onRecordDeath - Fired on death-form submit with a fully-built DeathRecord;
 *   parent persists it and sets the member's status to 'Deceased'.
 */
interface SacramentsViewProps {
  christians: ChristianRecord[];
  selectedMember?: ChristianRecord | null;
  deathRecords: DeathRecord[];
  initialSubTab?: SacramentsSubTab;
  onUpdateSacraments: (memberId: string, sacramentData: Partial<ChristianRecord>) => void;
  onRecordDeath: (death: DeathRecord) => void;
}

export const SacramentsView: React.FC<SacramentsViewProps> = ({
  christians,
  selectedMember: propSelectedMember,
  deathRecords,
  initialSubTab = 'update_card',
  onUpdateSacraments,
  onRecordDeath
}) => {
  const perms = usePermissions();
  const [subTab, setSubTab] = useState<SacramentsSubTab>(initialSubTab);

  // Active member for Sacrament Card — fallback chain: prefer the member
  // pre-selected by another panel, else the first registry row, else null
  // (handles an empty registry without crashing the form).
  const [activeMember, setActiveMember] = useState<ChristianRecord | null>(
    propSelectedMember || christians[0] || null
  );

  // Re-sync when the parent hands down a (new) pre-selected member — e.g. clicking
  // "Sacrament Card" on a row in ChristianView navigates here with selectedMember set.
  useEffect(() => {
    if (propSelectedMember) {
      setActiveMember(propSelectedMember);
    }
  }, [propSelectedMember]);

  // Sacrament Form State — four slices mirroring SacramentData { date, minister, place }.
  // Kept as draft fields so edits never touch the real record until Save is pressed.
  const [baptism, setBaptism] = useState({ date: '', minister: '', place: '' });
  const [eucharist, setEucharist] = useState({ date: '', minister: '', place: '' });
  const [confirmation, setConfirmation] = useState({ date: '', minister: '', place: '' });
  const [marriage, setMarriage] = useState({ date: '', minister: '', place: '' });

  // When the active member changes (dropdown switch or pre-selection), repopulate
  // every sacrament slice from that member's record (empty strings when unrecorded).
  useEffect(() => {
    if (activeMember) {
      setBaptism({
        date: activeMember.baptism?.date || '',
        minister: activeMember.baptism?.minister || '',
        place: activeMember.baptism?.place || ''
      });
      setEucharist({
        date: activeMember.eucharist?.date || '',
        minister: activeMember.eucharist?.minister || '',
        place: activeMember.eucharist?.place || ''
      });
      setConfirmation({
        date: activeMember.confirmation?.date || '',
        minister: activeMember.confirmation?.minister || '',
        place: activeMember.confirmation?.place || ''
      });
      setMarriage({
        date: activeMember.marriage?.date || '',
        minister: activeMember.marriage?.minister || '',
        place: activeMember.marriage?.place || ''
      });
    }
  }, [activeMember]);

  // Certificate Modal State
  const [showCertModal, setShowCertModal] = useState(false);

  // Death Record State — default deceasedMember is the SECOND registry entry
  // (christians[1]) rather than the first, so the death form doesn't pre-select
  // the same member as the sacrament card by default. Falls back to null on an
  // empty registry.
  const [deceasedMember, setDeceasedMember] = useState<ChristianRecord | null>(christians[1] || null);
  const [placeOfDeath, setPlaceOfDeath] = useState('');
  const [dateOfDeath, setDateOfDeath] = useState('');
  const [dateOfBurial, setDateOfBurial] = useState('');
  const [deathMinister, setDeathMinister] = useState('');
  const [remarks, setRemarks] = useState('');

  const handleSaveSacraments = (e: React.FormEvent) => {
    e.preventDefault();
    // Empty-registry edge case: bail silently if no member is selected.
    if (!activeMember) return;
    // Partial update — only the four sacrament slices leave this component; the
    // parent merges them into the member and persists via christiansApi.
    onUpdateSacraments(activeMember.id, {
      baptism,
      eucharist,
      confirmation,
      marriage
    });
    alert(`Sacrament registers updated for ${activeMember.baptismalName} ${activeMember.sirName}!`);
  };

  const handleDeathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: nothing to record if no deceased member is selected.
    if (!deceasedMember) return;

    // Optional death fields fall back to sensible liturgical defaults when left
    // blank: placeOfDeath -> 'Parish Residence', dateOfDeath -> today (ISO date),
    // dateOfBurial -> 'Pending', remarks -> a default requiem annotation.
    // Note dateOfBurial is free text while dateOfDeath is a date input.
    const newDeathRecord: DeathRecord = {
      id: `d_${Date.now()}`,
      christianId: deceasedMember.id,
      memberName: `${deceasedMember.baptismalName} ${deceasedMember.secondName} ${deceasedMember.sirName}`,
      placeOfDeath: placeOfDeath || 'Parish Residence',
      dateOfDeath: dateOfDeath || new Date().toISOString().split('T')[0],
      dateOfBurial: dateOfBurial || 'Pending',
      ministerName: deathMinister,
      remarks: remarks || 'Liturgy of the Word celebrated'
    };

    // Parent persists the death entry AND flips the member's status to Deceased.
    onRecordDeath(newDeathRecord);
    alert(`Death record logged and Parish Roll updated for ${deceasedMember.baptismalName} ${deceasedMember.sirName}.`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title & Sub-tabs Header */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Sacrament Register & Memorial
          </h2>
          <p className="text-xs text-[#444748]">
            Update sacramental Christian cards and record deceased parishioner details
          </p>
        </div>

        {/* Sub-tab pills — 'update_card' vs 'record_death'; the active pill is
            inverted (dark bg + light text). Switching unmounts one workflow and
            mounts the other. */}
        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
          <button
            onClick={() => setSubTab('update_card')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'update_card'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            UPDATE CHRISTIAN CARD
          </button>
          <button
            onClick={() => setSubTab('record_death')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'record_death'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            RECORD DEATH DETAILS
          </button>
        </div>
      </div>

      {/* 1. UPDATE CHRISTIAN CARD — pick a member and edit the four sacrament
          slices on their card; includes a printable certificate preview. */}
      {subTab === 'update_card' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[#e1e3e3]">
            <div>
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                SACRAMENT REGISTER LOG
              </h3>
              <p className="text-xs text-[#444748]">
                Confirm identity before making sacrament updates to parish archives
              </p>
            </div>

            {/* Member selector — switching rows repopulates the form slices below
                via the activeMember useEffect. */}
            <div className="w-full sm:w-80">
              <select
                value={activeMember?.id}
                onChange={(e) => {
                  const found = christians.find((c) => c.id === e.target.value);
                  if (found) setActiveMember(found);
                }}
                className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] font-bold focus:outline-none focus:border-[#1e1e1e]"
              >
                {christians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.baptismalName} {c.sirName} ({c.regNo})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Active Member Preview — identity-confirmation header plus the
              certificate button. Rendered only when a member exists (null on an
              empty registry). */}
          {activeMember && (
            <div className="p-4 bg-[#f9f9f9] border border-[#e1e3e3] rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-sm">
                  {activeMember.baptismalName[0]}
                  {activeMember.sirName[0]}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1a1c1c]">
                    {activeMember.baptismalName} {activeMember.secondName} {activeMember.sirName}
                  </div>
                  <div className="text-xs text-[#444748]">
                    Reg No: <span className="font-mono">{activeMember.regNo}</span> • Parish:{' '}
                    {activeMember.parish} • SCC: {activeMember.scc}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowCertModal(true)}
                className="px-3 py-1.5 text-xs font-bold text-[#1e1e1e] bg-[#ffffff] border border-[#1e1e1e] hover:bg-[#f4f3f3] rounded transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">workspace_premium</span>
                Preview Sacrament Certificate
              </button>
            </div>
          )}

          <form onSubmit={handleSaveSacraments} className="space-y-6">
            {/* 4 Sacraments Grid — one card per sacrament (Baptism, Eucharist,
                Confirmation, Marriage), each editing { date, minister, place }. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* BAPTISM */}
              <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                  <span className="material-symbols-outlined text-base text-[#1e1e1e]">
                    water_drop
                  </span>
                  <span>1. Sacrament of Baptism</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Date of Baptism
                    </label>
                    <input
                      type="date"
                      value={baptism.date}
                      onChange={(e) => setBaptism({ ...baptism, date: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Ministering Priest
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rev. Fr. Joseph"
                      value={baptism.minister}
                      onChange={(e) => setBaptism({ ...baptism, minister: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Place of Baptism
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. your Parish"
                      value={baptism.place}
                      onChange={(e) => setBaptism({ ...baptism, place: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                </div>
              </div>

              {/* HOLY EUCHARIST */}
              <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                  <span className="material-symbols-outlined text-base text-[#1e1e1e]">
                    bakery_dining
                  </span>
                  <span>2. Holy Eucharist (First Communion)</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      First Communion Date
                    </label>
                    <input
                      type="date"
                      value={eucharist.date}
                      onChange={(e) => setEucharist({ ...eucharist, date: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Presiding Minister
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rev. Fr. Name"
                      value={eucharist.minister}
                      onChange={(e) => setEucharist({ ...eucharist, minister: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Place of Sacrament
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. your Parish"
                      value={eucharist.place}
                      onChange={(e) => setEucharist({ ...eucharist, place: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                </div>
              </div>

              {/* CONFIRMATION */}
              <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                  <span className="material-symbols-outlined text-base text-[#1e1e1e]">
                    local_fire_department
                  </span>
                  <span>3. Sacrament of Confirmation</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Confirmation Date
                    </label>
                    <input
                      type="date"
                      value={confirmation.date}
                      onChange={(e) => setConfirmation({ ...confirmation, date: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Confirming Bishop / Minister
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. His Lordship Bishop Paul"
                      value={confirmation.minister}
                      onChange={(e) => setConfirmation({ ...confirmation, minister: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Place of Confirmation
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cathedral of St. Peter"
                      value={confirmation.place}
                      onChange={(e) => setConfirmation({ ...confirmation, place: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                </div>
              </div>

              {/* MARRIAGE */}
              <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-lg space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                  <span className="material-symbols-outlined text-base text-[#1e1e1e]">
                    favorite
                  </span>
                  <span>4. Holy Matrimony (Marriage)</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Wedding Date
                    </label>
                    <input
                      type="date"
                      value={marriage.date}
                      onChange={(e) => setMarriage({ ...marriage, date: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Officiating Minister
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rev. Fr. Name"
                      value={marriage.minister}
                      onChange={(e) => setMarriage({ ...marriage, minister: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#444748] mb-1">
                      Place of Marriage
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. your Parish"
                      value={marriage.place}
                      onChange={(e) => setMarriage({ ...marriage, place: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end gap-3">
              <button
                type="submit"
                disabled={!perms.canEdit('sacraments')}
                className={`px-6 py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs flex items-center gap-2 ${
                  !perms.canEdit('sacraments') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                <span className="material-symbols-outlined text-sm">save</span>
                Save & Update Sacramental Registers
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. RECORD DEATH DETAILS — memorial workflow: log a parishioner's demise;
          submission persists the death entry and marks the member Deceased. */}
      {subTab === 'record_death' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
            <div className="border-b border-[#e1e3e3] pb-4">
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                DEATH RECORD & LITURGICAL MEMORIAL LOG
              </h3>
              <p className="text-xs text-[#444748] mt-1">
                Record demise details to update the parish roll and memorial register
              </p>
            </div>

            <form onSubmit={handleDeathSubmit} className="space-y-6">
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Select Deceased Parishioner
                </label>
                <select
                  value={deceasedMember?.id}
                  onChange={(e) => {
                    const found = christians.find((c) => c.id === e.target.value);
                    if (found) setDeceasedMember(found);
                  }}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] font-bold focus:outline-none focus:border-[#1e1e1e]"
                >
                  {christians.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.baptismalName} {c.sirName} ({c.regNo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Place of Death
                  </label>
                  <input
                    type="text"
                     placeholder="e.g. Hospital or Home"
                    value={placeOfDeath}
                    onChange={(e) => setPlaceOfDeath(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Date of Death
                  </label>
                  <input
                    type="date"
                    value={dateOfDeath}
                    onChange={(e) => setDateOfDeath(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Date of Burial
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Oct 12, 2023"
                    value={dateOfBurial}
                    onChange={(e) => setDateOfBurial(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Minister's Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rev. Fr. Name"
                    value={deathMinister}
                    onChange={(e) => setDeathMinister(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Additional Remarks / Liturgy Details
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Requiem Mass celebrated at the Parish..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              <div className="pt-4 border-t border-[#e1e3e3] flex justify-end">
                <button
                  type="submit"
                  disabled={!perms.canEdit('sacraments')}
                  className={`px-6 py-2 text-xs font-bold text-white bg-[#ba1a1a] hover:bg-[#961212] rounded transition-colors shadow-2xs flex items-center gap-2 ${
                    !perms.canEdit('sacraments') ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">skull</span>
                  Save & Update Status to Deceased
                </button>
              </div>
            </form>
          </div>

          {/* Right Guidance Sidebar & Recent Records */}
          <div className="space-y-4">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-[#1a1c1c] uppercase">
                <span className="material-symbols-outlined text-base text-[#1e1e1e]">info</span>
                <span>Procedural Note</span>
              </div>
              <p className="text-xs text-[#444748] leading-relaxed">
                Recording a death automatically updates the Parish Roll status to Deceased, notifies the finance module to close pledge accounts, and logs an entry in the Annual Memorial Report.
              </p>
            </div>

            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                RECENT MEMORIAL ENTRIES
              </h4>
              {/* Feed of logged memorial entries; renders nothing (no explicit
                  empty state) when deathRecords is empty. */}
              <div className="space-y-2">
                {deathRecords.map((d) => (
                  <div key={d.id} className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                    <div className="text-xs font-bold text-[#1a1c1c]">{d.memberName}</div>
                    <div className="text-[10px] text-[#444748]">
                      Burial: {d.dateOfBurial} • {d.placeOfDeath}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRINTABLE SACRAMENT CERTIFICATE MODAL — read-only preview of the current
          form slices; Print invokes window.print() on the whole page. Guarded by
          BOTH showCertModal and a non-null activeMember. */}
      {showCertModal && activeMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-[#faf8f5] border-2 border-[#1e1e1e] rounded-xl p-8 max-w-xl w-full shadow-2xl space-y-6 relative font-serif overflow-hidden">
            {/* Anti-fraud watermark — a faint diagonal parish mark behind the
                certificate body. It prints with the document so photocopied
                certificates stay attributable. */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden="true">
              <div className="text-[#1a1c1c] opacity-[0.05] text-7xl font-bold tracking-widest whitespace-nowrap -rotate-[25deg]">
                ST. MARY'S PARISH
              </div>
            </div>

            <div className="text-center space-y-2 border-b border-[#1e1e1e] pb-4 relative">
              <div className="text-3xl font-bold text-[#1a1c1c]">† ST. MARY'S PARISH</div>
              <p className="text-xs tracking-widest uppercase font-semibold text-[#444748]">
                Archdiocese of Nairobi • Sacramental Record Certificate
              </p>
            </div>

            <div className="text-center space-y-3 text-sm text-[#1a1c1c]">
              <p className="italic text-xs text-[#444748]">This is to certify that</p>
              <h3 className="text-2xl font-bold underline underline-offset-4">
                {activeMember.baptismalName} {activeMember.secondName} {activeMember.sirName}
              </h3>
              <p className="text-xs font-mono">Reg No: {activeMember.regNo}</p>

              <div className="my-4 text-left bg-white p-4 rounded border border-[#e1e3e3] space-y-2 text-xs">
                <div>
                  <strong>Baptism:</strong> {baptism.date || 'Not Recorded'} • Minister:{' '}
                  {baptism.minister || 'N/A'} ({baptism.place || 'N/A'})
                </div>
                <div>
                  <strong>Holy Eucharist:</strong> {eucharist.date || 'Not Recorded'} • Presiding:{' '}
                  {eucharist.minister || 'N/A'}
                </div>
                <div>
                  <strong>Confirmation:</strong> {confirmation.date || 'Not Recorded'} • Bishop:{' '}
                  {confirmation.minister || 'N/A'}
                </div>
                <div>
                  <strong>Holy Matrimony:</strong> {marriage.date || 'Not Recorded'} • Officiant:{' '}
                  {marriage.minister || 'N/A'}
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-[#1e1e1e] flex justify-between items-end text-xs">
              <div>
                <p className="font-bold">Parish Administrator</p>
                <p className="text-[10px] text-[#444748]">Parish Seal & Signature</p>
              </div>

              <div className="flex gap-2 font-sans">
                <button
                  onClick={() => setShowCertModal(false)}
                  className="px-3 py-1.5 text-xs text-[#444748] bg-gray-200 rounded hover:bg-gray-300 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-1.5 text-xs text-white bg-[#1e1e1e] rounded hover:bg-[#333333] cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">print</span>
                  Print Official Certificate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
