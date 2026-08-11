import React, { useState } from 'react';
import { Lock, Phone, KeyRound, ShieldAlert, ArrowRight } from 'lucide-react';
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
      const response = await fetch('/artists_farm/php/api/authenticate.php', {
        method: 'POST',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-6 text-white text-center relative">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-white/10 backdrop-blur-sm flex items-center justify-center ring-4 ring-white/20">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black tracking-tight uppercase">{t('login_modal_brand')}</h2>
          <p className="text-xs text-emerald-100 mt-1 font-medium">{t('terminal_authorization_subtitle')}</p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Mobile Number Field */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Phone className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> {t('mobile_number_label')}
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400 dark:text-slate-500 z-10">
                <span className="text-xs font-bold border-r border-slate-300 dark:border-slate-600 pr-2">+91</span>
              </div>
              <Input
                type="text"
                value={mobileNumber}
                onChange={handleMobileChange}
                placeholder={t('ten_digit_mobile_placeholder')}
                className="pl-16 font-semibold"
                autoFocus
              />
            </div>
          </div>

          {/* 6-Digit Passcode Field */}
          <div>
            <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
              className="text-center tracking-widest text-2xl font-black py-3"
            />
          </div>

          {/* Touch Keypad */}
          <div className="grid grid-cols-3 gap-2 pt-1">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handlePasscodeKey(num)}
                className="py-3 text-lg font-bold bg-slate-100 dark:bg-slate-700/70 text-slate-800 dark:text-white rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-600 transition-colors active:scale-95 cursor-pointer"
              >
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={handleClear}
              className="py-3 text-xs font-bold bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 transition-colors cursor-pointer"
            >
              {t('clear_keypad_button')}
            </button>
            <button
              type="button"
              onClick={() => handlePasscodeKey('0')}
              className="py-3 text-lg font-bold bg-slate-100 dark:bg-slate-700/70 text-slate-800 dark:text-white rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-600 transition-colors active:scale-95 cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="py-3 text-xs font-bold bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/30 hover:text-amber-600 transition-colors cursor-pointer"
            >
              ⌫
            </button>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || mobileNumber.length === 0 || passcode.length === 0}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
          >
            <span>{isLoading ? t('authenticating_text') : t('login_to_terminal_button')}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
