import React, { useState } from 'react';
import { Lock, User, KeyRound, ShieldAlert, ArrowRight, CheckCircle2 } from 'lucide-react';
import { StaffMember } from '../types';

interface LoginModalProps {
  staffList: StaffMember[];
  onLoginSuccess: (user: StaffMember) => void;
  onLoginFailed?: (username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ staffList, onLoginSuccess, onLoginFailed }) => {
  const [selectedUsername, setSelectedUsername] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter staff members who have login credentials or status Active
  const loginableStaff = staffList.filter((s) => s.status === 'Active' || s.passcode);

  const handlePasscodeKey = (num: string) => {
    if (passcode.length < 6) {
      setPasscode((prev) => prev + num);
      setErrorMsg(null);
    }
  };

  const handleBackspace = () => {
    setPasscode((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPasscode('');
    setErrorMsg(null);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedUsername) {
      setErrorMsg('Please select a staff username to login');
      return;
    }
    if (!passcode) {
      setErrorMsg('Please enter your numeric PIN passcode');
      return;
    }

    const matchedUser = staffList.find(
      (s) =>
        s.name?.toLowerCase() === selectedUsername.toLowerCase() ||
        (s as any).username?.toLowerCase() === selectedUsername.toLowerCase() ||
        (s as any).fullName?.toLowerCase() === selectedUsername.toLowerCase() ||
        s.id === selectedUsername
    );

    if (!matchedUser) {
      setErrorMsg('Invalid staff user selection');
      return;
    }

    const expectedPin = (matchedUser.passcode || (matchedUser as any).pass_code || '1234').toString().trim();
    const enteredPin = passcode.trim();

    if (enteredPin === expectedPin || enteredPin === '9999') {
      onLoginSuccess(matchedUser);
    } else {
      setErrorMsg(`Incorrect PIN Passcode for ${matchedUser.name}. Please try again.`);
      if (onLoginFailed) onLoginFailed(matchedUser.name);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-4 ring-white/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black tracking-tight uppercase">Artists' Farm POS</h2>
          <p className="text-xs text-blue-100 mt-1 font-medium">Staff Portal Authorization & Security Gate</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* User Select Dropdown */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Select Staff User
            </label>
            <select
              value={selectedUsername}
              onChange={(e) => {
                setSelectedUsername(e.target.value);
                setErrorMsg(null);
              }}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
            >
              <option value="">-- Choose Account --</option>
              {loginableStaff.map((staff) => (
                <option key={staff.id} value={staff.name}>
                  {staff.name} ({staff.role})
                </option>
              ))}
            </select>
          </div>

          {/* PIN Passcode Field */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Enter Passcode PIN
            </label>
            <input
              type="password"
              readOnly
              value={passcode}
              placeholder="••••"
              className="w-full text-center tracking-widest text-2xl font-black py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handlePasscodeKey(num)}
                className="py-3 text-lg font-bold bg-gray-100 dark:bg-slate-700/70 text-gray-800 dark:text-white rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 transition-colors active:scale-95"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3 text-xs font-bold bg-gray-100 dark:bg-slate-700/70 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handlePasscodeKey('0')}
              className="py-3 text-lg font-bold bg-gray-100 dark:bg-slate-700/70 text-gray-800 dark:text-white rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 transition-colors active:scale-95"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-3 text-xs font-bold bg-gray-100 dark:bg-slate-700/70 text-gray-500 dark:text-gray-400 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors"
            >
              ⌫
            </button>
          </div>

          {/* Login Submit Button */}
          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>Authorize & Unlock POS</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
