// =============================================================================
// ReportsView — audit-ready reporting panel: sacraments, contributions, sales,
// and cashier collections
// -----------------------------------------------------------------------------
// Self-contained view (no props): it fetches its own report data on mount via
// useEffect rather than receiving it from App. API endpoints used:
//   - GET /api/reports/sacraments    (reportsApi.sacraments)
//   - GET /api/reports/contributions (reportsApi.contributions)
//   - GET /api/reports/sales         (reportsApi.sales)
//   - GET /api/reports/cashiers      (reportsApi.cashiers)
//
// Internal state flow: a sub-tab ('sacraments' | 'contributions' | 'sales' |
// 'cashiers') selects the active report panel. On mount, all four datasets are
// fetched in parallel to seed the tables and KPI cards (failures are logged
// only — there is no dedicated loading flag). Each panel then owns its own
// filter state: the sacraments panel refetches on form submit with
// sacramentType / localChurch / scc params; contributions refetches on demand
// with category / month params; sales and cashiers render the mount-time
// snapshot. The most recently generated sacrament report filename is tracked
// for the "recent extractions" download list.
// =============================================================================
import React, { useState, useEffect, useMemo } from 'react';
import { ReportsSubTab, SacramentReportRow, ContributionReportRow, SalesReportRow, CashierReportRow } from '../../types';
import { reportsApi } from '../../services/api';
import { exportCsv, exportExcel, ExportColumn } from '../../utils/export';

// Column definitions for the CSV / Excel exports — one pair per report panel,
// so each export mirrors exactly what its table displays.
const SACRAMENT_COLUMNS: ExportColumn<SacramentReportRow>[] = [
  { label: 'Name', value: (r) => r.name },
  { label: 'Date of Birth', value: (r) => r.dob },
  { label: 'Sacrament Date', value: (r) => r.date },
  { label: 'SCC (Jumuiya)', value: (r) => r.scc },
  { label: 'Status', value: (r) => r.status }
];

const CONTRIBUTION_COLUMNS: ExportColumn<ContributionReportRow>[] = [
  { label: 'Member', value: (r) => r.memberName },
  { label: 'Category', value: (r) => r.category },
  { label: 'Month', value: (r) => r.month },
  { label: 'Amount (KES)', value: (r) => r.amount },
  { label: 'Status', value: (r) => r.status }
];

const SALES_COLUMNS: ExportColumn<SalesReportRow>[] = [
  { label: 'Item', value: (r) => r.item },
  { label: 'Qty Sold', value: (r) => r.quantity },
  { label: 'Amount', value: (r) => r.amount },
  { label: 'Date', value: (r) => r.date }
];

const CASHIER_COLUMNS: ExportColumn<CashierReportRow>[] = [
  { label: 'Cashier Name', value: (r) => r.cashier },
  { label: 'Sessions', value: (r) => r.sessions },
  { label: 'Collected', value: (r) => r.collected },
  { label: 'Reconciled', value: (r) => r.reconciled },
  {
    label: 'Status',
    value: (r) => {
      const variance = r.collected - r.reconciled;
      return Math.abs(variance) < 0.005 ? 'Reconciled' : `Shortfall $${Math.abs(variance).toFixed(2)}`;
    }
  }
];

// Reusable inline export button style shared by every report panel.
const EXPORT_BTN =
  'px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer flex items-center gap-1.5';

// ---------------------------------------------------------------------------
// Generic client-side table controls: global search, column sorting and
// pagination applied in-memory over whatever rows a report panel renders.
// Search matches any of the given fields; sorting handles numbers and text.
// ---------------------------------------------------------------------------
interface ReportTableControls<T> {
  query: string;
  setQuery: (v: string) => void;
  sortKey: string | null;
  sortDir: 'asc' | 'desc';
  toggleSort: (field: string) => void;
  page: number;
  setPage: (n: number) => void;
  pageSize: number;
  setPageSize: (n: number) => void;
  pageRows: T[];
  total: number;
}

function useReportTable<T>(rows: T[], searchFields: string[]): ReportTableControls<T> {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => { setPage(0); }, [query, sortKey, sortDir]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter((r) =>
        searchFields.some((f) => {
          const v = (r as Record<string, unknown>)[f];
          return v != null && String(v).toLowerCase().includes(q);
        })
      );
    }
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey];
        const bv = (b as Record<string, unknown>)[sortKey];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true }) * dir;
      });
    }
    return out;
  }, [rows, query, sortKey, sortDir]);

  const pageRows = useMemo(
    () => filtered.slice(page * pageSize, (page + 1) * pageSize),
    [filtered, page, pageSize]
  );

  return {
    query,
    setQuery,
    sortKey,
    sortDir,
    toggleSort: (field: string) => {
      if (sortKey !== field) {
        setSortKey(field);
        setSortDir('asc');
      } else {
        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      }
    },
    page,
    setPage,
    pageSize,
    setPageSize,
    pageRows,
    total: filtered.length
  };
}

// Sortable column header — clicking toggles asc/desc on the active column.
function SortableHeader<T>({ label, field, controls, align }: {
  label: string;
  field: string;
  controls: ReportTableControls<T>;
  align?: 'left' | 'right' | 'center';
}) {
  const active = controls.sortKey === field;
  return (
    <th
      onClick={() => controls.toggleSort(field)}
      className={`p-3 cursor-pointer select-none hover:bg-[#ecebeb] ${
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : ''
      }`}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        {active && (
          <span className="material-symbols-outlined text-[11px]">
            {controls.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
          </span>
        )}
      </span>
    </th>
  );
}

// Shared toolbar rendered above each report table: global search input + row
// count on the left, page-size select + Prev/Next pager on the right.
function TableToolbar<T>({ controls, placeholder }: {
  controls: ReportTableControls<T>;
  placeholder: string;
}) {
  const { query, setQuery, page, setPage, pageSize, setPageSize, total } = controls;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-b border-[#e1e3e3] pb-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative flex-1 max-w-xs">
          <span className="material-symbols-outlined text-sm text-[#8a8e8e] absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c] focus:outline-none focus:border-[#1e1e1e]"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#8a8e8e] hover:text-[#1a1c1c] cursor-pointer"
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>
        <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">{total} records</span>
      </div>

      <div className="flex items-center gap-2 text-xs">
        <select
          value={pageSize}
          onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          className="px-2 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[#1a1c1c]"
        >
          {[5, 10, 25, 50].map((n) => (
            <option key={n} value={n}>{n} / page</option>
          ))}
        </select>
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span className="text-[#444748]">{page + 1} / {pageCount}</span>
        <button
          onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          className="px-2.5 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// Empty-state row shared by the report tables: distinguishes "no data at all"
// from "data exists but nothing matches the active search/preset".
function TableEmptyRow({ colspan, hasAny, hint }: { colspan: number; hasAny: boolean; hint?: string }) {
  return (
    <tr>
      <td colSpan={colspan} className="p-6 text-center text-[#444748]">
        {hasAny
          ? 'No records match the current search or filters.'
          : (hint ?? 'No records yet.')}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Date presets — client-side date-range chips for the sacrament and sales
// tables. Values are parsed tolerantly (ISO dates and locale strings both work);
// rows that do not parse are excluded from any non-"all" preset.
// ---------------------------------------------------------------------------
type DatePreset = 'all' | 'today' | 'thisWeek' | 'thisMonth' | 'thisYear';

function parseLooseDate(value: string): Date | null {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return d;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (m) {
    const parsed = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function matchesPreset(value: string, preset: DatePreset): boolean {
  if (preset === 'all') return true;
  const d = parseLooseDate(value);
  if (!d) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return d >= today;
  if (preset === 'thisWeek') {
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - 6);
    return d >= weekStart;
  }
  if (preset === 'thisMonth') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (preset === 'thisYear') return d.getFullYear() === now.getFullYear();
  return true;
}

const DATE_PRESET_OPTIONS: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'thisWeek', label: 'This Week' },
  { key: 'thisMonth', label: 'This Month' },
  { key: 'thisYear', label: 'This Year' }
];

function DatePresetChips({ value, onChange, options }: {
  value: DatePreset;
  onChange: (v: DatePreset) => void;
  options: { key: DatePreset; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors cursor-pointer ${
            value === o.key
              ? 'bg-[#1e1e1e] text-white border-[#1e1e1e]'
              : 'bg-[#ffffff] text-[#444748] border-[#c4c7c7] hover:bg-[#f4f3f3]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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

  // Client-side date presets for the sacrament and sales tables.
  const [sacramentPreset, setSacramentPreset] = useState<DatePreset>('all');
  const [salesPreset, setSalesPreset] = useState<DatePreset>('all');

  // Preset-filtered row sets feed the table controls below; KPI cards keep the
  // full snapshot so headline totals are never hidden by a date chip.
  const filteredSacraments = useMemo(() => {
    if (sacramentPreset === 'all') return sacramentPreviewData;
    return sacramentPreviewData.filter((r) => matchesPreset(r.date, sacramentPreset));
  }, [sacramentPreviewData, sacramentPreset]);

  const filteredSales = useMemo(() => {
    if (salesPreset === 'all') return salesRows;
    return salesRows.filter((r) => matchesPreset(r.date, salesPreset));
  }, [salesRows, salesPreset]);

  // One table-control instance per report panel (search + sort + pagination).
  const sacramentsCtl = useReportTable(filteredSacraments, ['name', 'dob', 'date', 'scc', 'status']);
  const contributionsCtl = useReportTable(contributionRows, ['memberName', 'category', 'month', 'status']);
  const salesCtl = useReportTable(filteredSales, ['item', 'date']);
  const cashiersCtl = useReportTable(cashierRows, ['cashier', 'status']);

  // On mount, seed all four report datasets in one parallel round trip so every
  // tab renders immediately. The sacraments call uses the default 'baptism' type;
  // failures are logged only and leave empty tables behind.
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

  /**
   * Refetches the sacrament registry filtered by the form's sacrament type,
   * local church, and SCC selector. Empty/undefined filters are dropped from the
   * query string (see buildQuery in services/api.ts), so omitting a filter means
   * "all". Only the data preview and the tracked filename change — the hardcoded
   * FROM/TO date inputs are uncontrolled and are NOT sent to the API.
   */
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

  /**
   * Refetches the contribution report for the selected category and month. The
   * "All Categories" placeholder maps to undefined (dropped from the query) so
   * the server returns every category; an empty month means "all months".
   * Overrides let the quick month presets fetch immediately instead of waiting
   * for the next state commit.
   */
  const handleLoadContributions = async (monthOverride?: string, categoryOverride?: string) => {
    try {
      const rows = await reportsApi.contributions({
        category: (categoryOverride ?? categoryFilter) === 'All' ? undefined : (categoryOverride ?? categoryFilter),
        month: (monthOverride ?? monthFilter) || undefined
      });
      setContributionRows(rows);
    } catch (error) {
      console.error('Failed to load contribution report', error);
      alert(error instanceof Error ? error.message : 'Failed to load contribution report');
    }
  };

  // Quick month presets: set the month filter state and refetch in one go.
  const handleMonthPreset = (preset: 'this' | 'last' | 'all') => {
    if (preset === 'all') {
      setMonthFilter('');
      void handleLoadContributions('', undefined);
      return;
    }
    const now = new Date();
    const month = preset === 'this'
      ? MONTHS[now.getMonth()]
      : MONTHS[(now.getMonth() + 11) % 12];
    setMonthFilter(month);
    void handleLoadContributions(month, undefined);
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

      {/* Sub-tab Links: map over the tab union; activeSubTab decides the rendered panel. */}
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

      {/* 1. SACRAMENT REPORTS — filter form (8 cols) + recent extraction list (4 cols) + data preview table. */}
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

                <div className="flex flex-wrap gap-3 pt-3 border-t border-[#e1e3e3]">
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
                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                    Export PDF
                  </button>

                  {/* The generated file base reuses the tracked PDF filename so all
                      three exports share one naming scheme. */}
                  <button
                    type="button"
                    onClick={() => {
                      const base = `${sacramentType}_Registry_${(localChurch || 'Parish').replace(/\s+/g, '_')}_${new Date().getFullYear()}`;
                      exportCsv(base, SACRAMENT_COLUMNS, sacramentPreviewData);
                    }}
                    className={EXPORT_BTN}
                  >
                    <span className="material-symbols-outlined text-sm">table_view</span>
                    Export CSV
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const base = `${sacramentType}_Registry_${(localChurch || 'Parish').replace(/\s+/g, '_')}_${new Date().getFullYear()}`;
                      exportExcel(base, SACRAMENT_COLUMNS, sacramentPreviewData);
                    }}
                    className={EXPORT_BTN}
                  >
                    <span className="material-symbols-outlined text-sm">grid_on</span>
                    Export Excel
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

                  {/* The generated filename appears highlighted so the latest extraction is easy to spot. */}
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider">
                DATA PREVIEW: {sacramentType.toUpperCase()} REGISTRY
              </h4>
              <DatePresetChips
                value={sacramentPreset}
                onChange={setSacramentPreset}
                options={DATE_PRESET_OPTIONS.filter((o) => o.key !== 'today' && o.key !== 'thisWeek')}
              />
            </div>

            <TableToolbar controls={sacramentsCtl} placeholder="Search name, SCC, status..." />

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <SortableHeader label="Name" field="name" controls={sacramentsCtl} />
                    <SortableHeader label="Date of Birth" field="dob" controls={sacramentsCtl} />
                    <SortableHeader label="Sacrament Date" field="date" controls={sacramentsCtl} />
                    <SortableHeader label="SCC (Jumuiya)" field="scc" controls={sacramentsCtl} />
                    <SortableHeader label="Status" field="status" controls={sacramentsCtl} align="center" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e1e3e3]">
                  {sacramentsCtl.pageRows.length === 0 ? (
                    <TableEmptyRow colspan={5} hasAny={filteredSacraments.length > 0} />
                  ) : (
                    sacramentsCtl.pageRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.name}</td>
                        <td className="p-3 text-[#444748]">{row.dob}</td>
                        <td className="p-3 text-[#444748]">{row.date}</td>
                        <td className="p-3 text-[#1a1c1c]">{row.scc}</td>
                        <td className="p-3 text-center">
                          {/* Status badge: green for Verified records, amber for anything else (e.g. Pending). */}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === 'Verified'
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

      {/* 2. CONTRIBUTIONS — filter bar (month + category) above an on-demand refetched table. */}
      {activeSubTab === 'contributions' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b border-[#e1e3e3] pb-4">
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Contribution Reports</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => handleMonthPreset('this')}
                  className="px-3 py-1.5 font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  This Month
                </button>
                <button
                  onClick={() => handleMonthPreset('last')}
                  className="px-3 py-1.5 font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  Last Month
                </button>
                <button
                  onClick={() => handleMonthPreset('all')}
                  className="px-3 py-1.5 font-bold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  All Months
                </button>
                <span className="w-px bg-[#e1e3e3] self-stretch" />
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded"
                >
                  <option value="">All Months</option>
                  {MONTHS.map((m) => (
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
                <span className="w-px bg-[#e1e3e3] self-stretch" />
                <button
                  onClick={() => exportCsv(`Contributions_${monthFilter || 'All_Months'}_${categoryFilter === 'All' ? 'All' : categoryFilter}`, CONTRIBUTION_COLUMNS, contributionRows)}
                  className={EXPORT_BTN}
                >
                  <span className="material-symbols-outlined text-base">table_view</span>
                  CSV
                </button>
                <button
                  onClick={() => exportExcel(`Contributions_${monthFilter || 'All_Months'}_${categoryFilter === 'All' ? 'All' : categoryFilter}`, CONTRIBUTION_COLUMNS, contributionRows)}
                  className={EXPORT_BTN}
                >
                  <span className="material-symbols-outlined text-base">grid_on</span>
                  Excel
                </button>
              </div>
            </div>

            <TableToolbar controls={contributionsCtl} placeholder="Search member, category, status..." />

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <SortableHeader label="Member" field="memberName" controls={contributionsCtl} />
                    <SortableHeader label="Category" field="category" controls={contributionsCtl} />
                    <SortableHeader label="Month" field="month" controls={contributionsCtl} />
                    <SortableHeader label="Amount (KES)" field="amount" controls={contributionsCtl} align="right" />
                    <SortableHeader label="Status" field="status" controls={contributionsCtl} align="center" />
                  </tr>
                </thead>
                {/* Empty state covers both "no records yet" and "nothing matches the current filters". */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {contributionsCtl.pageRows.length === 0 ? (
                    <TableEmptyRow colspan={5} hasAny={contributionRows.length > 0} />
                  ) : (
                    contributionsCtl.pageRows.map((row, i) => (
                      <tr key={i} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.memberName}</td>
                        <td className="p-3 text-[#444748]">{row.category}</td>
                        <td className="p-3 text-[#444748]">{row.month}</td>
                        <td className="p-3 text-right font-bold text-[#1e1e1e]">{row.amount.toLocaleString()}</td>
                        <td className="p-3 text-center">
                          {/* Conditional badge: green for Paid, amber for pending/unpaid. */}
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

      {/* 3. SALES — KPI cards aggregated client-side from the mount-time sales snapshot. */}
      {activeSubTab === 'sales' && (
        <div className="space-y-6">
          {/* Top KPI Cards */}
          {/* All four KPIs derive from the same salesRows array via reduce (no extra requests). */}
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

            {/* AVG ORDER VALUE: guards against division by zero when no sales exist. */}
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
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#e1e3e3] pb-3">
                <div className="space-y-2">
                  <h3 className="text-base font-serif font-bold text-[#1a1c1c]">Item Sales Report</h3>
                  <DatePresetChips value={salesPreset} onChange={setSalesPreset} options={DATE_PRESET_OPTIONS} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => exportCsv('Item_Sales_Report', SALES_COLUMNS, salesRows)}
                    className={EXPORT_BTN}
                  >
                    <span className="material-symbols-outlined text-base">table_view</span>
                    Export CSV
                  </button>
                  <button
                    onClick={() => exportExcel('Item_Sales_Report', SALES_COLUMNS, salesRows)}
                    className={EXPORT_BTN}
                  >
                    <span className="material-symbols-outlined text-base">grid_on</span>
                    Export Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-1 text-xs font-semibold text-[#1a1c1c] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3]"
                  >
                    Print
                  </button>
                </div>
              </div>

              <TableToolbar controls={salesCtl} placeholder="Search item or date..." />

              <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                      <SortableHeader label="Item" field="item" controls={salesCtl} />
                      <SortableHeader label="Qty Sold" field="quantity" controls={salesCtl} align="center" />
                      <SortableHeader label="Amount" field="amount" controls={salesCtl} align="right" />
                      <SortableHeader label="Date" field="date" controls={salesCtl} />
                    </tr>
                  </thead>
                {/* Empty state when the inventory has no sales yet. */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {salesCtl.pageRows.length === 0 ? (
                      <TableEmptyRow colspan={4} hasAny={filteredSales.length > 0} />
                    ) : (
                      salesCtl.pageRows.map((row, i) => (
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

      {/* 4. CASHIERS — KPI cards + per-cashier collection log, both from the mount-time snapshot. */}
      {activeSubTab === 'cashiers' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">Cashier Collection Reports</h3>
              <p className="text-xs text-[#444748] italic">
                Review multi-channel collection streams per authorized cashier.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => exportCsv('Cashier_Collection_Log', CASHIER_COLUMNS, cashierRows)}
                className={EXPORT_BTN}
              >
                <span className="material-symbols-outlined text-base">table_view</span>
                Export CSV
              </button>
              <button
                onClick={() => exportExcel('Cashier_Collection_Log', CASHIER_COLUMNS, cashierRows)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base">grid_on</span>
                Export Excel
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* KPIs aggregate collected/reconciled totals from cashierRows (client-side, no refetch). */}
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

            <TableToolbar controls={cashiersCtl} placeholder="Search cashier or status..." />

            <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                    <SortableHeader label="Cashier Name" field="cashier" controls={cashiersCtl} />
                    <SortableHeader label="Sessions" field="sessions" controls={cashiersCtl} align="right" />
                    <SortableHeader label="Collected" field="collected" controls={cashiersCtl} align="right" />
                    <SortableHeader label="Reconciled" field="reconciled" controls={cashiersCtl} align="right" />
                    <SortableHeader label="Status" field="status" controls={cashiersCtl} align="center" />
                  </tr>
                </thead>
                {/* Empty state when no ledgers/cashiers exist yet. */}
                <tbody className="divide-y divide-[#e1e3e3]">
                  {cashiersCtl.pageRows.length === 0 ? (
                    <TableEmptyRow colspan={5} hasAny={cashierRows.length > 0} />
                  ) : (
                    cashiersCtl.pageRows.map((row, i) => {
                      const variance = row.collected - row.reconciled;
                      const reconciled = Math.abs(variance) < 0.005;
                      return (
                      <tr key={i} className="hover:bg-[#f9f9f9]">
                        <td className="p-3 font-bold text-[#1a1c1c]">{row.cashier}</td>
                        <td className="p-3 text-right">{row.sessions}</td>
                        <td className="p-3 text-right">${row.collected.toFixed(2)}</td>
                        <td className="p-3 text-right">${row.reconciled.toFixed(2)}</td>
                        <td className="p-3 text-center">
                          {/* Reconciliation badge: green when collected matches the
                              reconciled total; amber with the shortfall amount when
                              the cashier's drawer does not balance. */}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            reconciled
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {reconciled
                              ? 'Reconciled'
                              : `Shortfall $${Math.abs(variance).toFixed(2)}`}
                          </span>
                        </td>
                      </tr>
                      );
                    })
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
