import React, { useState, useEffect } from 'react';
import { ReportsSubTab, SacramentReportRow, ContributionReportRow, SalesReportRow, CashierReportRow } from '../../types';
import { reportsApi } from '../../services/api';

export const ReportsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<ReportsSubTab>('sacraments');

  // Sacrament report state
  const [sacramentType, setSacramentType] = useState('baptism');
  const [localChurch, setLocalChurch] = useState('');
  const [sccFilter, setSccFilter] = useState('');

  const [sacramentPreviewData, setSacramentPreviewData] = useState<SacramentReportRow[]>([]);

  // Contributions report state
  const [contributionRows, setContributionRows] = useState<ContributionReportRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [monthFilter, setMonthFilter] = useState('');

  // Sales report state
  const [salesRows, setSalesRows] = useState<SalesReportRow[]>([]);

  // Cashiers report state
  const [cashierRows, setCashierRows] = useState<CashierReportRow[]>([]);

  const [generatedPdf, setGeneratedPdf] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [sacraments, contributions, sales, cashiers] = await Promise.all([
          reportsApi.sacraments({ sacramentType: 'baptism' }),
          reportsApi.contributions(),
          reportsApi.sales(),
          reportsApi.cashiers()
        ]);
        setSacramentPreviewData(sacraments);
        setContributionRows(contributions);
        setSalesRows(sales);
        setCashierRows(cashiers);
      } catch (error) {
        console.error('Failed to load reports', error);
      }
    })();
  }, []);

  const handleGenerateSacramentReport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const rows = await reportsApi.sacraments({
        sacramentType,
        localChurch: localChurch || undefined,
        scc: sccFilter || undefined
      });
      setSacramentPreviewData(rows);
      setGeneratedPdf(`${sacramentType}_Registry_${(localChurch || 'Parish').replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`);
    } catch (error) {
      console.error('Failed to generate sacrament report', error);
      alert(error instanceof Error ? error.message : 'Failed to generate sacrament report');
    }
  };

  const handleLoadContributions = async () => {
    try {
      const rows = await reportsApi.contributions({
        category: categoryFilter === 'All' ? undefined : categoryFilter,
        month: monthFilter || undefined
      });
      setContributionRows(rows);
    } catch (error) {
      console.error('Failed to load contribution report', error);
      alert(error instanceof Error ? error.message : 'Failed to load contribution report');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Reporting Panel</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Financial auditing oversight, sacrament data extraction, and parish-wide collection metrics."
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base">print</span>
            Master Print
          </button>
        </div>
      </div>

      {/* Sub-tab Links */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase overflow-x-auto">
        {(['sacraments', 'contributions', 'sales', 'cashiers'] as ReportsSubTab[]).map((tab) => {
          const labels: Record<ReportsSubTab, string> = {
            sacraments: 'SACRAMENT REPORTS',
            contributions: 'CONTRIBUTIONS',
            sales: 'SALES',
            cashiers: 'CASHIERS'
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

      {/* 1. SACRAMENT REPORTS */}
      {activeSubTab === 'sacraments' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Form Box (8 Cols) */}
            <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
              <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
                Sacrament Data Extraction
              </h3>
              <p className="text-xs text-[#444748]">
                Configure specialized parameters to extract records for liturgy and archival purposes. All generated reports conform to the parish's official registry format.
              </p>

              <form onSubmit={handleGenerateSacramentReport} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">SACRAMENT TYPE</label>
                    <select
                      value={sacramentType}
                      onChange={(e) => setSacramentType(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    >
                      <option value="baptism">Baptism</option>
                      <option value="eucharist">First Communion</option>
                      <option value="confirmation">Confirmation</option>
                      <option value="marriage">Marriage</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">LOCAL CHURCH</label>
                    <select
                      value={localChurch}
                      onChange={(e) => setLocalChurch(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    >
                      <option value="Main Parish Cathedral">Main Parish Cathedral</option>
                      <option value="St. Monica Chapel">St. Monica Chapel</option>
                      <option value="St. Joseph Outstation">St. Joseph Outstation</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">FROM DATE</label>
                    <input
                      type="date"
                      defaultValue="2023-01-01"
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">TO DATE</label>
                    <input
                      type="date"
                      defaultValue="2024-12-31"
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#1a1c1c] font-medium mb-1">SCC (JUMUIYA) SELECTOR</label>
                    <select
                      value={sccFilter}
                      onChange={(e) => setSccFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                    >
                      <option value="All Jumuiyas">All Jumuiyas</option>
                      <option value="St. Jude SCC">St. Jude SCC</option>
                      <option value="St. Monica SCC">St. Monica SCC</option>
                      <option value="St. Anne SCC">St. Anne SCC</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-3 border-t border-[#e1e3e3]">
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">description</span>
                    Generate Report
                  </button>

                  <button
                    type="button"
                    onClick={() => alert("Exporting formatted PDF report...")}
                    className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    Export PDF
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Recent Extractions (4 Cols) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
                <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                  RECENT EXTRACTIONS
                </h4>

                <div className="space-y-2 text-xs">
                  {[
                    'Baptism_Registry_Q3.pdf',
                    'Marriage_Annals_2024.pdf',
                    'Conf_St_Monica_Oct.pdf'
                  ].map((doc, idx) => (
                    <div key={idx} className="p-2.5 bg-[#f4f3f3] rounded border border-[#e1e3e3] flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-[#1e1e1e]">picture_as_pdf</span>
                        <span className="font-mono text-[11px] text-[#1a1c1c]">{doc}</span>
                      </div>
                      <button
                        onClick={() => alert(`Downloading ${doc}`)}
                        className="text-[#1e1e1e] hover:underline text-[10px] font-bold"
                      >
                        Download
                      </button>
                    </div>
                  ))}

                  {generatedPdf && (
                    <div className="p-2.5 bg-emerald-50 rounded border border-emerald-300 flex justify-between items-center text-xs animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-base text-emerald-700">check_circle</span>
                        <span className="font-mono text-[11px] text-emerald-900 font-bold">{generatedPdf}</span>
                      </div>
                      <button
                        onClick={() => alert(`Downloading ${generatedPdf}`)}
                        className="text-emerald-900 underline text-[10px] font-bold"
                      >
                        Download
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl p-5 space-y-2 text-xs">
                <h4 className="font-bold text-[#1a1c1c] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-amber-600">info</span>
                  REPORTING GUIDELINES
                </h4>
                <p className="text-[#444748]">
                  Extracted files contain sensitive parishioner data. Please ensure all printouts are stored securely according to Diocesan Privacy Rules.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Table Data Preview */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              DATA PREVIEW: {sacramentType.toUpperCase()} REGISTRY
            </h4>

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <th className="p-3">Name</th>
                    <th className="p-3">Date of Birth</th>
                    <th className="p-3">Sacrament Date</th>
                    <th className="p-3">SCC (Jumuiya)</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {sacramentPreviewData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-bold text-[#1a1c1c]">{row.name}</td>
                      <td className="p-3 text-[#444748]">{row.dob}</td>
                      <td className="p-3 text-[#444748]">{row.date}</td>
                      <td className="p-3 text-[#1a1c1c]">{row.scc}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.status === 'Verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 2. CONTRIBUTIONS */}
      {activeSubTab === 'contributions' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-[#e1e3e3] pb-4">
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Contribution Reports</h3>
              <div className="flex gap-2 text-xs">
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                >
                  <option value="">All Months</option>
                  {['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                >
                  <option value="All">All Categories</option>
                  <option value="Tithing">Tithing</option>
                  <option value="Jumuiya">Jumuiya Contribution</option>
                  <option value="Diocesan">Diocesan Support</option>
                  <option value="Project">Parish Project</option>
                </select>
                <button
                  onClick={() => void handleLoadContributions()}
                  className="px-4 py-1.5 font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                >
                  Generate Report
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <th className="p-3">Member</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Amount (KES)</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {contributionRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-[#444748]">
                        No contribution records yet. Record payments in the Activities panel.
                      </td>
                    </tr>
                  ) : (
                    contributionRows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.memberName}</td>
                        <td className="p-3 text-[#444748]">{row.category}</td>
                        <td className="p-3 text-[#444748]">{row.month}</td>
                        <td className="p-3 text-right font-bold text-[#1e1e1e]">{row.amount.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 3. SALES */}
      {activeSubTab === 'sales' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">TOTAL SALES</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">${salesRows.reduce((acc, r) => acc + r.amount, 0).toFixed(2)}</div>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">ITEMS SOLD</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">{salesRows.reduce((acc, r) => acc + r.quantity, 0)}</div>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">TRANSACTIONS</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">{salesRows.length}</div>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">AVG ORDER VALUE</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">
                ${salesRows.length > 0 ? (salesRows.reduce((acc, r) => acc + r.amount, 0) / salesRows.length).toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sales Table (12 Cols) */}
            <div className="lg:col-span-12 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-[#e1e3e3] pb-3">
                <h3 className="text-base font-serif font-bold text-[#1a1c1c]">Item Sales Report</h3>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 text-xs font-semibold text-[#1a1c1c] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3]"
                >
                  Print
                </button>
              </div>

              <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                      <th className="p-3">Item</th>
                      <th className="p-3 text-center">Qty Sold</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e1e3e3]">
                    {salesRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-[#444748]">
                          No sales recorded yet. Process sales in the Inventory panel.
                        </td>
                      </tr>
                    ) : (
                      salesRows.map((row, i) => (
                        <tr key={i} className="hover:bg-[#f9f9f9]">
                          <td className="p-3 font-bold text-[#1a1c1c]">{row.item}</td>
                          <td className="p-3 text-center font-bold">{row.quantity}</td>
                          <td className="p-3 text-right font-bold text-[#1e1e1e]">${row.amount.toFixed(2)}</td>
                          <td className="p-3 text-[#444748]">{row.date}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CASHIERS */}
      {activeSubTab === 'cashiers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Cashier Collection Reports</h3>
              <p className="text-xs text-[#444748] italic">
                Review multi-channel collection streams per authorized cashier.
              </p>
            </div>

            <button
              onClick={() => alert("Exporting daily collection logs...")}
              className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
            >
              Export Daily Logs
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase">TOTAL COLLECTED</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">${cashierRows.reduce((acc, r) => acc + r.collected, 0).toFixed(2)}</div>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase">RECONCILED</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">${cashierRows.reduce((acc, r) => acc + r.reconciled, 0).toFixed(2)}</div>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase">ACTIVE CASHIERS</span>
              <div className="text-xl font-serif font-bold text-emerald-800 mt-1">{cashierRows.length}</div>
            </div>
          </div>

          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
              DETAILED COLLECTION LOG
            </h4>

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <th className="p-3">Cashier Name</th>
                    <th className="p-3 text-right">Sessions</th>
                    <th className="p-3 text-right">Collected</th>
                    <th className="p-3 text-right">Reconciled</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {cashierRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-[#444748]">
                        No cashier collections yet. Create ledgers to track cashier balances.
                      </td>
                    </tr>
                  ) : (
                    cashierRows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.cashier}</td>
                        <td className="p-3 text-right">{row.sessions}</td>
                        <td className="p-3 text-right">${row.collected.toFixed(2)}</td>
                        <td className="p-3 text-right">${row.reconciled.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === 'OK'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
