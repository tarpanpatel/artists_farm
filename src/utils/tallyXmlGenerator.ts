import { BillingReceipt, Guest, PettyCashEntry } from '../types';

/**
 * Escapes XML special characters for Tally XML import format.
 */
function escapeXml(unsafe: string | number | undefined | null): string {
  if (unsafe === undefined || unsafe === null) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats standard ISO/date strings (YYYY-MM-DD or DD/MM/YYYY) into Tally's required YYYYMMDD format.
 */
function formatTallyDate(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{2}[/-]\d{2}[/-]\d{4}/.test(dateStr)) {
    const parts = dateStr.split(/[/-]/);
    return `${parts[2]}${parts[1].padStart(2, '0')}${parts[0].padStart(2, '0')}`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

export interface TallySalesItem {
  voucherNumber: string;
  date: string;
  guestName: string;
  guestGstin?: string;
  roomNumber?: string;
  roomRent: number;
  foodTotal: number;
  miscTotal: number;
  subtotal: number;
  discount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGst: number;
  grandTotal: number;
  paymentMethod?: string;
}

/**
 * Normalizes receipts and settled guests into standardized sales items for Tally export.
 */
function extractSalesItems(
  receipts: BillingReceipt[],
  guests: Guest[]
): TallySalesItem[] {
  const items: TallySalesItem[] = [];
  const processedGuestIds = new Set<string>();

  // 1. Process formal receipts first
  if (receipts && receipts.length > 0) {
    for (const r of receipts) {
      if (r.guestId) processedGuestIds.add(String(r.guestId));

      const roomRent = Math.max(0, Number(r.roomTotal || r.roomRent || 0));
      const foodTotal = Math.max(0, Number(r.foodTotal || r.kitchenTotal || 0));
      const miscTotal = Math.max(0, Number(r.miscTotal || 0));
      const discount = Math.max(0, Number(r.discount || 0));
      const subtotal = roomRent + foodTotal + miscTotal;
      const taxableAmount = Math.max(0, subtotal - discount);

      let cgst = Number(r.gstCgst || 0);
      let sgst = Number(r.gstSgst || 0);
      let igst = Number(r.gstIgst || 0);
      let totalGst = Number(r.gstAmount || (cgst + sgst + igst));

      // If GST is enabled but individual splits aren't recorded, default to 6% CGST + 6% SGST (12% standard hospitality)
      if (r.gstEnabled && totalGst === 0 && taxableAmount > 0) {
        totalGst = Math.round(taxableAmount * 0.12 * 100) / 100;
        if (r.gstTaxType === 'igst') {
          igst = totalGst;
        } else {
          cgst = Math.round((totalGst / 2) * 100) / 100;
          sgst = totalGst - cgst;
        }
      }

      const grandTotal = Number(r.grandTotal || (taxableAmount + totalGst));

      items.push({
        voucherNumber: r.id || `INV-${r.guestId || Math.floor(Math.random() * 10000)}`,
        date: r.paidAt || r.checkoutDate || r.checkinDate || new Date().toISOString(),
        guestName: r.guestBillingName || r.guestName || 'Walk-in Guest',
        guestGstin: r.guestGstin || '',
        roomNumber: r.roomNumber || '',
        roomRent,
        foodTotal,
        miscTotal,
        subtotal,
        discount,
        taxableAmount,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalGst,
        grandTotal,
        paymentMethod: r.paymentMethod || 'UPI/Cash',
      });
    }
  }

  // 2. Synthesize sales vouchers for settled guests who don't have a formal receipt row
  if (guests && guests.length > 0) {
    for (const g of guests) {
      if (processedGuestIds.has(String(g.id))) continue;

      const isSettled = g.status === 'CheckedOut' || g.paymentStatus === 'Paid' || g.paymentStatus === 'Checked Out';
      const totalAmount = Number(g.totalAmount || 0);
      if (!isSettled && totalAmount <= 0) continue;

      const roomRent = Number(g.roomRate || 0);
      const foodTotal = Number(g.foodBill || 0);
      const miscTotal = Array.isArray(g.extraCharges)
        ? g.extraCharges.reduce((sum, c) => sum + Number(c.amount || 0), 0)
        : 0;
      const subtotal = roomRent + foodTotal + miscTotal;
      const discount = Number((g as any).discount || 0);
      const taxableAmount = Math.max(0, subtotal - discount);

      // Extract GST if recorded
      let cgst = Number((g as any).cgstAmount || 0);
      let sgst = Number((g as any).sgstAmount || 0);
      let igst = Number((g as any).igstAmount || 0);
      let totalGst = Number((g as any).gstAmount || (cgst + sgst + igst));

      const grandTotal = totalAmount > 0 ? totalAmount : (taxableAmount + totalGst);

      items.push({
        voucherNumber: `INV-G-${g.id}`,
        date: g.checkoutDate || g.checkinDate || new Date().toISOString(),
        guestName: g.guestName || 'Guest',
        guestGstin: (g as any).guestGstin || '',
        roomNumber: g.roomNumber || '',
        roomRent,
        foodTotal,
        miscTotal,
        subtotal,
        discount,
        taxableAmount,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalGst,
        grandTotal,
        paymentMethod: (g as any).paymentMode || 'Cash/UPI',
      });
    }
  }

  return items;
}

/**
 * Generates official Tally Prime XML for Sales Vouchers (VCHTYPE="Sales").
 * Conforms strictly to Tally.ERP 9 and Tally Prime import schema.
 */
export function generateTallySalesXml(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string,
  propertyName: string = 'Ground Code Resort'
): string {
  const sales = extractSalesItems(receipts, guests);
  const companyName = escapeXml(propertyName);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <DATA>\n`;
  xml += `      <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
  xml += `        <COMPANY>\n`;
  xml += `          <REMOTECMPNAME>${companyName}</REMOTECMPNAME>\n`;
  if (propertyGstin) {
    xml += `          <GSTIN>${escapeXml(propertyGstin)}</GSTIN>\n`;
  }
  xml += `        </COMPANY>\n`;
  xml += `      </TALLYMESSAGE>\n`;

  for (const s of sales) {
    const tallyDate = formatTallyDate(s.date);
    const voucherNo = escapeXml(s.voucherNumber);
    const partyName = escapeXml(s.guestName);
    const narration = escapeXml(`Stay at Room ${s.roomNumber || 'N/A'} - ${s.guestName} (${s.paymentMethod || 'Settled'})`);

    xml += `      <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `        <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
    xml += `          <DATE>${tallyDate}</DATE>\n`;
    xml += `          <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>\n`;
    xml += `          <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
    xml += `          <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
    xml += `          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n`;
    xml += `          <NARRATION>${narration}</NARRATION>\n`;

    // 1. Party Ledger (Debtor / Guest Account - DEBIT: ISDEEMEDPOSITIVE=Yes, Amount=-GrandTotal)
    xml += `          <ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
    xml += `            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n`;
    xml += `            <AMOUNT>-${s.grandTotal.toFixed(2)}</AMOUNT>\n`;
    xml += `          </ALLLEDGERENTRIES.LIST>\n`;

    // 2. Room Accommodation Sales (SAC 996311 - CREDIT: ISDEEMEDPOSITIVE=No, Amount=Positive)
    if (s.roomRent > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Room Accommodation Sales</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.roomRent.toFixed(2)}</AMOUNT>\n`;
      xml += `            <HSNCODE>996311</HSNCODE>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    // 3. Restaurant & Food Sales (SAC 996331 - CREDIT)
    if (s.foodTotal > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Restaurant &amp; Food Sales</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.foodTotal.toFixed(2)}</AMOUNT>\n`;
      xml += `            <HSNCODE>996331</HSNCODE>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    // 4. Extra Charges & Services (CREDIT)
    if (s.miscTotal > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Extra Charges &amp; Services</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.miscTotal.toFixed(2)}</AMOUNT>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    // 5. Discount Allowed (DEBIT if any)
    if (s.discount > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Discount Allowed</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>-${s.discount.toFixed(2)}</AMOUNT>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    // 6. Tax Ledgers: CGST / SGST (Intra-state) or IGST (Inter-state)
    if (s.cgstAmount > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Output CGST</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.cgstAmount.toFixed(2)}</AMOUNT>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    if (s.sgstAmount > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Output SGST</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.sgstAmount.toFixed(2)}</AMOUNT>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    if (s.igstAmount > 0) {
      xml += `          <ALLLEDGERENTRIES.LIST>\n`;
      xml += `            <LEDGERNAME>Output IGST</LEDGERNAME>\n`;
      xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
      xml += `            <AMOUNT>${s.igstAmount.toFixed(2)}</AMOUNT>\n`;
      xml += `          </ALLLEDGERENTRIES.LIST>\n`;
    }

    xml += `        </VOUCHER>\n`;
    xml += `      </TALLYMESSAGE>\n`;
  }

  xml += `    </DATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>\n`;

  return xml;
}

/**
 * Maps petty cash / cost categories to standard Tally Accounting Ledgers.
 */
function mapExpenseCategoryToTallyLedger(category?: string, description?: string): string {
  const cat = (category || '').toLowerCase();
  const desc = (description || '').toLowerCase();

  if (cat.includes('kitchen') || cat.includes('grocery') || cat.includes('food') || cat.includes('vegetables') || cat.includes('dairy')) {
    return 'Kitchen Provisions &amp; Food Expenses';
  }
  if (cat.includes('salary') || cat.includes('salaries') || cat.includes('wages') || cat.includes('stipend') || desc.includes('salary')) {
    return 'Staff Salaries &amp; Wages';
  }
  if (cat.includes('housekeeping') || cat.includes('linen') || cat.includes('cleaning') || cat.includes('laundry') || cat.includes('toiletry')) {
    return 'Housekeeping &amp; Laundry Expenses';
  }
  if (cat.includes('repair') || cat.includes('maintenance') || cat.includes('hardware') || cat.includes('plumbing') || cat.includes('electrician')) {
    return 'Repairs &amp; Property Maintenance';
  }
  if (cat.includes('utilit') || cat.includes('electric') || cat.includes('power') || cat.includes('water') || cat.includes('diesel') || cat.includes('fuel')) {
    return 'Power, Fuel &amp; Water Utilities';
  }
  if (cat.includes('travel') || cat.includes('fuel') || cat.includes('transport') || cat.includes('auto')) {
    return 'Travelling &amp; Conveyance Expenses';
  }
  if (cat.includes('bill') || cat.includes('tax') || cat.includes('license') || cat.includes('fssai')) {
    return 'Rates, Taxes &amp; Licenses';
  }
  return 'General &amp; Miscellaneous Expenses';
}

/**
 * Generates official Tally Prime XML for Payment Vouchers (VCHTYPE="Payment").
 * Extracted from Petty Cash / Property Expense logs.
 */
export function generateTallyPaymentsXml(
  expenses: PettyCashEntry[],
  propertyName: string = 'Ground Code Resort'
): string {
  const companyName = escapeXml(propertyName);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <DATA>\n`;
  xml += `      <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
  xml += `        <COMPANY>\n`;
  xml += `          <REMOTECMPNAME>${companyName}</REMOTECMPNAME>\n`;
  xml += `        </COMPANY>\n`;
  xml += `      </TALLYMESSAGE>\n`;

  for (const exp of expenses) {
    if (exp.type === 'Replenishment') continue; // Skip cash-drawer top-ups from expense voucher stream

    const tallyDate = formatTallyDate(exp.date);
    const voucherNo = escapeXml(`PC-${exp.id}`);
    const ledgerName = mapExpenseCategoryToTallyLedger(exp.category || exp.costCategory, exp.description);
    const amount = Number(exp.amount || 0);
    if (amount <= 0) continue;

    const paymentLedger = exp.paymentMode === 'Bank Transfer' || exp.paymentMode === 'Online'
      ? 'Bank Account / UPI'
      : 'Cash-in-Hand (Petty Cash)';

    const narration = escapeXml(
      `${exp.description || 'Expense'}${exp.vendor ? ` (Vendor: ${exp.vendor})` : ''}${exp.paidBy ? ` (Paid by: ${exp.paidBy})` : ''}`
    );

    xml += `      <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `        <VOUCHER VCHTYPE="Payment" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
    xml += `          <DATE>${tallyDate}</DATE>\n`;
    xml += `          <VOUCHERNUMBER>${voucherNo}</VOUCHERNUMBER>\n`;
    xml += `          <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>\n`;
    xml += `          <PARTYLEDGERNAME>${paymentLedger}</PARTYLEDGERNAME>\n`;
    xml += `          <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>\n`;
    xml += `          <NARRATION>${narration}</NARRATION>\n`;

    // 1. Expense Ledger (DEBIT: ISDEEMEDPOSITIVE=Yes, Amount=-amount)
    xml += `          <ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <LEDGERNAME>${ledgerName}</LEDGERNAME>\n`;
    xml += `            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `            <AMOUNT>-${amount.toFixed(2)}</AMOUNT>\n`;
    xml += `          </ALLLEDGERENTRIES.LIST>\n`;

    // 2. Payment Source Ledger (Cash / Bank - CREDIT: ISDEEMEDPOSITIVE=No, Amount=amount)
    xml += `          <ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <LEDGERNAME>${paymentLedger}</LEDGERNAME>\n`;
    xml += `            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `            <AMOUNT>${amount.toFixed(2)}</AMOUNT>\n`;
    xml += `          </ALLLEDGERENTRIES.LIST>\n`;

    xml += `        </VOUCHER>\n`;
    xml += `      </TALLYMESSAGE>\n`;
  }

  xml += `    </DATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>\n`;

  return xml;
}
