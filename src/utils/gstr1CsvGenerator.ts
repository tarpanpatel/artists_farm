import { BillingReceipt, Guest } from '../types';

export const GST_STATE_CODES: Record<string, string> = {
  '01': '01-Jammu and Kashmir',
  '02': '02-Himachal Pradesh',
  '03': '03-Punjab',
  '04': '04-Chandigarh',
  '05': '05-Uttarakhand',
  '06': '06-Haryana',
  '07': '07-Delhi',
  '08': '08-Rajasthan',
  '09': '09-Uttar Pradesh',
  '10': '10-Bihar',
  '11': '11-Sikkim',
  '12': '12-Arunachal Pradesh',
  '13': '13-Nagaland',
  '14': '14-Manipur',
  '15': '15-Mizoram',
  '16': '16-Tripura',
  '17': '17-Meghalaya',
  '18': '18-Assam',
  '19': '19-West Bengal',
  '20': '20-Jharkhand',
  '21': '21-Odisha',
  '22': '22-Chhattisgarh',
  '23': '23-Madhya Pradesh',
  '24': '24-Gujarat',
  '26': '26-Dadra and Nagar Haveli and Daman and Diu',
  '27': '27-Maharashtra',
  '29': '29-Karnataka',
  '30': '30-Goa',
  '31': '31-Lakshadweep',
  '32': '32-Kerala',
  '33': '33-Tamil Nadu',
  '34': '34-Puducherry',
  '35': '35-Andaman and Nicobar Islands',
  '36': '36-Telangana',
  '37': '37-Andhra Pradesh',
  '38': '38-Ladakh',
  '97': '97-Other Territory',
};

/**
 * Extracts Indian GST State Code (e.g. "08-Rajasthan") from a 15-character GSTIN.
 */
export function getGstStateFromGstin(gstin?: string, fallback: string = '08-Rajasthan'): string {
  if (!gstin || gstin.length < 2) return fallback;
  const prefix = gstin.trim().substring(0, 2);
  return GST_STATE_CODES[prefix] || `${prefix}-State`;
}

/**
 * Formats standard date into government GSTR-1 CSV format (DD-MMM-YYYY, e.g. "03-Sep-2026").
 */
function formatGstr1Date(dateStr?: string): string {
  if (!dateStr) {
    const now = new Date();
    return formatGstr1DateObj(now);
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY
  if (/^\d{2}[/-]\d{2}[/-]\d{4}/.test(dateStr)) {
    const parts = dateStr.split(/[/-]/);
    const day = parts[0].padStart(2, '0');
    const monthIndex = parseInt(parts[1], 10) - 1;
    const year = parts[2];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day}-${months[monthIndex] || 'Jan'}-${year}`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    return formatGstr1DateObj(new Date());
  }

  return formatGstr1DateObj(d);
}

function formatGstr1DateObj(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export interface Gstr1Transaction {
  invoiceNumber: string;
  invoiceDate: string;
  guestName: string;
  guestGstin?: string;
  placeOfSupply: string;
  roomRent: number;
  foodTotal: number;
  miscTotal: number;
  subtotal: number;
  discount: number;
  taxableValue: number;
  taxRate: number; // e.g. 12, 18, 5, 0
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTax: number;
  invoiceValue: number;
  isB2B: boolean;
}

/**
 * Normalizes receipts and settled guests into standardized GSTR-1 transactions.
 */
function extractGstr1Transactions(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string
): Gstr1Transaction[] {
  const transactions: Gstr1Transaction[] = [];
  const processedGuestIds = new Set<string>();
  const defaultPos = getGstStateFromGstin(propertyGstin, '08-Rajasthan');

  // 1. Process formal receipts
  if (receipts && receipts.length > 0) {
    for (const r of receipts) {
      if (r.guestId) processedGuestIds.add(String(r.guestId));

      const roomRent = Math.max(0, Number(r.roomTotal || r.roomRent || 0));
      const foodTotal = Math.max(0, Number(r.foodTotal || r.kitchenTotal || 0));
      const miscTotal = Math.max(0, Number(r.miscTotal || 0));
      const discount = Math.max(0, Number(r.discount || 0));
      const subtotal = roomRent + foodTotal + miscTotal;
      const taxableValue = Math.max(0, subtotal - discount);

      let cgst = Number(r.gstCgst || 0);
      let sgst = Number(r.gstSgst || 0);
      let igst = Number(r.gstIgst || 0);
      let totalTax = Number(r.gstAmount || (cgst + sgst + igst));

      // Determine tax rate percentage
      let taxRate = Number(r.gstAccommodationRate || 12);
      if (r.gstEnabled && totalTax === 0 && taxableValue > 0) {
        totalTax = Math.round(taxableValue * (taxRate / 100) * 100) / 100;
        if (r.gstTaxType === 'igst') {
          igst = totalTax;
        } else {
          cgst = Math.round((totalTax / 2) * 100) / 100;
          sgst = totalTax - cgst;
        }
      } else if (taxableValue > 0 && totalTax > 0) {
        taxRate = Math.round((totalTax / taxableValue) * 100);
      } else if (!r.gstEnabled) {
        taxRate = 0;
      }

      const invoiceValue = Number(r.grandTotal || (taxableValue + totalTax));
      const guestGstin = (r.guestGstin || '').trim().toUpperCase();
      const isB2B = /^[0-9A-Z]{15}$/.test(guestGstin);
      const pos = isB2B ? getGstStateFromGstin(guestGstin, defaultPos) : defaultPos;

      transactions.push({
        invoiceNumber: r.id || `INV-${r.guestId || Math.floor(Math.random() * 10000)}`,
        invoiceDate: r.paidAt || r.checkoutDate || r.checkinDate || new Date().toISOString(),
        guestName: r.guestBillingName || r.guestName || 'Guest',
        guestGstin: isB2B ? guestGstin : undefined,
        placeOfSupply: pos,
        roomRent,
        foodTotal,
        miscTotal,
        subtotal,
        discount,
        taxableValue,
        taxRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTax,
        invoiceValue,
        isB2B,
      });
    }
  }

  // 2. Synthesize transactions from settled guests without formal receipts
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
      const taxableValue = Math.max(0, subtotal - discount);

      let cgst = Number((g as any).cgstAmount || 0);
      let sgst = Number((g as any).sgstAmount || 0);
      let igst = Number((g as any).igstAmount || 0);
      let totalTax = Number((g as any).gstAmount || (cgst + sgst + igst));

      let taxRate = 12;
      if (taxableValue > 0 && totalTax > 0) {
        taxRate = Math.round((totalTax / taxableValue) * 100);
      } else {
        taxRate = 0;
      }

      const invoiceValue = totalAmount > 0 ? totalAmount : (taxableValue + totalTax);
      const guestGstin = String((g as any).guestGstin || '').trim().toUpperCase();
      const isB2B = /^[0-9A-Z]{15}$/.test(guestGstin);
      const pos = isB2B ? getGstStateFromGstin(guestGstin, defaultPos) : defaultPos;

      transactions.push({
        invoiceNumber: `INV-G-${g.id}`,
        invoiceDate: g.checkoutDate || g.checkinDate || new Date().toISOString(),
        guestName: g.guestName || 'Guest',
        guestGstin: isB2B ? guestGstin : undefined,
        placeOfSupply: pos,
        roomRent,
        foodTotal,
        miscTotal,
        subtotal,
        discount,
        taxableValue,
        taxRate,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        totalTax,
        invoiceValue,
        isB2B,
      });
    }
  }

  return transactions;
}

/**
 * 1. GSTR-1 Table 4: Taxable outward supplies made to registered persons (B2B).
 * Conforms to Government GST Offline Tool CSV standard.
 */
export function generateGstr1Table4B2bCsv(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string
): string {
  const transactions = extractGstr1Transactions(receipts, guests, propertyGstin);
  const b2bList = transactions.filter((t) => t.isB2B && t.guestGstin);

  const headers = [
    'GSTIN/UIN of Recipient',
    'Receiver Name',
    'Invoice Number',
    'Invoice date',
    'Invoice Value',
    'Place Of Supply',
    'Reverse Charge',
    'Applicable % of Tax Rate',
    'Invoice Type',
    'E-Commerce GSTIN',
    'Rate',
    'Taxable Value',
    'Cess Amount',
  ];

  const rows = b2bList.map((t) => [
    `"${t.guestGstin}"`,
    `"${t.guestName.replace(/"/g, '""')}"`,
    `"${t.invoiceNumber}"`,
    `"${formatGstr1Date(t.invoiceDate)}"`,
    t.invoiceValue.toFixed(2),
    `"${t.placeOfSupply}"`,
    '"N"',
    '""',
    '"Regular"',
    '""',
    t.taxRate,
    t.taxableValue.toFixed(2),
    '0.00',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * 2. GSTR-1 Table 7: Taxable outward supplies to unregistered persons (B2C Small).
 * Conforms to Government GST Offline Tool CSV standard.
 */
export function generateGstr1Table7B2cCsv(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string
): string {
  const transactions = extractGstr1Transactions(receipts, guests, propertyGstin);
  const b2cList = transactions.filter((t) => !t.isB2B);

  // Group by (Place of Supply + Tax Rate) as required by GST Offline Tool
  const summaryMap: Record<string, { pos: string; rate: number; taxableValue: number }> = {};

  for (const t of b2cList) {
    const key = `${t.placeOfSupply}_${t.taxRate}`;
    if (!summaryMap[key]) {
      summaryMap[key] = {
        pos: t.placeOfSupply,
        rate: t.taxRate,
        taxableValue: 0,
      };
    }
    summaryMap[key].taxableValue += t.taxableValue;
  }

  const headers = [
    'Type',
    'Place Of Supply',
    'Applicable % of Tax Rate',
    'Rate',
    'Taxable Value',
    'Cess Amount',
    'E-Commerce GSTIN',
  ];

  const rows = Object.values(summaryMap).map((s) => [
    '"OE"', // Other than E-commerce
    `"${s.pos}"`,
    '""',
    s.rate,
    s.taxableValue.toFixed(2),
    '0.00',
    '""',
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * 3. GSTR-1 Table 12: HSN / SAC Summary of outward supplies.
 * Hospitality SAC codes:
 * - SAC 996311: Room accommodation services provided by hotels/resorts
 * - SAC 996331: Restaurant and food serving services
 */
export function generateGstr1Table12HsnCsv(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string
): string {
  const transactions = extractGstr1Transactions(receipts, guests, propertyGstin);

  let roomQty = 0;
  let roomTaxable = 0;
  let roomCgst = 0;
  let roomSgst = 0;
  let roomIgst = 0;
  let roomTotal = 0;

  let foodQty = 0;
  let foodTaxable = 0;
  let foodCgst = 0;
  let foodSgst = 0;
  let foodIgst = 0;
  let foodTotal = 0;

  for (const t of transactions) {
    // Room Portion (SAC 996311)
    if (t.roomRent > 0) {
      roomQty += 1;
      const roomRatio = t.subtotal > 0 ? (t.roomRent / t.subtotal) : 1;
      const tTaxable = t.taxableValue * roomRatio;
      const tCgst = t.cgstAmount * roomRatio;
      const tSgst = t.sgstAmount * roomRatio;
      const tIgst = t.igstAmount * roomRatio;
      const tVal = tTaxable + tCgst + tSgst + tIgst;

      roomTaxable += tTaxable;
      roomCgst += tCgst;
      roomSgst += tSgst;
      roomIgst += tIgst;
      roomTotal += tVal;
    }

    // Food Portion (SAC 996331)
    if (t.foodTotal > 0) {
      foodQty += 1;
      const foodRatio = t.subtotal > 0 ? (t.foodTotal / t.subtotal) : 1;
      const tTaxable = t.taxableValue * foodRatio;
      const tCgst = t.cgstAmount * foodRatio;
      const tSgst = t.sgstAmount * foodRatio;
      const tIgst = t.igstAmount * foodRatio;
      const tVal = tTaxable + tCgst + tSgst + tIgst;

      foodTaxable += tTaxable;
      foodCgst += tCgst;
      foodSgst += tSgst;
      foodIgst += tIgst;
      foodTotal += tVal;
    }
  }

  const headers = [
    'HSN/SAC',
    'Description',
    'UQC',
    'Total Quantity',
    'Total Value',
    'Taxable Value',
    'Integrated Tax Amount',
    'Central Tax Amount',
    'State/UT Tax Amount',
    'Cess Amount',
  ];

  const rows: string[][] = [];

  if (roomTaxable > 0 || roomQty > 0) {
    rows.push([
      '"996311"',
      '"Room Accommodation Services"',
      '"NA"',
      String(roomQty),
      roomTotal.toFixed(2),
      roomTaxable.toFixed(2),
      roomIgst.toFixed(2),
      roomCgst.toFixed(2),
      roomSgst.toFixed(2),
      '0.00',
    ]);
  }

  if (foodTaxable > 0 || foodQty > 0) {
    rows.push([
      '"996331"',
      '"Restaurant & Food Serving Services"',
      '"NA"',
      String(foodQty),
      foodTotal.toFixed(2),
      foodTaxable.toFixed(2),
      foodIgst.toFixed(2),
      foodCgst.toFixed(2),
      foodSgst.toFixed(2),
      '0.00',
    ]);
  }

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * 4. Consolidated GSTR-1 Master Audit Workbook.
 * Comprehensive multi-section CSV containing Executive Tax Summary, B2B list, B2C list, and HSN/SAC breakdown.
 */
export function generateGstr1ConsolidatedWorkbook(
  receipts: BillingReceipt[],
  guests: Guest[],
  propertyGstin?: string,
  propertyName: string = 'Ground Code Resort'
): string {
  const transactions = extractGstr1Transactions(receipts, guests, propertyGstin);
  const b2bList = transactions.filter((t) => t.isB2B);
  const b2cList = transactions.filter((t) => !t.isB2B);

  const totalInvoices = transactions.length;
  const totalTaxable = transactions.reduce((acc, t) => acc + t.taxableValue, 0);
  const totalCgst = transactions.reduce((acc, t) => acc + t.cgstAmount, 0);
  const totalSgst = transactions.reduce((acc, t) => acc + t.sgstAmount, 0);
  const totalIgst = transactions.reduce((acc, t) => acc + t.igstAmount, 0);
  const totalGst = transactions.reduce((acc, t) => acc + t.totalTax, 0);
  const grandTotal = transactions.reduce((acc, t) => acc + t.invoiceValue, 0);

  const lines: string[] = [];

  // Section 1: Header & Executive Summary
  lines.push(`"=== GSTR-1 CONSOLIDATED TAX COMPLIANCE WORKBOOK ==="`);
  lines.push(`"Property Name","${propertyName.replace(/"/g, '""')}"`);
  lines.push(`"Property GSTIN","${propertyGstin || 'Unregistered / Not Set'}"`);
  lines.push(`"Generated At","${new Date().toLocaleString('en-IN')}"`);
  lines.push('');
  lines.push(`"--- EXECUTIVE TAX SUMMARY ---"`);
  lines.push(`"Total Invoices Issued","${totalInvoices}"`);
  lines.push(`"B2B Invoices Count","${b2bList.length}"`);
  lines.push(`"B2C Invoices Count","${b2cList.length}"`);
  lines.push(`"Total Net Taxable Value (INR)","${totalTaxable.toFixed(2)}"`);
  lines.push(`"Total Output CGST (INR)","${totalCgst.toFixed(2)}"`);
  lines.push(`"Total Output SGST (INR)","${totalSgst.toFixed(2)}"`);
  lines.push(`"Total Output IGST (INR)","${totalIgst.toFixed(2)}"`);
  lines.push(`"Total GST Tax Collected (INR)","${totalGst.toFixed(2)}"`);
  lines.push(`"Total Gross Collections (INR)","${grandTotal.toFixed(2)}"`);
  lines.push('');

  // Section 2: Table 12 HSN Summary
  lines.push(`"--- TABLE 12: HSN / SAC SUMMARY ---"`);
  lines.push(generateGstr1Table12HsnCsv(receipts, guests, propertyGstin));
  lines.push('');

  // Section 3: Table 4 B2B Invoices
  lines.push(`"--- TABLE 4: B2B TAXABLE SUPPLIES TO REGISTERED BUSINESSES ---"`);
  lines.push(generateGstr1Table4B2bCsv(receipts, guests, propertyGstin));
  lines.push('');

  // Section 4: Table 7 B2C Small
  lines.push(`"--- TABLE 7: B2C TAXABLE SUPPLIES TO UNREGISTERED CONSUMERS ---"`);
  lines.push(generateGstr1Table7B2cCsv(receipts, guests, propertyGstin));
  lines.push('');

  return lines.join('\n');
}
