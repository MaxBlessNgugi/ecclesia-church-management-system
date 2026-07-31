import React, { useState, useEffect } from 'react';
import { ChristianRecord, ActivitiesSubTab, ContributionRecord, BilledItemReceipt } from '../../types';

interface ActivitiesViewProps {
  christians: ChristianRecord[];
  selectedMember?: ChristianRecord | null;
  initialSubTab?: ActivitiesSubTab;
  onRecordPayment: (payment: ContributionRecord) => void;
  onTransferChristian: (memberId: string, dest: { diocese: string; parish: string; localChurch: string; scc: string }) => void;
}

export const ActivitiesView: React.FC<ActivitiesViewProps> = ({
  christians,
  selectedMember: propSelectedMember,
  initialSubTab = 'receive_payment',
  onRecordPayment,
  onTransferChristian
}) => {
  const [subTab, setSubTab] = useState<ActivitiesSubTab>(initialSubTab);

  // Receive Payment state
  const [activeMember, setActiveMember] = useState<ChristianRecord | null>(
    propSelectedMember || christians[0] || null
  );
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['10% Tithing']);
  const [otherCategoryText, setOtherCategoryText] = useState('');
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
  const [paymentAmountKES, setPaymentAmountKES] = useState<number>(1500);

  // Transfer Christian state
  const [transferMember, setTransferMember] = useState<ChristianRecord | null>(christians[0] || null);
  const [destDiocese, setDestDiocese] = useState('Diocese of Nakuru');
  const [destParish, setDestParish] = useState('St. Joseph Parish');
  const [destLocalChurch, setDestLocalChurch] = useState('St. Monica Chapel');
  const [destSCC, setDestSCC] = useState('St. Jude');

  // Billed Items state
  const [billedClientType, setBilledClientType] = useState<'member' | 'walkin'>('member');
  const [billedMember, setBilledMember] = useState<ChristianRecord | null>(christians[0] || null);
  const [walkInName, setWalkInName] = useState('');
  const [itemCategory, setItemCategory] = useState('Sacramental Supplies');
  const [selectedItemName, setSelectedItemName] = useState('Baptismal Candle');
  const [unitFee, setUnitFee] = useState<number>(25.0);
  const [quantity, setQuantity] = useState<number>(1);

  // Receipt Modal State
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [generatedReceipt, setGeneratedReceipt] = useState<BilledItemReceipt | null>(null);

  useEffect(() => {
    if (propSelectedMember) {
      setActiveMember(propSelectedMember);
      setTransferMember(propSelectedMember);
      setBilledMember(propSelectedMember);
    }
  }, [propSelectedMember]);

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const toggleMonth = (m: string) => {
    setMonthlyTracker({ ...monthlyTracker, [m]: !monthlyTracker[m] });
  };

  const handleReceivePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMember) {
      alert('Please select a parishioner first.');
      return;
    }

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

    onRecordPayment(newContrib);
    alert(`Payment of KES ${paymentAmountKES.toLocaleString()} recorded for ${activeMember.baptismalName} ${activeMember.sirName}!`);
  };

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferMember) return;
    onTransferChristian(transferMember.id, {
      diocese: destDiocese,
      parish: destParish,
      localChurch: destLocalChurch,
      scc: destSCC
    });
    alert(`Transfer record updated for ${transferMember.baptismalName} ${transferMember.sirName} to ${destParish}!`);
  };

  const handleBilledItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = billedClientType === 'member' && billedMember
      ? `${billedMember.baptismalName} ${billedMember.sirName}`
      : walkInName || 'Walk-in Client';

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

    setGeneratedReceipt(receipt);
    setShowReceiptModal(true);
  };

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
          <h2 className="text-xl font-serif font-bold text-[#1a1c1c]">
            Activities & Contributions
          </h2>
          <p className="text-xs text-[#444748]">
            Process parishioner tithes, transfer records, and billed liturgical service items
          </p>
        </div>

        <div className="flex items-center gap-1 bg-[#f4f3f3] p-1 rounded-lg border border-[#e1e3e3]">
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

      {/* 1. RECEIVE PAYMENT */}
      {subTab === 'receive_payment' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-[#e1e3e3]">
            <div>
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                CONTRIBUTION MANAGEMENT
              </h3>
              <p className="text-xs text-[#444748]">
                Select member and check active contribution categories & monthly tithing tracker
              </p>
            </div>

            {/* Member Picker */}
            <div className="w-full md:w-80 relative">
              <input
                type="text"
                placeholder="Search parishioner..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
              />
              {memberSearchQuery.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e1e3e3] rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveMember(m);
                        setMemberSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-[#f4f3f3] border-b border-[#f4f3f3] cursor-pointer"
                    >
                      <div className="font-bold text-[#1a1c1c]">
                        {m.baptismalName} {m.secondName} {m.sirName}
                      </div>
                      <div className="text-[10px] text-[#444748]">
                        {m.regNo} • {m.scc}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Selected Member Card */}
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
              <span className="px-2.5 py-1 text-[10px] bg-emerald-100 text-emerald-800 rounded font-bold">
                Selected for Payment
              </span>
            </div>
          )}

          <form onSubmit={handleReceivePaymentSubmit} className="space-y-6">
            {/* Category Checkboxes Grid */}
            <div>
              <label className="block text-xs font-bold text-[#1a1c1c] uppercase tracking-wider mb-3">
                Contribution Categories
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCategory(cat)}
                        className="hidden"
                      />
                      <span className="material-symbols-outlined text-sm">
                        {isChecked ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                      <span>{cat}</span>
                    </label>
                  );
                })}
              </div>

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

            {/* 10% Monthly Tracker Checkboxes */}
            <div>
              <label className="block text-xs font-bold text-[#1a1c1c] uppercase tracking-wider mb-2">
                10% Tithing Monthly Tracker (FY 2024)
              </label>
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
                        {month}
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
                <label className="block text-xs font-bold text-[#1a1c1c] mb-1">
                  Payment Amount (KES)
                </label>
                <div className="relative w-48">
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

              <div className="flex gap-3">
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
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">receipt_long</span>
                  Submit Payment
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* 2. TRANSFER CHRISTIAN */}
      {subTab === 'transfer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
            <div className="border-b border-[#e1e3e3] pb-4">
              <h3 className="text-sm font-bold text-[#1a1c1c] uppercase tracking-wide">
                MEMBER PARISH TRANSFER FORM
              </h3>
              <p className="text-xs text-[#444748] mt-1">
                Record official transfers to another diocese or local church outstation
              </p>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-6">
              {/* Select Member to Transfer */}
              <div>
                <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                  Select Parishioner to Transfer
                </label>
                <select
                  value={transferMember?.id}
                  onChange={(e) => {
                    const found = christians.find((c) => c.id === e.target.value);
                    if (found) setTransferMember(found);
                  }}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                >
                  {christians.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.baptismalName} {c.sirName} ({c.regNo}) - {c.scc}
                    </option>
                  ))}
                </select>
              </div>

              {/* Destination Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

              <div className="pt-4 border-t border-[#e1e3e3] flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">move_item</span>
                  Save & Update Status
                </button>
              </div>
            </form>
          </div>

          {/* Right Stats Sidebar Widgets */}
          <div className="space-y-4">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                PARISH TRANSFER METRICS
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Transfer History</div>
                  <div className="text-xl font-bold text-[#1a1c1c] mt-0.5">124 Members</div>
                </div>
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Active Roll</div>
                  <div className="text-xl font-bold text-[#1a1c1c] mt-0.5">2,850 Members</div>
                </div>
                <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3]">
                  <div className="text-[10px] text-[#444748] uppercase">Pending Diocesan Sync</div>
                  <div className="text-xl font-bold text-emerald-700 mt-0.5">0 Pending</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. BILLED ITEMS PAY */}
      {subTab === 'billed_items' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-8">
          <form onSubmit={handleBilledItemSubmit} className="space-y-8">
            {/* Step 01. Christian Lookup */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  1
                </span>
                <span>Christian Lookup</span>
              </div>

              <div className="flex items-center gap-6">
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

              {billedClientType === 'member' ? (
                <div className="max-w-md">
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Select Member
                  </label>
                  <select
                    value={billedMember?.id}
                    onChange={(e) => {
                      const found = christians.find((c) => c.id === e.target.value);
                      if (found) setBilledMember(found);
                    }}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  >
                    {christians.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.baptismalName} {c.sirName} ({c.regNo})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="max-w-md">
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Walk-In Client Name
                  </label>
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
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  2
                </span>
                <span>Billed Item Selection</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Item Category
                  </label>
                  <select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  >
                    <option value="Sacramental Supplies">Sacramental Supplies</option>
                    <option value="Liturgical Books">Liturgical Books</option>
                    <option value="Mass Intentions">Mass Intentions</option>
                    <option value="Certificates & Frames">Certificates & Frames</option>
                  </select>
                </div>

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
              <div>
                <label className="block text-[10px] font-bold text-[#444748] uppercase tracking-wider mb-2">
                  Frequently Billed Items
                </label>
                <div className="flex flex-wrap gap-2">
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
                      <span className="font-bold text-[#1e1e1e]">${quick.price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 03. Transaction Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-bold text-[#1a1c1c] uppercase tracking-wide border-b border-[#e1e3e3] pb-2">
                <span className="w-6 h-6 rounded-full bg-[#1e1e1e] text-white flex items-center justify-center text-xs">
                  3
                </span>
                <span>Transaction Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Unit Fee ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitFee}
                    onChange={(e) => setUnitFee(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
                  />
                </div>

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

                <div>
                  <label className="block text-xs font-medium text-[#1a1c1c] mb-1">
                    Amount Due ($)
                  </label>
                  <div className="px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-sm font-bold text-[#1e1e1e]">
                    ${(unitFee * quantity).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-[#e1e3e3] flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded transition-colors shadow-2xs cursor-pointer flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">print</span>
                Generate Official Receipt
              </button>
            </div>
          </form>
        </div>
      )}

      {/* PRINTABLE RECEIPT MODAL */}
      {showReceiptModal && generatedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#000000]/50 backdrop-blur-xs">
          <div className="bg-white border border-[#e1e3e3] rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="text-center border-b border-[#e1e3e3] pb-4 space-y-1">
              <div className="text-xl font-bold font-serif text-[#1a1c1c]">† ST. MARY'S PARISH</div>
              <p className="text-[10px] text-[#444748] uppercase tracking-widest">
                Official Sacrament & Service Receipt
              </p>
              <p className="text-[10px] font-mono text-[#1e1e1e]">
                Receipt No: {generatedReceipt.id} • {generatedReceipt.date}
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#444748]">Client Name:</span>
                <span className="font-bold text-[#1a1c1c]">{generatedReceipt.memberName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444748]">Category:</span>
                <span>{generatedReceipt.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444748]">Item Issued:</span>
                <span className="font-semibold">{generatedReceipt.item}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#444748]">Unit Price × Qty:</span>
                <span>${generatedReceipt.unitFee.toFixed(2)} × {generatedReceipt.quantity}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-[#e1e3e3] text-[#1e1e1e]">
                <span>Total Amount Paid:</span>
                <span>${generatedReceipt.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="text-center text-[10px] italic text-[#444748] pt-2">
              "Thank you for supporting the sanctuary and mission of St. Mary's Parish."
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#e1e3e3]">
              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-[#444748] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded cursor-pointer"
              >
                Close
              </button>
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
    </div>
  );
};
