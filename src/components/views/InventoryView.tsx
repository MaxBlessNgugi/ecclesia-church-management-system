// =============================================================================
// InventoryView — the Inventory Management panel
// -----------------------------------------------------------------------------
// Self-contained data view rendered inside the module shell. It owns ALL of its
// own state and data flow: on mount it parallel-fetches every inventory
// collection (items, deliveries, sales, stock-takes, issues) via inventoryApi
// and stores each in local React state. There is no dedicated loading/error UI —
// failures are logged to the console and the affected table renders empty.
//
// Sub-tabs (InventorySubTab in src/types.ts): inward, sale, stock_take, issue,
// edit. Switching tabs only flips activeSubTab; every collection stays cached
// in state. Mutation handlers (create / update) POST/PATCH to the Express API
// and then re-fetch the affected lists so the tables reflect server truth.
//
// All inventory sub-resources (items, deliveries, sales, stock-takes, issues)
// support soft-delete via the DeleteConfirmationModal. Deleted records are
// restorable from Admin > Trash & Audit.
// =============================================================================
// React core: component framework, local state, side-effects, and derived state via useMemo
import React, { useState, useEffect, useMemo } from 'react';
// Domain types: sub-tab union, inventory item, delivery, sale, stock take,
// stock issue, and price audit log
import { InventorySubTab, InventoryItem, DeliveryRecord, SaleRecord, StockTakeRecord, StockIssueRecord, InventoryPriceAuditLog } from '../../types';
// API client for all inventory endpoints: items, deliveries, sales, stockTakes, issues
import { inventoryApi } from '../../services/api';
// Permission hook — provides canEdit / canDelete / canView gates per module key
import { usePermissions } from '../../permissions';
import { DeleteConfirmationModal } from '../DeleteConfirmationModal';

/**
 * Inventory Management panel: track sacred vessels, liturgical supplies and
 * parish goods via the Goods Inward, Sale, Stock Take, Issue and Edit tabs.
 * All data is loaded and mutated locally through inventoryApi; the component
 * takes no props and manages its own loading, error and sub-tab state.
 */
export const InventoryView: React.FC = () => {
  // Permission instance — checked before every submit to gate mutation buttons
  const perms = usePermissions();
  // Active sub-tab routing state — drives which of the five panels renders below.
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('inward');

  // Delete confirmation modal state — supports any inventory entity type
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string; label: string; details: string[] } | null>(null);

  // Stock inventory list — the source of truth for every item dropdown in the
  // view (Item Name, Sale item, Issue item, Edit form) and for Stock Insights.
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Global quick-search — the header "Search inventory..." box. When a term is
  // entered it narrows the catalogue (Edit-tab dropdown + Bulk Update list) to
  // matching items; the transaction forms keep the full list so no item is
  // ever hidden from data entry. Matches name, SKU or category (case-insensitive).
  const [inventorySearch, setInventorySearch] = useState('');
  // Derived filtered items — live-filtered by the search query
  const filteredItems = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.sku.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q)
    );
  }, [items, inventorySearch]);

  // Notifications — transient success banner, auto-dismissed after 4s.
  const [notification, setNotification] = useState<string | null>(null);
  // Shows a success notification that auto-clears after 4 seconds
  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Low-stock alerts: items whose current stock is at or below their reorder
  // threshold (a reorder level of 0 with 0 stock is also flagged as "out").
  const lowStockItems = useMemo(
    () => items.filter((it) => it.reorder > 0 ? it.stock <= it.reorder : it.stock === 0),
    [items]
  );

  // Price-history modal state — one item's append-only audit trail at a time.
  const [priceHistory, setPriceHistory] = useState<InventoryPriceAuditLog[]>([]);
  // Name of the item whose price history is displayed
  const [historyItemName, setHistoryItemName] = useState('');
  // Controls visibility of the price history modal
  const [showPriceHistory, setShowPriceHistory] = useState(false);

  // Fetches and opens the price history for the currently selected edit item.
  const handleOpenPriceHistory = async () => {
    // Guard: an item must be selected before viewing its history
    if (!editId) {
      alert('Select an item to edit first.');
      return;
    }
    try {
      // Fetch the price audit trail for the selected item
      const rows = await inventoryApi.items.history(editId);
      setPriceHistory(rows);
      // Resolve the item's display name for the modal header
      setHistoryItemName(items.find((it) => it.id === editId)?.name ?? 'Item');
      setShowPriceHistory(true);
    } catch (error) {
      console.error('Failed to load price history', error);
      alert(error instanceof Error ? error.message : 'Failed to load price history');
    }
  };

  // Sub-tab 1: Goods Inward — form fields for recording a supplier delivery.
  // Supplier name for the delivery record
  const [supplierName, setSupplierName] = useState('');
  // Invoice or reference number
  const [invoiceRef, setInvoiceRef] = useState('');
  // Item being received — matches an existing inventory item by name
  const [inwardItem, setInwardItem] = useState('');
  // Date the delivery was received
  const [dateReceived, setDateReceived] = useState('');
  // Quantity of units received
  const [qtyReceived, setQtyReceived] = useState<number>(0);
  // Unit cost price per item in dollars
  const [unitCost, setUnitCost] = useState<number>(0);

  // List of delivery records fetched from the server
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);

  // Handles the Goods Inward form submission — POSTs a delivery and refreshes data
  const handleGoodsInwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Guard: a zero/negative quantity makes no sense for a delivery record.
    if (qtyReceived <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    try {
      // POST the delivery; falls back to today's date (en-GB) when the user
      // left the date field empty so the record is always timestamped.
      await inventoryApi.deliveries.create({
        supplier: supplierName,
        inv: invoiceRef,
        date: dateReceived || new Date().toLocaleDateString('en-GB'),
        units: qtyReceived,
        cat: inwardItem,
        total: qtyReceived * unitCost
      });
      // Re-fetch deliveries AND items after the write so the Recent Deliveries
      // list and every item dropdown pick up the new stock level.
      const [delRows, itemRows] = await Promise.all([inventoryApi.deliveries.list(), inventoryApi.items.list()]);
      setDeliveries(delRows);
      setItems(itemRows);
      setQtyReceived(0); // Reset quantity so the next entry starts clean.
      showNotif(`Received ${qtyReceived} units of ${inwardItem} into inventory!`);
    } catch (error) {
      console.error('Failed to record delivery', error);
      alert(error instanceof Error ? error.message : 'Failed to record delivery');
    }
  };

  // Sub-tab 2: Sale — form fields for a point-of-sale transaction.
  // Item being sold — matches an existing inventory item by name
  const [saleItem, setSaleItem] = useState('');
  // Quantity being sold
  const [saleQty, setSaleQty] = useState<number>(1);
  // Unit selling price in dollars
  const [salePrice, setSalePrice] = useState<number>(0);
  // Optional customer name for the sale record
  const [customerName, setCustomerName] = useState('');
  // Payment method — Cash, M-Pesa, EFT, or Card
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  // List of sales records fetched from the server
  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);

  // Handles the Sale form submission — POSTs a sale and refreshes data
  const handleProcessSale = async (e: React.FormEvent) => {
    e.preventDefault();
    // Line total computed locally for the API payload and the success banner.
    const total = saleQty * salePrice;
    try {
      await inventoryApi.sales.create({
        item: saleItem,
        time: new Date().toLocaleString(),
        amount: total
      });
      // Refetch sales and items together so Today's Transactions and the item
      // dropdowns both reflect the reduced stock after the sale.
      const [saleRows, itemRows] = await Promise.all([inventoryApi.sales.list(), inventoryApi.items.list()]);
      setSalesHistory(saleRows);
      setItems(itemRows);
      setCustomerName(''); // Only clears the optional customer field after a successful sale.
      showNotif(`Processed sale of KSh ${total.toFixed(2)} for ${saleItem}!`);
    } catch (error) {
      console.error('Failed to process sale', error);
      alert(error instanceof Error ? error.message : 'Failed to process sale');
    }
  };

  // Sub-tab 3: Stock Take — physical-count audit rows (one per inventory item).
  const [stockTake, setStockTake] = useState<StockTakeRecord[]>([]);

  // Fires on every keystroke of the Physical Count input. PATCHes the new count
  // and swaps just the edited row in place (instead of refetching the whole
  // table) to keep the audit list interactive while the user types.
  const handleUpdatePhysicalCount = async (id: string, count: number) => {
    try {
      const updated = await inventoryApi.stockTakes.updatePhysical(id, count);
      setStockTake(stockTake.map((st) => (st.id === id ? updated : st)));
    } catch (error) {
      console.error('Failed to update physical count', error);
      alert(error instanceof Error ? error.message : 'Failed to update physical count');
    }
  };

  // Sub-tab 4: Stock Issue — records stock removed from inventory (e.g. liturgical
  // use, outreach donations) together with an audit trail entry.
  // Item being issued from inventory
  const [issueItem, setIssueItem] = useState('');
  // Quantity being issued
  const [issueQty, setIssueQty] = useState<number>(1);
  // Reason for the stock issue (e.g. Liturgical Use)
  const [issueReason, setIssueReason] = useState('Liturgical Use');
  // Recipient department or person
  const [recipientDept, setRecipientDept] = useState('');
  // Optional audit notes for the issue record
  const [auditNotes, setAuditNotes] = useState('');

  // List of stock issue records fetched from the server
  const [issueTrail, setIssueTrail] = useState<StockIssueRecord[]>([]);

  // Handles the Stock Issue form submission — POSTs an issue record and refreshes data
  const handleConfirmIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issueQty <= 0) return; // Silent guard: nothing issued for zero/negative qty.
    try {
      // Flattens qty + item and destination + reason into single display strings;
      // the backend stores the audit trail as one readable line per row.
      await inventoryApi.issues.create({
        item: `${issueQty}x ${issueItem}`,
        dest: `To: ${recipientDept} • ${issueReason}`
      });
      const rows = await inventoryApi.issues.list();
      setIssueTrail(rows);
      showNotif(`Issued ${issueQty} units of ${issueItem} to ${recipientDept}.`);
    } catch (error) {
      console.error('Failed to record stock issue', error);
      alert(error instanceof Error ? error.message : 'Failed to record stock issue');
    }
  };

  // Sub-tab 5: Edit Item / Service — fields + service-control flags for updating
  // an existing item. Note: allowPartial / taxExempt / requireAdmin are collected
  // but not sent to the API (the payload only covers name/category/cost/price/reorder).
  // ID of the item currently loaded in the edit form
  const [editId, setEditId] = useState('');
  // Edit form fields — name, category, cost, price, and reorder level
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCost, setEditCost] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editReorder, setEditReorder] = useState<number>(0);
  // Service control flags — collected but not yet sent to the API
  const [allowPartial, setAllowPartial] = useState(true);
  const [taxExempt, setTaxExempt] = useState(false);
  const [requireAdmin, setRequireAdmin] = useState(true);

  // Bulk update state: a checkbox selection over the catalogue plus the shared
  // field/value to apply to every selected row via the batch-update endpoint.
  // Set of item IDs selected for bulk update
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  // Which field to update across selected items: reorder, price, or cost
  const [bulkField, setBulkField] = useState<'reorder' | 'price' | 'cost'>('reorder');
  // The shared value to apply to the selected field
  const [bulkValue, setBulkValue] = useState<string>('');

  // Mount-time data load: fetch every inventory collection in parallel so each
  // sub-tab has data ready on first render (no lazy loading). Also seeds the
  // forms with the first item so dropdowns/fields are never empty on load.
  useEffect(() => {
    (async () => {
      try {
        // Fetch all five inventory collections in parallel
        const [itemRows, delRows, saleRows, stockRows, issueRows] = await Promise.all([
          inventoryApi.items.list(),
          inventoryApi.deliveries.list(),
          inventoryApi.sales.list(),
          inventoryApi.stockTakes.list(),
          inventoryApi.issues.list()
        ]);
        // Store each collection in local state
        setItems(itemRows);
        setDeliveries(delRows);
        setSalesHistory(saleRows);
        setStockTake(stockRows);
        setIssueTrail(issueRows);
        // Pre-select the first item (by name/id) into every form control that
        // references an item; guards against null selections before any item exists.
        if (itemRows.length > 0) {
          const first = itemRows[0];
          setInwardItem(first.name);
          setSaleItem(first.name);
          setSalePrice(first.price);
          setIssueItem(first.name);
          setEditId(first.id);
          setEditName(first.name);
          setEditCategory(first.category);
          setEditCost(first.cost);
          setEditPrice(first.price);
          setEditReorder(first.reorder);
        }
      } catch (error) {
        console.error('Failed to load inventory', error);
      }
    })();
  }, []);

  // Handles the Edit Item form submission — PATCHes the item and refreshes data
  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    // Edge case: an update is only valid once at least one item exists. With an
    // empty inventory the pre-selection above never runs, so editId stays ''.
    if (!editId) {
      alert('No inventory item selected for editing. Please add an item first.');
      return;
    }
    try {
      await inventoryApi.items.update(editId, {
        name: editName,
        category: editCategory,
        cost: editCost,
        price: editPrice,
        reorder: editReorder
      });
      // Refresh the items list so dropdowns and Stock Insights reflect the changes
      const rows = await inventoryApi.items.list();
      setItems(rows);
      showNotif(`Updated details for "${editName}"!`);
    } catch (error) {
      console.error('Failed to update item', error);
      alert(error instanceof Error ? error.message : 'Failed to update item');
    }
  };

  // Item selector for the edit form: picks which catalogue row the form edits
  // (the mount effect pre-selects the first item).
  const handleSelectEditItem = (item: InventoryItem) => {
    setEditId(item.id);
    setEditName(item.name);
    setEditCategory(item.category);
    setEditCost(item.cost);
    setEditPrice(item.price);
    setEditReorder(item.reorder);
  };

  // Toggle a single row in/out of the bulk selection.
  const handleToggleBulkItem = (id: string) => {
    const next = new Set(bulkSelected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setBulkSelected(next);
  };

  // Select or deselect all items in the catalogue
  const handleSelectAllItems = () => {
    setBulkSelected(bulkSelected.size === items.length ? new Set() : new Set(items.map((it) => it.id)));
  };

  // Applies the shared field value to every selected row via batch-update, then
  // refreshes the catalogue and clears the selection.
  const handleBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(bulkValue);
    // Guard: at least one item must be selected
    if (bulkSelected.size === 0) {
      alert('Select at least one item to update.');
      return;
    }
    // Guard: value must be a valid non-negative number
    if (!Number.isFinite(value) || value < 0) {
      alert('Please enter a valid non-negative value.');
      return;
    }
    try {
      // Build an array of { id, [field]: value } for each selected item
      const updates = [...bulkSelected].map((id) => ({ id, [bulkField]: value }));
      const updated = await inventoryApi.items.batchUpdate(updates);
      // Merge updated items back into the local list
      setItems(items.map((it) => updated.find((u) => u.id === it.id) ?? it));
      // Clear the selection and value input
      setBulkSelected(new Set());
      setBulkValue('');
      showNotif(`Updated ${updates.length} ${updates.length === 1 ? 'item' : 'items'} (${bulkField}) to ${value}.`);
    } catch (error) {
      console.error('Failed to batch update items', error);
      alert(error instanceof Error ? error.message : 'Failed to batch update items');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          {/* Page title */}
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Inventory Management</h2>
          {/* Subtitle — pastoral stewardship quote */}
          <p className="text-xs text-[#444748] italic mt-1">
            "Manage sacred vessels, liturgical supplies, and parish goods with stewardship and meticulous care."
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            {/* Global quick-search: live-filters the catalogue and bulk-update
                lists in the Edit tab (name / SKU / category match). */}
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
              search
            </span>
            <input
              type="text"
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Search inventory..."
              className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-48 focus:outline-none focus:border-[#1e1e1e]"
            />
            {/* Clear search button — only visible when there is a query */}
            {inventorySearch && (
              <button
                onClick={() => setInventorySearch('')}
                className="absolute right-1.5 top-1.5 text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>
          {/* Search result count — only shown when filtering */}
          {inventorySearch.trim() && (
            <span className="text-[10px] text-[#444748] font-medium">
              {filteredItems.length} of {items.length} items
            </span>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs — one button per InventorySubTab; the active tab
          gets an underline, inactive tabs are muted. Clicking just swaps
          activeSubTab (no data refetch needed; all lists stay cached). */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase">
        {/* Map over the five sub-tab keys */}
        {(['inward', 'sale', 'stock_take', 'issue', 'edit'] as InventorySubTab[]).map((tab) => {
          // Display labels for each sub-tab
          const labels: Record<InventorySubTab, string> = {
            inward: 'GOODS INWARD',
            sale: 'SALE',
            stock_take: 'STOCK TAKE',
            issue: 'ISSUE',
            edit: 'EDIT'
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`pb-2 transition-colors cursor-pointer ${
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

      {/* Success banner — appears after each successful mutation, auto-clears. */}
      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* Low-stock alert — amber banner listing every item at/below its reorder
          threshold. Dismissible per item; click a name to jump to the Edit tab. */}
      {lowStockItems.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-2 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
            <span className="material-symbols-outlined text-base">warning</span>
            LOW STOCK ALERT — {lowStockItems.length} {lowStockItems.length === 1 ? 'item' : 'items'} at or below reorder level
          </div>
          <div className="flex flex-wrap gap-2">
            {/* One button per low-stock item — clicking navigates to the Edit tab */}
            {lowStockItems.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  const item = items.find((x) => x.id === it.id);
                  if (item) handleSelectEditItem(item);
                  setActiveSubTab('edit');
                }}
                className="px-2.5 py-1 bg-[#ffffff] border border-amber-400 rounded-full text-[10px] font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
              >
                {it.name} — {it.stock} left
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 1. GOODS INWARD — supplier delivery form + Recent Deliveries ledger. */}
      {activeSubTab === 'inward' && (
        <div className="space-y-6">
          {/* Delivery entry form */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4 max-w-4xl">
            {/* Section title */}
            <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
              Receive Supplier Stock
            </h3>

            {/* Delivery form — supplier, invoice, item, date, qty, cost */}
            <form onSubmit={handleGoodsInwardSubmit} className="space-y-4 text-xs">
              {/* Supplier Name and Invoice Ref — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Supplier Name</label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Invoice / Ref No</label>
                  <input
                    type="text"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Item Name (dropdown) and Date Received — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Item Name</label>
                  <select
                    value={inwardItem}
                    onChange={(e) => setInwardItem(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    {/* One option per inventory item */}
                    {items.map((it) => (
                      <option key={it.id} value={it.name}>
                        {it.name} ({it.category})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Date Received</label>
                  <input
                    type="text"
                    value={dateReceived}
                    onChange={(e) => setDateReceived(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Quantity Received and Unit Cost — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Quantity Received</label>
                  <input
                    type="number"
                    value={qtyReceived}
                    onChange={(e) => setQtyReceived(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Unit Cost Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Entry Summary — computed total */}
              <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded flex justify-between items-center text-xs">
                <span className="font-bold text-[#444748] uppercase">ENTRY SUMMARY</span>
                <span className="font-serif font-bold text-sm text-[#1a1c1c]">
                  ESTIMATED TOTAL: ${(qtyReceived * unitCost).toFixed(2)}
                </span>
              </div>

              {/* Clear Form and Submit buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setQtyReceived(0)}
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded flex items-center gap-1 ${
                    perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                  disabled={!perms.canEdit('inventory')}
                >
                  <span className="material-symbols-outlined text-sm">add_circle</span>
                  Update Inventory
                </button>
              </div>
            </form>
          </div>

          {/* Recent Deliveries List */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-3 max-w-4xl">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
              Recent Deliveries
            </h4>

            <div className="space-y-2 text-xs">
              {deliveries.map((d) => (
                <div key={d.id} className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3] flex justify-between items-center">
                  <div>
                    <div className="font-bold text-[#1a1c1c]">{d.supplier}</div>
                    <div className="text-[11px] text-[#444748]">
                      Inv: {d.inv} • {d.date}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-bold text-[#1e1e1e]">${d.total.toFixed(2)}</div>
                      <div className="text-[11px] text-[#444748]">
                        {d.units} Units {d.cat}
                      </div>
                    </div>
                    {perms.canDelete('inventory') && (
                      <button
                        onClick={() => setDeleteTarget({ type: 'delivery', id: d.id, label: `${d.supplier} delivery (${d.inv})`, details: [`Date: ${d.date}`, `Units: ${d.units}`, `Total: $${d.total.toFixed(2)}`] })}
                        className="text-[#ba1a1a] hover:text-red-700 text-xs"
                        title="Delete delivery"
                        aria-label="Delete delivery"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. SALE — point-of-sale form (8-col) + Stewardship banner and Today's
          Transactions feed with a live daily total (4-col). */}
      {activeSubTab === 'sale' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sale Form (8 Cols) */}
          <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Header row with title and reference badge */}
            <div className="flex items-center justify-between border-b border-[#e1e3e3] pb-3">
              <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
                Transaction Details
              </h3>
              {/* Reference number badge */}
              <span className="px-2.5 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] font-mono text-[#444748]">
                REF: TXN-2023-0824
              </span>
            </div>

            {/* Sale form — item, qty, price, customer, payment method */}
            <form onSubmit={handleProcessSale} className="space-y-4 text-xs">
              {/* Item selector and Quantity — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Select Item or Service</label>
                  <select
                    value={saleItem}
                    onChange={(e) => setSaleItem(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    {/* One option per inventory item with price */}
                    {items.map((it) => (
                      <option key={it.id} value={it.name}>
                        {it.name} (${it.price.toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Quantity</label>
                  <input
                    type="number"
                    value={saleQty}
                    onChange={(e) => setSaleQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Unit Selling Price and computed Total — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Unit Selling Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Total Amount ($)</label>
                  {/* Read-only computed total */}
                  <div className="p-2 bg-[#eeeeee] border border-[#e1e3e3] rounded font-serif font-bold text-sm text-[#1a1c1c]">
                    ${(saleQty * salePrice).toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Customer name (optional) and Payment Method — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">
                    Customer / Christian Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    <option value="Cash">Cash</option>
                    <option value="M-Pesa / Push">M-Pesa / Push</option>
                    <option value="EFT">EFT / Bank Transfer</option>
                    <option value="Card">Card</option>
                  </select>
                </div>
              </div>

              {/* Clear Form and Process Sale buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-[#e1e3e3]">
                <button
                  type="button"
                  onClick={() => setCustomerName('')}
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  CLEAR FORM
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                    perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                  disabled={!perms.canEdit('inventory')}
                >
                  PROCESS SALE
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Vestry Banner & Today's Transactions (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Stewardship dark banner */}
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl overflow-hidden shadow-xs">
              <div className="h-28 bg-[#2a2d2d] text-white p-4 flex flex-col justify-end">
                <span className="text-[10px] tracking-widest uppercase font-bold text-[#a0a4a4]">
                  STEWARDSHIP VIEW
                </span>
                <h4 className="text-base font-serif font-bold">Central Vestry Inventory</h4>
              </div>
            </div>

            {/* Today's Transactions feed */}
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                TODAY'S TRANSACTIONS
              </h4>

              <div className="space-y-2 text-xs">
                {salesHistory.map((s) => (
                  <div key={s.id} className="p-2.5 bg-[#f4f3f3] rounded border border-[#e1e3e3] flex justify-between items-center">
                    <div>
                      <div className="font-bold text-[#1a1c1c]">{s.item}</div>
                      <div className="text-[10px] text-[#444748]">{s.time}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-[#1e1e1e]">${s.amount.toFixed(2)}</div>
                      {perms.canDelete('inventory') && (
                        <button
                          onClick={() => setDeleteTarget({ type: 'sale', id: s.id, label: `${s.item} sale ($${s.amount.toFixed(2)})`, details: [`Time: ${s.time}`] })}
                          className="text-[#ba1a1a] hover:text-red-700"
                          title="Delete sale"
                          aria-label="Delete sale"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Daily total — sum of all sales */}
              <div className="pt-2 border-t border-[#e1e3e3] flex justify-between items-center text-xs font-bold text-[#1a1c1c]">
                <span>Daily Total</span>
                <span className="text-sm font-serif">${salesHistory.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. STOCK TAKE — audit table comparing system vs physical counts; the
          Physical Count inputs PATCH on every keystroke. */}
      {activeSubTab === 'stock_take' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          {/* Header row with title and action buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-3">
            <div>
              {/* Section label */}
              <span className="text-[10px] font-bold text-[#444748] tracking-widest uppercase">
                ASSET MANAGEMENT
              </span>
              {/* Section title */}
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">
                Inventory Stock Take
              </h3>
              {/* Subtitle */}
              <p className="text-xs text-[#444748]">
                Audit of physical quantities against ledger system counts.
              </p>
            </div>

            <div className="flex gap-2">
              {/* Stub actions: both only show an alert; no export/rebalance logic. */}
              <button
                onClick={() => alert("Exporting stock take reconciliation sheet...")}
                className="px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Export Sheet
              </button>
              <button
                onClick={() => showNotif("System stock counts balanced with physical audit.")}
                className={`px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] rounded hover:bg-[#333333] flex items-center gap-1 ${
                  perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                }`}
                disabled={!perms.canEdit('inventory')}
              >
                <span className="material-symbols-outlined text-sm">sync</span>
                Balance System Stock
              </button>
            </div>
          </div>

          {/* Stock take audit table */}
          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                {/* Table header — item name, system count, physical count, variance, notes */}
                <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                  <th className="p-3">Item Name</th>
                  <th className="p-3 text-center">System Count</th>
                  <th className="p-3 text-center">Physical Count</th>
                  <th className="p-3 text-center">Variance</th>
                  <th className="p-3">Adjustment Notes</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e3e3]">
                {/* One row per stock-take record */}
                {stockTake.map((st) => {
                  const variance = st.physical - st.system;
                  return (
                    <tr key={st.id} className="hover:bg-[#f9f9f9]">
                      {/* Item name and SKU */}
                      <td className="p-3">
                        <div className="font-bold text-[#1a1c1c]">{st.name}</div>
                        <div className="text-[10px] font-mono text-[#777777]">SKU: {st.sku}</div>
                      </td>
                      {/* System count — read-only */}
                      <td className="p-3 text-center font-bold text-[#444748]">{st.system}</td>
                      {/* Physical count — editable input, PATCHes on every keystroke */}
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          value={st.physical}
                          onChange={(e) => handleUpdatePhysicalCount(st.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 text-center bg-[#f4f3f3] border border-[#e1e3e3] rounded font-bold text-[#1a1c1c]"
                        />
                      </td>
                      {/* Variance coloring: overage (physical > system) is emerald,
                          shortage is rose, balanced stays neutral; + prefix on positive. */}
                      <td className={`p-3 text-center font-bold ${
                        variance < 0 ? 'text-rose-700' : variance > 0 ? 'text-emerald-700' : 'text-[#444748]'
                      }`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </td>
                      {/* Adjustment notes — free-text input */}
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Add note..."
                          defaultValue={st.notes}
                          className="w-full px-2 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                        />
                      </td>
                      <td className="p-3 text-right">
                        {perms.canDelete('inventory') && (
                          <button
                            onClick={() => setDeleteTarget({ type: 'stockTake', id: st.id, label: `${st.name} stock take`, details: [`System: ${st.system}`, `Physical: ${st.physical}`, `Variance: ${st.physical - st.system}`] })}
                            className="text-[#ba1a1a] hover:text-red-700 text-xs"
                            title="Delete stock take"
                            aria-label="Delete stock take"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary bar — total items audited, net variance, and last sync time */}
          <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3] flex flex-col sm:flex-row justify-between items-center text-xs gap-2">
            <div className="flex gap-6">
              <div>
                <span className="text-[10px] text-[#444748] uppercase block">TOTAL ITEMS AUDITED</span>
                <span className="font-bold text-[#1a1c1c]">{stockTake.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#444748] uppercase block">NET VARIANCE</span>
                {/* Aggregate shortage/overage across all audited items; always red
                    here (placeholder), not driven by the sign of the sum. */}
                <span className="font-bold text-rose-700">{stockTake.reduce((acc, st) => acc + (st.physical - st.system), 0)}</span>
              </div>
            </div>
            <div className="text-[11px] text-[#444748]">
              LAST SYNCED: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 4. ISSUE — stock removal form (with a live available-units hint) plus
          the recent issue audit trail. */}
      {activeSubTab === 'issue' && (
        <div className="space-y-6 max-w-4xl">
          {/* Stock Issue form */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Section title with icon */}
            <h3 className="text-base font-serif font-bold text-[#1a1c1c] flex items-center gap-2">
              <span className="material-symbols-outlined text-base">outbox</span>
              Stock Issue Record
            </h3>

            {/* Issue form — item, qty, reason, recipient, notes */}
            <form onSubmit={handleConfirmIssue} className="space-y-4 text-xs">
              {/* Item selection dropdown */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Item Selection</label>
                <select
                  value={issueItem}
                  onChange={(e) => setIssueItem(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  {/* One option per item with available stock count */}
                  {items.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name} (Available: {it.stock} units)
                    </option>
                  ))}
                </select>
                {/* Live stock level hint below the dropdown */}
                <p className="text-[10px] text-[#444748] italic mt-1 uppercase tracking-wider">
                  CURRENT STOCK: {(items.find((it) => it.name === issueItem)?.stock ?? 0)} UNITS
                </p>
              </div>

              {/* Quantity Issued and Issue Reason — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Quantity Issued</label>
                  <input
                    type="number"
                    value={issueQty}
                    onChange={(e) => setIssueQty(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  />
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Issue Reason</label>
                  <select
                    value={issueReason}
                    onChange={(e) => setIssueReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    <option value="Liturgical Use">Liturgical Use</option>
                    <option value="Parish Outreach / Donation">Parish Outreach / Donation</option>
                    <option value="Administrative Office">Administrative Office</option>
                  </select>
                </div>
              </div>

              {/* Recipient / Department input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">
                  Recipient / Department
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sacristy, St. Jude's Soup Kitchen, Father Michael"
                  value={recipientDept}
                  onChange={(e) => setRecipientDept(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              {/* Audit Notes textarea — optional */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">
                  Audit Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide additional context for this removal from inventory..."
                  value={auditNotes}
                  onChange={(e) => setAuditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                ></textarea>
              </div>

              {/* Clear Form and Confirm buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIssueQty(0)}
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  CLEAR FORM
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded uppercase ${
                    perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                  disabled={!perms.canEdit('inventory')}
                >
                  CONFIRM STOCK ISSUE
                </button>
              </div>
            </form>
          </div>

          {/* Audit Trail list */}
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
            <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
              RECENT AUDIT TRAIL
            </h4>
            <div className="space-y-2 text-xs">
              {/* One card per stock issue record */}
              {issueTrail.map((tr) => (
                <div key={tr.id} className="p-3 bg-[#f4f3f3] rounded border border-[#e1e3e3] flex justify-between items-center">
                  <div>
                    <div className="font-bold text-[#1a1c1c]">{tr.item}</div>
                    <div className="text-[11px] text-[#444748]">{tr.dest}</div>
                  </div>
                  {perms.canDelete('inventory') && (
                    <button
                      onClick={() => setDeleteTarget({ type: 'issue', id: tr.id, label: `${tr.item} issued to ${tr.dest}`, details: [] })}
                      className="text-[#ba1a1a] hover:text-red-700 text-xs"
                      title="Delete issue"
                      aria-label="Delete issue"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. EDIT — update item/service metadata and service-control flags (8-col)
          with a Stock Insights sidebar (4-col) derived from the items list. */}
      {activeSubTab === 'edit' && (
        <div className="space-y-6">
        {/* Two-column layout: edit form (8 cols) + insights sidebar (4 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Edit Form (8 Cols) */}
          <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            {/* Section title */}
            <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
              Edit Item Details or Billable Service
            </h3>
            {/* Subtitle */}
            <p className="text-xs text-[#444748]">
              Manage your parish's billable services and inventory thresholds. Ensure all financial data is accurate to maintain the transparency and trust of the congregation.
            </p>

            {/* Edit form — item selector, name, category, price, reorder, service controls */}
            <form onSubmit={handleUpdateItem} className="space-y-4 text-xs">
              {/* Item selector dropdown — filtered by the global search */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Select Item to Edit</label>
                <select
                  value={editId}
                  onChange={(e) => {
                    const item = items.find((it) => it.id === e.target.value);
                    if (item) handleSelectEditItem(item);
                  }}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  {/* Empty state when no items exist */}
                  {items.length === 0 && <option value="">No items available</option>}
                  {/* Empty state when search matches nothing */}
                  {filteredItems.length === 0 && items.length > 0 && (
                    <option value="">No items match your search</option>
                  )}
                  {/* One option per filtered item */}
                  {filteredItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} — {it.sku}
                    </option>
                  ))}
                </select>
              </div>

              {/* Item / Service Name input */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Item / Service Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

              {/* Billing Category and Retail Price — side by side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Billing Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
                    <option value="Liturgical Supplies">Liturgical Supplies</option>
                    <option value="Sacramental Documents">Sacramental Documents</option>
                    <option value="Religious Goods">Religious Goods</option>
                    <option value="Books">Books & Hymnals</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Service Fee / Retail Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editPrice}
                    onChange={(e) => setEditPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                  />
                </div>
              </div>

              {/* Minimum Reorder Level */}
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Minimum Reorder Level</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editReorder}
                    onChange={(e) => setEditReorder(Number(e.target.value))}
                    className="w-24 px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                  />
                  <span className="text-xs text-[#444748]">units remaining in stock</span>
                </div>
                {/* Helper text explaining the reorder alert threshold */}
                <p className="text-[10px] text-[#777777] italic mt-1">
                  System will trigger an alert when stock falls below this threshold.
                </p>
              </div>

              {/* Service Controls Checkboxes */}
              <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
                <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider block mb-1">
                  SERVICE CONTROLS
                </span>
                {/* Allow Partial Payments checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPartial}
                    onChange={(e) => setAllowPartial(e.target.checked)}
                    className="accent-[#1e1e1e]"
                  />
                  <span>Allow Partial Payments</span>
                </label>
                {/* Tax Exempt Organization-wide checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={(e) => setTaxExempt(e.target.checked)}
                    className="accent-[#1e1e1e]"
                  />
                  <span>Tax Exempt Organization-wide</span>
                </label>
                {/* Require Admin Authorization checkbox */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireAdmin}
                    onChange={(e) => setRequireAdmin(e.target.checked)}
                    className="accent-[#1e1e1e]"
                  />
                  <span>Require Admin Authorization</span>
                </label>
              </div>

              {/* Action buttons — Price History, Save, Discard */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleOpenPriceHistory}
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">history</span>
                  Price History
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                    perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                  disabled={!perms.canEdit('inventory')}
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] hover:bg-[#f4f3f3] rounded cursor-pointer"
                >
                  Discard
                </button>
              </div>
            </form>
          </div>

          {/* Right Column (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Stock Insights card */}
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                STOCK INSIGHTS
              </h4>
              <div className="space-y-2 text-xs">
                {/* Stock insights are looked up live by name from the items list;
                    falls back to 0 when editName matches nothing (e.g. before load). */}
                <div className="flex justify-between">
                  <span className="text-[#444748]">Current Stock</span>
                  <span className="font-bold text-[#1a1c1c]">{items.find((it) => it.name === editName)?.stock ?? 0} Units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#444748]">Unit Cost</span>
                  <span className="italic text-[#1a1c1c]">${editCost.toFixed(2)}</span>
                </div>
                {/* Stock value = current stock × unit cost */}
                <div className="flex justify-between pt-2 border-t border-[#e1e3e3]">
                  <span className="text-[#444748]">Stock Value</span>
                  <span className="font-bold text-[#1e1e1e]">${((items.find((it) => it.name === editName)?.stock ?? 0) * editCost).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Fiscal Responsibility quote */}
            <div className="bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl p-6 space-y-2">
              <h4 className="text-xs font-serif font-bold text-[#1a1c1c]">Fiscal Responsibility</h4>
              <p className="text-xs text-[#444748] italic leading-relaxed">
                "Stewardship is not just about keeping account, but about honoring the resources given for the mission."
              </p>
            </div>
          </div>
        </div>

        {/* Bulk Update — checkbox selection over the catalogue + one shared value
            applied to every selected row via the batch-update endpoint. */}
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#e1e3e3] pb-3">
            <div>
              {/* Section title */}
              <h4 className="text-sm font-serif font-bold text-[#1a1c1c]">Bulk Update Items</h4>
              {/* Subtitle */}
              <p className="text-xs text-[#444748]">
                Select multiple items and apply one shared value to their price, cost or reorder level.
              </p>
            </div>
            {/* Select All / Clear All toggle button */}
            <button
              type="button"
              onClick={handleSelectAllItems}
              disabled={!perms.canEdit('inventory')}
              className={`px-3 py-1 text-xs font-bold border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] ${
                perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              {bulkSelected.size === items.length && items.length > 0 ? 'Clear All' : 'Select All'}
            </button>
          </div>

          {/* Bulk update form — item checkboxes + field/value selector */}
          <form onSubmit={handleBulkUpdate} className="space-y-4">
            {/* Scrollable item list with checkboxes */}
            <div className="max-h-56 overflow-y-auto border border-[#e1e3e3] rounded-lg divide-y divide-[#e1e3e3]">
              {items.length === 0 ? (
                <p className="p-4 text-xs text-[#444748]">No items in the catalogue yet.</p>
              ) : filteredItems.length === 0 ? (
                <p className="p-4 text-xs text-[#444748]">
                  No items match "{inventorySearch}". Try a different term.
                </p>
              ) : (
                filteredItems.map((it) => (
                  <label key={it.id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-[#f9f9f9] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(it.id)}
                      onChange={() => handleToggleBulkItem(it.id)}
                      disabled={!perms.canEdit('inventory')}
                      className="accent-[#1e1e1e]"
                    />
                    <span className="font-bold text-[#1a1c1c]">{it.name}</span>
                    <span className="text-[#444748] font-mono">{it.sku}</span>
                    <span className="ml-auto text-[#444748]">
                      Stock {it.stock} • Price ${it.price.toFixed(2)}
                    </span>
                    {perms.canDelete('inventory') && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget({ type: 'item', id: it.id, label: `${it.name} (${it.sku})`, details: [`Category: ${it.category}`, `Stock: ${it.stock} units`, `Price: $${it.price.toFixed(2)}`] });
                        }}
                        className="text-[#ba1a1a] hover:text-red-700"
                        title="Delete item"
                        aria-label="Delete item"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </label>
                ))
              )}
            </div>

            {/* Field selector, shared value, and Apply button */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Field to Update</label>
                <select
                  value={bulkField}
                  onChange={(e) => setBulkField(e.target.value as 'reorder' | 'price' | 'cost')}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  <option value="reorder">Minimum Reorder Level</option>
                  <option value="price">Retail Price ($)</option>
                  <option value="cost">Unit Cost ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Shared Value</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  disabled={!perms.canEdit('inventory')}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs font-bold text-[#1a1c1c]"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!perms.canEdit('inventory')}
                  className={`w-full px-4 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded ${
                    perms.canEdit('inventory') ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  Apply to {bulkSelected.size} Selected
                </button>
              </div>
            </div>
          </form>
        </div>
        </div>
      )}

      {/* Price History Modal — append-only audit trail for the selected item's
          cost/retail price changes, with the actor who made each change. */}
      {showPriceHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowPriceHistory(false)} onKeyDown={(e) => e.key === 'Escape' && setShowPriceHistory(false)} role="dialog" aria-modal="true" tabIndex={-1}>
          {/* Modal card — stopPropagation prevents backdrop click from closing */}
          <div
            className="bg-[#ffffff] rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header — title and close button */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e1e3e3]">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#1a1c1c]">Price History</h3>
                <p className="text-[10px] text-[#444748]">{historyItemName} — cost & retail price audit trail</p>
              </div>
              {/* Close button */}
              <button
                onClick={() => setShowPriceHistory(false)}
                className="text-[#444748] hover:text-[#1a1c1c] cursor-pointer"
                aria-label="Close"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Price history entries — scrollable body */}
            <div className="overflow-y-auto p-5">
              {priceHistory.length === 0 ? (
                /* Empty state when no price changes exist */
                <p className="text-xs text-[#444748] text-center py-8">
                  No price changes recorded yet. Adjust cost or price to start the audit trail.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {/* One entry per price change */}
                  {priceHistory.map((entry) => (
                    <div key={entry.id} className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg text-xs space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Timestamp */}
                        <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                        {/* Actor who made the change */}
                        <span className="text-[10px] font-bold text-[#1e1e1e]">by {entry.actorName}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {/* Cost change — old → new */}
                        <div className="flex items-center gap-2">
                          <span className="text-[#444748]">Cost:</span>
                          <span className="font-bold text-[#1a1c1c]">
                            {entry.oldCost == null ? '—' : `KSh ${entry.oldCost.toFixed(2)}`}
                            <span className="mx-1 text-[#8a8e8e]">→</span>
                            KSh {(entry.newCost ?? 0).toFixed(2)}
                          </span>
                        </div>
                        {/* Price change — old → new */}
                        <div className="flex items-center gap-2">
                          <span className="text-[#444748]">Price:</span>
                          <span className="font-bold text-[#1a1c1c]">
                            {entry.oldPrice == null ? '—' : `KSh ${entry.oldPrice.toFixed(2)}`}
                            <span className="mx-1 text-[#8a8e8e]">→</span>
                            KSh {(entry.newPrice ?? 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DeleteConfirmationModal
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.type ? deleteTarget.type.charAt(0).toUpperCase() + deleteTarget.type.slice(1) : ''}`}
        recordLabel={deleteTarget?.label ?? ''}
        recordDetails={deleteTarget?.details}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            const apiMap: Record<string, () => Promise<void>> = {
              item: () => inventoryApi.items.remove(deleteTarget.id),
              delivery: () => inventoryApi.deliveries.remove(deleteTarget.id),
              sale: () => inventoryApi.sales.remove(deleteTarget.id),
              stockTake: () => inventoryApi.stockTakes.remove(deleteTarget.id),
              issue: () => inventoryApi.issues.remove(deleteTarget.id),
            };
            await apiMap[deleteTarget.type]();
            // Optimistically remove from local state
            if (deleteTarget.type === 'item') setItems(prev => prev.filter(i => i.id !== deleteTarget.id));
            else if (deleteTarget.type === 'delivery') setDeliveries(prev => prev.filter(d => d.id !== deleteTarget.id));
            else if (deleteTarget.type === 'sale') setSalesHistory(prev => prev.filter(s => s.id !== deleteTarget.id));
            else if (deleteTarget.type === 'stockTake') setStockTake(prev => prev.filter(s => s.id !== deleteTarget.id));
            else if (deleteTarget.type === 'issue') setIssueTrail(prev => prev.filter(i => i.id !== deleteTarget.id));
            setDeleteTarget(null);
            showNotif('Record moved to Trash. You can restore it from Administration → Trash & Audit.');
          } catch {
            alert('Failed to delete record. Please try again.');
          }
        }}
      />
    </div>
  );
};
