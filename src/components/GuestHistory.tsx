import React, { useState, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import {
  History,
  Search,
  Filter,
  Download,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  Home,
  IndianRupee,
  FileSpreadsheet,
  BookOpen
} from 'lucide-react';
import { Guest } from '../types';
import { t } from '../i18n/en';

interface GuestHistoryProps {
  guests: Guest[];
}

export const GuestHistory: React.FC<GuestHistoryProps> = ({ guests = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'CheckedOut' | 'Booked'>('All');
  const [foreignFilter, setForeignFilter] = useState<'All' | 'Foreigner' | 'Indian'>('All');

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
      const matchesStatus = statusFilter === 'All' || g.status === statusFilter;

      // 3. Foreigner filter match
      const matchesForeign =
        foreignFilter === 'All' ||
        (foreignFilter === 'Foreigner' && g.isForeignGuest) ||
        (foreignFilter === 'Indian' && !g.isForeignGuest);

      return matchesSearch && matchesStatus && matchesForeign;
    });
  }, [guests, searchTerm, statusFilter, foreignFilter]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Guest Name',
      'Phone Number',
      'Room Number',
      'Check-in Date',
      'Check-out Date',
      'Status',
      'Booking Source',
      'No of Guests',
      'Room Rate (Per Night)',
      'Advance Paid',
      'Total Bill Amount',
      'Payment Status',
      'C-Form Status',
      'Filing Time',
    ];

    const rows = filteredGuests.map((g) => [
      `"${g.guestName}"`,
      `"${g.phoneNumber}"`,
      `"${g.roomNumber}"`,
      `"${g.checkinDate}"`,
      `"${g.checkoutDate || g.expectedCheckout || ''}"`,
      `"${g.status}"`,
      `"${g.bookingSource || 'Direct'}"`,
      g.numberOfGuests || 1,
      g.roomRate || 0,
      g.advanceAmount || 0,
      g.totalAmount || 0,
      `"${g.paymentStatus || 'Pending'}"`,
      g.isForeignGuest ? (g.cFormFiledAt ? 'Filed' : 'Pending Filing') : 'N/A',
      `"${g.cFormFiledAt || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `guest_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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
            <span>{row.guestName}</span>
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
            <span>{row.checkinDate}</span>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1">
            <span className="text-[10px] uppercase text-rose-600 bg-rose-50 dark:bg-rose-950/20 px-1 py-0.5 rounded-sm">{t('checkout_badge', 'OUT')}</span>
            <span>{row.checkoutDate || row.expectedCheckout || '—'}</span>
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
        if (row.status === 'Active') {
          bg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
          label = t('active_stay_badge', 'Active Stay');
        } else if (row.status === 'CheckedOut') {
          bg = 'bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-300';
          label = t('checked_out_badge', 'Checked Out');
        } else if (row.status === 'Booked') {
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
          <div className="flex items-center gap-1 font-mono font-semibold text-slate-900 dark:text-white">
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

        if (row.cFormFiledAt) {
          return (
            <div className="flex flex-col py-1">
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{t('filed_badge', 'Filed')}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5">{row.cFormFiledAt}</span>
            </div>
          );
        }

        return (
          <div className="flex items-center gap-1 text-rose-500 dark:text-rose-400 font-semibold text-xs">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{t('pending_filing_badge', 'Pending Filing')}</span>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
      {/* Page Title & Header */}
      <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-blue-600" />
            <span>{t('guest_registration_archive_heading', 'Guest Registration Archive')}</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {t('guest_history_description', 'Browse complete history of current, upcoming, and past guest bookings, stays, and ledger records.')}
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={filteredGuests.length === 0}
          className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95 self-start md:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>{t('export_filtered_csv_button', 'Export filtered list (CSV)')}</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col lg:flex-row items-center gap-4">
        {/* Search */}
        <div className="relative w-full lg:w-96">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={t('search_guest_history_placeholder', 'Search by guest name, phone, room...')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-900 dark:border-slate-700 dark:text-white"
          />
        </div>

        {/* Filters Group */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto lg:ml-auto">
          {/* Stay Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">{t('status_filter_label', 'Status:')}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 dark:text-slate-200 dark:bg-slate-900 dark:border-slate-700 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-semibold cursor-pointer"
            >
              <option value="All">{t('all_stays_option', 'All Stays')}</option>
              <option value="Active">{t('active_stays_option', 'Active stays only')}</option>
              <option value="CheckedOut">{t('checked_out_stays_option', 'Checked out only')}</option>
              <option value="Booked">{t('reserved_stays_option', 'Reserved only')}</option>
            </select>
          </div>

          {/* Nationality Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-semibold">{t('nationality_filter_label', 'Nationality:')}</span>
            <select
              value={foreignFilter}
              onChange={(e) => setForeignFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 text-slate-700 dark:text-slate-200 dark:bg-slate-900 dark:border-slate-700 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none font-semibold cursor-pointer"
            >
              <option value="All">{t('all_nations_option', 'All Nations')}</option>
              <option value="Foreigner">{t('foreign_nations_option', 'Foreign Nationals (C-Form required)')}</option>
              <option value="Indian">{t('indian_nations_option', 'Indian Nationals')}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-2xs">
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
