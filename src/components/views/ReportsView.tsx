import React, { useState } from 'react';
import { ReportsSubTab } from '../../types';

export const ReportsView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<ReportsSubTab>('sacraments');

  // Sacrament report state
  const [sacramentType, setSacramentType] = useState('Baptism');
  const [localChurch, setLocalChurch] = useState('Main Parish Cathedral');
  const [sccFilter, setSccFilter] = useState('All Jumuiyas');

  const [sacramentPreviewData] = useState([
    { name: 'Adrian K. Wanjala', dob: '14/05/2012', date: '22/10/2023', scc: 'St. Jude SCC', status: 'Verified' },
    { name: 'Maria T. Otieno', dob: '03/11/2015', date: '22/10/2023', scc: 'St. Monica SCC', status: 'Verified' },
    { name: 'Benedict J. Kamau', dob: '28/01/2018', date: '15/09/2023', scc: 'St. Anne SCC', status: 'Verified' },
    { name: 'Catherine N. Musyoka', dob: '19/08/2020', date: '15/09/2023', scc: 'St. Paul SCC', status: 'Pending' },
    { name: 'Paul L. Gachora', dob: '02/04/2021', date: '01/08/2023', scc: 'St. Jude SCC', status: 'Verified' }
  ]);

  const [generatedPdf, setGeneratedPdf] = useState<string | null>(null);

  const handleGenerateSacramentReport = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratedPdf(`${sacramentType}_Registry_${localChurch.replace(/\s+/g, '_')}_2024.pdf`);
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
            onClick={() => alert("Printing master summary report...")}
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
                      <option value="Baptism">Baptism</option>
                      <option value="First Communion">First Communion</option>
                      <option value="Confirmation">Confirmation</option>
                      <option value="Marriage">Marriage</option>
                      <option value="Deceased">Deceased Registry</option>
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
                <select className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded">
                  <option>Jan 01, 2024 - Dec 31, 2024</option>
                  <option>Q3 2024 Only</option>
                </select>
                <select className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded">
                  <option>All Categories (Tithes, Levies)</option>
                  <option>Tithes Only</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="p-5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl space-y-3">
                <h4 className="font-serif font-bold text-sm text-[#1a1c1c]">Christian Contribution Report</h4>
                <p className="text-xs text-[#444748]">Itemized individual stewardship records for tax and pastoral reviews.</p>
                <div className="flex gap-1">
                  <span className="px-2 py-0.5 bg-[#ffffff] border border-[#e1e3e3] rounded text-[10px]">Tithing</span>
                  <span className="px-2 py-0.5 bg-[#ffffff] border border-[#e1e3e3] rounded text-[10px]">Diocesan</span>
                </div>
                <button
                  onClick={() => alert("Generating Christian Contribution Report...")}
                  className="w-full py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                >
                  Generate Report ↓
                </button>
              </div>

              {/* Card 2 */}
              <div className="p-5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl space-y-3">
                <h4 className="font-serif font-bold text-sm text-[#1a1c1c]">SCC (Jumuiya) Report</h4>
                <p className="text-xs text-[#444748]">Grouped report organized by Small Christian Communities.</p>
                <div className="text-xs font-bold text-[#1e1e1e]">
                  St. Jude: KES 45,000 • St. Anne: KES 38,200
                </div>
                <button
                  onClick={() => alert("Viewing community breakdown...")}
                  className="w-full py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#eeeeee] rounded cursor-pointer"
                >
                  View Community Breakdown
                </button>
              </div>

              {/* Card 3 */}
              <div className="p-5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl space-y-3">
                <h4 className="font-serif font-bold text-sm text-[#1a1c1c]">Sunday Collections</h4>
                <p className="text-xs text-[#444748]">Consolidated financial overview for parish pastoral council meetings.</p>
                <div className="text-xs font-bold text-[#1e1e1e]">Total Mass Collections: $18,920.00</div>
                <button
                  onClick={() => alert("Generating Consolidated Report...")}
                  className="w-full py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                >
                  Generate Consolidated Report
                </button>
              </div>
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
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">TOTAL SALES (MTD)</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">$4,850.00</div>
              <span className="text-[10px] text-emerald-700 font-bold">+12% vs last month</span>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">ITEMS SOLD</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">342</div>
              <span className="text-[10px] text-[#444748]">Across 18 categories</span>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">AVG ORDER VALUE</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">$14.18</div>
              <span className="text-[10px] text-[#444748]">Consistent with Q1</span>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">SERVICE REVENUE</span>
              <div className="text-2xl font-serif font-bold text-[#1a1c1c] mt-1">$1,220.00</div>
              <span className="text-[10px] text-[#444748]">Certificates & Masses</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Sales Table (8 Cols) */}
            <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b border-[#e1e3e3] pb-3">
                <h3 className="text-base font-serif font-bold text-[#1a1c1c]">Item Sales Report</h3>
                <button
                  onClick={() => alert("Exporting sales PDF...")}
                  className="px-3 py-1 text-xs font-semibold text-[#1a1c1c] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3]"
                >
                  Export PDF
                </button>
              </div>

              <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                      <th className="p-3">Item Description</th>
                      <th className="p-3">Category</th>
                      <th className="p-3 text-center">Qty Sold</th>
                      <th className="p-3 text-right">Unit Price</th>
                      <th className="p-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e1e3e3]">
                    {[
                      { name: 'Votive Candles (Box 12)', cat: 'Religious Supplies', qty: 84, price: 12.0, rev: 1008.0 },
                      { name: 'Mass Intentions (Stipend)', cat: 'Services', qty: 45, price: 10.0, rev: 450.0 },
                      { name: 'Baptismal Certificates', cat: 'Administrative', qty: 12, price: 15.0, rev: 180.0 },
                      { name: 'Sacred Heart Rosary', cat: 'Religious Supplies', qty: 22, price: 45.0, rev: 990.0 },
                      { name: 'Parish Cookbook', cat: 'Books', qty: 31, price: 20.0, rev: 620.0 }
                    ].map((row, i) => (
                      <tr key={i} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.name}</td>
                        <td className="p-3 text-[#444748]">{row.cat}</td>
                        <td className="p-3 text-center font-bold">{row.qty}</td>
                        <td className="p-3 text-right text-[#444748]">${row.price.toFixed(2)}</td>
                        <td className="p-3 text-right font-bold text-[#1e1e1e]">${row.rev.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown Graphic (4 Cols) */}
            <div className="lg:col-span-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                REVENUE BREAKDOWN
              </h4>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>Religious Goods</span>
                    <span className="font-bold">65%</span>
                  </div>
                  <div className="w-full h-2 bg-[#e1e3e3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#1e1e1e] w-[65%]"></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>Mass Offerings</span>
                    <span className="font-bold">20%</span>
                  </div>
                  <div className="w-full h-2 bg-[#e1e3e3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#444748] w-[20%]"></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>Certificates & Admin</span>
                    <span className="font-bold">15%</span>
                  </div>
                  <div className="w-full h-2 bg-[#e1e3e3] rounded-full overflow-hidden">
                    <div className="h-full bg-[#888888] w-[15%]"></div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#f4f3f3] rounded border border-[#e1e3e3] text-center text-xs text-[#444748] mt-4">
                St. Mary's Gift Shop & Office Sales Activity
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
              <span className="text-[10px] font-bold text-[#444748] uppercase">TOTAL PHYSICAL CASH</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">$12,450.00</div>
              <span className="text-[10px] text-emerald-700 font-bold">+4.2% today</span>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase">PUSH PAYMENTS</span>
              <div className="text-xl font-serif font-bold text-[#1a1c1c] mt-1">$8,920.00</div>
              <span className="text-[10px] text-[#444748]">Digital & M-Pesa</span>
            </div>

            <div className="p-4 bg-[#ffffff] border border-[#e1e3e3] rounded-xl shadow-xs">
              <span className="text-[10px] font-bold text-[#444748] uppercase">RECONCILIATION STATUS</span>
              <div className="text-xl font-serif font-bold text-emerald-800 mt-1">14 Balanced</div>
              <span className="text-[10px] text-[#444748]">All physical deposits match logs</span>
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
                    <th className="p-3">Shift</th>
                    <th className="p-3 text-right">Physical Cash</th>
                    <th className="p-3 text-right">Push Payments</th>
                    <th className="p-3 text-right">Total Deposit</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {[
                    { name: 'Maria Moretti', shift: 'Morning Liturgy', cash: 2450.0, push: 1100.0, total: 3550.0, status: 'RECONCILED' },
                    { name: 'Thomas Becket', shift: 'Afternoon Sales', cash: 1210.0, push: 3420.5, total: 4630.5, status: 'RECONCILED' },
                    { name: 'Catherine Newman', shift: 'Vesper Donations', cash: 890.0, push: 150.0, total: 1040.0, status: 'PENDING AUDIT' }
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-[#f9f9f9]">
                      <td className="p-3 font-bold text-[#1a1c1c]">{row.name}</td>
                      <td className="p-3 text-[#444748]">{row.shift}</td>
                      <td className="p-3 text-right">${row.cash.toFixed(2)}</td>
                      <td className="p-3 text-right">${row.push.toFixed(2)}</td>
                      <td className="p-3 text-right font-bold text-[#1e1e1e]">${row.total.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.status === 'RECONCILED'
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
    </div>
  );
};
