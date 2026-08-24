// =============================================================================
// Ecclesia CMS — Printable Contribution Receipt
// =============================================================================
//
// PURPOSE
//   Renders an official contribution (payment) receipt that can be printed via
//   react-to-print. The component is forwardRef'd so the print hook can target
//   the DOM node directly; it is styled for both on-screen display (inside the
//   confirmation modal) and print output (react-to-print clones it into an
//   iframe, so the page's own styles never leak into the hard copy).
//
// USAGE
//   const ref = useRef<HTMLDivElement>(null);
//   const print = useReactToPrint({ contentRef: ref });
//   ...
//   <ContributionReceipt ref={ref} receipt={lastContribution} />
//   <button onClick={print}>Print Receipt</button>
//
// RELATED FILES
//   - src/types.ts                        → ContributionRecord shape
//   - src/components/views/ActivitiesView.tsx → wires this into the payment flow
// =============================================================================
import { forwardRef } from 'react';
import { ContributionRecord, ParishSettings } from '../../types';

/** Props for the printable contribution receipt. */
export interface ContributionReceiptProps {
  /** The recorded contribution — drives every field on the receipt. */
  receipt: ContributionRecord;
  /** Receipt reference printed under the header (defaults to the record id). */
  receiptNo?: string;
  /** Parish identity from GET /api/parish. */
  parish?: ParishSettings;
}

/**
 * Converts a KES amount to words, e.g. 3250.5 → "Three Thousand Two Hundred
 * Fifty Shillings and Fifty Cents". Handles amounts up to billions.
 */
function amountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => {
    if (n < 20) return ones[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? tens[t] : `${tens[t]}-${ones[o]}`;
  };

  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const head = h > 0 ? `${ones[h]} Hundred` : '';
    const tail = rest > 0 ? (head ? ` ${twoDigits(rest)}` : twoDigits(rest)) : '';
    return `${head}${tail}`.trim();
  };

  const whole = Math.floor(amount);
  const cents = Math.round((amount - whole) * 100);

  if (whole === 0 && cents === 0) return 'Zero Shillings Only';

  const scales = ['', ' Thousand', ' Million', ' Billion'];
  let words = '';
  let n = whole;
  let scale = 0;
  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigits(chunk);
      words = `${chunkWords}${scales[scale]}${words ? ` ${words}` : ''}`;
    }
    n = Math.floor(n / 1000);
    scale++;
  }

  const shillings = `${words} Shillings`;
  const centsWords = cents > 0 ? ` and ${twoDigits(cents)} Cent${cents === 1 ? '' : 's'}` : '';
  return `${shillings}${centsWords} Only`;
}

/**
 * Printable official contribution receipt.
 * Rendered inside the payment confirmation modal and cloned by react-to-print
 * into the print iframe; `@media print` rules elsewhere hide the app chrome so
 * only this card appears on paper.
 */
export const ContributionReceipt = forwardRef<HTMLDivElement, ContributionReceiptProps>(
  function ContributionReceipt(
    { receipt, receiptNo, parish },
    ref
  ) {
    const parishName = parish?.name || 'ECCLESIA PARISH';
    // Months the member has marked as paid in the monthly giving tracker.
    const paidMonths = Object.entries(receipt.monthlyTracker ?? {})
      .filter(([, paid]) => paid)
      .map(([month]) => month);

    return (
      <div ref={ref} className="bg-white text-[#1a1c1c] font-serif">
        {/* Letterhead */}
        <div className="text-center border-b-2 border-[#1a1c1c] pb-3">
          {/* Parish logo (or placeholder) */}
          {parish?.logoData ? (
            <div className="flex justify-center mb-1">
              <img src={parish.logoData} alt="Parish logo" className="w-10 h-10 object-contain" />
            </div>
          ) : null}
          {/* Parish name */}
          <div className="text-2xl font-bold tracking-wide">† {parishName}</div>
          {/* Local church name */}
          {parish?.localChurch && (
            <p className="text-xs text-[#444748] mt-0.5">{parish.localChurch}</p>
          )}
          {/* Diocese */}
          {parish?.diocese && (
            <p className="text-[10px] text-[#444748] uppercase tracking-wider mt-0.5">{parish.diocese}</p>
          )}
          {/* Address and contact */}
          {(parish?.address || parish?.phone || parish?.email) && (
            <div className="text-[10px] text-[#444748] mt-0.5 space-y-0.5">
              {parish?.address && <p>{parish.address}</p>}
              {(parish?.phone || parish?.email) && (
                <p>
                  {parish?.phone && <span>{parish.phone}</span>}
                  {parish?.phone && parish?.email && <span> • </span>}
                  {parish?.email && <span>{parish.email}</span>}
                </p>
              )}
            </div>
          )}
          <p className="text-[10px] text-[#444748] uppercase tracking-[0.2em] mt-1">
            Official Contribution Receipt
          </p>
          <p className="text-[10px] font-mono text-[#1a1c1c] mt-1">
            Receipt No: {receiptNo ?? receipt.id} &nbsp;•&nbsp; Date: {receipt.date}
          </p>
        </div>

        {/* Body */}
        <div className="py-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[#444748]">Member:</span>
            <span className="font-bold">{receipt.memberName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#444748]">Registration No:</span>
            <span className="font-mono">{receipt.regNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#444748]">Contribution:</span>
            <span>{receipt.categories.join(', ')}{receipt.otherCategory ? ` — ${receipt.otherCategory}` : ''}</span>
          </div>
          {paidMonths.length > 0 && (
            <div className="flex justify-between">
              <span className="text-[#444748]">Monthly Tracker:</span>
              <span className="font-mono">{paidMonths.join(' • ')}</span>
            </div>
          )}

          {/* Amount in words */}
          <div className="pt-2 border-t border-[#e1e3e3]">
            <div className="text-[10px] text-[#444748] uppercase tracking-wider">Amount in Words</div>
            <div className="italic text-[11px] mt-0.5">{amountInWords(receipt.amountKES)}</div>
          </div>

          {/* Amount in figures */}
          <div className="flex justify-between text-sm font-bold pt-2 border-t border-[#e1e3e3]">
            <span>Total Paid:</span>
            <span>KES {receipt.amountKES.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 pt-4 mt-2 text-[10px] text-[#444748]">
          <div className="border-t border-dashed border-[#1a1c1c] pt-1 text-center">
            Received By (Cashier)
          </div>
          <div className="border-t border-dashed border-[#1a1c1c] pt-1 text-center">
            Approved By (Priest / Treasurer)
          </div>
        </div>

        <p className="text-center text-[10px] italic text-[#444748] pt-4">
          {parish?.motto ? `“${parish.motto}”` : '"Thank you for supporting the sanctuary and mission of our Parish."'}
        </p>
      </div>
    );
  }
);

export default ContributionReceipt;
