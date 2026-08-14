import React, { useState } from 'react';
import { Lock, Phone, KeyRound, ShieldAlert, ArrowRight, Delete } from 'lucide-react';
import { StaffMember } from '../types';
import { Input } from './Input';
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
    <div className="login-modal fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="login-modal__card w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="login-modal__header bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center relative">
          <div className="login-modal__logo w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-4 ring-white/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="login-modal__title text-xl font-semibold tracking-tight uppercase">{t('login_modal_brand')}</h2>
          <p className="login-modal__subtitle text-xs text-emerald-100 mt-1 font-medium">{t('terminal_authorization_subtitle')}</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="app-form app-form--login login-modal__form p-6 space-y-5">
          {errorMsg && (
            <div className="login-modal__error p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mobile Number Field */}
          <div className="login-modal__field">
            <label className="login-modal__label block text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t('mobile_number_label')}
            </label>
            <div className="login-modal__mobile-input relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400 dark:text-slate-500 z-10">
                <span className="text-xs font-semibold border-r border-slate-300 dark:border-slate-600 pr-2">+91</span>
              </div>
              <Input
                type="tel"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder={t('ten_digit_mobile_placeholder')}
                className="pl-16 font-semibold"
                autoFocus
              />
            </div>
          </div>

          {/* 6-Digit Passcode Field */}
          <div className="login-modal__field">
            <label className="login-modal__label block text-[10px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t('six_digit_pin_label')}
            </label>
            <Input
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
              className="text-center tracking-widest text-2xl font-semibold py-3"
            />
          </div>

          {/* Touch Keypad */}
          <div className="login-modal__keypad grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handlePasscodeKey(num)}
                className="login-modal__key login-modal__key--number py-3 text-lg font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-800 dark:text-white rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-600 transition-colors active:scale-95 cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="login-modal__key login-modal__key--clear py-3 text-xs font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
            >
              {t('clear_keypad_button')}
            </button>
            <button
              type="button"
              onClick={() => handlePasscodeKey('0')}
              className="login-modal__key login-modal__key--number py-3 text-lg font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-800 dark:text-white rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-600 transition-colors active:scale-95 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="login-modal__key login-modal__key--backspace py-3 text-xs font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors cursor-pointer"
            >
              <Delete className="w-4 h-4 mx-auto" />
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
            className="login-modal__submit w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>{isLoading ? t('authenticating_text') : t('login_to_terminal_button')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
