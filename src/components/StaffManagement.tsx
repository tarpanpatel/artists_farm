import React, { useState, useEffect } from 'react';
import { Tooltip } from './Tooltip';
import DataTable from 'react-data-table-component';
import {
  Calendar as CalendarIcon,
  Plus,
  UserCheck,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  IndianRupee,
  X,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  QrCode,
  Edit2,
  Trash2,
  Upload,
  Key,
  Store,
  ArrowRight
} from 'lucide-react';
import { StaffMember, AttendanceRecord, UserAccount, PayeeEntity, StaffAdvance, SalaryEntry } from '../types';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { addPayeeDB, addStaffUserDB, deletePayeeDB, deleteStaffUserDB, fetchPayeesFromDB, updateStaffUserDB, saveAttendanceToDB, generateSalaryEntry, fetchCashDrawerSummaryFromDB, addDrawerEntryToDB, fetchStaffAdvancesFromDB, addStaffAdvanceToDB, deleteStaffAdvanceFromDB } from '../services/api';
import { t } from '../i18n/en';

interface StaffManagementProps {
  activeMenuItemKey?: string;
  auditLogs?: any[];
  onLogAudit?: (actionText: string) => void;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  onAddDrawerEntry?: (entry: any) => Promise<boolean>;
  tenantId?: number;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  activeMenuItemKey,
  auditLogs,
  onLogAudit,
  onDispatchTelegram,
  onAddDrawerEntry,
  tenantId,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentUser } = useAuth();
  const { staff, attendance, addStaff, updateStaff, recordAttendance, refreshStaff } = useStaff();
  const [activeSubTab, setActiveSubTab] = useState<'control_center' | 'calendar' | 'roster'>('control_center');
  const isAttendancePage = activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries';
  // Mirrors the property-setup-step threshold in App.tsx (staff.length > 1) -
  // computed here directly off the same staff context rather than threaded
  // down as a prop, so it can't drift out of sync with the banner upstream.
  const highlightRegisterStaffStep = activeMenuItemKey === 'staff_payees_control' && staff.length <= 1;

  useEffect(() => {
    if (activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries') setActiveSubTab('calendar');
    else if (activeMenuItemKey === 'staff_directory_salaries') setActiveSubTab('roster');
    else if (activeMenuItemKey === 'staff_permissions' || activeMenuItemKey === 'staff_payees_control') setActiveSubTab('control_center');
    else setActiveSubTab('calendar');
  }, [activeMenuItemKey]);

  // Property Payroll & Payee State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [payees, setPayees] = useState<PayeeEntity[]>([]);
  // Available roles from site architecture (independent of staff members)
  const roleOptions = ['Admin', 'Staff', 'Staff Kitchen', 'Staff Supervisor', 'Super Admin'];

  // Form States
  // 1. Create User
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [newRole, setNewRole] = useState<UserAccount['role']>('');
  const [newIsFinancialHandler, setNewIsFinancialHandler] = useState(false);
  const [newQrCodeUrl, setNewQrCodeUrl] = useState('');

  // 2. Create Payee
  const [newPayeeName, setNewPayeeName] = useState('');
  const [newPayeeType, setNewPayeeType] = useState<'Vendor' | 'Third Party'>('Vendor');
  const [newPayeeQrCode, setNewPayeeQrCode] = useState('');

  // 3. Update User
  const [selectedUpdateUserId, setSelectedUpdateUserId] = useState('');
  const [updateFullName, setUpdateFullName] = useState('');
  const [updateUsername, setUpdateUsername] = useState('');
  const [updateRole, setUpdateRole] = useState<UserAccount['role'] | ''>('');
  const [updatePasscode, setUpdatePasscode] = useState('');
  const [updateIsFinancialHandler, setUpdateIsFinancialHandler] = useState(false);
  const [updateQrCodeUrl, setUpdateQrCodeUrl] = useState('');

  // Modals / Lightboxes
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingPayee, setEditingPayee] = useState<PayeeEntity | null>(null);
  const [userFormTab, setUserFormTab] = useState<'create' | 'update'>('create');

  // Attendance Calendar State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isBulkSelectEnabled, setIsBulkSelectEnabled] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Monthly Payout Calculator State - advances live in the DB (staff_advances
  // table), not localStorage, so they're durable and shared across every
  // device/terminal a property's admins use, and properly tied to a staff_id.
  const [advances, setAdvances] = useState<StaffAdvance[]>([]);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [advanceStaff, setAdvanceStaff] = useState<StaffMember | null>(null);
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [advanceReason, setAdvanceReason] = useState('');
  const [drawerSummary, setDrawerSummary] = useState<any[]>([]);

  useEffect(() => {
    fetchCashDrawerSummaryFromDB().then(data => {
      if (Array.isArray(data)) setDrawerSummary(data);
    }).catch(() => {});
    fetchStaffAdvancesFromDB().then(data => {
      if (Array.isArray(data)) setAdvances(data);
    }).catch(() => {});
  }, []);

  // Per-staff pay tracking
  const [paidStaff, setPaidStaff] = useState<Set<string>>(new Set());
  const [payingStaff, setPayingStaff] = useState<string | null>(null);

  const [searchUsers, setSearchUsers] = useState('');
  const [searchPayees, setSearchPayees] = useState('');
  const [searchPayout, setSearchPayout] = useState('');
  const [searchStaff, setSearchStaff] = useState('');

  const handleGiveAdvance = async () => {
    if (!advanceStaff || advanceAmount <= 0) return;
    const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
    const advancePayload = {
      staffId: advanceStaff.id,
      staffName: advanceStaff.name,
      amount: advanceAmount,
      date: new Date().toISOString().slice(0, 10),
      month: monthKey,
      reason: advanceReason || 'Cash advance',
      addedBy: 'Admin',
    };
    const newId = await addStaffAdvanceToDB(advancePayload);
    if (!newId) {
      showToast('Unable to save the advance to the database.', { type: 'error' });
      return;
    }
    const newAdvance: StaffAdvance = { id: newId, ...advancePayload };
    setAdvances((prev) => [...prev, newAdvance]);
    setIsAdvanceModalOpen(false);

    // Record cash leaving the drawer + post to financial_ledger
    const drawerEntry: any = {
      staff_id: advanceStaff.id,
      staff_name: advanceStaff.name,
      type: 'handover',
      amount: advanceAmount,
      notes: `Staff advance: ${newAdvance.reason}`,
    };
    if (onAddDrawerEntry) {
      onAddDrawerEntry(drawerEntry);
    } else {
      addDrawerEntryToDB(drawerEntry);
    }

    if (onLogAudit) {
      onLogAudit(`Admin gave advance of ₹${advanceAmount} to ${advanceStaff.name} (${newAdvance.reason})`);
    }

    if (onDispatchTelegram) {
      const msg = `<b>💵 ADVANCE GIVEN</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Staff:</b> ${advanceStaff.name}\n💰 <b>Amount:</b> ₹${advanceAmount.toLocaleString('en-IN')}\n📝 <b>Reason:</b> ${newAdvance.reason}\n📅 <b>Month:</b> ${monthKey}\n━━━━━━━━━━━━━━━━`;
      onDispatchTelegram('Staff Advance', msg, 'finance');
    }

    setAdvanceStaff(null);
    setAdvanceAmount(0);
    setAdvanceReason('');
  };

  const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const monthAdvances = advances.filter((a) => a.month === monthKey);

  // Form State for Add Staff Roster
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffMember['role']>('');
  const [phone, setPhone] = useState('');
  const [monthlySalary, setMonthlySalary] = useState(25000);
  const [rosterPasscode, setRosterPasscode] = useState('');

  // Edit Staff Roster State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffRole, setEditStaffRole] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffSalary, setEditStaffSalary] = useState(0);
  const [editStaffStatus, setEditStaffStatus] = useState('Active');

  useEffect(() => {
    setUsers(staff.map((member) => ({
      id: member.id,
      fullName: member.name,
      username: member.username || member.phone || '',
      role: member.role,
      passcodePin: member.passcode || '',
      isFinancialHandler: Boolean(member.isFinancialHandler),
      qrCodeUrl: member.qrCodeUrl,
      status: member.status,
    })));
  }, [staff]);

  useEffect(() => {
    fetchPayeesFromDB().then((data) => {
      setPayees(data.map((payee: any) => ({
        id: String(payee.id),
        name: payee.name,
        type: payee.type,
        qrCodeUrl: payee.qrCodeUrl,
      })));
    });
  }, []);

  useEffect(() => {
    if (!newRole && roleOptions.length) setNewRole(roleOptions[0] as UserAccount['role']);
    if (!role && roleOptions.length) setRole(roleOptions[0] as StaffMember['role']);
  }, [newRole, role, roleOptions]);

  // Month metadata
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

  // Array of days
  const now = new Date();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => {
    const dayNum = i + 1;
    const dateObj = new Date(selectedYear, selectedMonth, dayNum);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const monthStr = String(selectedMonth + 1).padStart(2, '0');
    const dayStr = String(dayNum).padStart(2, '0');
    const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;
    const isToday = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() && dayNum === now.getDate();
    return { dayNum, dayName, dateStr, isToday };
  });

  // Map attendance records
  const attendanceMap = new Map<string, AttendanceRecord['status']>();
  attendance.forEach((rec) => {
    attendanceMap.set(`${rec.staffId}_${rec.date}`, rec.status);
  });

  // Payout calculation data
  const payoutData = staff.filter((s) => s.status === 'Active').map((s) => {
    const dailyWage = daysInMonth > 0 ? s.monthlySalary / daysInMonth : 0;
    let presentDays = 0;
    monthDays.forEach((d) => {
      const status = attendanceMap.get(`${s.id}_${d.dateStr}`);
      if (status === 'Present') presentDays += 1;
      else if (status === 'Half Day') presentDays += 0.5;
    });
    const totalEarned = Math.round(dailyWage * presentDays * 100) / 100;
    const moneyOwed = Math.round((s.monthlySalary - totalEarned) * 100) / 100;
    // staffId matches new advances; name fallback covers rows that predate it -
    // namely the out-of-pocket kitchen-purchase reimbursement credits
    // inventory.php writes directly, which only ever recorded a staff name.
    const staffAdvances = monthAdvances
      .filter((a) => (a.staffId ? a.staffId === s.id : a.staffName === s.name))
      .reduce((sum, a) => sum + a.amount, 0);
    const ds = drawerSummary.find(d => d.staffId === s.id || d.username === s.name || d.staffName === s.name);
    const cashCollected = ds?.cashCollected ?? 0;
    const handovers = ds?.drawerHandovers ?? 0;
    const outOfPocket = ds?.outOfPocketExpenses ?? 0;
    const netDrawer = cashCollected - handovers - outOfPocket;
    const pendingPayout = Math.round((totalEarned - staffAdvances - netDrawer) * 100) / 100;
    return { staff: s, dailyWage, presentDays, totalEarned, moneyOwed, advances: staffAdvances, cashCollected, handovers, outOfPocket, netDrawer, pendingPayout };
  });

  const filteredUsers = users.filter(u => !searchUsers || u.fullName.toLowerCase().includes(searchUsers.toLowerCase()) || u.username.toLowerCase().includes(searchUsers.toLowerCase()) || u.role.toLowerCase().includes(searchUsers.toLowerCase()));
  const filteredPayees = payees.filter(p => !searchPayees || p.name.toLowerCase().includes(searchPayees.toLowerCase()) || p.type.toLowerCase().includes(searchPayees.toLowerCase()));
  const filteredPayout = payoutData.filter(r => !searchPayout || r.staff.name.toLowerCase().includes(searchPayout.toLowerCase()));
  const filteredStaff = staff.filter(m => !searchStaff || m.name.toLowerCase().includes(searchStaff.toLowerCase()) || m.role.toLowerCase().includes(searchStaff.toLowerCase()));

  // Handlers for Control Center
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newUsername || !newPasscode) return;
    if (!/^\d{10}$/.test(newUsername)) {
      showToast('Username must be a 10-digit phone number.', { type: 'error' });
      return;
    }
    if (!/^\d{6}$/.test(newPasscode)) {
      showToast('Passcode must be exactly 6 digits.', { type: 'error' });
      return;
    }
    const newUser: UserAccount = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      fullName: newFullName.trim(),
      username: newUsername,
      role: newRole,
      passcodePin: newPasscode,
      isFinancialHandler: newIsFinancialHandler,
      qrCodeUrl: newQrCodeUrl || undefined,
      status: 'Active',
    };
    const saved = await addStaffUserDB({
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      role: newUser.role,
      passcode: newUser.passcodePin,
      phone: newUser.username,
      isFinancialHandler: newUser.isFinancialHandler,
      qrCodeUrl: newUser.qrCodeUrl,
      status: newUser.status,
    });
    if (!saved) {
      showToast('Unable to save the staff member to the database.', { type: 'error' });
      return;
    }
    refreshStaff?.();
    showToast('Staff login account created successfully!', { type: 'success' });
    setNewFullName('');
    setNewUsername('');
    setNewPasscode('');
    setNewQrCodeUrl('');
    setNewIsFinancialHandler(false);
  };

  const handleDeleteUser = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete User Profile',
      message: 'Delete user profile permanently?',
      confirmText: 'Delete User',
      variant: 'danger',
    });
    if (confirmed) {
      if (await deleteStaffUserDB(id)) refreshStaff?.();
      else showToast('Unable to delete the staff member from the database.', { type: 'error' });
    }
  };

  const handleCreatePayee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayeeName) return;
    const newPayee: PayeeEntity = {
      id: `pay-${Date.now().toString().slice(-4)}`,
      name: newPayeeName,
      type: newPayeeType,
      qrCodeUrl: newPayeeQrCode || undefined,
    };
    if (!await addPayeeDB(newPayee)) {
      showToast('Unable to save the payee to the database.', { type: 'error' });
      return;
    }
    setPayees((previous) => [...previous, newPayee]);
    setNewPayeeName('');
    setNewPayeeQrCode('');
  };

  const handleDeletePayee = async (id: string) => {
    const confirmed = await confirm({
      title: 'Purge Payee Archive',
      message: 'Purge payee archive records permanently?',
      confirmText: 'Purge Payee',
      variant: 'danger',
    });
    if (confirmed) {
      if (await deletePayeeDB(id)) setPayees((previous) => previous.filter((payee) => payee.id !== id));
      else showToast('Unable to delete the payee from the database.', { type: 'error' });
    }
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUpdateUserId) return;
    const targetUser = users.find((user) => user.id === selectedUpdateUserId);
    if (!targetUser) return;
    if (!updateFullName.trim()) {
      showToast('Staff Name is required.', { type: 'error' });
      return;
    }
    if (updateUsername && !/^\d{10}$/.test(updateUsername)) {
      showToast('Username must be a 10-digit phone number.', { type: 'error' });
      return;
    }
    if (updatePasscode && !/^\d{6}$/.test(updatePasscode)) {
      showToast('Passcode must be exactly 6 digits.', { type: 'error' });
      return;
    }
    const saved = await updateStaffUserDB(selectedUpdateUserId, {
      fullName: updateFullName.trim(),
      username: updateUsername || targetUser.username,
      role: updateRole || targetUser.role,
      passcode: updatePasscode || targetUser.passcodePin,
      isFinancialHandler: updateIsFinancialHandler,
      qrCodeUrl: updateQrCodeUrl || targetUser.qrCodeUrl,
    });
    if (!saved) {
      showToast('Unable to update the user in the database.', { type: 'error' });
      return;
    }
    refreshStaff?.();
    setSelectedUpdateUserId('');
    setUpdateFullName('');
    setUpdateUsername('');
    setUpdatePasscode('');
    setUpdateRole('');
    setUpdateQrCodeUrl('');
    showToast('User account updated successfully!', { type: 'success' });
  };

  const handleUpdatePayeeSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayee) return;
    setPayees((prev) =>
      prev.map((p) => (p.id === editingPayee.id ? editingPayee : p))
    );
    setEditingPayee(null);
  };

  // Toggle single cell status
  const handleCellClick = (staffMember: StaffMember, dateStr: string) => {
    const cellKey = `${staffMember.id}_${dateStr}`;
    if (isBulkSelectEnabled) {
      const next = new Set(selectedCells);
      if (next.has(cellKey)) {
        next.delete(cellKey);
      } else {
        next.add(cellKey);
      }
      setSelectedCells(next);
      return;
    }

    const currentStatus = attendanceMap.get(cellKey);
    let newStatus: AttendanceRecord['status'] | null = 'Present';

    if (!currentStatus) {
      newStatus = 'Present';
    } else if (currentStatus === 'Present') {
      newStatus = 'Absent';
    } else if (currentStatus === 'Absent') {
      newStatus = 'Half Day';
    } else {
      newStatus = null;
    }

    if (newStatus) {
      recordAttendance({
        id: `att-${Date.now().toString().slice(-4)}`,
        date: dateStr,
        staffId: staffMember.id,
        staffName: staffMember.name,
        status: newStatus,
      });
    }
  };

  const applyBulkStatus = (status: AttendanceRecord['status'] | 'Clear') => {
    selectedCells.forEach((key) => {
      const [staffId, dateStr] = key.split('_');
      const member = staff.find((s) => s.id === staffId);
      if (member) {
        recordAttendance({
          id: `att-${Date.now().toString().slice(-4)}`,
          date: dateStr,
          staffId: member.id,
          staffName: member.name,
          status: status as any,
        });
      }
    });
    setSelectedCells(new Set());
  };

  const handleSelectAllCells = () => {
    const all = new Set<string>();
    staff.forEach((member) => {
      monthDays.forEach((d) => {
        all.add(`${member.id}_${d.dateStr}`);
      });
    });
    setSelectedCells(all);
    setIsBulkSelectEnabled(true);
  };

  const handleSelectTodayCells = () => {
    const todayObj = monthDays.find((d) => d.isToday) || monthDays[0];
    if (!todayObj) return;
    const todaySet = new Set<string>();
    staff.forEach((member) => {
      todaySet.add(`${member.id}_${todayObj.dateStr}`);
    });
    setSelectedCells(todaySet);
    setIsBulkSelectEnabled(true);
  };

  const handleAddStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;
    if (!/^\d{10}$/.test(phone)) {
      showToast('Phone number must be a 10-digit mobile number.', { type: 'error' });
      return;
    }
    if (!/^\d{6}$/.test(rosterPasscode)) {
      showToast('Passcode must be exactly 6 digits.', { type: 'error' });
      return;
    }

    const newStaff: StaffMember = {
      id: `st-${Date.now().toString().slice(-4)}`,
      name,
      role,
      phone,
      monthlySalary: Number(monthlySalary),
      status: 'Active',
      passcode: rosterPasscode,
    };

    const saved = await addStaff(newStaff);
    if (!saved) {
      showToast('Unable to save the staff member to the database.', { type: 'error' });
      return;
    }
    setIsModalOpen(false);
    setName('');
    setPhone('');
    setRosterPasscode('');
  };

  const totalPayroll = staff.reduce((acc, s) => acc + s.monthlySalary, 0);

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs Header */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" /> {t('payroll_control_center_heading', 'Property Payroll & Payee Control Center')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAttendancePage
                ? t('attendance_page_subtitle', 'Track staff attendance and manage salary details.')
                : t('staff_payee_subtitle', 'Manage login staff credentials, core operational suppliers, and pass-through third parties.')}
            </p>
          </div>

          {/* Moved Bulk Select controls here */}
          {isAttendancePage && activeSubTab === 'calendar' && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => {
                  setIsBulkSelectEnabled(!isBulkSelectEnabled);
                  setSelectedCells(new Set());
                }}
                className={`font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-2xs ${
                  isBulkSelectEnabled
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300 dark:ring-blue-800'
                    : 'bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 text-white'
                }`}
              >
                {isBulkSelectEnabled ? '✕ Exit Bulk Mode' : '⚡ Enable Bulk Select'}
              </button>

              {isBulkSelectEnabled && (
                <div className="flex items-center gap-1.5 text-xs flex-wrap sm:flex-nowrap">
                  <button
                    onClick={handleSelectTodayCells}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    📅 Select Today ({staff.length})
                  </button>
                  <button
                    onClick={handleSelectAllCells}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold px-2.5 py-1.5 rounded-lg transition-all cursor-pointer"
                  >
                    🗓️ Select Month
                  </button>
                  {selectedCells.size > 0 && (
                    <button
                      onClick={() => setSelectedCells(new Set())}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 font-bold px-2 py-1 cursor-pointer"
                    >
                      Clear ({selectedCells.size})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SUB-TAB 1: PROPERTY PAYROLL & PAYEE CONTROL CENTER (HTML SNIPPET MATCH) */}
      {activeSubTab === 'control_center' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT COLUMN: SYSTEM TABLES (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Table 1: Active System Users & Staff */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-indigo-600 pl-2.5">
                  {t('active_system_users_heading', 'Active System Users & Staff')}
                </h3>
                <div className="flex items-center gap-3">
                  {tenantId && (
                    <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 px-3 py-1.5 rounded-lg shadow-md">
                      <p className="text-xs text-white font-bold">Tenant ID: <span className="font-mono text-sm">{tenantId}</span></p>
                    </div>
                  )}
                  <span className="text-xs text-slate-400 font-mono">{users.length} {t('registered_suffix', 'Registered')}</span>
                </div>
              </div>

              <DataTable
                columns={[
                  {
                    name: t('staff_name_label', 'Staff Name'),
                    selector: (row: any) => row.fullName,
                    sortable: true,
                    cell: (row: any) => <span className="font-bold text-slate-900 dark:text-white">{row.fullName}</span>,
                  },
                  {
                    name: t('username_column', 'Username'),
                    selector: (row: any) => row.username,
                    sortable: true,
                    width: '130px',
                    cell: (row: any) => <span className="font-mono text-slate-500 dark:text-slate-400">{row.username}</span>,
                  },
                  {
                    name: t('role_group_column', 'Role Group'),
                    selector: (row: any) => row.role,
                    sortable: true,
                    width: '150px',
                    cell: (row: any) => <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-bold text-[10px]">{row.role}</span>,
                  },
                  {
                    name: t('cash_handling_column', 'Cash Handling'),
                    selector: (row: any) => row.isFinancialHandler ? 'Cash Handler' : 'No Finances',
                    sortable: true,
                    center: true,
                    width: '150px',
                    cell: (row: any) => row.isFinancialHandler ? (
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-semibold">{t('cash_handler_badge', '💳 Cash Handler')}</span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">{t('no_finances_badge', 'No Finances')}</span>
                    ),
                  },
                  {
                    name: t('upi_qr_code_column', 'UPI QR Code'),
                    center: true,
                    width: '130px',
                    cell: (row: any) => row.qrCodeUrl ? (
                      <button onClick={() => setLightboxUrl(row.qrCodeUrl!)} className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer">{t('view_qr_button', '📸 View QR')}</button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">{t('none_label', 'None')}</span>
                    ),
                  },
                  {
                    name: t('actions_column', 'Actions'),
                    right: true,
                    width: '120px',
                    cell: (row: any) => currentUser?.id === row.id ? (
                      <span className="text-slate-400 italic text-[11px]">{t('active_session_badge', 'Active Session')}</span>
                    ) : (
                      <button onClick={() => handleDeleteUser(row.id)} className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer">{t('delete_button', 'Delete')}</button>
                    ),
                  },
                ]}
                data={filteredUsers}
                pagination
                paginationPerPage={15}
                paginationRowsPerPageOptions={[10, 15, 25, 50]}
                highlightOnHover
                subHeader={
                  <div className="w-full flex items-center py-2">
                    <input type="text" value={searchUsers} onChange={e => setSearchUsers(e.target.value)} placeholder="Search by name, username, or role..." className="w-full max-w-xs p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                  </div>
                }
                customStyles={{
                  subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
                  headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
                  cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
                  headRow: { style: { backgroundColor: '#f8fafc' } },
                  rows: { style: { minHeight: '52px' } },
                }}
                noDataComponent={
                  <div className="p-8 text-center text-slate-400 font-semibold text-xs">{t('no_system_users_message', 'No system users registered.')}</div>
                }
              />
            </div>

            {/* Table 2: Registered Payees (Vendors & Third Parties) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-orange-500 pl-2.5">
                  {t('registered_payees_heading', 'Registered Payees (Vendors & Third Parties)')}
                </h3>
                <span className="text-xs text-slate-400 font-mono">{payees.length} {t('vendors_suffix', 'Vendors')}</span>
              </div>

              <DataTable
                columns={[
                  {
                    name: t('payee_name_column', 'Payee Name'),
                    selector: (row: any) => row.name,
                    sortable: true,
                    cell: (row: any) => <span className="font-bold text-slate-900 dark:text-white">{row.name}</span>,
                  },
                  {
                    name: t('classification_column', 'Classification'),
                    selector: (row: any) => row.type,
                    sortable: true,
                    width: '150px',
                    cell: (row: any) => row.type === 'Vendor' ? (
                      <span className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 px-2 py-0.5 rounded font-bold text-[10px]">{t('vendor_badge', 'Vendor')}</span>
                    ) : (
                      <span className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded font-bold text-[10px]">{t('third_party_badge', 'Third Party')}</span>
                    ),
                  },
                  {
                    name: t('upi_qr_code_column', 'UPI QR Code'),
                    center: true,
                    width: '130px',
                    cell: (row: any) => row.qrCodeUrl ? (
                      <button onClick={() => setLightboxUrl(row.qrCodeUrl!)} className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer">{t('view_qr_button', '📸 View QR')}</button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">{t('none_label', 'None')}</span>
                    ),
                  },
                  {
                    name: t('actions_column', 'Actions'),
                    right: true,
                    width: '130px',
                    cell: (row: any) => (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setEditingPayee(row)} className="text-sky-600 hover:text-sky-700 font-bold text-[11px] cursor-pointer">{t('edit_button', 'Edit')}</button>
                        <button onClick={() => handleDeletePayee(row.id)} className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer">{t('delete_button', 'Delete')}</button>
                      </div>
                    ),
                  },
                ]}
                data={filteredPayees}
                pagination
                paginationPerPage={15}
                paginationRowsPerPageOptions={[10, 15, 25, 50]}
                highlightOnHover
                subHeader={
                  <div className="w-full flex items-center py-2">
                    <input type="text" value={searchPayees} onChange={e => setSearchPayees(e.target.value)} placeholder="Search by name or type..." className="w-full max-w-xs p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                  </div>
                }
                customStyles={{
                  subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
                  headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
                  cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
                  headRow: { style: { backgroundColor: '#f8fafc' } },
                  rows: { style: { minHeight: '52px' } },
                }}
                noDataComponent={
                  <div className="p-8 text-center text-slate-400 font-semibold text-xs">No payees registered.</div>
                }
              />
            </div>
          </div>

           {/* RIGHT COLUMN: MANAGERIAL ENTRY FORMS (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Merged Form 1+3: Create & Update User with Tabs */}
            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs text-xs">
              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setUserFormTab('create')}
                  className={`flex-1 py-3 text-xs font-bold text-center cursor-pointer transition-colors rounded-tl-2xl ${
                    userFormTab === 'create'
                      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-b-2 border-indigo-500'
                      : 'bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  ➕ Create Login Staff Account
                </button>
                <button
                  onClick={() => setUserFormTab('update')}
                  className={`flex-1 py-3 text-xs font-bold text-center cursor-pointer transition-colors rounded-tr-2xl ${
                    userFormTab === 'update'
                      ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 border-b-2 border-amber-500'
                      : 'bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-slate-700'
                  }`}
                >
                  ⚙ Update Staff Account
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-5">
                {userFormTab === 'create' ? (
                  <form onSubmit={handleCreateUser} className="space-y-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('staff_name_label', 'Staff Name')}</label>
                      <input
                        type="text"
                        required
                        value={newFullName}
                        onChange={(e) => setNewFullName(e.target.value)}
                        placeholder="e.g. Ratan Singh"
                        className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('phone_login_username_label', 'Phone Number (Login Username)')}</label>
                        <input
                          type="tel"
                          required
                          maxLength={10}
                          value={newUsername}
                          onChange={(e) => setNewUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="10-digit mobile number"
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('six_digit_passcode_label', '6-Digit Passcode PIN')}</label>
                        <input
                          type="password"
                          required
                          maxLength={6}
                          value={newPasscode}
                          onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••"
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center font-mono font-bold tracking-widest text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('team_role', 'Team Role')}</label>
                        <StyledSelect
                          value={newRole}
                          onChange={(val) => setNewRole(val as any)}
                          options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 h-[38px] mb-0.5">
                        <input
                          type="checkbox"
                          id="isFinancialHandlerCheck"
                          checked={newIsFinancialHandler}
                          onChange={(e) => setNewIsFinancialHandler(e.target.checked)}
                          className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                        />
                        <label htmlFor="isFinancialHandlerCheck" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                          {t('cash_handling_user_label', 'Cash Handling User')}
                        </label>
                        <Tooltip content={t('cash_handling_help_tooltip', 'Select if this person handles cash/payments')}>
                          <span className="inline-flex items-center rounded-lg bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                            {t('help_label', 'Help?')}
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('staff_qr_upload_label', 'Staff Payment QR Code Image (Optional)')}</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setNewQrCodeUrl(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full text-xs text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        Register Staff Member
                      </button>
                      {highlightRegisterStaffStep && <ArrowRight className="w-5 h-5 text-indigo-500 animate-bounce shrink-0" />}
                    </div>
                  </form>
                ) : (
                  <form onSubmit={handleUpdateUserSubmit} className="space-y-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('select_staff_target_account_label', 'Select Staff Target Account')}</label>
                      <StyledSelect
                        value={selectedUpdateUserId}
                        onChange={(uid) => {
                          setSelectedUpdateUserId(uid);
                          const target = users.find((u) => u.id === uid);
                          if (target) {
                            setUpdateFullName(target.fullName);
                            setUpdateUsername(target.username);
                            setUpdateRole(target.role);
                            setUpdateIsFinancialHandler(target.isFinancialHandler);
                          }
                        }}
                        placeholder="-- Choose User Profile --"
                        options={users.map((u) => ({ value: u.id, label: `${u.fullName} - ${u.username} (${u.role})` }))}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('staff_name_label', 'Staff Name')}</label>
                        <input
                          type="text"
                          value={updateFullName}
                          onChange={(e) => setUpdateFullName(e.target.value)}
                          placeholder="e.g. Ratan Singh"
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('phone_login_username_label', 'Phone Number (Login Username)')}</label>
                        <input
                          type="tel"
                          maxLength={10}
                          value={updateUsername}
                          onChange={(e) => setUpdateUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="10-digit mobile number"
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('new_passcode_optional_label', 'New 6-Digit Passcode PIN (Leave blank to keep current)')}</label>
                        <input
                          type="password"
                          maxLength={6}
                          value={updatePasscode}
                          onChange={(e) => setUpdatePasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="••••••"
                          className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center font-mono font-bold tracking-widest text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                      <div>
                        <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('new_system_role_label', 'New System Role')}</label>
                        <StyledSelect
                          value={updateRole}
                          onChange={(val) => setUpdateRole(val as any)}
                          placeholder="-- Keep Current Role --"
                          options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 h-[38px] mb-0.5">
                        <input
                          type="checkbox"
                          id="updateIsFinancialHandlerCheck"
                          checked={updateIsFinancialHandler}
                          onChange={(e) => setUpdateIsFinancialHandler(e.target.checked)}
                          className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                        />
                        <label htmlFor="updateIsFinancialHandlerCheck" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                          {t('cash_handling_user_label', 'Cash Handling User')}
                        </label>
                        <Tooltip content={t('cash_handling_help_tooltip', 'Select if this person handles cash/payments')}>
                          <span className="inline-flex items-center rounded-lg bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                            {t('help_label', 'Help?')}
                          </span>
                        </Tooltip>
                      </div>
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('replace_qr_label', 'Replace Payment QR Code Image')}</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setUpdateQrCodeUrl(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="w-full text-xs text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Apply Account Changes
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* Form 2: Register Account Payee */}
            <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs text-xs">
              <div className="p-5 space-y-3">
                <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  ➕ Register Account Payee
                </h4>

                <form onSubmit={handleCreatePayee} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('payee_account_name_label', 'Payee Account Name')}</label>
                      <input
                        type="text"
                        required
                        value={newPayeeName}
                        onChange={(e) => setNewPayeeName(e.target.value)}
                        placeholder="e.g. Raju Grocery / Pool Supplier"
                        className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('classification_group_label', 'Classification Group')}</label>
                      <StyledSelect
                        value={newPayeeType}
                        onChange={(val) => setNewPayeeType(val as any)}
                        options={[
                          { value: 'Vendor', label: 'Business Vendor (Daily/Project Supplies)' },
                          { value: 'Third Party', label: 'Third Party Account (Pass-Through Routing)' },
                        ]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">{t('upload_upi_qr_label', 'Upload UPI QR Image Screenshot')}</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setNewPayeeQrCode(reader.result as string);
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="w-full text-xs text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Save Payee to Database
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ATTENDANCE CALENDAR MATRIX */}
      {activeSubTab === 'calendar' && (
        <div className="space-y-4">
          {/* Bulk Marking Action Buttons */}
          {(isBulkSelectEnabled || selectedCells.size > 0) && (
            <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  ⚡ Bulk Selection Actions
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {selectedCells.size > 0 ? (
                    <span className="text-blue-600 dark:text-blue-400 font-bold">
                      🎯 {selectedCells.size} cell{selectedCells.size > 1 ? 's' : ''} selected
                    </span>
                  ) : (
                    <span>Select cells in the grid below to bulk update</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-1">
                  Mark Selected Cells As:
                </span>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Present')}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-emerald-700 flex items-center justify-center text-[10px]">P</span>
                  <span>{t('mark_present_label', 'Mark Present (P)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Absent')}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-red-700 flex items-center justify-center text-[10px]">A</span>
                  <span>{t('mark_absent_label', 'Mark Absent (A)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Half Day')}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-indigo-700 flex items-center justify-center text-[10px]">L</span>
                  <span>{t('mark_leave_halfday_label', 'Mark Leave / Half Day (L)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Clear')}
                  className="bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span>{t('clear_status_label', 'Clear Status (-)')}</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-between">
            <button
              onClick={() => {
                if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                else { setSelectedMonth(m => m - 1); }
              }}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
            >
              ← Prev
            </button>
            <div className="font-bold text-sm text-slate-800 dark:text-white">
              {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth()); }}
                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                  else { setSelectedMonth(m => m + 1); }
                }}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
            <div className="overflow-x-auto relative">
              <table className="datatable w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/80 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-slate-700 font-bold">
                    <th className="sticky left-0 bg-gray-50 dark:bg-slate-900 z-20 text-left px-4 py-3 min-w-[150px] border-r border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white">
                      Staff Member
                    </th>
                    {monthDays.map((d) => (
                      <th
                        key={`num-${d.dayNum}`}
                        className={`px-2 py-2 min-w-[36px] max-w-[40px] text-[11px] border-r border-gray-200 dark:border-slate-700/60 ${
                          d.isToday ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 font-bold' : ''
                        }`}
                      >
                        {d.dayNum}
                      </th>
                    ))}
                  </tr>

                  <tr className="bg-gray-50/70 dark:bg-slate-900/50 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700 font-medium text-[10px]">
                    <th className="sticky left-0 bg-gray-50 dark:bg-slate-900 z-20 border-r border-gray-200 dark:border-slate-700"></th>
                    {monthDays.map((d) => (
                      <th
                        key={`name-${d.dayNum}`}
                        className={`px-2 py-1.5 border-r border-gray-200 dark:border-slate-700/60 ${
                          d.isToday ? 'bg-amber-100/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold' : ''
                        }`}
                      >
                        {d.dayName}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60 text-gray-800 dark:text-gray-200">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-gray-50 dark:group-hover:bg-slate-700/60 z-10 text-left px-4 py-3 font-semibold text-gray-900 dark:text-white border-r border-gray-200 dark:border-slate-700 truncate min-w-[150px]">
                        {member.name}
                      </td>

                      {monthDays.map((d) => {
                        const cellKey = `${member.id}_${d.dateStr}`;
                        const status = attendanceMap.get(cellKey);
                        const isSelected = selectedCells.has(cellKey);

                        return (
                          <td
                            key={cellKey}
                            onClick={() => handleCellClick(member, d.dateStr)}
                            className={`px-1 py-2 border-r border-gray-100 dark:border-slate-700/40 cursor-pointer transition-all select-none ${
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900/80 ring-2 ring-blue-500 z-10'
                                : d.isToday
                                ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                : ''
                            }`}
                          >
                            {status === 'Present' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold text-xs shadow-2xs">
                                P
                              </span>
                            )}

                            {status === 'Absent' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-bold text-xs shadow-2xs">
                                A
                              </span>
                            )}

                            {status === 'Half Day' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold text-xs shadow-2xs">
                                L
                              </span>
                            )}

                            {!status && (
                              <span className="text-gray-300 dark:text-gray-600 font-bold text-xs">
                                -
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MONTHLY PAYOUT CALCULATOR */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-amber-800/40 shadow-sm overflow-hidden transition-colors">
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 px-4 py-3 border-b border-amber-200 dark:border-amber-800/40">
              <h3 className="font-semibold text-amber-900 dark:text-amber-200 text-xs tracking-wider uppercase flex items-center gap-2">
                <IndianRupee className="w-4 h-4" />
                {t('monthly_payout_calculator_heading', 'Monthly Payout Calculator')}
              </h3>
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-full">
                {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>

            <DataTable
              columns={[
                {
                  name: 'Staff Name',
                  selector: (row: any) => row.staff.name,
                  sortable: true,
                  cell: (row: any) => <span className="font-bold text-gray-900 dark:text-white text-sm">{row.staff.name}</span>,
                },
                {
                  name: 'Daily Wage (₹)',
                  selector: (row: any) => row.dailyWage,
                  sortable: true,
                  right: true,
                  width: '120px',
                  cell: (row: any) => <span className="font-mono text-gray-600 dark:text-gray-300">₹{row.dailyWage.toFixed(2)}</span>,
                },
                {
                  name: 'Present Days',
                  selector: (row: any) => row.presentDays,
                  sortable: true,
                  center: true,
                  width: '110px',
                  cell: (row: any) => <><span className="font-bold text-gray-800 dark:text-gray-200">{row.presentDays}</span><span className="text-gray-400 dark:text-gray-500"> days</span></>,
                },
                {
                  name: 'Total Earned (₹)',
                  selector: (row: any) => row.totalEarned,
                  sortable: true,
                  right: true,
                  width: '130px',
                  cell: (row: any) => <span className="font-bold text-emerald-700 dark:text-emerald-400">₹{row.totalEarned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Collected (₹)',
                  selector: (row: any) => row.cashCollected,
                  sortable: true,
                  right: true,
                  width: '110px',
                  cell: (row: any) => <span className="font-bold text-amber-700 dark:text-amber-400">₹{row.cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Out of Pocket (₹)',
                  selector: (row: any) => row.outOfPocket,
                  sortable: true,
                  right: true,
                  width: '120px',
                  cell: (row: any) => <span className="font-bold text-purple-600 dark:text-purple-400">₹{row.outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Handovers (₹)',
                  selector: (row: any) => row.handovers,
                  sortable: true,
                  right: true,
                  width: '110px',
                  cell: (row: any) => <span className="font-bold text-indigo-600 dark:text-indigo-400">₹{row.handovers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Advances (₹)',
                  selector: (row: any) => row.advances,
                  sortable: true,
                  right: true,
                  width: '120px',
                  cell: (row: any) => {
                    // Negative = a reimbursement credit (e.g. staff paid for a kitchen
                    // purchase out of pocket), which increases payout rather than
                    // reducing it - shown in green with a + sign, not hidden as ₹0.00.
                    const isCredit = row.advances < 0;
                    return (
                      <span className={`font-bold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                        {isCredit ? '+' : '-'} ₹{Math.abs(row.advances).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    );
                  },
                },
                {
                  name: 'Pending Payout (₹)',
                  selector: (row: any) => row.pendingPayout,
                  sortable: true,
                  right: true,
                  width: '140px',
                  cell: (row: any) => <span className="font-bold text-blue-700 dark:text-blue-400">₹{row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Actions',
                  center: true,
                  width: '200px',
                  cell: (row: any) => {
                    const isPaid = paidStaff.has(row.staff.id);
                    const isPaying = payingStaff === row.staff.id;
                    return (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => { setAdvanceStaff(row.staff); setAdvanceAmount(0); setAdvanceReason(''); setIsAdvanceModalOpen(true); }}
                          className="bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:hover:bg-emerald-800/60 text-emerald-800 dark:text-emerald-300 font-bold text-[10px] px-2 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Advance
                        </button>
                        {isPaid ? (
                          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] px-2 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <button
                            disabled={isPaying || row.pendingPayout <= 0}
                            onClick={async () => {
                              setPayingStaff(row.staff.id);
                              const monthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
                              const recs = attendance.filter(a => a.staffId === row.staff.id && a.date.startsWith(monthKey));
                              await saveAttendanceToDB(recs);
                              const ok = await generateSalaryEntry({
                                staffId: row.staff.id,
                                staffName: row.staff.name,
                                amount: row.pendingPayout,
                                month: monthKey,
                                description: `Salary (Auto): ${row.staff.name} - ${monthKey}`,
                              });
                              setPayingStaff(null);
                              if (ok) {
                                setPaidStaff(prev => new Set(prev).add(row.staff.id));
                                if (onDispatchTelegram) {
                                  const msg = `<b>💰 SALARY PAYMENT</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Staff:</b> ${row.staff.name}\n📅 <b>Month:</b> ${monthKey}\n💵 <b>Amount:</b> ₹${row.pendingPayout.toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━`;
                                  onDispatchTelegram('Salary Payment', msg, 'finance');
                                }
                              }
                            }}
                            className={`font-bold text-[10px] px-2 py-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                              row.pendingPayout <= 0
                                ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                            }`}
                          >
                            {isPaying ? 'Paying...' : <><IndianRupee className="w-3 h-3" /> Pay Now</>}
                          </button>
                        )}
                      </div>
                    );
                  },
                },
              ]}
              data={filteredPayout}
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[10, 15, 25, 50]}
              highlightOnHover
              subHeader={
                <div className="w-full flex items-center py-2">
                  <input type="text" value={searchPayout} onChange={e => setSearchPayout(e.target.value)} placeholder="Search by staff name..." className="w-full max-w-xs p-2 border border-amber-300 dark:border-amber-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                </div>
              }
              customStyles={{
                subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #fde68a' } },
                headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#b45309', backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a', paddingLeft: '12px' } },
                cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
                headRow: { style: { backgroundColor: '#fffbeb' } },
                rows: { style: { minHeight: '52px' } },
              }}
              noDataComponent={
                <div className="p-8 text-center text-gray-400 font-semibold text-xs">No active staff members found</div>
              }
            />

            {/* Advances History for this month */}
            {monthAdvances.length > 0 && (
              <div className="border-t border-amber-200 dark:border-amber-800/40 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">{t('advances_this_month_label', 'Advances This Month')}</p>
                <div className="space-y-1">
                  {monthAdvances.map((adv) => (
                    <div key={adv.id} className="flex items-center justify-between text-[11px] bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-1.5 border border-red-100 dark:border-red-900/30">
                      <span className="font-bold text-red-800 dark:text-red-300">{adv.staffName}</span>
                      <span className="text-red-600 dark:text-red-400">- ₹{adv.amount.toLocaleString('en-IN')}</span>
                      <span className="text-gray-400 dark:text-gray-500">{adv.reason}</span>
                      <button
                        onClick={async () => {
                          const ok = await deleteStaffAdvanceFromDB(adv.id);
                          if (ok) {
                            setAdvances((prev) => prev.filter((a) => a.id !== adv.id));
                          } else {
                            showToast('Unable to delete the advance from the database.', { type: 'error' });
                          }
                        }}
                        className="text-red-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ROSTER LIST VIEW */}
      {activeSubTab === 'roster' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs p-5 transition-colors space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-3">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              {t('staff_directory_payroll_heading', 'Staff Member Directory & Payroll Breakdown')}
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
              {t('total_payroll_label', 'Total Payroll:')} ₹{totalPayroll.toLocaleString('en-IN')} / mo
            </span>
          </div>

          <DataTable
            columns={[
              {
                name: 'Staff ID',
                selector: (row: any) => row.id,
                sortable: true,
                width: '100px',
                cell: (row: any) => <span className="font-mono font-bold text-gray-500 dark:text-gray-400">{row.id}</span>,
              },
              {
                name: 'Full Name',
                selector: (row: any) => row.name,
                sortable: true,
                cell: (row: any) => <span className="font-bold text-gray-900 dark:text-white text-sm">{row.name}</span>,
              },
              {
                name: 'Role',
                selector: (row: any) => row.role,
                sortable: true,
                width: '150px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <StyledSelect
                    value={editStaffRole}
                    onChange={setEditStaffRole}
                    options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                  />
                ) : (
                  <span className="font-medium text-gray-600 dark:text-gray-300">{row.role}</span>
                ),
              },
              {
                name: 'Phone',
                selector: (row: any) => row.phone,
                sortable: true,
                width: '140px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <input type="tel" value={editStaffPhone} onChange={e => setEditStaffPhone(e.target.value)} className="w-full p-1.5 border border-blue-300 rounded-lg text-xs font-mono bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700" />
                ) : (
                  <span className="font-mono text-gray-600 dark:text-gray-300">{row.phone}</span>
                ),
              },
              {
                name: 'Monthly Base',
                selector: (row: any) => row.monthlySalary,
                sortable: true,
                right: true,
                width: '130px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <input type="number" value={editStaffSalary} onChange={e => setEditStaffSalary(Number(e.target.value))} className="w-full p-1.5 border border-blue-300 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700" />
                ) : (
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{row.monthlySalary.toLocaleString('en-IN')}</span>
                ),
              },
              {
                name: 'Status',
                selector: (row: any) => row.status,
                sortable: true,
                width: '110px',
                center: true,
                cell: (row: any) => editingStaffId === row.id ? (
                  <StyledSelect
                    value={editStaffStatus}
                    onChange={setEditStaffStatus}
                    options={[
                      { value: 'Active', label: 'Active' },
                      { value: 'Inactive', label: 'Inactive' },
                    ]}
                  />
                ) : (
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">{row.status}</span>
                ),
              },
              ...(updateStaff ? [{
                name: 'Actions',
                right: true,
                width: '130px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { updateStaff!(row.id, { role: editStaffRole, phone: editStaffPhone, monthlySalary: editStaffSalary, status: editStaffStatus }); setEditingStaffId(null); if (onLogAudit) onLogAudit(`Updated staff ${row.name}: role=${editStaffRole}, phone=${editStaffPhone}, salary=₹${editStaffSalary}, status=${editStaffStatus}`); }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">{t('save_button', 'Save')}</button>
                    <button onClick={() => setEditingStaffId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">{t('cancel_button', 'Cancel')}</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingStaffId(row.id); setEditStaffRole(row.role); setEditStaffPhone(row.phone); setEditStaffSalary(row.monthlySalary); setEditStaffStatus(row.status); }} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">{t('edit_button', 'Edit')}</button>
                ),
              }] : []),
            ]}
            data={filteredStaff}
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[10, 15, 25, 50]}
            highlightOnHover
            subHeader={
              <div className="w-full flex items-center py-2">
                <input type="text" value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder="Search by name or role..." className="w-full max-w-xs p-2 border border-slate-300 dark:border-slate-600 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
              </div>
            }
            customStyles={{
              subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
                  headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
                  cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
                  headRow: { style: { backgroundColor: '#f8fafc' } },
                  rows: { style: { minHeight: '52px' } },
                }}
            noDataComponent={
              <div className="p-8 text-center text-gray-400 font-semibold text-xs">No staff members found.</div>
            }
          />
        </div>
      )}

      {/* LIGHTBOX MODAL FOR QR CODE VIEW */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-xs w-full p-5 text-center space-y-3 border border-slate-200 shadow-2xl relative"
          >
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="font-bold text-slate-900 text-sm">{t('registered_qr_code_heading', 'Registered QR Code')}</h4>
            <div className="rounded-xl overflow-hidden border border-slate-200 p-2 bg-slate-50">
              <img src={lightboxUrl} alt="QR Code" className="w-full h-auto rounded-lg" />
            </div>
          </div>
        </div>
      )}

      {/* EDIT PAYEE MODAL */}
      {editingPayee && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200 shadow-2xl text-xs">
            <h3 className="font-bold text-slate-900 text-sm border-l-3 border-sky-600 pl-2">
              {t('edit_payee_settings_heading', 'Edit Payee Account Settings')}
            </h3>

            <form onSubmit={handleUpdatePayeeSave} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">{t('payee_account_name_label', 'Payee Account Name')}</label>
                <input
                  type="text"
                  required
                  value={editingPayee.name}
                  onChange={(e) => setEditingPayee({ ...editingPayee, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">{t('classification_type_label', 'Classification Type')}</label>
                <StyledSelect
                  value={editingPayee.type}
                  onChange={(val) => setEditingPayee({ ...editingPayee, type: val as any })}
                  options={[
                    { value: 'Vendor', label: 'Vendor' },
                    { value: 'Third Party', label: 'Third Party' },
                  ]}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Replace QR Code Graphic Blueprint (Optional)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () =>
                        setEditingPayee({ ...editingPayee, qrCodeUrl: reader.result as string });
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="w-full text-xs text-slate-500 p-2 rounded-xl border border-slate-300"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingPayee(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-bold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs"
                >
                  Apply Save Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-gray-200 dark:border-slate-700 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">{t('add_new_staff_member_heading', 'Add New Staff Member')}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">{t('staff_name_required_label', 'Staff Name *')}</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ratan Singh"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">{t('team_role', 'Team Role')}</label>
                <StyledSelect
                  value={role}
                  onChange={(val) => setRole(val as any)}
                  options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">{t('phone_login_username_required_label', 'Phone Number (Login Username) *')}</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg font-mono focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">{t('six_digit_passcode_required_label', '6-Digit Passcode PIN *')}</label>
                <input
                  type="password"
                  required
                  maxLength={6}
                  value={rosterPasscode}
                  onChange={(e) => setRosterPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-center font-mono font-bold tracking-widest focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Monthly Salary (₹)</label>
                <input
                  type="number"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 dark:border-slate-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-2xs"
                >
                  Save Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GIVE ADVANCE MODAL */}
      {isAdvanceModalOpen && advanceStaff && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{t('give_advance_heading', 'Give Advance —')} {advanceStaff.name}</h3>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Amount (₹) *</label>
              <input
                type="number"
                min={0}
                value={advanceAmount || ''}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                placeholder="e.g. 2000"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('reason_label', 'Reason')}</label>
              <input
                type="text"
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                placeholder="e.g. Personal emergency"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGiveAdvance}
                disabled={advanceAmount <= 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:opacity-50 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Confirm Advance
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

