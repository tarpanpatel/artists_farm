import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GripVertical, Plus, Trash2, Edit2, Eye, EyeOff, ChevronDown, ChevronRight,
  Check, X, Search, LayoutDashboard, Users, CreditCard, ShoppingCart,
  UtensilsCrossed, Utensils, ClipboardList, Truck, CookingPot, Boxes,
  Wallet, UserCheck, Receipt, TrendingDown, Package, ShoppingBag,
  BarChart3, ScrollText, Grid, Bot, Settings, Navigation as NavIcon,
  Link as LinkIcon, ExternalLink, Paintbrush, ChevronUp, List,
  PanelLeftOpen, PanelLeftClose, Layers, DollarSign, ShieldCheck,
  PanelRightOpen
} from 'lucide-react';
import { NavMenuItem } from '../types';
import { saveNavMenuDB } from '../services/api';

interface NavMenuEditorProps {
  navItems: NavMenuItem[];
  onUpdateNavItems: (items: NavMenuItem[]) => void;
  activeRole: string;
}

const AVAILABLE_ICONS: Record<string, React.ComponentType<any>> = {
  LayoutDashboard, Users, CreditCard, ShoppingCart, UtensilsCrossed,
  Utensils, ClipboardList, Truck, CookingPot, Boxes, Wallet, UserCheck,
  Receipt, TrendingDown, Package, ShoppingBag, BarChart3, ScrollText,
  Grid, Bot, Settings, NavIcon, LinkIcon, Paintbrush, ShieldCheck,
  DollarSign, Layers, List
};

const ALL_ROLES = ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];

const AVAILABLE_PAGES: { title: string; tabKey: string; uniqueKey: string; icon: string; category: string }[] = [
  { title: 'Dashboard', tabKey: 'dashboard', uniqueKey: 'dashboard', icon: 'LayoutDashboard', category: 'Main' },
  { title: 'Guest Registration', tabKey: 'guests', uniqueKey: 'guest_registration', icon: 'Users', category: 'Residents' },
  { title: 'Billing & Checkout', tabKey: 'guests', uniqueKey: 'billing_checkout', icon: 'CreditCard', category: 'Residents' },
  { title: 'Take Food Order', tabKey: 'kitchen', uniqueKey: 'take_food_order', icon: 'UtensilsCrossed', category: 'Kitchen' },
  { title: 'Kitchen Orders', tabKey: 'kitchen', uniqueKey: 'kitchen_orders', icon: 'ClipboardList', category: 'Kitchen' },
  { title: 'Staff Meals', tabKey: 'kitchen', uniqueKey: 'staff_meals', icon: 'Utensils', category: 'Kitchen' },
  { title: 'Stock Requests', tabKey: 'inventory', uniqueKey: 'stock_requests', icon: 'Boxes', category: 'Inventory' },
  { title: 'Fulfill Stock Req', tabKey: 'inventory', uniqueKey: 'fulfill_stock_req', icon: 'Truck', category: 'Inventory' },
  { title: 'Deficit Shortfalls', tabKey: 'inventory', uniqueKey: 'deficit_shortfalls_log', icon: 'TrendingDown', category: 'Inventory' },
  { title: 'Kitchen Purchases', tabKey: 'inventory', uniqueKey: 'kitchen_purchases', icon: 'ShoppingBag', category: 'Inventory' },
  { title: 'Stock Log', tabKey: 'inventory', uniqueKey: 'stock_log', icon: 'Package', category: 'Inventory' },
  { title: 'Expenses', tabKey: 'petty_cash', uniqueKey: 'expenses', icon: 'DollarSign', category: 'Financials' },
  { title: 'Cash Drawer', tabKey: 'petty_cash', uniqueKey: 'cash_drawer', icon: 'Wallet', category: 'Financials' },
  { title: 'Misc Charges', tabKey: 'petty_cash', uniqueKey: 'misc_charges', icon: 'Receipt', category: 'Financials' },
  { title: 'Staff & Permissions', tabKey: 'staff', uniqueKey: 'staff_permissions', icon: 'ShieldCheck', category: 'Staff' },
  { title: 'Attendance Calendar', tabKey: 'staff', uniqueKey: 'attendance_calendar', icon: 'UserCheck', category: 'Staff' },
  { title: 'Staff Directory & Salaries', tabKey: 'staff', uniqueKey: 'staff_directory_salaries', icon: 'Users', category: 'Staff' },
  { title: 'Dashboard Analytics', tabKey: 'analytics', uniqueKey: 'dashboard_analytics', icon: 'BarChart3', category: 'Analytics' },
  { title: 'Purchase Analytics', tabKey: 'analytics', uniqueKey: 'purchase_analytics', icon: 'BarChart3', category: 'Analytics' },
  { title: 'Audit Logs', tabKey: 'audit_logs', uniqueKey: 'audit_logs_main', icon: 'ScrollText', category: 'Audit' },
  { title: 'Past Receipts Log', tabKey: 'audit_logs', uniqueKey: 'past_receipts_log', icon: 'ScrollText', category: 'Audit' },
  { title: 'Login Logs', tabKey: 'audit_logs', uniqueKey: 'login_logs', icon: 'ScrollText', category: 'Audit' },
  { title: 'System Health', tabKey: 'audit_logs', uniqueKey: 'system_health', icon: 'Settings', category: 'System' },
  { title: 'Telegram', tabKey: 'telegram', uniqueKey: 'telegram', icon: 'Bot', category: 'System' },
  { title: 'Edit Food Menu', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu', icon: 'Grid', category: 'Admin' },
  { title: 'Edit Main Menu', tabKey: 'menu_manager', uniqueKey: 'edit_main_menu', icon: 'NavIcon', category: 'Admin' },
  { title: 'Edit Kitchen Stock', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock', icon: 'Boxes', category: 'Admin' },
  { title: 'Edit Expense Items', tabKey: 'petty_cash', uniqueKey: 'edit_expense_items', icon: 'Layers', category: 'Admin' },
  { title: 'Data Export Center', tabKey: 'export', uniqueKey: 'data_export_center', icon: 'LayoutDashboard', category: 'System' },
  { title: 'Custom CSS Override', tabKey: 'custom_css', uniqueKey: 'custom_css', icon: 'Paintbrush', category: 'Admin' },
];

type DragState = {
  draggedId: string | null;
  overId: string | null;
  indentSide: 'left' | 'right' | null;
};

export const NavMenuEditor: React.FC<NavMenuEditorProps> = ({
  navItems,
  onUpdateNavItems,
  activeRole,
}) => {
  const [items, setItems] = useState<NavMenuItem[]>(navItems);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showAddPanel, setShowAddPanel] = useState(true);
  const [addPanelSearch, setAddPanelSearch] = useState('');
  const [addPanelCategory, setAddPanelCategory] = useState('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRolesFor, setShowRolesFor] = useState<string | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [drag, setDrag] = useState<DragState>({ draggedId: null, overId: null, indentSide: null });
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  useEffect(() => {
    setItems(navItems);
    // Auto-expand all parents on load
    const parentIds = navItems.filter(i => i.parentId).map(i => i.parentId!);
    setExpandedIds(new Set(parentIds));
  }, [navItems]);

  const markDirty = () => setHasUnsaved(true);

  // Build tree from flat list
  const buildTree = useCallback((flat: NavMenuItem[]): NavMenuItem[] => {
    const map = new Map<string, NavMenuItem & { children: NavMenuItem[] }>();
    const roots: (NavMenuItem & { children: NavMenuItem[] })[] = [];

    flat.forEach(item => {
      map.set(item.id, { ...item, children: [] });
    });

    flat.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Sort by order
    const sortByOrder = (arr: (NavMenuItem & { children: NavMenuItem[] })[]) => {
      arr.sort((a, b) => a.order - b.order);
      arr.forEach(n => sortByOrder(n.children));
    };
    sortByOrder(roots);

    return roots;
  }, []);

  const tree = buildTree(items);

  // Flatten tree back to list (preserving hierarchy order)
  const flattenTree = useCallback((nodes: NavMenuItem[], parentId: string | null = null): NavMenuItem[] => {
    const result: NavMenuItem[] = [];
    nodes.forEach((node, idx) => {
      const item = { ...node, parentId, order: idx + 1 };
      result.push(item);
      if ('children' in node && (node as any).children?.length > 0) {
        result.push(...flattenTree((node as any).children, node.id));
      }
    });
    return result;
  }, []);

  // Save to DB
  const handleSave = async () => {
    setIsSaving(true);
    const flatList = flattenTree(tree);
    const success = await saveNavMenuDB(flatList);
    if (success) {
      onUpdateNavItems(flatList);
      setHasUnsaved(false);
    }
    setIsSaving(false);
  };

  // Add items from the "Add Items" panel
  const handleAddPage = (page: typeof AVAILABLE_PAGES[0]) => {
    if (items.find(i => i.uniqueKey === page.uniqueKey)) return; // Already added
    const maxOrder = items.length;
    const newItem: NavMenuItem = {
      id: `nav-${Date.now().toString().slice(-6)}`,
      title: page.title,
      tabKey: page.tabKey,
      uniqueKey: page.uniqueKey,
      iconName: page.icon,
      order: maxOrder + 1,
      roles: ['Super Admin', 'Admin'],
      isVisible: true,
      parentId: null,
    };
    const updated = [...items, newItem];
    setItems(updated);
    markDirty();
  };

  // Add custom link
  const handleAddCustomLink = (title: string, url: string) => {
    const newItem: NavMenuItem = {
      id: `nav-${Date.now().toString().slice(-6)}`,
      title: title || 'Custom Link',
      tabKey: 'custom',
      uniqueKey: `custom_${Date.now().toString().slice(-6)}`,
      iconName: 'LinkIcon',
      order: items.length + 1,
      roles: ['Super Admin', 'Admin'],
      isVisible: true,
      customUrl: url,
      openInNewTab: true,
      parentId: null,
    };
    const updated = [...items, newItem];
    setItems(updated);
    markDirty();
  };

  // Delete item
  const handleDelete = (id: string) => {
    // Also delete all children
    const idsToDelete = new Set<string>([id]);
    const findChildren = (parentId: string) => {
      items.forEach(i => {
        if (i.parentId === parentId) {
          idsToDelete.add(i.id);
          findChildren(i.id);
        }
      });
    };
    findChildren(id);
    const updated = items.filter(i => !idsToDelete.has(i.id)).map((i, idx) => ({ ...i, order: idx + 1 }));
    setItems(updated);
    markDirty();
    setSelectedIds(prev => { const next = new Set(prev); idsToDelete.forEach(d => next.delete(d)); return next; });
  };

  // Bulk delete
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    const updated = items.filter(i => !selectedIds.has(i.id)).map((i, idx) => ({ ...i, order: idx + 1 }));
    setItems(updated);
    setSelectedIds(new Set());
    markDirty();
  };

  // Toggle visibility
  const handleToggleVisibility = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, isVisible: !i.isVisible } : i));
    markDirty();
  };

  // Inline rename
  const handleStartRename = (item: NavMenuItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveRename = (id: string) => {
    if (!editTitle.trim()) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, title: editTitle.trim() } : i));
    setEditingId(null);
    markDirty();
  };

  // Toggle role
  const handleToggleRole = (id: string, role: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const has = i.roles.includes(role);
      return { ...i, roles: has ? i.roles.filter(r => r !== role) : [...i.roles, role] };
    }));
    markDirty();
  };

  // Indent/outdent (make child of above / make sibling of parent)
  const handleIndent = (id: string) => {
    const flat = flattenTree(tree);
    const idx = flat.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const above = flat[idx - 1];
    // Can only indent if the item above is not already a child of someone
    setItems(prev => prev.map(i => i.id === id ? { ...i, parentId: above.id } : i));
    markDirty();
  };

  const handleOutdent = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item?.parentId) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, parentId: i.parentId || null } : i));
    markDirty();
  };

  // Move up/down within same level
  const handleMove = (id: string, dir: 'up' | 'down') => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const siblings = items.filter(i => i.parentId === (item.parentId || null)).sort((a, b) => a.order - b.order);
    const sibIdx = siblings.findIndex(s => s.id === id);
    if (dir === 'up' && sibIdx <= 0) return;
    if (dir === 'down' && sibIdx >= siblings.length - 1) return;

    const swapIdx = dir === 'up' ? sibIdx - 1 : sibIdx + 1;
    const otherId = siblings[swapIdx].id;

    setItems(prev => {
      const updated = prev.map(i => {
        if (i.id === id) return { ...i, order: siblings[swapIdx].order };
        if (i.id === otherId) return { ...i, order: item.order };
        return i;
      });
      return updated;
    });
    markDirty();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    dragRef.current = { startX: e.clientX, startY: e.clientY };
    setDrag(prev => ({ ...prev, draggedId: id }));
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const dx = e.clientX - (dragRef.current?.startX ?? e.clientX);
    const indentSide = dx > 60 ? 'right' : dx < -30 ? 'left' : null;
    setDrag(prev => ({ ...prev, overId: id, indentSide }));
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = drag.draggedId;
    if (!sourceId || sourceId === targetId) {
      setDrag({ draggedId: null, overId: null, indentSide: null });
      return;
    }

    const sourceItem = items.find(i => i.id === sourceId);
    if (!sourceItem) { setDrag({ draggedId: null, overId: null, indentSide: null }); return; }

    // Determine new parent based on indent direction
    let newParentId: string | null = null;
    if (drag.indentSide === 'right') {
      newParentId = targetId;
    } else if (drag.indentSide === 'left') {
      const targetItem = items.find(i => i.id === targetId);
      newParentId = targetItem?.parentId || null;
    }

    // Reorder: place source after target in the same parent
    const targetItem = items.find(i => i.id === targetId);
    const siblings = items.filter(i => i.parentId === (newParentId || null) && i.id !== sourceId);
    const targetIdx = siblings.findIndex(s => s.id === targetId);

    let newOrder: number;
    if (drag.indentSide === 'right') {
      // Place at end of target's children
      const targetChildren = items.filter(i => i.parentId === targetId);
      newOrder = targetChildren.length + 1;
    } else {
      newOrder = (targetItem?.order || 0) + (drag.indentSide === 'left' ? 0 : 1);
    }

    setItems(prev => {
      let updated = prev.map(i => {
        if (i.id === sourceId) return { ...i, parentId: newParentId, order: newOrder };
        return i;
      });
      // Re-order siblings
      const siblings = updated.filter(i => i.parentId === (newParentId || null) && i.id !== sourceId);
      siblings.sort((a, b) => a.order - b.order);
      const insertIdx = siblings.findIndex(s => s.order >= newOrder);
      if (insertIdx >= 0) {
        siblings.splice(insertIdx, 0, updated.find(i => i.id === sourceId)!);
      } else {
        siblings.push(updated.find(i => i.id === sourceId)!);
      }
      siblings.forEach((s, idx) => {
        const idx2 = updated.findIndex(i => i.id === s.id);
        if (idx2 >= 0) updated[idx2] = { ...updated[idx2], order: idx + 1 };
      });
      return updated;
    });

    markDirty();
    setDrag({ draggedId: null, overId: null, indentSide: null });
  };

  const handleDragEnd = () => {
    setDrag({ draggedId: null, overId: null, indentSide: null });
  };

  // Toggle expand/collapse
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Expand/collapse all
  const expandAll = () => {
    const parentIds = items.filter(i => i.parentId).map(i => i.parentId!);
    setExpandedIds(new Set(parentIds));
  };
  const collapseAll = () => setExpandedIds(new Set());

  // Filtered add panel pages
  const addedKeys = new Set(items.map(i => i.uniqueKey));
  const filteredPages = AVAILABLE_PAGES.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(addPanelSearch.toLowerCase());
    const matchCat = addPanelCategory === 'All' || p.category === addPanelCategory;
    return matchSearch && matchCat;
  });

  const addPanelCategories = ['All', ...new Set(AVAILABLE_PAGES.map(p => p.category))];

  // Render a menu tree item
  const renderTreeItem = (item: NavMenuItem & { children?: NavMenuItem[] }, depth: number = 0) => {
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const isDragging = drag.draggedId === item.id;
    const isOver = drag.overId === item.id;
    const hasChildren = item.children && item.children.length > 0;
    const IconComp = AVAILABLE_ICONS[item.iconName] || NavIcon;

    return (
      <div key={item.id} className="select-none">
        <div
          draggable={!isEditing}
          onDragStart={(e) => handleDragStart(e, item.id)}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, item.id)}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-xs group ${
            isDragging ? 'opacity-40 bg-blue-50 border-blue-300' :
            isOver ? `bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-200 ${drag.indentSide === 'right' ? 'ml-6 border-l-4 border-l-blue-500' : drag.indentSide === 'left' ? 'ml-0 border-l-4 border-l-red-400' : ''}` :
            item.isVisible ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs' :
            'bg-slate-50 border-slate-200 opacity-60'
          }`}
          style={{ marginLeft: depth > 0 ? `${depth * 28}px` : '0px' }}
        >
          {/* Drag Handle */}
          <div className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition-colors" title="Drag to reorder. Drag right to nest, left to unnest.">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => {
              setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                return next;
              });
            }}
            className="w-3.5 h-3.5 rounded text-blue-600 shrink-0 cursor-pointer"
          />

          {/* Expand/Collapse Toggle */}
          <button
            onClick={() => toggleExpand(item.id)}
            className={`p-0.5 rounded transition-colors shrink-0 cursor-pointer ${hasChildren ? 'text-slate-500 hover:bg-slate-100' : 'text-transparent pointer-events-none'}`}
            title={hasChildren ? (isExpanded ? 'Collapse children' : 'Expand children') : ''}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <span className="w-3.5 h-3.5 block" />
            )}
          </button>

          {/* Icon */}
          <button
            onClick={() => {
              const iconNames = Object.keys(AVAILABLE_ICONS);
              const currentIdx = iconNames.indexOf(item.iconName);
              const nextIcon = iconNames[(currentIdx + 1) % iconNames.length];
              setItems(prev => prev.map(i => i.id === item.id ? { ...i, iconName: nextIcon } : i));
              markDirty();
            }}
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              item.isVisible ? 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-600' : 'bg-slate-100 text-slate-400'
            }`}
            title="Click to cycle icon"
          >
            <IconComp className="w-3.5 h-3.5" />
          </button>

          {/* Title (inline editable) */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveRename(item.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 px-2 py-0.5 text-xs font-bold border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button onClick={() => handleSaveRename(item.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingId(null)} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-bold text-slate-800 truncate cursor-text hover:text-blue-600 ${!item.isVisible ? 'line-through text-slate-400' : ''}`}
                  onClick={() => handleStartRename(item)}
                  title="Click to rename"
                >
                  {item.title}
                </span>
                {item.customUrl && (
                  <ExternalLink className="w-3 h-3 text-purple-400 shrink-0" title="External link" />
                )}
                {!item.customUrl && (
                  <span className="text-[9px] font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500 truncate max-w-[120px]">
                    {item.uniqueKey}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Indent/Outdent buttons */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => handleOutdent(item.id)}
              disabled={!item.parentId}
              className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
              title="Outdent (move left)"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleIndent(item.id)}
              disabled={depth >= 2}
              className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer"
              title="Indent (move right, make child)"
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Move up/down */}
          <div className="flex flex-col gap-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => handleMove(item.id, 'up')} className="p-0 text-slate-400 hover:text-slate-700 cursor-pointer" title="Move up"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={() => handleMove(item.id, 'down')} className="p-0 text-slate-400 hover:text-slate-700 cursor-pointer" title="Move down"><ChevronDown className="w-3 h-3" /></button>
          </div>

          {/* Visibility toggle */}
          <button
            onClick={() => handleToggleVisibility(item.id)}
            className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${
              item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'
            }`}
            title={item.isVisible ? 'Visible — click to hide' : 'Hidden — click to show'}
          >
            {item.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Roles indicator */}
          <button
            onClick={() => setShowRolesFor(showRolesFor === item.id ? null : item.id)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors shrink-0 cursor-pointer"
            title="Edit role permissions"
          >
            {item.roles.length}r
          </button>

          {/* Delete */}
          <button
            onClick={() => handleDelete(item.id)}
            className="p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Roles dropdown (inline) */}
        {showRolesFor === item.id && (
          <div className="ml-12 my-1 p-2 bg-blue-50 rounded-lg border border-blue-200 flex flex-wrap gap-1">
            {ALL_ROLES.map(role => {
              const has = item.roles.includes(role);
              return (
                <button
                  key={role}
                  onClick={() => handleToggleRole(item.id, role)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${
                    has ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                  }`}
                >
                  {has ? '✓ ' : ''}{role}
                </button>
              );
            })}
          </div>
        )}

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {item.children!.sort((a, b) => a.order - b.order).map(child =>
              renderTreeItem(child as NavMenuItem & { children?: NavMenuItem[] }, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[600px]">
      {/* LEFT PANEL: Menu Structure */}
      <div className={`flex-1 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col ${showAddPanel ? 'lg:max-w-[65%]' : ''}`}>
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-slate-900 text-sm">Menu Structure</h3>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
                {items.length} items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddPanel(!showAddPanel)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  showAddPanel ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
                Add Items
              </button>
              {hasUnsaved && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Menu'}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag to reorder</span>
            <span>→ Right = indent (nest)</span>
            <span>← Left = outdent</span>
            <span className="flex items-center gap-1"><Edit2 className="w-3 h-3" /> Click title to rename</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
          {selectedIds.size > 0 ? (
            <>
              <span className="text-[11px] font-bold text-blue-700">{selectedIds.size} selected</span>
              <button onClick={handleBulkDelete} className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded cursor-pointer">
                Delete Selected
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded cursor-pointer">
                Clear
              </button>
            </>
          ) : (
            <>
              <button onClick={expandAll} className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">Expand All</button>
              <span className="text-slate-300">|</span>
              <button onClick={collapseAll} className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">Collapse All</button>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                <input type="checkbox" checked={selectedIds.size === items.length && items.length > 0} onChange={() => {
                  if (selectedIds.size === items.length) setSelectedIds(new Set());
                  else setSelectedIds(new Set(items.map(i => i.id)));
                }} className="w-3 h-3" />
                Select All
              </label>
            </>
          )}
        </div>

        {/* Menu Tree */}
        <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {tree.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
              <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-bold text-sm mb-1">Menu is empty</p>
              <p className="text-slate-400 text-xs">Click "Add Items" to start building your menu</p>
            </div>
          ) : (
            tree.map(item => renderTreeItem(item as NavMenuItem & { children?: NavMenuItem[] }, 0))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
          <span>{items.filter(i => i.isVisible).length} visible / {items.length} total</span>
          {hasUnsaved && <span className="text-amber-600 font-bold">Unsaved changes</span>}
        </div>
      </div>

      {/* RIGHT PANEL: Add Items */}
      {showAddPanel && (
        <div className="w-full lg:w-80 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              Add Items
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Click to add pages to your menu</p>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                type="text"
                value={addPanelSearch}
                onChange={(e) => setAddPanelSearch(e.target.value)}
                placeholder="Search pages..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-3 py-1.5 border-b border-slate-100 flex flex-wrap gap-1">
            {addPanelCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setAddPanelCategory(cat)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  addPanelCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Pages list */}
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredPages.map(page => {
              const isAdded = addedKeys.has(page.uniqueKey);
              const PageIcon = AVAILABLE_ICONS[page.icon] || NavIcon;
              return (
                <button
                  key={page.uniqueKey}
                  onClick={() => !isAdded && handleAddPage(page)}
                  disabled={isAdded}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all text-left ${
                    isAdded
                      ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default'
                      : 'bg-slate-50 text-slate-700 border border-transparent hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 cursor-pointer'
                  }`}
                >
                  <PageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold truncate flex-1">{page.title}</span>
                  {isAdded ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0 opacity-0 group-hover:opacity-100" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Custom Link section */}
          <CustomLinkAdder onAdd={handleAddCustomLink} />
        </div>
      )}
    </div>
  );
};

// Custom Link Adder sub-component
const CustomLinkAdder: React.FC<{ onAdd: (title: string, url: string) => void }> = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (!url.trim()) return;
    onAdd(title.trim() || 'Custom Link', url.trim());
    setTitle('');
    setUrl('');
    setIsOpen(false);
  };

  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer"
      >
        <LinkIcon className="w-3.5 h-3.5" />
        Add Custom Link
        {isOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Link text"
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={!url.trim()}
            className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40"
          >
            Add Link
          </button>
        </div>
      )}
    </div>
  );
};
