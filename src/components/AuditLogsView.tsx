import React, { useState, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { flowbiteTableCustomStyles } from '../utils/tableStyles';
import {
  Edit2,
  Home,
  Utensils,
  Plus,
  CreditCard,
  Search,
  AlertTriangle,
  Receipt,
  UtensilsCrossed,
  DollarSign as IndianRupee,
  Filter,
} from './icons/FlowbiteIcons';
import { Modal, ModalHeader, ModalBody, Pagination, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Dropdown, DropdownItem } from 'flowbite-react';
import { Button } from './Button';
import { Badge } from './Badge';
import { AuditLog, BillingReceipt } from '../types';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { KpiCard } from './KpiCard';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface AuditLogsViewProps {
  receipts?: BillingReceipt[];
  onUpdateReceipt?: (updatedReceipt: BillingReceipt) => void;
  auditLogs?: AuditLog[];
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  receipts = [],
  onUpdateReceipt,
  auditLogs: _auditLogs = []
}) => {
  const { showToast } = useToast();
  const [receiptsSearch, setReceiptsSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'cash' | 'card' | 'online' | 'split'>('all');
  const [receiptsPage, setReceiptsPage] = useState(1);
  const [editingReceipt, setEditingReceipt] = useState<BillingReceipt | null>(null);

  // Edit Modal internal form state
  const [foodItemList, setFoodItemList] = useState<any[]>([]);
  const [adjustmentsList, setAdjustmentsList] = useState<any[]>([]);
  const [auditTrailList, setAuditTrailList] = useState<string[]>([]);
  
  // Quick Insert Dish State
  const [selectedDish, setSelectedDish] = useState('');
  const [dishQty, setDishQty] = useState(1);
  const [dishRate, setDishRate] = useState(0);

  // Quick Insert Adjustment State
  const [adjType, setAdjType] = useState<string>('Discount (-)');
  const [adjLabel, setAdjLabel] = useState<string>('');
  const [adjAmount, setAdjAmount] = useState<string | number>('');

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
      else if (paymentFilter === 'split') matchPayment = method.includes('split');

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

  const handleRemoveFoodItem = (index: number) => {
    const item = foodItemList[index];
    setFoodItemList(prev => prev.filter((_, i) => i !== index));
    if (item) {
      setAuditTrailList(prev => [...prev, `Removed food item: ${item.name} (₹${item.total})`]);
    }
  };

  const handleAddAdjustment = () => {
    const amt = Number(adjAmount);
    if (isNaN(amt) || amt <= 0) return;
    const newAdj = {
      type: adjType,
      label: adjLabel || 'Custom Adjustment',
      amount: amt
    };
    setAdjustmentsList(prev => [...prev, newAdj]);
    setAuditTrailList(prev => [...prev, `Applied adjustment ${adjType}: ${adjLabel || 'Adjustment'} (₹${amt})`]);
    setAdjLabel('');
    setAdjAmount('');
  };

  const calculatedStayRent = editingReceipt ? (editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0) : 0;
  const calculatedIncidentalsTotal = foodItemList.reduce((sum, item) => sum + (item.total || (item.quantity * item.unitPrice)), 0);
  const calculatedAdjustmentsTotal = adjustmentsList.reduce((sum, a) => a.type.includes('(-)') ? sum - a.amount : sum + a.amount, 0);
  const calculatedGrandTotal = calculatedStayRent + calculatedIncidentalsTotal + calculatedAdjustmentsTotal;

  const handleSaveReceiptEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReceipt) return;

    const updated: BillingReceipt = {
      ...editingReceipt,
      roomRent: calculatedStayRent,
      roomTotal: calculatedStayRent,
      foodTotal: calculatedIncidentalsTotal,
      kitchenTotal: calculatedIncidentalsTotal,
      grandTotal: calculatedGrandTotal,
      foodItems: foodItemList,
      adjustments: adjustmentsList,
      auditTrail: auditTrailList
    };

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
            <div className="relative w-full sm:w-80">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500 dark:text-gray-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={receiptsSearch}
                onChange={(e) => setReceiptsSearch(e.target.value)}
                placeholder={t('search_receipts_placeholder', 'Search by guest, receipt #, room...')}
                className="h-10 bg-gray-50 border border-gray-300 text-gray-900 text-xs font-medium rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 pr-3 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
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
          <DataTable
            columns={[
              {
                name: t('receipt_id_column', 'Receipt ID'),
                selector: (rec: BillingReceipt) => rec.id,
                minWidth: '130px',
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
                selector: (rec: BillingReceipt) => rec.checkoutDate || rec.paidAt || '',
                sortable: true,
                minWidth: '150px',
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
                selector: (rec: BillingReceipt) => rec.guestName,
                sortable: true,
                minWidth: '180px',
                grow: 2,
                cell: (rec: BillingReceipt) => (
                  <div className="py-1">
                    <span className="font-semibold text-gray-900 dark:text-white block text-xs whitespace-nowrap">{rec.guestName}</span>
                    {rec.roomNumber && (
                      <span className="inline-flex items-center px-2.5 py-0.5 mt-0.5 rounded-full text-2xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {rec.roomNumber}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                name: t('total_stay_rent_column', 'Stay Tariff'),
                selector: (rec: BillingReceipt) => rec.roomTotal || rec.roomRent || 0,
                sortable: true,
                minWidth: '130px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs tabular-numbers whitespace-nowrap">
                    ₹{(rec.roomTotal || rec.roomRent || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('incidentals_food_column', 'Food & Extras'),
                selector: (rec: BillingReceipt) => rec.foodTotal || rec.kitchenTotal || 0,
                sortable: true,
                minWidth: '135px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-semibold text-gray-700 dark:text-gray-300 text-xs tabular-numbers whitespace-nowrap">
                    ₹{(rec.foodTotal || rec.kitchenTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('grand_total_column', 'Grand Total'),
                selector: (rec: BillingReceipt) => rec.grandTotal,
                sortable: true,
                minWidth: '135px',
                cell: (rec: BillingReceipt) => (
                  <span className="font-bold text-gray-900 dark:text-white text-xs tabular-numbers whitespace-nowrap">
                    ₹{rec.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                ),
              },
              {
                name: t('status_column', 'Status / Method'),
                minWidth: '140px',
                cell: (rec: BillingReceipt) => {
                  const method = (rec.paymentMethod || 'Cash').toLowerCase();
                  const isCash = method.includes('cash');
                  const isSplit = method.includes('split');
                  return (
                    <Badge variant={isCash ? 'success' : isSplit ? 'warning' : 'info'} size="sm">
                      {rec.paymentMethod || 'Paid (Cash)'}
                    </Badge>
                  );
                },
              },
              {
                name: t('actions_column', 'Actions'),
                minWidth: '120px',
                cell: (rec: BillingReceipt) => (
                  <Button variant="primary" size="sm" onClick={() => handleOpenEditModal(rec)} leftIcon={<Edit2 className="w-3.5 h-3.5 shrink-0" />}>
                    {t('edit_button', 'Edit')}
                  </Button>
                ),
              },
            ]}
            data={filteredReceipts}
            persistTableHead
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[15, 30, 50, 100]}
            highlightOnHover
            customStyles={flowbiteTableCustomStyles}
            noDataComponent={
              <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                {t('no_billing_receipts_message', 'No invoices found matching the current search & filters.')}
              </div>
            }
          />
        </div>

        {/* Touch-First Mobile Cards View with 10-Item Pagination */}
        <div className="md:hidden p-4 space-y-3">
          <div className="relative">
            <Input
              type="text"
              value={receiptsSearch}
              onChange={(e) => setReceiptsSearch(e.target.value)}
              placeholder={t('search_receipts_placeholder', 'Search receipts...')}
              leftIcon={<Search className="w-4 h-4 text-slate-400" />}
              className="w-full"
            />
          </div>

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
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{rec.roomNumber}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge variant="success" size="sm">
                            {rec.paymentMethod || 'Cash'}
                          </Badge>
                          <Button variant="primary" size="sm" onClick={() => handleOpenEditModal(rec)} leftIcon={<Edit2 className="w-3.5 h-3.5 shrink-0" />}>
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

      {/* MODIFY BILL & AUDIT MODAL MATCHING SCREENSHOT */}
      <Modal show={!!editingReceipt} onClose={() => setEditingReceipt(null)} dismissible size="7xl" className="z-58 audit-logs__modal">
        {editingReceipt && (
          <>
            <ModalHeader as="div">
              <h3 className="audit-logs-view__subtitle font-black text-slate-900 dark:text-white text-lg flex items-center gap-2">
                <span>{t('modify_bill_audit_heading', 'Modify Bill & Audit')}: {editingReceipt.guestName} ({formatDateDDMMYYYY(editingReceipt.checkoutDate) || 'Stay'})</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-normal">
                {t('modify_bill_audit_subtitle', 'Modify stay contract terms, adjust food logs, and audit checkout behavior perfectly mirroring the live billing desk.')}
              </p>
            </ModalHeader>
            <ModalBody>
            <form onSubmit={handleSaveReceiptEdit} className="app-form app-form--edit-receipt space-y-6 text-xs">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT 2 COLUMNS: ACCOMMODATION & FOOD LOGS */}
                <div className="lg:col-span-2 space-y-6">

                  {/* 1. ACCOMMODATION INVOICE BREAKDOWN */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <Home className="w-4 h-4 text-emerald-600" />
                      <span>{t('accommodation_invoice_breakdown_heading', 'ACCOMMODATION INVOICE BREAKDOWN')}</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Input
                          label={t('base_lodging_charges_contract_label', 'BASE LODGING CHARGES (CONTRACT)')}
                          type="number"
                          value={editingReceipt.roomRent ?? editingReceipt.roomTotal ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, roomRent: val, roomTotal: val }) : null);
                          }}
                          labelClassName="text-[11px]"
                        />
                      </div>

                      <div>
                        <Input
                          label={t('advance_deposit_paid_label', 'ADVANCE DEPOSIT PAID (₹)')}
                          type="number"
                          value={editingReceipt.advancePaid ?? 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setEditingReceipt(prev => prev ? ({ ...prev, advancePaid: val }) : null);
                          }}
                          labelClassName="text-[11px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('advance_collected_by_label', 'ADVANCE COLLECTED BY')}</label>
                        <StyledSelect
                          value={editingReceipt.advanceCollectedBy || 'Tarpan'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, advanceCollectedBy: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('pending_tariff_collected_by_label', 'PENDING TARIFF COLLECTED BY')}</label>
                        <StyledSelect
                          value={editingReceipt.tariffCollectedBy || 'Kamlesh'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, tariffCollectedBy: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('incidentals_cashier_label', 'INCIDENTALS CASHIER')}</label>
                        <StyledSelect
                          value={editingReceipt.incidentalsCashier || 'Subrata'}
                          onChange={(val) => setEditingReceipt(prev => prev ? ({ ...prev, incidentalsCashier: val }) : null)}
                          options={[
                            { value: 'Tarpan', label: 'Tarpan' },
                            { value: 'Kamlesh', label: 'Kamlesh' },
                            { value: 'Subrata', label: 'Subrata' },
                            { value: 'Manager', label: 'Manager' },
                            { value: 'Staff', label: 'Staff' },
                          ]}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. FOOD ORDERS & INCIDENTALS LOG */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-4">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <Utensils className="w-4 h-4 text-emerald-600" />
                      <span>{t('food_orders_incidentals_log_heading', 'FOOD ORDERS & INCIDENTALS LOG')}</span>
                    </h4>

                    {/* Insert Food Item Bar */}
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                      <StyledSelect
                        className="flex-1 w-full"
                        value={selectedDish}
                        onChange={setSelectedDish}
                        placeholder={t('audit_choose_menu_dish_placeholder', '-- Choose Menu Dish --')}
                        options={defaultMenuCatalog.map((item) => ({
                          value: item.name,
                          label: `${item.name} (₹${item.price})`,
                        }))}
                      />

                      <Input
                        type="number"
                        min="1"
                        value={dishQty}
                        onChange={(e) => setDishQty(Number(e.target.value))}
                        className="w-16 text-center"
                        fullWidth={false}
                      />

                      <button
                        type="button"
                        onClick={handleAddFoodItem}
                        className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-md transition-colors"
                      >
                        + {t('audit_insert_button', 'Insert')}
                      </button>
                    </div>

                    {/* Food Items Table */}
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                      <Table className="audit-logs-view__table">
                        <TableHead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold audit-logs-view__table-header">
                          <TableRow>
                            <TableHeadCell className="p-2.5">{t('description_item_column', 'Description Item')}</TableHeadCell>
                            <TableHeadCell className="p-2.5 text-center">{t('quantity_label', 'Quantity')}</TableHeadCell>
                            <TableHeadCell className="p-2.5 text-right">{t('total_column', 'Total')}</TableHeadCell>
                          </TableRow>
                        </TableHead>
                        <TableBody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium audit-logs-view__table-body">
                          {foodItemList.length > 0 ? (
                            foodItemList.map((item, idx) => (
                              <TableRow key={idx} className="bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                <TableCell className="audit-logs-view__cell p-2.5 font-semibold text-slate-800 dark:text-slate-200">{item.name}</TableCell>
                                <TableCell className="audit-logs-view__cell p-2.5 text-center">
                                  <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, -1)}
                                      className="w-6 h-6 flex items-center justify-center bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-white font-extrabold hover:bg-slate-200 cursor-pointer"
                                    >
                                      -
                                    </button>
                                    <span className="w-6 text-center font-semibold">{item.quantity}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleUpdateFoodQty(idx, 1)}
                                      className="w-6 h-6 flex items-center justify-center bg-cyan-500 text-white rounded font-extrabold hover:bg-cyan-600 cursor-pointer"
                                    >
                                      +
                                    </button>
                                  </div>
                                </TableCell>
                                <TableCell className="audit-logs-view__cell p-2.5 text-right font-extrabold text-slate-900 dark:text-white">
                                  ₹{(item.total || item.quantity * item.unitPrice).toFixed(2)}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={3} className="audit-logs-view__cell p-4 text-center text-slate-400 italic">
                                {t('no_food_incidentals_message', 'No food incidentals recorded for this bill.')}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {t('incidentals_bill_subtotal_label', 'Incidentals Bill Subtotal:')} <span className="summary-line summary-line--food-subtotal text-cyan-600 dark:text-cyan-400 font-extrabold text-sm">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                    </div>
                  </div>

                </div>

                {/* RIGHT 1 COLUMN: ADJUSTMENTS, AUDIT TRAIL, FINANCIAL POSITION */}
                <div className="space-y-6">

                  {/* 3. ADD CUSTOM ADJUSTMENTS */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <PlusCircle className="w-4 h-4 text-emerald-600" />
                      <span>{t('audit_add_custom_adjustments_heading', 'ADD CUSTOM ADJUSTMENTS')}</span>
                    </h4>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1 uppercase">{t('audit_strategy_type_label', 'STRATEGY TYPE')}</label>
                      <StyledSelect
                        value={adjType}
                        onChange={setAdjType}
                        options={[
                          { value: 'Extra Incidentals Charge (+)', label: 'Extra Incidentals Charge (+)' },
                          { value: 'Discount / Compensation (-)', label: 'Discount / Compensation (-)' },
                          { value: 'Tax Adjustment (+)', label: 'Tax Adjustment (+)' },
                        ]}
                      />
                    </div>

                    <div>
                      <Input
                        label={t('label_description_label', 'LABEL DESCRIPTION')}
                        type="text"
                        placeholder={t('service_apology_placeholder', 'e.g., Service Apology...')}
                        value={adjLabel}
                        onChange={(e) => setAdjLabel(e.target.value)}
                        labelClassName="text-[10px]"
                      />
                    </div>

                    <div>
                      <Input
                        label={t('amount_rupees_label', 'AMOUNT (₹)')}
                        type="number"
                        placeholder="0.00"
                        value={adjAmount}
                        onChange={(e) => setAdjAmount(e.target.value)}
                        labelClassName="text-[10px]"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleApplyAdjustment}
                      className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-md transition-colors"
                    >
                      {t('apply_active_adjustment_button', 'Apply Active Adjustment')}
                    </button>
                  </div>

                  {/* 4. CHECKOUT MODIFICATIONS AUDIT TRAIL */}
                  <div className="bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-900/50 space-y-2">
                    <h4 className="audit-logs-view__caption font-extrabold text-amber-800 dark:text-amber-400 text-[10px] flex items-center gap-1.5 uppercase tracking-wide">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>{t('checkout_modifications_audit_heading', 'CHECKOUT MODIFICATIONS AUDIT TRAIL')}</span>
                    </h4>
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
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

                  {/* 5. FINAL FINANCIAL POSITION */}
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-3">
                    <h4 className="audit-logs-view__caption font-extrabold text-slate-800 dark:text-slate-200 text-[10px] flex items-center gap-2 uppercase tracking-wide">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span>{t('final_financial_position_heading', 'FINAL FINANCIAL POSITION')}</span>
                    </h4>

                    <div className="space-y-2 text-xs font-semibold border-b border-slate-200 dark:border-slate-700 pb-3">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>{t('stay_rent_outstanding_balance_label', 'Stay Rent Outstanding Balance:')}</span>
                        <span className="summary-line summary-line--room-rate font-extrabold text-slate-900 dark:text-white">₹{calculatedStayRent.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>{t('food_extras_subtotal_label', 'Food & Extras Subtotal:')}</span>
                        <span className="summary-line summary-line--food-subtotal font-extrabold text-cyan-600">₹{calculatedIncidentalsTotal.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-sm font-extrabold">
                      <span className="text-slate-900 dark:text-white">{t('total_outstanding_target_label', 'Total Outstanding Target:')}</span>
                      <span className="summary-line summary-line--grand-target-due text-emerald-600 text-base font-black">₹{calculatedGrandTotal.toFixed(2)}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 text-[10px] text-slate-500">
                      <p className="font-semibold uppercase text-slate-400 mb-0.5">{t('original_split_payout_breakdown_heading', 'ORIGINAL SPLIT PAYOUT BREAKDOWN')}</p>
                      <p className="italic">{t('legacy_payment_route_message', 'Legacy payment route or not recorded.')}</p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Bottom Action Footer */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingReceipt(null)}
                  className="px-5 py-2.5 font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 font-semibold text-white bg-blue-600 rounded-lg cursor-pointer hover:bg-blue-700 flex items-center gap-1.5 shadow-md transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>{t('save_modifications_audit_log_button', 'Save Modifications & Audit Log')}</span>
                </button>
              </div>
            </form>
            </ModalBody>
          </>
        )}
      </Modal>
    </div>
  );
};