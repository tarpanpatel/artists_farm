import React, { useState, useMemo } from 'react';
import {
  Edit2,
  Home,
  Receipt,
  UtensilsCrossed,
  DollarSign as IndianRupee,
  Filter,
} from './icons/FlowbiteIcons';
import { Pagination, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Dropdown, DropdownItem } from 'flowbite-react';
import { Button } from './Button';
import { Badge } from './Badge';
import { AuditLog, BillingReceipt, MenuItem } from '../types';
import { updateWalkInTabDB } from '../services/api';
import { useToast } from './ToastContext';
import { Input } from './Input';
import { PageHeader } from './PageHeader';
import { KpiCard } from './KpiCard';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';
import { ReceiptEditModal } from './ReceiptEditModal';

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
  };

  const handleSaveReceiptEdit = async (updated: BillingReceipt) => {
    if (!editingReceipt) return;

    const isWalkIn = updated.sourceType === 'walk_in_tab' || !!updated.walkInTabId;

    if (isWalkIn && updated.walkInTabId) {
      await updateWalkInTabDB({
        tabId: updated.walkInTabId,
        label: updated.guestName,
        paymentMethod: updated.paymentMethod || 'Cash',
        discount: updated.discount || 0,
        gstEnabled: updated.gstEnabled ?? false,
        gstRate: updated.gstRate || 0,
        items: (updated.foodItems || []).map((item) => ({
          name: item.name,
          price: item.unitPrice,
          quantity: item.quantity,
        })),
      });
    }

    if (onUpdateReceipt) onUpdateReceipt(updated);
    showToast(`Receipt #${updated.id} updated!`, { type: 'success' });
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

      {/* SHARED RECEIPT EDIT & AUDIT DRAWER */}
      <ReceiptEditModal
        isOpen={!!editingReceipt}
        receipt={editingReceipt}
        onClose={() => setEditingReceipt(null)}
        onUpdateReceipt={handleSaveReceiptEdit}
        mode="audit-modify"
        menu={menu}
        kitchenModuleEnabled={true}
      />
    </div>
  );
};