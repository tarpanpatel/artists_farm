import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { StaffMember, AttendanceRecord } from '../types';
import {
  fetchStaffUsersFromDB,
  fetchAttendanceFromDB,
  addStaffUserDB,
  updateStaffUserDB,
} from '../services/api';

interface StaffContextValue {
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  staffLoading: boolean;
  refreshAttendance: () => void;
  refreshStaff: () => void;
  addStaff: (member: StaffMember) => Promise<boolean>;
  updateStaff: (id: string, updated: Partial<StaffMember>) => void;
  recordAttendance: (record: AttendanceRecord) => void;
}

interface StaffProviderProps {
  children: React.ReactNode;
  onLogAudit?: (action: string, extra?: any) => void;
  currentUser?: StaffMember | null;
}

const StaffContext = createContext<StaffContextValue | null>(null);

export const useStaff = (): StaffContextValue => {
  const ctx = useContext(StaffContext);
  if (!ctx) throw new Error('useStaff must be used within StaffProvider');
  return ctx;
};

export const StaffProvider: React.FC<StaffProviderProps> = ({
  children,
  onLogAudit,
  currentUser,
}) => {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const mapStaffRow = (u: any): StaffMember => ({
    id: u.id,
    name: u.fullName || u.name || u.username,
    role: u.role || 'Staff',
    phone: u.phone || u.username || '',
    monthlySalary: u.monthlySalary || 0,
    status: u.status || 'Active',
    passcode: u.passcode,
    qrCodeUrl: u.qrCodeUrl,
    isFinancialHandler: u.isFinancialHandler,
    // Username - the login phone number, distinct from `name`. Was
    // previously dropped here entirely, leaving every `.username`
    // read on a StaffMember silently undefined.
    username: u.username || u.phone || '',
  });

  const refreshStaff = useCallback(() => {
    fetchStaffUsersFromDB().then((data) => {
      if (data && data.length > 0) {
        setStaff(data.map(mapStaffRow));
      }
      setStaffLoading(false);
    });
  }, []);

  useEffect(() => {
    // BUG (found 13 Aug 2026, alongside the DataLoader nav-menu fix): the
    // very first staff fetch right after a fresh login has been observed to
    // occasionally come back empty (or missing rows) for an established
    // property that clearly has staff - self-corrects on any later manual
    // refresh, which lands on already-warm caches/connections. A property's
    // own tenant row is auto-seeded on creation, so a genuinely-empty result
    // here is itself suspicious, not just "no staff yet". Retry once, after
    // a short delay, before accepting an empty first result as final -
    // mirrors the same self-correcting approach used for the nav menu.
    fetchStaffUsersFromDB().then((data) => {
      if (data && data.length > 0) {
        setStaff(data.map(mapStaffRow));
        setStaffLoading(false);
      } else {
        setTimeout(() => {
          fetchStaffUsersFromDB().then((retryData) => {
            if (retryData && retryData.length > 0) setStaff(retryData.map(mapStaffRow));
            setStaffLoading(false);
          });
        }, 1500);
      }
    });
    fetchAttendanceFromDB().then((data) => {
      if (data && data.length > 0) setAttendance(data);
    });
  }, []);

  const refreshAttendance = useCallback(() => {
    fetchAttendanceFromDB().then((data) => {
      if (data && data.length > 0) setAttendance(data); else setAttendance([]);
    });
  }, []);

  const addStaff = async (member: StaffMember): Promise<boolean> => {
    // Username must be the login phone number, never the Staff Name - the
    // backend validates it as a 10-digit number and silently rejects
    // anything else, so this used to fail to persist while the UI still
    // looked like it succeeded (member was already in local state).
    const saved = await addStaffUserDB({
      id: member.id,
      username: member.phone,
      fullName: member.name,
      role: member.role,
      phone: member.phone,
      passcode: member.passcode,
      monthlySalary: member.monthlySalary,
      status: member.status,
    });
    if (saved) {
      setStaff((prev) => [...prev, member]);
      onLogAudit?.(`Added new staff member: ${member.name} (${member.role})`);
    }
    return saved;
  };

  const updateStaff = (id: string, updated: Partial<StaffMember>) => {
    const oldMember = staff.find(m => m.id === id);
    const currentUserName = currentUser?.name || 'Admin';
    const changes: string[] = [];
    if (oldMember) {
      if (updated.name !== undefined && updated.name !== oldMember.name) changes.push(`name of "${oldMember.name}" to "${updated.name}"`);
      if (updated.role !== undefined && updated.role !== oldMember.role) changes.push(`role of "${oldMember.name}" from ${oldMember.role} to ${updated.role}`);
      if (updated.phone !== undefined && updated.phone !== oldMember.phone) changes.push(`phone of "${oldMember.name}" from ${oldMember.phone} to ${updated.phone}`);
      if (updated.monthlySalary !== undefined && updated.monthlySalary !== oldMember.monthlySalary) changes.push(`salary of "${oldMember.name}" from ₹${oldMember.monthlySalary} to ₹${updated.monthlySalary}`);
      if (updated.status !== undefined && updated.status !== oldMember.status) changes.push(`status of "${oldMember.name}" from ${oldMember.status} to ${updated.status}`);
    }
    const detail = changes.length > 0 ? changes.join(', ') : `staff member #${id}`;
    setStaff((prev) => prev.map((m) => (m.id === id ? { ...m, ...updated } : m)));
    updateStaffUserDB(id, updated);
    onLogAudit?.(`${currentUserName} updated ${detail}`);
  };

  const recordAttendance = (record: AttendanceRecord) => {
    setAttendance((prev) => {
      const filtered = prev.filter(
        (a) => !(a.staffId === record.staffId && a.date === record.date)
      );
      if ((record.status as string) === 'Clear' || !record.status) {
        return filtered;
      }
      return [record, ...filtered];
    });
    const currentUserName = currentUser?.name || 'Admin';
    onLogAudit?.(`${currentUserName} marked ${record.staffName} ${record.status.toLowerCase()} on attendance calendar`);
  };

  return (
    <StaffContext.Provider
      value={{
        staff,
        attendance,
        staffLoading,
        refreshAttendance,
        refreshStaff,
        addStaff,
        updateStaff,
        recordAttendance,
      }}
    >
      {children}
    </StaffContext.Provider>
  );
};
