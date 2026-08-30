import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sortable from 'sortablejs';
import {
  GripVertical, Plus, Trash2, Eye, EyeOff, ChevronDown, ChevronRight,
  Check, X, LayoutDashboard, NavIcon,
  Layers, PanelLeftClose, PanelRightOpen,
  ExternalLink, Loader2, ArrowLeft, ArrowRight,
  FLOWBITE_ICONS
} from './icons/FlowbiteIcons';
import { NavMenuItem } from '../types';
import { saveNavMenuDB, apiFetch } from '../services/api';
import { isKitchenModuleNavItem } from '../data/appConfig';
import { StyledSelect } from './StyledSelect';
import { Button } from './Button';
import { Input } from './Input';
import { Checkbox } from 'flowbite-react';
import { t } from '../i18n/en';
import { useToast } from './ToastContext';
import { useAuthOptional } from '../contexts/AuthContext';

interface NavMenuEditorProps {
  navItems: NavMenuItem[];
  onUpdateNavItems: (items: NavMenuItem[]) => void;
  activeRole: string;
  // True for properties with the kitchen module off: kitchen-related items
  // (Take Food Order, Stock Requests, Edit Food Menu, etc.) are hidden from
  // this list so they can't be confused for something manageable here, but
  // they're never removed from `items` — every save still round-trips them
  // untouched (see extractFromDOM and handleSave), since nav_menu_items is one
  // shared config across every property, not a per-property one.
  hideKitchenItems?: boolean;
}

interface PageOption {
  label: string;
  tabKey: string;
  uniqueKey: string;
}

// Default page options (fallback if API fails)
function getDefaultPageOptions(): PageOption[] {
  return [
    { label: 'Overview', tabKey: 'dashboard', uniqueKey: 'overview' },
    { label: 'Dashboard', tabKey: 'dashboard', uniqueKey: 'dashboard' },
    { label: 'Bookings', tabKey: 'guests', uniqueKey: 'all_bookings' },
    { label: 'Take Food Order', tabKey: 'kitchen', uniqueKey: 'take_food_order' },
    { label: 'Kitchen Orders', tabKey: 'kitchen', uniqueKey: 'kitchen_orders' },
    { label: 'Staff Meals', tabKey: 'kitchen', uniqueKey: 'staff_meals' },
    { label: 'Stock Requisitions & Fulfill', tabKey: 'inventory', uniqueKey: 'stock_requests' },
    { label: 'Kitchen Wastage', tabKey: 'inventory', uniqueKey: 'deficit_shortfalls_log' },
    { label: 'Kitchen Stock & Adjustments Log', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock' },
    { label: 'Expenses', tabKey: 'petty_cash', uniqueKey: 'expenses' },
    { label: 'Finances', tabKey: 'petty_cash', uniqueKey: 'finances' },
    { label: 'Extra Charges & Fees', tabKey: 'petty_cash', uniqueKey: 'misc_charges' },
    { label: 'Staff & Permissions', tabKey: 'staff', uniqueKey: 'staff_permissions' },
    { label: 'Attendance Calendar', tabKey: 'staff', uniqueKey: 'attendance_calendar' },
    { label: 'Staff Directory', tabKey: 'staff', uniqueKey: 'staff_directory_salaries' },
    { label: 'Reports & Earnings', tabKey: 'analytics', uniqueKey: 'dashboard_analytics' },
    { label: 'Past Bills & Receipts', tabKey: 'audit_logs', uniqueKey: 'past_receipts_log' },
    { label: 'Telegram Alerts', tabKey: 'telegram', uniqueKey: 'telegram' },
    { label: 'Edit Food Menu', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu' },
    { label: 'Edit Kitchen Stock', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock' },
    { label: 'Edit Expense Items', tabKey: 'petty_cash', uniqueKey: 'edit_expense_items' },
    { label: 'Download Data & Excel', tabKey: 'export', uniqueKey: 'data_export_center' },
    { label: 'Dish Recipes (Auto-Stock)', tabKey: 'kitchen', uniqueKey: 'beta_recipe_builder' },
    { label: 'Property Licenses', tabKey: 'licenses', uniqueKey: 'license_management' },
    { label: 'Custom URL', tabKey: 'custom', uniqueKey: '' },
  ];
}

// Curated Flowbite icon catalog for navigation
const ALL_FLOWBITE_ICON_NAMES: string[] = Object.keys(FLOWBITE_ICONS).sort();

const getIconComponent = (name: string): React.ComponentType<any> => {
  return FLOWBITE_ICONS[name] || NavIcon;
};

// Tag synonyms so user search terms like "money" still find related icons
const SEARCH_TAGS: Record<string, string[]> = {
  money: ['dollar', 'banknote', 'coin', 'currency', 'wallet', 'cash', 'pay', 'receipt', 'fund', 'purse', 'treasury', 'wealth', 'finance', 'budget'],
  save: ['floppy', 'download', 'archive', 'store', 'disk'],
  delete: ['trash', 'remove', 'erase', 'x'],
  add: ['plus', 'new', 'create', 'append'],
  edit: ['pencil', 'pen', 'write', 'compose'],
  view: ['eye', 'show', 'display', 'preview', 'visibility'],
  search: ['find', 'lookup', 'magnify', 'scan'],
  user: ['person', 'people', 'profile', 'account', 'member', 'staff'],
  settings: ['gear', 'cog', 'configure', 'preferences', 'options', 'setup'],
  home: ['house', 'dashboard'],
  logout: ['signout', 'exit', 'leave', 'door'],
  food: ['utensil', 'meal', 'dish', 'plate', 'restaurant', 'dining', 'eat', 'cuisine', 'cooking'],
  drink: ['cup', 'glass', 'beverage', 'mug', 'coffee', 'tea', 'water'],
  stock: ['inventory', 'warehouse', 'supply', 'storage', 'box'],
  report: ['chart', 'analytics', 'statistics', 'graph', 'data', 'summary', 'statement'],
  print: ['printer', 'receipt', 'bill'],
  calendar: ['date', 'schedule', 'event', 'day', 'month'],
  notification: ['bell', 'alert', 'alarm', 'reminder', 'notice'],
  lock: ['secure', 'security', 'privacy', 'shield', 'protection', 'safety', 'password'],
  menu: ['nav', 'navigation', 'list', 'sidebar'],
  order: ['cart', 'purchase', 'buy', 'checkout', 'transaction', 'booking'],
};

export const NavMenuEditor: React.FC<NavMenuEditorProps> = ({
  navItems,
  onUpdateNavItems,
  activeRole: _activeRole,
  hideKitchenItems = false,
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
  const [showParentPickerFor, setShowParentPickerFor] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [allRoles, setAllRoles] = useState<string[]>([]);
  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);
  const [newItem, setNewItem] = useState({
    title: '', tabKey: 'dashboard', uniqueKey: 'dashboard',
    iconName: 'LayoutDashboard', customUrl: '', roles: ['Super Admin'] as string[],
    parentId: null as string | null
  });

  const { showToast } = useToast();
  // NavMenuEditor renders on BOTH sides of the AuthProvider boundary: inside it
  // on the property path (via MenuManager), and OUTSIDE it in the Root Admin
  // dashboard (RootAdminDashboard renders this directly, with no property-scoped
  // provider). On the property path, wait for the real check_session result
  // before the config fetch below fires (avoids 401s). In the Root Admin case
  // there is no provider, but reaching that screen already means an
  // authenticated platform admin whose session cookie apiFetch carries - so
  // treat it as authenticated and let the fetch run (it falls back to sane
  // defaults on any error anyway).
  const auth = useAuthOptional();
  const isAuthenticated = auth ? auth.isAuthenticated : true;
  const authChecked = auth ? auth.authChecked : true;

  const sortableInstances = useRef<Sortable[]>([]);
  const sortableContainerRef = useRef<HTMLDivElement>(null);
  const [containerKey, setContainerKey] = useState(0);

  useEffect(() => {
    setItems(navItems);
    const parentIds = navItems.filter(i => i.parentId).map(i => i.parentId!);
    setExpandedIds(new Set(parentIds));
  }, [navItems]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    const fetchConfiguration = async () => {
      try {
        // apiFetch returns the raw Response - .status here was the HTTP status
        // CODE (a number), never the string 'success', so this comparison was
        // always false and every load silently fell back to the hardcoded
        // defaults below instead of whatever roles/pages the DB actually has.
        const rolesResponse = await (await apiFetch('/php/api/router.php?action=get_system_roles')).json();
        if (rolesResponse.status === 'success' && rolesResponse.data) {
          const roleNames = rolesResponse.data.map((r: any) => r.name);
          setAllRoles(roleNames);
        } else {
          setAllRoles(['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff']);
        }

        const pagesResponse = await (await apiFetch('/php/api/router.php?action=get_nav_page_options')).json();
        if (pagesResponse.status === 'success' && pagesResponse.data) {
          setPageOptions(pagesResponse.data);
        } else {
          setPageOptions(getDefaultPageOptions());
        }
      } catch (error) {
        console.error('Failed to fetch configuration:', error);
        setAllRoles(['Super Admin', 'Admin', 'Staff Supervisor', 'Staff Kitchen', 'Staff']);
        setPageOptions(getDefaultPageOptions());
      }
    };

    fetchConfiguration();
  }, [isAuthenticated, authChecked]);

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

  // Kitchen items stay in `items` (and get saved) untouched — only what's
  // rendered/selectable in the tree is restricted. See extractFromDOM below
  // for how drag-and-drop reorders avoid dropping the hidden ones.
  const hiddenItems = hideKitchenItems ? items.filter(isKitchenModuleNavItem) : [];
  const visibleItems = hideKitchenItems ? items.filter((i) => !isKitchenModuleNavItem(i)) : items;

  const tree = buildTree(visibleItems);

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
        const childUl = li.querySelector(':scope > ul[data-sortable]') as HTMLUListElement | null;
        if (childUl) processList(childUl, id);
      });
    };
    const rootUl = sortableContainerRef.current?.querySelector(':scope > ul') as HTMLUListElement | null;
    if (rootUl) processList(rootUl, null);
    // The DOM only contains rendered (visible) items — reappend anything hidden
    // by hideKitchenItems unchanged so a drag-reorder never drops it from state.
    return [...result, ...hiddenItems];
  }, [items, hiddenItems]);

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
          setContainerKey(k => k + 1);
          markDirty();
        },
      });
      sortableInstances.current.push(instance);
    });
  }, [extractFromDOM]);

  useEffect(() => {
    const timer = setTimeout(initSortable, 50);
    return () => {
      clearTimeout(timer);
      sortableInstances.current.forEach(s => s.destroy());
      sortableInstances.current = [];
    };
  }, [containerKey, expandedIds, initSortable]);

  // ========== SAVE ==========
  // Shared by the main "Save Menu" button and any auto-save (e.g. rename) -
  // sends the full current tree, so it also picks up whatever else is
  // pending, same as a manual save would.
  //
  // Toast added 21 Aug 2026: saveNavMenuDB() catches its own errors and just
  // resolves false (see api.ts) - with no toast, a failed save (CSRF hiccup,
  // network blip, session expiry) looked IDENTICAL to a successful one from
  // here: no error, no crash, the reordered items just stayed visually in
  // place in local `items` state (nothing here reverts them on failure).
  // The revert only became visible later, whenever this section re-fetched
  // from the DB (e.g. navigating away and back) and the drag-reorder was
  // gone - by then there was no way to tell "it never saved" from "I must
  // have misremembered the change". A toast on both outcomes closes that gap.
  const persistItems = async (itemsToSave: NavMenuItem[]) => {
    setIsSaving(true);
    const treeNodes = buildTree(itemsToSave);
    const flatList = flattenAll(treeNodes).map(({ children, ...rest }: any) => rest);
    const success = await saveNavMenuDB(flatList);
    if (success) {
      onUpdateNavItems(flatList);
      setHasUnsaved(false);
      showToast(t('nav_menu_saved_toast', 'Menu saved'), { type: 'success' });
    } else {
      showToast(t('nav_menu_save_failed_toast', 'Failed to save menu — please try again'), { type: 'error' });
    }
    setIsSaving(false);
    return success;
  };

  const handleSave = async () => {
    let currentItems = items;
    if (editingTitleId && editTitle.trim()) {
      const newTitle = editTitle.trim();
      const base = slugifyForUrl(newTitle) || 'item';
      let candidate = base;
      let n = 2;
      while (currentItems.some(i => i.id !== editingTitleId && (i.urlSlug || i.uniqueKey) === candidate)) {
        candidate = `${base}_${n++}`;
      }
      currentItems = currentItems.map(i => i.id === editingTitleId ? { ...i, title: newTitle, urlSlug: candidate } : i);
      setItems(currentItems);
      setEditingTitleId(null);
    }
    await persistItems(currentItems);
  };

  // ========== ADD NEW ITEM ==========
  const handleAddItem = () => {
    if (!newItem.title.trim()) return;
    const id = `nav-${Date.now().toString().slice(-6)}`;
    const item: NavMenuItem = {
      id,
      title: newItem.title.trim(),
      tabKey: newItem.tabKey,
      uniqueKey: newItem.uniqueKey || `custom_${id}`,
      iconName: newItem.iconName,
      order: items.length + 1,
      roles: [...newItem.roles],
      isVisible: true,
      parentId: newItem.parentId,
      customUrl: newItem.customUrl || undefined,
    };
    setItems(prev => [...prev, item]);
    setNewItem({ title: '', tabKey: 'dashboard', uniqueKey: 'dashboard', iconName: 'LayoutDashboard', customUrl: '', roles: ['Super Admin'], parentId: null });
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

  // snake_case to match this app's existing route-key convention
  // (guest_registration, all_bookings, ...) - unlike PlatformPropertyManagement's
  // tenant/property slugify, which is hyphenated for a different URL scheme.
  const slugifyForUrl = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  // Renaming auto-saves right away instead of just marking the page dirty and
  // waiting for a separate "Save Menu" click - a rename looked like it worked
  // (the title updated on screen) but was silently lost if that second click
  // never happened. Computed directly (not via the setItems functional
  // updater) since the result is also needed immediately for persistItems -
  // reading the stale `items` closure would be fine here anyway since this
  // only runs from a direct user click/Enter, never batched with another
  // update to `items` in the same tick.
  const handleSaveRename = async (id: string) => {
    if (!editTitle.trim()) return;
    const newTitle = editTitle.trim();
    const base = slugifyForUrl(newTitle) || 'item';
    // Keep the slug unique among the OTHER items - a collision would make
    // two different pages resolve to the same URL hash.
    let candidate = base;
    let n = 2;
    while (items.some(i => i.id !== id && (i.urlSlug || i.uniqueKey) === candidate)) {
      candidate = `${base}_${n++}`;
    }
    const updatedItems = items.map(i => i.id === id ? { ...i, title: newTitle, urlSlug: candidate } : i);
    setItems(updatedItems);
    setEditingTitleId(null);
    await persistItems(updatedItems);
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

  const handleParentChange = (id: string, parentId: string | null) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, parentId } : i));
    setShowParentPickerFor(null);
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
  const matchesSearch = (name: string, query: string) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const nameLower = name.toLowerCase();
    if (nameLower === q || nameLower.startsWith(q)) return true;
    const words = name.split(/(?=[A-Z])/).map(w => w.toLowerCase());
    if (words.some(w => w.startsWith(q))) return true;
    // Check tag synonyms
    const tagWords = SEARCH_TAGS[q];
    if (tagWords) {
      if (words.some(w => tagWords.some(t => w.startsWith(t) || w === t))) return true;
    }
    return false;
  };
  const filteredIcons = ALL_FLOWBITE_ICON_NAMES.filter(name =>
    matchesSearch(name, iconSearch)
  );
  const filteredTabs = pageOptions.filter(p =>
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
    const currentPage = pageOptions.find(p => p.tabKey === item.tabKey && p.uniqueKey === item.uniqueKey);

    return (
      <li key={item.id} data-id={item.id} className="nav-menu-item nav-menu-editor__tree-item" style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : '0px' }}>
        <div className={`nav-menu-editor__tree-row flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg border border-l-[3px] transition-all text-xs group my-0.5 ${
          item.isVisible ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm' :
          'bg-slate-50 border-slate-200 opacity-60'
        } ${depthColors[Math.min(depth, 2)]} ${depthBg[Math.min(depth, 2)] || ''}`}>

          {/* Drag Handle */}
          <div className="nav-menu-editor__drag-handle hs-handle p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            title={t('nav_drag_to_reorder_label', 'Drag to reorder')}>
            <GripVertical className="w-4 h-4" />
          </div>

          <Checkbox
              checked={selectedIds.has(item.id)}
              onChange={() => { setSelectedIds(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; }); }}
            />

          {/* Expand/Collapse */}
          <Button
            onClick={() => toggleExpand(item.id)}
            size="xs"
            variant="ghost"
            className={`transition-colors shrink-0 ${hasChildren ? 'text-slate-500 hover:bg-slate-100' : 'text-transparent pointer-events-none'}`}
          >
            {hasChildren ? (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="w-3.5 h-3.5 block" />}
          </Button>

          {/* Icon - clickable to change */}
          <Button
            onClick={() => setShowIconPickerFor(showIconPickerFor === item.id ? null : item.id)}
            size="xs"
            variant="ghost"
            className={`shrink-0 transition-colors ${
              item.isVisible ? 'bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-600' : 'bg-slate-100 text-slate-400'
            }`}
            title={t('nav_click_to_change_icon_tooltip', 'Click to change icon')}
          >
            <IconComp className="w-3.5 h-3.5" />
          </Button>

          {/* Title - clickable to rename */}
          <div className="nav-menu-editor__title-wrap flex-1 min-w-0">
            {isEditingTitle ? (
              <div className="nav-menu-editor__rename-row flex items-center gap-1">
                <Input
                  type="text" autoFocus value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(item.id); if (e.key === 'Escape') setEditingTitleId(null); }}
                  fullWidth={false}
                  className="flex-1 text-xs font-semibold"
                />
                <Button onClick={() => handleSaveRename(item.id)} size="xs" variant="ghost" className="text-emerald-600 hover:bg-emerald-50"><Check className="w-3.5 h-3.5" /></Button>
                <Button onClick={() => setEditingTitleId(null)} size="xs" variant="ghost" className="text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <span className={`nav-menu-editor__title font-semibold text-slate-800 truncate cursor-text hover:text-blue-600 ${!item.isVisible ? 'line-through text-slate-400' : ''}`} onClick={() => handleStartRename(item)} title={t('nav_click_to_rename_tooltip', 'Click to rename')}>
                {item.title}
              </span>
            )}
          </div>

          {/* Tab/Page badge - clickable to change */}
          <Button
            onClick={() => setShowTabPickerFor(showTabPickerFor === item.id ? null : item.id)}
            size="xs"
            variant="ghost"
            className="nav-menu-editor__page-badge text-[9px] font-semibold text-slate-600 hover:text-blue-700 transition-colors shrink-0 max-w-[100px] truncate"
            title={t('nav_click_to_change_page_tooltip', 'Click to change page target')}
          >
            {item.customUrl ? <span className="flex items-center gap-0.5"><ExternalLink className="w-2.5 h-2.5" /> {t('nav_url_badge', 'URL')}</span> : (currentPage?.label || item.tabKey)}
          </Button>

          {/* Visibility */}
          <Button onClick={() => handleToggleVisibility(item.id)} size="xs" variant="ghost" className={`nav-menu-editor__visibility-btn transition-colors shrink-0 ${item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
            {item.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>

          {/* Roles badge */}
          <Button onClick={() => setShowIconPickerFor(showIconPickerFor === `roles-${item.id}` ? null : `roles-${item.id}`)} size="xs" variant="ghost" className="nav-menu-editor__roles-badge text-[9px] font-semibold text-blue-700 transition-colors shrink-0" title={t('nav_click_to_edit_roles_tooltip', 'Click to edit roles')}>
            {item.roles.length}r
          </Button>

          {/* Parent Picker + Indent/Outdent */}
          <div className="nav-menu-editor__row-actions flex items-center gap-0.5 shrink-0">
            <Button onClick={() => setShowParentPickerFor(showParentPickerFor === item.id ? null : item.id)}
              size="xs"
              variant="ghost"
              className={`transition-colors ${item.parentId ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
              title={item.parentId ? `Parent: ${items.find(i => i.id === item.parentId)?.title || 'Unknown'}` : t('nav_set_parent_tooltip', 'Set parent (root level)')}>
              <Layers className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={() => handleOutdent(item.id)} disabled={!item.parentId}
              size="xs"
              variant="ghost"
              className="text-slate-400 hover:text-amber-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title={t('nav_outdent_tooltip', 'Outdent (move left)')}>
              <PanelLeftClose className="w-3.5 h-3.5" />
            </Button>
            <Button onClick={() => handleIndent(item.id)} disabled={depth >= 2}
              size="xs"
              variant="ghost"
              className="text-slate-400 hover:text-emerald-600 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              title={t('nav_indent_tooltip', 'Indent (move right)')}>
              <PanelRightOpen className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Delete */}
          <Button onClick={() => handleDelete(item.id)} size="xs" variant="ghost" className="nav-menu-editor__delete-btn text-slate-300 hover:text-red-600 transition-colors shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Icon Picker Dropdown */}
        {showIconPickerFor === item.id && (
          <div className="nav-menu-editor__picker nav-menu-editor__picker--icon ml-12 my-1 p-2 bg-white rounded-lg border border-slate-200 shadow-lg max-w-[380px]">
            <div className="relative mb-2">
              <Input
                type="text"
                autoFocus
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder={`Search ${ALL_FLOWBITE_ICON_NAMES.length} icons...`}
              />
            </div>
            <div className="nav-menu-editor__picker-count text-[9px] text-slate-400 mb-1">{filteredIcons.length} icons</div>
            <div className="nav-menu-editor__icon-grid grid grid-cols-8 gap-1 max-h-[240px] overflow-y-auto">
              {filteredIcons.slice(0, 120).map(name => {
                const Ic = getIconComponent(name);
                return (
                  <button key={name} onClick={() => handleIconChange(item.id, name)}
                    className={`nav-menu-editor__icon-option p-1.5 rounded transition-colors cursor-pointer ${item.iconName === name ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'text-slate-600 hover:bg-slate-100'}`}
                    title={name}>
                    <Ic className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
            {filteredIcons.length > 120 && (
              <div className="nav-menu-editor__picker-hint text-[9px] text-slate-400 text-center mt-1">Showing 120 of {filteredIcons.length} — type to narrow search</div>
            )}
            <button onClick={() => { setShowIconPickerFor(null); setIconSearch(''); }} className="nav-menu-editor__picker-close mt-2 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">{t('close_button', 'Close')}</button>
          </div>
        )}

        {/* Roles Dropdown */}
        {showIconPickerFor === `roles-${item.id}` && (
          <div className="nav-menu-editor__picker nav-menu-editor__picker--roles ml-12 my-1 p-2 bg-blue-50 rounded-lg border border-blue-200 flex flex-wrap gap-1">
            {allRoles.map(role => {
              const has = item.roles.includes(role);
              return (
                <button key={role} onClick={() => handleToggleRole(item.id, role)}
                  className={`nav-menu-editor__role-chip text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors cursor-pointer ${has ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                  {has ? <Check className="w-3 h-3 inline-block" /> : null}{role}
                </button>
              );
            })}
            <button onClick={() => setShowIconPickerFor(null)} className="nav-menu-editor__picker-close text-[10px] text-slate-400 hover:text-slate-600 ml-2 cursor-pointer">{t('close_button', 'Close')}</button>
          </div>
        )}

        {/* Tab/Page Picker Dropdown */}
        {showTabPickerFor === item.id && (
          <div className="nav-menu-editor__picker nav-menu-editor__picker--tab ml-12 my-1 p-2 bg-white rounded-lg border border-slate-200 shadow-lg max-w-[280px]">
            <div className="relative mb-2">
              <Input
                type="text"
                autoFocus
                value={tabSearch}
                onChange={(e) => setTabSearch(e.target.value)}
                placeholder={t('nav_search_pages_placeholder', 'Search pages...')}
              />
            </div>
            <div className="nav-menu-editor__page-list max-h-[200px] overflow-y-auto space-y-0.5">
              {filteredTabs.map(page => (
                <button key={`${page.tabKey}-${page.uniqueKey}`} onClick={() => {
                  if (page.tabKey === 'custom') {
                    setCustomUrlInput(prev => ({ ...prev, [item.id]: item.customUrl || '' }));
                    setShowTabPickerFor(null);
                    return;
                  }
                  handleTabChange(item.id, page.tabKey, page.uniqueKey);
                }}
                  className={`nav-menu-editor__page-option w-full text-left px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${item.tabKey === page.tabKey && item.uniqueKey === page.uniqueKey ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                  {page.label}
                </button>
              ))}
            </div>
            {item.tabKey === 'custom' && (
              <div className="nav-menu-editor__custom-url-row mt-2 flex gap-1">
                <Input type="url" value={customUrlInput[item.id] ?? item.customUrl ?? ''} onChange={(e) => setCustomUrlInput(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="https://..." className="flex-1" />
                <button onClick={() => handleCustomUrlSave(item.id)} className="nav-menu-editor__custom-url-set px-2 py-1 bg-blue-600 text-white text-[10px] font-semibold rounded cursor-pointer">{t('nav_set_url_button', 'Set')}</button>
              </div>
            )}
            <button onClick={() => { setShowTabPickerFor(null); setTabSearch(''); }} className="nav-menu-editor__picker-close mt-2 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">{t('close_button', 'Close')}</button>
          </div>
        )}

        {/* Custom URL Input */}
        {customUrlInput[item.id] !== undefined && showTabPickerFor !== item.id && (
          <div className="nav-menu-editor__custom-url-row ml-12 my-1 p-2 bg-purple-50 rounded-lg border border-purple-200 flex gap-1">
            <Input type="url" value={customUrlInput[item.id]} onChange={(e) => setCustomUrlInput(prev => ({ ...prev, [item.id]: e.target.value }))} placeholder="https://..." autoFocus className="flex-1" />
            <button onClick={() => handleCustomUrlSave(item.id)} className="nav-menu-editor__custom-url-set px-2 py-1 bg-blue-600 text-white text-[10px] font-semibold rounded cursor-pointer">{t('nav_set_url_button', 'Set')}</button>
            <button onClick={() => setCustomUrlInput(prev => { const n = { ...prev }; delete n[item.id]; return n; })} className="nav-menu-editor__custom-url-cancel px-2 py-1 text-slate-400 text-[10px] cursor-pointer">{t('cancel_button', 'Cancel')}</button>
          </div>
        )}

        {/* Parent Picker Dropdown */}
        {showParentPickerFor === item.id && (
          <div className="nav-menu-editor__picker nav-menu-editor__picker--parent ml-12 my-1 p-2 bg-blue-50 rounded-lg border border-blue-200 max-w-[280px]">
            <p className="nav-menu-editor__picker-title text-[10px] font-semibold text-blue-700 mb-1">{t('nav_set_parent_menu_item_title', 'Set Parent Menu Item')}</p>
            <div className="nav-menu-editor__parent-list space-y-0.5 max-h-[160px] overflow-y-auto">
              <button onClick={() => handleParentChange(item.id, null)}
                className={`nav-menu-editor__parent-option w-full text-left px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${!item.parentId ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                {t('nav_root_level_label', 'Root Level (no parent)')}
              </button>
              {visibleItems.filter(i => i.id !== item.id).map(i => {
                const parentLabel = i.parentId ? `\u00A0\u00A0\u21B3 ${i.title}` : i.title;
                return (
                  <button key={i.id} onClick={() => handleParentChange(item.id, i.id)}
                    className={`nav-menu-editor__parent-option w-full text-left px-2 py-1 rounded text-[11px] transition-colors cursor-pointer ${item.parentId === i.id ? 'bg-blue-100 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {parentLabel}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowParentPickerFor(null)} className="nav-menu-editor__picker-close mt-1 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer">{t('close_button', 'Close')}</button>
          </div>
        )}

        {/* Children */}
        {isExpanded && hasChildren && (
          <ul data-sortable className="nav-menu-editor__children ml-2 pl-3 border-l-2 border-slate-200 my-1">
            {item.children!.sort((a: any, b: any) => a.order - b.order).map((child: any) => renderTreeItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="nav-menu-editor bg-white rounded-lg border border-slate-200 shadow-md overflow-hidden flex flex-col min-h-[600px]">
      {/* Header */}
      <div className="nav-menu-editor__header p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
        <div className="nav-menu-editor__header-row flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="nav-menu-editor__title-block flex flex-wrap items-center gap-2">
            <Layers className="w-5 h-5 text-blue-600" />
            <h3 className="nav-menu-editor__heading font-semibold text-slate-900 text-sm">{t('nav_menu_structure_title', 'Menu Structure')}</h3>
            <span className="nav-menu-editor__count-badge text-[10px] font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{visibleItems.length} items</span>
            {hiddenItems.length > 0 && (
              <span className="nav-menu-editor__hidden-hint text-[10px] font-medium text-slate-400" title={t('nav_kitchen_hidden_tooltip', "Kitchen items are hidden here because this property's kitchen module is off — they're untouched and will still be saved as-is.")}>
                ({hiddenItems.length} kitchen item{hiddenItems.length === 1 ? '' : 's'} hidden)
              </span>
            )}
          </div>
          <div className="nav-menu-editor__header-actions flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              {t('nav_add_item_button', 'Add Item')}
            </Button>
            {hasUnsaved && (
              <Button
                variant="success"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? t('saving_button', 'Saving...') : t('nav_save_menu_button', 'Save Menu')}
              </Button>
            )}
          </div>
        </div>
        <div className="nav-menu-editor__legend flex items-center gap-3 text-[10px] text-slate-500">
          <span className="nav-menu-editor__legend-item flex items-center gap-1"><GripVertical className="w-3 h-3" /> {t('nav_drag_to_reorder_label', 'Drag to reorder')}</span>
          <span className="nav-menu-editor__legend-item flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" />
            <ArrowRight className="w-3 h-3" />
            {t('nav_arrow_indent_outdent_label', 'to indent/outdent')}
          </span>
          <span>{t('nav_click_title_rename_label', 'Click title to rename')}</span>
          <span>{t('nav_click_icon_change_label', 'Click icon to change')}</span>
          <span>{t('nav_click_page_badge_label', 'Click page badge to change target')}</span>
        </div>
      </div>

      {/* Add Item Form */}
      {showAddForm && (
        <div className="nav-menu-editor__add-form p-3 border-b border-slate-200 bg-blue-50/50">
          <div className="nav-menu-editor__add-form-title flex items-center gap-2 mb-2">
            <Plus className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-semibold text-blue-800">{t('nav_new_menu_item_title', 'New Menu Item')}</span>
          </div>
          <div className="nav-menu-editor__add-form-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {/* Title */}
            <Input
              type="text"
              value={newItem.title}
              onChange={(e) => setNewItem(p => ({ ...p, title: e.target.value }))}
              placeholder={t('nav_item_title_placeholder', 'Item title')}
              autoFocus
            />
            {/* Page selector */}
            <StyledSelect
              value={`${newItem.tabKey}|${newItem.uniqueKey}`}
              onChange={(val) => {
                const [tabKey, uniqueKey] = val.split('|');
                setNewItem(p => ({ ...p, tabKey, uniqueKey }));
              }}
              options={pageOptions.map(p => ({
                value: `${p.tabKey}|${p.uniqueKey}`,
                label: p.label,
              }))}
              searchable
            />
            {/* Parent dropdown */}
            <StyledSelect
              value={newItem.parentId || ''}
              onChange={(val) => setNewItem(p => ({ ...p, parentId: val || null }))}
              options={[
                { value: '', label: t('nav_root_level_label', 'Root Level (no parent)') },
                ...visibleItems.filter(i => i.id !== newItem.parentId).map(i => ({
                  value: i.id,
                  label: i.title,
                })),
              ]}
              searchable
            />
            {/* Custom URL (if custom selected) */}
            {newItem.tabKey === 'custom' && (
              <Input
                type="url"
                value={newItem.customUrl}
                onChange={(e) => setNewItem(p => ({ ...p, customUrl: e.target.value }))}
                placeholder={t('url_placeholder', 'https://...')}
              />
            )}
            {/* Roles */}
            <div className="nav-menu-editor__add-form-roles flex flex-wrap gap-1">
              {allRoles.map(role => (
                <button key={role} onClick={() => {
                  setNewItem(p => ({ ...p, roles: p.roles.includes(role) ? p.roles.filter(r => r !== role) : [...p.roles, role] }));
                }} className={`nav-menu-editor__role-chip text-[9px] font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${newItem.roles.includes(role) ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-400'}`}>
                  {newItem.roles.includes(role) ? <Check className="w-3 h-3 inline-block" /> : null}{role}
                </button>
              ))}
            </div>
          </div>
          <div className="nav-menu-editor__add-form-actions flex items-center gap-2 mt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddItem}
              disabled={!newItem.title.trim()}
            >
              {t('nav_add_to_menu_button', 'Add to Menu')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddForm(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="nav-menu-editor__toolbar px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 bg-slate-50">
        {selectedIds.size > 0 ? (
          <>
            <span className="nav-menu-editor__toolbar-count text-[11px] font-semibold text-blue-700">{selectedIds.size} selected</span>
            <button onClick={handleBulkDelete} className="nav-menu-editor__toolbar-btn nav-menu-editor__toolbar-btn--danger text-[11px] font-semibold text-red-600 hover:bg-red-50 px-2 py-1 rounded cursor-pointer">{t('nav_delete_selected_button', 'Delete Selected')}</button>
            <button onClick={() => setSelectedIds(new Set())} className="nav-menu-editor__toolbar-btn text-[11px] text-slate-500 hover:text-slate-700 px-2 py-1 rounded cursor-pointer">{t('clear_button', 'Clear')}</button>
          </>
        ) : (
          <>
            <button onClick={expandAll} className="nav-menu-editor__toolbar-btn text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">{t('nav_expand_all_button', 'Expand All')}</button>
            <span className="text-slate-300">|</span>
            <button onClick={collapseAll} className="nav-menu-editor__toolbar-btn text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer font-medium">{t('nav_collapse_all_button', 'Collapse All')}</button>
            <span className="text-slate-300">|</span>
            <label className="nav-menu-editor__select-all flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
              <Checkbox
                checked={selectedIds.size === visibleItems.length && visibleItems.length > 0}
                onChange={() => { if (selectedIds.size === visibleItems.length) { setSelectedIds(new Set()); } else { setSelectedIds(new Set(visibleItems.map(i => i.id))); } }}
              />{t('nav_select_all_button', 'Select All')}
            </label>
          </>
        )}
      </div>

      {/* Menu Tree */}
      <div ref={sortableContainerRef} className="nav-menu-editor__tree flex-1 overflow-y-auto p-3">
        {tree.length === 0 ? (
          <div className="nav-menu-editor__empty text-center py-16 border-2 border-dashed border-slate-200 rounded-lg">
            <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-semibold text-sm mb-1">{t('nav_menu_empty_message', 'Menu is empty')}</p>
            <p className="text-slate-400 text-xs">{t('nav_menu_empty_subtitle', 'Click "Add Item" to start building your menu')}</p>
          </div>
        ) : (
          // key={containerKey} forces React to fully discard and rebuild this whole
          // tree after every drag instead of diffing against it. SortableJS moves
          // the actual <li>/<ul> DOM nodes directly (outside React's knowledge) on
          // drop, including across parents via the shared `group` - without a
          // remount, React's next reconciliation still holds the pre-drag tree
          // shape and tries to removeChild a node from what it thinks is still its
          // parent, which throws "not a child of this node" once React tries.
          <ul key={containerKey} data-sortable className="nav-menu-editor__tree-list flex flex-col">
            {tree.map(item => renderTreeItem(item, 0))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="nav-menu-editor__footer px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
        <span className="nav-menu-editor__footer-count">{visibleItems.filter(i => i.isVisible).length} visible / {visibleItems.length} total</span>
        {hasUnsaved && <span className="nav-menu-editor__unsaved-hint text-amber-600 font-semibold">{t('unsaved_changes_tooltip', 'Unsaved changes')}</span>}
      </div>

      {/* Floating Save Button */}
      {hasUnsaved && (
        <div className="nav-menu-editor__floating-save fixed bottom-6 right-6 z-50">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="nav-menu-editor__save-button flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-semibold text-sm rounded-lg shadow-2xl transition-all cursor-pointer disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('saving_button', 'Saving...')}
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                {t('nav_save_menu_button', 'Save Menu')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
