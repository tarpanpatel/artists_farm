import React, { useState, useEffect } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems, TextInput as FlowbiteTextInput, Checkbox, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell } from 'flowbite-react';
import { Button } from './Button';
import { Input } from './Input';
import { ToggleSwitch } from './ToggleSwitch';
import { Popover } from './Popover';
import { TablePagination } from './TablePagination';
import {
  Plus,
  X,
  Zap,
  Calendar,
  CalendarDays,
  Settings,
  Target,
  ChevronLeft,
  ChevronRight,
  Loader2,
  HelpCircle,
  Pencil,
  Share2,
  TrendingUp,
  QrCode,
  CreditCard,
  Phone,
  Trash2,
  Search,
  Building2
} from './icons/FlowbiteIcons';
import { StaffMember, AttendanceRecord, UserAccount } from '../types';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { StyledSelect } from './StyledSelect';
import { addStaffUserDB, deleteStaffUserDB, updateStaffUserDB, updateTenantSuperAdminDB } from '../services/api';
import { PageHeader } from './PageHeader';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';
import { shareTextContent } from '../utils/shareText';
import { UpiPaymentBlock, isValidUpiIdSyntax } from '../utils/upiQrCode';

interface StaffManagementProps {
  activeMenuItemKey?: string;
  auditLogs?: any[];
  onLogAudit?: (actionText: string) => void;
  tenantId?: number;
  propertyId?: number | string;
  autoOpenAddModal?: boolean;
  onClearAutoOpenAddModal?: () => void;
  // AI Assistant deep-link (restored 27 Aug 2026, mirrors KitchenManagement.tsx's
  // initialStaffName for staff meals) - lets "change phone number for staff Kamlesh" land
  // straight on that person's roster row already in edit mode, instead of just the Team page.
  initialEditStaffName?: string;
  // AI Assistant deep-link (restored 27 Aug 2026) - pre-fills the blank "Add New Staff Member"
  // roster drawer (isModalOpen, name/role/phone/monthlySalary) for onboarding someone new.
  // Deliberately NOT the same drawer as autoOpenAddModal above (isTeamMemberModalOpen) - that
  // one creates a system LOGIN account (username/passcode/permissions), a more sensitive action
  // this intentionally leaves untouched; this one is the roster/attendance/payroll record.
  initialAddStaffName?: string;
  initialAddStaffPhone?: string;
  initialAddStaffRole?: string;
  initialAddStaffSalary?: number;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  activeMenuItemKey,
  auditLogs: _auditLogs,
  onLogAudit,
  tenantId,
  propertyId,
  autoOpenAddModal,
  onClearAutoOpenAddModal,
  initialEditStaffName,
  initialAddStaffName,
  initialAddStaffPhone,
  initialAddStaffRole,
  initialAddStaffSalary,
}) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentUser, isAuthenticated } = useAuth();
  const getInitialStaffSubTab = (): 'control_center' | 'calendar' | 'roster' => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim().toLowerCase();
      if (hash === 'attendance_calendar' || hash === 'attendance_salaries' || hash.includes('calendar')) return 'calendar';
      if (hash === 'staff_directory_salaries' || hash.includes('roster')) return 'roster';
      if (hash === 'staff_permissions' || hash === 'staff_payees_control' || hash.includes('control_center') || hash.includes('permissions')) return 'control_center';
      const stored = sessionStorage.getItem('artists_farm_staff_tab');
      if (stored === 'control_center' || stored === 'calendar' || stored === 'roster') return stored;
    }
    if (activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries') return 'calendar';
    if (activeMenuItemKey === 'staff_directory_salaries') return 'roster';
    if (activeMenuItemKey === 'staff_permissions' || activeMenuItemKey === 'staff_payees_control') return 'control_center';
    return 'control_center';
  };

  const { staff, staffLoading, attendance, addStaff, updateStaff, recordAttendance, refreshStaff } = useStaff();
  const [activeSubTab, setActiveSubTab] = useState<'control_center' | 'calendar' | 'roster'>(getInitialStaffSubTab);
  const isAttendancePage = activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries';

  useEffect(() => {
    if (activeMenuItemKey === 'attendance_calendar' || activeMenuItemKey === 'attendance_salaries') {
      setActiveSubTab('calendar');
      if (typeof window !== 'undefined') sessionStorage.setItem('artists_farm_staff_tab', 'calendar');
    } else if (activeMenuItemKey === 'staff_directory_salaries') {
      setActiveSubTab('roster');
      if (typeof window !== 'undefined') sessionStorage.setItem('artists_farm_staff_tab', 'roster');
    } else if (activeMenuItemKey === 'staff_permissions' || activeMenuItemKey === 'staff_payees_control') {
      setActiveSubTab('control_center');
      if (typeof window !== 'undefined') sessionStorage.setItem('artists_farm_staff_tab', 'control_center');
    }
  }, [activeMenuItemKey]);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '').trim().toLowerCase();
      if (hash === 'attendance_calendar' || hash === 'attendance_salaries' || hash.includes('calendar')) setActiveSubTab('calendar');
      else if (hash === 'staff_directory_salaries' || hash.includes('roster')) setActiveSubTab('roster');
      else if (hash === 'staff_permissions' || hash === 'staff_payees_control' || hash.includes('control_center')) setActiveSubTab('control_center');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  // Property Payroll & Payee State
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [tenantPropertyCount, setTenantPropertyCount] = useState<number>(1);

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return;
    fetch(`/php/api/router.php?action=get_tenant_properties&tenant_id=${tenantId}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setTenantPropertyCount(data.data.length);
        }
      })
      .catch(() => {});
  }, [isAuthenticated, tenantId]);

  const hasMultipleProperties = tenantPropertyCount > 1 || users.some((u) => u.accessAllProperties);

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
  const [newConfirmPasscode, setNewConfirmPasscode] = useState('');
  const [newRole, setNewRole] = useState<UserAccount['role']>('');
  const [newIsFinancialHandler, setNewIsFinancialHandler] = useState(false);
  const [newAccessAllProperties, setNewAccessAllProperties] = useState(false);
  const [newUpiId, setNewUpiId] = useState('');
  const [newDailyWage, setNewDailyWage] = useState('');

  // Real-time validation feedback (Flowbite forms.md validation states, 26 Aug 2026 -
  // explicit request: "it should show in real time if passcodes dont match, or any
  // validation or logical error in any of the fields") - same pattern already proven in
  // AccountSettings.tsx's passcode section: only flags a rule once there's something
  // typed to judge (`.length > 0`), so an untouched/empty field never shows red before
  // the user has done anything.
  const newUsernameInvalid = newUsername.length > 0 && !/^\d{10}$/.test(newUsername);
  const newPasscodeInvalid = newPasscode.length > 0 && !/^\d{6}$/.test(newPasscode);
  const newPasscodeMismatch = newPasscode.length > 0 && newConfirmPasscode.length > 0 && newPasscode !== newConfirmPasscode;
  const newPasscodeMatch = newPasscode.length > 0 && newConfirmPasscode.length > 0 && newPasscode === newConfirmPasscode;

  // 3. Update User
  const [selectedUpdateUserId, setSelectedUpdateUserId] = useState('');
  const [updateFullName, setUpdateFullName] = useState('');
  const [updateUsername, setUpdateUsername] = useState('');
  const [updateRole, setUpdateRole] = useState<UserAccount['role'] | ''>('');
  const [updateStatus, setUpdateStatus] = useState<'Active' | 'Disabled'>('Active');
  const [updatePasscode, setUpdatePasscode] = useState('');
  const [updateConfirmPasscode, setUpdateConfirmPasscode] = useState('');
  const [updateIsFinancialHandler, setUpdateIsFinancialHandler] = useState(false);
  const [updateAccessAllProperties, setUpdateAccessAllProperties] = useState(false);
  const [updateQrCodeUrl, setUpdateQrCodeUrl] = useState('');
  const [updateUpiId, setUpdateUpiId] = useState('');
  const [updateDailyWage, setUpdateDailyWage] = useState('');
  // Super Admin's role/username/cash-handling/access-all-properties are
  // permanently fixed (14 Aug 2026 - "no one can change Super Admin's role,
  // it's always Cash Handler + Access All Properties by definition") - the
  // update modal locks those fields out entirely whenever the row being
  // edited is Super Admin, and routes the save through updateTenantSuperAdminDB
  // instead of the normal per-property updateStaffUserDB (see
  // handleUpdateUserSubmit below).
  const isEditingSuperAdmin = updateRole === 'Super Admin';
  const updateTargetUser = users.find((u) => u.id === selectedUpdateUserId);

  // Same live-validation treatment as the Create form's state above, for the Edit form.
  const updateUsernameInvalid = updateUsername.length > 0 && !/^\d{10}$/.test(updateUsername);
  const updatePasscodeInvalid = updatePasscode.length > 0 && !/^\d{6}$/.test(updatePasscode);
  const updatePasscodeMismatch = updatePasscode.length > 0 && updateConfirmPasscode.length > 0 && updatePasscode !== updateConfirmPasscode;
  const updatePasscodeMatch = updatePasscode.length > 0 && updateConfirmPasscode.length > 0 && updatePasscode === updateConfirmPasscode;

  // Modals / Lightboxes
  // qrCodeUrl: legacy uploaded image (still shown as-is if that's all a staff
  // member has). upiId present: render the generated UpiPaymentBlock instead
  // (preferring qrCodeUrl as its background if both exist - same precedence
  // as everywhere else this pattern is used).
  const [lightboxTarget, setLightboxTarget] = useState<{ qrCodeUrl?: string; upiId?: string; payeeName?: string } | null>(null);

  const roleHelpPopoverContent = (
    <div className="w-80 sm:w-96 p-3.5 text-xs space-y-3.5 max-h-[460px] overflow-y-auto">
      <div className="border-b border-slate-200 dark:border-slate-700 pb-2">
        <h4 className="font-bold text-slate-900 dark:text-white text-xs">
          System Role Access Matrix
        </h4>
        <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">Summary of capabilities per assignable role level</p>
      </div>

      <div className="space-y-3 text-2xs leading-relaxed">
        <div>
          <span className="font-bold text-slate-900 dark:text-white text-xs block mb-1">Admin</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>Dashboard & Property Settings</li>
            <li>Bookings: View, Add, Edit, Guest ID Uploads, C-Form, Check-in, Checkout & Settle Bills</li>
            <li>Service Requests: Full management & assignment</li>
            <li>Kitchen: Food Orders POS, Staff Meals, Stock Requests, Wastage Log, Edit Kitchen Stock, Edit Food Menu & Served Dish Tracking</li>
            <li>Dish Recipes / Auto-Stock Builder</li>
            <li>Finances & Expenses: Cash Drawers, Petty Cash Logs, Settlements & Expenses</li>
            <li>Team & Access: Create & edit Staff, Staff Supervisor & Staff Kitchen accounts</li>
            <li>Attendance Calendar & Telegram Alerts</li>
          </ul>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5">
          <span className="font-bold text-slate-900 dark:text-white text-xs block mb-1">Staff Supervisor</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>Dashboard & Attendance Calendar</li>
            <li>Service Requests: Full management, assignment & fulfillment</li>
            <li>Kitchen: Kitchen Overview & Staff Meals</li>
            <li>Expenses & Finances: Cash Drawers, Petty Cash & Settlements</li>
            <li>Cash Handling: Collect payments & reconcile cash drawers *(if enabled)*</li>
          </ul>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5">
          <span className="font-bold text-slate-900 dark:text-white text-xs block mb-1">Staff Kitchen</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>Dashboard</li>
            <li>Bookings: Read-only booking & room status view</li>
            <li>Kitchen: Full Kitchen module — Food Orders POS, Staff Meals, Stock Requests, Kitchen Wastage, Edit Kitchen Stock, Edit Food Menu & Mark Dishes Served</li>
            <li>Cash Handling: Collect cash payments for food orders *(if enabled)*</li>
          </ul>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-2.5">
          <span className="font-bold text-slate-900 dark:text-white text-xs block mb-1">Staff</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>Dashboard</li>
            <li>Bookings: View bookings, Upload Guest ID docs, File/Manage C-Form, Check-in guests</li>
            <li>Service Requests: Create, manage & fulfill guest service requests</li>
            <li>Kitchen: Live KOT order status view, view served dishes & mark dishes served</li>
            <li>Cash Handling: Collect guest payments & record settlements *(if enabled)*</li>
          </ul>
        </div>
      </div>
    </div>
  );

  const [userFormTab, setUserFormTab] = useState<'create' | 'update'>('create');
  const [isTeamMemberModalOpen, setIsTeamMemberModalOpen] = useState(false);


  useEffect(() => {
    if (autoOpenAddModal) {
      setUserFormTab('create');
      setNewFullName('');
      setNewUsername('');
      setNewPasscode('');
      setNewUpiId('');
      setNewIsFinancialHandler(false);
      setNewAccessAllProperties(false);
      setNewDailyWage('');
      setIsTeamMemberModalOpen(true);
      onClearAutoOpenAddModal?.();
    }
  }, [autoOpenAddModal, onClearAutoOpenAddModal]);

  // Attendance Calendar State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isBulkSelectEnabled, setIsBulkSelectEnabled] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);


  const [searchUsers, setSearchUsers] = useState('');
  const [usersDesktopPage, setUsersDesktopPage] = useState(1);
  const USERS_DESKTOP_PAGE_SIZE = 10;

  const [searchStaff, setSearchStaff] = useState('');

  // Form State for Add Staff Roster
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffMember['role']>('');
  const [phone, setPhone] = useState('');
  const [monthlySalary, setMonthlySalary] = useState(25000);
  const [rosterPasscode, setRosterPasscode] = useState('');

  // Edit Staff Roster State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffDesktopPage, setStaffDesktopPage] = useState(1);
  const STAFF_DESKTOP_PAGE_SIZE = 15;
  const [editStaffRole, setEditStaffRole] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffSalary, setEditStaffSalary] = useState(0);
  const [editStaffStatus, setEditStaffStatus] = useState('Active');

  // AI Assistant deep-link (restored 27 Aug 2026): once the roster sub-tab is active and staff
  // have loaded, find the named person and open their row in edit mode the same way the "Edit
  // Details" button does. Case-insensitive partial match (same rule as KitchenManagement's
  // staff-meal auto-select) - "Kamlesh" matches "Kamlesh Verma". Only runs once per name
  // (guarded below) so it doesn't keep re-opening the row if the admin closes it again after editing.
  const [appliedEditStaffName, setAppliedEditStaffName] = useState<string | null>(null);
  useEffect(() => {
    if (!initialEditStaffName || activeSubTab !== 'roster' || staff.length === 0) return;
    if (appliedEditStaffName === initialEditStaffName) return;
    const target = initialEditStaffName.toLowerCase().trim();
    const matched = staff.find((s) => s.name.toLowerCase().trim() === target || s.name.toLowerCase().trim().includes(target));
    if (matched) {
      setEditingStaffId(matched.id);
      setEditStaffRole(matched.role);
      setEditStaffPhone(matched.phone);
      setEditStaffSalary(matched.monthlySalary);
      setEditStaffStatus(matched.status);
    }
    setAppliedEditStaffName(initialEditStaffName);
  }, [initialEditStaffName, activeSubTab, staff, appliedEditStaffName]);

  // AI Assistant deep-link (restored 27 Aug 2026): opens the blank "Add New Staff Member"
  // roster drawer pre-filled with whatever the chat message extracted. Guarded to run once per
  // distinct value, same pattern as the edit-staff effect above and KitchenManagement.tsx's
  // requisition prefill.
  const [appliedAddStaffPrefill, setAppliedAddStaffPrefill] = useState<string | null>(null);
  useEffect(() => {
    if (activeSubTab !== 'roster') return;
    if (!initialAddStaffName && !initialAddStaffPhone && !initialAddStaffRole && !initialAddStaffSalary) return;
    const prefillKey = `${initialAddStaffName || ''}|${initialAddStaffPhone || ''}|${initialAddStaffRole || ''}|${initialAddStaffSalary || ''}`;
    if (appliedAddStaffPrefill === prefillKey) return;

    if (initialAddStaffName) setName(initialAddStaffName);
    if (initialAddStaffPhone) setPhone(initialAddStaffPhone);
    if (initialAddStaffRole) setRole(initialAddStaffRole as StaffMember['role']);
    if (initialAddStaffSalary) setMonthlySalary(initialAddStaffSalary);
    setIsModalOpen(true);
    setAppliedAddStaffPrefill(prefillKey);
  }, [activeSubTab, initialAddStaffName, initialAddStaffPhone, initialAddStaffRole, initialAddStaffSalary, appliedAddStaffPrefill]);

  // Mobile UI State
  const [mobileAttMode, setMobileAttMode] = useState<'daily' | 'summary'>('daily');
  const [mobileDayNum, setMobileDayNum] = useState<number>(new Date().getDate());
  const [staffPermissionsPage, setStaffPermissionsPage] = useState(1);

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
      // dailyWage (24 Aug 2026, found live: "updated details but it didn't
      // save" - was missing from this object literal entirely, so even
      // after StaffMember itself started carrying it (StaffContext.tsx's
      // mapStaffRow fix, same date) it still never reached the UserAccount
      // shape the Edit form's pre-fill (handleEditUser) actually reads from.
      dailyWage: member.dailyWage,
    })));
  }, [staff]);



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
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayName = dayNames[dateObj.getDay()];
    const formatted = formatDateDDMMYYYY(`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`);
    const isToday = selectedYear === now.getFullYear() && selectedMonth === now.getMonth() && dayNum === now.getDate();
    return { dayNum, dayName, dateStr: formatted, isToday };
  });

  // Map attendance records
  const attendanceMap = new Map<string, AttendanceRecord['status']>();
  attendance.forEach((rec) => {
    attendanceMap.set(`${rec.staffId}_${rec.date}`, rec.status);
  });


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

  // Sharing a passcode over WhatsApp is a step above ordinary "edit" rights
  // (canEditUser already lets peers at the same hierarchy level edit each
  // other, e.g. one Staff Supervisor editing another) - restricted to actual
  // admin roles only, regardless of what canEditUser would otherwise permit.
  const normalizedCurrentRole = (currentUser?.role || '') === 'root_admin' ? 'Root Admin' : (currentUser?.role || '');
  const canShareLogins = ['Root Admin', 'Super Admin', 'Admin'].includes(normalizedCurrentRole);

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
    if (newPasscode !== newConfirmPasscode) {
      showToast('Passcodes do not match! Please verify both passcode fields.', { type: 'error' });
      return;
    }
    if (newUpiId.trim() && !isValidUpiIdSyntax(newUpiId)) {
      showToast('Enter a valid UPI ID, e.g. name@bank', { type: 'error' });
      return;
    }
    const newUser: UserAccount = {
      id: `usr-${Date.now().toString().slice(-4)}`,
      fullName: newFullName.trim(),
      username: newUsername,
      role: newRole,
      passcodePin: newPasscode,
      isFinancialHandler: newIsFinancialHandler,
      upiId: newUpiId.trim() || undefined,
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
      upiId: newUser.upiId,
      status: newUser.status,
      dailyWage: newUser.dailyWage,
    });
    if (!saved) {
      showToast('Unable to save the staff member to the database.', { type: 'error' });
      return;
    }
    // Awaited (24 Aug 2026, see refreshStaff's own comment in StaffContext.tsx)
    // so the local `users` list is guaranteed fresh before the modal closes -
    // reopening Edit on this same person right after creating them should
    // never show stale/blank data.
    await refreshStaff?.();
    showToast('Staff login account created successfully!', { type: 'success' });
    setNewFullName('');
    setNewUsername('');
    setNewPasscode('');
    setNewConfirmPasscode('');
    setNewUpiId('');
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
       if (await deleteStaffUserDB(id)) await refreshStaff?.();
       else showToast('Unable to delete the staff member from the database.', { type: 'error' });
     }
   };

   const handleEditUser = (user: any) => {
     setSelectedUpdateUserId(user.id);
     setUpdateFullName(user.fullName || user.name || '');
     setUpdateUsername(user.username || user.phone || '');
     setUpdateRole(user.role);
     setUpdateStatus(user.status === 'Disabled' || user.status === 'Inactive' ? 'Disabled' : 'Active');
     setUpdatePasscode('');
     setUpdateConfirmPasscode('');
     setUpdateIsFinancialHandler(Boolean(user.isFinancialHandler));
     setUpdateAccessAllProperties(Boolean(user.accessAllProperties));
     setUpdateQrCodeUrl(user.qrCodeUrl || '');
     setUpdateUpiId(user.upiId || '');
     setUpdateDailyWage(user.dailyWage ? String(user.dailyWage) : '');
     setUserFormTab('update');
     setIsTeamMemberModalOpen(true);
   };

  // Builds this staff member's CURRENT login (username + their existing
  // passcode, already loaded client-side as passcodePin - not a reveal
  // endpoint) as plain text. The login URL is this property's own
  // origin+pathname (not the bare platform root) so the staff member lands
  // directly on the right property's login screen.
  const buildStaffLoginShareMessage = (user: { fullName: string; username: string; passcodePin?: string }) => {
    const loginUrl = window.location.origin + window.location.pathname;
    return `Hi ${user.fullName},\n\nHere are your Ground Code login details:\n\nLogin URL: ${loginUrl}\nUsername: ${user.username}\nPasscode: ${user.passcodePin || '(ask your admin to set one)'}\n\nPlease keep this passcode private. Didn't request this? You can ignore this message.`;
  };

  // Prefers the OS-level share sheet (navigator.share) so the admin picks
  // WhatsApp/SMS/Telegram/Email/whatever's actually installed, rather than
  // this app guessing a single channel (WhatsApp specifically assumes both a
  // phone-number username AND that the recipient has WhatsApp - neither is
  // guaranteed). Falls back to copying the message to the clipboard on
  // browsers without Web Share support (notably desktop Firefox) - that
  // still works for every staff member regardless of username format.
  const handleShareLogin = async (user: { fullName: string; username: string; passcodePin?: string }) => {
    const message = buildStaffLoginShareMessage(user);
    await shareTextContent(
      'Ground Code Login Details',
      message,
      showToast,
      "Login details copied - paste them wherever you'd like to send them.",
      'Could not share or copy login details.',
    );
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
    if (updatePasscode && updatePasscode !== updateConfirmPasscode) {
      showToast('Passcodes do not match! Please verify both passcode fields.', { type: 'error' });
      return;
    }
    if (updateUpiId.trim() && !isValidUpiIdSyntax(updateUpiId)) {
      showToast('Enter a valid UPI ID, e.g. name@bank', { type: 'error' });
      return;
    }
    // Super Admin IS the tenant's own login - route through the tenant-login
    // sync path (Name/Passcode/QR only) instead of the normal per-property
    // write, which would otherwise desync this property's copy from every
    // other property's and from the tenant's real login (see
    // updateTenantSuperAdminDB / update_tenant_super_admin).
    const saved = isEditingSuperAdmin
      ? await updateTenantSuperAdminDB({
          tenantId: tenantId as number,
          propertyId,
          fullName: updateFullName.trim(),
          passcode: updatePasscode,
          qrCodeUrl: updateQrCodeUrl || targetUser.qrCodeUrl,
          upiId: updateUpiId.trim(),
        })
      : await updateStaffUserDB(selectedUpdateUserId, {
          fullName: updateFullName.trim(),
          username: updateUsername || targetUser.username,
          role: updateRole || targetUser.role,
          status: updateStatus,
          passcode: updatePasscode || targetUser.passcodePin,
          isFinancialHandler: updateIsFinancialHandler,
          accessAllProperties: updateAccessAllProperties,
          qrCodeUrl: updateQrCodeUrl || targetUser.qrCodeUrl,
          upiId: updateUpiId.trim(),
          dailyWage: updateDailyWage ? Number(updateDailyWage) : (targetUser.dailyWage ?? 0),
        });
    if (!saved) {
      showToast('Unable to update the user in the database.', { type: 'error' });
      return;
    }
    // Awaited (24 Aug 2026, found live: "updated Abhijeet's details but it
    // didn't save" - the DB write and its audit_logs entry both confirmed
    // correct, but reopening Edit right after saving showed stale
    // pre-fill values - Daily Wage blank, Access All Properties unchecked -
    // because the local `users` list (derived from StaffContext's `staff`
    // array) hadn't actually finished refetching yet when the drawer closed
    // and the user was free to reopen it. refreshStaff() kicks off a
    // fetch-with-retry chain that can legitimately take a couple seconds;
    // without awaiting it there was no guarantee the fresh data had landed
    // before the next interaction. See refreshStaff's own comment in
    // StaffContext.tsx for the Promise plumbing this relies on.
    await refreshStaff?.();
    setSelectedUpdateUserId('');
    setUpdateFullName('');
    setUpdateUsername('');
    setUpdateStatus('Active');
    setUpdatePasscode('');
    setUpdateConfirmPasscode('');
    setUpdateRole('');
    setUpdateQrCodeUrl('');
    setUpdateUpiId('');
    setUpdateDailyWage('');
    setIsTeamMemberModalOpen(false);
    showToast('User account updated successfully!', { type: 'success' });
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
        title={
          isAttendancePage
            ? t('attendance_calendar_heading', 'Attendance Calendar')
            : t('team_access_heading', 'Team & Access')
        }
        subtitle={
          isAttendancePage
            ? t('attendance_page_subtitle', 'Track staff attendance and manage salary details.')
            : t('staff_payee_subtitle', 'Manage login staff credentials, core operational suppliers, and pass-through third parties.')
        }
      >
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {(!isAttendancePage || activeSubTab === 'control_center') && (
            <div data-tour="create-team-member">
              <Button
                onClick={() => {
                  setUserFormTab('create');
                  setNewFullName('');
                  setNewUsername('');
                  setNewPasscode('');
                  setNewUpiId('');
                  setNewIsFinancialHandler(false);
                  setNewAccessAllProperties(false);
                  setNewDailyWage('');
                  setIsTeamMemberModalOpen(true);
                }}
                variant="primary"
                size="md"
                leftIcon={<Plus className="w-4 h-4" />}
                className="font-semibold shadow-md cursor-pointer"
              >
                Create Team Member
              </Button>
            </div>
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
                className={`font-semibold transition-all cursor-pointer shadow-md ${
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

      {/* SUB-TAB 1: PROPERTY PAYROLL & PAYEE CONTROL CENTER */}
      {activeSubTab === 'control_center' && (
        <div className="space-y-6 staff-management">
          {/* Active System Users & Staff */}
          <div data-tour="staff-permissions" className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {/* Top Toolbar: Flowbite Search and Actions */}
            <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex-1 max-w-md">
                <FlowbiteTextInput
                  type="text"
                  icon={Search}
                  value={searchUsers}
                  onChange={(e) => setSearchUsers(e.target.value)}
                  placeholder="Search for users..."
                  className="w-full"
                />
              </div>
            </div>

            {/* Desktop View: Full Table */}
            <div className="hidden md:block overflow-x-auto">
              {(() => {
                const usersColumns = [
                  {
                    name: 'NAME',
                    cell: (row: any) => {
                      const rawPhone = row.phone || row.phone_number || row.username || '';
                      const phoneVal = rawPhone.replace(/\D/g, '');
                      return (
                        <div className="py-3 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {row.fullName}
                          </div>
                          <div className="text-xs truncate mt-0.5">
                            {phoneVal ? (
                              <a
                                href={`tel:${phoneVal}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer"
                                title={`Call ${phoneVal}`}
                              >
                                <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>{rawPhone || phoneVal}</span>
                              </a>
                            ) : (
                              <span className="text-gray-500 dark:text-gray-400">{row.username || '—'}</span>
                            )}
                          </div>
                        </div>
                      );
                    },
                  },
                  {
                    id: 'position_role',
                    name: (
                      <div className="flex items-center gap-1.5">
                        <span>Role</span>
                        <Popover
                          trigger="hover"
                          content={roleHelpPopoverContent}
                        >
                          <button
                            type="button"
                            onClick={(e) => e.stopPropagation()}
                            className="appearance-none border-0 p-0 m-0 inline-flex items-center text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer"
                          >
                            <span>Help?</span>
                          </button>
                        </Popover>
                      </div>
                    ),
                    cell: (row: any) => (
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {row.role}
                      </span>
                    ),
                  },
                  {
                    id: 'status',
                    name: 'Status',
                    cell: (row: any) => {
                      const isUserDisabled = row.status === 'Disabled' || row.status === 'Inactive';
                      return (
                        <div className="flex items-center gap-1.5">
                          <div className={`h-2.5 w-2.5 rounded-full ${isUserDisabled ? 'bg-red-500' : 'bg-green-500'} shrink-0`} />
                          <span className={`text-xs font-semibold ${isUserDisabled ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                            {isUserDisabled ? 'Disabled' : 'Active'}
                          </span>
                        </div>
                      );
                    },
                  },
                  {
                    id: 'salary',
                    name: 'Salary',
                    cell: (row: any) => (
                      <span className="text-xs font-semibold text-gray-900 dark:text-white">
                        {row.dailyWage && Number(row.dailyWage) > 0 ? `₹${row.dailyWage}/day` : '—'}
                      </span>
                    ),
                  },
                  {
                    id: 'cash_handling',
                    name: 'Cash Handling',
                    cell: (row: any) => row.isFinancialHandler ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 whitespace-nowrap">
                        <CreditCard className="w-3 h-3 text-emerald-600" /> Cash Handler
                      </span>
                    ) : (
                      <span className="text-gray-400 italic text-xs">No</span>
                    ),
                  },
                  ...(hasMultipleProperties ? [{
                    id: 'access_all_properties',
                    name: 'Access All Properties',
                    cell: (row: any) => row.accessAllProperties ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 whitespace-nowrap">
                        <Building2 className="w-3 h-3 text-blue-600" /> All Properties
                      </span>
                    ) : (
                      <span className="text-gray-400 italic text-xs">Current Only</span>
                    ),
                  }] : []),
                  {
                    name: 'UPI QR CODE',
                    align: 'center' as const,
                    cell: (row: any) => (row.qrCodeUrl || row.upiId) ? (
                      <Button onClick={() => setLightboxTarget({ qrCodeUrl: row.qrCodeUrl, upiId: row.upiId, payeeName: row.fullName || row.name })} variant="link" size="sm" leftIcon={<QrCode className="w-3.5 h-3.5" />} className="text-emerald-600 hover:text-emerald-700 font-semibold text-xs gap-1 mx-auto">{t('view_qr_button', 'View QR')}</Button>
                    ) : (
                      <span className="text-gray-400 italic text-xs">{t('none_label', 'None')}</span>
                    ),
                  },
                  {
                    name: 'ACTIONS',
                    align: 'right' as const,
                    cell: (row: any) => {
                      const isCurrentUser = currentUser?.id === row.id;
                      const canEdit = !isCurrentUser && canEditUser(currentUser?.role || 'Staff', row.role);
                      const canDelete = !isCurrentUser && canEdit;
                      return (
                        <div className="flex items-center gap-2 justify-end">
                          {canShareLogins && !!row.username && (
                            <Popover
                              trigger="hover"
                              content={
                                <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  Share login details
                                </div>
                              }
                            >
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => handleShareLogin(row)}
                                leftIcon={<Share2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />}
                                className="text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 hover:bg-emerald-100/60 dark:bg-emerald-950/30 font-semibold text-xs h-8 cursor-pointer shrink-0"
                              >
                                <span className="whitespace-nowrap">Share</span>
                              </Button>
                            </Popover>
                          )}
                          {isCurrentUser ? (
                            <span className="text-gray-400 italic text-xs">Active Session</span>
                          ) : (
                            <>
                              {canEdit && (
                                <Button variant="secondary" size="sm" onClick={() => handleEditUser(row)} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                                  <span className="whitespace-nowrap">Edit</span>
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="danger" size="sm" onClick={() => handleDeleteUser(row.id)} leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}>
                                  <span className="whitespace-nowrap">Delete</span>
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    },
                  },
                ];

                if (staffLoading) {
                  return (
                    <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t('loading_staff_message', 'Loading staff...')}
                    </div>
                  );
                }
                if (visibleUsers.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-semibold text-xs">{t('no_system_users_message', 'No system users registered.')}</div>
                  );
                }
                return (
                  <>
                    <Table hoverable>
                      <TableHead>
                        <TableRow>
                          {usersColumns.map((col: any, idx: number) => (
                            <TableHeadCell key={col.id || (typeof col.name === 'string' ? col.name : idx)} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                              {col.name}
                            </TableHeadCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {visibleUsers.slice((usersDesktopPage - 1) * USERS_DESKTOP_PAGE_SIZE, usersDesktopPage * USERS_DESKTOP_PAGE_SIZE).map((row: any) => (
                          <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                            {usersColumns.map((col: any, idx: number) => (
                              <TableCell key={col.id || (typeof col.name === 'string' ? col.name : idx)} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                                {col.cell(row)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={usersDesktopPage}
                      totalItems={visibleUsers.length}
                      pageSize={USERS_DESKTOP_PAGE_SIZE}
                      onPageChange={setUsersDesktopPage}
                      itemLabel="users"
                    />
                  </>
                );
              })()}
            </div>

            {/* Mobile View: Touch-First Mobile Cards with 10-Item Pagination */}
            <div className="md:hidden p-3 space-y-3">
              {visibleUsers.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-semibold text-xs">{t('no_system_users_message', 'No system users registered.')}</div>
              ) : (
                <div className="space-y-3">
                  {visibleUsers.slice((staffPermissionsPage - 1) * 10, staffPermissionsPage * 10).map((row: any) => {
                  const isCurrentUser = currentUser?.id === row.id;
                  const canEdit = !isCurrentUser && canEditUser(currentUser?.role || 'Staff', row.role);
                  const canDelete = !isCurrentUser && canEdit;
                  const rawPhone = row.phone || row.phone_number || row.username || '';
                  const phoneVal = rawPhone.replace(/\D/g, '');

                  return (
                    <div key={row.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 flex items-center flex-wrap gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm m-0">{row.fullName}</h4>
                          {phoneVal ? (
                            <a
                              href={`tel:${phoneVal}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline font-semibold cursor-pointer"
                              title={`Call ${phoneVal}`}
                            >
                              <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span>{rawPhone || phoneVal}</span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">{row.username || '—'}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-semibold text-[10px] shrink-0">{row.role}</span>
                          {canShareLogins && !!row.username && (
                            <Popover
                              trigger="hover"
                              content={
                                <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                  Share login details
                                </div>
                              }
                            >
                              <Button onClick={() => handleShareLogin(row)} variant="secondary" size="xs" aria-label="Share login details" className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer px-2 shrink-0">
                                <Share2 className="w-3.5 h-3.5" />
                              </Button>
                            </Popover>
                          )}
                          {!isCurrentUser && (
                            <>
                              {canEdit && (
                                <Button onClick={() => handleEditUser(row)} variant="secondary" size="xs" leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />} className="cursor-pointer px-2 shrink-0">{t('edit_button', 'Edit')}</Button>
                              )}
                              {canDelete && (
                                <Button onClick={() => handleDeleteUser(row.id)} variant="danger" size="xs" className="font-semibold cursor-pointer px-2 shrink-0">{t('delete_button', 'Delete')}</Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700 flex-wrap gap-2">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Status</span>
                          <span className={`font-semibold ${row.status === 'Disabled' || row.status === 'Inactive' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {row.status === 'Disabled' || row.status === 'Inactive' ? 'Disabled' : 'Active'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Daily Wage</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {row.dailyWage && Number(row.dailyWage) > 0 ? `₹${row.dailyWage}/day` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cash Handling</span>
                          {row.isFinancialHandler ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Cash Handler</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">No</span>
                          )}
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Access</span>
                          {row.accessAllProperties ? (
                            <span className="text-blue-600 dark:text-blue-400 font-semibold inline-flex items-center gap-1">
                              <Building2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>All Properties</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">Current Only</span>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">UPI QR Code</span>
                          {(row.qrCodeUrl || row.upiId) ? (
                            <Button onClick={() => setLightboxTarget({ qrCodeUrl: row.qrCodeUrl, upiId: row.upiId, payeeName: row.fullName || row.name })} variant="link" size="sm" leftIcon={<QrCode className="w-3.5 h-3.5" />} className="text-emerald-600 hover:text-emerald-700 font-semibold text-[11px] p-0 h-auto">View QR</Button>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">None</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}

              {/* Mobile 10-Item Pagination Controls */}
              {visibleUsers.length > 10 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={staffPermissionsPage === 1}
                    onClick={() => setStaffPermissionsPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Page {staffPermissionsPage} of {Math.ceil(visibleUsers.length / 10)}
                  </span>
                  <button
                    type="button"
                    disabled={staffPermissionsPage >= Math.ceil(visibleUsers.length / 10)}
                    onClick={() => setStaffPermissionsPage((p) => Math.min(Math.ceil(visibleUsers.length / 10), p + 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ATTENDANCE CALENDAR MATRIX */}
      {activeSubTab === 'calendar' && (
        <div data-tour="attendance-salary" className="space-y-4">
          {/* 24 Aug 2026, reported live: table headers/legend rendered
              immediately with zero staff rows in between whenever this tab
              mounted before StaffContext's initial fetch resolved - `staff`
              is genuinely empty for that brief window, same shape as
              "no staff yet", so nothing below could tell the two apart. The
              Staff Directory sub-tab already guards on staffLoading (see its
              own "Loading staff..." below) - this sub-tab just never got the
              same guard. */}
          {staffLoading ? (
            <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 text-sm py-16 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('loading_staff_message', 'Loading staff...')}
            </div>
          ) : (
          <>
          {/* Bulk Marking Action Buttons */}
          {(isBulkSelectEnabled || selectedCells.size > 0) && (
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3">
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
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-emerald-700 flex items-center justify-center text-[10px]">P</span>
                  <span>{t('mark_present_label', 'Mark Present (P)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Absent')}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-red-700 flex items-center justify-center text-[10px]">A</span>
                  <span>{t('mark_absent_label', 'Mark Absent (A)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Half Day')}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-amber-700 flex items-center justify-center text-[10px]">H</span>
                  <span>{t('mark_halfday_label', 'Mark Half Day (H)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Paid Leave')}
                  className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-purple-700 flex items-center justify-center text-[10px]">L</span>
                  <span>{t('mark_leave_label', 'Mark Paid Leave (L)')}</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Clear')}
                  className="bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md transition-all cursor-pointer"
                >
                  <span>{t('clear_status_label', 'Clear Status (-)')}</span>
                </button>
              </div>
            </div>
          )}

          {/* MOBILE ATTENDANCE & SALARY CARDS VIEW (md:hidden) */}
          <div className="md:hidden space-y-4">
            {/* View Mode Switcher Pills */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setMobileAttMode('daily')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mobileAttMode === 'daily'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> Daily Quick Duty
              </button>
              <button
                type="button"
                onClick={() => setMobileAttMode('summary')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  mobileAttMode === 'summary'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" /> Monthly Heatmaps
              </button>
            </div>

            {/* Mode 1: Daily Duty Quick-Mark Stack */}
            {mobileAttMode === 'daily' && (
              <div className="space-y-3">
                {/* Date Navigator Header & Quick Mark Button */}
                <div className="bg-white dark:bg-slate-800 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMobileDayNum((d) => Math.max(1, d - 1))}
                      disabled={mobileDayNum <= 1}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div className="text-center">
<span className="font-mono font-bold text-slate-900 dark:text-white text-xs block">
                          {formatDateDDMMYYYY(`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(mobileDayNum).padStart(2, '0')}`)}
                        </span>
                      {mobileDayNum === now.getDate() && selectedMonth === now.getMonth() && selectedYear === now.getFullYear() && (
                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">Today</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setMobileDayNum((d) => Math.min(daysInMonth, d + 1))}
                      disabled={mobileDayNum >= daysInMonth}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 disabled:opacity-30 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(mobileDayNum).padStart(2, '0')}`;
                      staff.filter(s => s.status === 'Active').forEach(s => {
                        recordAttendance({
                          id: `att-${Date.now().toString().slice(-4)}`,
                          date: dateStr,
                          staffId: s.id,
                          staffName: s.name,
                          status: 'Present',
                        });
                      });
                      showToast(`Marked all active staff Present for ${mobileDayNum} ${new Date(selectedYear, selectedMonth).toLocaleString('en-US', { month: 'short' })}`, { type: 'success' });
                    }}
                    className="w-full py-2 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-600" /> Mark All Active Staff Present
                  </button>
                </div>

                {/* Staff Cards List */}
                <div className="space-y-2.5">
                  {filteredStaff.map((member) => {
                    const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(mobileDayNum).padStart(2, '0')}`;
                    const cellKey = `${member.id}_${dateStr}`;
                    const currentStatus = attendanceMap.get(cellKey);
                    const dailyRate = daysInMonth > 0 ? (member.monthlySalary / daysInMonth).toFixed(0) : '0';

                    return (
                      <div key={member.id} className="p-3.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-semibold text-slate-900 dark:text-white text-xs">{member.name}</h4>
                            <p className="text-[11px] text-slate-500">{member.role} • ₹{dailyRate}/day</p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {member.status}
                          </span>
                        </div>

                        {/* 1-Tap Duty Status Pills */}
                        <div className="grid grid-cols-5 gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                          {[
                            { status: 'Present', label: 'P', activeBg: 'ring-2 ring-emerald-500 bg-emerald-600 text-white font-bold' },
                            { status: 'Absent', label: 'A', activeBg: 'ring-2 ring-red-500 bg-red-600 text-white font-bold' },
                            { status: 'Half Day', label: 'H', activeBg: 'ring-2 ring-amber-500 bg-amber-600 text-white font-bold' },
                            { status: 'Paid Leave', label: 'L', activeBg: 'ring-2 ring-purple-500 bg-purple-600 text-white font-bold' },
                            { status: 'Clear', label: '-', activeBg: 'ring-2 ring-slate-400 bg-slate-300 dark:bg-slate-600 font-bold' },
                          ].map((item) => {
                            const isActive = (item.status === 'Clear' && !currentStatus) || currentStatus === item.status;
                            return (
                              <button
                                key={item.status}
                                type="button"
                                onClick={() => {
                                  recordAttendance({
                                    id: `att-${Date.now().toString().slice(-4)}`,
                                    date: dateStr,
                                    staffId: member.id,
                                    staffName: member.name,
                                    status: item.status as AttendanceRecord['status'],
                                  });
                                }}
                                className={`py-2 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer ${
                                  isActive
                                    ? item.activeBg
                                    : 'bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-700'
                                }`}
                              >
                                <span className="text-sm leading-none font-bold">{item.label}</span>
                                <span className="text-[9px] mt-0.5 opacity-80">
                                  {item.status === 'Paid Leave' ? 'Leave' : item.status === 'Half Day' ? 'Half' : item.status}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mode 2: Monthly Staff Heatmaps & Earned Pay */}
            {mobileAttMode === 'summary' && (
              <div className="space-y-3">
                {filteredStaff.map((member) => {
                  let presentDays = 0;
                  let absentDays = 0;
                  let halfDays = 0;
                  let leaveDays = 0;

                  monthDays.forEach((d) => {
                    const st = attendanceMap.get(`${member.id}_${d.dateStr}`);
                    if (st === 'Present') presentDays += 1;
                    else if (st === 'Absent') absentDays += 1;
                    else if (st === 'Half Day') halfDays += 1;
                    else if (st === 'Paid Leave') leaveDays += 1;
                  });

                  const effectiveDays = presentDays + (halfDays * 0.5) + leaveDays;
                  const dailyRate = daysInMonth > 0 ? member.monthlySalary / daysInMonth : 0;
                  const earnedSalary = (effectiveDays * dailyRate).toFixed(0);

                  return (
                    <div key={member.id} className="p-3.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/60 pb-2.5">
                        <div>
                          <h4 className="font-semibold text-slate-900 dark:text-white text-xs">{member.name}</h4>
                          <p className="text-[11px] text-slate-500">{member.role} • Base ₹{member.monthlySalary.toLocaleString('en-IN')}/mo</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] text-slate-400 uppercase font-semibold block">Earned So Far</span>
                          <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">₹{Number(earnedSalary).toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      {/* Attendance Breakdown Pills */}
                      <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-semibold">
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 p-1.5 rounded-lg border border-emerald-200/60">
                          <span className="block font-bold text-xs">{presentDays}</span> Present
                        </div>
                        <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 p-1.5 rounded-lg border border-red-200/60">
                          <span className="block font-bold text-xs">{absentDays}</span> Absent
                        </div>
                        <div className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 p-1.5 rounded-lg border border-amber-200/60">
                          <span className="block font-bold text-xs">{halfDays}</span> Half Day
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 p-1.5 rounded-lg border border-purple-200/60">
                          <span className="block font-bold text-xs">{leaveDays}</span> Leave
                        </div>
                      </div>

                      {/* Monthly Calendar Mini Heatmap */}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Monthly Heatmap (Tap day to cycle status)</p>
                        <div className="grid grid-cols-7 gap-1">
                          {monthDays.map((d) => {
                            const cellKey = `${member.id}_${d.dateStr}`;
                            const st = attendanceMap.get(cellKey);
                            return (
                              <button
                                key={d.dayNum}
                                type="button"
                                onClick={() => handleCellClick(member, d.dateStr)}
                                className={`h-7 rounded-md text-[10px] font-bold flex flex-col items-center justify-center transition-all cursor-pointer select-none ${
                                  st === 'Present' ? 'bg-emerald-500 text-white' :
                                  st === 'Absent' ? 'bg-red-500 text-white' :
                                  st === 'Half Day' ? 'bg-amber-500 text-white' :
                                  st === 'Paid Leave' ? 'bg-purple-500 text-white' :
                                  'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200'
                                }`}
                                title={`${d.dayNum} ${d.dayName}: ${st || 'Unmarked'}`}
                              >
                                <span>{d.dayNum}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* DESKTOP ATTENDANCE MATRIX TABLE (hidden md:block) */}
          <div className="hidden md:block space-y-4">
            <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md flex items-center justify-between">
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
                {new Date(selectedYear, selectedMonth, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })}
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

            <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-colors">
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
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold text-xs shadow-md">
                                  P
                                </span>
                              )}

                              {status === 'Absent' && (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-semibold text-xs shadow-md">
                                  A
                                </span>
                              )}

                              {status === 'Half Day' && (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold text-xs shadow-md">
                                  H
                                </span>
                              )}

                              {status === 'Paid Leave' && (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-semibold text-xs shadow-md">
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
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-start gap-3 text-xs">
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
          </div>
          </>
          )}
        </div>
      )}

      {/* SUB-TAB 3: ROSTER LIST VIEW */}
      {activeSubTab === 'roster' && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 transition-colors space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h3 className="staff-management__subtitle font-semibold text-slate-900 dark:text-white text-sm">
              {t('staff_directory_payroll_heading', 'Staff Member Directory & Payroll Breakdown')}
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
              {t('total_payroll_label', 'Total Payroll:')} ₹{totalPayroll.toLocaleString('en-IN')} / mo
            </span>
          </div>

          <div className="p-3 space-y-3">
            <Input type="text" value={searchStaff} onChange={e => setSearchStaff(e.target.value)} placeholder="Search by name or role..." className="w-full max-w-sm" />

            {/* Mobile Cards Stack View (md:hidden) */}
            <div className="md:hidden space-y-2.5">
              {filteredStaff.map((s) => (
                <div key={s.id} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">{s.name}</div>
                      <span className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800 inline-block mt-0.5">
                        {s.role}
                      </span>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-200 text-slate-700'}`}>
                      {s.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <span className="font-mono text-slate-500 inline-flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{s.phone || 'No phone'}</span>
                    </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{s.monthlySalary.toLocaleString('en-IN')} / mo</span>
                  </div>

                  {updateStaff && (
                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={() => { setEditingStaffId(s.id); setEditStaffRole(s.role); setEditStaffPhone(s.phone); setEditStaffSalary(s.monthlySalary); setEditStaffStatus(s.status); }}
                        className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>Edit Details</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop Table (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              {(() => {
                const staffColumns = [
                  {
                    name: 'Staff ID',
                    cell: (row: any) => <span className="font-semibold text-slate-500 dark:text-slate-400 text-xs">#{row.id}</span>,
                  },
                  {
                    name: 'Full Name',
                    cell: (row: any) => <span className="font-semibold text-slate-900 dark:text-white text-sm">{row.name}</span>,
                  },
                  {
                    name: 'Role',
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
                    cell: (row: any) => editingStaffId === row.id ? (
                      <Input
                        type="tel"
                        value={editStaffPhone}
                        onChange={e => setEditStaffPhone(e.target.value)}
                        className="text-xs border-blue-300 bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700"
                        fullWidth={false}
                      />
                    ) : (
                      <span className="text-slate-600 dark:text-slate-300 font-medium text-xs">{row.phone}</span>
                    ),
                  },
                  {
                    name: 'Monthly Base',
                    align: 'right' as const,
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
                    align: 'center' as const,
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
                    align: 'right' as const,
                    cell: (row: any) => editingStaffId === row.id ? (
                      <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                        <Button variant="primary" size="sm" onClick={() => { updateStaff!(row.id, { role: editStaffRole, phone: editStaffPhone, monthlySalary: editStaffSalary, status: editStaffStatus }); setEditingStaffId(null); if (onLogAudit) onLogAudit(`Updated staff ${row.name}: role=${editStaffRole}, phone=${editStaffPhone}, salary=₹${editStaffSalary}, status=${editStaffStatus}`); }}>
                          {t('save_button', 'Save')}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setEditingStaffId(null)}>
                          {t('cancel_button', 'Cancel')}
                        </Button>
                      </div>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => { setEditingStaffId(row.id); setEditStaffRole(row.role); setEditStaffPhone(row.phone); setEditStaffSalary(row.monthlySalary); setEditStaffStatus(row.status); }} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                        {t('edit_button', 'Edit')}
                      </Button>
                    ),
                  }] : []),
                ];

                if (staffLoading) {
                  return (
                    <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                      <Loader2 className="w-4 h-4 animate-spin" /> {t('loading_staff_message', 'Loading staff...')}
                    </div>
                  );
                }
                if (filteredStaff.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-semibold text-xs">No staff members found.</div>
                  );
                }
                return (
                  <>
                    <Table hoverable>
                      <TableHead>
                        <TableRow>
                          {staffColumns.map((col) => (
                            <TableHeadCell key={col.name} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                              {col.name}
                            </TableHeadCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredStaff.slice((staffDesktopPage - 1) * STAFF_DESKTOP_PAGE_SIZE, staffDesktopPage * STAFF_DESKTOP_PAGE_SIZE).map((row: any) => (
                          <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                            {staffColumns.map((col) => (
                              <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : ''}>
                                {col.cell(row)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={staffDesktopPage}
                      totalItems={filteredStaff.length}
                      pageSize={STAFF_DESKTOP_PAGE_SIZE}
                      onPageChange={setStaffDesktopPage}
                      itemLabel="staff members"
                    />
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR QR CODE VIEW */}
      {lightboxTarget && (
        <div
          onClick={() => setLightboxTarget(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-lg max-w-xs w-full p-6 text-center space-y-3 border border-slate-200 shadow-2xl relative"
          >
            <button
              onClick={() => setLightboxTarget(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="staff-management__caption font-semibold text-slate-900 text-sm">{t('registered_qr_code_heading', 'Registered QR Code')}</h4>
            {lightboxTarget.upiId ? (
              <UpiPaymentBlock
                upiId={lightboxTarget.upiId}
                payeeName={lightboxTarget.payeeName || 'Staff Payment'}
                qrCodeImageUrl={lightboxTarget.qrCodeUrl}
                size={140}
              />
            ) : (
              <div className="rounded-lg overflow-hidden border border-slate-200 p-2 bg-slate-50">
                <img src={lightboxTarget.qrCodeUrl} alt="QR Code" className="w-full h-auto rounded-lg" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Staff Drawer */}
      <FlowbiteDrawer
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
            <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {t('add_new_staff_member_heading', 'Add New Staff Member')}
          </span>
          <button
            type="button"
            onClick={() => setIsModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleAddStaffSubmit} className="app-form app-form--add-staff flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
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
                value={phone}
                // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
                // truncates raw typed characters before digit-stripping runs, silently dropping
                // trailing digits from any formatted phone number.
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
              />
            </div>

            <div>
              <Input
                label={t('six_digit_passcode_required_label', '6-Digit Passcode PIN *')}
                type="password"
                autoComplete="new-password"
                required
                maxLength={6}
                value={rosterPasscode}
                onChange={(e) => setRosterPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                inputMode="numeric"
                className="text-slate-900 dark:text-white"
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
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Member
            </Button>
          </div>
        </form>
      </FlowbiteDrawer>

      {/* TEAM MEMBER DRAWER (CREATE / UPDATE) - Flowbite Right Slide-Out Drawer */}
      <FlowbiteDrawer
        open={isTeamMemberModalOpen}
        onClose={() => setIsTeamMemberModalOpen(false)}
        position="right"
        className="z-58 w-full sm:max-w-md md:max-w-lg h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg ${userFormTab === 'create' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400' : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'}`}>
              {userFormTab === 'create' ? <Plus className="w-5 h-5" /> : <Settings className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="staff-management__subtitle font-bold text-gray-900 dark:text-white text-base">
                {userFormTab === 'create' ? 'Add user' : 'Edit user'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">
                {userFormTab === 'create' ? 'Add a new user to the system' : 'Update credentials and role permissions'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsTeamMemberModalOpen(false)}
            className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <DrawerItems className="flex-1 overflow-y-auto p-4 sm:p-5">
          {userFormTab === 'create' ? (
            <form onSubmit={handleCreateUser} className="app-form app-form--create-user space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('phone_login_username_label', 'Phone Number (Login Username)')} *</label>
                  <Input
                    type="tel"
                    required
                    value={newUsername}
                    // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
                    // truncates raw typed characters before digit-stripping runs, silently
                    // dropping trailing digits from any formatted phone number.
                    onChange={(e) => setNewUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    error={newUsernameInvalid ? 'Must be exactly 10 digits' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('six_digit_passcode_label', '6-Digit Passcode PIN')} *</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={6}
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    inputMode="numeric"
                    error={newPasscodeInvalid ? 'Must be exactly 6 digits' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Confirm New Passcode PIN *</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={6}
                    value={newConfirmPasscode}
                    onChange={(e) => setNewConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Re-enter new passcode"
                    inputMode="numeric"
                    error={newPasscodeMismatch ? "Passcodes don't match" : undefined}
                    success={newPasscodeMatch ? 'Passcodes match' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="h-5 flex items-center justify-between mb-1.5">
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">{t('team_role', 'System Role')}</label>
                    <Popover
                      trigger="hover"
                      placement="top"
                      zIndex={9999}
                      content={roleHelpPopoverContent}
                    >
                      <button
                        type="button"
                        className="appearance-none border-0 p-0 m-0 inline-flex items-center text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer"
                      >
                        <span>Help?</span>
                      </button>
                    </Popover>
                  </div>
                  <StyledSelect
                    value={newRole}
                    onChange={(val) => setNewRole(val as any)}
                    options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                  />
                </div>
                <div>
                  <div className="h-5 flex items-center mb-1.5">
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">{t('daily_wage_label', 'Daily Wage (₹)')}</label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={newDailyWage}
                    onChange={(e) => setNewDailyWage(e.target.value)}
                    placeholder="e.g. 800"
                    className="text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className={`grid ${hasMultipleProperties ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-1`}>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isFinancialHandlerCheck"
                    checked={newIsFinancialHandler}
                    onChange={e => setNewIsFinancialHandler(e.target.checked)}
                  />
                  <label htmlFor="isFinancialHandlerCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs flex items-center gap-1 min-w-0">
                    <span className="truncate">{t('cash_handling_user_label', 'Cash Handling User')}</span>
                    <Popover
                      trigger="hover"
                      placement="top"
                      zIndex={9999}
                      content={
                        <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-xs">
                          Allows this team member to collect cash payments, open/reconcile cash drawers, and record checkout settlements.
                        </div>
                      }
                    >
                      <button type="button" aria-label="What does Cash Handling User do?" className="inline-flex items-center justify-center p-0.5 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-help transition-colors shrink-0">
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </Popover>
                  </label>
                </div>

                {hasMultipleProperties && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="newAccessAllPropertiesCheck"
                      checked={newAccessAllProperties}
                      onChange={e => setNewAccessAllProperties(e.target.checked)}
                    />
                    <label htmlFor="newAccessAllPropertiesCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs flex items-center gap-1 min-w-0">
                      <span className="truncate">{t('access_all_properties_label', 'Access All Properties')}</span>
                      <Popover
                        trigger="hover"
                        placement="top"
                        zIndex={9999}
                        content={
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-xs">
                            Grants this team member full multi-property access across all properties under this tenant workspace.
                          </div>
                        }
                      >
                        <button type="button" aria-label="What does Access All Properties do?" className="inline-flex items-center justify-center p-0.5 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-help transition-colors shrink-0">
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </Popover>
                    </label>
                  </div>
                )}
              </div>

              <div>
                <Input
                  label={t('staff_upi_id_label', 'Payment UPI ID (Optional)')}
                  type="text"
                  value={newUpiId}
                  onChange={(e) => setNewUpiId(e.target.value)}
                  placeholder="name@okicici"
                  error={newUpiId.trim() && !isValidUpiIdSyntax(newUpiId) ? t('upi_id_invalid_format_error', 'Enter a valid UPI ID, e.g. name@bank') : undefined}
                  success={newUpiId.trim() && isValidUpiIdSyntax(newUpiId) ? t('upi_id_valid_format_success', 'Valid UPI ID format') : undefined}
                  helperText={t('staff_upi_id_help_text', 'A scannable QR code is generated automatically from this ID so this team member can be paid by scanning it.')}
                />
                {newUpiId.trim() && isValidUpiIdSyntax(newUpiId) && (
                  <div className="mt-2">
                    <UpiPaymentBlock upiId={newUpiId.trim()} payeeName={newFullName.trim() || 'Staff Payment'} />
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end pt-3 border-t border-slate-100 dark:border-slate-700">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="font-semibold cursor-pointer ml-auto"
                >
                  Register Team Member
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUpdateUserSubmit} className="app-form app-form--update-user space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('phone_login_username_label', 'Phone Number (Login Username)')}</label>
                  <Input
                    type="tel"
                    value={updateUsername}
                    disabled={isEditingSuperAdmin}
                    // No maxLength - see GuestManagement.tsx's onChange comment (23 Aug 2026): it
                    // truncates raw typed characters before digit-stripping runs, silently
                    // dropping trailing digits from any formatted phone number.
                    onChange={(e) => setUpdateUsername(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    error={updateUsernameInvalid ? 'Must be exactly 10 digits' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                  {isEditingSuperAdmin && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      {t('super_admin_username_locked_hint', "This is the tenant's own login - change it from the Root Dashboard's tenant login tools instead.")}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('new_passcode_optional_label', 'New 6-Digit Passcode PIN')}</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    maxLength={6}
                    value={updatePasscode}
                    onChange={(e) => setUpdatePasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Leave blank to keep current"
                    inputMode="numeric"
                    error={updatePasscodeInvalid ? 'Must be exactly 6 digits' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Confirm New Passcode PIN</label>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    maxLength={6}
                    value={updateConfirmPasscode}
                    onChange={(e) => setUpdateConfirmPasscode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Re-enter new passcode"
                    inputMode="numeric"
                    error={updatePasscodeMismatch ? "Passcodes don't match" : undefined}
                    success={updatePasscodeMatch ? 'Passcodes match' : undefined}
                    className="text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {!isEditingSuperAdmin ? (
                  <div>
                    <div className="h-5 flex items-center justify-between mb-1.5">
                      <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">{t('new_system_role_label', 'New System Role')}</label>
                      <Popover
                        trigger="hover"
                        placement="top"
                        zIndex={9999}
                        content={roleHelpPopoverContent}
                      >
                        <button
                          type="button"
                          className="appearance-none border-0 p-0 m-0 inline-flex items-center text-2xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline cursor-pointer"
                        >
                          <span>Help?</span>
                        </button>
                      </Popover>
                    </div>
                    <StyledSelect
                      value={updateRole}
                      onChange={(val) => setUpdateRole(val as any)}
                      placeholder="-- Keep Role --"
                      options={roleOptions.map((roleName) => ({ value: roleName, label: roleName }))}
                    />
                  </div>
                ) : null}
                <div>
                  <div className="h-5 flex items-center mb-1.5">
                    <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 m-0">{t('daily_wage_label', 'Daily Wage (₹)')}</label>
                  </div>
                  <Input
                    type="number"
                    min="0"
                    value={updateDailyWage}
                    onChange={(e) => setUpdateDailyWage(e.target.value)}
                    placeholder="e.g. 800"
                    className="text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {!isEditingSuperAdmin && (
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>Account Status:</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold ${
                        updateStatus === 'Active'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${updateStatus === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {updateStatus === 'Active' ? 'Active' : 'Disabled'}
                      </span>
                    </p>
                    {updateStatus !== 'Active' && (
                      <p className="text-2xs text-red-600 dark:text-red-400 mt-0.5">
                        User is disabled and blocked from logging into the platform
                      </p>
                    )}
                  </div>
                  <ToggleSwitch
                    enabled={updateStatus === 'Active'}
                    onChange={(active) => setUpdateStatus(active ? 'Active' : 'Disabled')}
                  />
                </div>
              )}

              {isEditingSuperAdmin && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                  {t('super_admin_locked_fields_hint', "Super Admin's role can't be reassigned - it's the tenant's own login, not an assignable position - and it's always a Cash Handler with Access All Properties, so there's nothing to toggle here.")}
                </div>
              )}

              {!isEditingSuperAdmin && (
                <div className={`grid ${hasMultipleProperties ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-1`}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="updateIsFinancialHandlerCheck"
                      checked={updateIsFinancialHandler}
                      onChange={e => setUpdateIsFinancialHandler(e.target.checked)}
                    />
                    <label htmlFor="updateIsFinancialHandlerCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs flex items-center gap-1 min-w-0">
                      <span className="truncate">{t('cash_handling_user_label', 'Cash Handling User')}</span>
                      <Popover
                        trigger="hover"
                        placement="top"
                        zIndex={9999}
                        content={
                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-xs">
                            Allows this team member to collect cash payments, open/reconcile cash drawers, and record checkout settlements.
                          </div>
                        }
                      >
                        <button type="button" aria-label="What does Cash Handling User do?" className="inline-flex items-center justify-center p-0.5 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-help transition-colors shrink-0">
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </Popover>
                    </label>
                  </div>

                  {hasMultipleProperties && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="updateAccessAllPropertiesCheck"
                        checked={updateAccessAllProperties}
                        onChange={e => setUpdateAccessAllProperties(e.target.checked)}
                      />
                      <label htmlFor="updateAccessAllPropertiesCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer text-xs flex items-center gap-1 min-w-0">
                        <span className="truncate">{t('access_all_properties_label', 'Access All Properties')}</span>
                        <Popover
                          trigger="hover"
                          placement="top"
                          zIndex={9999}
                          content={
                            <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 max-w-xs">
                              Grants this team member full multi-property access across all properties under this tenant workspace.
                            </div>
                          }
                        >
                          <button type="button" aria-label="What does Access All Properties do?" className="inline-flex items-center justify-center p-0.5 rounded-full text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 cursor-help transition-colors shrink-0">
                            <HelpCircle className="w-3.5 h-3.5" />
                          </button>
                        </Popover>
                      </label>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Input
                  label={t('staff_upi_id_label', 'Payment UPI ID (Optional)')}
                  type="text"
                  value={updateUpiId}
                  onChange={(e) => setUpdateUpiId(e.target.value)}
                  placeholder="name@okicici"
                  error={updateUpiId.trim() && !isValidUpiIdSyntax(updateUpiId) ? t('upi_id_invalid_format_error', 'Enter a valid UPI ID, e.g. name@bank') : undefined}
                  success={updateUpiId.trim() && isValidUpiIdSyntax(updateUpiId) ? t('upi_id_valid_format_success', 'Valid UPI ID format') : undefined}
                  helperText={t('staff_upi_id_help_text', 'A scannable QR code is generated automatically from this ID so this team member can be paid by scanning it.')}
                />
                {/* Legacy uploaded QR images (from before this became UPI-ID-driven,
                    26 Aug 2026) are preserved and still shown here - as the
                    generated block's own background if a valid UPI ID is also present
                    (qrCodeImageUrl there takes precedence, same as everywhere else
                    this pattern is used), or as the bare original image if this
                    staff member has an old QR but hasn't entered a (valid) UPI ID yet,
                    so nothing already-visible disappears out from under them. */}
                {updateUpiId.trim() && isValidUpiIdSyntax(updateUpiId) ? (
                  <div className="mt-2">
                    <UpiPaymentBlock
                      upiId={updateUpiId.trim()}
                      payeeName={updateFullName.trim() || 'Staff Payment'}
                      qrCodeImageUrl={updateQrCodeUrl || updateTargetUser?.qrCodeUrl}
                    />
                  </div>
                ) : (updateQrCodeUrl || updateTargetUser?.qrCodeUrl) ? (
                  <div className="mt-2 flex justify-center">
                    <img src={updateQrCodeUrl || updateTargetUser?.qrCodeUrl} alt={t('qr_code_preview_alt', 'QR code preview')} className="h-16 w-16 object-contain border border-slate-200 dark:border-slate-700 rounded-lg shadow-md bg-white" />
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-700 flex-wrap">
                {canShareLogins && !!(updateUsername || updateTargetUser?.username) ? (
                  <Button
                    type="button"
                    onClick={() => handleShareLogin({
                      fullName: updateFullName || updateTargetUser?.fullName || '',
                      username: updateUsername || updateTargetUser?.username || '',
                      passcodePin: updatePasscode || updateTargetUser?.passcodePin,
                    })}
                    variant="secondary"
                    size="sm"
                    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-semibold cursor-pointer flex items-center gap-1.5 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40"
                  >
                    <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t('share_login_details_button', 'Share Login Details')}</span>
                  </Button>
                ) : <div />}

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="font-semibold cursor-pointer ml-auto"
                >
                  Save Team Member
                </Button>
              </div>
            </form>
          )}
        </DrawerItems>
      </FlowbiteDrawer>


    </div>
  );
};

