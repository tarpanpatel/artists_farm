import React, { useState } from 'react';
import { Lock, User, KeyRound, ShieldAlert, ArrowRight } from 'lucide-react';
import { StaffMember } from '../types';

interface LoginModalProps {
  onLoginSuccess: (user: StaffMember) => void;
  onLoginFailed: (username: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onLoginFailed }) => {
  const [adminUsername, setAdminUsername] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminUsername) {
      setErrorMsg('Please enter username');
      return;
    }
    if (!adminPassword) {
      setErrorMsg('Please enter password');
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
          password: adminPassword,
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
        </div>

        {/* Form Body - Admin Login Only */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

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
              <KeyRound className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Password
            </label>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                setErrorMsg(null);
              }}
              placeholder="Enter password"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
            />
          </div>

          {/* Login Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>{isLoading ? 'Authenticating...' : 'Authorize & Login'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
