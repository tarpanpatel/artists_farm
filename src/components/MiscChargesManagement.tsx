import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, DollarSign } from 'lucide-react';
import DataTable from 'react-data-table-component';
import { getPropertySlug } from '../services/api';

interface MiscChargeTemplate {
  id: string | number;
  label: string;
  default_amount: number;
  category: string;
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
  const [charges, setCharges] = useState<MiscChargeTemplate[]>([]);
  const [isEditing, setIsEditing] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState<Partial<MiscChargeTemplate>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newForm, setNewForm] = useState({ label: '', default_amount: '' as unknown as number, category: 'Service' });
  const [searchText, setSearchText] = useState('');

  const getLoggedInUserName = () => {
    if (typeof window !== 'undefined') {
      const savedUser = localStorage.getItem(`artists_farm_user_${getPropertySlug()}`);
      if (savedUser) {
        try {
          const userObj = JSON.parse(savedUser);
          return userObj.username || userObj.name || 'Admin';
        } catch (e) {}
      }
    }
    return 'Admin';
  };

  useEffect(() => {
    fetch(`${API_BASE}?action=get_misc_catalog`)
      .then(res => res.json())
      .then(response => {
        if (response && response.status === 'success' && response.data) {
          setCharges(response.data);
        } else {
          setCharges([]);
        }
      })
      .catch(() => setCharges([]));
  }, []);

  const saveToDB = (action: string, payload: any) => {
    return fetch(`${API_BASE}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(r => r.json()).catch(console.error);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const newCharge = {
      label: newForm.label,
      default_amount: newForm.default_amount,
      category: newForm.category,
    };
    saveToDB('add_misc_charge_template', newCharge).then((res) => {
      if (onLogAudit) {
        const currentUserName = getLoggedInUserName();
        onLogAudit(`${currentUserName} added new miscellaneous charge template: '${newForm.label}' (Category: ${newForm.category}, Amount: ₹${newForm.default_amount})`);
      }
      fetch(`${API_BASE}?action=get_misc_catalog`)
        .then(r => r.json())
        .then(response => {
          if (response && response.status === 'success' && response.data) setCharges(response.data);
        });
      setIsAddModalOpen(false);
      setNewForm({ label: '', default_amount: '' as unknown as number, category: 'Service' });
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedCharge = charges.find(c => c.id === isEditing);
    if (!updatedCharge) return;
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

    saveToDB('add_misc_charge_template', finalData).then(() => {
      if (onLogAudit && changes.length > 0) {
        const currentUserName = getLoggedInUserName();
        onLogAudit(`${currentUserName} updated details of miscellaneous charge template '${updatedCharge.label}': ${changes.join(', ')}`);
      }
      setCharges(charges.map(c => c.id === isEditing ? finalData as MiscChargeTemplate : c));
      setIsEditing(null);
    });
  };

  const handleDelete = (id: string | number) => {
    const target = charges.find(c => c.id === id);
    (window as any).showConfirm('Are you sure you want to delete this charge template?', () => {
      saveToDB('delete_misc_charge_template', { id }).then(() => {
        if (onLogAudit && target) {
          const currentUserName = getLoggedInUserName();
          onLogAudit(`${currentUserName} deleted miscellaneous charge template '${target.label}'`);
        }
        setCharges(charges.filter(c => c.id !== id));
      });
    });
  };

  const filteredCharges = charges.filter(c =>
    !searchText ||
    c.label.toLowerCase().includes(searchText.toLowerCase()) ||
    c.category.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      name: 'Service ID',
      selector: (row: MiscChargeTemplate) => row.id,
      width: '100px',
      cell: (row: MiscChargeTemplate) => (
        <span className="font-mono text-xs text-gray-500">{row.id}</span>
      ),
    },
    {
      name: 'Service Name',
      selector: (row: MiscChargeTemplate) => row.label,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <input
            type="text"
            value={editForm.label || ''}
            onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
            className="w-full p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          />
        ) : (
          <span className="font-bold text-gray-900 dark:text-white">{row.label}</span>
        );
      },
    },
    {
      name: 'Category',
      selector: (row: MiscChargeTemplate) => row.category,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <input
            type="text"
            value={editForm.category || ''}
            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            className="w-full p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          />
        ) : (
          <span className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 text-[10px] font-bold px-2.5 py-1 rounded-full">
            {row.category}
          </span>
        );
      },
    },
    {
      name: 'Default Price (₹)',
      selector: (row: MiscChargeTemplate) => row.default_amount,
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <input
            type="number"
            value={editForm.default_amount || 0}
            onChange={(e) => setEditForm({ ...editForm, default_amount: Number(e.target.value) })}
            className="w-full p-1.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white"
          />
        ) : (
          <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{row.default_amount?.toLocaleString('en-IN') || 0}</span>
        );
      },
    },
    {
      name: 'Actions',
      width: '120px',
      cell: (row: MiscChargeTemplate) => {
        const editing = isEditing === row.id;
        return editing ? (
          <div className="flex justify-end gap-2">
            <button onClick={handleUpdate} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer">Save</button>
            <button onClick={() => setIsEditing(null)} className="bg-slate-400 hover:bg-slate-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer">Cancel</button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setIsEditing(row.id);
                setEditForm(row);
              }}
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 p-1 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDelete(row.id)}
              className="text-red-500 hover:text-red-700 dark:hover:text-red-400 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-6">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-500" />
              Miscellaneous Charges Master Library
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Manage standardized extra services (e.g. Pet Stay Fees, Decoration Costs) for consistent billing.
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add New Service
          </button>
        </div>

        <DataTable
          columns={columns}
          data={filteredCharges}
          customStyles={customStyles}
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[5, 10, 15, 20, 25, 50]}
          noDataComponent={
            <div className="text-center py-6 text-gray-500 font-medium">
              No miscellaneous charges found.
            </div>
          }
          subHeader={
            <input
              type="text"
              placeholder="Search by service name or category..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full max-w-xs p-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm"
            />
          }
          highlightOnHover
          responsive
        />
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-gray-200 dark:border-slate-700">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4">Add Extra Service</h3>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Service Name</label>
                <input
                  type="text"
                  required
                  value={newForm.label}
                  onChange={(e) => setNewForm({ ...newForm, label: e.target.value })}
                  placeholder="e.g. Pet Fee"
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <input
                  type="text"
                  required
                  value={newForm.category}
                  onChange={(e) => setNewForm({ ...newForm, category: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Default Price (₹)</label>
                <input
                  type="number"
                  required
                  value={newForm.default_amount === '' as unknown as number ? '' : newForm.default_amount}
                  onChange={(e) => setNewForm({ ...newForm, default_amount: e.target.value === '' ? ('' as unknown as number) : Number(e.target.value) })}
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-white font-bold"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-xl font-bold hover:bg-gray-50 dark:hover:bg-slate-700 dark:text-white transition-colors cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-sm transition-colors cursor-pointer">Add Service</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
