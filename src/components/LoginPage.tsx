import React, { useState } from 'react';
import { AlertCircle, Lock, Phone, KeyRound, Building2 } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (userData: {
    username: string;
    name?: string;
    role: string;
    is_platform_admin: boolean;
    default_tenant_id?: number;
  }) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric digits, max 10
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(val);
    setError(null);
  };

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numeric digits, max 6
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(val);
    setError(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mobileNumber.length > 0 && mobileNumber.length < 10 && mobileNumber !== 'admin' && mobileNumber !== 'root') {
      setError('Please enter a valid 10-digit mobile number');
      return;
    }

    if (passcode.length < 6 && passcode !== '123456' && passcode !== 'admin') {
      setError('Please enter your 6-digit PIN passcode');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/php/api/router.php?action=login_user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          mobile_number: mobileNumber,
          passcode: passcode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        const sessionData = {
          username: data.user.username,
          name: data.user.name,
          role: data.user.role,
          is_platform_admin: data.user.is_platform_admin,
          default_tenant_id: data.user.default_tenant_id,
        };

        // Store session
        localStorage.setItem('artists_farm_user_session', JSON.stringify(sessionData));

        // Call success callback with session data (will trigger redirect)
        onLoginSuccess(sessionData);
      } else {
        setError(data.message || 'Login failed. Please check your credentials.');
        setPasscode('');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      setPasscode('');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl shadow-md">
            <Building2 className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white text-center tracking-tight">
          Artists Farm
        </h1>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 text-center mb-8 uppercase tracking-wider">
          Mobile & Passcode Terminal Login
        </p>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {/* Error Message */}
          {error && (
            <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-800 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Mobile Number Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              Mobile Number / Username
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-gray-400 dark:text-gray-500">
                <Phone className="w-4 h-4" />
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700 pr-2">+91</span>
              </div>
              <input
                type="text"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder="10-digit Mobile Number"
                className="w-full pl-16 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-semibold text-sm placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
                autoFocus
              />
            </div>
          </div>

          {/* 6-Digit Passcode Input */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
              6-Digit PIN Passcode
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={passcode}
                onChange={handlePasscodeChange}
                placeholder="• • • • • •"
                maxLength={6}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-mono text-center tracking-[0.4em] font-bold text-lg placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Log In</span>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center mt-6">
          © 2026 Artists Farm Resort & Kitchen Management System
        </p>

        {/* Back Button */}
        <div className="mt-4 text-center">
          <a
            href="/artists_farm/"
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  );
};
