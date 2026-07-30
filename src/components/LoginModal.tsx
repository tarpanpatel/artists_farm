import React, { useState, useEffect } from 'react';
import { Lock, User, KeyRound, ShieldAlert, ArrowRight } from 'lucide-react';
import { StaffMember } from '../types';
import { useStaff } from '../contexts/StaffContext';

interface LoginModalProps {
  onLoginSuccess: (user: StaffMember) => void;
  onLoginFailed: (username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onLoginFailed }) => {
  const { staff: staffList } = useStaff();
  const [loginMode, setLoginMode] = useState<'staff' | 'admin'>('staff');
  const [selectedStaffUsername, setSelectedStaffUsername] = useState<string>('');
  const [adminUsername, setAdminUsername] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-switch to staff login if staff exist, otherwise admin
  useEffect(() => {
    if (staffList.length > 0 && loginMode === 'admin') {
      setLoginMode('staff');
    } else if (staffList.length === 0 && loginMode === 'staff') {
      setLoginMode('admin');
    }
  }, [staffList.length]);

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

  const handleSubmitStaff = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedStaffUsername) {
      setErrorMsg('Please select a staff username');
      return;
    }
    if (passcode.length !== 6) {
      setErrorMsg('Please enter a 6-digit passcode');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/artists_farm/api/authenticate.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'staff',
          username: selectedStaffUsername,
          passcode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        const user: StaffMember = {
          id: data.user.id,
          name: data.user.name || data.user.username,
          username: data.user.username,
          role: data.user.role || 'Staff',
        };
        onLoginSuccess(user);
      } else {
        setErrorMsg(data.message || 'Login failed');
        if (onLoginFailed) onLoginFailed(selectedStaffUsername);
      }
    } catch (error) {
      setErrorMsg('Network error during login');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitAdmin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminUsername) {
      setErrorMsg('Please enter username');
      return;
    }
    if (passcode.length !== 6) {
      setErrorMsg('Please enter a 6-digit passcode');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/artists_farm/api/authenticate.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'admin',
          username: adminUsername,
          passcode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        const user: StaffMember = {
          id: data.user.id,
          name: data.user.username,
          username: data.user.username,
          role: data.user.role || 'Super Admin',
        };
        onLoginSuccess(user);
      } else {
        setErrorMsg(data.message || 'Login failed');
        if (onLoginFailed) onLoginFailed(adminUsername);
      }
    } catch (error) {
      setErrorMsg('Network error during login');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const showStaffTab = staffList.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-4 ring-white/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black tracking-tight uppercase">Artists' Farm</h2>
          <p className="text-xs text-blue-100 mt-1 font-medium">Portal Authorization & Security Gate</p>

          {/* Login Mode Tabs */}
          <div className="flex gap-2 mt-4">
            {showStaffTab && (
              <button
                onClick={() => {
                  setLoginMode('staff');
                  setPasscode('');
                  setErrorMsg(null);
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  loginMode === 'staff'
                    ? 'bg-white text-blue-600'
                    : 'bg-blue-500/50 text-white hover:bg-blue-500/70'
                }`}
              >
                Staff
              </button>
            )}
            <button
              onClick={() => {
                setLoginMode('admin');
                setPasscode('');
                setErrorMsg(null);
              }}
              className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                loginMode === 'admin'
                  ? 'bg-white text-blue-600'
                  : 'bg-blue-500/50 text-white hover:bg-blue-500/70'
              }`}
            >
              Admin
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form
          onSubmit={loginMode === 'staff' ? handleSubmitStaff : handleSubmitAdmin}
          className="p-6 space-y-5"
          disabled={isLoading}
        >
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* STAFF LOGIN */}
          {loginMode === 'staff' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Select Staff
                </label>
                <select
                  value={selectedStaffUsername}
                  onChange={(e) => {
                    setSelectedStaffUsername(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                >
                  <option value="">-- Choose Account --</option>
                  {staffList.map((staff) => (
                    <option key={staff.id} value={staff.username || staff.name}>
                      {staff.name} ({staff.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> 6-Digit Passcode
                </label>
                <input
                  type="password"
                  readOnly
                  value={passcode}
                  placeholder="••••••"
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>{isLoading ? 'Authenticating...' : 'Login'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* ADMIN LOGIN */}
          {loginMode === 'admin' && (
            <>
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Username
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => {
                    setAdminUsername(e.target.value);
                    setErrorMsg(null);
                  }}
                  placeholder="Enter username"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> 6-Digit Passcode
                </label>
                <input
                  type="password"
                  readOnly
                  value={passcode}
                  placeholder="••••••"
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <span>{isLoading ? 'Authenticating...' : 'Login'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
};
