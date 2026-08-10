// =============================================================================
// ActivitiesView — parish activities panel: tithes, transfers & billed items
// -----------------------------------------------------------------------------
// Renders three sub-tabs (the ActivitiesSubTab union) above a single lifted
// `christians` array: RECEIVE PAYMENT (contribution entry), TRANSFER CHRISTIAN
// (record a move to another diocese/outstation), and BILLED ITEMS PAY (liturgical
// service receipts). No list fetching happens here — records come in via props.
//
// Data flow:
//   - `onRecordPayment` lifts a ContributionRecord up to App.tsx (client-side
//     state update only; the contribution API itself is not called here).
//   - `onTransferChristian` lifts the destination diocese/parish/outstation/SCC.
//   - BILLED ITEMS is the only sub-tab that hits the network: it POSTs a
//     BilledItemReceipt via billedItemsApi.create and, on success, displays the
//     server-persisted receipt in a printable modal.
//
// Cross-panel handoff: when a member is chosen elsewhere (e.g. Global Search),
// App.tsx passes them in as `selectedMember`. A useEffect forwards that
// selection into ALL three sub-tab forms so the payment / transfer / billed-item
// forms open pre-filled with the same parishioner.
//
// Internal state: `subTab` swaps the rendered panel; each panel owns its local
// form state (selected categories, monthly tithing tracker, transfer destination,
// billed item line). `showReceiptModal` + `generatedReceipt` gate the receipt
// overlay. All record ids are generated client-side with Date.now()/random.
// =============================================================================
// React core: component framework, local state, side-effect hooks, and refs
import React, { useState, useEffect, useRef } from 'react';
// Domain types: parishioner record, sub-tab union, contribution payload, and billed-item receipt
import { ChristianRecord, ActivitiesSubTab, ContributionRecord, BilledItemReceipt } from '../../types';
// API client for the Billed Items endpoint (only used by the BILLED ITEMS PAY sub-tab)
import { billedItemsApi } from '../../services/api';
// react-to-print: prints a cloned DOM node in a dedicated iframe
import { useReactToPrint } from 'react-to-print';
// Printable contribution receipt shown after a payment is recorded
import { ContributionReceipt } from '../printables';
// Permission hook — provides canEdit / canDelete / canView gates per module key
import { usePermissions } from '../../permissions';
// Offline context — pending sync count for the metrics sidebar
import { useOffline } from '../../context/OfflineContext';
// Configured parish identity (real name, not a placeholder)
import { useParishInfo } from '../../hooks/useParishInfo';

/**
 * Props for the ActivitiesView panel.
 */
interface ActivitiesViewProps {
  /** Full parishioner registry, shared with the parent and used to seed/search all sub-tab forms */
  christians: ChristianRecord[];
  /** Optional member handed in from another panel (cross-panel handoff) to prefill the active forms */
  selectedMember?: ChristianRecord | null;
  /** Which sub-tab to open on mount; defaults to 'receive_payment' */
  initialSubTab?: ActivitiesSubTab;
  /** Callback lifting a completed contribution (payment) record to the parent for storage */
  onRecordPayment: (payment: ContributionRecord) => void;
  /** Callback lifting a parish transfer (new diocese/parish/outstation/SCC) for a member */
  onTransferChristian: (memberId: string, dest: { diocese: string; parish: string; localChurch: string; scc: string }) => void;
}

// Functional component — the Activities & Contributions panel
export const ActivitiesView: React.FC<ActivitiesViewProps> = ({
  christians,
  selectedMember: propSelectedMember,
  initialSubTab = 'receive_payment',
  onRecordPayment,
  onTransferChristian
}) => {
  // Permission instance — checked before every submit to gate mutation buttons
  const perms = usePermissions();
  // Pending offline mutations — shown in the registry metrics sidebar
  const { pendingCount } = useOffline();
  // Configured parish identity — used on receipts instead of a hardcoded name
  const { parishName } = useParishInfo();
  // Controls which of the three sub-tab panels is currently rendered
  const [subTab, setSubTab] = useState<ActivitiesSubTab>(initialSubTab);

  // Receive Payment state
  // activeMember is seeded from the cross-panel handoff if present, else the
  // first registry entry; it becomes the implicit target of the contribution.
  const [activeMember, setActiveMember] = useState<ChristianRecord | null>(
    propSelectedMember || christians[0] || null
  );
  // Search query for the member-picker dropdown — empty string hides the dropdown
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  // Default selection is 10% Tithing so the most common contribution is pre-checked.
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['10% Tithing']);
  // Free-text for the "Other Contribution" category — persisted on the record
  const [otherCategoryText, setOtherCategoryText] = useState('');
  // FY 2024 tracker — JAN..APR default to PAID, the rest DUE; toggling marks a
  // month paid/unpaid and is embedded into the contribution payload.
  const [monthlyTracker, setMonthlyTracker] = useState<{ [month: string]: boolean }>({
    JAN: true,
    FEB: true,
    MAR: true,
    APR: true,
    MAY: false,
    JUN: false,
    JUL: false,
    AUG: false,
    SEP: false,
    OCT: false,
    NOV: false,
    DEC: false
  });
  // Payment amount in Kenya Shillings — defaults to a common tithe figure
  const [paymentAmountKES, setPaymentAmountKES] = useState<number>(1500);

  // Transfer Christian state
  // Member being transferred — defaults to the first registry entry
  const [transferMember, setTransferMember] = useState<ChristianRecord | null>(christians[0] || null);
  // Destination diocese — pre-filled with a placeholder value
  const [destDiocese, setDestDiocese] = useState('Diocese of Nakuru');
  // Destination parish — pre-filled with a placeholder value
  const [destParish, setDestParish] = useState('St. Joseph Parish');
  // Destination local church (outstation) — pre-filled with a placeholder value
  const [destLocalChurch, setDestLocalChurch] = useState('St. Monica Chapel');
  // Destination SCC (Small Christian Community) — pre-filled with a placeholder value
  const [destSCC, setDestSCC] = useState('St. Jude');

  // Billed Items state
  // Client type toggle — 'member' uses the parish registry; 'walkin' is an ad-hoc name
  const [billedClientType, setBilledClientType] = useState<'member' | 'walkin'>('member');
  // Selected parishioner for the billed-item receipt (only when billedClientType === 'member')
  const [billedMember, setBilledMember] = useState<ChristianRecord | null>(christians[0] || null);
  // Walk-in client name — only used when billedClientType === 'walkin'
  const [walkInName, setWalkInName] = useState('');
  // Item category for the billed item (e.g. Sacramental Supplies)
  const [itemCategory, setItemCategory] = useState('Sacramental Supplies');
  // Name of the item being billed (editable text field)
  const [selectedItemName, setSelectedItemName] = useState('Baptismal Candle');
  // Unit fee for the item in dollars
  const [unitFee, setUnitFee] = useState<number>(25.0);
  // Quantity of the item being billed — minimum is 1
  const [quantity, setQuantity] = useState<number>(1);

  // Receipt Modal State
  // Controls visibility of the printable receipt overlay after a successful POST
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  // The server-persisted receipt object — drives all fields in the receipt modal
  const [generatedReceipt, setGeneratedReceipt] = useState<BilledItemReceipt | null>(null);

  // Contribution receipt state — shown after RECEIVE PAYMENT is submitted
  const [showContributionReceipt, setShowContributionReceipt] = useState(false);
  // The last contribution lifted to the parent — drives the printable receipt
  const [lastContribution, setLastContribution] = useState<ContributionRecord | null>(null);
  // DOM ref targeted by react-to-print (cloned into the print iframe)
  const contributionReceiptRef = useRef<HTMLDivElement>(null);
  // Print handler — renders only the receipt card, not the whole app
  const handlePrintContribution = useReactToPrint({
    contentRef: contributionReceiptRef,
    documentTitle: 'ECCLESIA-Contribution-Receipt',
  });

  // Syncs the cross-panel member handoff into all three sub-tab forms. Without
  // this, a member chosen on another panel would not prefill the current tab.
  useEffect(() => {
    if (propSelectedMember) {
      setActiveMember(propSelectedMember);
      setTransferMember(propSelectedMember);
      setBilledMember(propSelectedMember);
    }
  }, [propSelectedMember]);

  // Toggle a contribution category on/off in the checked set.
  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  /** Toggle a month's PAID/DUE state inside the 10% tithing tracker. */
  const toggleMonth = (m: string) => {
    setMonthlyTracker({ ...monthlyTracker, [m]: !monthlyTracker[m] });
  };

  /**
   * Validates a member is selected, then builds a ContributionRecord from the
   * current form state (categories, tracker, amount) and lifts it to the parent.
   * The id is a timestamp-based key; the date is truncated to YYYY-MM-DD.
   */
  const handleReceivePaymentSubmit = (e: React.FormEvent) => {
    // Prevent the default browser form submission (page reload)
    e.preventDefault();
    // Guard: a contribution must target a real parishioner
    if (!activeMember) {
      alert('Please select a parishioner first.');
      return;
    }

    // Build the contribution payload from current form state
    const newContrib: ContributionRecord = {
      id: `pay_${Date.now()}`,
      christianId: activeMember.id,
      memberName: `${activeMember.baptismalName} ${activeMember.sirName}`,
      regNo: activeMember.regNo,
      categories: selectedCategories,
      otherCategory: otherCategoryText,
      monthlyTracker: monthlyTracker,
      amountKES: paymentAmountKES,
      date: new Date().toISOString().split('T')[0]
    };

    // Lift the record to App.tsx for client-side state update
    onRecordPayment(newContrib);
    // Open the printable receipt for this contribution
    setLastContribution(newContrib);
    setShowContributionReceipt(true);
  };

  /**
   * Builds the destination diocese/parish/outstation/SCC object and lifts it to
   * the parent via onTransferChristian. The member is chosen from the select.
   */
  const handleTransferSubmit = (e: React.FormEvent) => {
    // Prevent default form submission
    e.preventDefault();
    // Guard: a transfer must target a real parishioner
    if (!transferMember) return;
    // Lift the transfer destination to the parent for persistence
    onTransferChristian(transferMember.id, {
      diocese: destDiocese,
      parish: destParish,
      localChurch: destLocalChurch,
      scc: destSCC
    });
    // Confirm the transfer to the operator
    alert(`Transfer record updated for ${transferMember.baptismalName} ${transferMember.sirName} to ${destParish}!`);
  };

  /**
   * Assembles a BilledItemReceipt and POSTs it via billedItemsApi.create.
   * Edge cases: `christianId` is only set for registered members (walk-ins leave
   * it undefined — the field is optional in BilledItemReceipt); the member name
   * falls back to the walk-in name, then to the literal 'Walk-in Client'. On
   * success the persisted receipt (with server-generated id) drives the receipt
   * modal; failures surface via alert and console.
   */
  const handleBilledItemSubmit = async (e: React.FormEvent) => {
    // Prevent default form submission
    e.preventDefault();
    // Resolve the client display name — prefer registered member, fall back to walk-in
    const name = billedClientType === 'member' && billedMember
      ? `${billedMember.baptismalName} ${billedMember.sirName}`
      : walkInName || 'Walk-in Client';

    // Assemble the receipt payload with a client-generated id
    const receipt: BilledItemReceipt = {
      id: `REC-${Math.floor(100000 + Math.random() * 900000)}`,
      christianId: billedMember?.id,
      memberName: name,
      isWalkIn: billedClientType === 'walkin',
      category: itemCategory,
      item: selectedItemName,
      unitFee: unitFee,
      quantity: quantity,
      totalAmount: unitFee * quantity,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    };

    try {
      // POST the receipt to the server — the response includes the persisted id
      const persisted = await billedItemsApi.create(receipt);
      // Store the server-returned receipt and open the printable modal
      setGeneratedReceipt(persisted);
      setShowReceiptModal(true);
    } catch (error) {
      // Surface failures to the operator via console and alert
      console.error('Failed to save billed item', error);
      alert(error instanceof Error ? error.message : 'Failed to save billed item');
    }
  };

  // Client-side search over the registry: matches any name part or regNo against
  // the query. Empty query hides the dropdown entirely (see the JSX guard).
  const filteredMembers = christians.filter((c) => {
    const q = memberSearchQuery.toLowerCase();
    return (
      c.baptismalName.toLowerCase().includes(q) ||
      c.sirName.toLowerCase().includes(q) ||
      c.regNo.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Title & Sub-tabs Header */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {/* Page title — serif font for the ecclesiastical theme */}
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Activities & Contributions
          </h2>
          {/* Subtitle describing the three sub-tab functions */}
          <p className="text-xs text-[#444748]">
            Process parishioner tithes, transfer records, and billed liturgical service items
          </p>
        </div>

        {/* Sub-tab switcher — each button sets subTab and the active one is
            highlighted (dark bg) via the conditional Tailwind class below. */}
        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
          {/* RECEIVE PAYMENT tab — opens the contribution entry form */}
          <button
            onClick={() => setSubTab('receive_payment')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'receive_payment'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            RECEIVE PAYMENT
          </button>
          {/* TRANSFER CHRISTIAN tab — opens the parish transfer form */}
          <button
            onClick={() => setSubTab('transfer')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'transfer'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            TRANSFER CHRISTIAN
          </button>
          {/* BILLED ITEMS PAY tab — opens the liturgical service receipt form */}
          <button
            onClick={() => setSubTab('billed_items')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              subTab === 'billed_items'
                ? 'bg-[#1e1e1e] text-[#ffffff]'
                : 'text-[#444748] hover:text-[#1a1c1c]'
            }`}
          >
            BILLED ITEMS PAY
          </button>
        </div>
      </div>

      {/* 1. RECEIVE PAYMENT — pick a member, mark contribution categories,
          tick paid months in the tithing tracker, then submit the amount. */}
      {subTab === 'receive_payment' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          {/* Header row: title on the left, member search picker on the right */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#e1e3e3]">
            <div>
              {/* Section title — uppercase tracking for a tabular feel */}
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                CONTRIBUTION MANAGEMENT
              </h3>
              {/* Instructional subtitle for the contribution form */}
              <p className="text-xs text-[#444748]">
                Select member and check active contribution categories & monthly tithing tracker
              </p>
            </div>

            {/* Member Picker — search box that reveals a filtered dropdown;
                choosing a row sets activeMember and clears the query. */}
            <div className="w-full md:w-80 relative">
              {/* Search input — live-filters the registry as the operator types */}
              <input
                type="text"
                placeholder="Search parishioner..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
              {/* Dropdown — only visible when there is a non-empty search query */}
              {memberSearchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e1e3e3] rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                  {/* One row per matching parishioner — clicking selects them */}
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveMember(m);
                        setMemberSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#f4f3f3] border-b border-[#f4f3f3] cursor-pointer"
                    >
                      {/* Parishioner full name */}
                      <div className="font-bold text-[#1a1c1c]">
                        {m.baptismalName} {m.secondName} {m.sirName}
                      </div>
                      {/* Registration number and SCC membership */}
                      <div className="text-[10px] text-[#444748]">
                        {m.regNo} • {m.scc}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Selected Member Card — recap of the payment target; only
              rendered when a member is actually selected (null-safe). */}
          {activeMember && (
            <div className="p-4 bg-[#f9f9f9] border border-[#e1e3e3] rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Avatar circle — initials of the parishioner's first and surname */}
                <div className="w-10 h-10 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center font-bold text-sm">
                  {activeMember.baptismalName[0]}
                  {activeMember.sirName[0]}
                </div>
                <div>
                  {/* Full name of the selected parishioner */}
                  <div className="text-sm font-bold text-[#1a1c1c]">
                    {activeMember.baptismalName} {activeMember.secondName} {activeMember.sirName}
                  </div>
                  {/* Registration number, phone, and SCC membership */}
                  <div className="text-xs text-[#444748] flex items-center gap-2">
                    <span className="font-mono bg-[#eeeeee] px-1 rounded text-[10px]">
                      {activeMember.regNo}
                    </span>
                    <span>•</span>
                    <span>Phone: {activeMember.phone}</span>
                    <span>•</span>
                    <span>SCC: {activeMember.scc}</span>
                  </div>
                </div>
              </div>
              {/* Status badge indicating this member is targeted for payment */}
              <span className="px-2.5 py-1 text-[10px] bg-emerald-100 text-emerald-800 rounded font-bold">
                Selected for Payment
              </span>
            </div>
          )}

          {/* Contribution form — categories, tithing tracker, amount, and submit */}
          <form onSubmit={handleReceivePaymentSubmit} className="space-y-6">
            {/* Category Checkboxes Grid */}
            <div>
              {/* Label for the contribution categories section */}
              <label className="block text-xs font-bold text-[#1a1c1c] uppercase tracking-wider mb-3">
                Contribution Categories
              </label>
              {/* Contribution Categories — checkbox tiles driven by toggleCategory;
                  the checked (dark) vs unchecked style comes from the conditional
                  Tailwind classes. Picking 'Other Contribution' reveals a free-text
                  input whose value is persisted on the record. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {/* List of available contribution categories */}
                {[
                  '10% Tithing',
                  'Jumuiya Contribution',
                  'Diocesan Support',
                  'Parish Project',
                  'Thanks Giving',
                  'Mass Intention',
                  'Other Contribution'
                ].map((cat) => {
                  const isChecked = selectedCategories.includes(cat);
                  return (
                    <label
                      key={cat}
                      className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2.5 cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-[#1e1e1e] text-[#ffffff] border-[#1e1e1e]'
                          : 'bg-[#f4f3f3] text-[#1a1c1c] border-[#e1e3e3] hover:border-[#1e1e1e]'
                      }`}
                    >
                      {/* Hidden checkbox — the label itself is the visual toggle */}
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCategory(cat)}
                        className="hidden"
                      />
                      {/* Material icon reflecting the checked/unchecked state */}
                      <span className="material-symbols-outlined text-sm">
                        {isChecked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      {/* Category label text */}
                      <span>{cat}</span>
                    </label>
                  );
                })}
              </div>

              {/* Conditional free-text input — only shown when "Other Contribution" is selected */}
              {selectedCategories.includes('Other Contribution') && (
                <div className="mt-3">
                  <input
                    type="text"
                    placeholder="Specify other contribution details..."
                    value={otherCategoryText}
                    onChange={(e) => setOtherCategoryText(e.target.value)}
                    className="w-full max-w-md px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>
              )}
            </div>

            {/* 10% Monthly Tracker — PAID (emerald) vs DUE (neutral) tiles;
                each click flips the month in monthlyTracker, and the payload
                snapshot stores the entire map. */}
            <div>
              {/* Section label for the monthly tithing tracker */}
              <label className="block text-xs font-bold text-[#1a1c1c] uppercase tracking-wider mb-2">
                10% Tithing Monthly Tracker (FY 2024)
              </label>
              {/* 12-column grid of month tiles — one per month of the fiscal year */}
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-12 gap-2">
                {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map(
                  (month) => {
                    const isPaid = monthlyTracker[month];
                    return (
                      <button
                        type="button"
                        key={month}
                        onClick={() => toggleMonth(month)}
                        className={`p-2 rounded border text-center text-xs font-bold transition-all cursor-pointer ${
                          isPaid
                            ? 'bg-emerald-800 text-white border-emerald-900 shadow-2xs'
                            : 'bg-[#f4f3f3] text-[#444748] border-[#e1e3e3] hover:border-[#1e1e1e]'
                        }`}
                      >
                        {/* Three-letter month abbreviation */}
                        {month}
                        {/* Status label below the month */}
                        <div className="text-[9px] font-normal mt-0.5">
                          {isPaid ? 'PAID' : 'DUE'}
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            {/* Amount Field & Submission */}
            <div className="pt-4 border-t border-[#e1e3e3] flex flex-col sm:flex-row items-end sm:items-center justify-between gap-4">
              <div>
                {/* Label for the payment amount input */}
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                  Payment Amount (KES)
                </label>
                {/* Amount input with KES prefix */}
                <div className="relative w-48">
                  {/* KES currency prefix inside the input */}
                  <span className="absolute left-3 top-2 text-xs font-bold text-[#444748]">
                    KES
                  </span>
                  <input
                    type="number"
                    value={paymentAmountKES}
                    onChange={(e) => setPaymentAmountKES(Number(e.target.value))}
                    className="w-full pl-12 pr-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-sm font-bold text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>
              </div>

              {/* Action buttons — Clear Form and Submit Payment */}
              <div className="flex gap-3">
                {/* Clear Form — resets categories to default and amount to 1000 */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategories(['10% Tithing']);
                    setPaymentAmountKES(1000);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded transition-colors cursor-pointer"
                >
                  Clear Form
                </button>
                {/* Submit Payment — disabled when the user lacks edit permission for activities */}
                <button
                  type="submit"
                  disabled={!perms.canEdit('activities')}
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs opacity-50 cursor-not-allowed flex items-center gap-2"
                >
                  {/* Receipt icon */}
                  <span className="material-symbols-outlined text-sm">receipt_long</span>
                  Submit Payment
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 2. TRANSFER CHRISTIAN — select a member, enter the destination
          diocese/parish/outstation/SCC, and lift the move to the parent.
          The sidebar widgets are static metric cards (no live data). */}
      {subTab === 'transfer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Transfer form card — takes 2 columns on large screens */}
          <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
            {/* Section header */}
            <div className="border-b border-[#e1e3e3] pb-4">
              {/* Form title */}
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                MEMBER PARISH TRANSFER FORM
              </h3>
              {/* Instructional subtitle */}
              <p className="text-xs text-[#444748] mt-1">
                Record official transfers to another diocese or local church outstation
              </p>
            </div>

            {/* Transfer form — member select + destination fields + submit */}
            <form onSubmit={handleTransferSubmit} className="space-y-6">
              {/* Select Member to Transfer — options are drawn from the lifted
                  christians array; picking one swaps transferMember, which is
                  also pre-synced by the cross-panel selectedMember effect. */}
              <div>
                {/* Label for the member selector */}
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Select Parishioner to Transfer
                </label>
                {/* Dropdown listing all parishioners with name, regNo, and SCC */}
                <select
                  value={transferMember?.id}
                  onChange={(e) => {
                    const found = christians.find((c) => c.id === e.target.value);
                    if (found) setTransferMember(found);
                  }}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  {/* One option per parishioner in the registry */}
                  {christians.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.baptismalName} {c.sirName} ({c.regNo}) - {c.scc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Details — four text inputs in a 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Diocese the member is transferring to */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Diocese Transferred To
                  </label>
                  <input
                    type="text"
                    value={destDiocese}
                    onChange={(e) => setDestDiocese(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* Parish the member is transferring to */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Parish Transferred To
                  </label>
                  <input
                    type="text"
                    value={destParish}
                    onChange={(e) => setDestParish(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* Local church (outstation) the member is transferring to */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Local Church Transferred To
                  </label>
                  <input
                    type="text"
                    value={destLocalChurch}
                    onChange={(e) => setDestLocalChurch(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* SCC (Jumuiya / Small Christian Community) the member is transferring to */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    SCC (Jumuiya) Transferred To
                  </label>
                  <input
                    type="text"
                    value={destSCC}
                    onChange={(e) => setDestSCC(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>
              </div>

              {/* Submit button — right-aligned, disabled when permission lacks edit */}
              <div className="pt-4 border-t border-[#e1e3e3] flex justify-end">
                <button
                  type="submit"
                  disabled={!perms.canEdit('activities')}
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs opacity-50 cursor-not-allowed flex items-center gap-2"
                >
                  {/* Move icon */}
                  <span className="material-symbols-outlined text-sm">move_item</span>
                  Save & Update Status
                </button>
              </div>
            </form>
          </div>

          {/* Right Stats Sidebar Widgets — live registry metrics (no mock data) */}
          <div className="space-y-4">
            {/* Registry Metrics card */}
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-4">
              {/* Card title */}
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                REGISTRY METRICS
              </h4>
              {/* Three stat rows — registered, active, pending sync */}
              <div className="space-y-3">
                {/* Registered members — real count from the lifted registry */}
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Registered Members</div>
                  <div className="text-xl font-bold text-[#1a1c1c] mt-0.5">{christians.length}</div>
                </div>
                {/* Active members — real count from the lifted registry */}
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Active Members</div>
                  <div className="text-xl font-bold text-[#1a1c1c] mt-0.5">
                    {christians.filter((c) => c.status === 'Active').length}
                  </div>
                </div>
                {/* Pending offline sync — real count from the OfflineContext queue */}
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Pending Sync</div>
                  <div className={`text-xl font-bold mt-0.5 ${pendingCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {pendingCount} Pending
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. BILLED ITEMS PAY — step-by-step flow: lookup client, choose item,
          set quantity, then POST the receipt via billedItemsApi.create. */}
      {subTab === 'billed_items' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-8">
          {/* Multi-step form: Client Lookup → Item Selection → Transaction Details */}
          <form onSubmit={handleBilledItemSubmit} className="space-y-8">
            {/* Step 01. Christian Lookup */}
            <div className="space-y-3">
              {/* Step header with numbered badge */}
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                {/* Step number badge — dark circle with white text */}
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  1
                </span>
                <span>Christian Lookup</span>
              </div>

              {/* Client-type toggle — 'member' shows a registry select; 'walkin'
                  shows a free-text name field. The receipt's christianId is only
                  populated for members (walk-ins keep it undefined). */}
              <div className="flex items-center gap-6">
                {/* Radio button — Registered Parishioner */}
                <label className="flex items-center gap-2 text-xs text-[#1a1c1c] font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="clientType"
                    checked={billedClientType === 'member'}
                    onChange={() => setBilledClientType('member')}
                    className="accent-[#1e1e1e]"
                  />
                  Registered Parishioner
                </label>
                {/* Radio button — Walk-in Client */}
                <label className="flex items-center gap-2 text-xs text-[#1a1c1c] font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="clientType"
                    checked={billedClientType === 'walkin'}
                    onChange={() => setBilledClientType('walkin')}
                    className="accent-[#1e1e1e]"
                  />
                  Walk-in Client
                </label>
              </div>

              {/* Conditional rendering: member select or walk-in name input */}
              {billedClientType === 'member' ? (
                <div className="max-w-md">
                  {/* Label for the member selector */}
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Select Member
                  </label>
                  {/* Dropdown of all parishioners */}
                  <select
                    value={billedMember?.id}
                    onChange={(e) => {
                      const found = christians.find((c) => c.id === e.target.value);
                      if (found) setBilledMember(found);
                    }}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  >
                    {/* One option per registered parishioner */}
                    {christians.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.baptismalName} {c.sirName} ({c.regNo})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="max-w-md">
                  {/* Label for the walk-in name field */}
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Walk-In Client Name
                  </label>
                  {/* Free-text input for the walk-in client's full name */}
                  <input
                    type="text"
                    placeholder="Enter client full name..."
                    value={walkInName}
                    onChange={(e) => setWalkInName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>
              )}
            </div>

            {/* Step 02. Billed Item Selection */}
            <div className="space-y-4">
              {/* Step header with numbered badge */}
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                {/* Step number badge */}
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  2
                </span>
                <span>Billed Item Selection</span>
              </div>

              {/* Item category and item name fields in a 2-column grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Item category dropdown */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Item Category
                  </label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  >
                    {/* Four predefined item categories */}
                    <option value="Sacramental Supplies">Sacramental Supplies</option>
                    <option value="Liturgical Books">Liturgical Books</option>
                    <option value="Mass Intentions">Mass Intentions</option>
                    <option value="Certificates & Frames">Certificates & Frames</option>
                  </select>
                </div>

                {/* Item name — free-text input */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Item Name
                  </label>
                  <input
                    type="text"
                    value={selectedItemName}
                    onChange={(e) => setSelectedItemName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>
              </div>

              {/* Frequently Billed Quick Buttons */}
              {/* Frequently Billed Quick Buttons — one-click presets that fill
                  the item name, unit fee, and category fields together. */}
              <div>
                {/* Section label */}
                <label className="block text-[10px] font-bold text-[#444748] uppercase tracking-wider mb-2">
                  Frequently Billed Items
                </label>
                {/* Row of quick-preset buttons */}
                <div className="flex flex-wrap gap-2">
                  {/* Four preset items — each fills name, price, and category */}
                  {[
                    { name: 'Baptismal Candle', price: 25.0, cat: 'Sacramental Supplies' },
                    { name: 'Hymnal Standard', price: 15.0, cat: 'Liturgical Books' },
                    { name: 'Mass Intention Offering', price: 10.0, cat: 'Mass Intentions' },
                    { name: 'Sacrament Certificate Frame', price: 30.0, cat: 'Certificates & Frames' }
                  ].map((quick) => (
                    <button
                      key={quick.name}
                      type="button"
                      onClick={() => {
                        setSelectedItemName(quick.name);
                        setUnitFee(quick.price);
                        setItemCategory(quick.cat);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold bg-[#f4f3f3] hover:bg-[#eeeeee] border border-[#e1e3e3] rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>{quick.name}</span>
                      <span className="font-bold text-[#1e1e1e]">KES {quick.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 03. Transaction Details */}
            <div className="space-y-4">
              {/* Step header with numbered badge */}
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                {/* Step number badge */}
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  3
                </span>
                <span>Transaction Details</span>
              </div>

              {/* Transaction details — unit fee and quantity drive the live
                  'Amount Due' total shown below (unitFee * quantity). Quantity
                  is clamped to a minimum of 1. */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                {/* Unit fee input — supports fractional cents */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Unit Fee (KES)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitFee}
                    onChange={(e) => setUnitFee(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* Quantity input — minimum 1 enforced by Math.max */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

                {/* Computed total — read-only display of unitFee × quantity */}
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Amount Due (KES)
                  </label>
                  <div className="px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-sm font-bold text-[#1e1e1e]">
                    KES {(unitFee * quantity).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action — right-aligned, permission-gated */}
            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end">
              <button
                type="submit"
                disabled={!perms.canEdit('activities')}
                className="px-6 py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs opacity-50 cursor-not-allowed flex items-center gap-2"
              >
                {/* Print icon */}
                <span className="material-symbols-outlined text-base">print</span>
                Generate Official Receipt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE RECEIPT MODAL — shown only after a successful POST; renders
          the persisted receipt (server id + client fields) and offers browser
          print. isWalkIn receipts have no christianId, so the modal only ever
          reads display fields. */}
      {showReceiptModal && generatedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          {/* White receipt card — centered, shadowed, scrollable */}
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            {/* Receipt header — parish name, subtitle, and receipt number/date */}
            <div className="text-center border-b border-[#e1e3e3] pb-4 space-y-1">
              <div className="text-xl font-bold font-serif text-[#1a1c1c]">† {parishName || 'ECCLESIA PARISH'}</div>
              <p className="text-[10px] text-[#444748] uppercase tracking-widest">
                Official Sacrament & Service Receipt
              </p>
              <p className="text-[10px] font-mono text-[#1e1e1e]">
                Receipt No: {generatedReceipt.id} • {generatedReceipt.date}
              </p>
            </div>

            {/* Receipt body — line items as label/value pairs */}
            <div className="space-y-2 text-xs">
              {/* Client name */}
              <div className="flex justify-between">
                <span className="text-[#444748]">Client Name:</span>
                <span className="font-bold text-[#1a1c1c]">{generatedReceipt.memberName}</span>
              </div>
              {/* Item category */}
              <div className="flex justify-between">
                <span className="text-[#444748]">Category:</span>
                <span>{generatedReceipt.category}</span>
              </div>
              {/* Item name */}
              <div className="flex justify-between">
                <span className="text-[#444748]">Item Issued:</span>
                <span className="font-semibold">{generatedReceipt.item}</span>
              </div>
              {/* Unit price × quantity */}
              <div className="flex justify-between">
                <span className="text-[#444748]">Unit Price × Qty:</span>
                <span>KES {generatedReceipt.unitFee.toFixed(2)} × {generatedReceipt.quantity}</span>
              </div>
              {/* Total amount paid — bold and separated by a border */}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-[#e1e3e3] text-[#1e1e1e]">
                <span>Total Amount Paid:</span>
                <span>KES {generatedReceipt.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Footer message — pastoral gratitude */}
            <div className="text-center text-[10px] italic text-[#444748] pt-2">
              "Thank you for supporting the sanctuary and mission of our Parish."
            </div>

            {/* Action buttons — Close and Print Receipt */}
            <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
              {/* Close — dismisses the modal */}
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded cursor-pointer"
              >
                Close
              </button>
              {/* Print Receipt — triggers the browser's print dialog, then closes */}
              <button
                onClick={() => {
                  window.print();
                  setShowReceiptModal(false);
                }}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">print</span>
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTRIBUTION RECEIPT MODAL — opened after RECEIVE PAYMENT is recorded;
          renders the printable ContributionReceipt and prints it via
          react-to-print (only the receipt card reaches the printer). */}
      {showContributionReceipt && lastContribution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            {/* Printable receipt card — react-to-print targets this ref */}
            <ContributionReceipt
              ref={contributionReceiptRef}
              receipt={lastContribution}
              parishName={parishName || 'ECCLESIA PARISH'}
            />

            {/* Action buttons — Close and Print Receipt */}
            <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
              <button
                onClick={() => setShowContributionReceipt(false)}
                className="px-4 py-1.5 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => handlePrintContribution()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-xs">print</span>
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
