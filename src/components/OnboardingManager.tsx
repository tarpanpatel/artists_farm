import React, { useState, useEffect } from 'react';
import { Card } from 'flowbite-react';
import {
  MessageSquare,
  Mail,
  Calendar,
  DollarSign,
  Smartphone,
  ShieldCheck,
  Save,
  Loader2,
  RefreshCw,
  Send,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Info,
} from './icons/FlowbiteIcons';
import { Button } from './Button';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { ToggleSwitch } from './ToggleSwitch';
import { useToast } from './ToastContext';
import { apiFetch, API_ROOT_BASE } from '../services/api';

interface CadenceStageConfig {
  enabled: boolean;
  day_number: number;
  stage_type: 'day_age' | 'days_left';
  title: string;
  email_subject: string;
  email_body: string;
  telegram_message: string;
}

interface SaasPricingConfig {
  base_monthly_fee: number;
  per_key_monthly_fee: number;
  trial_days: number;
  annual_discount_pct: number;
  gst_rate_pct: number;
  currency_symbol: string;
}

interface SaasPwaBranding {
  app_name: string;
  short_name: string;
  theme_color: string;
  bg_color: string;
  icon_192_url: string;
  icon_512_url: string;
}

interface SaasSupportContact {
  support_phone: string;
  support_whatsapp: string;
  support_email: string;
  grace_period_days: number;
  default_modules: string[];
}

const DEFAULT_WELCOME_WHATSAPP = `🎉 Welcome to Ground Code, {tenant_name} ji!

Your 30-Day Free Trial for *{property_name}* is now LIVE!

🔐 *Your Login Credentials:*
• Dashboard URL: {login_url}
• Username (Mobile): {username}
• Passcode: {temp_passcode}
• Trial Expiry Date: {expiry_date}

📱 *IMPORTANT: Add to Phone Home Screen*
1️⃣ Open link: {login_url}
2️⃣ iPhone: Share → 'Add to Home Screen'
3️⃣ Android: 3-Dots Menu → 'Install App' / 'Add to Home Screen'

Happy Managing!
Ground Code Support: {support_phone}`;

const DEFAULT_WELCOME_EMAIL_SUBJECT = "Welcome to Ground Code, {tenant_name}! Your 30-Day Free Trial is Live";

const DEFAULT_WELCOME_EMAIL_BODY = `Hello {tenant_name},

Welcome to Ground Code! Your 30-day full-access trial for {property_name} has been activated.

Your Login Credentials:
• Dashboard URL: {login_url}
• Username: {username}
• Temporary Passcode: {temp_passcode}
• Trial Expiration: {expiry_date}

Open your dashboard to set up your rooms, staff, and food menu:
{login_url}

Need help? Contact support at {support_phone} or reply directly to this email.`;

const DEFAULT_CADENCE_STAGES: Record<string, CadenceStageConfig> = {
  day_1_welcome: {
    enabled: true,
    day_number: 1,
    stage_type: 'day_age',
    title: 'Welcome to Ground Code — Day 1 Checklist',
    email_subject: 'Welcome to Ground Code, {tenant_name}! Day 1 Setup Checklist',
    email_body: "Hello {tenant_name},\n\nWelcome to Ground Code! Your 30-day full-access trial for {property_name} is now live.\n\nHere is your Day 1 Quickstart:\n1. Open your property dashboard ({login_url})\n2. Add your team members in Staff Management\n3. Connect Telegram to get live notifications for check-ins, food orders, and expenses\n\nNeed help getting started? Reply directly to this email or call {support_phone}.",
    telegram_message: "🏢 <b>GROUND CODE TRIAL STARTED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🎉 Welcome! Your 30-day full-access trial is active.\n👉 Finish your setup: Add staff, set room rates, and connect payment QR.",
  },
  day_3_features: {
    enabled: true,
    day_number: 3,
    stage_type: 'day_age',
    title: 'Ground Code Tip: Cash Drawer & Petty Cash',
    email_subject: 'Day 3 on Ground Code: Stop Petty Cash & Cash Leakage',
    email_body: "Hello {tenant_name},\n\nAre you tracking your daily property expenses on Ground Code yet?\n\nKey features for your first week:\n• Petty Cash Drawer: Log cash-in and cash-out with photo proof\n• Kitchen & Food POS: Instantly add meals and drinks to guest bills\n• Service Requests: Assign room cleaning and maintenance to staff\n\nLog in to explore: {login_url}",
    telegram_message: "💰 <b>GROUND CODE TIP: CASH CONTROL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📌 Track petty cash expenses and front-desk drawer balances with receipt photos.\n👉 Tap Petty Cash & Cash Drawer in your dashboard.",
  },
  day_7_milestone: {
    enabled: true,
    day_number: 7,
    stage_type: 'day_age',
    title: '1 Week on Ground Code — How is it going?',
    email_subject: '1 Week on Ground Code — Your Operations Summary',
    email_body: "Hello {tenant_name},\n\nCongratulations on completing your first week on Ground Code!\n\nCheck your Analytics Dashboard to see live metrics on occupancy, direct vs OTA revenue, and expense summaries.\n\nIf you have any questions or want a quick 10-minute walkthrough for your team, we're here to help.",
    telegram_message: "📊 <b>1-WEEK MILESTONE REACHED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n✨ You've completed 1 week on Ground Code! Check your live revenue analytics.",
  },
  day_14_halfway: {
    enabled: true,
    day_number: 14,
    stage_type: 'day_age',
    title: '14 Days Remaining in Your Trial',
    email_subject: 'Halfway through your Ground Code Trial — 14 Days Remaining',
    email_body: "Hello {tenant_name},\n\nYou are halfway through your 30-day trial of Ground Code for {property_name}.\n\nMake sure to connect your Airbnb and Booking.com iCal feeds in Settings → Calendar Sync to prevent double-bookings automatically.\n\nYour trial remains active until {expires_at}.",
    telegram_message: "⏳ <b>HALFWAY TRIAL CHECK-IN</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📅 14 days remaining in your trial (Expires: {expires_at}).\n💡 Tip: Sync your Airbnb / OTA calendars in Settings.",
  },
  day_21_renewal_plan: {
    enabled: true,
    day_number: 21,
    stage_type: 'day_age',
    title: '9 Days Left in Your Free Trial — Plan Your Subscription',
    email_subject: 'Ground Code Trial: 9 Days Left on {tenant_name}',
    email_body: "Hello {tenant_name},\n\nYour 30-day trial on Ground Code is entering its final week (ending on {expires_at}).\n\nTo ensure uninterrupted access for your staff, kitchen, and booking systems, please review your subscription options:\n• Current Plan: {plan_type}\n• Expiry Date: {expires_at}\n\nContact your account manager or reply to this email to activate regular billing.",
    telegram_message: "📋 <b>UPCOMING TRIAL RENEWAL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 9 days left on your free trial (Expires: {expires_at}).\n👉 Contact your account manager to activate subscription.",
  },
  day_23_7d_notice: {
    enabled: true,
    day_number: 23,
    stage_type: 'days_left',
    title: '⚠️ 7-Day Subscription Expiry Notice',
    email_subject: 'URGENT: Your Ground Code Subscription Expires in 7 Days ({tenant_name})',
    email_body: "Hello {tenant_name},\n\nThis is a courtesy reminder that your Ground Code subscription for {tenant_name} will expire in 7 days on {expires_at}.\n\nRenew now to avoid service interruption for your front-desk and staff.\n\nPlan: {plan_type}\nExpiry: {expires_at}",
    telegram_message: "⚠️ <b>7-DAY EXPIRATION NOTICE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🚨 Your subscription expires in 7 days on {expires_at}.\n👉 Renew to maintain uninterrupted operations.",
  },
  day_28_2d_notice: {
    enabled: true,
    day_number: 28,
    stage_type: 'days_left',
    title: '🚨 Final Notice: 48 Hours Until Subscription Expiry',
    email_subject: 'FINAL NOTICE: 48 Hours Left on Ground Code ({tenant_name})',
    email_body: "Hello {tenant_name},\n\nYour Ground Code subscription expires in 48 hours on {expires_at}.\n\nPlease renew immediately to prevent staff logout and booking synchronization pauses.\n\nContact support ({support_phone}) to complete renewal.",
    telegram_message: "🚨 <b>URGENT: 48 HOURS LEFT</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 2 days remaining until subscription expires ({expires_at}).\n👉 Action required immediately.",
  },
  day_30_expired: {
    enabled: true,
    day_number: 30,
    stage_type: 'days_left',
    title: 'Subscription Expired — Reactivate Ground Code',
    email_subject: 'Your Ground Code Subscription for {tenant_name} Has Expired',
    email_body: "Hello {tenant_name},\n\nYour Ground Code subscription for {tenant_name} expired on {expires_at}.\n\nYour property data, bookings, and guest records are safely stored. To reactivate full access for your team, please contact support to renew your subscription.\n\nThank you for using Ground Code!",
    telegram_message: "🔒 <b>SUBSCRIPTION EXPIRED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⚠️ Trial/Subscription expired on {expires_at}.\n👉 Contact support ({support_phone}) to reactivate account.",
  },
};

export const OnboardingManager: React.FC = () => {
  const getInitialOnboardingTab = (): 'welcome' | 'cadence' | 'pricing' | 'pwa' | 'support' => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('artists_farm_onboarding_tab');
      if (stored === 'welcome' || stored === 'cadence' || stored === 'pricing' || stored === 'pwa' || stored === 'support') {
        return stored;
      }
    }
    return 'welcome';
  };

  const { showToast } = useToast();
  const [activeTab, setActiveTabState] = useState<'welcome' | 'cadence' | 'pricing' | 'pwa' | 'support'>(getInitialOnboardingTab);

  const setActiveTab = (tab: 'welcome' | 'cadence' | 'pricing' | 'pwa' | 'support') => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('artists_farm_onboarding_tab', tab);
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [welcomeWhatsapp, setWelcomeWhatsapp] = useState(DEFAULT_WELCOME_WHATSAPP);
  const [welcomeEmailSubject, setWelcomeEmailSubject] = useState(DEFAULT_WELCOME_EMAIL_SUBJECT);
  const [welcomeEmailBody, setWelcomeEmailBody] = useState(DEFAULT_WELCOME_EMAIL_BODY);

  const [pricing, setPricing] = useState<SaasPricingConfig>({
    base_monthly_fee: 1499,
    per_key_monthly_fee: 50,
    trial_days: 30,
    annual_discount_pct: 20,
    gst_rate_pct: 18,
    currency_symbol: '₹',
  });

  const [cadence, setCadence] = useState<Record<string, CadenceStageConfig>>(DEFAULT_CADENCE_STAGES);
  const [expandedCadenceStage, setExpandedCadenceStage] = useState<string | null>('day_1_welcome');

  const [pwa, setPwa] = useState<SaasPwaBranding>({
    app_name: 'Ground Code',
    short_name: 'GroundCode',
    theme_color: '#2563EB',
    bg_color: '#FAFAFA',
    icon_192_url: '/app-icons/icon-source.png',
    icon_512_url: '/app-icons/icon-source.png',
  });

  const [support, setSupport] = useState<SaasSupportContact>({
    support_phone: '+91 95712 63474',
    support_whatsapp: '+91 95712 63474',
    support_email: 'support@ground-code.com',
    grace_period_days: 3,
    default_modules: ['kitchen_kds', 'food_pos', 'petty_cash', 'inventory', 'attendance', 'telegram_alerts', 'whatsapp_bills'],
  });

  // Test dispatch state
  const [selectedTestStage, setSelectedTestStage] = useState('welcome_whatsapp');
  const [testEmail, setTestEmail] = useState('');
  const [testPhone, setTestPhone] = useState('+919571263474');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ email?: string; telegram?: string; whatsapp_url?: string } | null>(null);

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_saas_platform_config`);
      const resJson = await res.json();
      if (resJson && resJson.status === 'success' && resJson.data) {
        if (resJson.data.welcome_whatsapp) setWelcomeWhatsapp(resJson.data.welcome_whatsapp);
        if (resJson.data.welcome_email_subject) setWelcomeEmailSubject(resJson.data.welcome_email_subject);
        if (resJson.data.welcome_email_body) setWelcomeEmailBody(resJson.data.welcome_email_body);
        if (resJson.data.pricing) setPricing(resJson.data.pricing);
        if (resJson.data.cadence) setCadence(resJson.data.cadence);
        if (resJson.data.pwa) setPwa(resJson.data.pwa);
        if (resJson.data.support) {
          setSupport(resJson.data.support);
          if (resJson.data.support.support_email) setTestEmail(resJson.data.support.support_email);
          if (resJson.data.support.support_phone) setTestPhone(resJson.data.support.support_phone);
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load SaaS onboarding configuration', { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = {
        welcome_whatsapp: welcomeWhatsapp,
        welcome_email_subject: welcomeEmailSubject,
        welcome_email_body: welcomeEmailBody,
        pricing,
        cadence,
        pwa,
        support,
      };

      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=save_saas_platform_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resJson = await res.json();

      if (resJson && resJson.status === 'success') {
        showToast('Onboarding & Platform settings saved successfully!', { type: 'success' });
      } else {
        throw new Error(resJson?.message || 'Failed to save settings');
      }
    } catch (err: any) {
      showToast(err.message || 'Error saving settings', { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendTest = async (channel: 'email' | 'telegram' | 'whatsapp' | 'all') => {
    if (channel === 'email' && (!testEmail || !testEmail.includes('@'))) {
      showToast('Enter a valid test email address first', { type: 'error' });
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=send_test_cadence_nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stageKey: selectedTestStage,
          testEmail,
          testPhone,
          channel,
        }),
      });
      const resJson = await res.json();

      if (resJson && resJson.status === 'success') {
        setTestResult(resJson.results);
        if (channel === 'whatsapp') {
          const waApi = resJson.results?.whatsapp_api;
          if (waApi?.status === 'success') {
            showToast(`WhatsApp sent directly via Meta Cloud API to ${testPhone}!`, { type: 'success' });
          } else {
            const reason = waApi?.message || 'Meta template approval required for outbound API';
            showToast(`API: ${reason}. Opening WhatsApp Web preview...`, { type: 'info' });
            if (resJson.results?.whatsapp_url) {
              window.open(resJson.results.whatsapp_url, '_blank');
            }
          }
        } else if (channel === 'telegram') {
          if (resJson.results?.telegram === 'sent') {
            showToast('Telegram test dispatch sent to Admin group!', { type: 'success' });
          } else {
            const tgErr = resJson.results?.telegram_error || resJson.results?.telegram_response?.description || 'Telegram bot token or group chat ID not configured in Property Settings';
            showToast(`Telegram dispatch: ${tgErr}`, { type: 'warning' });
          }
        } else if (channel === 'email') {
          showToast(`Email test sent to ${testEmail}! Check your inbox.`, { type: 'success' });
        } else {
          showToast('Test notifications processed successfully!', { type: 'success' });
        }
      } else {
        throw new Error(resJson?.message || 'Test dispatch failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Test send failed', { type: 'error' });
    } finally {
      setIsSendingTest(false);
    }
  };

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    showToast(`Copied ${tag} to clipboard`, { type: 'info' });
  };

  // Mock template substitution for live preview
  const renderPreview = (text: string) => {
    return text
      .replace(/{tenant_name}/g, 'Rahul Sharma')
      .replace(/{property_name}/g, 'Whispering Pines Resort')
      .replace(/{login_url}/g, 'https://ground-code.com/whispering-pines')
      .replace(/{username}/g, '9876543210')
      .replace(/{temp_passcode}/g, '492815')
      .replace(/{expiry_date}/g, '26 Sep 2026')
      .replace(/{expires_at}/g, '26 Sep 2026')
      .replace(/{plan_type}/g, 'Growth')
      .replace(/{days_left}/g, '30')
      .replace(/{support_phone}/g, support.support_phone);
  };

  // Pricing calculator helper
  const calc10RoomsMonthly = (pricing.base_monthly_fee + (10 * pricing.per_key_monthly_fee));
  const calc10RoomsGst = calc10RoomsMonthly * (pricing.gst_rate_pct / 100);
  const calc10RoomsTotal = calc10RoomsMonthly + calc10RoomsGst;

  const calc25RoomsAnnual = (pricing.base_monthly_fee + (25 * pricing.per_key_monthly_fee)) * 12 * (1 - (pricing.annual_discount_pct / 100));
  const calc25RoomsGst = calc25RoomsAnnual * (pricing.gst_rate_pct / 100);
  const calc25RoomsTotal = calc25RoomsAnnual + calc25RoomsGst;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading SaaS Onboarding Config...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Onboarding & SaaS Platform Manager</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Control client onboarding messages, 30-day trial cadence, subscription pricing, PWA branding, and platform defaults.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchConfig}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            leftIcon={isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          >
            {isSaving ? 'Saving...' : 'Save All Changes'}
          </Button>
        </div>
      </div>

      {/* 🧪 Live Notification Testing Station */}
      <Card className="p-4 bg-linear-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 dark:from-slate-900/90 dark:via-blue-950/20 dark:to-slate-900 border-blue-200 dark:border-blue-900/50 shadow-sm">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-md bg-blue-600 text-white shadow-xs">
                <Send className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Live Notification Testing Station
                </h3>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Select any onboarding or cadence template to dispatch a live test to your email, Telegram, or WhatsApp.
                </p>
              </div>
            </div>
            {testResult && (
              <div className="flex items-center gap-2 text-2xs font-semibold">
                {testResult.email && (
                  <span className={`px-2 py-0.5 rounded ${testResult.email === 'sent' ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 text-red-700'}`}>
                    ✉️ Email: {testResult.email}
                  </span>
                )}
                {testResult.telegram && (
                  <span className={`px-2 py-0.5 rounded ${testResult.telegram === 'sent' ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300' : 'bg-amber-100 text-amber-700'}`}>
                    ✈️ Telegram: {testResult.telegram}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end pt-1">
            <div className="md:col-span-3">
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Template to Test
              </label>
              <select
                value={selectedTestStage}
                onChange={(e) => setSelectedTestStage(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-xs rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
              >
                <optgroup label="Welcome Messaging">
                  <option value="welcome_whatsapp">💬 Welcome WhatsApp Message</option>
                  <option value="welcome_email">✉️ Welcome HTML Email</option>
                </optgroup>
                <optgroup label="30-Day Trial Cadence Stages">
                  <option value="day_1_welcome">Day 1 — Welcome & Quick Setup Checklist</option>
                  <option value="day_3_features">Day 3 — Cash Drawer & Petty Cash Control</option>
                  <option value="day_7_milestone">Day 7 — 1-Week Operations Milestone</option>
                  <option value="day_14_halfway">Day 14 — Halfway Check-in & iCal Sync</option>
                  <option value="day_21_renewal_plan">Day 21 — 9 Days Left: Subscription Plan</option>
                  <option value="day_23_7d_notice">Day 23 — ⚠️ 7-Day Expiry Notice</option>
                  <option value="day_28_2d_notice">Day 28 — 🚨 48-Hour Urgent Notice</option>
                  <option value="day_30_expired">Day 30+ — Subscription Expired Notice</option>
                </optgroup>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Test Recipient Email
              </label>
              <input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="admin@ground-code.com"
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-xs rounded-lg p-2 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-2xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Test WhatsApp Number
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="9571263474"
                className="w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-300 dark:border-slate-700 text-xs rounded-lg p-2 focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>

            <div className="md:col-span-4 flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleSendTest('email')}
                disabled={isSendingTest}
                className="flex-1 px-2"
                leftIcon={isSendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              >
                Send Email
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSendTest('telegram')}
                disabled={isSendingTest}
                className="flex-1 px-2"
                leftIcon={<Send className="w-3.5 h-3.5 text-blue-500" />}
              >
                Send Telegram
              </Button>

              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSendTest('whatsapp')}
                disabled={isSendingTest}
                className="flex-1 px-2"
                leftIcon={<MessageSquare className="w-3.5 h-3.5 text-emerald-500" />}
              >
                Test WhatsApp
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs Navigation */}
      <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 gap-2 pb-px">
        <button
          onClick={() => setActiveTab('welcome')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'welcome'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Welcome Messaging
        </button>

        <button
          onClick={() => setActiveTab('cadence')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'cadence'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          30-Day Trial Cadence
        </button>

        <button
          onClick={() => setActiveTab('pricing')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'pricing'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Pricing & Per-Key Billing
        </button>

        <button
          onClick={() => setActiveTab('pwa')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'pwa'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          PWA & App Branding
        </button>

        <button
          onClick={() => setActiveTab('support')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-lg transition-colors border-b-2 whitespace-nowrap cursor-pointer ${
            activeTab === 'support'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Support & Defaults
        </button>
      </div>

      {/* Available Variables Helper Banner */}
      <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-blue-600" /> Click to copy dynamic tags:
        </span>
        {['{tenant_name}', '{property_name}', '{username}', '{temp_passcode}', '{login_url}', '{expiry_date}', '{days_left}', '{support_phone}'].map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => copyTag(tag)}
            className="px-2 py-0.5 font-mono text-2xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-50 dark:hover:bg-blue-950/50 cursor-pointer"
          >
            {tag}
          </button>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: WELCOME MESSAGING */}
      {/* ========================================================================= */}
      {activeTab === 'welcome' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Editor column */}
            <div className="space-y-4">
              <Card className="p-4 border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                      <MessageSquare className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">WhatsApp Welcome Message</h3>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <Textarea
                    label="WhatsApp Message Body"
                    rows={10}
                    value={welcomeWhatsapp}
                    onChange={(e) => setWelcomeWhatsapp(e.target.value)}
                    helperText="Sent automatically upon self-registration and shared via the 'Share via WhatsApp' button in Add Property."
                  />
                </div>
              </Card>

              <Card className="p-4 border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Welcome Email Template</h3>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <Input
                    label="Email Subject Line"
                    value={welcomeEmailSubject}
                    onChange={(e) => setWelcomeEmailSubject(e.target.value)}
                  />
                  <Textarea
                    label="Email Content Body"
                    rows={8}
                    value={welcomeEmailBody}
                    onChange={(e) => setWelcomeEmailBody(e.target.value)}
                    helperText="Sent to the owner's email address when their 30-day trial is created."
                  />
                </div>
              </Card>
            </div>

            {/* Live Previews column */}
            <div className="space-y-4">
              {/* WhatsApp Mockup */}
              <Card className="p-4 border-slate-200 dark:border-slate-800 bg-[#EFEAE2] dark:bg-slate-900">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-300 dark:border-slate-800">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Live WhatsApp Preview</span>
                </div>
                <div className="mt-3 p-3.5 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 max-w-sm ml-auto">
                  <p className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-line leading-relaxed font-sans">
                    {renderPreview(welcomeWhatsapp)}
                  </p>
                  <div className="text-[10px] text-slate-400 text-right mt-1.5">10:42 AM ✓✓</div>
                </div>
              </Card>

              {/* Email Mockup */}
              <Card className="p-4 border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Live Email Preview</span>
                </div>
                <div className="mt-3 p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-2 mb-3">
                    <span className="text-2xs text-slate-400 uppercase font-semibold">Subject:</span>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mt-0.5">
                      {renderPreview(welcomeEmailSubject)}
                    </h4>
                  </div>
                  <div className="p-3 border-l-2 border-blue-600 bg-slate-50 dark:bg-slate-800/40 rounded-r text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                    {renderPreview(welcomeEmailBody)}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 30-DAY TRIAL CADENCE */}
      {/* ========================================================================= */}
      {activeTab === 'cadence' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-blue-900 dark:text-blue-300">Automated 30-Day Follow-Up & Renewal Pipeline</h3>
              <p className="text-2xs text-blue-700 dark:text-blue-400 mt-0.5">
                The background cron engine runs daily at 08:00 to send guidance, feature tips, and renewal warnings based on trial age and days remaining.
              </p>
            </div>

            {/* Test Send Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="email"
                placeholder="test-email@domain.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="text-xs h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white w-48"
              />
            </div>
          </div>

          {/* Cadence Stages Accordion */}
          <div className="space-y-3">
            {Object.entries(cadence).map(([stageKey, stage]) => {
              const isExpanded = expandedCadenceStage === stageKey;
              return (
                <div
                  key={stageKey}
                  className={`border rounded-lg transition-all ${
                    stage.enabled
                      ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 opacity-70'
                  }`}
                >
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ToggleSwitch
                        enabled={stage.enabled}
                        onChange={(checked) => {
                          setCadence((prev) => ({
                            ...prev,
                            [stageKey]: { ...prev[stageKey], enabled: checked },
                          }));
                        }}
                      />
                      <div
                        className="cursor-pointer min-w-0 flex-1"
                        onClick={() => setExpandedCadenceStage(isExpanded ? null : stageKey)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {stage.title}
                          </span>
                          <span className="px-2 py-0.5 text-2xs font-semibold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {stage.stage_type === 'day_age' ? `Day ${stage.day_number}` : `${30 - stage.day_number} Days Remaining`}
                          </span>
                        </div>
                        <p className="text-2xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {stage.email_subject}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          setSelectedTestStage(stageKey);
                          handleSendTest('email');
                        }}
                        disabled={isSendingTest}
                        leftIcon={<Send className="w-3 h-3 text-blue-600" />}
                      >
                        Test Send
                      </Button>
                      <button
                        type="button"
                        onClick={() => setExpandedCadenceStage(isExpanded ? null : stageKey)}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Stage Form */}
                  {isExpanded && (
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-950/20">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                          label="Stage Display Title"
                          value={stage.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCadence((prev) => ({
                              ...prev,
                              [stageKey]: { ...prev[stageKey], title: val },
                            }));
                          }}
                        />
                        <Input
                          label="Email Subject"
                          value={stage.email_subject}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCadence((prev) => ({
                              ...prev,
                              [stageKey]: { ...prev[stageKey], email_subject: val },
                            }));
                          }}
                        />
                      </div>

                      <Textarea
                        label="Email Body Content"
                        rows={4}
                        value={stage.email_body}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCadence((prev) => ({
                            ...prev,
                            [stageKey]: { ...prev[stageKey], email_body: val },
                          }));
                        }}
                      />

                      <Textarea
                        label="Telegram Notification Content (HTML formatted)"
                        rows={3}
                        value={stage.telegram_message}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCadence((prev) => ({
                            ...prev,
                            [stageKey]: { ...prev[stageKey], telegram_message: val },
                          }));
                        }}
                        helperText="Sent to property owner's Telegram channel if connected."
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PRICING & PER-KEY BILLING */}
      {/* ========================================================================= */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4 border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Subscription Rate Card Settings</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  type="number"
                  min={0}
                  label="Base Monthly Tariff (₹)"
                  value={pricing.base_monthly_fee}
                  onChange={(e) => setPricing({ ...pricing, base_monthly_fee: Number(e.target.value) })}
                  helperText="Fixed monthly base fee for the SaaS."
                />
                <Input
                  type="number"
                  min={0}
                  label="Per-Key / Per-Room Fee (₹/mo)"
                  value={pricing.per_key_monthly_fee}
                  onChange={(e) => setPricing({ ...pricing, per_key_monthly_fee: Number(e.target.value) })}
                  helperText="Additional fee per room/key per month."
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Input
                  type="number"
                  min={7}
                  max={90}
                  label="Default Trial (Days)"
                  value={pricing.trial_days}
                  onChange={(e) => setPricing({ ...pricing, trial_days: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  max={50}
                  label="Annual Discount (%)"
                  value={pricing.annual_discount_pct}
                  onChange={(e) => setPricing({ ...pricing, annual_discount_pct: Number(e.target.value) })}
                />
                <Input
                  type="number"
                  min={0}
                  max={28}
                  label="GST Rate (%)"
                  value={pricing.gst_rate_pct}
                  onChange={(e) => setPricing({ ...pricing, gst_rate_pct: Number(e.target.value) })}
                />
              </div>
            </Card>

            {/* Live Pricing Simulator Card */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live Client Billing Simulator</h3>
                <span className="text-2xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 rounded">
                  GST {pricing.gst_rate_pct}% Applicable
                </span>
              </div>

              {/* 10-Room Property Breakdown */}
              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">10-Room Resort (Monthly Billing)</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{calc10RoomsTotal.toLocaleString('en-IN')}/mo
                  </span>
                </div>
                <div className="text-2xs text-slate-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Base Fee:</span>
                    <span>₹{pricing.base_monthly_fee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>10 Keys @ ₹{pricing.per_key_monthly_fee}/key:</span>
                    <span>₹{10 * pricing.per_key_monthly_fee}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>GST ({pricing.gst_rate_pct}%):</span>
                    <span>₹{calc10RoomsGst.toFixed(0)}</span>
                  </div>
                </div>
              </div>

              {/* 25-Room Property Annual Breakdown */}
              <div className="p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">25-Room Resort (Annual with {pricing.annual_discount_pct}% Off)</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    ₹{calc25RoomsTotal.toLocaleString('en-IN')}/yr
                  </span>
                </div>
                <div className="text-2xs text-slate-500 space-y-0.5">
                  <div className="flex justify-between">
                    <span>Monthly Rate:</span>
                    <span>₹{pricing.base_monthly_fee + (25 * pricing.per_key_monthly_fee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Annual Discount ({pricing.annual_discount_pct}% off):</span>
                    <span>-₹{((pricing.base_monthly_fee + (25 * pricing.per_key_monthly_fee)) * 12 * (pricing.annual_discount_pct / 100)).toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total with GST:</span>
                    <span>₹{calc25RoomsTotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PWA & APP BRANDING */}
      {/* ========================================================================= */}
      {activeTab === 'pwa' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4 border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Smartphone className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">PWA Mobile App Customization</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="PWA App Name"
                  value={pwa.app_name}
                  onChange={(e) => setPwa({ ...pwa, app_name: e.target.value })}
                  placeholder="Ground Code"
                />
                <Input
                  label="Short Name (Homescreen)"
                  value={pwa.short_name}
                  onChange={(e) => setPwa({ ...pwa, short_name: e.target.value })}
                  placeholder="GroundCode"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Theme Color (Hex)"
                    value={pwa.theme_color}
                    onChange={(e) => setPwa({ ...pwa, theme_color: e.target.value })}
                    placeholder="#2563EB"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 shadow-inner shrink-0" style={{ backgroundColor: pwa.theme_color }} />
                    <span className="text-2xs text-slate-500">Matches mobile status bar</span>
                  </div>
                </div>

                <div>
                  <Input
                    label="Background Color (Hex)"
                    value={pwa.bg_color}
                    onChange={(e) => setPwa({ ...pwa, bg_color: e.target.value })}
                    placeholder="#FAFAFA"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-6 h-6 rounded border border-slate-300 dark:border-slate-700 shadow-inner shrink-0" style={{ backgroundColor: pwa.bg_color }} />
                    <span className="text-2xs text-slate-500">Splash background</span>
                  </div>
                </div>
              </div>

              <Input
                label="App Icon URL (192x192 / 512x512)"
                value={pwa.icon_192_url}
                onChange={(e) => setPwa({ ...pwa, icon_192_url: e.target.value, icon_512_url: e.target.value })}
                placeholder="/app-icons/icon-source.png"
                helperText="Path to the PNG icon served when clients tap 'Add to Home Screen'."
              />
            </Card>

            {/* PWA Phone Screen Mockup */}
            <Card className="p-4 border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-900">
              <div className="w-64 h-96 rounded-3xl border-4 border-slate-800 dark:border-slate-700 bg-white dark:bg-slate-950 p-4 shadow-xl flex flex-col justify-between relative overflow-hidden">
                {/* Notch */}
                <div className="w-24 h-4 bg-slate-800 rounded-full mx-auto" />

                {/* Home Screen Icons Grid */}
                <div className="flex flex-col items-center justify-center gap-3 my-auto">
                  <div className="relative group">
                    <img
                      src={pwa.icon_192_url || '/app-icons/icon-source.png'}
                      alt="PWA Icon"
                      className="w-16 h-16 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/app-icons/icon-source.png';
                      }}
                    />
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white font-bold">
                      ★
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{pwa.short_name || 'GroundCode'}</p>
                    <p className="text-[10px] text-slate-400">PWA Installed App</p>
                  </div>
                </div>

                {/* Bottom navigation bar indicator */}
                <div className="w-20 h-1 bg-slate-400 dark:bg-slate-600 rounded-full mx-auto" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: SUPPORT & PLATFORM DEFAULTS */}
      {/* ========================================================================= */}
      {activeTab === 'support' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4 border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Support & Contact Channels</h3>
              </div>

              <Input
                label="Support Helpline Phone"
                value={support.support_phone}
                onChange={(e) => setSupport({ ...support, support_phone: e.target.value })}
                placeholder="+91 95712 63474"
              />

              <Input
                label="Support WhatsApp Number"
                value={support.support_whatsapp}
                onChange={(e) => setSupport({ ...support, support_whatsapp: e.target.value })}
                placeholder="+91 95712 63474"
              />

              <Input
                type="email"
                label="Support Email Address"
                value={support.support_email}
                onChange={(e) => setSupport({ ...support, support_email: e.target.value })}
                placeholder="support@ground-code.com"
              />

              <Input
                type="number"
                min={0}
                max={30}
                label="Grace Period After Expiry (Days)"
                value={support.grace_period_days}
                onChange={(e) => setSupport({ ...support, grace_period_days: Number(e.target.value) })}
                helperText="Days of buffer access granted to properties after subscription expires before hard logout."
              />
            </Card>

            <Card className="p-4 border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <Sparkles className="w-5 h-5 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Default Enabled Modules for New Trials</h3>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'kitchen_kds', label: 'Kitchen KDS & Food POS', desc: 'Manage kitchen tickets, walk-in dining, and room service meals.' },
                  { key: 'petty_cash', label: 'Petty Cash & Cash Drawer', desc: 'Front-desk cash receipts, daily expenses, and staff advances.' },
                  { key: 'inventory', label: 'Material & Stock Inventory', desc: 'Low stock alerts, items catalog, and purchase tracking.' },
                  { key: 'attendance', label: 'Staff Roster & Attendance', desc: 'Staff duty shifts, attendance logs, and UPI payouts.' },
                  { key: 'telegram_alerts', label: 'Telegram Notifications', desc: 'Instant push alerts for check-ins, check-outs, and orders.' },
                  { key: 'whatsapp_bills', label: 'WhatsApp Invoicing & Vouchers', desc: 'One-click guest folios and payment QR sharing over WhatsApp.' },
                ].map((mod) => {
                  const isChecked = support.default_modules.includes(mod.key);
                  return (
                    <div key={mod.key} className="flex items-start justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
                      <div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{mod.label}</p>
                        <p className="text-2xs text-slate-500 dark:text-slate-400">{mod.desc}</p>
                      </div>
                      <ToggleSwitch
                        enabled={isChecked}
                        onChange={(checked) => {
                          const updated = checked
                            ? [...support.default_modules, mod.key]
                            : support.default_modules.filter((m) => m !== mod.key);
                          setSupport({ ...support, default_modules: updated });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};
