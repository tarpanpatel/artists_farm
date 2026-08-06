import React, { useState, useEffect } from 'react';
import { FileText, Plus, Edit2, Trash2, AlertCircle, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useConfirm } from './ConfirmDialogContext';
import { StyledSelect } from './StyledSelect';
import { t } from '../i18n/en';

interface License {
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
  created_at: string;
}

interface LicenseManagementProps {
  propertyId: number;
}

const LICENSE_TYPES = [
  { value: 'homestay', label: 'Homestay License' },
  { value: 'guest_house', label: 'Guest House License' },
  { value: 'fssai', label: 'FSSAI License' },
  { value: 'pollution', label: 'Pollution Control Certificate' },
  { value: 'trade', label: 'Trade License' },
  { value: 'property_tax', label: 'Property Tax' },
  { value: 'fire', label: 'Fire Safety Certificate' },
  { value: 'electrical', label: 'Electrical Certificate' },
  { value: 'gst', label: 'GST Certificate' },
  { value: 'other', label: 'Other' },
];

export const LicenseManagement: React.FC<LicenseManagementProps> = ({ propertyId }) => {
  const { confirm } = useConfirm();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    license_type: 'homestay',
    license_name: '',
    license_number: '',
    issuing_authority: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    loadLicenses();
  }, [propertyId]);

  const loadLicenses = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/php/api/router.php?action=get_licenses&property_id=${propertyId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.status === 'success') {
        setLicenses(data.licenses || []);
      }
    } catch (error) {
      console.error('Failed to load licenses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      const method = editingId ? 'update_license' : 'add_license';
      const body = editingId ? { ...formData, id: editingId } : formData;

      const response = await fetch('/php/api/router.php?action=' + method, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, property_id: propertyId }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        loadLicenses();
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save license:', error);
    }
  };

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: t('delete_license_title', 'Delete License'),
      message: t('delete_license_message', 'Delete this license?'),
      confirmText: t('delete_license_confirm', 'Delete License'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const response = await fetch('/php/api/router.php?action=delete_license', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, property_id: propertyId }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        loadLicenses();
      }
    } catch (error) {
      console.error('Failed to delete license:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      license_type: 'homestay',
      license_name: '',
      license_number: '',
      issuing_authority: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const getStatusIcon = (status: string, daysRemaining: number) => {
    if (status === 'expired') return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (status === 'expiring_soon') return <AlertCircle className="w-5 h-5 text-orange-500" />;
    return <CheckCircle className="w-5 h-5 text-green-500" />;
  };

  const getStatusColor = (status: string) => {
    if (status === 'expired') return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800';
    if (status === 'expiring_soon') return 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800';
    return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800';
  };

  if (loading) {
    return <div className="text-center py-8">{t('loading_licenses_label', 'Loading licenses...')}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('license_management_heading', 'License Management')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('license_management_description', 'Track and manage property licenses')}</p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('add_license_button', 'Add License')}
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 space-y-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            {editingId ? t('edit_license_heading', 'Edit License') : t('add_new_license_heading', 'Add New License')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* License Type */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('license_type_label', 'License Type *')}
              </label>
              <StyledSelect
                value={formData.license_type}
                onChange={(value) => setFormData({ ...formData, license_type: value })}
                options={LICENSE_TYPES.map((type) => ({ value: type.value, label: type.label }))}
              />
            </div>

            {/* License Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('license_name_label', 'License Name')}
              </label>
              <input
                type="text"
                value={formData.license_name}
                onChange={(e) => setFormData({ ...formData, license_name: e.target.value })}
                placeholder={t('license_name_placeholder', 'e.g., Homestay License - Rajasthan')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>

            {/* License Number */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('license_number_label', 'License Number *')}
              </label>
              <input
                type="text"
                value={formData.license_number}
                onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                placeholder={t('license_number_placeholder', 'e.g., HM/2024/00123')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>

            {/* Issuing Authority */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('issuing_authority_label', 'Issuing Authority')}
              </label>
              <input
                type="text"
                value={formData.issuing_authority}
                onChange={(e) => setFormData({ ...formData, issuing_authority: e.target.value })}
                placeholder={t('issuing_authority_placeholder', 'e.g., Department of Tourism, Rajasthan')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('license_start_date_label', 'Start Date *')}
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {t('license_expiry_date_label', 'Expiry Date *')}
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('license_notes_label', 'Notes')}
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder={t('notes_placeholder', 'Any additional information...')}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={resetForm}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              {t('cancel_button', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              {editingId ? t('update_license_button', 'Update License') : t('add_license_button', 'Add License')}
            </button>
          </div>
        </div>
      )}

      {/* Licenses List */}
      <div className="space-y-4">
        {licenses.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-gray-300 dark:border-slate-600">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">{t('no_licenses_label', 'No licenses added yet')}</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
            >
              {t('add_first_license_button', 'Add your first license')}
            </button>
          </div>
        ) : (
          licenses.map((license) => (
            <div
              key={license.id}
              className={`border rounded-lg p-4 transition-all ${getStatusColor(license.status)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4 flex-1">
                  <div className="flex-shrink-0">{getStatusIcon(license.status, license.days_remaining)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 dark:text-white">
                        {LICENSE_TYPES.find((t) => t.value === license.license_type)?.label || license.license_type}
                      </h3>
                      {license.status === 'expiring_soon' && (
                        <span className="text-xs px-2 py-1 bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded">
                          Expires in {license.days_remaining} days
                        </span>
                      )}
                      {license.status === 'expired' && (
                        <span className="text-xs px-2 py-1 bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 rounded">
                          {t('expired_badge', 'Expired')}
                        </span>
                      )}
                    </div>
                    {license.license_name && <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{license.license_name}</p>}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">{t('license_number_field', 'License #:')}</span>
                        <p className="font-mono text-gray-900 dark:text-white">{license.license_number}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">{t('issued_by_field', 'Issued By:')}</span>
                        <p className="text-gray-900 dark:text-white">{license.issuing_authority || '—'}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">{t('valid_from_field', 'Valid From:')}</span>
                        <p className="text-gray-900 dark:text-white">{new Date(license.start_date).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <span className="text-gray-600 dark:text-gray-400">{t('expires_field', 'Expires:')}</span>
                        <p className="text-gray-900 dark:text-white font-semibold">{new Date(license.end_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {license.notes && <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 italic">Note: {license.notes}</p>}
                  </div>
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button
                    onClick={() => {
                      setFormData({
                        license_type: license.license_type,
                        license_name: license.license_name,
                        license_number: license.license_number,
                        issuing_authority: license.issuing_authority,
                        start_date: license.start_date,
                        end_date: license.end_date,
                        notes: license.notes,
                      });
                      setEditingId(license.id);
                      setShowForm(true);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(license.id)}
                    className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900 dark:text-blue-300">
            <strong>Notification Policy:</strong> You'll receive Telegram notifications 7 days, 4 days, and 1 day before each license expires. Make sure your super admin is added to the Telegram bot group.
          </div>
        </div>
      </div>
    </div>
  );
};
