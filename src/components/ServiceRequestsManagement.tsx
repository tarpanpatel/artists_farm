import React, { useState, useEffect } from 'react';
import { Bell, Plus, CheckCircle2, Clock, X, Home } from 'lucide-react';
import {
  ServiceRequest,
  fetchServiceRequestsFromDB,
  createServiceRequestInDB,
  fulfillServiceRequestInDB,
  updateServiceRequestReminderTimestamp,
  checkStaleServiceRequests,
  resolveTelegramTemplate,
  getPropertySlug,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { t } from '../i18n/en';

interface Room {
  id: number;
  name: string;
}

interface ServiceRequestsManagementProps {
  rooms?: Room[];
  isMultiKeyProperty?: boolean;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
}

const QUICK_PICK_TYPES = ['Fresh Towels', 'Housekeeping', 'Maintenance', 'Extra Amenities', 'Other'];

// Reminder cadence for still-unfulfilled requests - same shared nudge engine
// shape as KitchenManagement's stale-order poll (php/kitchen/orders.php's
// check_stale_reminders), mirrored here for service requests.
const REMINDER_THRESHOLD_MINUTES = 15;

export const ServiceRequestsManagement: React.FC<ServiceRequestsManagementProps> = ({
  rooms = [],
  isMultiKeyProperty = false,
  onDispatchTelegram,
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newRequestType, setNewRequestType] = useState(QUICK_PICK_TYPES[0]);
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<number | null>(null);

  const getCurrentUserName = () => {
    if (currentUser?.name) return currentUser.name;
    if (currentUser?.username) return currentUser.username;
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`artists_farm_user_${getPropertySlug()}`);
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          return user.name || user.username || 'Staff';
        } catch (e) {}
      }
    }
    return 'Staff';
  };

  const loadRequests = async () => {
    setLoading(true);
    const data = await fetchServiceRequestsFromDB();
    setRequests(data);
    setLoading(false);
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const ok = await createServiceRequestInDB({
      room_id: newRoomId ? Number(newRoomId) : null,
      request_type: newRequestType,
      description: newDescription.trim(),
      requested_by: getCurrentUserName(),
    });
    setSaving(false);
    if (ok) {
      showToast('Service request logged', { type: 'success' });
      setIsAddModalOpen(false);
      setNewRoomId('');
      setNewRequestType(QUICK_PICK_TYPES[0]);
      setNewDescription('');
      loadRequests();
    } else {
      showToast('Failed to log service request', { type: 'error' });
    }
  };

  const handleFulfill = async (id: number) => {
    setFulfillingId(id);
    const ok = await fulfillServiceRequestInDB(id, getCurrentUserName());
    setFulfillingId(null);
    if (ok) {
      showToast('Marked fulfilled', { type: 'success' });
      loadRequests();
    } else {
      showToast('Failed to update request', { type: 'error' });
    }
  };

  // Auto-nudge follow-up for requests left unfulfilled too long - same shared
  // nudge engine pattern as KitchenManagement's stale-order poll.
  useEffect(() => {
    const pollStale = async () => {
      const stale = await checkStaleServiceRequests(REMINDER_THRESHOLD_MINUTES);
      for (const item of stale) {
        const reminderVars: Record<string, string> = {
          request_type: item.request_type,
          room_name: item.room_name,
          description: item.description || '(none)',
          requested_by: item.requested_by,
        };
        const resolved = await resolveTelegramTemplate('service_request_created', reminderVars);
        const fallbackMsg = `⏰ <b>SERVICE REQUEST STILL PENDING</b>\n━━━━━━━━━━━━━━━━━━\n🧾 <b>Type:</b> ${item.request_type}\n🚪 <b>Room:</b> ${item.room_name}\n⏱️ <b>Pending for:</b> ${item.elapsed_minutes} min\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Auto-reminder — please action or mark fulfilled.</i>`;
        const replyMarkup = { inline_keyboard: [[{ text: '✅ Mark Fulfilled', callback_data: `fulfill_request_${item.id}` }]] };
        onDispatchTelegram?.('Service Request Reminder (Auto)', resolved || fallbackMsg, 'admin', replyMarkup, 'service_request_created');
        updateServiceRequestReminderTimestamp(item.id);
      }
    };
    const interval = setInterval(pollStale, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pending = requests.filter((r) => r.status === 'Pending');
  const fulfilled = requests.filter((r) => r.status === 'Fulfilled');

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-indigo-500" />
              {t('guest_service_requests_heading', 'Guest Service Requests')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('service_requests_description', 'Housekeeping, maintenance, and other ad-hoc requests — logged by any staff member, nudged to Admin on Telegram.')}
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('new_request_button', 'New Request')}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">{t('loading_spinner_default_message', 'Loading...')}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">{t('no_service_requests_label', 'No service requests logged yet.')}</div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Pending ({pending.length})</h3>
                <div className="space-y-2">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 dark:text-white text-sm">{r.requestType}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        {r.description && <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{r.description}</p>}
                        <p className="text-[11px] text-gray-400 mt-0.5">Requested by {r.requestedBy} · {r.createdAt}</p>
                      </div>
                      <button
                        onClick={() => handleFulfill(r.id)}
                        disabled={fulfillingId === r.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {fulfillingId === r.id ? t('updating_button', 'Updating...') : t('mark_fulfilled_button', 'Mark Fulfilled')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fulfilled.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Fulfilled ({fulfilled.length})</h3>
                <div className="space-y-2">
                  {fulfilled.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl opacity-75">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 dark:text-white text-sm">{r.requestType}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Fulfilled by {r.fulfilledBy} · {r.fulfilledAt}
                        </p>
                      </div>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-xs font-bold shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t('done_badge', 'Done')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                {t('new_service_request_heading', 'New Service Request')}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {isMultiKeyProperty && rooms.length > 0 && (
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t('room_field_label', 'Room')}</label>
                  <StyledSelect
                    value={newRoomId}
                    onChange={setNewRoomId}
                    placeholder={t('select_room_optional_placeholder', '-- Select Room (optional) --')}
                    options={rooms.map((room) => ({ value: String(room.id), label: room.name }))}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t('request_type_label', 'Request Type')}</label>
                <StyledSelect
                  value={newRequestType}
                  onChange={setNewRequestType}
                  options={QUICK_PICK_TYPES.map((t) => ({ value: t, label: t }))}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">{t('details_optional_label', 'Details (optional)')}</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('service_request_details_placeholder', 'e.g. 2 extra towels, AC not cooling...')}
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-white transition-colors cursor-pointer">
                  {t('cancel_button', 'Cancel')}
                </button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition-colors cursor-pointer disabled:opacity-50">
                  {saving ? t('logging_button', 'Logging...') : t('log_request_button', 'Log Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
