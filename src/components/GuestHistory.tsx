import React, { useState, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import {
  History,
  Search,
  Phone,
  Home,
  Loader2,
} from 'lucide-react';
import { Guest } from '../types';
import { t } from '../i18n/en';
import { formatDateDDMMYYYY, formatDateDDMMYY } from '../utils/dateUtils';
import { getFirstName } from '../utils/nameUtils';
import { markCFormFiled } from '../services/api';
import { useToast } from './ToastContext';
import { Input } from './Input';
import { StyledSelect } from './StyledSelect';
import { PageHeader } from './PageHeader';
import {
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_CHECKED_OUT,
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_ACTIVE_LEGACY,
  GUEST_STATUS_CONFIRMED_LEGACY,
  GUEST_STATUS_CHECKEDOUT_LEGACY,
  type GuestStatus,
} from '../constants/guestStatus';

interface GuestHistoryProps {
  guests: Guest[];
  onCFormFiledUpdated?: (guestId: string, filedAt: string | null) => void;
}

export const GuestHistory: React.FC<GuestHistoryProps> = ({ guests = [], onCFormFiledUpdated }) => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | GuestStatus>('Checked Out');
  const [foreignFilter, setForeignFilter] = useState<'All' | 'Foreigner' | 'Indian'>('All');
  const [savingCFormId, setSavingCFormId] = useState<string | null>(null);

  const handleToggleCForm = async (guest: Guest, newFiledState: boolean) => {
    setSavingCFormId(guest.id);
    const ok = await markCFormFiled(guest.id, newFiledState);
    if (ok) {
      const filedAt = newFiledState ? new Date().toISOString() : null;
      // Instantly mutate local object property for immediate UI feedback
      guest.cFormFiledAt = filedAt;
      onCFormFiledUpdated?.(guest.id, filedAt);
      showToast(newFiledState ? `C-Form marked as filed for ${guest.guestName}` : `C-Form marked as pending for ${guest.guestName}`, { type: 'success' });
    } else {
      showToast('Failed to update C-Form status', { type: 'error' });
    }
    setSavingCFormId(null);
  };

  // Different flows in this app have historically written different spellings
  // for the same real-world state (confirmed against live data: 'CheckedOut'
  // AND 'Checked Out' both exist, same for 'Active'/'Checked In', 'Booked'/
  // 'Confirmed') - this page's status filter and badge only ever recognized
  // one spelling each, so a guest checked out via the "other" code path
  // simply vanished from every filter but 'All'. Normalize before comparing
  // instead of relying on an exact string match.
  const normalizeStayStatus = (status: string): GuestStatus | 'Other' => {
    const s = (status || '').trim();
    if (s === GUEST_STATUS_ACTIVE_LEGACY || s === GUEST_STATUS_CHECKED_IN) return GUEST_STATUS_CHECKED_IN;
    if (s === GUEST_STATUS_CHECKEDOUT_LEGACY || s === GUEST_STATUS_CHECKED_OUT) return GUEST_STATUS_CHECKED_OUT;
    if (s === GUEST_STATUS_BOOKED || s === GUEST_STATUS_CONFIRMED_LEGACY) return GUEST_STATUS_BOOKED;
    return 'Other';
  };

  // Filter logic
  const filteredGuests = useMemo(() => {
    return guests.filter((g) => {
      // 1. Search term match
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        g.guestName.toLowerCase().includes(q) ||
        g.phoneNumber.includes(q) ||
        g.roomNumber.toLowerCase().includes(q);

      // 2. Status match
      const matchesStatus = statusFilter === 'All' || normalizeStayStatus(g.status) === statusFilter;

      // 3. Foreigner filter match
      const matchesForeign =
        foreignFilter === 'All' ||
        (foreignFilter === 'Foreigner' && g.isForeignGuest) ||
        (foreignFilter === 'Indian' && !g.isForeignGuest);

      return matchesSearch && matchesStatus && matchesForeign;
    });
  }, [guests, searchTerm, statusFilter, foreignFilter]);

  // DataTable custom styles
  const customStyles = {
    subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
    headRow: { style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' } },
    headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
    cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
    rows: { style: { minHeight: '52px' } },
  };

  const columns = [
    {
      name: t('guest_details_column', 'Guest Details'),
      selector: (row: Guest) => row.guestName,
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <span>{getFirstName(row.guestName)}</span>
            {row.isForeignGuest && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 rounded-sm">
                {t('passport_badge', 'Passport')}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{row.phoneNumber || 'No phone'}</span>
          </div>
        </div>
      ),
    },
    {
      name: t('stay_dates_column', 'Stay Dates'),
      selector: (row: Guest) => row.checkinDate,
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
           <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span className="text-[10px] uppercase text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-1 py-0.5 rounded-sm">{t('checkin_badge', 'IN')}</span>
            <span>{formatDateDDMMYY(row.checkinDate)}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
            <span className="text-[10px] uppercase text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-1 py-0.5 rounded-sm">{t('checkout_badge', 'OUT')}</span>
            <span>{formatDateDDMMYY(row.checkoutDate || row.expectedCheckout) || '—'}</span>
          </div>
        </div>
      ),
    },
    {
      name: t('cottage_room_column', 'Cottage / Room'),
      selector: (row: Guest) => row.roomNumber,
      sortable: true,
      grow: 1,
      cell: (row: Guest) => (
        <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Home className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.roomNumber || t('unassigned_label', 'Unassigned')}</span>
        </div>
      ),
    },
    {
      name: t('stay_status_column', 'Stay Status'),
      selector: (row: Guest) => row.status,
      sortable: true,
      width: '120px',
      cell: (row: Guest) => {
        let bg = 'bg-slate-100 text-slate-800 dark:bg-slate-900/60 dark:text-slate-400';
        let label: string = row.status;
        const normalized = normalizeStayStatus(row.status);
        if (normalized === GUEST_STATUS_CHECKED_IN) {
          bg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
          label = t('checked_in_badge', 'Active Stay');
        } else if (normalized === GUEST_STATUS_CHECKED_OUT) {
          bg = 'bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-300';
          label = t('checked_out_badge', 'Checked Out');
        } else if (normalized === GUEST_STATUS_BOOKED) {
          bg = 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
          label = t('reserved_badge', 'Reserved');
        }
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${bg}`}>
            {label}
          </span>
        );
      },
    },
    {
      name: t('financial_ledger_column', 'Financial Ledger'),
      selector: (row: Guest) => row.totalAmount || 0,
      sortable: true,
      grow: 2,
      cell: (row: Guest) => (
        <div className="flex flex-col py-2">
          <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
            <span>{t('bill_field', 'Bill:')}</span>
            <span className="text-blue-600 dark:text-blue-400">₹{row.totalAmount || 0}</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
            <span>Adv: ₹{row.advanceAmount || 0}</span>
            <span>•</span>
            <span className={row.paymentStatus?.toLowerCase() === 'paid' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
              {row.paymentStatus || 'Pending'}
            </span>
          </div>
        </div>
      ),
    },
    {
      name: t('c_form_filing_column', 'C-Form Filing'),
      selector: (row: Guest) => row.cFormFiledAt || '',
      sortable: true,
      grow: 2,
      cell: (row: Guest) => {
        if (!row.isForeignGuest) {
          return <span className="text-slate-400 dark:text-slate-600 text-xs">{t('na_indian_national_label', 'N/A (Indian National)')}</span>;
        }

        const isFiled = !!row.cFormFiledAt;
        const isSaving = savingCFormId === row.id;

        return (
          <label className="flex items-center gap-2 cursor-pointer py-1 text-xs select-none">
            <input
              type="checkbox"
              checked={isFiled}
              disabled={isSaving}
              onChange={(e) => handleToggleCForm(row, e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-50"
            />
            <span className={`font-semibold ${isFiled ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
              {isFiled ? (
                <span className="flex items-center gap-1">
                  <span>{t('filed_badge', 'Filed')}</span>
                  <span className="text-[10px] text-slate-400 font-normal">({formatDateDDMMYYYY(row.cFormFiledAt)})</span>
                </span>
              ) : (
                <span>{t('pending_filing_badge', 'Pending Filing')}</span>
              )}
            </span>
            {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </label>
        );
      },
    },
  ];

  return (
    <div className="guest-history space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Page Title & Header */}
      <div className="guest-history__header bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-4">
        {/* Breadcrumb Navigation */}
        <nav className="flex text-slate-400 text-[11px] font-semibold gap-1.5 items-center guest-history__breadcrumb">
          <span>{t('breadcrumb_dashboard_label', 'Dashboard')}</span>
          <span>/</span>
          <span className="text-blue-600 dark:text-blue-400">{t('breadcrumb_guest_registration_archive_label', 'Guest Registration Archive')}</span>
        </nav>
        <PageHeader
          title={
            <span className="flex items-center gap-2">
              <History className="w-6 h-6 text-blue-600" />
              <span>{t('guest_registration_archive_heading', 'Guest Registration Archive')}</span>
            </span>
          }
          subtitle={t('guest_history_description', 'Browse completed guest stays, registration history, C-Form compliance, and past billing ledgers.')}
        />
      </div>

      {/* Filters and Search Bar */}
      <div className="guest-history__filters bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col lg:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            type="text"
            placeholder={t('search_guest_history_placeholder', 'Search by guest name, phone, room...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4 text-slate-400" />}
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto lg:ml-auto">
          {/* Stay Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">{t('status_filter_label', 'Status:')}</span>
            <StyledSelect
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as any)}
              options={[
                { value: 'All', label: t('all_stays_option', 'All Stays') },
                { value: GUEST_STATUS_CHECKED_IN, label: t('active_stays_option', 'Active stays only') },
                { value: GUEST_STATUS_CHECKED_OUT, label: t('checked_out_stays_option', 'Checked out only') },
                { value: GUEST_STATUS_BOOKED, label: t('reserved_stays_option', 'Reserved only') },
              ]}
            />
          </div>

          {/* Nationality Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">{t('nationality_filter_label', 'Nationality:')}</span>
            <StyledSelect
              value={foreignFilter}
              onChange={(v) => setForeignFilter(v as any)}
              options={[
                { value: 'All', label: t('all_nations_option', 'All Nations') },
                { value: 'Foreigner', label: t('foreign_nations_option', 'Foreign Nationals (C-Form required)') },
                { value: 'Indian', label: t('indian_nations_option', 'Indian Nationals') },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="guest-history__table bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
        <DataTable
          columns={columns}
          data={filteredGuests}
          customStyles={customStyles}
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[10, 15, 20, 30, 50]}
          noDataComponent={
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              {t('no_matching_guest_records_label', 'No matching guest records found.')}
            </div>
          }
        />
      </div>
    </div>
  );
};

