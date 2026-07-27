import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sortable from 'sortablejs';
import * as LucideIcons from 'lucide-react';
import {
  GripVertical, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight,
  Check, X, Search, LayoutDashboard, Navigation as NavIcon,
  ChevronUp, Layers, PanelLeftClose, PanelRightOpen,
  ExternalLink
} from 'lucide-react';
import { NavMenuItem } from '../types';
import { saveNavMenuDB } from '../services/api';

interface NavMenuEditorProps {
  navItems: NavMenuItem[];
  onUpdateNavItems: (items: NavMenuItem[]) => void;
  activeRole: string;
}

const ALL_ROLES = ['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff'];

const PAGE_OPTIONS = [
  { label: 'Dashboard', tabKey: 'dashboard', uniqueKey: 'dashboard' },
  { label: 'Guest Registration', tabKey: 'guests', uniqueKey: 'guest_registration' },
  { label: 'Billing & Checkout', tabKey: 'guests', uniqueKey: 'billing_checkout' },
  { label: 'Take Food Order', tabKey: 'kitchen', uniqueKey: 'take_food_order' },
  { label: 'Kitchen Orders', tabKey: 'kitchen', uniqueKey: 'kitchen_orders' },
  { label: 'Staff Meals', tabKey: 'kitchen', uniqueKey: 'staff_meals' },
  { label: 'Stock Requests', tabKey: 'inventory', uniqueKey: 'stock_requests' },
  { label: 'Fulfill Stock Req', tabKey: 'inventory', uniqueKey: 'fulfill_stock_req' },
  { label: 'Kitchen Wastage', tabKey: 'inventory', uniqueKey: 'deficit_shortfalls_log' },
  { label: 'Kitchen Purchases', tabKey: 'inventory', uniqueKey: 'kitchen_purchases' },
  { label: 'Stock Log', tabKey: 'inventory', uniqueKey: 'stock_log' },
  { label: 'Expenses', tabKey: 'petty_cash', uniqueKey: 'expenses' },
  { label: 'Cash Drawer', tabKey: 'petty_cash', uniqueKey: 'cash_drawer' },
  { label: 'Misc Charges', tabKey: 'petty_cash', uniqueKey: 'misc_charges' },
  { label: 'Staff & Permissions', tabKey: 'staff', uniqueKey: 'staff_permissions' },
  { label: 'Attendance Calendar', tabKey: 'staff', uniqueKey: 'attendance_calendar' },
  { label: 'Staff Directory', tabKey: 'staff', uniqueKey: 'staff_directory_salaries' },
  { label: 'Dashboard Analytics', tabKey: 'analytics', uniqueKey: 'dashboard_analytics' },
  { label: 'Purchase Analytics', tabKey: 'analytics', uniqueKey: 'purchase_analytics' },
  { label: 'Audit Logs', tabKey: 'audit_logs', uniqueKey: 'audit_logs_main' },
  { label: 'Past Receipts', tabKey: 'audit_logs', uniqueKey: 'past_receipts_log' },
  { label: 'Login Logs', tabKey: 'audit_logs', uniqueKey: 'login_logs' },
  { label: 'System Health', tabKey: 'audit_logs', uniqueKey: 'system_health' },
  { label: 'Telegram Bot', tabKey: 'telegram', uniqueKey: 'telegram' },
  { label: 'Edit Food Menu', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu' },
  { label: 'Edit Main Menu', tabKey: 'menu_manager', uniqueKey: 'edit_main_menu' },
  { label: 'Edit Kitchen Stock', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock' },
  { label: 'Edit Expense Items', tabKey: 'petty_cash', uniqueKey: 'edit_expense_items' },
  { label: 'Data Export', tabKey: 'export', uniqueKey: 'data_export_center' },
  { label: 'Custom CSS', tabKey: 'custom_css', uniqueKey: 'custom_css' },
  { label: 'Error Logs', tabKey: 'audit_logs', uniqueKey: 'errors' },
  { label: 'Recipe Builder', tabKey: 'kitchen', uniqueKey: 'beta_recipe_builder' },
  { label: 'Custom URL', tabKey: 'custom', uniqueKey: '' },
];

const ICON_SEARCH_LIST = [
  'LayoutDashboard','Users','CreditCard','ShoppingCart','UtensilsCrossed','Utensils',
  'ClipboardList','Truck','CookingPot','Boxes','Wallet','UserCheck','Receipt',
  'TrendingDown','Package','ShoppingBag','BarChart3','ScrollText','Grid3x3','Bot',
  'Settings','Navigation','Link','Paintbrush','DollarSign','ShieldCheck','Layers',
  'List','Calendar','BookOpen','ShieldAlert','Lock','FileSpreadsheet','Sliders',
  'Activity','Send','LogOut','Home','Bell','Phone','MapPin','Star','Heart',
  'Eye','Clock','Tag','Image','Folder','File','Archive','Download','Upload',
  'Printer','RefreshCw','RotateCw','Power','Wifi','Globe','Search','Key',
  'Award','Briefcase','Building','Camera','Car','Cloud','Code','Coffee',
  'Database','Disc','Film','Hash','Headphones','HelpCircle','Info','Mail',
  'Megaphone','Mic','Monitor','MousePointer','Music','PieChart','Puzzle',
  'QrCode','Save','Server','Share2','ShoppingBasket','Speaker','Tablet',
  'Target','Terminal','ThumbsUp','Tool','TrafficCone','Tv','Type','Video',
  'Voicemail','Watch','Wrench','Zap'
].filter((v, i, a) => a.indexOf(v) === i);

const getIconComponent = (name: string): React.ComponentType<any> => {
  return (LucideIcons as any)[name] || NavIcon;
};

export const NavMenuEditor: React.FC<NavMenuEditorProps> = ({
  navItems,
  onUpdateNavItems,
  activeRole,
}) => {
  const [items, setItems] = useState<NavMenuItem[]>(navItems);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showIconPickerFor, setShowIconPickerFor] = useState<string | null>(null);
  const [iconSearch, setIconSearch] = useState('');
  const [showTabPickerFor, setShowTabPickerFor] = useState<string | null>(null);
  const [tabSearch, setTabSearch] = useState('');
  const [customUrlInput, setCustomUrlInput] = useState<Record<string, string>>({});

  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '', tabKey: 'dashboard', uniqueKey: 'dashboard',
    iconName: 'LayoutDashboard', customUrl: '', roles: ['Super Admin'] as string[]
  });

  const sortableInstances = useRef<Sortable[]>([]);
  const sortableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(navItems);
    const parentIds = navItems.filter(i => i.parentId).map(i => i.parentId!);
    setExpandedIds(new Set(parentIds));
  }, [navItems]);

  const markDirty = () => setHasUnsaved(true);

  const buildTree = useCallback((flat: NavMenuItem[]): (NavMenuItem & { children: any[] })[] => {
    const map = new Map<string, NavMenuItem & { children: any[] }>();
    const roots: (NavMenuItem & { children: any[] })[] = [];
    flat.forEach(item => map.set(item.id, { ...item, children: [] }));
    flat.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortByOrder = (arr: (NavMenuItem & { children: any[] })[]) => {
      arr.sort((a, b) => a.order - b.order);
      arr.forEach(n => sortByOrder(n.children));
    };
    sortByOrder(roots);
    return roots;
  }, []);

  const tree = buildTree(items);

  const flattenAll = useCallback((nodes: (NavMenuItem & { children: any[] })[], parentId: string | null = null): NavMenuItem[] => {
    const result: NavMenuItem[] = [];
    nodes.forEach((node, idx) => {
      result.push({ ...node, parentId, order: idx + 1 });
      if (node.children?.length > 0) {
        result.push(...flattenAll(node.children, node.id));
      }
    });
    return result;
  }, []);

  const flattenVisible = useCallback((nodes: (NavMenuItem & { children: any[] })[], parentId: string | null = null): NavMenuItem[] => {
    const result: NavMenuItem[] = [];
    nodes.forEach((node, idx) => {
      result.push({ ...node, parentId, order: idx + 1 });
      if (expandedIds.has(node.id) && node.children?.length > 0) {
        result.push(...flattenVisible(node.children, node.id));
      }
    });
    return result;
  }, [expandedIds]);

  const getDepth = (item: NavMenuItem): number => {
    let depth = 0;
    let current = item;
    while (current.parentId) {
      depth++;
      const parent = items.find(i => i.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return depth;
  };

  // ========== SORTABLE.JS ==========
  const extractFromDOM = useCallback((): NavMenuItem[] => {
    const result: NavMenuItem[] = [];
    const processList = (ulEl: HTMLUListElement, parentId: string | null) => {
      const lis = Array.from(ulEl.children).filter(el => el.tagName === 'LI') as HTMLLIElement[];
      lis.forEach((li, idx) => {
        const id = li.getAttribute('data-id');
        if (!id) return;
        const item = items.find(i => i.id === id);
        if (!item) return;
        result.push({ ...item, parentId, order: idx + 1 });
        const childUl = li.querySelector(':scope > ul') as HTMLUListElement | null;
        if (childUl) processList(childUl, id);
      });
    };
    const rootUl = sortableContainerRef.current?.querySelector(':scope > ul') as HTMLUListElement | null;
    if (rootUl) processList(rootUl, null);
    return result;
  }, [items]);

  const initSortable = useCallback(() => {
    sortableInstances.current.forEach(s => s.destroy());
    sortableInstances.current = [];
    if (!sortableContainerRef.current) return;
    const allUls = sortableContainerRef.current.querySelectorAll('ul[data-sortable]');
    allUls.forEach(ul => {
      const instance = Sortable.create(ul as HTMLUListElement, {
        group: 'nav-menu',
        animation: 150,
        handle: '.hs-handle',
        ghostClass: 'nav-sortable-ghost',
        chosenClass: 'nav-sortable-chosen',
        dragClass: 'nav-sortable-drag',
        easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
        onEnd: () => {
          const newItems = extractFromDOM();
          setItems(newItems);
          markDirty();
        },
      });
      sortableInstances.current.push(instance);
    });
  }, [extractFromDOM]);

  useEffect(() => {
    const timer = setTimeout(initSortable, 50);
    return () => clearTimeout(timer);
  }, [tree, expandedIds, initSortable]);

  // ========== SAVE ==========
  const handleSave = async () => {
    setIsSaving(true);
    const treeNodes = buildTree(items);
    const flatList = flattenAll(treeNodes);
    const success = await saveNavMenuDB(flatList);
    if (success) {
      onUpdateNavItems(flatList);
      setHasUnsaved(false);
    }
    setIsSaving(false);
  };

  // ========== ADD NEW ITEM ==========
  const handleAddItem = () => {
    if (!newItem.title.trim()) return;
    const id = `nav-${Date.now().toString().slice(-6)}`;
    const page = PAGE_OPTIONS.find(p => p.tabKey === newItem.tabKey && p.uniqueKey === newItem.uniqueKey);
    const item: NavMenuItem = {
      id,
      title: newItem.title.trim(),
      tabKey: newItem.tabKey,
      uniqueKey: newItem.uniqueKey || `custom_${id}`,
      iconName: newItem.iconName,
      order: items.length + 1,
      roles: [...newItem.roles],
      isVisible: true,
      parentId: null,
      customUrl: newItem.customUrl || undefined,
    };
    setItems(prev => [...prev, item]);
    setNewItem({ title: '', tabKey: 'dashboard', uniqueKey: 'dashboard', iconName: 'LayoutDashboard', customUrl: '', roles: ['Super Admin'] });
    setShowAddForm(false);
    markDirty();
  };

  // ========== DELETE ==========
  const handleDelete = (id: string) => {
    const idsToDelete = new Set<string>([id]);
    const findChildren = (parentId: string) => {
      items.forEach(i => { if (i.parentId === parentId) { idsToDelete.add(i.id); findChildren(i.id); } });
    };
    findChildren(id);
    setItems(prev => prev.filter(i => !idsToDelete.has(i.id)).map((i, idx) => ({ ...i, order: idx + 1 })));
    markDirty();
    setSelectedIds(prev => { const next = new Set(prev); idsToDelete.forEach(d => next.delete(d)); return next; });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    setItems(prev => prev.filter(i => !selectedIds.has(i.id)).map((i, idx) => ({ ...i, order: idx + 1 })));
    setSelectedIds(new Set());
    markDirty();
  };

  // ========== INLINE EDITING ==========
  const handleToggleVisibility = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, isVisible: !i.isVisible } : i));
    markDirty();
  };

  const handleStartRename = (item: NavMenuItem) => {
    setEditingTitleId(item.id);
    setEditTitle(item.title);
  };

  const handleSaveRename = (id: string) => {
    if (!editTitle.trim()) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, title: editTitle.trim() } : i));
    setEditingTitleId(null);
    markDirty();
  };

  const handleIconChange = (id: string, iconName: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, iconName } : i));
    setShowIconPickerFor(null);
    markDirty();
  };

  const handleTabChange = (id: string, tabKey: string, uniqueKey: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, tabKey, uniqueKey } : i));
    setShowTabPickerFor(null);
    setTabSearch('');
    markDirty();
  };

  const handleCustomUrlSave = (id: string) => {
    const url = customUrlInput[id] || '';
    setItems(prev => prev.map(i => i.id === id ? { ...i, customUrl: url, tabKey: 'custom', uniqueKey: `custom_${id}` } : i));
    setCustomUrlInput(prev => { const n = { ...prev }; delete n[id]; return n; });
    markDirty();
  };

  const handleToggleRole = (id: string, role: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const has = i.roles.includes(role);
      return { ...i, roles: has ? i.roles.filter(r => r !== role) : [...i.roles, role] };
    }));
    markDirty();
  };

  // ========== INDENT/OUTDENT ==========
  const handleIndent = (id: string) => {
    const flat = flattenVisible(tree);
    const idx = flat.findIndex(i => i.id === id);
    if (idx <= 0) return;
    const above = flat[idx - 1];
    setItems(prev => prev.map(i => i.id === id ? { ...i, parentId: above.id } : i));
    markDirty();
  };

  const handleOutdent = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item?.parentId) return;
    setItems(prev => prev.map(i => i.id === id ? { ...i, parentId: null } : i));
    markDirty();
  };

  // ========== EXPAND/COLLAPSE ==========
  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const expandAll = () => setExpandedIds(new Set(items.filter(i => i.parentId).map(i => i.parentId!)));
  const collapseAll = () => setExpandedIds(new Set());

  // ========== FILTERED LISTS ==========
  const filteredIcons = ICON_SEARCH_LIST.filter(name =>
    name.toLowerCase().includes(iconSearch.toLowerCase())
  );
  const filteredTabs = PAGE_OPTIONS.filter(p =>
    p.label.toLowerCase().includes(tabSearch.toLowerCase())
  );

  // ========== RENDER TREE ITEM ==========
  const renderTreeItem = (item: NavMenuItem & { children?: any[] }, depth: number = 0) => {
    const isExpanded = expandedIds.has(item.id);
    const isEditingTitle = editingTitleId === item.id;
    const hasChildren = item.children && item.children.length > 0;
    const IconComp = getIconComponent(item.iconName);
    const depthColors = ['border-l-blue-400', 'border-l-emerald-400', 'border-l-amber-400'];
    const depthBg = ['', 'bg-blue-50/30', 'bg-emerald-50/30'];
    const currentPage = PAGE_OPTIONS.find(p => p.tabKey === item.tabKey && p.uniqueKey === item.uniqueKey);

    return (
      <li key={item.id} data-id={item.id} className="nav-menu-item" style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : '0px' }}>
        <div className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border border-l-[3px] transition-all text-xs group my-0.5 ${
          item.isVisible ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm' :
          'bg-slate-50 border-slate-200 opacity-60'
        } ${depthColors[Math.min(depth, 2)]} ${depthBg[Math.min(depth, 2)] || ''}`}>

          {/* Drag Handle */}
          <div className="hs-handle p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            title="Drag to reorder">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }}
            className="w-3.5 h-3.5 rounded text-blue-600 shrink-0 cursor-pointer"
          />

          {/* Expand/Collapse */}
          <button
            onClick={() => toggleExpand(item.id)}
            className={`p-0.5 rounded transition-colors shrink-0 cursor-pointer ${hasChildren ? 'text-slate-500 hover:bg-slate-100' : 'text-transparent pointer-events-none'}`}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5 h-3.5 block" />}
          </button>

          {/* Icon - clickable to change */}
          <button
            onClick={() => setShowIconPickerFor(showIconPickerFor === item.id ? null : item.id)}
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
              item.isVisible ? 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-600' : 'bg-slate-100 text-slate-400'
            }`}
            title="Click to change icon"
          >
            <IconComp className="w-3.5 h-3.5" />
          </button>

          {/* Title - clickable to rename */}
          <div className="flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-1">
                <input
                  type="text" autoFocus value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(item.id); if (e.key === 'Escape') setEditingTitleId(null); }}
                  className="flex-1 px-2 py-0.5 text-xs font-bold border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button onClick={() => handleSaveRename(item.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingTitleId(null)} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <span className={`font-bold text-slate-800 truncate cursor-text hover:text-blue-600 ${!item.isVisible ? 'line-through text-slate-400' : ''}`} onClick={() => handleStartRename(item)} title="Click to rename">
                {item.title}
              </span>
            )}
          </div>

          {/* Tab/Page badge - clickable to change */}
          <button
            onClick={() => setShowTabPickerFor(showTabPickerFor === item.id ? null : item.id)}
            className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors shrink-0 cursor-pointer max-w-[100px] truncate"
            title="Click to change page target"
          >
            {item.customUrl ? <span className="flex items-center gap-0.5"><ExternalLink className="w-2.5 h-2.5" /> URL</span> : (currentPage?.label || item.tabKey)}
          </button>

          {/* Visibility */}
          <button onClick={() => handleToggleVisibility(item.id)} className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
            {item.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Roles badge */}
          <button onClick={() => setShowIconPickerFor(showIconPickerFor === `roles-${item.id}` ? null : `roles-${item.id}`)} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shrink-0 cursor-pointer" title="Click to edit roles">
            {item.roles.length}r
          </button>

          {/* Indent/Outdent - ALWAYS VISIBLE */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={() => handleOutdent(item.id)} disabled={!item.parentId}
              className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="Outdent (move left)">
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleIndent(item.id)} disabled={depth >= 2}
              className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-20 disabled:cursor-not-allowed cursor-pointer transition-colors"
              title="Indent (move right)">
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Delete */}
          <button onClick={() => handleDelete(item.id)} className="p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Icon Picker Dropdown */}
        {showIconPickerFor === item.id && (
          <div className="ml-12 my-1 p-2 bg-white rounded-lg border border-slate-200 shadow-lg max-w-[320px]">
            <div className="relative mb-2">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1.5" />
              <input type="text" autoFocus value={iconSearch} onChange={(e) => setIconSearch(e.target.value)} placeholder="Search icons..."
                className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div className="grid grid-cols-8 gap-1 max-h-[200px] overflow-y-auto">
              {filteredIcons.map(name => {
                const Ic = getIconComponent(name);
                return (
                  <button key={name} onClick={() => handleIconChange(item.id, name)}
                    className={`p-1.5 rounded transition-colors cursor-pointer ${item.iconName === name ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'text-slate-600 hover:bg-slate-100'}`}
                    title={name}>
                    <Ic className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setShowIconPickerFor(null); setIconSearch(''); }} className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">Close</button>
          </div>
        )}

        {/* Roles Dropdown */}
        {showIconPickerFor === `roles-${item.id}` && (
          <div className="ml-12 my-1 p-2 bg-blue-50 rounded-lg border border-blue-200 flex flex-wrap gap-1">
            {ALL_ROLES.map(role => {
              const has = item.roles.includes(role);
              return (
                <button key={role} onClick={() => handleToggleRole(item.id, role)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors cursor-pointer ${has ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  {has ? '✓ ' : ''}{role}
                </button>
              );
            })}
            <button onClick={() => setShowIconPickerFor(null)} className="text-[10px] text-slate-400 hover:text-slate-600 ml-2 cursor-pointer">Close</button>
          </div>
        )}

        {/* Tab/Page Picker Dropdown */}
        {showTabPickerFor === item.id && (
          <div className="ml-12 my-1 p-2 bg-white rounded-lg border border-slate-200 shadow-lg max-w-[280px]">
            <div className="relative mb-2">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1.5" />
              <input type="text" autoFocus value={tabSearch} onChange={(e) => setTabSearch(e.target.value)} placeholder="Search pages..."
                className="w-full pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
            <div className="max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredTabs.map(page => (
                <button key={`${page.tabKey}-${page.uniqueKey}`} onClick={() => {
                  if (page.tabKey === 'custom') {
                    setCustomUrlInput(prev => ({ ...prev, [item.id]: item.customUrl || '' }));
                    setShowTabPickerFor(null);
                    return;
                  }
                  handleTabChange(item.id, page.tabKey, page.uniqueKey);
                }}
                  className={`w-full text-left px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${item.tabKey === page.tabKey && item.uniqueKey === page.uniqueKey ? 'bg-blue-100 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {page.label}
                </button>
              ))}
            </div>
            {item.tabKey === 'custom' && (
              <div className="mt-2 flex gap-1">
                <input type="url" value={customUrlInput[item.id] ?? item.customUrl ?? ''} onChange={(e) => setCustomUrlInput(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="https://..." className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-none" />
                <button onClick={() => handleCustomUrlSave(item.id)} className="px-2 py-1 bg-blue-600 text-white text-[10px] font-bold rounded cursor-pointer">Set</button>
              </div>
            )}
            <button onClick={() => { setShowTabPickerFor(null); setTabSearch(''); }} className="mt-2 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">Close</button>
          </div>
        )}

        {/* Custom URL Input */}
        {customUrlInput[item.id] !== undefined && showTabPickerFor !== item.id && (
          <div className="ml-12 my-1 p-2 bg-purple-50 rounded-lg border border-purple-200 flex gap-1">
            <input type="url" value={customUrlInput[item.id]} onChange={(e) => setCustomUrlInput(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="https://..." autoFocus
              className="flex-1 px-2 py-1 bg-white border border-purple-200 rounded text-[11px] focus:ring-1 focus:ring-purple-500 focus:outline-none" />
            <button onClick={() => handleCustomUrlSave(item.id)} className="px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded cursor-pointer">Set</button>
            <button onClick={() => setCustomUrlInput(prev => { const n = { ...prev }; delete n[item.id]; return n; })} className="px-2 py-1 text-slate-400 text-[10px] cursor-pointer">Cancel</button>
          </div>
        )}

        {/* Children */}
        {isExpanded && hasChildren && (
          <ul data-sortable className="ml-2 pl-3 border-l-2 border-slate-200 my-1">
            {item.children!.sort((a: any, b: any) => a.order - b.order).map((child: any) => renderTreeItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col min-h-[600px]">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="font-extrabold text-slate-900 text-sm">Menu Structure</h3>
            <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{items.length} items</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer">
              <Plus className="w-3.5 h-3.5" /> Add Item
            </button>
            {hasUnsaved && (
              <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50">
                {isSaving ? 'Saving...' : 'Save Menu'}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag to reorder</span>
          <span>← → to indent/outdent</span>
          <span>Click title to rename</span>
          <span>Click icon to change</span>
          <span>Click page badge to change target</span>
        </div>
      </div>

      {/* Add Item Form */}
      {showAddForm && (
        <div className="p-3 border-b border-slate-200 bg-blue-50/50">
          <div className="flex items-center gap-2 mb-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-blue-800">New Menu Item</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Title */}
            <input type="text" value={newItem.title} onChange={(e) => setNewItem(p => ({ ...p, title: e.target.value }))}
              placeholder="Item title" autoFocus
              className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            {/* Page selector */}
            <select value={`${newItem.tabKey}|${newItem.uniqueKey}`} onChange={(e) => {
              const [tabKey, uniqueKey] = e.target.value.split('|');
              setNewItem(p => ({ ...p, tabKey, uniqueKey }));
            }} className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none">
              {PAGE_OPTIONS.map(p => (
                <option key={`${p.tabKey}-${p.uniqueKey}`} value={`${p.tabKey}|${p.uniqueKey}`}>{p.label}</option>
              ))}
            </select>
            {/* Custom URL (if custom selected) */}
            {newItem.tabKey === 'custom' && (
              <input type="url" value={newItem.customUrl} onChange={(e) => setNewItem(p => ({ ...p, customUrl: e.target.value }))}
                placeholder="https://..." className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            )}
            {/* Roles */}
            <div className="flex flex-wrap gap-1">
              {ALL_ROLES.map(role => (
                <button key={role} onClick={() => {
                  setNewItem(p => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter(r => r !== role) : [...p.roles, role] }));
                }} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${newItem.roles.includes(role) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-400'}`}>
                  {newItem.roles.includes(role) ? '✓ ' : ''}{role}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={handleAddItem} disabled={!newItem.title.trim()} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40">
              Add to Menu
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-slate-500 text-[11px] font-bold hover:text-slate-700 cursor-pointer">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
        {selectedIds.size > 0 ? (
          <>
            <span className="text-[11px] font-bold text-blue-700">{selectedIds.size} selected</span>
            <button onClick={handleBulkDelete} className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded cursor-pointer">Delete Selected</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded cursor-pointer">Clear</button>
          </>
        ) : (
          <>
            <button onClick={expandAll} className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">Expand All</button>
            <span className="text-slate-300">|</span>
            <button onClick={collapseAll} className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">Collapse All</button>
            <span className="text-slate-300">|</span>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={selectedIds.size === items.length && items.length > 0} onChange={() => { if (selectedIds.size === items.length) setSelectedIds(new Set()); else setSelectedIds(new Set(items.map(i => i.id))); }} className="w-3 h-3" />
              Select All
            </label>
          </>
        )}
      </div>

      {/* Menu Tree */}
      <div ref={sortableContainerRef} className="flex-1 overflow-y-auto p-3">
        {tree.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
            <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-bold text-sm mb-1">Menu is empty</p>
            <p className="text-slate-400 text-xs">Click "Add Item" to start building your menu</p>
          </div>
        ) : (
          <ul data-sortable className="flex flex-col">
            {tree.map(item => renderTreeItem(item, 0))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
        <span>{items.filter(i => i.isVisible).length} visible / {items.length} total</span>
        {hasUnsaved && <span className="text-amber-600 font-bold">Unsaved changes</span>}
      </div>
    </div>
  );
};
