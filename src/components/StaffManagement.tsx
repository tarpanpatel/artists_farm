import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import DataTable from 'react-data-table-component';
import {
  Plus,
  IndianRupee,
  X,
  Check,
  Trash2,
  Zap,
  Calendar,
  CalendarDays,
  Settings,
  Target,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { StaffMember, AttendanceRecord, UserAccount, PayeeEntity, StaffAdvance } from '../types';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { addPayeeDB, addStaffUserDB, deletePayeeDB, deleteStaffUserDB, fetchPayeesFromDB, updateStaffUserDB, saveAttendanceToDB, generateSalaryEntry, fetchCashDrawerSummaryFromDB, addDrawerEntryToDB, fetchStaffAdvancesFromDB, addStaffAdvanceToDB, deleteStaffAdvanceFromDB } from '../services/api';
import { PageHeader } from './PageHeader';
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
  auditLogs: _auditLogs,
  onLogAudit,
  onDispatchTelegram,
  onAddDrawerEntry,
  tenantId: _tenantId,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentUser } = useAuth();
  const { staff, attendance, addStaff, updateStaff, recordAttendance, refreshStaff } = useStaff();
  const [activeSubTab, setActiveSubTab] = useState<'control_center' | 'calendar' | 'roster'>('control_center');
  const isAttendancePage = activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries';

  useEffect(() => {
    if (activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries') setActiveSubTab('calendar');
    else if (activeMenuItemKey === 'staff_directory_salaries') setActiveSubTab('roster');
    else if (activeMenuItemKey === 'staff_permissions' || activeMenuItemKey === 'staff_payees_control') setActiveSubTab('control_center');
    else setActiveSubTab('calendar');
  }, [activeMenuItemKey]);

  // Property Payroll & Payee State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [payees, setPayees] = useState<PayeeEntity[]>([]);
  // Available roles from site architecture (independent of staff members).
  // "Super Admin" deliberately excluded (13 Aug 2026): that role is not an
  // assignable staff position - it's a single, automatically-synced row that
  // always mirrors the tenant's own login (see syncTenantSuperAdminRow in
  // router.php). Letting it be picked here is exactly how a property ended
  // up with a second, unrelated "Super Admin" (a demo-data placeholder, or a
  // real staff member manually promoted) that then drifted out of sync with
  // the tenant's actual credentials.
  const roleOptions = ['Admin', 'Staff', 'Staff Kitchen', 'Staff Supervisor'];

  // Form States
  // 1. Create User
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPasscode, setNewPasscode] = useState('');
  const [newRole, setNewRole] = useState<UserAccount['role']>('');
  const [newIsFinancialHandler, setNewIsFinancialHandler] = useState(false);
  const [newAccessAllProperties, setNewAccessAllProperties] = useState(false);
  const [newQrCodeUrl, setNewQrCodeUrl] = useState('');
  const [newDailyWage, setNewDailyWage] = useState('');

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
  const [updateAccessAllProperties, setUpdateAccessAllProperties] = useState(false);
  const [updateQrCodeUrl, setUpdateQrCodeUrl] = useState('');
  const [updateDailyWage, setUpdateDailyWage] = useState('');

  // Modals / Lightboxes
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingPayee, setEditingPayee] = useState<PayeeEntity | null>(null);
  const [userFormTab, setUserFormTab] = useState<'create' | 'update'>('create');
  const [isTeamMemberModalOpen, setIsTeamMemberModalOpen] = useState(false);
  const [isPayeeModalOpen, setIsPayeeModalOpen] = useState(false);

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
      username: member.phone || member.username || '',
      role: member.role,
      passcodePin: member.passcode || '',
      isFinancialHandler: Boolean(member.isFinancialHandler),
      accessAllProperties: Boolean(member.accessAllProperties),
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

  const filteredPayees = payees.filter(p => !searchPayees || p.name.toLowerCase().includes(searchPayees.toLowerCase()) || p.type.toLowerCase().includes(searchPayees.toLowerCase()));
  const filteredPayout = payoutData.filter(r => !searchPayout || r.staff.name.toLowerCase().includes(searchPayout.toLowerCase()));
  const filteredStaff = staff.filter(m => !searchStaff || m.name.toLowerCase().includes(searchStaff.toLowerCase()) || m.role.toLowerCase().includes(searchStaff.toLowerCase()));

  // Role hierarchy: lower index = higher privilege
  const ROLE_HIERARCHY = ['Root Admin', 'Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];

  const getRoleLevel = (role: string) => {
    const r = role === 'root_admin' ? 'Root Admin' : role;
    return ROLE_HIERARCHY.indexOf(r) >= 0 ? ROLE_HIERARCHY.indexOf(r) : ROLE_HIERARCHY.length;
  };

  const canEditUser = (currentUserRole: string, targetUserRole: string) => {
    const currentLevel = getRoleLevel(currentUserRole);
    const targetLevel = getRoleLevel(targetUserRole);
    if (targetLevel < 0) return false; // Root Admin or unknown - hide
    return currentLevel <= targetLevel;
  };

  const visibleUsers = users.filter(u => u.role !== 'Root Admin');

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
      dailyWage: newDailyWage ? Number(newDailyWage) : 0,
    };
    const saved = await addStaffUserDB({
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      role: newUser.role,
      passcode: newUser.passcodePin,
      phone: newUser.username,
      isFinancialHandler: newUser.isFinancialHandler,
      accessAllProperties: newUser.accessAllProperties,
      qrCodeUrl: newUser.qrCodeUrl,
      status: newUser.status,
      dailyWage: newUser.dailyWage,
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
    setNewAccessAllProperties(false);
    setNewDailyWage('');
    setIsTeamMemberModalOpen(false);
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

   const handleEditUser = (user: any) => {
     setSelectedUpdateUserId(user.id);
     setUpdateFullName(user.fullName);
     setUpdateUsername(user.username);
     setUpdateRole(user.role);
     setUpdatePasscode('');
     setUpdateIsFinancialHandler(user.isFinancialHandler);
     setUpdateAccessAllProperties(Boolean(user.accessAllProperties));
     setUpdateQrCodeUrl(user.qrCodeUrl || '');
     setUpdateDailyWage(user.dailyWage ? String(user.dailyWage) : '');
     setUserFormTab('update');
     setIsTeamMemberModalOpen(true);
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
    setIsPayeeModalOpen(false);
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
      accessAllProperties: updateAccessAllProperties,
      qrCodeUrl: updateQrCodeUrl || targetUser.qrCodeUrl,
      dailyWage: updateDailyWage ? Number(updateDailyWage) : (targetUser.dailyWage ?? 0),
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
    setUpdateDailyWage('');
    setIsTeamMemberModalOpen(false);
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
    let newStatus: AttendanceRecord['status'] = 'Present';

    if (!currentStatus) {
      newStatus = 'Present';
    } else if (currentStatus === 'Present') {
      newStatus = 'Absent';
    } else if (currentStatus === 'Absent') {
      newStatus = 'Half Day';
    } else if (currentStatus === 'Half Day') {
      newStatus = 'Paid Leave';
    } else {
      // Was 'Paid Leave' (last state in the cycle) - loop back round to
      // unmarked. BUG (found 14 Aug 2026): this used to set newStatus to
      // null and the recordAttendance() call below was gated on `if
      // (newStatus)`, so clicking a cell already on "L" silently did
      // nothing - the cell was permanently stuck once it reached Paid
      // Leave. recordAttendance already treats a 'Clear' status as
      // "remove this record" (see StaffContext.tsx), so cycle to that
      // instead of bailing out.
      newStatus = 'Clear';
    }

    recordAttendance({
      id: `att-${Date.now().toString().slice(-4)}`,
      date: dateStr,
      staffId: staffMember.id,
      staffName: staffMember.name,
      status: newStatus,
    });
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
      <PageHeader
        title={t('payroll_control_center_heading', 'Property Payroll & Payee Control Center')}
        subtitle={
          isAttendancePage
            ? t('attendance_page_subtitle', 'Track staff attendance and manage salary details.')
            : t('staff_payee_subtitle', 'Manage login staff credentials, core operational suppliers, and pass-through third parties.')
        }
      >
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {(!isAttendancePage || activeSubTab === 'control_center') && (
            <Button
              onClick={() => {
                setUserFormTab('create');
                setNewFullName('');
                setNewUsername('');
                setNewPasscode('');
                setNewQrCodeUrl('');
                setNewIsFinancialHandler(false);
                setNewAccessAllProperties(false);
                setNewDailyWage('');
                setIsTeamMemberModalOpen(true);
              }}
              variant="primary"
              size="md"
              leftIcon={<Plus className="w-4 h-4" />}
              className="font-semibold shadow-2xs cursor-pointer"
            >
              Create Team Member
            </Button>
          )}

          {/* Bulk Select controls - only relevant on the attendance calendar sub-tab */}
          {isAttendancePage && activeSubTab === 'calendar' && (
            <>
              <Button
                onClick={() => {
                  setIsBulkSelectEnabled(!isBulkSelectEnabled);
                  setSelectedCells(new Set());
                }}
                variant="ghost"
                size="md"
                className={`font-semibold transition-all cursor-pointer shadow-2xs ${
                  isBulkSelectEnabled
                    ? 'bg-blue-600 text-white ring-2 ring-blue-300 dark:ring-blue-800'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isBulkSelectEnabled ? (<><X className="w-4 h-4" /> Exit Bulk Mode</>) : (<><Zap className="w-4 h-4" /> Enable Bulk Select</>)}
              </Button>

              {isBulkSelectEnabled && (
                <div className="flex items-center gap-1.5 text-xs flex-wrap sm:flex-nowrap">
                  <Button
                    onClick={handleSelectTodayCells}
                    variant="secondary"
                    size="sm"
                    className="text-slate-800 dark:text-slate-200 font-semibold transition-all cursor-pointer"
                  >
                    <><Calendar className="w-4 h-4" /> Select Today ({staff.length})</>
                  </Button>
                  <Button
                    onClick={handleSelectAllCells}
                    variant="secondary"
                    size="sm"
                    className="text-slate-800 dark:text-slate-200 font-semibold transition-all cursor-pointer"
                  >
                    <><CalendarDays className="w-4 h-4" /> Select Month</>
                  </Button>
                  {selectedCells.size > 0 && (
                    <Button
                      onClick={() => setSelectedCells(new Set())}
                      variant="ghost"
                      size="xs"
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 font-semibold cursor-pointer"
                    >
                      Clear ({selectedCells.size})
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PageHeader>

      {/* SUB-TAB 1: PROPERTY PAYROLL & PAYEE CONTROL CENTER (HTML SNIPPET MATCH) */}
      {activeSubTab === 'control_center' && (
    <div className="space-y-6 staff-management">
          {/* ROW 1: FULL WIDTH Active System Users & Staff */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <h3 className="staff-management__subtitle font-extrabold text-slate-900 dark:text-white text-sm">
                {t('active_system_users_heading', 'Active System Users & Staff')}
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{users.length} {t('registered_suffix', 'Registered')}</span>
              </div>
            </div>

            <DataTable
              columns={[
                {
                  name: t('staff_name_label', 'Staff Name'),
                  selector: (row: any) => row.fullName,
                  sortable: true,
                  width: '200px',
                  cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white">{row.fullName}</span>,
                },
                {
                  name: t('username_column', 'Username'),
                  selector: (row: any) => row.username,
                  sortable: true,
                  width: '150px',
                  cell: (row: any) => {
                    const phoneVal = (row.username || '').replace(/\D/g, '');
                    return <span className="font-mono text-slate-500 dark:text-slate-400">{phoneVal || row.username}</span>;
                  },
                },
                {
                  name: t('role_group_column', 'Role Group'),
                  selector: (row: any) => row.role,
                  sortable: true,
                  width: '160px',
                  cell: (row: any) => <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2.5 py-1 rounded font-semibold text-[10px]">{row.role}</span>,
                },
                {
                  name: t('cash_handling_column', 'Cash Handling'),
                  selector: (row: any) => row.isFinancialHandler ? 'Cash Handler' : 'No Finances',
                  sortable: true,
                  center: true,
                  width: '160px',
                  cell: (row: any) => row.isFinancialHandler ? (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">{t('cash_handler_badge', '💳 Cash Handler')}</span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">{t('no_finances_badge', 'No Finances')}</span>
                  ),
                },
                {
                  name: t('upi_qr_code_column', 'UPI QR Code'),
                  center: true,
                  width: '140px',
                  cell: (row: any) => row.qrCodeUrl ? (
                    <Button onClick={() => setLightboxUrl(row.qrCodeUrl!)} variant="link" size="sm" className="text-emerald-600 hover:text-emerald-700 font-semibold text-[11px] gap-1 mx-auto">{t('view_qr_button', '📸 View QR')}</Button>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">{t('none_label', 'None')}</span>
                  ),
                },
                {
                  name: t('actions_column', 'Actions'),
                  right: true,
                  width: '170px',
                  cell: (row: any) => {
                    const isCurrentUser = currentUser?.id === row.id;
                    const canEdit = !isCurrentUser && canEditUser(currentUser?.role || 'Staff', row.role);
                    const canDelete = !isCurrentUser && canEdit;
                    return (
                      <div className="flex items-center gap-1.5 justify-end">
                        {isCurrentUser ? (
                          <span className="text-slate-400 italic text-[11px]">{t('active_session_badge', 'Active Session')}</span>
                        ) : (
                          <>
                            {canEdit && (
                              <Button onClick={() => handleEditUser(row)} variant="secondary" size="xs" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer">{t('edit_button', 'Edit')}</Button>
                            )}
                            {canDelete && (
                              <Button onClick={() => handleDeleteUser(row.id)} variant="danger" size="xs" className="font-semibold cursor-pointer">{t('delete_button', 'Delete')}</Button>
                            )}
                            {!canEdit && !canDelete && (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  },
                },
              ]}
              data={visibleUsers}
              pagination
              paginationPerPage={15}
              paginationRowsPerPageOptions={[10, 15, 25, 50]}
              highlightOnHover
              subHeader={
                <div className="w-full flex items-center py-2">
                  <Input type="text" value={searchUsers} onChange={e => setSearchUsers(e.target.value)} placeholder="Search by name, username, or role..." className="w-full max-w-xs" />
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

          {/* ROW 2: Registered Payees Table (FULL WIDTH) */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <h3 className="staff-management__subtitle font-extrabold text-slate-900 dark:text-white text-sm">
                  {t('registered_payees_heading', 'Registered Payees (Vendors & Third Parties)')}
                </h3>
                <span className="text-xs text-slate-400">{payees.length} {t('vendors_suffix', 'Vendors')}</span>
              </div>
              <Button
                onClick={() => {
                  setNewPayeeName('');
                  setNewPayeeQrCode('');
                  setIsPayeeModalOpen(true);
                }}
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                className="font-semibold cursor-pointer"
              >
                Register Account Payee
              </Button>
            </div>

            <DataTable
              columns={[
                {
                  name: t('payee_name_column', 'Payee Name'),
                  selector: (row: any) => row.name,
                  sortable: true,
                  cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white">{row.name}</span>,
                },
                {
                  name: t('classification_column', 'Classification'),
                  selector: (row: any) => row.type,
                  sortable: true,
                  width: '160px',
                  cell: (row: any) => row.type === 'Vendor' ? (
                    <span className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 px-2.5 py-1 rounded font-semibold text-[10px]">{t('vendor_badge', 'Vendor')}</span>
                  ) : (
                    <span className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-2.5 py-1 rounded font-semibold text-[10px]">{t('third_party_badge', 'Third Party')}</span>
                  ),
                },
                {
                  name: t('upi_qr_code_column', 'UPI QR Code'),
                  center: true,
                  width: '140px',
                  cell: (row: any) => row.qrCodeUrl ? (
                    <Button onClick={() => setLightboxUrl(row.qrCodeUrl!)} variant="link" size="sm" className="text-emerald-600 hover:text-emerald-700 font-semibold text-[11px] gap-1 mx-auto">{t('view_qr_button', '📸 View QR')}</Button>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">{t('none_label', 'None')}</span>
                  ),
                },
                {
                  name: t('actions_column', 'Actions'),
                  right: true,
                  width: '160px',
                  cell: (row: any) => (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button onClick={() => setEditingPayee(row)} variant="secondary" size="xs" className="font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400 cursor-pointer">{t('edit_button', 'Edit')}</Button>
                      <Button onClick={() => handleDeletePayee(row.id)} variant="danger" size="xs" className="font-semibold cursor-pointer">{t('delete_button', 'Delete')}</Button>
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
                  <Input type="text" value={searchPayees} onChange={e => setSearchPayees(e.target.value)} placeholder="Search by name or type..." className="w-full max-w-xs" />
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
      )}

      {/* SUB-TAB 2: ATTENDANCE CALENDAR MATRIX */}
      {activeSubTab === 'calendar' && (
        <div className="space-y-4">
          {/* Bulk Marking Action Buttons */}
          {(isBulkSelectEnabled || selectedCells.size > 0) && (
            <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-700">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" /> Bulk Selection Actions
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {selectedCells.size > 0 ? (
                    <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" /> {selectedCells.size} cell{selectedCells.size > 1 ? 's' : ''} selected
                    </span>
                  ) : (
                    <span>Select cells in the grid below to bulk update</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 mr-1">
                  Mark Selected Cells As:
                </span>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Present')}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-emerald-700 flex items-center justify-center text-[10px]">P</span>
                  <span>{t('mark_present_label', 'Mark Present (P)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Absent')}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-red-700 flex items-center justify-center text-[10px]">A</span>
                  <span>{t('mark_absent_label', 'Mark Absent (A)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Half Day')}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-amber-700 flex items-center justify-center text-[10px]">H</span>
                  <span>{t('mark_halfday_label', 'Mark Half Day (H)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Paid Leave')}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-purple-700 flex items-center justify-center text-[10px]">L</span>
                  <span>{t('mark_leave_label', 'Mark Paid Leave (L)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Clear')}
                  className="bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span>{t('clear_status_label', 'Clear Status (-)')}</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-between">
            <button
              onClick={() => {
                if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
                else { setSelectedMonth(m => m - 1); }
              }}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <div className="font-semibold text-sm text-slate-800 dark:text-white">
              {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedYear(now.getFullYear()); setSelectedMonth(now.getMonth()); }}
                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 dark:hover:bg-blue-800/60 text-blue-700 dark:text-blue-300 font-semibold text-[10px] px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => {
                  if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
                  else { setSelectedMonth(m => m + 1); }
                }}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center gap-1"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
            <div className="overflow-x-auto relative">
              <table className="datatable w-full text-center border-collapse text-xs staff-management__table">
                <thead className="staff-management__table-header">
                  <tr className="bg-slate-50 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-semibold staff-management__table-header-row">
                    <th className="sticky left-0 bg-slate-50 dark:bg-slate-900 z-20 text-left px-4 py-3 min-w-[150px] border-r border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white staff-management__table-header-cell">
                      Staff Member
                    </th>
                    {monthDays.map((d) => (
                      <th
                        key={`num-${d.dayNum}`}
                        className={`px-2 py-2 min-w-[36px] max-w-[40px] text-[11px] border-r border-slate-200 dark:border-slate-700/60 ${
                          d.isToday ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 font-semibold' : ''
                        }`}
                      >
                        {d.dayNum}
                      </th>
                    ))}
                  </tr>

                  <tr className="bg-slate-50/70 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 font-medium text-[10px]">
                    <th className="sticky left-0 bg-slate-50 dark:bg-slate-900 z-20 border-r border-slate-200 dark:border-slate-700"></th>
                    {monthDays.map((d) => (
                      <th
                        key={`name-${d.dayNum}`}
                        className={`px-2 py-1.5 border-r border-slate-200 dark:border-slate-700/60 ${
                          d.isToday ? 'bg-amber-100/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-semibold' : ''
                        }`}
                      >
                        {d.dayName}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-slate-800 dark:text-slate-200">
                  {staff.map((member) => (
                    <tr key={member.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="staff-management__cell sticky left-0 bg-white dark:bg-slate-800 group-hover:bg-slate-50 dark:group-hover:bg-slate-700/60 z-10 text-left px-4 py-3 font-semibold text-slate-900 dark:text-white border-r border-slate-200 dark:border-slate-700 truncate min-w-[150px]">
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
                            className={`px-1 py-2 border-r border-slate-100 dark:border-slate-700/40 cursor-pointer transition-all select-none ${
                              isSelected
                                ? 'bg-blue-100 dark:bg-blue-900/80 ring-2 ring-blue-500 z-10'
                                : d.isToday
                                ? 'bg-amber-50/40 dark:bg-amber-950/20'
                                : ''
                            }`}
                          >
                            {status === 'Present' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-xs shadow-2xs">
                                P
                              </span>
                            )}

                            {status === 'Absent' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-semibold text-xs shadow-2xs">
                                A
                              </span>
                            )}

                            {status === 'Half Day' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-xs shadow-2xs">
                                H
                              </span>
                            )}

                            {status === 'Paid Leave' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-semibold text-xs shadow-2xs">
                                L
                              </span>
                            )}

                            {!status && (
                              <span className="text-slate-300 dark:text-slate-600 font-semibold text-xs">
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

            {/* ATTENDANCE LEGEND BAR */}
            <div className="bg-slate-50 dark:bg-slate-900/60 p-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Attendance Legend:</span>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold flex items-center justify-center text-xs">P</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Present (Full Day)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-semibold flex items-center justify-center text-xs">A</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Absent (0 Wage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold flex items-center justify-center text-xs">H</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Half Day (0.5 Wage)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-semibold flex items-center justify-center text-xs">L</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">Paid Leave</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-400 px-1.5">-</span>
                  <span className="font-semibold text-slate-500 dark:text-slate-400">Unmarked</span>
                </div>
              </div>
            </div>
          </div>

          {/* MONTHLY PAYOUT CALCULATOR */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-amber-200 dark:border-amber-800/40 shadow-sm overflow-hidden transition-colors">
            <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-950/30 px-4 py-3 border-b border-amber-200 dark:border-amber-800/40">
              <h3 className="staff-management__subtitle font-semibold text-amber-900 dark:text-amber-200 text-xs tracking-wider uppercase flex items-center gap-2">
                <IndianRupee className="w-4 h-4" />
                {t('monthly_payout_calculator_heading', 'Monthly Payout Calculator')}
              </h3>
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2.5 py-1 rounded-full">
                {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>

            <DataTable
              columns={[
                {
                  name: 'Staff Name',
                  selector: (row: any) => row.staff.name,
                  sortable: true,
                  cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white text-sm">{row.staff.name}</span>,
                },
                {
                  name: 'Daily Wage (₹)',
                  selector: (row: any) => row.dailyWage,
                  sortable: true,
                  right: true,
                  width: '120px',
                  cell: (row: any) => <span className="font-mono text-slate-600 dark:text-slate-300">₹{row.dailyWage.toFixed(2)}</span>,
                },
                {
                  name: 'Present Days',
                  selector: (row: any) => row.presentDays,
                  sortable: true,
                  center: true,
                  width: '110px',
                  cell: (row: any) => <><span className="font-semibold text-slate-800 dark:text-slate-200">{row.presentDays}</span><span className="text-slate-400 dark:text-slate-500"> days</span></>,
                },
                {
                  name: 'Total Earned (₹)',
                  selector: (row: any) => row.totalEarned,
                  sortable: true,
                  right: true,
                  width: '130px',
                  cell: (row: any) => <span className="font-semibold text-emerald-700 dark:text-emerald-400">₹{row.totalEarned.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Collected (₹)',
                  selector: (row: any) => row.cashCollected,
                  sortable: true,
                  right: true,
                  width: '110px',
                  cell: (row: any) => <span className="font-semibold text-amber-700 dark:text-amber-400">₹{row.cashCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Out of Pocket (₹)',
                  selector: (row: any) => row.outOfPocket,
                  sortable: true,
                  right: true,
                  width: '120px',
                  cell: (row: any) => <span className="font-semibold text-purple-600 dark:text-purple-400">₹{row.outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Handovers (₹)',
                  selector: (row: any) => row.handovers,
                  sortable: true,
                  right: true,
                  width: '110px',
                  cell: (row: any) => <span className="font-semibold text-indigo-600 dark:text-indigo-400">₹{row.handovers.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
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
                      <span className={`font-semibold ${isCredit ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
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
                  cell: (row: any) => <span className="font-semibold text-blue-700 dark:text-blue-400">₹{row.pendingPayout.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>,
                },
                {
                  name: 'Actions',
                  center: true,
                  width: '240px',
                  cell: (row: any) => {
                    const isPaid = paidStaff.has(row.staff.id);
                    const isPaying = payingStaff === row.staff.id;
                    return (
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => { setAdvanceStaff(row.staff); setAdvanceAmount(0); setAdvanceReason(''); setIsAdvanceModalOpen(true); }}
                          leftIcon={<Plus className="w-3 h-3 text-emerald-600" />}
                        >
                          Advance
                        </Button>
                        {isPaid ? (
                          <span className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[10px] px-2 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Paid
                          </span>
                        ) : (
                          <Button
                            variant="primary"
                            size="xs"
                            disabled={isPaying || row.pendingPayout <= 0}
                            leftIcon={<IndianRupee className="w-3 h-3" />}
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
                          >
                            {isPaying ? 'Paying...' : 'Pay Now'}
                          </Button>
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
                  <Input type="text" value={searchPayout} onChange={e => setSearchPayout(e.target.value)} placeholder="Search by staff name..." className="w-full max-w-xs" />
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
                <div className="p-8 text-center text-slate-400 font-semibold text-xs">No active staff members found</div>
              }
            />

            {/* Advances History for this month */}
            {monthAdvances.length > 0 && (
              <div className="border-t border-amber-200 dark:border-amber-800/40 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-2">{t('advances_this_month_label', 'Advances This Month')}</p>
                <div className="space-y-1">
                  {monthAdvances.map((adv) => (
                    <div key={adv.id} className="flex items-center justify-between text-[11px] bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-1.5 border border-red-100 dark:border-red-900/30">
                      <span className="font-semibold text-red-800 dark:text-red-300">{adv.staffName}</span>
                      <span className="text-red-600 dark:text-red-400">- ₹{adv.amount.toLocaleString('en-IN')}</span>
                      <span className="text-slate-400 dark:text-slate-500">{adv.reason}</span>
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 transition-colors space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h3 className="staff-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">
              {t('staff_directory_payroll_heading', 'Staff Member Directory & Payroll Breakdown')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
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
                cell: (row: any) => <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">{row.id}</span>,
              },
              {
                name: 'Full Name',
                selector: (row: any) => row.name,
                sortable: true,
                cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white text-sm">{row.name}</span>,
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
                  <span className="font-medium text-slate-600 dark:text-slate-300">{row.role}</span>
                ),
              },
              {
                name: 'Phone',
                selector: (row: any) => row.phone,
                sortable: true,
                width: '140px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <Input
                    type="tel"
                    value={editStaffPhone}
                    onChange={e => setEditStaffPhone(e.target.value)}
                    className="font-mono text-xs border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700"
                    fullWidth={false}
                  />
                ) : (
                  <span className="font-mono text-slate-600 dark:text-slate-300">{row.phone}</span>
                ),
              },
              {
                name: 'Monthly Base',
                selector: (row: any) => row.monthlySalary,
                sortable: true,
                right: true,
                width: '130px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <Input
                    type="number"
                    value={editStaffSalary}
                    onChange={e => setEditStaffSalary(Number(e.target.value))}
                    className="font-semibold text-xs border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700"
                    fullWidth={false}
                  />
                ) : (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{row.monthlySalary.toLocaleString('en-IN')}</span>
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
                  <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 text-[10px] font-semibold px-2.5 py-0.5 rounded-full">{row.status}</span>
                ),
              },
              ...(updateStaff ? [{
                name: 'Actions',
                right: true,
                width: '130px',
                cell: (row: any) => editingStaffId === row.id ? (
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { updateStaff!(row.id, { role: editStaffRole, phone: editStaffPhone, monthlySalary: editStaffSalary, status: editStaffStatus }); setEditingStaffId(null); if (onLogAudit) onLogAudit(`Updated staff ${row.name}: role=${editStaffRole}, phone=${editStaffPhone}, salary=₹${editStaffSalary}, status=${editStaffStatus}`); }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer">{t('save_button', 'Save')}</button>
                    <button onClick={() => setEditingStaffId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer">{t('cancel_button', 'Cancel')}</button>
                  </div>
                ) : (
                  <button onClick={() => { setEditingStaffId(row.id); setEditStaffRole(row.role); setEditStaffPhone(row.phone); setEditStaffSalary(row.monthlySalary); setEditStaffStatus(row.status); }} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer">{t('edit_button', 'Edit')}</button>
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
                <Input type="text" value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder="Search by name or role..." className="w-full max-w-xs" />
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
              <div className="p-8 text-center text-slate-400 font-semibold text-xs">No staff members found.</div>
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
            <h4 className="staff-management__caption font-semibold text-slate-900 text-sm">{t('registered_qr_code_heading', 'Registered QR Code')}</h4>
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
            <h3 className="staff-management__subtitle font-extrabold text-slate-900 text-sm">
              {t('edit_payee_settings_heading', 'Edit Payee Account Settings')}
            </h3>

            <form onSubmit={handleUpdatePayeeSave} className="app-form app-form--update-payee space-y-3">
              <div>
                <Input
                  label={t('payee_account_name_label', 'Payee Account Name')}
                  type="text"
                  required
                  value={editingPayee.name}
                  onChange={(e) => setEditingPayee({ ...editingPayee, name: e.target.value })}
                  className="font-medium"
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('classification_type_label', 'Classification Type')}</label>
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
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Replace QR Code Graphic Blueprint (Optional)</label>
                <Input
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
                  className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold rounded-xl shadow-xs"
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-3">
              <h3 className="staff-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">{t('add_new_staff_member_heading', 'Add New Staff Member')}</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="app-form app-form--add-staff space-y-3">
              <div>
                <Input
                  label={t('staff_name_required_label', 'Staff Name *')}
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ratan Singh"
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('team_role', 'Team Role')}</label>
                <StyledSelect
                  value={role}
                  onChange={(val) => setRole(val as any)}
                  options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                />
              </div>

              <div>
                <Input
                  label={t('phone_login_username_required_label', 'Phone Number (Login Username) *')}
                  type="tel"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                />
              </div>

              <div>
                  <Input
                    label={t('six_digit_passcode_required_label', '6-Digit Passcode PIN *')}
                    type="password"
                    required
                    maxLength={6}
                    value={rosterPasscode}
                    onChange={(e) => setRosterPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    className="text-center font-mono font-semibold tracking-widest"
                  />
              </div>

              <div>
                <Input
                  label="Monthly Salary (₹)"
                  type="number"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(Number(e.target.value))}
                  className="font-semibold"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700"
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
              <h3 className="staff-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">{t('give_advance_heading', 'Give Advance —')} {advanceStaff.name}</h3>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <Input
                label="Amount (₹) *"
                type="number"
                min={0}
                value={advanceAmount || ''}
                onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                placeholder="e.g. 2000"
                className="text-sm font-semibold"
              />
            </div>

            <div>
              <Input
                label={t('reason_label', 'Reason')}
                type="text"
                value={advanceReason}
                onChange={(e) => setAdvanceReason(e.target.value)}
                placeholder="e.g. Personal emergency"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAdvanceModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGiveAdvance}
                disabled={advanceAmount <= 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:opacity-50 text-white font-semibold text-xs shadow-sm cursor-pointer"
              >
                Confirm Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEAM MEMBER MODAL (CREATE / UPDATE) */}
      {isTeamMemberModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl ${userFormTab === 'create' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'}`}>
                  {userFormTab === 'create' ? <Plus className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="staff-management__subtitle font-extrabold text-slate-900 dark:text-white text-base">
                    {userFormTab === 'create' ? 'Create Team Member' : 'Modify Team Member'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {userFormTab === 'create' ? 'Add a new staff login account & system role' : 'Update login credentials, roles, and financial privileges'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsTeamMemberModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Content */}
            <div className="p-6">
              {userFormTab === 'create' ? (
                <form onSubmit={handleCreateUser} className="app-form app-form--create-user space-y-4 text-xs">
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('staff_name_label', 'Staff Name')} *</label>
                    <Input
                      type="text"
                      required
                      value={newFullName}
                      onChange={(e) => setNewFullName(e.target.value)}
                      placeholder="e.g. Ratan Singh"
                      className="text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('phone_login_username_label', 'Phone (Username)')} *</label>
                      <Input
                        type="tel"
                        required
                        maxLength={10}
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number"
                        className="text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('six_digit_passcode_label', '6-Digit Passcode PIN')} *</label>
                      <Input
                        type="password"
                        required
                        maxLength={6}
                        value={newPasscode}
                        onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        inputMode="numeric"
                        className="text-slate-900 dark:text-white text-center font-mono font-semibold tracking-widest"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('team_role', 'Team Role')}</label>
                      <StyledSelect
                        value={newRole}
                        onChange={(val) => setNewRole(val as any)}
                        options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 h-[38px] mb-0.5">
                      <input
                        type="checkbox"
                        id="isFinancialHandlerCheck"
                        checked={newIsFinancialHandler}
                        onChange={(e) => setNewIsFinancialHandler(e.target.checked)}
                        className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                      />
                      <label htmlFor="isFinancialHandlerCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs">
                        {t('cash_handling_user_label', 'Cash Handling User')}
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('daily_wage_label', 'Daily Wage (₹)')}</label>
                    <Input
                      type="number"
                      min="0"
                      value={newDailyWage}
                      onChange={(e) => setNewDailyWage(e.target.value)}
                      placeholder="e.g. 800"
                      className="text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="checkbox"
                      id="newAccessAllPropertiesCheck"
                      checked={newAccessAllProperties}
                      onChange={(e) => setNewAccessAllProperties(e.target.checked)}
                      className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                    />
                    <label htmlFor="newAccessAllPropertiesCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs">
                      {t('access_all_properties_label', 'Access All Properties')}
                    </label>
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('staff_qr_upload_label', 'Staff Payment QR Code Image (Optional)')}</label>
                    <Input
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
                      className="w-full text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => setIsTeamMemberModalOpen(false)}
                      className="font-semibold cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      className="font-semibold cursor-pointer"
                    >
                      Register Team Member
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleUpdateUserSubmit} className="app-form app-form--update-user space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('staff_name_label', 'Staff Name')} *</label>
                      <Input
                        type="text"
                        required
                        value={updateFullName}
                        onChange={(e) => setUpdateFullName(e.target.value)}
                        placeholder="e.g. Ratan Singh"
                        className="text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('phone_login_username_label', 'Phone (Username)')}</label>
                      <Input
                        type="tel"
                        maxLength={10}
                        value={updateUsername}
                        onChange={(e) => setUpdateUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number"
                        className="text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('new_passcode_optional_label', 'New 6-Digit Passcode PIN (Leave blank to keep current)')}</label>
                    <Input
                      type="password"
                      maxLength={6}
                      value={updatePasscode}
                      onChange={(e) => setUpdatePasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      inputMode="numeric"
                      className="text-center font-mono font-semibold tracking-widest text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                    <div>
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('new_system_role_label', 'System Role')}</label>
                      <StyledSelect
                        value={updateRole}
                        onChange={(val) => setUpdateRole(val as any)}
                        placeholder="-- Keep Current Role --"
                        options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 h-[38px] mb-0.5">
                      <input
                        type="checkbox"
                        id="updateIsFinancialHandlerCheck"
                        checked={updateIsFinancialHandler}
                        onChange={(e) => setUpdateIsFinancialHandler(e.target.checked)}
                        className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                      />
                      <label htmlFor="updateIsFinancialHandlerCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs">
                        {t('cash_handling_user_label', 'Cash Handling User')}
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                    <input
                      type="checkbox"
                      id="updateAccessAllPropertiesCheck"
                      checked={updateAccessAllProperties}
                      onChange={(e) => setUpdateAccessAllProperties(e.target.checked)}
                      className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                    />
                    <label htmlFor="updateAccessAllPropertiesCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs">
                      {t('access_all_properties_label', 'Access All Properties')}
                    </label>
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('daily_wage_label', 'Daily Wage (₹)')}</label>
                    <Input
                      type="number"
                      min="0"
                      value={updateDailyWage}
                      onChange={(e) => setUpdateDailyWage(e.target.value)}
                      placeholder="e.g. 800"
                      className="text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('replace_qr_label', 'Replace Payment QR Code Image')}</label>
                    <Input
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
                      className="w-full text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      onClick={() => setIsTeamMemberModalOpen(false)}
                      className="font-semibold cursor-pointer"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      size="md"
                      className="font-semibold cursor-pointer"
                    >
                      Save Team Member
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* REGISTER ACCOUNT PAYEE MODAL */}
      {isPayeeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="staff-management__subtitle font-extrabold text-slate-900 dark:text-white text-base">Register Account Payee</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add operational suppliers, vendors, or third parties</p>
                </div>
              </div>
              <button
                onClick={() => setIsPayeeModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <form onSubmit={handleCreatePayee} className="app-form app-form--create-payee space-y-4 text-xs">
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('payee_account_name_label', 'Payee Account Name')} *</label>
                  <Input
                    type="text"
                    required
                    value={newPayeeName}
                    onChange={(e) => setNewPayeeName(e.target.value)}
                    placeholder="e.g. Raju Grocery / Pool Supplier"
                    className="text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('classification_group_label', 'Classification Group')}</label>
                  <StyledSelect
                    value={newPayeeType}
                    onChange={(val) => setNewPayeeType(val as any)}
                    options={[
                      { value: 'Vendor', label: 'Business Vendor (Daily/Project Supplies)' },
                      { value: 'Third Party', label: 'Third Party Account (Pass-Through Routing)' },
                    ]}
                  />
                </div>

                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('upload_upi_qr_label', 'Upload UPI QR Image Screenshot (Optional)')}</label>
                  <Input
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
                    className="w-full text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 p-2 rounded-xl border border-slate-300 dark:border-slate-700"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-700">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => setIsPayeeModalOpen(false)}
                    className="font-semibold cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="font-semibold cursor-pointer"
                  >
                    Save Payee
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

