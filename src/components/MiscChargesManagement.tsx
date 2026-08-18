import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react';
import DataTable from 'react-data-table-component';
import { getPropertySlug } from '../services/api';
import { useConfigurationData } from '../contexts/ConfigurationDataContext';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Input } from './Input';
import { t } from '../i18n/en';

interface MiscChargeTemplate {
  id: string | number;
  label: string;
  default_amount: number;
  category: string;
  is_system_default?: boolean;
}

interface MiscChargesManagementProps {
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

const _base = window.location.pathname.replace(/#.*$/, '').replace(/\/[^/]*$/, '');
const API_BASE = `${_base}/php/api/router.php`;

const customStyles = {
  headCells: {
    style: {
      fontSize: '11px',
      fontWeight: 600,
      color: '#64748b',
      paddingLeft: '12px',
      paddingRight: '12px',
    },
  },
  cells: {
    style: {
      fontSize: '13px',
      color: '#334155',
      padding: '12px',
    },
  },
  headRow: {
    style: {
      backgroundColor: '#f8fafc',
    },
  },
  subHeader: {
    style: {
      padding: '0 0 12px 0',
    },
  },
};

export const MiscChargesManagement: React.FC<MiscChargesManagementProps> = ({ onLogAudit }) => {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { miscCharges, isLoadingMisc, refreshMiscCharges } = useConfigurationData();
  const [charges, setCharges] = useState<MiscChargeTemplate[]>([]);
  const [isEditing, setIsEditing] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<Partial<MiscChargeTemplate>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({ label: '', default_amount: '' as unknown as number, category: 'Service' });
  const [searchText, setSearchText] = useState('');
  const [mobilePage, setMobilePage] = useState(1);

  const getLoggedInUserName = () => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`artists_farm_user_${getPropertySlug()}`);
      if (savedUser) {
        try {
          const userObj = JSON.parse(savedUser);
          if (userObj && userObj.name) return userObj.name;
        } catch { }
      }
    }
    return 'Admin';
  };

  useEffect(() => {
    if (miscCharges) {
      setCharges(miscCharges as MiscChargeTemplate[]);
    }
  }, [miscCharges]);

  const saveToDB = async (action: string, payload: any) => {
    try {
      const res = await fetch(`${API_BASE}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.status === 'success' || data.success) {
        refreshMiscCharges();
        return true;
      }
    } catch (err) {
      console.error(`Failed ${action}:`, err);
    }
    return false;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newCharge = {
      label: newForm.label,
      default_amount: newForm.default_amount,
      category: newForm.category,
    };
    saveToDB('add_misc_charge_template', newCharge).then((res) => {
      if (res) {
        if (onLogAudit) {
          const currentUserName = getLoggedInUserName();
          onLogAudit(`${currentUserName} added new miscellaneous charge template: '${newForm.label}' (Category: ${newForm.category}, Amount: ₹${newForm.default_amount})`);
        }
        setIsAddModalOpen(false);
        setNewForm({ label: '', default_amount: '' as unknown as number, category: 'Service' });
      }
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedCharge = charges.find(c => c.id === isEditing);
    if (!updatedCharge) return;

    // Prevent editing system defaults
    if (updatedCharge.is_system_default) {
      showToast('System default expense items cannot be edited. Create a new custom item instead.', { type: 'warning' });
      return;
    }

    const finalData = { ...updatedCharge, ...editForm };

    const changes: string[] = [];
    if (editForm.label && editForm.label !== updatedCharge.label) {
      changes.push(`name from '${updatedCharge.label}' to '${editForm.label}'`);
    }
    if (editForm.category && editForm.category !== updatedCharge.category) {
      changes.push(`category from '${updatedCharge.category}' to '${editForm.category}'`);
    }
    if (editForm.default_amount !== undefined && editForm.default_amount !== updatedCharge.default_amount) {
      changes.push(`amount from ₹${updatedCharge.default_amount} to ₹${editForm.default_amount}`);
    }

    saveToDB('add_misc_charge_template', finalData).then((res) => {
      if (res) {
        if (onLogAudit && changes.length > 0) {
          const currentUserName = getLoggedInUserName();
          onLogAudit(`${currentUserName} updated details of miscellaneous charge template '${updatedCharge.label}': ${changes.join(', ')}`);
        }
        setCharges(charges.map(c => c.id === isEditing ? finalData as MiscChargeTemplate : c));
        setIsEditing(null);
      }
    });
  };

  const handleDelete = async (id: string | number) => {
    const target = charges.find(c => c.id === id);

    // Prevent deletion of system defaults
    if (target?.is_system_default) {
      showToast('System default expense items cannot be deleted.', { type: 'warning' });
      return;
    }

    const confirmed = await confirm({
      title: t('delete_misc_charge_title', 'Delete Misc Charge Template'),
      message: t('delete_misc_charge_message', 'Are you sure you want to delete this charge template?'),
      confirmText: t('delete_misc_charge_confirm', 'Delete Template'),
      variant: 'danger',
    });

    if (confirmed) {
      saveToDB('delete_misc_charge_template', { id }).then((res) => {
        if (res) {
          if (onLogAudit && target) {
            const currentUserName = getLoggedInUserName();
            onLogAudit(`${currentUserName} deleted miscellaneous charge template '${target.label}'`);
          }
          setCharges(charges.filter(c => c.id !== id));
        }
      });
    }
  };

  const filteredCharges = charges.filter(c =>
    !searchText ||
    c.label.toLowerCase().includes(searchText.toLowerCase()) ||
    c.category.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      name: t('service_id_column', 'Service ID'),
      selector: (row: MiscChargeTemplate) => row.id,
      width: '100px',
      cell: (row: MiscChargeTemplate) => (
        <span className="font-mono text-xs text-slate-500">{row.id}</span>
      ),
    },
    {
      name: t('service_name_column', 'Service Name'),
      selector: (row: MiscChargeTemplate) => row.label,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <Input
            type="text"
            value={editForm.label || ''}
            onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white">{row.label}</span>
            {row.is_system_default && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600">
                {t('system_default_badge', 'Default')}
              </span>
            )}
          </div>
        );
      },
    },
    {
      name: t('category_column', 'Category'),
      selector: (row: MiscChargeTemplate) => row.category,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <Input
            type="text"
            value={editForm.category || ''}
            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
          />
        ) : (
          <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-semibold px-2.5 py-1 rounded-full">
            {row.category}
          </span>
        );
      },
    },
    {
      name: t('default_price_column', 'Default Price (₹)'),
      selector: (row: MiscChargeTemplate) => row.default_amount,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <Input
            type="number"
            value={editForm.default_amount || 0}
            onChange={(e) => setEditForm({ ...editForm, default_amount: Number(e.target.value) })}
          />
        ) : (
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{row.default_amount?.toLocaleString('en-IN') || 0}</span>
        );
      },
    },
    {
      name: t('actions_column', 'Actions'),
      width: '120px',
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        const isSystemDefault = row.is_system_default;
        return editing ? (
          <div className="flex justify-end gap-2">
            <button onClick={handleUpdate} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer">{t('save_button', 'Save')}</button>
            <button onClick={() => setIsEditing(null)} className="bg-slate-400 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer">{t('cancel_button', 'Cancel')}</button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setIsEditing(row.id);
                setEditForm(row);
              }}
              disabled={isSystemDefault}
              title={isSystemDefault ? t('system_default_edit_disabled_tooltip', 'System default items cannot be edited') : t('edit_button', 'Edit')}
              className={`p-1 rounded-full transition-colors ${
                isSystemDefault
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer'
              }`}
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(row.id)}
              disabled={isSystemDefault}
              title={isSystemDefault ? t('system_default_delete_disabled_tooltip', 'System default items cannot be deleted') : t('delete_button', 'Delete')}
              className={`p-1 rounded-full transition-colors ${
                isSystemDefault
                  ? 'text-slate-400 cursor-not-allowed'
                  : 'text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 cursor-pointer'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="misc-charges-management space-y-6">
      <PageHeader
        title={t('misc_charges_heading', 'Expense Categories & Items')}
        subtitle={t('misc_charges_description', 'System default categories (marked) cannot be edited or deleted. Add custom items within any category as needed.')}
      >
        <PageHeaderButton onClick={() => setIsAddModalOpen(true)} icon={Plus}>
          {t('add_new_service_button', 'Add New Service')}
        </PageHeaderButton>
      </PageHeader>

      <div className="misc-charges-management__table-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6">
        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={filteredCharges}
            customStyles={customStyles}
            pagination
            paginationPerPage={15}
            paginationRowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
            progressPending={isLoadingMisc}
            progressComponent={
              <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading charges...
              </div>
            }
            noDataComponent={
              <div className="text-center py-6 text-slate-500 font-medium">
                {t('no_misc_charges_found_label', 'No miscellaneous charges found.')}
              </div>
            }
            subHeader={
              <Input
                type="text"
                placeholder={t('search_misc_charges_placeholder', 'Search by service name or category...')}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full max-w-xs"
              />
            }
            highlightOnHover
            responsive
          />
        </div>

        {/* Touch-First Mobile Cards View with 10-Item Pagination */}
        <div className="md:hidden space-y-3">
          <div className="mb-3">
            <Input
              type="text"
              placeholder={t('search_misc_charges_placeholder', 'Search by service name or category...')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full"
            />
          </div>

          {(() => {
            const paginatedCharges = filteredCharges.slice((mobilePage - 1) * 10, mobilePage * 10);
            return (
              <>
                <div className="space-y-2.5">
                  {paginatedCharges.map((row) => (
                    <div key={row.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3.5 space-y-2 shadow-2xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">{row.label}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded inline-block">
                              {row.category || 'Service'}
                            </span>
                            <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 text-xs">
                              ₹{Number(row.default_amount).toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setIsEditing(row.id);
                              setEditForm(row);
                            }}
                            disabled={row.is_system_default}
                            className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 disabled:opacity-40 shrink-0"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>{t('edit_button', 'Edit')}</span>
                          </button>
                          {!row.is_system_default && (
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id, row.label)}
                              className="px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{t('delete_button', 'Delete')}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {filteredCharges.length === 0 && (
                    <div className="text-center py-6 text-slate-500 font-medium text-xs">
                      {t('no_misc_charges_found_label', 'No miscellaneous charges found.')}
                    </div>
                  )}
                </div>

                {/* 10-Item Mobile Pagination Controls */}
                {filteredCharges.length > 10 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      disabled={mobilePage === 1}
                      onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Previous
                    </button>
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Page {mobilePage} of {Math.ceil(filteredCharges.length / 10)}
                    </span>
                    <button
                      type="button"
                      disabled={mobilePage >= Math.ceil(filteredCharges.length / 10)}
                      onClick={() => setMobilePage((p) => Math.min(Math.ceil(filteredCharges.length / 10), p + 1))}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {isAddModalOpen && (
        <div className="misc-charges-management__modal fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h3 className="misc-charges-management__subtitle font-semibold text-lg text-slate-900 dark:text-white mb-4">{t('add_extra_service_title', 'Add Extra Service')}</h3>
            <form onSubmit={handleAdd} className="app-form app-form--add-misc-charge space-y-4">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('service_name_label', 'Service Name')}</label>
                <Input
                  type="text"
                  required
                  value={newForm.label}
                  onChange={(e) => setNewForm({ ...newForm, label: e.target.value })}
                  placeholder={t('service_name_placeholder', 'e.g. Pet Fee')}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_label', 'Category')}</label>
                <Input
                  type="text"
                  required
                  value={newForm.category}
                  onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                />
              </div>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('default_price_label', 'Default Price (₹)')}</label>
                <Input
                  type="number"
                  required
                  value={newForm.default_amount === '' as unknown as number ? '' : newForm.default_amount}
                  onChange={(e) => setNewForm({ ...newForm, default_amount: e.target.value === '' ? ('' as unknown as number) : Number(e.target.value) })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 dark:text-white transition-colors cursor-pointer">{t('cancel_button', 'Cancel')}</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition-colors cursor-pointer">{t('add_service_button', 'Add Service')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
