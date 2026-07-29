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
  addStaff: (member: StaffMember) => void;
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

  const refreshStaff = useCallback(() => {
    fetchStaffUsersFromDB().then((data) => {
      if (data && data.length > 0) {
        setStaff(data.map((u: any) => ({
          id: u.id,
          name: u.fullName || u.name || u.username,
          role: u.role || 'Staff',
          phone: u.phone || '',
          monthlySalary: u.monthlySalary || 0,
          status: u.status || 'Active',
          passcode: u.passcode,
          qrCodeUrl: u.qrCodeUrl,
          isFinancialHandler: u.isFinancialHandler,
        })));
      }
      setStaffLoading(false);
    });
  }, []);

  useEffect(() => {
    refreshStaff();
  }, [refreshStaff]);

  useEffect(() => {
    fetchAttendanceFromDB().then((data) => {
      if (data && data.length > 0) setAttendance(data);
    });
  }, []);

  const refreshAttendance = useCallback(() => {
    fetchAttendanceFromDB().then((data) => {
      if (data && data.length > 0) setAttendance(data); else setAttendance([]);
    });
  }, []);

  const addStaff = (member: StaffMember) => {
    setStaff((prev) => [...prev, member]);
    addStaffUserDB({
      id: member.id,
      username: member.name,
      fullName: member.name,
      role: member.role,
      phone: member.phone,
      monthlySalary: member.monthlySalary,
      status: member.status,
    });
    onLogAudit?.(`Added new staff member: ${member.name} (${member.role})`);
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
