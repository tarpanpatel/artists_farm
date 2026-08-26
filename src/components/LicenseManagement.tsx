import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  ScrollText,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  Search,
  Landmark,
  Hash,
  X,
  Paperclip,
  FileText,
  Image as ImageIcon,
  ExternalLink,
} from './icons/FlowbiteIcons';
import { Drawer } from 'flowbite-react';
import { apiFetch, API_ROOT_BASE, uploadDocumentDB } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useAuth } from '../contexts/AuthContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Input } from './Input';
import { FileInput } from './FileInput';
import { DateRangePicker } from './DateRangePicker';
import { Button } from './Button';
import { Badge } from './Badge';
import { StyledSelect } from './StyledSelect';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { t } from '../i18n/en';

interface PropertyLicense {
  id: number;
  license_type: string;
  license_name: string;
  license_number: string;
  issuing_authority: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expiring_soon' | 'expired';
  days_remaining: number;
  notes: string;
  document_url: string | null;
}

type LicenseFormState = {
  license_type: string;
  license_name: string;
  license_number: string;
  issuing_authority: string;
  start_date: string;
  end_date: string;
  notes: string;
  document_url: string | null;
};

const isImageUrl = (url: string): boolean => /\.(jpg|jpeg|png|webp)$/i.test(url);

const LICENSE_TYPES: Array<{ value: string; labelKey: string; fallback: string }> = [
  { value: 'homestay', labelKey: 'license_type_homestay', fallback: 'Homestay License' },
  { value: 'guest_house', labelKey: 'license_type_guest_house', fallback: 'Guest House License' },
  { value: 'fssai', labelKey: 'license_type_fssai', fallback: 'FSSAI License (Food Safety)' },
  { value: 'pollution', labelKey: 'license_type_pollution', fallback: 'Pollution Control Certificate' },
  { value: 'trade', labelKey: 'license_type_trade', fallback: 'Trade License' },
  { value: 'property_tax', labelKey: 'license_type_property_tax', fallback: 'Property Tax Certificate' },
  { value: 'fire_safety', labelKey: 'license_type_fire_safety', fallback: 'Fire Safety Certificate' },
  { value: 'electrical', labelKey: 'license_type_electrical', fallback: 'Electrical Certificate' },
  { value: 'gst', labelKey: 'license_type_gst', fallback: 'GST Certificate' },
  { value: 'other', labelKey: 'license_type_other', fallback: 'Other' },
];

const licenseTypeLabel = (value: string): string => {
  const match = LICENSE_TYPES.find((lt) => lt.value === value);
  return match ? t(match.labelKey, match.fallback) : value || t('license_type_other', 'Other');
};

const EMPTY_FORM: LicenseFormState = {
  license_type: 'homestay',
  license_name: '',
  license_number: '',
  issuing_authority: '',
  start_date: '',
  end_date: '',
  notes: '',
  document_url: null,
};

interface StatusMeta {
  label: string;
  icon: React.ElementType;
  variant: 'danger' | 'warning' | 'success';
  cardRingClass: string;
}

const getStatusMeta = (status: PropertyLicense['status']): StatusMeta => {
  if (status === 'expired') {
    return {
      label: t('expired_badge', 'Expired'),
      icon: XCircle,
      variant: 'danger',
      cardRingClass: 'border-red-200 dark:border-red-800/60',
    };
  }
  if (status === 'expiring_soon') {
    return {
      label: t('expiring_soon_badge', 'Expiring Soon'),
      icon: AlertTriangle,
      variant: 'warning',
      cardRingClass: 'border-amber-200 dark:border-amber-800/60',
    };
  }
  return {
    label: t('active_badge', 'ACTIVE'),
    icon: ShieldCheck,
    variant: 'success',
    cardRingClass: 'border-slate-200 dark:border-slate-700',
  };
};

const daysRemainingText = (license: PropertyLicense): string | null => {
  const days = Number(license.days_remaining);
  if (Number.isNaN(days)) return null;
  if (license.status === 'expired') {
    const abs = Math.abs(days);
    return `Expired ${abs} ${abs === 1 ? 'day' : 'days'} ago`;
  }
  if (license.status === 'expiring_soon') {
    return days === 0 ? 'Expires today' : `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  return null;
};

interface LicenseManagementProps {
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

/**
 * Per-property license tracker (Homestay, FSSAI, Trade, etc.) with expiry
 * status. The backend (php/licenses/licenses.php, wired into router.php's
 * get_licenses/add_license/update_license/delete_license actions) and the
 * daily Telegram-reminder cron (php/cron/check_licenses.php) already existed
 * before this - this component is the missing frontend page that was never
 * built for them (see LICENSE_MANAGEMENT.md).
 */
export const LicenseManagement: React.FC<LicenseManagementProps> = ({ onLogAudit }) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { currentUser } = useAuth();

  const [licenses, setLicenses] = useState<PropertyLicense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLicense, setEditingLicense] = useState<PropertyLicense | null>(null);
  const [form, setForm] = useState<LicenseFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  const currentUserName = currentUser?.name || 'Admin';

  const loadLicenses = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=get_licenses`);
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.data)) {
        setLicenses(data.data as PropertyLicense[]);
      }
    } catch (err) {
      console.error('Failed to load licenses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, []);

  const openAddModal = () => {
    setEditingLicense(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = (license: PropertyLicense) => {
    setEditingLicense(license);
    setForm({
      license_type: license.license_type || 'other',
      license_name: license.license_name || '',
      license_number: license.license_number || '',
      issuing_authority: license.issuing_authority || '',
      start_date: (license.start_date || '').split(' ')[0],
      end_date: (license.end_date || '').split(' ')[0],
      notes: license.notes || '',
      document_url: license.document_url || null,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving || isUploadingDoc) return;
    setIsModalOpen(false);
    setEditingLicense(null);
    setForm(EMPTY_FORM);
  };

  const handleDocumentSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!ALLOWED.includes(file.type)) {
      showToast(t('license_doc_invalid_type_label', 'Please upload a PDF, JPG, PNG, or WEBP file.'), { type: 'error' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast(t('license_doc_too_large_label', 'File is too large (max 10MB).'), { type: 'error' });
      return;
    }

    setIsUploadingDoc(true);
    const result = await uploadDocumentDB(file, 'licenses');
    setIsUploadingDoc(false);
    if (result) {
      setForm((prev) => ({ ...prev, document_url: result.url }));
    } else {
      showToast(t('license_doc_upload_failed_label', 'Failed to upload document. Please try again.'), { type: 'error' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.license_number.trim() || !form.start_date || !form.end_date) return;

    setIsSaving(true);
    const isEditing = !!editingLicense;
    const action = isEditing ? 'update_license' : 'add_license';
    const payload = isEditing ? { ...form, id: editingLicense!.id } : form;

    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success') {
        const displayName = form.license_name.trim() || licenseTypeLabel(form.license_type);
        if (onLogAudit) {
          onLogAudit(
            isEditing
              ? `${currentUserName} updated license '${displayName}' (${form.license_number})`
              : `${currentUserName} added new license '${displayName}' (${form.license_number})`
          );
        }
        showToast(
          isEditing
            ? t('license_updated_toast', 'License updated successfully.')
            : t('license_added_toast', 'License added successfully.'),
          { type: 'success' }
        );
        closeModal();
        loadLicenses();
      } else {
        showToast(data.message || t('save_license_failed_label', 'Failed to save license. Please try again.'), { type: 'error' });
      }
    } catch (err) {
      console.error(`Failed to ${action}:`, err);
      showToast(t('save_license_failed_label', 'Failed to save license. Please try again.'), { type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (license: PropertyLicense) => {
    const confirmed = await confirm({
      title: t('delete_license_title', 'Delete License'),
      message: t('delete_license_message', 'Delete this license?'),
      confirmText: t('delete_license_confirm', 'Delete License'),
      variant: 'danger',
    });
    if (!confirmed) return;

    setDeletingId(license.id);
    try {
      const res = await apiFetch(`${API_ROOT_BASE}/php/api/router.php?action=delete_license`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: license.id }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        if (onLogAudit) {
          const displayName = license.license_name.trim() || licenseTypeLabel(license.license_type);
          onLogAudit(`${currentUserName} deleted license '${displayName}' (${license.license_number})`);
        }
        setLicenses((prev) => prev.filter((l) => l.id !== license.id));
      } else {
        showToast(data.message || t('delete_license_failed_label', 'Failed to delete license. Please try again.'), { type: 'error' });
      }
    } catch (err) {
      console.error('Failed to delete license:', err);
      showToast(t('delete_license_failed_label', 'Failed to delete license. Please try again.'), { type: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredLicenses = useMemo(() => {
    if (!searchText.trim()) return licenses;
    const q = searchText.toLowerCase();
    return licenses.filter((l) =>
      l.license_name?.toLowerCase().includes(q) ||
      l.license_number?.toLowerCase().includes(q) ||
      l.issuing_authority?.toLowerCase().includes(q) ||
      licenseTypeLabel(l.license_type).toLowerCase().includes(q)
    );
  }, [licenses, searchText]);

  return (
    <div className="license-management space-y-6">
      <PageHeader
        title={t('license_management_heading', 'License Management')}
        subtitle={t('license_management_description', 'Track and manage property licenses')}
      >
        <PageHeaderButton onClick={openAddModal} icon={Plus}>
          {t('add_license_button', 'Add License')}
        </PageHeaderButton>
      </PageHeader>

      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
        {t(
          'license_notifications_banner_text',
          'Automatic expiry reminders are ON: every license gets a reminder each Sunday for the 4 weeks before it expires, sent via Telegram (if set up for this property) and email.'
        )}
      </div>

      {licenses.length > 0 && (
        <Input
          type="text"
          leftIcon={<Search className="w-4 h-4" />}
          placeholder={t('search_licenses_placeholder', 'Search by name, number, or type...')}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="max-w-xs"
        />
      )}

      {loading ? (
        <div className="license-management__loading flex items-center justify-center py-16 text-slate-500 dark:text-slate-400 gap-2 text-sm font-medium">
          <Loader2 className="w-5 h-5 animate-spin" /> {t('loading_licenses_label', 'Loading licenses...')}
        </div>
      ) : licenses.length === 0 ? (
        <div className="license-management__empty flex flex-col items-center justify-center py-16 px-6 text-center bg-white dark:bg-slate-800 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
          <ScrollText className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{t('no_licenses_label', 'No licenses added yet')}</p>
          <Button variant="primary" size="sm" className="mt-4" leftIcon={<Plus className="w-4 h-4" />} onClick={openAddModal}>
            {t('add_first_license_button', 'Add your first license')}
          </Button>
        </div>
      ) : filteredLicenses.length === 0 ? (
        <div className="license-management__no-match text-center py-10 text-sm font-medium text-slate-500 dark:text-slate-400">
          {t('no_licenses_match_search_label', 'No licenses match your search.')}
        </div>
      ) : (
        <div className="license-management__grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredLicenses.map((license) => {
            const meta = getStatusMeta(license.status);
            const StatusIcon = meta.icon;
            const subLabel = daysRemainingText(license);
            return (
              <div
                key={license.id}
                className={`license-management__card bg-white dark:bg-slate-800 rounded-lg border ${meta.cardRingClass} shadow-sm p-4 sm:p-6 flex flex-col gap-3`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {licenseTypeLabel(license.license_type)}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate mt-0.5">
                      {license.license_name?.trim() || licenseTypeLabel(license.license_type)}
                    </h3>
                  </div>
                  <Badge variant={meta.variant} size="sm" className="shrink-0">
                    <StatusIcon className="w-3 h-3" />
                    {meta.label}
                  </Badge>
                </div>

                <div className="license-management__card-fields text-xs space-y-1.5 text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-slate-400 dark:text-slate-500">{t('license_number_field', 'License #:')}</span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-200 truncate">{license.license_number}</span>
                  </div>
                  {license.issuing_authority && (
                    <div className="flex items-center gap-1.5">
                      <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-400 dark:text-slate-500">{t('issued_by_field', 'Issued By:')}</span>
                      <span className="truncate">{license.issuing_authority}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span>
                      <span className="text-slate-400 dark:text-slate-500">{t('valid_from_field', 'Valid From:')}</span>{' '}
                      <span className="font-medium">{formatDateDDMMYYYY(license.start_date)}</span>
                    </span>
                    <span>
                      <span className="text-slate-400 dark:text-slate-500">{t('expires_field', 'Expires:')}</span>{' '}
                      <span className="font-medium">{formatDateDDMMYYYY(license.end_date)}</span>
                    </span>
                  </div>
                  {subLabel && (
                    <p className={`text-[11px] font-semibold ${license.status === 'expired' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                      {subLabel}
                    </p>
                  )}
                  {license.notes && (
                    <p className="text-[11px] italic text-slate-400 dark:text-slate-500 line-clamp-2 pt-1 border-t border-slate-100 dark:border-slate-700">
                      {license.notes}
                    </p>
                  )}
                </div>

                <div className="license-management__card-actions flex items-center justify-between gap-1.5 mt-auto pt-1">
                  {license.document_url ? (
                    <a
                      href={license.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="license-management__doc-link inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {t('view_document_label', 'View Document')}
                    </a>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1.5">
                    <Button variant="primary" size="sm" onClick={() => openEditModal(license)} leftIcon={<Edit2 className="w-3.5 h-3.5 shrink-0" />}>
                      {t('edit_button', 'Edit')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(license)}
                      disabled={deletingId === license.id}
                      title={t('delete_button', 'Delete')}
                      className="p-1.5 rounded-full text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deletingId === license.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer
        open={isModalOpen}
        onClose={closeModal}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between license-management__modal"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <span className="flex items-center gap-2 font-bold text-gray-900 dark:text-white text-base">
            <ScrollText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {editingLicense ? t('edit_license_heading', 'Edit License') : t('add_new_license_heading', 'Add New License')}
          </span>
          <button
            type="button"
            onClick={closeModal}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="app-form app-form--license flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
              {t(
                'license_notifications_banner_modal_text',
                "Reminders are ON for this license: once saved, you'll get a notification every Sunday for the 4 weeks before its expiry date, via Telegram (if set up) and email."
              )}
            </div>
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                {t('license_type_label', 'License Type *')}
              </label>
              <StyledSelect
                value={form.license_type}
                onChange={(v) => setForm({ ...form, license_type: v })}
                options={LICENSE_TYPES.map((lt) => ({ value: lt.value, label: t(lt.labelKey, lt.fallback) }))}
              />
            </div>
            <div>
              <Input
                label={t('license_name_label', 'License Name')}
                type="text"
                value={form.license_name}
                onChange={(e) => setForm({ ...form, license_name: e.target.value })}
                placeholder={t('license_name_placeholder', 'e.g., Homestay License - Rajasthan')}
              />
            </div>
            <div>
              <Input
                label={t('license_number_label', 'License Number *')}
                type="text"
                required
                value={form.license_number}
                onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                placeholder={t('license_number_placeholder', 'e.g., HM/2024/00123')}
              />
            </div>
            <div>
              <Input
                label={t('issuing_authority_label', 'Issuing Authority')}
                type="text"
                value={form.issuing_authority}
                onChange={(e) => setForm({ ...form, issuing_authority: e.target.value })}
                placeholder={t('issuing_authority_placeholder', 'e.g., Department of Tourism, Rajasthan')}
              />
            </div>
            <div>
              <DateRangePicker
                label={t('license_validity_period_label', 'Validity Period *')}
                checkinDate={form.start_date}
                checkoutDate={form.end_date}
                onCheckinChange={(date) => setForm({ ...form, start_date: date })}
                onCheckoutChange={(date) => setForm({ ...form, end_date: date })}
                fromPlaceholder={t('license_start_date_label', 'Start Date *')}
                toPlaceholder={t('license_expiry_date_label', 'Expiry Date *')}
              />
            </div>
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                {t('license_notes_label', 'Notes')}
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder={t('notes_placeholder', 'Any additional information...')}
                rows={2}
                className="app-input w-full px-3.5 py-2.5 text-sm rounded-lg border border-[var(--input-border-default)] bg-[var(--input-bg-default)] text-[var(--input-text-default)] placeholder:text-[var(--input-placeholder)] hover:border-slate-400 dark:hover:border-slate-500 focus:border-[var(--input-border-focus)] focus:ring-4 focus:ring-[var(--input-ring-focus)] outline-none transition-all duration-200 resize-none"
              />
            </div>
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                {t('license_document_label', 'License Document')}
              </label>
              {isUploadingDoc ? (
                <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg px-3.5 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t('license_doc_uploading_label', 'Uploading...')}
                </div>
              ) : form.document_url ? (
                <div className="license-management__doc-attached flex items-center justify-between gap-2 border border-slate-200 dark:border-slate-600 rounded-lg px-3.5 py-2.5 bg-slate-50 dark:bg-slate-700/50">
                  <a
                    href={form.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 min-w-0 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    {isImageUrl(form.document_url) ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
                    <span className="truncate">{t('view_document_label', 'View Document')}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, document_url: null }))}
                    title={t('remove_document_label', 'Remove')}
                    className="p-1 rounded-full text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <FileInput
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={handleDocumentSelected}
                  helperText={t('upload_document_button', 'PDF, JPG, or PNG')}
                />
              )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              onClick={closeModal}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving || isUploadingDoc} leftIcon={isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined}>
              {editingLicense ? t('update_license_button', 'Update License') : t('add_license_button', 'Add License')}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
};
