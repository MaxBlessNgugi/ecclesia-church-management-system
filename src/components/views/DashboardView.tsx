import React from 'react';
import { NavigationTab } from '../../types';

interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, subTab?: string) => void;
  memberCount: number;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, memberCount }) => {
  const panels = [
    {
      id: 'christian' as NavigationTab,
      title: 'Christian Panel',
      icon: 'groups',
      desc: 'Parishioner registry & demographic cards',
      items: [
        { label: 'Add New Christian', subTab: 'add' },
        { label: 'Find/Search Member', subTab: 'find' },
        { label: 'Delete Records', subTab: 'delete' }
      ]
    },
    {
      id: 'activities' as NavigationTab,
      title: 'Activities Panel',
      icon: 'volunteer_activism',
      desc: 'Tithing, contributions & billed services',
      items: [
        { label: 'Receive Payment', subTab: 'receive_payment' },
        { label: 'Transfer Christian', subTab: 'transfer' },
        { label: 'Billed Items', subTab: 'billed_items' }
      ]
    },
    {
      id: 'sacraments' as NavigationTab,
      title: 'Sacrament Panel',
      icon: 'church',
      desc: 'Sacrament certificates & memorial register',
      items: [
        { label: 'Sacrament Details', subTab: 'update_card' },
        { label: 'Death Records', subTab: 'record_death' }
      ]
    },
    {
      id: 'finance' as NavigationTab,
      title: 'Finance Panel',
      icon: 'account_balance',
      desc: 'Deposits, expenses, creditors & debtors',
      items: [
        { label: 'Deposits & Expenses', subTab: 'make_deposit' },
        { label: 'Debtors & Creditors', subTab: 'creditors' }
      ]
    },
    {
      id: 'ledgers' as NavigationTab,
      title: 'Ledger Panel',
      icon: 'book_4',
      desc: 'General ledgers & inter-ledger transfers',
      items: [
        { label: 'General Ledgers', subTab: 'ledgers' },
        { label: 'Inter-Ledger Transfers', subTab: 'transfers' }
      ]
    },
    {
      id: 'inventory' as NavigationTab,
      title: 'Inventory Panel',
      icon: 'inventory_2',
      desc: 'Liturgical items, sales & stock management',
      items: [
        { label: 'Sales & Stock Issue', subTab: 'issue' },
        { label: 'Add/Edit Items', subTab: 'items' }
      ]
    },
    {
      id: 'reports' as NavigationTab,
      title: 'Reporting Panel',
      icon: 'analytics',
      desc: 'Member stats, sales logs & SCC summaries',
      items: [
        { label: 'Member & Sales Reports', subTab: 'reports' },
        { label: 'SCC / Church Stats', subTab: 'stats' }
      ]
    },
    {
      id: 'hr' as NavigationTab,
      title: 'HR Panel',
      icon: 'badge',
      desc: 'Parish staff & clergy records management',
      items: [{ label: 'Employee Management', subTab: 'employees' }]
    },
    {
      id: 'administration' as NavigationTab,
      title: 'Admin Panel',
      icon: 'admin_panel_settings',
      desc: 'Access control & push payment settings',
      items: [
        { label: 'Rights Centre', subTab: 'rights' },
        { label: 'Push Payment Setup', subTab: 'payment_setup' }
      ]
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
      {/* Sanctuary Banner Header */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#f4f3f3] to-transparent pointer-events-none opacity-50" />
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1e1e1e] text-[#ffffff] text-[10px] font-bold tracking-widest uppercase">
            <span>† Central Altar</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">
            St. Mary's Parish
          </h2>
          <p className="text-xs text-[#444748] leading-relaxed">
            A peaceful sanctuary for management. Access the sacred and administrative duties of the parish from this central altar.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-[#1a1c1c] font-medium">
            <span className="flex items-center gap-1.5 bg-[#f4f3f3] px-3 py-1 rounded-md border border-[#e1e3e3]">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              {memberCount} Active Parishioners
            </span>
            <span className="flex items-center gap-1.5 bg-[#f4f3f3] px-3 py-1 rounded-md border border-[#e1e3e3]">
              <span className="material-symbols-outlined text-sm text-[#1e1e1e]">church</span>
              Archdiocese of Nairobi
            </span>
          </div>
        </div>
      </div>

      {/* Grid of 9 Management Panels */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#1a1c1c] tracking-wide uppercase font-serif">
            Management Modules
          </h3>
          <span className="text-xs text-[#444748]">Select a module or function to enter</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {panels.map((panel) => (
            <div
              key={panel.id}
              className="bg-[#ffffff] border border-[#e1e3e3] hover:border-[#1e1e1e] rounded-xl p-5 transition-all shadow-2xs hover:shadow-md flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#f4f3f3] group-hover:bg-[#1e1e1e] text-[#1e1e1e] group-hover:text-[#ffffff] flex items-center justify-center transition-colors">
                      <span className="material-symbols-outlined text-xl">{panel.icon}</span>
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[#1a1c1c] group-hover:text-[#1e1e1e]">
                        {panel.title}
                      </h4>
                      <p className="text-[11px] text-[#444748] line-clamp-1">{panel.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="my-3 border-t border-[#e1e3e3]" />

                {/* Sub-item quick buttons */}
                <div className="space-y-1.5">
                  {panel.items.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => onNavigate(panel.id, item.subTab)}
                      className="w-full px-3 py-2 text-left text-xs text-[#1a1c1c] hover:text-[#1e1e1e] hover:bg-[#f4f3f3] rounded-md transition-colors flex items-center justify-between cursor-pointer font-medium"
                    >
                      <span>{item.label}</span>
                      <span className="material-symbols-outlined text-xs text-[#444748] opacity-0 group-hover:opacity-100 transition-opacity">
                        chevron_right
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-[#f4f3f3]">
                <button
                  onClick={() => onNavigate(panel.id)}
                  className="w-full py-1.5 text-center text-xs text-[#1e1e1e] bg-[#f4f3f3] hover:bg-[#eeeeee] rounded font-semibold transition-colors cursor-pointer"
                >
                  Open {panel.title} →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status & Sacred Quote Bar */}
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#444748]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-medium text-[#1a1c1c]">Database Sync: Active</span>
          </div>
          <span className="text-[#c4c7c7]">|</span>
          <div>Last Backup: 4h ago</div>
        </div>

        <p className="italic text-[#1a1c1c] font-serif text-center md:text-right">
          "Servants of the Lord, let us manage His house with integrity."
        </p>
      </div>
    </div>
  );
};
