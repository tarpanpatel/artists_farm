import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Clock, X, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ServiceRequestType,
  createServiceRequestInDB,
  fulfillServiceRequestInDB,
  updateServiceRequestReminderTimestamp,
  checkStaleServiceRequests,
  fetchServiceRequestTypesFromDB,
  resolveTelegramTemplate,
  getPropertySlug,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useServiceRequestContext } from '../contexts/ServiceRequestContext';
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

// Service request types are now fully database-driven via the system_service_request_catalog
// global table. The DEFAULT_SERVICE_REQUEST_TYPES fallback array has been removed.
// The backend GET /get_service_request_types returns a merged UNION of system + property custom types.

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
  // Shared with the notification bell (Header.tsx) - marking a request
  // fulfilled here updates that badge immediately instead of waiting for an
  // unrelated re-fetch.
  const { requests, loading, refreshRequests } = useServiceRequestContext();
  const [requestTypes, setRequestTypes] = useState<ServiceRequestType[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newRequestType, setNewRequestType] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<number | null>(null);
  // Fulfilled list can grow indefinitely (every request ever fulfilled stays
  // here) - showing all of them unconditionally made this page's height
  // balloon over time. Paginate 5 at a time instead.
  const [fulfilledPage, setFulfilledPage] = useState(0);
  const FULFILLED_PAGE_SIZE = 5;

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

  const loadTypes = async () => {
    const data = await fetchServiceRequestTypesFromDB();
    setRequestTypes(data);
  };

  useEffect(() => {
    loadTypes();
  }, []);

  // DB-driven merged list (system global + property custom types). Always ready from DB.
  const typeOptions = requestTypes.map((rt) => ({ value: rt.typeId, label: rt.label, group: rt.category, searchText: `${rt.label} ${rt.category}`.toLowerCase() }));

  // Set default selection when types load
  useEffect(() => {
    if (requestTypes.length > 0 && !newRequestType) {
      setNewRequestType(requestTypes[0].typeId);
    }
  }, [requestTypes]);

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
      setIsAddModalOpen(false);
      setNewRoomId('');
      setNewRequestType(typeOptions[0]?.value ?? '');
      setNewDescription('');
      refreshRequests();
    } else {
      showToast('Failed to log service request', { type: 'error' });
    }
    setSaving(false);
  };

  const handleFulfill = async (id: number, _requestType: string, _roomName: string) => {
    setFulfillingId(id);
    const ok = await fulfillServiceRequestInDB(id, getCurrentUserName());
    setFulfillingId(null);
    if (ok) {
      showToast('Marking completed and removing from the queue...', { type: 'success' });
      refreshRequests();
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
          request_type: item.requestType,
          room_name: item.roomName,
          description: item.description || '(none)',
          requested_by: item.requestedBy,
        };
        const resolved = await resolveTelegramTemplate('service_request_created', reminderVars);
        const fallbackMsg = `⏰ <b>SERVICE REQUEST STILL PENDING</b>\n━━━━━━━━━━━━━━━━━━\n🧾 <b>Type:</b> ${item.requestType}\n🚪 <b>Room:</b> ${item.roomName}\n⏱️ <b>Pending for:</b> ${item.elapsedMinutes} min\n━━━━━━━━━━━━━━━━━━\n🏃 <i>Auto-reminder — please action or mark fulfilled.</i>`;
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
  const fulfilledPageCount = Math.max(1, Math.ceil(fulfilled.length / FULFILLED_PAGE_SIZE));
  // Clamp rather than trust state directly - the fulfilled list's length can
  // shrink out from under a page number already in state (e.g. after a
  // reload returns fewer rows), which would otherwise render an empty page.
  const clampedFulfilledPage = Math.min(fulfilledPage, fulfilledPageCount - 1);
  const paginatedFulfilled = fulfilled.slice(
    clampedFulfilledPage * FULFILLED_PAGE_SIZE,
    (clampedFulfilledPage + 1) * FULFILLED_PAGE_SIZE
  );

  const getRequestTypeLabel = (rawType: string) => {
    if (!rawType) return '';
    const matched = requestTypes.find((rt) => rt.typeId === rawType || rt.typeId.toLowerCase() === rawType.toLowerCase());
    if (matched && matched.label) return matched.label;
    return rawType
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div className="space-y-6 max-w-[550px] service-requests-management__container">
      <PageHeader
        title={t('guest_service_requests_heading', 'Guest Service Requests')}
        subtitle={t('service_requests_description', 'Housekeeping, maintenance, and other ad-hoc requests — logged by any staff member, nudged to Admin on Telegram.')}
      >
        <PageHeaderButton onClick={() => setIsAddModalOpen(true)} icon={Plus}>
          {t('new_request_button', 'New Request')}
        </PageHeaderButton>
      </PageHeader>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-6 service-requests-management__list-card">
        {loading ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm service-requests-management__loading">{t('loading_spinner_default_message', 'Loading...')}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm service-requests-management__empty-state">{t('no_service_requests_label', 'No service requests logged yet.')}</div>
        ) : (
          <div className="space-y-6 service-requests-management__sections">
            {pending.length > 0 && (
              <div className="space-y-2 service-requests-management__section">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 service-requests-management__section-header">{t('pending_status_badge', 'Pending')} ({pending.length})</h3>
                <div className="space-y-2 service-requests-management__request-list">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl service-requests-management__request-item service-requests-management__request-item--pending">
                      <div className="flex-1 min-w-0 service-requests-management__request-details">
                        <div className="flex items-center gap-2 flex-wrap service-requests-management__request-header">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm service-requests-management__request-type">{getRequestTypeLabel(r.requestType)}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 service-requests-management__request-room">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        {r.description && <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 service-requests-management__request-description">{r.description}</p>}
                        <p className="text-[11px] text-slate-400 mt-0.5 service-requests-management__request-meta">{t('requested_by_text', 'Requested by')} {r.requestedBy} · {formatDateTimeDDMMYYYY(r.createdAt)}</p>
                      </div>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={fulfillingId === r.id}
                          onClick={() => handleFulfill(r.id, r.requestType, r.roomName)}
                          className="shrink-0 service-requests-management__fulfill-button"
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
              <div className="space-y-2 service-requests-management__section">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 service-requests-management__section-header">{t('fulfilled_status_badge', 'Fulfilled')} ({fulfilled.length})</h3>
                <div className="space-y-2 service-requests-management__request-list">
                  {paginatedFulfilled.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-700 rounded-xl opacity-75 service-requests-management__request-item service-requests-management__request-item--fulfilled">
                      <div className="flex-1 min-w-0 service-requests-management__request-details">
                        <div className="flex items-center gap-2 flex-wrap service-requests-management__request-header">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm service-requests-management__request-type">{getRequestTypeLabel(r.requestType)}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 service-requests-management__request-room">
                            <Home className="w-3 h-3" /> {r.roomName}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 service-requests-management__request-meta">
                          {t('fulfilled_by_text', 'Fulfilled by')} {r.fulfilledBy} · {r.fulfilledAt}
                        </p>
                      </div>
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-xs font-semibold shrink-0 service-requests-management__done-badge">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {t('done_badge', 'Done')}
                      </span>
                    </div>
                  ))}
                </div>
                {fulfilledPageCount > 1 && (
                  <div className="flex items-center justify-between pt-1 service-requests-management__fulfilled-pagination">
                    <button
                      type="button"
                      onClick={() => setFulfilledPage((p) => Math.max(0, p - 1))}
                      disabled={clampedFulfilledPage === 0}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> {t('previous_button', 'Previous')}
                    </button>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500">
                      {t('page_label', 'Page')} {clampedFulfilledPage + 1} {t('of_label', 'of')} {fulfilledPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFulfilledPage((p) => Math.min(fulfilledPageCount - 1, p + 1))}
                      disabled={clampedFulfilledPage >= fulfilledPageCount - 1}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {t('next_button', 'Next')} <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in service-requests-management__modal-overlay">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 service-requests-management__modal">
            <div className="flex items-center justify-between mb-4 service-requests-management__modal-header">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2 service-requests-management__modal-title">
                <Clock className="w-5 h-5 text-indigo-500" />
                {t('new_service_request_heading', 'New Service Request')}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer service-requests-management__modal-close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="app-form app-form--create-service-request space-y-4 service-requests-management__form">
              {isMultiKeyProperty && rooms.length > 0 && (
                <div className="service-requests-management__form-group">
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 service-requests-management__form-label">{t('room_field_label', 'Room')}</label>
                  <StyledSelect
                    value={newRoomId}
                    onChange={setNewRoomId}
                    placeholder={t('select_room_optional_placeholder', '-- Select Room (optional) --')}
                    options={rooms.map((room) => ({ value: String(room.id), label: room.name }))}
                  />
                </div>
              )}
              <div className="service-requests-management__form-group">
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 service-requests-management__form-label">{t('request_type_label', 'Request Type')}</label>
                <StyledSelect
                  value={newRequestType}
                  onChange={setNewRequestType}
                  options={typeOptions}
                  searchable
                />
              </div>
              <div className="service-requests-management__form-group">
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5 service-requests-management__form-label">{t('details_label', 'Details')}</label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t('service_request_details_placeholder', 'Describe the request (optional)...')}
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm service-requests-management__form-textarea"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 service-requests-management__form-actions">
                <Button variant="secondary" size="md" onClick={() => setIsAddModalOpen(false)}>
                  {t('cancel_button', 'Cancel')}
                </Button>
                <Button type="submit" variant="primary" size="md" disabled={saving} className="shadow-sm service-requests-management__submit-button">
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
