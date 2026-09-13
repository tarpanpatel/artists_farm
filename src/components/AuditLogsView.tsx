import React, { useState, useMemo } from 'react';
import {
  Edit2,
  Home,
  Plus,
  AlertTriangle,
  Receipt,
  UtensilsCrossed,
  DollarSign as IndianRupee,
  Filter,
  X,
  Save,
  CornerDownRight,
  Trash2,
  AlertCircle,
} from './icons/FlowbiteIcons';
import { Drawer, Pagination, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Dropdown, DropdownItem } from 'flowbite-react';
import { Button } from './Button';
import { Badge } from './Badge';
import { AuditLog, BillingReceipt, MenuItem } from '../types';
import { updateWalkInTabDB } from '../services/api';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { KpiCard } from './KpiCard';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface AuditLogsViewProps {
  receipts?: BillingReceipt[];
  onUpdateReceipt?: (updatedReceipt: BillingReceipt) => void;
  auditLogs?: AuditLog[];
  menu?: MenuItem[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  receipts = [],
  onUpdateReceipt,
  auditLogs: _auditLogs = [],
  menu = [],
}) => {
  const { showToast } = useToast();
  const [receiptsSearch, setReceiptsSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'online' | 'split'>('all');
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [receiptsDesktopPage, setReceiptsDesktopPage] = useState(1);
  const RECEIPTS_DESKTOP_PAGE_SIZE = 15;
  const [editingReceipt, setEditingReceipt] = useState<BillingReceipt | null>(null);

  // Edit Modal internal form state
  const [foodItemList, setFoodItemList] = useState<any[]>([]);
  const [adjustmentsList, setAdjustmentsList] = useState<any[]>([]);
  const [auditTrailList, setAuditTrailList] = useState<string[]>([]);
  
  // Quick Insert Dish State
  const [selectedDish, setSelectedDish] = useState('');
  const [dishQty, setDishQty] = useState(1);
  const [dishRate, setDishRate] = useState(0);

  // Custom Adjustments State
  const [adjType, setAdjType] = useState<'charge' | 'discount' | ''>('');
  const [adjReasonCharge, setAdjReasonCharge] = useState('Misc');
  const [adjReasonDiscount, setAdjReasonDiscount] = useState('');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');

  const extraChargeOptions = useMemo(() => [
    { value: 'Decoration & Event Setup', label: 'Decoration & Event Setup' },
    { value: 'Early Check-in Fee', label: 'Early Check-in Fee' },
    { value: 'Extra Bed / Mattress', label: 'Extra Bed / Mattress' },
    { value: 'Late Check-out Fee', label: 'Late Check-out Fee' },
    { value: 'Pet Stay Fee', label: 'Pet Stay Fee' },
    { value: 'Room Damage', label: 'Room Damage' },
    { value: 'Misc', label: 'Misc' },
  ], []);

  const filteredReceipts = useMemo(() => {
    return receipts.filter(rec => {
      const q = receiptsSearch.toLowerCase().trim();
      const matchQuery = !q ||
        rec.guestName?.toLowerCase().includes(q) ||
        rec.roomNumber?.toLowerCase().includes(q) ||
        rec.id?.toLowerCase().includes(q) ||
        rec.paymentMethod?.toLowerCase().includes(q);
      
      const method = (rec.paymentMethod || '').toLowerCase();
      let matchPayment = true;
      if (paymentFilter === 'cash') matchPayment = method.includes('cash');
      else if (paymentFilter === 'card') matchPayment = method.includes('card');
      else if (paymentFilter === 'online') matchPayment = method.includes('upi') || method.includes('online');
      else if (paymentFilter === 'split') matchPayment = method.includes('split') || method.includes('+');

      return matchQuery && matchPayment;
    });
  }, [receipts, receiptsSearch, paymentFilter]);

  // Invoice KPIs
  const totalInvoiced = useMemo(() => receipts.reduce((acc, r) => acc + (r.grandTotal || 0), 0), [receipts]);
  const totalRoomRent = useMemo(() => receipts.reduce((acc, r) => acc + (r.roomTotal || r.roomRent || 0), 0), [receipts]);
  const totalFoodExtras = useMemo(() => receipts.reduce((acc, r) => acc + (r.foodTotal || r.kitchenTotal || 0), 0), [receipts]);
  const avgFolio = useMemo(() => receipts.length > 0 ? totalInvoiced / receipts.length : 0, [receipts, totalInvoiced]);

  const handleOpenEditModal = (receipt: BillingReceipt) => {
    setEditingReceipt(receipt);
    setFoodItemList(receipt.foodItems ? [...receipt.foodItems] : []);
    setAdjustmentsList(receipt.adjustments ? [...receipt.adjustments] : []);
    setAuditTrailList(receipt.auditTrail ? [...receipt.auditTrail] : []);
  };

  const handleAddFoodItem = () => {
    if (!selectedDish || dishQty <= 0) return;
    const newItem = {
      name: selectedDish,
      quantity: dishQty,
      unitPrice: dishRate,
      total: dishQty * dishRate
    };
    setFoodItemList(prev => [...prev, newItem]);
    setAuditTrailList(prev => [...prev, `Added food item: ${selectedDish} x${dishQty} (₹${newItem.total})`]);
    setSelectedDish('');
    setDishQty(1);
    setDishRate(0);
  };

  const handleUpdateFoodQty = (index: number, delta: number) => {
    setFoodItemList((prev) =>
      prev
        .map((item, i) => {
          if (i !== index) return item;
          const newQty = (item.quantity || 1) + delta;
          if (newQty <= 0) return null;
          return {
            ...item,
            quantity: newQty,
            total: newQty * (item.unitPrice || 0),
          };
        })
        .filter(Boolean)
    );
  };

  const handleAddAdjustment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adjType || !adjAmount || Number(adjAmount) <= 0) return;
    const amt = Number(adjAmount);
    const label = adjType === 'charge' ? (adjReasonCharge.trim() || 'Extra Charge') : (adjReasonDiscount.trim() || 'Discount Rebate');
    const newAdj = {
      type: adjType === 'charge' ? 'Extra Incidentals Charge (+)' : 'Discount Rebate (-)',
      label,
      amount: amt
    };
    setAdjustmentsList(prev => [...prev, newAdj]);
    setAuditTrailList(prev => [...prev, `Applied adjustment ${newAdj.type}: ${label} (₹${amt.toFixed(2)})`]);
    setAdjAmount('');
    setAdjReasonDiscount('');
    setAdjType('');
  };

  const calculatedStayRent = editingReceipt ? (editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0) : 0;
  const advancePaid = editingReceipt ? (editingReceipt.advancePaid ?? 0) : 0;
  const lodgingPendingDue = Math.max(0, calculatedStayRent - advancePaid);
  const calculatedIncidentalsTotal = foodItemList.reduce((sum, item) => sum + (item.total || (item.quantity * item.unitPrice)), 0);

  const extraCharges = adjustmentsList
    .filter(a => a.type === 'charge' || (!a.type.includes('(-)') && a.type.includes('(+)')))
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const discounts = adjustmentsList
    .filter(a => a.type === 'discount' || a.type.includes('(-)'))
    .reduce((sum, a) => sum + Number(a.amount || 0), 0);
  const calculatedAdjustmentsTotal = extraCharges - discounts;

  const grandTargetDue = (editingReceipt?.sourceType === 'walk_in_tab' ? 0 : lodgingPendingDue) + calculatedIncidentalsTotal + calculatedAdjustmentsTotal;
  const grandTotalFullStay = (editingReceipt?.sourceType === 'walk_in_tab' ? 0 : calculatedStayRent) + calculatedIncidentalsTotal + calculatedAdjustmentsTotal;

  const handleSaveReceiptEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceipt) return;

    const isWalkIn = editingReceipt.sourceType === 'walk_in_tab' || !!editingReceipt.walkInTabId;
    const updated: BillingReceipt = {
      ...editingReceipt,
      roomRent: isWalkIn ? 0 : calculatedStayRent,
      roomTotal: isWalkIn ? 0 : calculatedStayRent,
      foodTotal: calculatedIncidentalsTotal,
      kitchenTotal: calculatedIncidentalsTotal,
      miscTotal: extraCharges,
      discount: discounts,
      grandTotal: grandTargetDue,
      foodItems: foodItemList,
      adjustments: adjustmentsList,
      auditTrail: auditTrailList
    };

    if (isWalkIn && editingReceipt.walkInTabId) {
      await updateWalkInTabDB({
        tabId: editingReceipt.walkInTabId,
        label: editingReceipt.guestName,
        paymentMethod: editingReceipt.paymentMethod || 'Cash',
        discount: editingReceipt.discount || 0,
        gstEnabled: editingReceipt.gstEnabled ?? false,
        gstRate: editingReceipt.gstRate || 0,
        items: foodItemList.map((item) => ({
          name: item.name,
          price: item.unitPrice,
          quantity: item.quantity,
        })),
      });
    }

    if (onUpdateReceipt) onUpdateReceipt(updated);
    showToast(`Receipt #${editingReceipt.id} updated!`, { type: 'success' });
    setEditingReceipt(null);
  };

  return (
    <div className="audit-logs space-y-6 text-slate-800 dark:text-slate-200">
      <PageHeader
        title={t('past_receipts_log_heading', 'Past Receipts & Settlement Log')}
        subtitle={t('past_receipts_log_subtitle', 'History of all generated guest folios, checkout settlements, and financial audit records')}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('total_invoiced_label', 'Total Invoiced')}
          value={`₹${totalInvoiced.toLocaleString('en-IN')}`}
          subtext={`${receipts.length} total generated folios`}
          icon={Receipt}
        />
        <KpiCard
          label={t('room_revenue_label', 'Stay Tariffs')}
          value={`₹${totalRoomRent.toLocaleString('en-IN')}`}
          subtext="Room night charges"
          icon={Home}
        />
        <KpiCard
          label={t('food_incidentals_label', 'Food & Extras')}
          value={`₹${totalFoodExtras.toLocaleString('en-IN')}`}
          subtext="KDS orders & extra charges"
          icon={UtensilsCrossed}
        />
        <KpiCard
          label={t('average_folio_label', 'Avg. Folio Value')}
          value={`₹${Math.round(avgFolio).toLocaleString('en-IN')}`}
          subtext="Average checkout total"
          icon={IndianRupee}
        />
      </div>

      <div className="audit-logs__receipts bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="w-full sm:w-80">
              <input
                type="text"
                value={receiptsSearch}
                onChange={(e) => setReceiptsSearch(e.target.value)}
                placeholder={t('search_receipts_placeholder', 'Search by guest, receipt #, room...')}
                className="h-10 bg-gray-50 border border-gray-300 text-gray-900 text-xs font-medium rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full px-3 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
              />
            </div>

            <Dropdown
              label=""
              dismissOnClick
              renderTrigger={() => (
                <button
                  type="button"
                  className="h-10 inline-flex items-center gap-2 px-3 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span className="capitalize">
                    {paymentFilter === 'all' ? 'All Payments' : `${paymentFilter} Only`}
                  </span>
                </button>
              )}
            >
              <DropdownItem onClick={() => setPaymentFilter('all')}>All Payments</DropdownItem>
              <DropdownItem onClick={() => setPaymentFilter('cash')}>Cash Only</DropdownItem>
              <DropdownItem onClick={() => setPaymentFilter('card')}>Card Only</DropdownItem>
              <DropdownItem onClick={() => setPaymentFilter('online')}>Online / UPI</DropdownItem>
              <DropdownItem onClick={() => setPaymentFilter('split')}>Split Payment</DropdownItem>
            </Dropdown>

            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 pl-1 whitespace-nowrap">
              {filteredReceipts.length} {filteredReceipts.length === 1 ? 'invoice' : 'invoices'}
            </span>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          {(() => {
            const receiptColumns = [
              {
                name: t('receipt_id_column', 'Receipt ID'),
                cell: (rec: BillingReceipt) => (
                  <div className="py-1">
                    <span className="font-semibold text-gray-900 dark:text-white text-xs block whitespace-nowrap">
                      #{rec.id}
                    </span>
                  </div>
                ),
              },
              {
                name: t('date_billed_column', 'Date Billed'),
                cell: (rec: BillingReceipt) => (
                  <div className="py-1">
                    <span className="text-xs text-gray-900 dark:text-white block font-medium whitespace-nowrap">
                      {formatDateTimeDDMMYYYY(rec.checkoutDate || rec.paidAt || '')}
                    </span>
                  </div>
                ),
              },
              {
                name: t('resident_group_column', 'Customer / Resident'),
                cell: (rec: BillingReceipt) => (
                  <div className="py-1">
                    <span className="font-semibold text-gray-900 dark:text-white block text-xs whitespace-nowrap">{rec.guestName}</span>
                    {rec.roomNumber && (
                      <span className={`inline-flex items-center px-2 py-0.5 mt-0.5 rounded text-2xs font-medium whitespace-nowrap ${
                        rec.roomNumber === 'Walk-in' || rec.sourceType === 'walk_in_tab'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {rec.roomNumber}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                name: t('total_stay_rent_column', 'Stay Tariff'),
                cell: (rec: BillingReceipt) => (
                  <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs tabular-numbers whitespace-nowrap">
                    ₹{(rec.roomTotal || rec.roomRent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('incidentals_food_column', 'Food & Extras'),
                cell: (rec: BillingReceipt) => (
                  <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs tabular-numbers whitespace-nowrap">
                    ₹{(rec.foodTotal || rec.kitchenTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('grand_total_column', 'Grand Total'),
                cell: (rec: BillingReceipt) => (
                  <span className="font-bold text-gray-900 dark:text-white text-xs tabular-numbers whitespace-nowrap">
                    ₹{rec.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('status_column', 'Status / Method'),
                cell: (rec: BillingReceipt) => {
                  const method = (rec.paymentMethod || 'Cash').toLowerCase();
                  const isSplit = method.includes('split') || method.includes('+') || (rec.cashAmount && rec.upiAmount);
                  const isCash = method.includes('cash') && !isSplit;
                  return (
                    <Badge variant={isCash ? 'success' : isSplit ? 'warning' : 'info'} size="sm">
                      {rec.paymentMethod || 'Paid (Cash)'}
                    </Badge>
                  );
                },
              },
              {
                name: t('actions_column', 'Actions'),
                cell: (rec: BillingReceipt) => (
                  <Button variant="edit" size="sm" onClick={() => handleOpenEditModal(rec)} leftIcon={<Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                    {t('edit_button', 'Edit')}
                  </Button>
                ),
              },
            ];

            if (filteredReceipts.length === 0) {
              return (
                <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                  {t('no_billing_receipts_message', 'No invoices found matching the current search & filters.')}
                </div>
              );
            }
            return (
              <>
                <Table hoverable>
                  <TableHead>
                    <TableRow>
                      {receiptColumns.map((col) => (
                        <TableHeadCell key={col.name}>{col.name}</TableHeadCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredReceipts.slice((receiptsDesktopPage - 1) * RECEIPTS_DESKTOP_PAGE_SIZE, receiptsDesktopPage * RECEIPTS_DESKTOP_PAGE_SIZE).map((rec) => (
                      <TableRow key={rec.id} className="bg-white dark:bg-gray-800">
                        {receiptColumns.map((col) => (
                          <TableCell key={col.name}>{col.cell(rec)}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredReceipts.length > RECEIPTS_DESKTOP_PAGE_SIZE && (
                  <div className="flex justify-center py-3 border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <Pagination
                      layout="table"
                      currentPage={receiptsDesktopPage}
                      itemsPerPage={RECEIPTS_DESKTOP_PAGE_SIZE}
                      totalItems={filteredReceipts.length}
                      onPageChange={setReceiptsDesktopPage}
                      className="text-xs"
                    />
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Touch-First Mobile Cards View with 10-Item Pagination */}
        <div className="md:hidden p-4 space-y-3">
          <Input
            type="text"
            value={receiptsSearch}
            onChange={(e) => setReceiptsSearch(e.target.value)}
            placeholder={t('search_receipts_placeholder', 'Search receipts...')}
            className="w-full"
          />

          {(() => {
            const paginatedReceipts = filteredReceipts.slice((receiptsPage - 1) * 10, receiptsPage * 10);
            return (
              <>
                <div className="space-y-3">
                  {paginatedReceipts.map((rec) => (
                    <div key={rec.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3.5 space-y-2.5 shadow-md">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-xs text-slate-400 block">{rec.id}</span>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm mt-0.5">{rec.guestName}</h4>
                          <span className={`inline-block text-2xs font-medium px-2 py-0.5 rounded mt-0.5 ${
                            rec.roomNumber === 'Walk-in' || rec.sourceType === 'walk_in_tab'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                              : 'text-slate-500 dark:text-slate-400 bg-gray-100 dark:bg-gray-700'
                          }`}>
                            {rec.roomNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="success" size="sm">
                            {rec.paymentMethod || 'Cash'}
                          </Badge>
                          <Button variant="edit" size="sm" onClick={() => handleOpenEditModal(rec)} leftIcon={<Edit2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                            {t('edit_button', 'Edit')}
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('checkout_date_column', 'Checkout Date')}</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatDateDDMMYYYY(rec.checkoutDate) || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('room_rent_column', 'Room Rent')}</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">₹{rec.roomRent || rec.roomTotal || 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('food_bill_column', 'Food Bill')}</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">₹{rec.foodTotal || rec.kitchenTotal || 0}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('grand_total_column', 'Grand Total')}</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{rec.grandTotal}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredReceipts.length === 0 && (
                    <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                      {t('no_billing_receipts_message', 'No billing receipts found in database.')}
                    </div>
                  )}
                </div>

                {/* 10-Item Mobile Pagination Controls */}
                {filteredReceipts.length > 10 && (
                  <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-center overflow-x-auto">
                    <Pagination
                      layout="table"
                      currentPage={receiptsPage}
                      itemsPerPage={10}
                      totalItems={filteredReceipts.length}
                      onPageChange={setReceiptsPage}
                      className="text-xs"
                    />
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* MODIFY BILL & AUDIT DRAWER — outside md:hidden so it works on all screen sizes */}
      <Drawer
        open={!!editingReceipt}
        onClose={() => setEditingReceipt(null)}
        position="right"
        className="checkout-drawer z-58 w-full sm:max-w-4xl lg:max-w-5xl p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between audit-logs__modal"
      >
        {editingReceipt && (
          <>
            <div className="checkout-drawer__header flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="checkout-drawer__icon-chip w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                  <IndianRupee className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="checkout-drawer__title text-base font-semibold text-slate-900 dark:text-white m-0">
                    {t('modify_bill_audit_heading', 'Modify Bill & Audit')}
                  </h2>
                  <p className="checkout-drawer__subtitle text-xs font-semibold text-slate-500 dark:text-slate-400 m-0">
                    {editingReceipt.sourceType === 'walk_in_tab' || editingReceipt.roomNumber === 'Walk-in'
                      ? `Table: ${editingReceipt.guestName || editingReceipt.roomNumber}`
                      : `Room: ${editingReceipt.roomNumber || editingReceipt.guestName}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReceipt(null)}
                aria-label={t('close_button', 'Close')}
                className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="checkout-drawer__body flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <form onSubmit={handleSaveReceiptEdit} className="app-form app-form--edit-receipt space-y-6 text-xs">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                  {/* LEFT COLUMN: Accommodation + Food Orders (LG: 7 cols) */}
                  <div className="lg:col-span-7 space-y-6">

                    {/* 1. ACCOMMODATION INVOICE BREAKDOWN (Hidden for Walk-in Diners) */}
                    {editingReceipt.sourceType === 'walk_in_tab' || editingReceipt.roomNumber === 'Walk-in' ? (
                      <div className="bg-amber-50/60 dark:bg-amber-950/20 p-3.5 rounded-lg border border-amber-200 dark:border-amber-900/50 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                        <UtensilsCrossed className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Walk-in Diner Bill — Dining POS order only (no room tariff).</span>
                      </div>
                    ) : (
                      <div className="checkout-card rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-4">
                        <div className="checkout-card__header flex items-center gap-2 text-2xs font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide border-b border-slate-200 dark:border-slate-700 pb-2">
                          <Home className="w-4 h-4 text-blue-600" />
                          <span>{t('accommodation_breakdown_heading', 'Accommodation Invoice Breakdown')}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Input
                              label={t('guest_name_only_label', 'Guest Name')}
                              type="text"
                              value={editingReceipt.guestName || ''}
                              onChange={(e) => setEditingReceipt(prev => prev ? ({ ...prev, guestName: e.target.value }) : null)}
                              className="text-xs font-semibold text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <Input
                              label={t('room_number_label', 'Room Number')}
                              type="text"
                              value={editingReceipt.roomNumber || ''}
                              onChange={(e) => setEditingReceipt(prev => prev ? ({ ...prev, roomNumber: e.target.value }) : null)}
                              className="text-xs font-semibold text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <DateRangePicker
                          checkinDate={editingReceipt.checkinDate ? editingReceipt.checkinDate.slice(0, 10) : ''}
                          checkoutDate={editingReceipt.checkoutDate ? editingReceipt.checkoutDate.slice(0, 10) : ''}
                          onCheckinChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, checkinDate: val }) : null)}
                          onCheckoutChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, checkoutDate: val }) : null)}
                        />

                        <div>
                          <Input
                            label={t('base_lodging_charges_label', 'Base Accommodation Charges (₹)')}
                            type="number"
                            value={editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setEditingReceipt(prev => prev ? ({ ...prev, roomRent: val, roomTotal: val }) : null);
                            }}
                            className="text-xs font-semibold text-slate-900 dark:text-white"
                          />
                        </div>

                        <div className="rounded-lg p-3 space-y-2 text-xs border border-emerald-200 dark:border-emerald-800">
                          <div className="flex justify-between items-center font-semibold gap-2">
                            <span className="text-slate-700 dark:text-slate-300 shrink-0">{t('advance_paid_label', 'Advance Paid:')}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm">+₹</span>
                              <input
                                type="number"
                                value={editingReceipt.advancePaid ?? 0}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setEditingReceipt(prev => prev ? ({ ...prev, advancePaid: val }) : null);
                                }}
                                className="summary-line summary-line--advance-paid w-24 text-right text-sm font-semibold text-emerald-700 dark:text-emerald-400 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-emerald-400"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg p-3 space-y-2 text-xs border border-amber-200 dark:border-amber-800">
                          <div className="flex justify-between items-center font-semibold">
                            <span className="text-slate-700 dark:text-slate-300">{t('pending_lodging_due_label', 'Pending Accommodation Due:')}</span>
                            <span className="summary-line summary-line--pending-lodging-due text-amber-700 dark:text-amber-400 text-sm font-semibold">
                              ₹{Math.max(0, (editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0) - (editingReceipt.advancePaid ?? 0)).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. FOOD & EXTRAS INCIDENTALS BREAKDOWN */}
                    <div className="checkout-card rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-4">
                      <div className="checkout-card__header flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                        <span className="text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-cyan-600" />
                          {t('food_incidentals_heading', 'Food Orders & Incidentals Log')}
                        </span>
                        <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-400">
                          Subtotal: ₹{calculatedIncidentalsTotal.toFixed(2)}
                        </span>
                      </div>

                      {/* Dish / Item Selector Controls */}
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-8 sm:col-span-7">
                          <StyledSelect
                            label={t('select_dish_item_label', 'Select Dish / Item')}
                            value={selectedDish}
                            onChange={(dishName) => {
                              setSelectedDish(dishName);
                              const found = menu.find((item) => item.name === dishName);
                              if (found) setDishRate(found.price);
                            }}
                            placeholder={t('choose_menu_dish_placeholder', '-- Choose Menu Dish --')}
                            options={menu.map((item) => ({
                              value: item.name,
                              label: `${item.name} (₹${item.price})`,
                            }))}
                          />
                        </div>

                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            label={t('quantity_label', 'Quantity')}
                            type="number"
                            min="1"
                            value={dishQty}
                            onChange={(e) => setDishQty(Math.max(1, Number(e.target.value) || 1))}
                            className="text-xs font-semibold text-center"
                          />
                        </div>

                        <div className="col-span-12 sm:col-span-3 flex items-end">
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            block
                            onClick={handleAddFoodItem}
                            disabled={!selectedDish}
                            leftIcon={<Plus className="w-3.5 h-3.5" />}
                          >
                            {t('insert_button', 'Insert')}
                          </Button>
                        </div>
                      </div>

                      {/* Food Items Table */}
                      {foodItemList.length > 0 ? (
                        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                          <table className="w-full text-xs text-left receipt-edit-modal__table">
                            <thead className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-600 receipt-edit-modal__table-header">
                              <tr className="receipt-edit-modal__table-header-row">
                                <th className="py-2 px-3 receipt-edit-modal__table-header-cell">{t('description_item_column', 'Description Item')}</th>
                                <th className="py-2 px-3 text-center receipt-edit-modal__table-header-cell">{t('qty_column', 'Qty')}</th>
                                <th className="py-2 px-3 text-right receipt-edit-modal__table-header-cell">{t('total_column', 'Total')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700 receipt-edit-modal__table-body">
                              {foodItemList.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="receipt-edit-modal__cell py-2 px-3 font-semibold text-slate-900 dark:text-white">
                                    {item.name}
                                  </td>
                                  <td className="receipt-edit-modal__cell py-2 px-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateFoodQty(idx, -1)}
                                        className="w-5 h-5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 rounded font-semibold text-xs cursor-pointer"
                                      >
                                        -
                                      </button>
                                      <span className="font-semibold text-xs px-1">{item.quantity}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateFoodQty(idx, 1)}
                                        className="w-5 h-5 bg-cyan-600 text-white hover:bg-cyan-700 rounded font-semibold text-xs cursor-pointer"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                  <td className="receipt-edit-modal__cell py-2 px-3 text-right font-semibold text-slate-900 dark:text-white">
                                    ₹{(item.total || item.quantity * item.unitPrice).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic text-center py-2">
                          {t('no_incidentals_message', 'No incidentals or food orders logged yet. Select a dish above to add.')}
                        </p>
                      )}
                    </div>

                  </div>

                  {/* RIGHT COLUMN: ADJUSTMENTS, AUDIT TRAIL, FINAL BILL (LG: 5 cols) */}
                  <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-0 self-start">

                    {/* 3. ADD CUSTOM ADJUSTMENTS */}
                    <div className="checkout-card checkout-card--compact rounded-lg border border-slate-200 dark:border-slate-700 p-4 sm:p-6 space-y-3">
                      <span className="checkout-card__header text-[10px] font-semibold text-slate-800 dark:text-slate-200 uppercase tracking-wide block border-b border-slate-200 dark:border-slate-700 pb-2">
                        {t('add_custom_adjustments_heading', 'Add Custom Adjustments')}
                      </span>

                      <div className="space-y-3 text-xs">
                        <div>
                          <StyledSelect
                            label={t('strategy_type_label', 'Strategy Type')}
                            value={adjType}
                            onChange={(val) => setAdjType(val as 'charge' | 'discount')}
                            placeholder={t('choose_placeholder', '-- Choose --')}
                            options={[
                              { value: 'charge', label: t('extra_incidentals_charge_option', 'Extra Incidentals Charge (+)') },
                              { value: 'discount', label: t('discount_rebate_option', 'Discount Rebate (-)') },
                            ]}
                          />
                        </div>

                        {adjType === 'charge' && (
                          <div>
                            <StyledSelect
                              label={t('charge_category_label', 'Charge Category')}
                              value={adjReasonCharge}
                              onChange={setAdjReasonCharge}
                              options={extraChargeOptions}
                            />
                          </div>
                        )}

                        {adjType === 'discount' && (
                          <div>
                            <Input
                              label={t('discount_label_label', 'Discount Label')}
                              type="text"
                              value={adjReasonDiscount}
                              onChange={(e) => setAdjReasonDiscount(e.target.value)}
                              placeholder={t('discount_label_placeholder', 'e.g. Service Apology...')}
                              className="font-semibold bg-white dark:bg-gray-800"
                            />
                          </div>
                        )}

                        <div>
                          <Input
                            label={t('amount_label', 'Amount (₹)')}
                            type="number"
                            step="0.01"
                            min="0"
                            value={adjAmount}
                            onChange={(e) => setAdjAmount(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                            placeholder="0.00"
                            inputMode="decimal"
                            className="font-semibold bg-white dark:bg-gray-800"
                            error={adjType && (!adjAmount || Number(adjAmount) <= 0) ? 'Amount must be greater than 0' : undefined}
                          />
                        </div>

                        <Button
                          type="button"
                          variant="dark"
                          size="sm"
                          block
                          onClick={handleAddAdjustment}
                          disabled={!adjType || !adjAmount || Number(adjAmount) <= 0}
                        >
                          {t('apply_adjustment_button', 'Apply Adjustment')}
                        </Button>
                      </div>

                      {/* Applied Adjustments List */}
                      {adjustmentsList.length > 0 && (
                        <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs mt-2">
                          <span className="font-semibold text-slate-500 uppercase text-[10px] block">{t('applied_adjustments_label', 'Applied Adjustments')}</span>
                          {adjustmentsList.map((adj, idx) => {
                            const isDiscount = adj.type === 'discount' || adj.type.includes('(-)');
                            return (
                              <div key={idx} className="flex items-center justify-between font-semibold">
                                <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                  <CornerDownRight className="w-3.5 h-3.5" /> {adj.label || adj.reason}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className={isDiscount ? 'text-emerald-600' : 'text-red-600'}>
                                    {isDiscount ? '-' : '+'}₹{Number(adj.amount).toFixed(2)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setAdjustmentsList(prev => prev.filter((_, i) => i !== idx));
                                      setAuditTrailList(prev => [...prev, `Removed adjustment: ${adj.label || adj.reason} (₹${adj.amount})`]);
                                    }}
                                    className="text-red-500 hover:text-red-700 p-0.5 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 4. CHECKOUT MODIFICATIONS AUDIT TRAIL */}
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 sm:p-6 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-400 uppercase tracking-wide border-b border-amber-200 dark:border-amber-800/60 pb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <span>{t('checkout_modifications_audit_heading', 'Checkout Modifications Audit Trail')}</span>
                      </div>
                      <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium pt-1">
                        {auditTrailList.length === 0 ? (
                          <p className="italic text-slate-400">{t('no_last_minute_modifications_message', 'No last-minute modifications recorded for this sheet.')}</p>
                        ) : (
                          <ul className="space-y-1 list-disc list-inside">
                            {auditTrailList.map((log, i) => (
                              <li key={i}>{log}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* 5. FINAL CHECKOUT BILL */}
                    <div className="checkout-card--final rounded-lg border-2 border-emerald-500/80 p-4 sm:p-6 space-y-4 shadow-sm">
                      <div className="checkout-card__header--final flex items-center gap-2 text-[10px] font-semibold text-emerald-900 dark:text-emerald-200 uppercase tracking-wide border-b border-emerald-200/60 pb-2">
                        <IndianRupee className="w-4 h-4 text-emerald-600" />
                        <span>{t('final_checkout_split_heading', 'Final Checkout Bill')}</span>
                      </div>

                      <div className="space-y-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {editingReceipt.sourceType !== 'walk_in_tab' && (
                          <div className="flex justify-between items-center">
                            <span>{t('pending_lodging_due_label', 'Pending Accommodation Due:')}</span>
                            <span className="summary-line summary-line--pending-lodging-due font-semibold">
                              ₹{lodgingPendingDue.toFixed(2)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span>{t('food_incidentals_subtotal_label', 'Food & Incidentals Subtotal:')}</span>
                          <span className="summary-line summary-line--food-subtotal font-semibold">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                        </div>
                        {extraCharges > 0 && (
                          <div className="flex justify-between items-center text-red-600 font-semibold">
                            <span>{t('extra_charges_label', '(+) Extra Charges:')}</span>
                            <span>+₹{extraCharges.toFixed(2)}</span>
                          </div>
                        )}
                        {discounts > 0 && (
                          <div className="flex justify-between items-center text-emerald-600 font-semibold">
                            <span>{t('discount_rebate_label', '(-) Discount Rebate:')}</span>
                            <span>-₹{discounts.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Grand Total (full stay, advance included) vs. what's still owed right now */}
                        <div className="border-t-2 border-emerald-300 dark:border-emerald-700 pt-2 space-y-1">
                          <div className="flex justify-between items-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                            <span>{t('grand_total_full_stay_label', 'Grand Total (Full Stay):')}</span>
                            <span className="summary-line summary-line--grand-total font-semibold">₹{grandTotalFullStay.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center text-sm font-extrabold">
                            <span className="text-slate-900 dark:text-white">{t('grand_target_due_label', 'Grand Target Due (Pending Today):')}</span>
                            <span className="summary-line summary-line--grand-target-due text-emerald-700 dark:text-emerald-400 font-extrabold">₹{grandTargetDue.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500">
                          <p className="font-semibold uppercase text-slate-400 mb-0.5">{t('original_split_payout_breakdown_heading', 'ORIGINAL SPLIT PAYOUT BREAKDOWN')}</p>
                          <p className="italic">{editingReceipt.paymentMethod ? `Paid via ${editingReceipt.paymentMethod}` : t('legacy_payment_route_message', 'Legacy payment route or not recorded.')}</p>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>

                {/* Bottom Action Footer */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setEditingReceipt(null)}
                  >
                    {t('cancel_button', 'Cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    leftIcon={<Save className="w-4 h-4" />}
                  >
                    {t('save_modifications_audit_log_button', 'Save Modifications & Audit Log')}
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
};