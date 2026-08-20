import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, Clock, Home, ChevronLeft, ChevronRight, Pencil, Trash2, Settings, X } from 'lucide-react';
import {
  ServiceRequestType,
  createServiceRequestInDB,
  fulfillServiceRequestInDB,
  updateServiceRequestReminderTimestamp,
  checkStaleServiceRequests,
  fetchServiceRequestTypesFromDB,
  saveServiceRequestTypeInDB,
  deleteServiceRequestTypeInDB,
  resolveTelegramTemplate,
  getPropertySlug,
} from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useServiceRequestContext } from '../contexts/ServiceRequestContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { t } from '../i18n/en';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Button } from './Button';
import { Input } from './Input';
import { formatDateTimeDDMMYYYY } from '../utils/dateUtils';

import { useConfigurationData } from '../contexts/ConfigurationDataContext';
import { Card, Badge, TextInput as FlowbiteTextInput, Textarea as FlowbiteTextarea, Checkbox as FlowbiteCheckbox, Label as FlowbiteLabel, Drawer } from 'flowbite-react';

interface Room {
  id: number;
  name: string;
}

interface ServiceRequestsManagementProps {
  rooms?: Room[];
  isMultiKeyProperty?: boolean;
  onDispatchTelegram?: (eventType: string, message: string, category?: 'kitchen' | 'admin' | 'finance' | 'all', replyMarkup?: any, templateKey?: string) => void;
}

const REMINDER_THRESHOLD_MINUTES = 15;

export const ServiceRequestsManagement: React.FC<ServiceRequestsManagementProps> = ({
  rooms = [],
  isMultiKeyProperty = false,
  onDispatchTelegram,
}) => {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { miscCharges } = useConfigurationData();
  const { requests, loading, refreshRequests } = useServiceRequestContext();
  const [requestTypes, setRequestTypes] = useState<ServiceRequestType[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editingTypeLabel, setEditingTypeLabel] = useState('');
  const [editingTypeCategory, setEditingTypeCategory] = useState('Guest Charges');
  const [editingTypeAmount, setEditingTypeAmount] = useState('');
  const [newRoomId, setNewRoomId] = useState<string>('');
  const [newRequestType, setNewRequestType] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newChargeAmount, setNewChargeAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [fulfillingId, setFulfillingId] = useState<number | null>(null);
  const [fulfilledPage, setFulfilledPage] = useState(0);
  const FULFILLED_PAGE_SIZE = 5;

  const [customRequestLabel, setCustomRequestLabel] = useState('');
  const [saveToCatalog, setSaveToCatalog] = useState(true);

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

  // DB-driven merged list with Custom option AT THE VERY TOP
  const typeOptions = [
    {
      value: '__CUSTOM__',
      label: '➕ Add Custom Service / Charge...',
      group: 'Custom',
      searchText: 'custom add create new charge service request',
    },
    ...requestTypes.map((rt) => ({
      value: rt.typeId,
      label: rt.label,
      group: rt.category,
      searchText: `${rt.label} ${rt.category}`.toLowerCase(),
    })),
  ];

  // Set default selection when types load (default to first non-custom request type if available)
  useEffect(() => {
    if (requestTypes.length > 0 && (!newRequestType || newRequestType === '__CUSTOM__')) {
      setNewRequestType(requestTypes[0].typeId);
    }
  }, [requestTypes]);

  // Auto-prefill charge amount when request type changes
  useEffect(() => {
    if (!newRequestType) return;
    if (newRequestType === '__CUSTOM__') {
      setNewChargeAmount('');
      return;
    }
    const selectedOption = requestTypes.find((rt) => rt.typeId === newRequestType || rt.typeId.toLowerCase() === newRequestType.toLowerCase());
    if (selectedOption && selectedOption.defaultAmount !== undefined && selectedOption.defaultAmount > 0) {
      setNewChargeAmount(String(selectedOption.defaultAmount));
      return;
    }
    const matchedCharge = (miscCharges as any[])?.find((c) => {
      const labelMatch = c.label?.toLowerCase() === selectedOption?.label?.toLowerCase();
      const idMatch = String(c.id) === newRequestType || c.type_id === newRequestType;
      return labelMatch || idMatch;
    });

    if (matchedCharge && matchedCharge.default_amount > 0) {
      setNewChargeAmount(String(matchedCharge.default_amount));
    }
  }, [newRequestType, requestTypes, miscCharges]);

  const handleStartEditType = (rt: ServiceRequestType) => {
    setEditingTypeId(rt.id);
    setEditingTypeLabel(rt.label);
    setEditingTypeCategory(rt.category || 'Guest Charges');
    setEditingTypeAmount(rt.defaultAmount !== undefined && rt.defaultAmount > 0 ? String(rt.defaultAmount) : '');
  };

  const handleSaveTypeEdit = async (rt: ServiceRequestType) => {
    if (!editingTypeLabel.trim()) return;
    const ok = await saveServiceRequestTypeInDB(
      {
        id: rt.id,
        category: editingTypeCategory || 'Guest Charges',
        label: editingTypeLabel.trim(),
        default_amount: editingTypeAmount ? parseFloat(editingTypeAmount) : 0,
      },
      rt.propertyId
    );

    if (ok) {
      showToast('Custom type updated', { type: 'success' });
      setEditingTypeId(null);
      loadTypes();
    } else {
      showToast('Failed to update custom type', { type: 'error' });
    }
  };

  const handleDeleteType = async (rt: ServiceRequestType) => {
    const ok = await confirm({
      title: 'Delete Custom Service Type',
      message: `Delete "${rt.label}" from your property catalog? Existing logged requests will remain intact.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;

    const success = await deleteServiceRequestTypeInDB(rt.id, rt.propertyId);
    if (success) {
      showToast('Custom type deleted', { type: 'success' });
      loadTypes();
    } else {
      showToast('Failed to delete custom type', { type: 'error' });
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    let targetRequestType = newRequestType;
    const charge = newChargeAmount ? parseFloat(newChargeAmount) : 0;

    if (newRequestType === '__CUSTOM__') {
      const labelTrimmed = customRequestLabel.trim();
      if (!labelTrimmed) {
        showToast('Please enter a name for the custom service or charge', { type: 'error' });
        setSaving(false);
        return;
      }
      targetRequestType = labelTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      if (saveToCatalog) {
        // Save to property's custom service request types catalog
        await saveServiceRequestTypeInDB({
          type_id: targetRequestType,
          category: 'Guest Charges',
          label: labelTrimmed,
        });

        // Register default price into misc catalog if charge > 0
        if (charge > 0) {
          try {
            await fetch('/php/api/router.php?action=add_misc_charge_template', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                label: labelTrimmed,
                category: 'Guest Charges',
                default_amount: charge,
              }),
            });
          } catch (err) {}
        }
        await loadTypes();
      }
    }

    const ok = await createServiceRequestInDB({
      room_id: newRoomId ? Number(newRoomId) : null,
      request_type: targetRequestType,
      description: newDescription.trim(),
      charge_amount: charge > 0 ? charge : 0,
      requested_by: getCurrentUserName(),
    });

    if (ok) {
      showToast('Service request logged', { type: 'success' });
      setIsAddModalOpen(false);
      setNewRoomId('');
      setNewRequestType(requestTypes[0]?.typeId ?? '');
      setCustomRequestLabel('');
      setNewDescription('');
      setNewChargeAmount('');
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

  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState('Guest Charges');
  const [newTypeChargeAmount, setNewTypeChargeAmount] = useState('');
  const [isCreatingType, setIsCreatingType] = useState(false);

  const handleCreateNewType = async (e: React.FormEvent) => {
    e.preventDefault();
    const labelTrimmed = newTypeLabel.trim();
    if (!labelTrimmed) {
      showToast('Please enter a service type name', { type: 'error' });
      return;
    }
    setIsCreatingType(true);
    const typeId = labelTrimmed.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const charge = newTypeChargeAmount ? parseFloat(newTypeChargeAmount) : 0;

    const ok = await saveServiceRequestTypeInDB({
      type_id: typeId,
      category: newTypeCategory || 'Guest Charges',
      label: labelTrimmed,
    });

    if (charge > 0) {
      try {
        await fetch('/php/api/router.php?action=add_misc_charge_template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            label: labelTrimmed,
            category: newTypeCategory || 'Guest Charges',
            default_amount: charge,
          }),
        });
      } catch (err) {}
    }

    setIsCreatingType(false);
    if (ok) {
      showToast('New service type created successfully', { type: 'success' });
      setNewTypeLabel('');
      setNewTypeChargeAmount('');
      loadTypes();
    } else {
      showToast('Failed to create service type', { type: 'error' });
    }
  };

  return (
    <div className="space-y-6 service-requests-management__container">
      <PageHeader
        title={t('guest_service_requests_heading', 'Guest Service Requests')}
        subtitle={t('service_requests_description', 'Housekeeping, maintenance, and other ad-hoc requests — logged by any staff member, nudged to Admin on Telegram.')}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <PageHeaderButton variant="secondary" onClick={() => setIsManageModalOpen(true)} icon={Settings}>
            Manage Custom Types
          </PageHeaderButton>
          <PageHeaderButton onClick={() => setIsAddModalOpen(true)} icon={Plus}>
            {t('new_request_button', 'New Request')}
          </PageHeaderButton>
        </div>
      </PageHeader>

      <Card className="shadow-md border-gray-200 dark:border-gray-700 service-requests-management__list-card">
        {loading ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm service-requests-management__loading">{t('loading_spinner_default_message', 'Loading...')}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm service-requests-management__empty-state">{t('no_service_requests_label', 'No service requests logged yet.')}</div>
        ) : (
          <div className="space-y-6 service-requests-management__sections">
            {pending.length > 0 && (
              <div className="space-y-3 service-requests-management__section">
                <div className="flex items-center gap-2">
                  <Badge color="warning" size="xs" className="font-semibold uppercase tracking-wide">
                    {t('pending_status_badge', 'Pending')} ({pending.length})
                  </Badge>
                </div>
                <div className="space-y-2.5 service-requests-management__request-list">
                  {pending.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg service-requests-management__request-item service-requests-management__request-item--pending shadow-md">
                      <div className="flex-1 min-w-0 service-requests-management__request-details">
                        <div className="flex items-center gap-2 flex-wrap service-requests-management__request-header">
                          <span className="font-bold text-slate-900 dark:text-white text-sm service-requests-management__request-type">{getRequestTypeLabel(r.requestType)}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 service-requests-management__request-room border border-slate-200 dark:border-slate-600">
                            <Home className="w-3 h-3 text-slate-400" /> {r.roomName}
                          </span>
                          {Boolean(r.chargeAmount && r.chargeAmount > 0) && (
                            <Badge color="success" size="xs" className="font-bold">
                              ₹{Number(r.chargeAmount).toFixed(2)}
                            </Badge>
                          )}
                        </div>
                        {r.description && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 service-requests-management__request-description">{r.description}</p>}
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 service-requests-management__request-meta">{t('requested_by_text', 'Requested by')} {r.requestedBy} · {formatDateTimeDDMMYYYY(r.createdAt)}</p>
                      </div>
                      <Button
                        variant="success"
                        size="sm"
                        disabled={fulfillingId === r.id}
                        onClick={() => handleFulfill(r.id, r.requestType, r.roomName)}
                        className="shrink-0 service-requests-management__fulfill-button rounded-lg text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        {fulfillingId === r.id ? t('updating_button', 'Updating...') : t('mark_fulfilled_button', 'Mark Fulfilled')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {fulfilled.length > 0 && (
              <div className="space-y-3 service-requests-management__section">
                <div className="flex items-center gap-2">
                  <Badge color="success" size="xs" className="font-semibold uppercase tracking-wide">
                    {t('fulfilled_status_badge', 'Fulfilled')} ({fulfilled.length})
                  </Badge>
                </div>
                <div className="space-y-2.5 service-requests-management__request-list">
                  {paginatedFulfilled.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg opacity-85 service-requests-management__request-item service-requests-management__request-item--fulfilled shadow-md">
                      <div className="flex-1 min-w-0 service-requests-management__request-details">
                        <div className="flex items-center gap-2 flex-wrap service-requests-management__request-header">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm service-requests-management__request-type">{getRequestTypeLabel(r.requestType)}</span>
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 service-requests-management__request-room border border-slate-200 dark:border-slate-600">
                            <Home className="w-3 h-3 text-slate-400" /> {r.roomName}
                          </span>
                          {Boolean(r.chargeAmount && r.chargeAmount > 0) && (
                            <Badge color="success" size="xs" className="font-bold">
                              ₹{Number(r.chargeAmount).toFixed(2)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 service-requests-management__request-meta">
                          {t('fulfilled_by_text', 'Fulfilled by')} {r.fulfilledBy} · {r.fulfilledAt}
                        </p>
                      </div>
                      <Badge color="success" size="xs" icon={CheckCircle2} className="shrink-0 font-semibold">
                        {t('done_badge', 'Done')}
                      </Badge>
                    </div>
                  ))}
                </div>
                {fulfilledPageCount > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-700 service-requests-management__fulfilled-pagination">
                    <button
                      type="button"
                      onClick={() => setFulfilledPage((p) => Math.max(0, p - 1))}
                      disabled={clampedFulfilledPage === 0}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> {t('previous_button', 'Previous')}
                    </button>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
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
      </Card>

      {/* New Service Request Right Drawer */}
      <Drawer
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-[480px] p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            {t('new_service_request_heading', 'New Service Request')}
          </span>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="app-form flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="p-4 space-y-4">
            {isMultiKeyProperty && rooms.length > 0 && (
              <div className="service-requests-management__form-group">
                <StyledSelect
                  label={t('room_field_label', 'Room')}
                  value={newRoomId}
                  onChange={setNewRoomId}
                  placeholder={t('select_room_optional_placeholder', '-- Select Room (optional) --')}
                  options={rooms.map((room) => ({ value: String(room.id), label: room.name }))}
                />
              </div>
            )}
            <div className="service-requests-management__form-group space-y-1">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setIsManageModalOpen(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5" /> Manage Custom Types
                </button>
              </div>
              <StyledSelect
                label={t('request_type_label', 'Request Type')}
                value={newRequestType}
                onChange={setNewRequestType}
                options={typeOptions}
                searchable
              />
            </div>

            {newRequestType === '__CUSTOM__' && (
              <div className="service-requests-management__form-group p-3.5 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                <div>
                  <div className="mb-1 block">
                    <FlowbiteLabel htmlFor="customRequestLabel" className="text-xs font-semibold text-blue-900 dark:text-blue-200">Custom Service / Charge Name *</FlowbiteLabel>
                  </div>
                  <FlowbiteTextInput
                    id="customRequestLabel"
                    type="text"
                    value={customRequestLabel}
                    onChange={(e) => setCustomRequestLabel(e.target.value)}
                    placeholder="e.g. Bonfire & Setup, Pool Towel..."
                    required
                  />
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <FlowbiteCheckbox
                    id="saveToCatalogCb"
                    checked={saveToCatalog}
                    onChange={(e) => setSaveToCatalog(e.target.checked)}
                  />
                  <FlowbiteLabel htmlFor="saveToCatalogCb" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                    Save to property catalog for future selection
                  </FlowbiteLabel>
                </div>
              </div>
            )}

            <div className="service-requests-management__form-group">
              <div className="mb-1.5 block">
                <FlowbiteLabel htmlFor="newChargeAmount">Charge Amount (₹) (Optional - added to checkout bill if set)</FlowbiteLabel>
              </div>
              <FlowbiteTextInput
                id="newChargeAmount"
                type="number"
                min="0"
                step="0.01"
                value={newChargeAmount}
                onChange={(e) => setNewChargeAmount(e.target.value)}
                placeholder="0.00 (leave blank for free)"
              />
            </div>

            <div className="service-requests-management__form-group">
              <div className="mb-1.5 block">
                <FlowbiteLabel htmlFor="newDescription">{t('details_label', 'Details')}</FlowbiteLabel>
              </div>
              <FlowbiteTextarea
                id="newDescription"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder={t('service_request_details_placeholder', 'Describe the request (optional)...')}
                rows={3}
              />
            </div>
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button variant="secondary" size="md" onClick={() => setIsAddModalOpen(false)}>
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={saving}>
              {saving ? t('logging_button', 'Logging...') : t('log_request_button', 'Log Request')}
            </Button>
          </div>
        </form>
      </Drawer>

      {/* Manage Custom Service Types Right Drawer */}
      <Drawer
        open={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-[480px] p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
            <Settings className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Manage Custom Service Types
          </span>
          <button
            type="button"
            onClick={() => setIsManageModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Add New Custom Type Inline Form */}
          <form onSubmit={handleCreateNewType} className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
            <h4 className="font-semibold text-xs text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Add New Service / Charge Type
            </h4>
            <div>
              <Input
                label="Service Type Name *"
                type="text"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
                placeholder="e.g. Bonfire Setup, Extra Towels, Airport Drop"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <select
                  value={newTypeCategory}
                  onChange={(e) => setNewTypeCategory(e.target.value)}
                  className="h-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg block w-full px-2.5 cursor-pointer"
                >
                  <option value="Guest Charges">Guest Charges</option>
                  <option value="Housekeeping">Housekeeping</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Food & Extras">Food & Extras</option>
                  <option value="Activities & Tours">Activities & Tours</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <Input
                  label="Default Price (₹)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newTypeChargeAmount}
                  onChange={(e) => setNewTypeChargeAmount(e.target.value)}
                  placeholder="0.00 (Optional)"
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" size="sm" disabled={isCreatingType}>
                {isCreatingType ? 'Adding...' : '+ Add Custom Type'}
              </Button>
            </div>
          </form>

          {/* List of Custom Types */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Existing Custom Service Types ({requestTypes.filter((rt) => !rt.isSystemDefault || rt.source === 'custom').length})
            </h4>

            <div className="space-y-2">
              {requestTypes.filter((rt) => !rt.isSystemDefault || rt.source === 'custom').length === 0 ? (
                <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-xs bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-4">
                  No custom service types added yet. Use the form above to add your first type.
                </div>
              ) : (
                requestTypes.filter((rt) => !rt.isSystemDefault || rt.source === 'custom').map((rt) => (
                  <div key={rt.id} className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                    {editingTypeId === rt.id ? (
                      <div className="space-y-3 p-1">
                        <div>
                          <Input
                            label="Service Type Name *"
                            type="text"
                            value={editingTypeLabel}
                            onChange={(e) => setEditingTypeLabel(e.target.value)}
                            className="w-full text-xs"
                            required
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                            <select
                              value={editingTypeCategory}
                              onChange={(e) => setEditingTypeCategory(e.target.value)}
                              className="h-10 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-xs rounded-lg block w-full px-2.5 cursor-pointer"
                            >
                              <option value="Guest Charges">Guest Charges</option>
                              <option value="Housekeeping">Housekeeping</option>
                              <option value="Maintenance">Maintenance</option>
                              <option value="Food & Extras">Food & Extras</option>
                              <option value="Activities & Tours">Activities & Tours</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div>
                            <Input
                              label="Default Price (₹)"
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingTypeAmount}
                              onChange={(e) => setEditingTypeAmount(e.target.value)}
                              placeholder="0.00 (Optional)"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button size="sm" variant="secondary" onClick={() => setEditingTypeId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" variant="success" onClick={() => handleSaveTypeEdit(rt)}>
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">{rt.label}</span>
                            {Boolean(rt.defaultAmount && rt.defaultAmount > 0) ? (
                              <Badge color="success" size="xs" className="font-semibold">
                                ₹{Number(rt.defaultAmount).toFixed(2)}
                              </Badge>
                            ) : (
                              <span className="text-2xs font-medium text-slate-400 dark:text-slate-500">Free / On Request</span>
                            )}
                          </div>
                          <span className="text-2xs text-slate-400 block mt-0.5">{rt.category}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button variant="primary" size="sm" onClick={() => handleStartEditType(rt)} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                            Edit
                          </Button>
                          <button
                            onClick={() => handleDeleteType(rt)}
                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end bg-gray-50 dark:bg-gray-850">
          <Button variant="secondary" size="md" onClick={() => setIsManageModalOpen(false)}>
            Close
          </Button>
        </div>
      </Drawer>
    </div>
  );
};
