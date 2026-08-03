import React, { useState } from 'react';
import { X, Database, Loader, CheckCircle, AlertCircle, BarChart3, Check, Lightbulb, Calendar, Sparkles } from 'lucide-react';
import { useConfirm } from './ConfirmDialogContext';

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

  const generateDemoData = async () => {
    if (!propertyId) {
      setMessage({ type: 'error', text: 'Property ID not found' });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/php/api/demo_data.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', property_id: propertyId }),
        credentials: 'include',
      });

      const data = await response.json();
      if (data.status === 'success') {
        setHasGeneratedDemo(true);
        setMessage({ type: 'success', text: '✅ Demo data generated! Refresh to see changes.' });
        setTimeout(() => window.location.reload(), 1500);
      } else {
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
      console.log('[DemoDataModal] Clearing demo data for property:', propertyId);
      const response = await fetch('/php/api/demo_data.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', property_id: propertyId }),
        credentials: 'include',
      });

      console.log('[DemoDataModal] API Response status:', response.status);
      const data = await response.json();
      console.log('[DemoDataModal] API Response data:', data);

      if (data.status === 'success') {
        setMessage({ type: 'success', text: '✅ Test mode exited! Closing...' });
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1000);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to exit test mode' });
      }
    } catch (err) {
      console.error('[DemoDataModal] Error exiting test mode:', err);
      setMessage({ type: 'error', text: `Error exiting test mode: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setLoading(false);
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
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Test Data Center</h2>
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
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Demo Tab */}
          {activeTab === 'demo' && (
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                <h3 className="font-bold text-blue-900 dark:text-blue-100 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  <span>Sample Data Included:</span>
                </h3>
                <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>4 Demo Users (Manager, Chef, Housekeeping, Reception)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>1-2 Demo Guests (Active bookings, one per room)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>13 Menu Items (Breakfast, Main, Beverage, Snacks, Desserts)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>6 Inventory Items (Stock with low-stock alerts)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>4 Petty Cash Entries (Various expense types)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>System Audit Logs (Activity records)</span>
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm text-amber-800 dark:text-amber-200 flex items-start gap-2">
                  <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
                  <span><strong>Tip:</strong> Generate demo data to test all features without manual entry. Each generation refreshes the data.</span>
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

              <div className="flex gap-3">
                <button
                  onClick={generateDemoData}
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      {hasGeneratedDemo ? 'Refresh Demo Data' : 'Generate Demo Data'}
                    </>
                  )}
                </button>
                <button
                  onClick={clearDemoData}
                  disabled={loading}
                  className="flex-1 bg-red-100 dark:bg-red-950/30 hover:bg-red-200 dark:hover:bg-red-950/50 disabled:bg-slate-300 text-red-700 dark:text-red-400 font-bold py-3 px-4 rounded-lg transition-colors"
                >
                  {loading ? 'Exiting...' : 'Exit Test Mode'}
                </button>
              </div>
            </div>
          )}

          {/* Current Tab */}
          {activeTab === 'current' && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-6 text-center space-y-3">
                <p className="text-slate-600 dark:text-slate-400 text-lg flex items-center justify-center gap-2">
                  <Calendar className="w-5 h-5" />
                  <span>Today's Data</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Shows all current bookings, active guests, today's food orders, and real-time system activity.
                </p>
                <button
                  onClick={onClose}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  View Current Data
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
                  <span>Upcoming Data</span>
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Shows future bookings, upcoming reservations, and scheduled events.
                </p>
                <button
                  onClick={onClose}
                  className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                >
                  View Future Data
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
