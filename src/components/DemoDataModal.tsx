import React, { useState, useEffect } from 'react';
import { X, Database, Loader2, CheckCircle, AlertCircle, BarChart3, Check, Lightbulb, Calendar, Sparkles } from 'lucide-react';
import { useConfirm } from './ConfirmDialogContext';
import { setTestingModeState } from '../services/api';
import { t } from '../i18n/en';

interface DemoDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyId?: number;
}

export const DemoDataModal: React.FC<DemoDataModalProps> = ({ isOpen, onClose, propertyId }) => {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'demo' | 'current' | 'future'>('demo');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasGeneratedDemo, setHasGeneratedDemo] = useState(false);
  const [dummyHistoryEnabled, setDummyHistoryEnabled] = useState(false);
  const [dummyHistoryLoading, setDummyHistoryLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !propertyId) return;
    let cancelled = false;
    setDummyHistoryLoading(true);
    fetch(`/php/api/dummy_history.php?action=get_dummy_history_status&property_id=${propertyId}`)
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data.status === 'success') {
          setDummyHistoryEnabled(data.data.enabled);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDummyHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, propertyId]);

  const generateDemoData = async () => {
    if (!propertyId) {
      setMessage({ type: 'error', text: 'Property ID not found' });
      return;
    }

    setLoading(true);
    try {
      setTestingModeState(true);

      const response = await fetch('/php/api/demo_data.php', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Testing-Mode': '1'
        },
        body: JSON.stringify({ action: 'generate', property_id: propertyId }),
        credentials: 'include',
      });

      const data = await response.json();
      if (data.status === 'success') {
        setTestingModeState(true);
        setHasGeneratedDemo(true);
        setMessage({ type: 'success', text: 'Demo data generated! Refreshing...' });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setTestingModeState(false);
        setMessage({ type: 'error', text: data.message || 'Failed to generate demo data' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error generating demo data' });
    } finally {
      setLoading(false);
    }
  };

  const clearDemoData = async () => {
    if (!propertyId) {
      setMessage({ type: 'error', text: 'Property ID not found' });
      return;
    }

    const confirmed = await confirm({
      title: 'Exit Test Mode',
      message: 'Exit test mode? This will clear all demo data.',
      confirmText: 'Exit Test Mode',
      variant: 'danger',
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await fetch('/php/api/demo_data.php', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Testing-Mode': '1'
        },
        body: JSON.stringify({ action: 'clear', property_id: propertyId }),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.status === 'success') {
        setTestingModeState(false);
        setMessage({ type: 'success', text: 'Test mode exited! Closing...' });
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to exit test mode' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: `Error exiting test mode: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setLoading(false);
    }
  };

  const enableDummyHistory = async () => {
    if (!propertyId) return;
    setDummyHistoryLoading(true);
    try {
      const response = await fetch(`/php/api/dummy_history.php?action=enable_dummy_history&property_id=${propertyId}`);
      const data = await response.json();
      if (data.status === 'success') {
        setDummyHistoryEnabled(true);
        setMessage({ type: 'success', text: 'Dummy history mode enabled' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to enable dummy history' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error enabling dummy history' });
    } finally {
      setDummyHistoryLoading(false);
    }
  };

  const disableDummyHistory = async () => {
    if (!propertyId) return;
    setDummyHistoryLoading(true);
    try {
      const response = await fetch(`/php/api/dummy_history.php?action=disable_dummy_history&property_id=${propertyId}`);
      const data = await response.json();
      if (data.status === 'success') {
        setDummyHistoryEnabled(false);
        setMessage({ type: 'success', text: 'Dummy history mode disabled' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to disable dummy history' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error disabling dummy history' });
    } finally {
      setDummyHistoryLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('test_data_center_heading')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 dark:border-slate-700 px-6 pt-4">
          {(['demo', 'current', 'future'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 px-2 font-semibold capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'demo' ? t('demo_tab_label') : tab === 'current' ? t('current_tab_label') : t('future_tab_label')}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Dummy History Banner */}
          {dummyHistoryEnabled && (
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
              <p className="text-sm text-purple-800 dark:text-purple-200 font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                {t('dummy_history_active_banner')}
              </p>
            </div>
          )}

          {/* Demo Tab */}
          {activeTab === 'demo' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                <h3 className="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  <span>{t('sample_data_heading')}</span>
                </h3>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_users_list_item')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_guests_list_item')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_menu_items_list_item')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_inventory_items_list_item')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_petty_cash_list_item')}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>{t('demo_audit_logs_list_item')}</span>
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span><strong>Tip:</strong> {t('demo_tip_text')}</span>
                </p>
              </div>

              {message && (
                <div
                  className={`flex items-center gap-3 p-4 rounded-lg ${
                    message.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200'
                      : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-200'
                  }`}
                >
                  {message.type === 'success' ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium">{message.text}</span>
                </div>
              )}

              <div className="space-y-3">
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">{t('dummy_history_mode_heading')}</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{t('dummy_history_mode_description')}</p>
                  <button
                    onClick={dummyHistoryEnabled ? disableDummyHistory : enableDummyHistory}
                    disabled={dummyHistoryLoading || loading}
                    className={`w-full font-bold py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${
                      dummyHistoryEnabled
                        ? 'bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 text-red-700 dark:text-red-400'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    {dummyHistoryLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {dummyHistoryEnabled ? t('disable_dummy_history_button') : t('enable_dummy_history_button')}
                      </>
                    ) : (
                      dummyHistoryEnabled ? t('disable_dummy_history_button') : t('enable_dummy_history_button')
                    )}
                  </button>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={generateDemoData}
                    disabled={loading || dummyHistoryLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                        {loading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            {t('generating_text')}
                          </>
                        ) : (
                          <>
                            <Database className="w-4 h-4" />
                            {hasGeneratedDemo ? t('refresh_demo_data_button') : t('generate_demo_data_button')}
                          </>
                        )}
                  </button>
                  <button
                    onClick={clearDemoData}
                    disabled={loading || dummyHistoryLoading}
                    className="flex-1 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 disabled:bg-slate-300 text-red-700 dark:text-red-400 font-bold py-3 px-4 rounded-lg transition-colors"
                  >
                    {loading ? t('exiting_text') : t('exit_test_mode_button')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Current Tab */}
          {activeTab === 'current' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-6 text-center space-y-3">
                <p className="text-slate-600 dark:text-slate-400 text-lg flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>{t('todays_data_heading')}</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('todays_data_description')}
                </p>
                <button
                  onClick={onClose}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  {t('view_current_data_button')}
                </button>
              </div>
            </div>
          )}

          {/* Future Tab */}
          {activeTab === 'future' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-6 text-center space-y-3">
                <p className="text-slate-600 dark:text-slate-400 text-lg flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  <span>{t('upcoming_data_heading')}</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('upcoming_data_description')}
                </p>
                <button
                  onClick={onClose}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  {t('view_future_data_button')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
