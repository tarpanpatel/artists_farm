import React, { useState } from 'react';
import { Lock, Phone, KeyRound, ShieldAlert, Delete } from 'lucide-react';
import { StaffMember } from '../types';
import { t } from '../i18n/en';

interface LoginModalProps {
  onLoginSuccess: (user: StaffMember) => void;
  onLoginFailed: (username: string) => void;
  // Called instead of onLoginSuccess when the authenticated account has
  // access_all_properties set (see php/security/access_control.php) - the
  // caller should show StaffPropertyPicker rather than entering this
  // property's dashboard directly, since which property to work in hasn't
  // been decided yet.
  onNeedsPropertySelection?: (info: { tenantId: number; tenantSlug: string; user: any }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onLoginSuccess, onLoginFailed, onNeedsPropertySelection }) => {
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [passcode, setPasscode] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobileNumber(val);
    setErrorMsg(null);
  };

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!mobileNumber) {
      setErrorMsg(t('enter_10_digit_mobile_error'));
      return;
    }
    if (passcode.length !== 6 && passcode !== '123456' && passcode !== 'admin') {
      setErrorMsg(t('enter_6_digit_passcode_error'));
      return;
    }

    setIsLoading(true);
    try {
      // FIX (12 Aug 2026): this posted to /artists_farm/php/api/authenticate.php
      // - the fake "/artists_farm/" subfolder assumption that broke every API
      // call site-wide earlier this engagement (see src/services/api.ts's
      // API_BASE fix) and was fixed everywhere else, but this component was
      // missed. That path doesn't exist on any real property URL, so it fell
      // through .htaccess's catch-all rewrite to index.php's HTML instead of
      // JSON, and response.json() threw - surfacing as the generic "Network
      // error during authentication" with no indication of the real cause.
      // Switched to the same login_user action every other login flow in the
      // app already uses (LoginPage.tsx) - it already returns everything this
      // component needs, including access_all_properties/tenant_id/tenant_slug
      // for the property-picker branch below.
      const response = await fetch('/php/api/router.php?action=login_user', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mobile_number: mobileNumber,
          passcode,
        }),
      });

      const data = await response.json();

      if (data.success && data.user) {
        if (data.user.access_all_properties && onNeedsPropertySelection) {
          onNeedsPropertySelection({
            tenantId: data.user.tenant_id,
            tenantSlug: data.user.tenant_slug,
            user: data.user,
          });
          return;
        }
        const user: StaffMember = {
          id: String(data.user.id),
          name: data.user.name || data.user.username,
          username: data.user.username,
          role: data.user.role || 'Staff',
          phone: data.user.phone_number || mobileNumber,
          monthlySalary: 0,
          status: 'Active',
        };
        onLoginSuccess(user);
      } else {
        setErrorMsg(data.message || t('login_failed_error'));
        if (onLoginFailed) onLoginFailed(mobileNumber);
      }
    } catch (error) {
      setErrorMsg(t('network_auth_error'));
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-modal min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient Backdrop Aura - matches LoginPage.tsx */}
      <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-500/10 dark:bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-indigo-500/10 dark:bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="login-modal__card relative max-w-md w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-8 sm:p-9 transition-all">
        {/* Brand Icon */}
        <div className="flex justify-center mb-5">
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/25 ring-4 ring-blue-500/10">
            <Lock className="w-8 h-8 text-white stroke-[2.2]" />
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="text-center mb-7">
          <h1 className="login-modal__title text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t('login_modal_brand')}
          </h1>
          <p className="login-modal__subtitle text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            {t('terminal_authorization_subtitle')}
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="app-form app-form--login login-modal__form space-y-4">
          {errorMsg && (
            <div className="flex gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
              <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-red-800 dark:text-red-300">{errorMsg}</p>
            </div>
          )}

          {/* Mobile Number Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('mobile_number_label')}
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                <Phone className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">+91</span>
              </div>
              <input
                type="tel"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder={t('ten_digit_mobile_placeholder')}
                className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 transition-all outline-none"
                autoFocus
              />
            </div>
          </div>

          {/* 6-Digit Passcode Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              {t('six_digit_pin_label')}
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 z-10 flex items-center gap-1.5 text-slate-400 dark:text-slate-500 pointer-events-none select-none">
                <KeyRound className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-700 pr-2">PIN</span>
              </div>
              <input
                type="password"
                value={passcode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPasscode(val);
                  setErrorMsg(null);
                }}
                placeholder={t('passcode_dots_placeholder')}
                maxLength={6}
                inputMode="numeric"
                className="w-full h-11 pl-[72px] pr-4 bg-slate-50/80 dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 rounded-xl text-left text-sm tracking-[0.25em] font-mono text-slate-900 dark:text-white placeholder:text-slate-400 placeholder:tracking-normal transition-all outline-none"
              />
            </div>
          </div>

          {/* Touch Keypad - kept for quick PIN entry on a shared terminal, restyled to match */}
          <div className="login-modal__keypad grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handlePasscodeKey(num)}
                className="login-modal__key login-modal__key--number py-3 text-lg font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 transition-colors active:scale-95 cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="login-modal__key login-modal__key--clear py-3 text-xs font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
            >
              {t('clear_keypad_button')}
            </button>
            <button
              type="button"
              onClick={() => handlePasscodeKey('0')}
              className="login-modal__key login-modal__key--number py-3 text-lg font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-800 dark:text-white rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:border-blue-300 hover:text-blue-600 transition-colors active:scale-95 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="login-modal__key login-modal__key--backspace py-3 text-xs font-semibold bg-slate-50/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors cursor-pointer"
            >
              <Delete className="w-4 h-4 mx-auto" />
            </button>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
              className="login-modal__submit w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-xl shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
            >
              <Lock className="w-4 h-4" />
              <span>{isLoading ? t('authenticating_text') : t('login_to_terminal_button')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
