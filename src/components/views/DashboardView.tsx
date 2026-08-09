// =============================================================================
// DashboardView — landing page with a grid of management module cards
// -----------------------------------------------------------------------------
// Pure presentational component: renders a banner (with the lifted active-member
// count) plus one card per module. Each card's sub-items navigate via
// onNavigate(panel, subTab). The card list is filtered by allowedPanels so the
// user only sees panels they have permission for (Dashboard/Auth are implicit).
// NOTE: the subTab strings here are display-only labels used for quick nav; the
// actual per-panel sub-tab unions live in src/types.ts.
// =============================================================================
// PURPOSE: This is the main dashboard view for the Ecclesia Church Management
// System. It serves as the central landing page where users can access all
// management modules. The dashboard displays:
// - A banner showing the total active parishioner count
// - A grid of management module cards (Christian, Activities, Sacraments, Finance,
//   Ledgers, Inventory, Reports, HR, Admin)
// - Each card has quick-action buttons for common sub-tasks within that module
// - A status bar showing database sync status and a spiritual quote
// The view is role-based: only panels the user has permission to access are shown.
// =============================================================================

import React from 'react'; // React library - provides JSX support, component lifecycle, and React.FC type for functional components
import { NavigationTab, PanelKey } from '../../types'; // Type definitions - NavigationTab represents panel identifiers, PanelKey represents allowed panel keys for permission filtering
import { useOffline } from '../../context/OfflineContext'; // Offline context hook for connectivity status

// Props interface defining the contract for the DashboardView component
interface DashboardViewProps {
  onNavigate: (tab: NavigationTab, subTab?: string) => void; // Navigation callback function
  memberCount: number; // Total count of active parishioners/members
  allowedPanels?: PanelKey[]; // Optional array of panel keys the current user is permitted to access
}

// DashboardView functional component - renders the main dashboard with module cards
export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate, memberCount, allowedPanels }) => {
  // Offline connectivity status
  const { status: connectivityStatus, lastSyncedAt, pendingCount } = useOffline();
  // Array of all available management module definitions - each object contains the panel's
  // unique identifier, display title, Material icon name, description, and quick-action sub-items
  const panels = [
    {
      id: 'christian' as NavigationTab, // Unique identifier for the Christian/Parishioner management panel
      title: 'Christian Panel', // Display title shown on the card header
      icon: 'groups', // Material Symbols icon name for the panel visual
      desc: 'Parishioner registry & demographic cards', // Brief description of the panel's purpose
      items: [
        { label: 'Add New Christian', subTab: 'add' }, // Quick action to navigate to the member creation form
        { label: 'Find/Search Member', subTab: 'find' }, // Quick action to navigate to the member search interface
        { label: 'Delete Records', subTab: 'delete' } // Quick action to navigate to the record deletion interface
      ]
    },
    {
      id: 'activities' as NavigationTab, // Unique identifier for the Activities/Tithing panel
      title: 'Activities Panel', // Display title shown on the card header
      icon: 'volunteer_activism', // Material Symbols icon name representing charitable giving
      desc: 'Tithing, contributions & billed services', // Brief description of the panel's purpose
      items: [
        { label: 'Receive Payment', subTab: 'receive_payment' }, // Quick action to record a new payment/tithe
        { label: 'Transfer Christian', subTab: 'transfer' }, // Quick action to transfer a member between groups
        { label: 'Billed Items', subTab: 'billed_items' } // Quick action to view manage billed services
      ]
    },
    {
      id: 'sacraments' as NavigationTab, // Unique identifier for the Sacraments panel
      title: 'Sacrament Panel', // Display title shown on the card header
      icon: 'church', // Material Symbols icon name representing a church building
      desc: 'Sacrament certificates & memorial register', // Brief description of the panel's purpose
      items: [
        { label: 'Sacrament Details', subTab: 'update_card' }, // Quick action to view/update sacrament certificate details
        { label: 'Death Records', subTab: 'record_death' } // Quick action to record a member's passing
      ]
    },
    {
      id: 'finance' as NavigationTab, // Unique identifier for the Finance panel
      title: 'Finance Panel', // Display title shown on the card header
      icon: 'account_balance', // Material Symbols icon name representing banking/finance
      desc: 'Deposits, expenses, creditors & debtors', // Brief description of the panel's purpose
      items: [
        { label: 'Deposits & Expenses', subTab: 'make_deposit' }, // Quick action to record deposits or expenses
        { label: 'Debtors & Creditors', subTab: 'creditors' } // Quick action to manage debtors and creditors
      ]
    },
    {
      id: 'ledgers' as NavigationTab, // Unique identifier for the Ledger panel
      title: 'Ledger Panel', // Display title shown on the card header
      icon: 'book_4', // Material Symbols icon name representing accounting ledgers
      desc: 'General ledgers & inter-ledger transfers', // Brief description of the panel's purpose
      items: [
        { label: 'General Ledgers', subTab: 'ledgers' }, // Quick action to view general ledger entries
        { label: 'Inter-Ledger Transfers', subTab: 'transfers' } // Quick action to manage transfers between ledgers
      ]
    },
    {
      id: 'inventory' as NavigationTab, // Unique identifier for the Inventory panel
      title: 'Inventory Panel', // Display title shown on the card header
      icon: 'inventory_2', // Material Symbols icon name representing inventory/stock
      desc: 'Liturgical items, sales & stock management', // Brief description of the panel's purpose
      items: [
        { label: 'Sales & Stock Issue', subTab: 'issue' }, // Quick action to record sales or stock issues
        { label: 'Add/Edit Items', subTab: 'items' } // Quick action to add or edit inventory items
      ]
    },
    {
      id: 'reports' as NavigationTab, // Unique identifier for the Reports panel
      title: 'Reporting Panel', // Display title shown on the card header
      icon: 'analytics', // Material Symbols icon name representing analytics/reports
      desc: 'Member stats, sales logs & SCC summaries', // Brief description of the panel's purpose
      items: [
        { label: 'Member & Sales Reports', subTab: 'reports' }, // Quick action to generate member or sales reports
        { label: 'SCC / Church Stats', subTab: 'stats' } // Quick action to view Small Christian Community and church statistics
      ]
    },
    {
      id: 'hr' as NavigationTab, // Unique identifier for the Human Resources panel
      title: 'HR Panel', // Display title shown on the card header
      icon: 'badge', // Material Symbols icon name representing employee badges
      desc: 'Parish staff & clergy records management', // Brief description of the panel's purpose
      items: [{ label: 'Employee Management', subTab: 'employees' }] // Single quick action to manage employee records
    },
    {
      id: 'administration' as NavigationTab, // Unique identifier for the Administration panel
      title: 'Admin Panel', // Display title shown on the card header
      icon: 'admin_panel_settings', // Material Symbols icon name representing admin settings
      desc: 'Access control & push payment settings', // Brief description of the panel's purpose
      items: [
        { label: 'Rights Centre', subTab: 'rights' }, // Quick action to manage user roles and permissions
        { label: 'Push Payment Setup', subTab: 'payment_setup' } // Quick action to configure automated payment settings
      ]
    }
  ];

  // Filter panels based on user permissions - if allowedPanels is provided and non-empty,
  // only show panels whose ID is in the allowedPanels array; otherwise show all panels
  const visiblePanels =
    allowedPanels && allowedPanels.length > 0 // Check if allowedPanels is defined and has at least one entry
      ? panels.filter((p) => (allowedPanels as string[]).includes(p.id)) // Filter to only panels the user has permission to access
      : panels; // If no restrictions, display all available panels

  // Main container div - centers content with max-width, adds padding, spacing, and fade-in animation
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-200">
     
     
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs relative overflow-hidden">
       
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#f4f3f3] to-transparent pointer-events-none opacity-50" />
       
        <div className="relative z-10 max-w-2xl space-y-2">
         
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#1e1e1e] text-[#ffffff] text-[10px] font-bold tracking-widest uppercase">
            <span>† Central Altar</span>
          </div>
         
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">
            Ecclesia Church Management
          </h2>
         
          <p className="text-xs text-[#444748] leading-relaxed">
            A peaceful sanctuary for management. Access the sacred and administrative duties of the parish from this central altar.
          </p>

         
          <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-[#1a1c1c] font-medium">
           
            <span className="flex items-center gap-1.5 bg-[#f4f3f3] px-3 py-1 rounded-md border border-[#e1e3e3]">
              <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
              {memberCount} Active Parishioners
            </span>
          </div>
        </div>
      </div>

     
     
      <div>
       
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[#1a1c1c] tracking-wide uppercase font-serif">
            Management Modules
          </h3>
          <span className="text-xs text-[#444748]">Select a module or function to enter</span>
        </div>

       
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
         
          {visiblePanels.map((panel) => (
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

     
     
      <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#444748]">
       
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connectivityStatus === 'online'
                  ? 'bg-emerald-500'
                  : connectivityStatus === 'syncing'
                  ? 'bg-blue-500 animate-pulse'
                  : 'bg-amber-500'
              }`}
            />
            <span className="font-medium text-[#1a1c1c]">
              {connectivityStatus === 'online' && 'Database Sync: Active'}
              {connectivityStatus === 'syncing' && 'Syncing offline changes...'}
              {connectivityStatus === 'offline' && 'Offline — showing cached data'}
            </span>
          </div>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">
              {pendingCount} change{pendingCount === 1 ? '' : 's'} pending sync
            </span>
          )}
          {lastSyncedAt && connectivityStatus === 'offline' && (
            <span className="text-[10px] text-[#444748]">
              Last synced: {new Date(lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

       
        <p className="italic text-[#1a1c1c] font-serif text-center md:text-right">
          "Servants of the Lord, let us manage His house with integrity."
        </p>
      </div>
    </div>
  );
};
