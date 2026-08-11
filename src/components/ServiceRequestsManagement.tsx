import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Clock, X, Home } from 'lucide-react';
import {
  ServiceRequest,
  ServiceRequestType,
  fetchServiceRequestsFromDB,
  createServiceRequestInDB,
  fulfillServiceRequestInDB,
  updateServiceRequestReminderTimestamp,
  checkStaleServiceRequests,
  fetchServiceRequestTypesFromDB,
  resolveTelegramTemplate,
  getPropertySlug,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastContext';
import { StyledSelect } from './StyledSelect';
import { Textarea } from './Textarea';
import { t } from '../i18n/en';
import { Button } from './Button';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';

interface Room {
  id: number;
  name: string;
}

interface ServiceRequestsManagementProps {
  rooms?: Room[];
  isMultiKeyProperty?: boolean;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
}

const DEFAULT_SERVICE_REQUEST_TYPES = [
  { type_id: 'fresh_towels', category: 'Housekeeping', label: 'Fresh Towels' },
  { type_id: 'extra_bedding', category: 'Housekeeping', label: 'Extra Bedding / Pillows' },
  { type_id: 'toiletries_refill', category: 'Housekeeping', label: 'Toiletries Refill' },
  { type_id: 'room_cleaning', category: 'Housekeeping', label: 'Room Cleaning' },
  { type_id: 'trash_pickup', category: 'Housekeeping', label: 'Trash Pickup' },
  { type_id: 'drinking_water', category: 'Food & Beverage', label: 'Drinking Water / Ice' },
  { type_id: 'tea_coffee_replenish', category: 'Food & Beverage', label: 'Tea / Coffee Sachets' },
  { type_id: 'crockery_cutlery', category: 'Food & Beverage', label: 'Crockery / Cutlery' },
  { type_id: 'room_service_order', category: 'Food & Beverage', label: 'In-Room Dining Request' },
  { type_id: 'ac_heating_issue', category: 'Maintenance', label: 'AC / Heating Issue' },
  { type_id: 'hot_water_geyser', category: 'Maintenance', label: 'Hot Water / Geyser Issue' },
  { type_id: 'wifi_connectivity', category: 'Maintenance', label: 'Wi-Fi / Internet Issue' },
  { type_id: 'tv_cable_issue', category: 'Maintenance', label: 'TV / Cable Issue' },
  { type_id: 'plumbing_leakage', category: 'Maintenance', label: 'Plumbing / Leakage' },
  { type_id: 'electrical_power', category: 'Maintenance', label: 'Electrical / Power Outlet Issue' },
  { type_id: 'iron_ironing_board', category: 'Amenities On Request', label: 'Iron & Ironing Board' },
  { type_id: 'hair_dryer', category: 'Amenities On Request', label: 'Hair Dryer' },
  { type_id: 'mosquito_repellent', category: 'Amenities On Request', label: 'Mosquito Repellent / Vaporizer' },
  { type_id: 'luggage_assistance', category: 'Front Desk & Services', label: 'Luggage Assistance' },
  { type_id: 'cab_travel_booking', category: 'Front Desk & Services', label: 'Taxi / Travel Booking' },
  { type_id: 'late_checkout_request', category: 'Front Desk & Services', label: 'Late Check-out Request' },
  { type_id: 'early_checkin_request', category: 'Front Desk & Services', label: 'Early Check-in Request' },
  { type_id: 'first_aid_assistance', category: 'Front Desk & Services', label: 'First Aid Kit' },
  { type_id: 'other_special_request', category: 'General', label: 'Other / Custom Request' },
];

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
  const [requestTypes, setRequestTypes] = useState<ServiceRequestType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newRequestType, setNewRequestType] = useState(DEFAULT_SERVICE_REQUEST_TYPES[0].type_id);
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

  const loadTypes = async () => {
    const data = await fetchServiceRequestTypesFromDB();
    setRequestTypes(data);
  };

  useEffect(() => {
    loadRequests();
    loadTypes();
  }, []);

  // DB-driven types when available; falls back to the built-in list so the
  // dropdown still works before/without a backend seed.
  const effectiveTypes: ServiceRequestType[] = requestTypes.length > 0
    ? requestTypes
    : DEFAULT_SERVICE_REQUEST_TYPES.map((d, i) => ({
        id: -1 - i,
        propertyId: 0,
        typeId: d.type_id,
        category: d.category,
        label: d.label,
        isSystemDefault: true,
        displayOrder: i,
      }));

  const typeOptions = effectiveTypes.map((rt) => ({ value: rt.typeId, label: rt.label, group: rt.category, searchText: `${rt.label} ${rt.category}`.toLowerCase() }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const selectedTypeLabel = typeOptions.find((t) => t.value === newRequestType)?.label ?? newRequestType;
    const roomLabel = rooms.find((r) => String(r.id) === newRoomId)?.name ?? 'Not specified';
    const ok = await createServiceRequestInDB({
      room_id: newRoomId ? Number(newRoomId) : null,
      request_type: newRequestType,
      description: newDescription.trim(),
      requested_by: getCurrentUserName(),
    });
    if (ok) {
      showToast('Service request logged', { type: 'success' });
      const createdMsg = `🆕 <b>SERVICE REQUEST CREATED</b>\n━━━━━━━━━━━━━━━━━━━━\n🧾 <b>Type:</b> ${selectedTypeLabel}\n🚪 <b>Room:</b> ${roomLabel}\n👤 <b>Requested by:</b> ${getCurrentUserName()}\n${newDescription.trim() ? `📝 <b>Details:</b> ${newDescription.trim()}\n` : ''}━━━━━━━━━━━━━━━━━━━━`;
      onDispatchTelegram?.('Service Request Created', createdMsg, 'admin');
      setIsAddModalOpen(false);
      setNewRoomId('');
      setNewRequestType(typeOptions[0]?.value ?? DEFAULT_SERVICE_REQUEST_TYPES[0].type_id);
      setNewDescription('');
      loadRequests();
    } else {
      showToast('Failed to log service request', { type: 'error' });
    }
    setSaving(false);
  };

  const handleFulfill = async (id: number, requestType: string, roomName: string) => {
    setFulfillingId(id);
    const ok = await fulfillServiceRequestInDB(id, getCurrentUserName());
    setFulfillingId(null);
    if (ok) {
      showToast('Marked fulfilled', { type: 'success' });
      const fulfilledMsg = `✅ <b>SERVICE REQUEST FULFILLED</b>\n━━━━━━━━━━━━━━━━━━━━\n🧾 <b>Type:</b> ${requestType}\n🚪 <b>Room:</b> ${roomName}\n👤 <b>Fulfilled by:</b> ${getCurrentUserName()}\n🕒 <b>Time:</b> ${new Date().toLocaleString('en-IN')}\n━━━━━━━━━━━━━━━━━━━━`;
      onDispatchTelegram?.('Service Request Fulfilled', fulfilledMsg, 'admin');
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
    <div className="space-y-6 max-w-[550px]">
      <PageHeader
        title={t('guest_service_requests_heading', 'Guest Service Requests')}
        subtitle={t('service_requests_description', 'Housekeeping, maintenance, and other ad-hoc requests — logged by any staff member, nudged to Admin on Telegram.')}
      >
        <PageHeaderButton onClick={() => setIsAddModalOpen(true)} icon={Plus}>
          {t('new_request_button', 'New Request')}
        </PageHeaderButton>
      </PageHeader>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        {loading ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm">{t('loading_spinner_default_message', 'Loading...')}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm">{t('no_service_requests_label', 'No service requests logged yet.')}</div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t('pending_status_badge', 'Pending')} ({pending.length})</h3>
                <div className="space-y-2">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{r.requestType}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        {r.description && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{r.description}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5">{t('requested_by_text', 'Requested by')} {r.requestedBy} · {formatDateTimeDDMMYYYY(r.createdAt)}</p>
                      </div>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={fulfillingId === r.id}
                          onClick={() => handleFulfill(r.id, r.requestType, r.roomName)}
                          className="shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {fulfillingId === r.id ? t('updating_button', 'Updating...') : t('mark_fulfilled_button', 'Mark Fulfilled')}
                        </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fulfilled.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('fulfilled_status_badge', 'Fulfilled')} ({fulfilled.length})</h3>
                <div className="space-y-2">
                  {fulfilled.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl opacity-75">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{r.requestType}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {t('fulfilled_by_text', 'Fulfilled by')} {r.fulfilledBy} · {r.fulfilledAt}
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
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-500" />
                {t('new_service_request_heading', 'New Service Request')}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              {isMultiKeyProperty && rooms.length > 0 && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('room_field_label', 'Room')}</label>
                  <StyledSelect
                    value={newRoomId}
                    onChange={setNewRoomId}
                    placeholder={t('select_room_optional_placeholder', '-- Select Room (optional) --')}
                    options={rooms.map((room) => ({ value: String(room.id), label: room.name }))}
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('request_type_label', 'Request Type')}</label>
                <StyledSelect
                  value={newRequestType}
                  onChange={setNewRequestType}
                  options={typeOptions}
                  searchable
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{t('details_label', 'Details')}</label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('service_request_details_placeholder', 'Describe the request (optional)...')}
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" size="md" onClick={() => setIsAddModalOpen(false)}>
                  {t('cancel_button', 'Cancel')}
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={saving} className="shadow-sm">
                  {saving ? t('logging_button', 'Logging...') : t('log_request_button', 'Log Request')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
