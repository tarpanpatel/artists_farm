import React, { useState, useEffect } from 'react';
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
  Store
} from 'lucide-react';
import { StaffMember, AttendanceRecord, UserAccount, PayeeEntity } from '../types';
import { addPayeeDB, addStaffUserDB, deletePayeeDB, deleteStaffUserDB, fetchPayeesFromDB, updateStaffUserDB } from '../services/api';

interface StaffManagementProps {
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  onAddStaff: (member: StaffMember) => void;
  onUpdateStaff?: (id: string, updated: Partial<StaffMember>) => void;
  onRecordAttendance: (record: AttendanceRecord) => void;
  activeMenuItemKey?: string;
  onReloadStaff?: () => void;
  expenses?: any[];
  auditLogs?: any[];
  onLogAudit?: (actionText: string) => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  staff,
  attendance,
  onAddStaff,
  onUpdateStaff,
  onRecordAttendance,
  activeMenuItemKey,
  onReloadStaff,
  expenses,
  auditLogs,
  onLogAudit,
}) => {
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
  const roleOptions = Array.from(new Set(staff.map((member) => member.role).filter(Boolean))).sort();

  // Form States
  // 1. Create User
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
  const [updateRole, setUpdateRole] = useState<UserAccount['role'] | ''>('');
  const [updatePasscode, setUpdatePasscode] = useState('');
  const [updateIsFinancialHandler, setUpdateIsFinancialHandler] = useState(false);
  const [updateQrCodeUrl, setUpdateQrCodeUrl] = useState('');

  // Modals / Lightboxes
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editingPayee, setEditingPayee] = useState<PayeeEntity | null>(null);

  // Attendance Calendar State
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isBulkSelectEnabled, setIsBulkSelectEnabled] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State for Add Staff Roster
  const [name, setName] = useState('');
  const [role, setRole] = useState<StaffMember['role']>('');
  const [phone, setPhone] = useState('');
  const [monthlySalary, setMonthlySalary] = useState(25000);

  // Edit Staff Roster State
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffRole, setEditStaffRole] = useState('');
  const [editStaffPhone, setEditStaffPhone] = useState('');
  const [editStaffSalary, setEditStaffSalary] = useState(0);
  const [editStaffStatus, setEditStaffStatus] = useState('Active');

  useEffect(() => {
    setUsers(staff.map((member) => ({
      id: member.id,
      username: member.name,
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

  // Handlers for Control Center
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPasscode) return;
    const newUser: UserAccount = {
      id: `usr-${Date.now().toString().slice(-4)}`,
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
      fullName: newUser.username,
      role: newUser.role,
      passcode: newUser.passcodePin,
      isFinancialHandler: newUser.isFinancialHandler,
      qrCodeUrl: newUser.qrCodeUrl,
      status: newUser.status,
    });
    if (!saved) {
      alert('Unable to save the staff member to the database.');
      return;
    }
    onReloadStaff?.();
    setNewUsername('');
    setNewPasscode('');
    setNewQrCodeUrl('');
    setNewIsFinancialHandler(false);
  };

  const handleDeleteUser = async (id: string) => {
    if (confirm('Delete user profile permanently?')) {
      if (await deleteStaffUserDB(id)) onReloadStaff?.();
      else alert('Unable to delete the staff member from the database.');
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
      alert('Unable to save the payee to the database.');
      return;
    }
    setPayees((previous) => [...previous, newPayee]);
    setNewPayeeName('');
    setNewPayeeQrCode('');
  };

  const handleDeletePayee = async (id: string) => {
    if (confirm('Purge payee archive records permanently?')) {
      if (await deletePayeeDB(id)) setPayees((previous) => previous.filter((payee) => payee.id !== id));
      else alert('Unable to delete the payee from the database.');
    }
  };

  const handleUpdateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUpdateUserId) return;
    const currentUser = users.find((user) => user.id === selectedUpdateUserId);
    if (!currentUser) return;
    const saved = await updateStaffUserDB(selectedUpdateUserId, {
      role: updateRole || currentUser.role,
      passcode: updatePasscode || currentUser.passcodePin,
      isFinancialHandler: updateIsFinancialHandler,
      qrCodeUrl: updateQrCodeUrl || currentUser.qrCodeUrl,
    });
    if (!saved) {
      alert('Unable to update the user in the database.');
      return;
    }
    onReloadStaff?.();
    setSelectedUpdateUserId('');
    setUpdatePasscode('');
    setUpdateRole('');
    setUpdateQrCodeUrl('');
    alert('User account updated successfully!');
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
      onRecordAttendance({
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
        onRecordAttendance({
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

  const handleAddStaffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const newStaff: StaffMember = {
      id: `st-${Date.now().toString().slice(-4)}`,
      name,
      role,
      phone,
      monthlySalary: Number(monthlySalary),
      status: 'Active',
    };

    onAddStaff(newStaff);
    setIsModalOpen(false);
    setName('');
    setPhone('');
  };

  const totalPayroll = staff.reduce((acc, s) => acc + s.monthlySalary, 0);

  return (
    <div className="space-y-6">
      {/* Navigation Sub-Tabs Header */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>👥</span> Property Payroll & Payee Control Center
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAttendancePage
              ? 'Track staff attendance and manage salary details.'
              : 'Manage login staff credentials, core operational suppliers, and pass-through third parties.'}
          </p>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl text-xs font-bold">
          {!isAttendancePage && (
            <button
              onClick={() => setActiveSubTab('control_center')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeSubTab === 'control_center'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Staff & Payees Control
            </button>
          )}
          <button
            onClick={() => setActiveSubTab('calendar')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'calendar'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Attendance Calendar
          </button>
          <button
            onClick={() => setActiveSubTab('roster')}
            className={`px-3.5 py-1.5 rounded-lg transition-all ${
              activeSubTab === 'roster'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Staff Directory & Salaries
          </button>
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
                  Active System Users & Staff
                </h3>
                <span className="text-xs text-slate-400 font-mono">{users.length} Registered</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold uppercase text-[10px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Username</th>
                      <th className="p-3">Role Group</th>
                      <th className="p-3 text-center">Dropdown Status</th>
                      <th className="p-3 text-center">UPI QR Code</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{u.username}</td>
                        <td className="p-3">
                          <span className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded font-bold text-[10px]">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {u.isFinancialHandler ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                              💳 Cash Handler
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                              No Finances
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {u.qrCodeUrl ? (
                            <button
                              onClick={() => setLightboxUrl(u.qrCodeUrl!)}
                              className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              📸 View QR
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">None</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {u.username === 'Tarpan' ? (
                            <span className="text-slate-400 italic text-[11px]">Active Session</span>
                          ) : (
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Registered Payees (Vendors & Third Parties) */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-orange-500 pl-2.5">
                  Registered Payees (Vendors & Third Parties)
                </h3>
                <span className="text-xs text-slate-400 font-mono">{payees.length} Vendors</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 font-bold uppercase text-[10px] text-slate-500 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Payee Entity Title</th>
                      <th className="p-3">Classification</th>
                      <th className="p-3 text-center">UPI QR Code</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {payees.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{p.name}</td>
                        <td className="p-3">
                          {p.type === 'Vendor' ? (
                            <span className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 px-2 py-0.5 rounded font-bold text-[10px]">
                              Vendor
                            </span>
                          ) : (
                            <span className="bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 px-2 py-0.5 rounded font-bold text-[10px]">
                              Third Party
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          {p.qrCodeUrl ? (
                            <button
                              onClick={() => setLightboxUrl(p.qrCodeUrl!)}
                              className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              📸 View QR
                            </button>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">None</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setEditingPayee(p)}
                              className="text-sky-600 hover:text-sky-700 font-bold text-[11px] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeletePayee(p.id)}
                              className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: MANAGERIAL ENTRY FORMS (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Form 1: Create Login Staff Account */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs text-xs">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                ➕ Create Login Staff Account
              </h4>

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Username..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">4-Digit Passcode PIN</label>
                  <input
                    type="password"
                    required
                    maxLength={4}
                    value={newPasscode}
                    onChange={(e) => setNewPasscode(e.target.value)}
                    placeholder="••••"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center font-mono font-bold tracking-widest text-sm"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Authorization Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  >
                    {roleOptions.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="isFinancialHandlerCheck"
                    checked={newIsFinancialHandler}
                    onChange={(e) => setNewIsFinancialHandler(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                  <label htmlFor="isFinancialHandlerCheck" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    Show in Cash Dropdowns
                  </label>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Staff Payment QR Code Image (Optional)</label>
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

                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Register Staff Member
                </button>
              </form>
            </div>

            {/* Form 2: Register Account Payee (Permanent) */}
            <div className="bg-orange-50/60 dark:bg-orange-950/20 p-5 rounded-2xl border border-orange-200 dark:border-orange-900/60 space-y-3 shadow-2xs text-xs">
              <h4 className="font-bold text-orange-900 dark:text-orange-300 text-sm flex items-center gap-1.5">
                ➕ Register Account Payee (Permanent)
              </h4>

              <form onSubmit={handleCreatePayee} className="space-y-3">
                <div>
                  <label className="block text-orange-900 dark:text-orange-300 font-bold mb-1">Payee Account Name</label>
                  <input
                    type="text"
                    required
                    value={newPayeeName}
                    onChange={(e) => setNewPayeeName(e.target.value)}
                    placeholder="e.g. Raju Grocery / Pool Supplier"
                    className="w-full p-2.5 rounded-xl border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-orange-900 dark:text-orange-300 font-bold mb-1">Classification Group</label>
                  <select
                    value={newPayeeType}
                    onChange={(e) => setNewPayeeType(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-orange-300 dark:border-orange-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Vendor">Business Vendor (Daily/Project Supplies)</option>
                    <option value="Third Party">Third Party Account (Pass-Through Routing)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-orange-900 dark:text-orange-300 font-bold mb-1">Upload UPI QR Image Screenshot</label>
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
                    className="w-full text-xs text-slate-500 bg-white dark:bg-slate-900 p-2 rounded-xl border border-orange-300 dark:border-orange-800"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Save Payee to Database Forever
                </button>
              </form>
            </div>

            {/* Form 3: Update Passcode / QR Code */}
            <div className="bg-slate-50 dark:bg-slate-800/80 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 shadow-2xs text-xs">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                ⚙ Update Passcode / QR Code
              </h4>

              <form onSubmit={handleUpdateUserSubmit} className="space-y-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Select Staff Target Account</label>
                  <select
                    required
                    value={selectedUpdateUserId}
                    onChange={(e) => {
                      const uid = e.target.value;
                      setSelectedUpdateUserId(uid);
                      const target = users.find((u) => u.id === uid);
                      if (target) {
                        setUpdateRole(target.role);
                        setUpdateIsFinancialHandler(target.isFinancialHandler);
                      }
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="">-- Choose User Profile --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.username} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">New System Role</label>
                  <select
                    value={updateRole}
                    onChange={(e) => setUpdateRole(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="">-- Keep Current Role --</option>
                    {roleOptions.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">New 4-Digit Passcode PIN (Leave blank to keep current)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={updatePasscode}
                    onChange={(e) => setUpdatePasscode(e.target.value)}
                    placeholder="••••"
                    className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center font-mono font-bold tracking-widest text-sm"
                  />
                </div>

                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
                  <input
                    type="checkbox"
                    id="updateIsFinancialHandlerCheck"
                    checked={updateIsFinancialHandler}
                    onChange={(e) => setUpdateIsFinancialHandler(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded cursor-pointer"
                  />
                  <label htmlFor="updateIsFinancialHandlerCheck" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                    Show in Cash Dropdowns
                  </label>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">Replace Payment QR Code Image</label>
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
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ATTENDANCE CALENDAR MATRIX */}
      {activeSubTab === 'calendar' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
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
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      onClick={handleSelectTodayCells}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                    >
                      📅 Select Today ({staff.length})
                    </button>
                    <button
                      onClick={handleSelectAllCells}
                      className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                    >
                      🗓️ Select Entire Month ({monthDays.length * staff.length})
                    </button>
                    {selectedCells.size > 0 && (
                      <button
                        onClick={() => setSelectedCells(new Set())}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 font-bold px-2 py-1 cursor-pointer"
                      >
                        Clear Selection ({selectedCells.size})
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {selectedCells.size > 0 ? (
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    🎯 {selectedCells.size} cell{selectedCells.size > 1 ? 's' : ''} selected
                  </span>
                ) : (
                  <span>Click cells or enable bulk mode to update attendance</span>
                )}
              </div>
            </div>

            {/* Bulk Marking Action Buttons */}
            {(isBulkSelectEnabled || selectedCells.size > 0) && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-1">
                  Mark Selected Cells As:
                </span>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Present')}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-emerald-700 flex items-center justify-center text-[10px]">P</span>
                  <span>Mark Present (P)</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Absent')}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-red-700 flex items-center justify-center text-[10px]">A</span>
                  <span>Mark Absent (A)</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Half Day')}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-indigo-700 flex items-center justify-center text-[10px]">L</span>
                  <span>Mark Leave / Half Day (L)</span>
                </button>

                <button
                  disabled={selectedCells.size === 0}
                  onClick={() => applyBulkStatus('Clear')}
                  className="bg-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                >
                  <span>Clear Status (-)</span>
                </button>
              </div>
            )}
          </div>

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
            <div className="font-extrabold text-sm text-slate-800 dark:text-white">
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
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-900/80 text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-slate-700 font-bold">
                    <th className="sticky left-0 bg-gray-50 dark:bg-slate-900 z-20 text-left px-4 py-3 min-w-[150px] border-r border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white">
                      Staff Member
                    </th>
                    {monthDays.map((d) => (
                      <th
                        key={`num-${d.dayNum}`}
                        className={`px-2 py-2 min-w-[36px] max-w-[40px] text-[11px] border-r border-gray-200 dark:border-slate-700/60 ${
                          d.isToday ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 font-extrabold' : ''
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
                          d.isToday ? 'bg-amber-100/80 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-extrabold' : ''
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
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold text-xs shadow-2xs">
                                P
                              </span>
                            )}

                            {status === 'Absent' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-extrabold text-xs shadow-2xs">
                                A
                              </span>
                            )}

                            {status === 'Half Day' && (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-extrabold text-xs shadow-2xs">
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
        </div>
      )}

      {/* SUB-TAB 3: ROSTER LIST VIEW */}
      {activeSubTab === 'roster' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-xs p-5 transition-colors space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-3">
            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
              Staff Member Directory & Payroll Breakdown
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
              Total Payroll: ₹{totalPayroll.toLocaleString('en-IN')} / mo
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-slate-900 font-bold uppercase text-[10px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="py-2.5 px-3">Staff ID</th>
                  <th className="py-2.5 px-3">Full Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Monthly Base</th>
                  <th className="py-2.5 px-3">Status</th>
                  {(onUpdateStaff) && <th className="py-2.5 px-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {staff.map((m) => {
                  const isEditing = editingStaffId === m.id;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="py-3 px-3 font-mono font-bold text-gray-500 dark:text-gray-400">{m.id}</td>
                      <td className="py-3 px-3 font-bold text-gray-900 dark:text-white text-sm">{m.name}</td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select value={editStaffRole} onChange={e => setEditStaffRole(e.target.value)}
                            className="w-full p-1.5 border border-blue-300 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700">
                            {roleOptions.map((roleName) => (
                              <option key={roleName} value={roleName}>{roleName}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-gray-600 dark:text-gray-300">{m.role}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input type="tel" value={editStaffPhone} onChange={e => setEditStaffPhone(e.target.value)}
                            className="w-full p-1.5 border border-blue-300 rounded-lg text-xs font-mono bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700" />
                        ) : (
                          <span className="font-mono text-gray-600 dark:text-gray-300">{m.phone}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <input type="number" value={editStaffSalary} onChange={e => setEditStaffSalary(Number(e.target.value))}
                            className="w-full p-1.5 border border-blue-300 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700" />
                        ) : (
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{m.monthlySalary.toLocaleString('en-IN')}</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isEditing ? (
                          <select value={editStaffStatus} onChange={e => setEditStaffStatus(e.target.value)}
                            className="w-full p-1.5 border border-blue-300 rounded-lg text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 dark:border-blue-700">
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                            {m.status}
                          </span>
                        )}
                      </td>
                      {onUpdateStaff && (
                        <td className="py-3 px-3 text-right">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => {
                                onUpdateStaff(m.id, { role: editStaffRole, phone: editStaffPhone, monthlySalary: editStaffSalary, status: editStaffStatus });
                                setEditingStaffId(null);
                                if (onLogAudit) onLogAudit(`Updated staff ${m.name}: role=${editStaffRole}, phone=${editStaffPhone}, salary=₹${editStaffSalary}, status=${editStaffStatus}`);
                              }} className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Save</button>
                              <button onClick={() => setEditingStaffId(null)} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => {
                              setEditingStaffId(m.id);
                              setEditStaffRole(m.role);
                              setEditStaffPhone(m.phone);
                              setEditStaffSalary(m.monthlySalary);
                              setEditStaffStatus(m.status);
                            }} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer">
                              Edit
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
            <h4 className="font-bold text-slate-900 text-sm">Registered QR Code</h4>
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
              Edit Payee Account Settings
            </h3>

            <form onSubmit={handleUpdatePayeeSave} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-bold mb-1">Payee Account Name</label>
                <input
                  type="text"
                  required
                  value={editingPayee.name}
                  onChange={(e) => setEditingPayee({ ...editingPayee, name: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Classification Type</label>
                <select
                  value={editingPayee.type}
                  onChange={(e) => setEditingPayee({ ...editingPayee, type: e.target.value as any })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold"
                >
                  <option value="Vendor">Vendor</option>
                  <option value="Third Party">Third Party</option>
                </select>
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
              <h3 className="font-bold text-gray-900 dark:text-white text-sm">Add New Staff Member</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaffSubmit} className="space-y-3">
              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Full Name *</label>
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
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {roleOptions.map((roleName) => <option key={roleName} value={roleName}>{roleName}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98281 00011"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
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
    </div>
  );
};

