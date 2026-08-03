import React, { useState, useEffect } from 'react';
import { InventorySubTab, InventoryItem, DeliveryRecord, SaleRecord, StockTakeRecord, StockIssueRecord } from '../../types';
import { inventoryApi } from '../../services/api';

export const InventoryView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<InventorySubTab>('inward');

  // Stock inventory list
  const [items, setItems] = useState<InventoryItem[]>([]);

  // Notifications
  const [notification, setNotification] = useState<string | null>(null);
  const showNotif = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  // Sub-tab 1: Goods Inward state
  const [supplierName, setSupplierName] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [inwardItem, setInwardItem] = useState('');
  const [dateReceived, setDateReceived] = useState('');
  const [qtyReceived, setQtyReceived] = useState<number>(0);
  const [unitCost, setUnitCost] = useState<number>(0);

  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);

  const handleGoodsInwardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qtyReceived <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    try {
      await inventoryApi.deliveries.create({
        supplier: supplierName,
        inv: invoiceRef,
        date: dateReceived || new Date().toLocaleDateString('en-GB'),
        units: qtyReceived,
        cat: inwardItem,
        total: qtyReceived * unitCost
      });
      const [delRows, itemRows] = await Promise.all([inventoryApi.deliveries.list(), inventoryApi.items.list()]);
      setDeliveries(delRows);
      setItems(itemRows);
      setQtyReceived(0);
      showNotif(`Received ${qtyReceived} units of ${inwardItem} into inventory!`);
    } catch (error) {
      console.error('Failed to record delivery', error);
      alert(error instanceof Error ? error.message : 'Failed to record delivery');
    }
  };

  // Sub-tab 2: Sale state
  const [saleItem, setSaleItem] = useState('');
  const [saleQty, setSaleQty] = useState<number>(1);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  const [salesHistory, setSalesHistory] = useState<SaleRecord[]>([]);

  const handleProcessSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = saleQty * salePrice;
    try {
      await inventoryApi.sales.create({
        item: saleItem,
        time: new Date().toLocaleString(),
        amount: total
      });
      const [saleRows, itemRows] = await Promise.all([inventoryApi.sales.list(), inventoryApi.items.list()]);
      setSalesHistory(saleRows);
      setItems(itemRows);
      setCustomerName('');
      showNotif(`Processed sale of $${total.toFixed(2)} for ${saleItem}!`);
    } catch (error) {
      console.error('Failed to process sale', error);
      alert(error instanceof Error ? error.message : 'Failed to process sale');
    }
  };

  // Sub-tab 3: Stock Take state
  const [stockTake, setStockTake] = useState<StockTakeRecord[]>([]);

  const handleUpdatePhysicalCount = async (id: string, count: number) => {
    try {
      const updated = await inventoryApi.stockTakes.updatePhysical(id, count);
      setStockTake(stockTake.map((st) => (st.id === id ? updated : st)));
    } catch (error) {
      console.error('Failed to update physical count', error);
      alert(error instanceof Error ? error.message : 'Failed to update physical count');
    }
  };

  // Sub-tab 4: Stock Issue state
  const [issueItem, setIssueItem] = useState('');
  const [issueQty, setIssueQty] = useState<number>(1);
  const [issueReason, setIssueReason] = useState('Liturgical Use');
  const [recipientDept, setRecipientDept] = useState('');
  const [auditNotes, setAuditNotes] = useState('');

  const [issueTrail, setIssueTrail] = useState<StockIssueRecord[]>([]);

  const handleConfirmIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issueQty <= 0) return;
    try {
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

  // Sub-tab 5: Edit Item / Service state
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCost, setEditCost] = useState<number>(0);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editReorder, setEditReorder] = useState<number>(0);
  const [allowPartial, setAllowPartial] = useState(true);
  const [taxExempt, setTaxExempt] = useState(false);
  const [requireAdmin, setRequireAdmin] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [itemRows, delRows, saleRows, stockRows, issueRows] = await Promise.all([
          inventoryApi.items.list(),
          inventoryApi.deliveries.list(),
          inventoryApi.sales.list(),
          inventoryApi.stockTakes.list(),
          inventoryApi.issues.list()
        ]);
        setItems(itemRows);
        setDeliveries(delRows);
        setSalesHistory(saleRows);
        setStockTake(stockRows);
        setIssueTrail(issueRows);
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

  const handleUpdateItem = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const rows = await inventoryApi.items.list();
      setItems(rows);
      showNotif(`Updated details for "${editName}"!`);
    } catch (error) {
      console.error('Failed to update item', error);
      alert(error instanceof Error ? error.message : 'Failed to update item');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-4">
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1a1c1c]">Inventory Management</h2>
          <p className="text-xs text-[#444748] italic mt-1">
            "Manage sacred vessels, liturgical supplies, and parish goods with stewardship and meticulous care."
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-base text-[#444748]">
              search
            </span>
            <input
              type="text"
              placeholder="Search inventory..."
              className="pl-8 pr-3 py-1.5 bg-[#f4f3f3] border border-[#e1e3e3] rounded-md text-xs w-48 focus:outline-none focus:border-[#1e1e1e]"
            />
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-[#e1e3e3] gap-6 text-xs font-bold tracking-wider uppercase">
        {(['inward', 'sale', 'stock_take', 'issue', 'edit'] as InventorySubTab[]).map((tab) => {
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

      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-lg text-emerald-800 text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined text-base">check_circle</span>
          <span>{notification}</span>
        </div>
      )}

      {/* 1. GOODS INWARD */}
      {activeSubTab === 'inward' && (
        <div className="space-y-6">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4 max-w-4xl">
            <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
              Receive Supplier Stock
            </h3>

            <form onSubmit={handleGoodsInwardSubmit} className="space-y-4 text-xs">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Item Name</label>
                  <select
                    value={inwardItem}
                    onChange={(e) => setInwardItem(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
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

              <div className="p-3 bg-[#f4f3f3] border border-[#e1e3e3] rounded flex justify-between items-center text-xs">
                <span className="font-bold text-[#444748] uppercase">ENTRY SUMMARY</span>
                <span className="font-serif font-bold text-sm text-[#1a1c1c]">
                  ESTIMATED TOTAL: ${(qtyReceived * unitCost).toFixed(2)}
                </span>
              </div>

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
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer flex items-center gap-1"
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
                  <div className="text-right">
                    <div className="font-bold text-[#1e1e1e]">${d.total.toFixed(2)}</div>
                    <div className="text-[11px] text-[#444748]">
                      {d.units} Units {d.cat}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. SALE */}
      {activeSubTab === 'sale' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sale Form (8 Cols) */}
          <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-[#e1e3e3] pb-3">
              <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
                Transaction Details
              </h3>
              <span className="px-2.5 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-[11px] font-mono text-[#444748]">
                REF: TXN-2023-0824
              </span>
            </div>

            <form onSubmit={handleProcessSale} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#1a1c1c] font-medium mb-1">Select Item or Service</label>
                  <select
                    value={saleItem}
                    onChange={(e) => setSaleItem(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                  >
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
                  <div className="p-2 bg-[#eeeeee] border border-[#e1e3e3] rounded font-serif font-bold text-sm text-[#1a1c1c]">
                    ${(saleQty * salePrice).toFixed(2)}
                  </div>
                </div>
              </div>

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
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
                >
                  PROCESS SALE
                </button>
              </div>
            </form>
          </div>

          {/* Right Column: Vestry Banner & Today's Transactions (4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl overflow-hidden shadow-xs">
              <div className="h-28 bg-[#2a2d2d] text-white p-4 flex flex-col justify-end">
                <span className="text-[10px] tracking-widest uppercase font-bold text-[#a0a4a4]">
                  STEWARDSHIP VIEW
                </span>
                <h4 className="text-base font-serif font-bold">Central Vestry Inventory</h4>
              </div>
            </div>

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
                    <div className="font-bold text-[#1e1e1e]">${s.amount.toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[#e1e3e3] flex justify-between items-center text-xs font-bold text-[#1a1c1c]">
                <span>Daily Total</span>
                <span className="text-sm font-serif">${salesHistory.reduce((acc, curr) => acc + curr.amount, 0).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. STOCK TAKE */}
      {activeSubTab === 'stock_take' && (
        <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e1e3e3] pb-3">
            <div>
              <span className="text-[10px] font-bold text-[#444748] tracking-widest uppercase">
                ASSET MANAGEMENT
              </span>
              <h3 className="text-xl font-serif font-bold text-[#1a1c1c]">
                Inventory Stock Take
              </h3>
              <p className="text-xs text-[#444748]">
                Audit of physical quantities against ledger system counts.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => alert("Exporting stock take reconciliation sheet...")}
                className="px-3 py-1.5 text-xs font-semibold text-[#1a1c1c] bg-[#ffffff] border border-[#c4c7c7] rounded hover:bg-[#f4f3f3] cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                Export Sheet
              </button>
              <button
                onClick={() => showNotif("System stock counts balanced with physical audit.")}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#1e1e1e] rounded hover:bg-[#333333] cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">sync</span>
                Balance System Stock
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-[#e1e3e3] rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#f4f3f3] border-b border-[#e1e3e3] text-[10px] font-bold text-[#444748] uppercase tracking-wider">
                  <th className="p-3">Item Name</th>
                  <th className="p-3 text-center">System Count</th>
                  <th className="p-3 text-center">Physical Count</th>
                  <th className="p-3 text-center">Variance</th>
                  <th className="p-3">Adjustment Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e1e3e3]">
                {stockTake.map((st) => {
                  const variance = st.physical - st.system;
                  return (
                    <tr key={st.id} className="hover:bg-[#f9f9f9]">
                      <td className="p-3">
                        <div className="font-bold text-[#1a1c1c]">{st.name}</div>
                        <div className="text-[10px] font-mono text-[#777777]">SKU: {st.sku}</div>
                      </td>
                      <td className="p-3 text-center font-bold text-[#444748]">{st.system}</td>
                      <td className="p-3 text-center">
                        <input
                          type="number"
                          value={st.physical}
                          onChange={(e) => handleUpdatePhysicalCount(st.id, Number(e.target.value))}
                          className="w-16 px-2 py-1 text-center bg-[#f4f3f3] border border-[#e1e3e3] rounded font-bold text-[#1a1c1c]"
                        />
                      </td>
                      <td className={`p-3 text-center font-bold ${
                        variance < 0 ? 'text-rose-700' : variance > 0 ? 'text-emerald-700' : 'text-[#444748]'
                      }`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </td>
                      <td className="p-3">
                        <input
                          type="text"
                          placeholder="Add note..."
                          defaultValue={st.notes}
                          className="w-full px-2 py-1 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-[#f4f3f3] rounded-lg border border-[#e1e3e3] flex flex-col sm:flex-row justify-between items-center text-xs gap-2">
            <div className="flex gap-6">
              <div>
                <span className="text-[10px] text-[#444748] uppercase block">TOTAL ITEMS AUDITED</span>
                <span className="font-bold text-[#1a1c1c]">{stockTake.length}</span>
              </div>
              <div>
                <span className="text-[10px] text-[#444748] uppercase block">NET VARIANCE</span>
                <span className="font-bold text-rose-700">{stockTake.reduce((acc, st) => acc + (st.physical - st.system), 0)}</span>
              </div>
            </div>
            <div className="text-[11px] text-[#444748]">
              LAST SYNCED: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* 4. ISSUE */}
      {activeSubTab === 'issue' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-serif font-bold text-[#1a1c1c] flex items-center gap-2">
              <span className="material-symbols-outlined text-base">outbox</span>
              Stock Issue Record
            </h3>

            <form onSubmit={handleConfirmIssue} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Item Selection</label>
                <select
                  value={issueItem}
                  onChange={(e) => setIssueItem(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                >
                  {items.map((it) => (
                    <option key={it.id} value={it.name}>
                      {it.name} (Available: {it.stock} units)
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#444748] italic mt-1 uppercase tracking-wider">
                  CURRENT STOCK: {(items.find((it) => it.name === issueItem)?.stock ?? 0)} UNITS
                </p>
              </div>

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
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer uppercase"
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
              {issueTrail.map((tr) => (
                <div key={tr.id} className="p-3 bg-[#f4f3f3] rounded border border-[#e1e3e3] flex justify-between items-center">
                  <div className="font-bold text-[#1a1c1c]">{tr.item}</div>
                  <div className="text-[11px] text-[#444748]">{tr.dest}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. EDIT */}
      {activeSubTab === 'edit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Edit Form (8 Cols) */}
          <div className="lg:col-span-8 bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-6 shadow-xs space-y-4">
            <h3 className="text-base font-serif font-bold text-[#1a1c1c]">
              Edit Item Details or Billable Service
            </h3>
            <p className="text-xs text-[#444748]">
              Manage your parish's billable services and inventory thresholds. Ensure all financial data is accurate to maintain the transparency and trust of the congregation.
            </p>

            <form onSubmit={handleUpdateItem} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1a1c1c] font-medium mb-1">Item / Service Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#f4f3f3] border border-[#e1e3e3] rounded text-xs text-[#1a1c1c]"
                />
              </div>

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
                <p className="text-[10px] text-[#777777] italic mt-1">
                  System will trigger an alert when stock falls below this threshold.
                </p>
              </div>

              {/* Service Controls Checkboxes */}
              <div className="p-4 bg-[#f4f3f3] border border-[#e1e3e3] rounded-lg space-y-2">
                <span className="text-[10px] font-bold text-[#444748] uppercase tracking-wider block mb-1">
                  SERVICE CONTROLS
                </span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowPartial}
                    onChange={(e) => setAllowPartial(e.target.checked)}
                    className="accent-[#1e1e1e]"
                  />
                  <span>Allow Partial Payments</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxExempt}
                    onChange={(e) => setTaxExempt(e.target.checked)}
                    className="accent-[#1e1e1e]"
                  />
                  <span>Tax Exempt Organization-wide</span>
                </label>
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

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-[#1e1e1e] hover:bg-[#333333] rounded cursor-pointer"
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
            <div className="bg-[#ffffff] border border-[#e1e3e3] rounded-xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#1a1c1c] uppercase tracking-wider border-b border-[#e1e3e3] pb-2">
                STOCK INSIGHTS
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#444748]">Current Stock</span>
                  <span className="font-bold text-[#1a1c1c]">{items.find((it) => it.name === editName)?.stock ?? 0} Units</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#444748]">Unit Cost</span>
                  <span className="italic text-[#1a1c1c]">${editCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#e1e3e3]">
                  <span className="text-[#444748]">Stock Value</span>
                  <span className="font-bold text-[#1e1e1e]">${((items.find((it) => it.name === editName)?.stock ?? 0) * editCost).toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div className="bg-[#f4f3f3] border border-[#e1e3e3] rounded-xl p-6 space-y-2">
              <h4 className="text-xs font-serif font-bold text-[#1a1c1c]">Fiscal Responsibility</h4>
              <p className="text-xs text-[#444748] italic leading-relaxed">
                "Stewardship is not just about keeping account, but about honoring the resources given for the mission."
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
