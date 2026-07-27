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
  { title: 'System Health', tabKey: 'audit_logs', uniqueKey: 'system_health', icon: 'Settings', category: 'Audit' },
  { title: 'Telegram', tabKey: 'telegram', uniqueKey: 'telegram', icon: 'Bot', category: 'System' },
  { title: 'Edit Food Menu', tabKey: 'menu_manager', uniqueKey: 'edit_food_menu', icon: 'Grid', category: 'Admin' },
  { title: 'Edit Main Menu', tabKey: 'menu_manager', uniqueKey: 'edit_main_menu', icon: 'NavIcon', category: 'Admin' },
  { title: 'Edit Kitchen Stock', tabKey: 'inventory', uniqueKey: 'edit_kitchen_stock', icon: 'Boxes', category: 'Admin' },
  { title: 'Edit Expense Items', tabKey: 'petty_cash', uniqueKey: 'edit_expense_items', icon: 'Layers', category: 'Admin' },
  { title: 'Data Export Center', tabKey: 'export', uniqueKey: 'data_export_center', icon: 'LayoutDashboard', category: 'System' },
  { title: 'Custom CSS Override', tabKey: 'custom_css', uniqueKey: 'custom_css', icon: 'Paintbrush', category: 'Admin' },
];

const INDENT_PX = 28;

interface DragState {
  active: boolean;
  sourceId: string | null;
  ghostX: number;
  ghostY: number;
  ghostWidth: number;
  dropTargetId: string | null;
  dropDepth: number;
  overHalf: 'top' | 'bottom' | null;
}

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

  const [drag, setDrag] = useState<DragState>({
    active: false, sourceId: null, ghostX: 0, ghostY: 0, ghostWidth: 0,
    dropTargetId: null, dropDepth: 0, overHalf: null,
  });

  const treeRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStartPos = useRef<{ x: number; y: number; depth: number; originalParentId: string | null }>({ x: 0, y: 0, depth: 0, originalParentId: null });
  const flatOrderRef = useRef<string[]>([]);

  useEffect(() => {
    setItems(navItems);
    const parentIds = navItems.filter(i => i.parentId).map(i => i.parentId!);
    setExpandedIds(new Set(parentIds));
  }, [navItems]);

  const markDirty = () => setHasUnsaved(true);

  // Build tree from flat list
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

  // Flatten tree to visible ordered list
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

  const flatVisible = flattenVisible(tree);

  // Full flatten (all items, not just visible)
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

  // Get depth of an item
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

  // Get the max depth a child of sourceId can go (prevent too deep nesting)
  const getMaxChildDepth = (sourceId: string): number => {
    let maxDepth = 0;
    const count = (id: string, depth: number) => {
      items.filter(i => i.parentId === id).forEach(child => {
        maxDepth = Math.max(maxDepth, depth + 1);
        count(child.id, depth + 1);
      });
    };
    count(sourceId, 0);
    return maxDepth;
  };

  // ========== CUSTOM DRAG SYSTEM ==========
  const handleDragStart = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = itemRefs.current.get(id);
    if (!el) return;
    const rect = el.getBoundingClientRect();

    const item = items.find(i => i.id === id);
    const depth = item ? getDepth(item) : 0;

    dragStartPos.current = { x: e.clientX, y: e.clientY, depth, originalParentId: item?.parentId || null };
    flatOrderRef.current = flatVisible.map(i => i.id);

    setDrag({
      active: true,
      sourceId: id,
      ghostX: rect.left,
      ghostY: rect.top,
      ghostWidth: rect.width,
      dropTargetId: null,
      dropDepth: depth,
      overHalf: null,
    });
  }, [items, flatVisible]);

  useEffect(() => {
    if (!drag.active) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;

      const newDepth = Math.max(0, Math.min(2, dragStartPos.current.depth + Math.round(dx / INDENT_PX)));

      // Find which item we're over
      let overId: string | null = null;
      let overHalf: 'top' | 'bottom' = 'bottom';

      for (const [id, el] of itemRefs.current.entries()) {
        if (id === drag.sourceId) continue;
        const rect = el.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          overId = id;
          overHalf = e.clientY < midY ? 'top' : 'bottom';
          break;
        }
      }

      setDrag(prev => ({
        ...prev,
        ghostX: prev.ghostX + (e.clientX - (prev.ghostX + prev.ghostWidth / 2 - prev.ghostWidth / 2)),
        ghostY: prev.ghostY + dy,
        dropTargetId: overId,
        dropDepth: newDepth,
        overHalf,
      }));

      // Update ghost position directly for performance
      const ghostEl = document.getElementById('nav-drag-ghost');
      if (ghostEl) {
        ghostEl.style.left = `${e.clientX - dragStartPos.current.depth * INDENT_PX}px`;
        ghostEl.style.top = `${e.clientY - 20}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (drag.dropTargetId && drag.sourceId && drag.dropTargetId !== drag.sourceId) {
        performDrop(drag.sourceId, drag.dropTargetId, drag.overHalf || 'bottom', drag.dropDepth);
      }

      setDrag({ active: false, sourceId: null, ghostX: 0, ghostY: 0, ghostWidth: 0, dropTargetId: null, dropDepth: 0, overHalf: null });
    };

    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [drag.active, drag.sourceId, drag.dropTargetId, drag.overHalf, drag.dropDepth]);

  const performDrop = (sourceId: string, targetId: string, overHalf: 'top' | 'bottom', newDepth: number) => {
    const sourceItem = items.find(i => i.id === sourceId);
    const targetItem = items.find(i => i.id === targetId);
    if (!sourceItem || !targetItem) return;

    // Can't drop onto own descendant
    const isDescendant = (parentId: string, checkId: string): boolean => {
      const children = items.filter(i => i.parentId === parentId);
      for (const child of children) {
        if (child.id === checkId) return true;
        if (isDescendant(child.id, checkId)) return true;
      }
      return false;
    };
    if (isDescendant(sourceId, targetId)) return;

    // Determine new parent based on depth
    let newParentId: string | null = null;
    if (newDepth === 0) {
      newParentId = null;
    } else {
      // Walk up from target to find the ancestor at (newDepth - 1)
      let ancestor = targetItem;
      const targetDepth = getDepth(targetItem);
      const stepsUp = targetDepth - (newDepth - 1);
      if (stepsUp >= 0) {
        for (let i = 0; i < stepsUp; i++) {
          if (ancestor.parentId) {
            ancestor = items.find(j => j.id === ancestor.parentId!) || ancestor;
          }
        }
        newParentId = ancestor.id;
      } else {
        newParentId = targetItem.parentId || null;
      }
    }

    // Build sibling list for new parent (excluding source)
    const siblings = items.filter(i => i.parentId === (newParentId || null) && i.id !== sourceId).sort((a, b) => a.order - b.order);
    const targetIdx = siblings.findIndex(s => s.id === targetId);

    // Insert position
    let insertIdx: number;
    if (overHalf === 'top') {
      insertIdx = targetIdx >= 0 ? targetIdx : 0;
    } else {
      insertIdx = targetIdx >= 0 ? targetIdx + 1 : siblings.length;
    }

    // Rebuild with new order
    siblings.splice(insertIdx, 0, { ...sourceItem, parentId: newParentId } as NavMenuItem);

    setItems(prev => {
      let updated = prev.map(i => {
        if (i.id === sourceId) return { ...i, parentId: newParentId };
        return i;
      });
      // Re-assign orders
      siblings.forEach((sib, idx) => {
        const idx2 = updated.findIndex(i => i.id === sib.id);
        if (idx2 >= 0) updated[idx2] = { ...updated[idx2], order: idx + 1 };
      });
      return updated;
    });
    markDirty();
  };

  // Save to DB
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

  // Add items from the "Add Items" panel
  const handleAddPage = (page: typeof AVAILABLE_PAGES[0]) => {
    if (items.find(i => i.uniqueKey === page.uniqueKey)) return;
    const newItem: NavMenuItem = {
      id: `nav-${Date.now().toString().slice(-6)}`,
      title: page.title,
      tabKey: page.tabKey,
      uniqueKey: page.uniqueKey,
      iconName: page.icon,
      order: items.length + 1,
      roles: ['Super Admin', 'Admin'],
      isVisible: true,
      parentId: null,
    };
    setItems(prev => [...prev, newItem]);
    markDirty();
  };

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
    setItems(prev => [...prev, newItem]);
    markDirty();
  };

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

  const handleToggleVisibility = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, isVisible: !i.isVisible } : i));
    markDirty();
  };

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

  const handleToggleRole = (id: string, role: string) => {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const has = i.roles.includes(role);
      return { ...i, roles: has ? i.roles.filter(r => r !== role) : [...i.roles, role] };
    }));
    markDirty();
  };

  const handleIndent = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const flat = flatVisible;
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

  const handleMove = (id: string, dir: 'up' | 'down') => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const siblings = items.filter(i => i.parentId === (item.parentId || null)).sort((a, b) => a.order - b.order);
    const sibIdx = siblings.findIndex(s => s.id === id);
    if (dir === 'up' && sibIdx <= 0) return;
    if (dir === 'down' && sibIdx >= siblings.length - 1) return;
    const swapIdx = dir === 'up' ? sibIdx - 1 : sibIdx + 1;
    const otherId = siblings[swapIdx].id;
    setItems(prev => prev.map(i => {
      if (i.id === id) return { ...i, order: siblings[swapIdx].order };
      if (i.id === otherId) return { ...i, order: item.order };
      return i;
    }));
    markDirty();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const expandAll = () => setExpandedIds(new Set(items.filter(i => i.parentId).map(i => i.parentId!)));
  const collapseAll = () => setExpandedIds(new Set());

  const addedKeys = new Set(items.map(i => i.uniqueKey));
  const filteredPages = AVAILABLE_PAGES.filter(p => {
    const matchSearch = p.title.toLowerCase().includes(addPanelSearch.toLowerCase());
    const matchCat = addPanelCategory === 'All' || p.category === addPanelCategory;
    return matchSearch && matchCat;
  });
  const addPanelCategories = ['All', ...new Set(AVAILABLE_PAGES.map(p => p.category))];

  // Render tree item
  const renderTreeItem = (item: NavMenuItem & { children?: any[] }, depth: number = 0) => {
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const isDragging = drag.sourceId === item.id;
    const isDropTarget = drag.active && drag.dropTargetId === item.id;
    const hasChildren = item.children && item.children.length > 0;
    const IconComp = AVAILABLE_ICONS[item.iconName] || NavIcon;

    // Placeholder line when dragging over
    let placeholderAbove = false;
    let placeholderBelow = false;
    if (isDropTarget && !isDragging) {
      if (drag.overHalf === 'top') placeholderAbove = true;
      else placeholderBelow = true;
    }

    return (
      <div key={item.id} className="select-none" data-nav-item-id={item.id}>
        {placeholderAbove && (
          <div className="h-0.5 bg-blue-500 rounded-full my-0.5 mx-2 shadow-sm" style={{ marginLeft: `${depth * INDENT_PX + 4}px` }} />
        )}
        <div
          ref={(el) => { if (el) itemRefs.current.set(item.id, el); else itemRefs.current.delete(item.id); }}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-xs group ${
            isDragging ? 'opacity-30 border-dashed border-blue-300 bg-blue-50/50' :
            isDropTarget ? 'border-blue-400 bg-blue-50/80 shadow-sm' :
            item.isVisible ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs' :
            'bg-slate-50 border-slate-200 opacity-60'
          }`}
          style={{ marginLeft: depth > 0 ? `${depth * INDENT_PX}px` : '0px' }}
        >
          {/* Drag Handle — mousedown starts custom drag */}
          <div
            onMouseDown={(e) => handleDragStart(e, item.id)}
            className="p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            title="Drag to reorder or change nesting level"
          >
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

          {/* Icon */}
          <button
            onClick={() => {
              const iconNames = Object.keys(AVAILABLE_ICONS);
              const nextIcon = iconNames[(iconNames.indexOf(item.iconName) + 1) % iconNames.length];
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

          {/* Title */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  type="text" autoFocus value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRename(item.id); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 px-2 py-0.5 text-xs font-bold border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button onClick={() => handleSaveRename(item.id)} className="p-0.5 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"><Check className="w-3.5 h-3.5" /></button>
                <button onClick={() => setEditingId(null)} className="p-0.5 text-slate-400 hover:bg-slate-100 rounded cursor-pointer"><X className="w-3.5 h-3.5" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className={`font-bold text-slate-800 truncate cursor-text hover:text-blue-600 ${!item.isVisible ? 'line-through text-slate-400' : ''}`} onClick={() => handleStartRename(item)} title="Click to rename">
                  {item.title}
                </span>
                {item.customUrl && <ExternalLink className="w-3 h-3 text-purple-400 shrink-0" title="External link" />}
                {!item.customUrl && <span className="text-[9px] font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-500 truncate max-w-[120px]">{item.uniqueKey}</span>}
              </div>
            )}
          </div>

          {/* Indent/Outdent */}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => handleOutdent(item.id)} disabled={!item.parentId} className="p-0.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer" title="Outdent">
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => handleIndent(item.id)} disabled={depth >= 2} className="p-0.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-20 disabled:pointer-events-none cursor-pointer" title="Indent">
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Move up/down */}
          <div className="flex flex-col gap-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => handleMove(item.id, 'up')} className="p-0 text-slate-400 hover:text-slate-700 cursor-pointer"><ChevronUp className="w-3 h-3" /></button>
            <button onClick={() => handleMove(item.id, 'down')} className="p-0 text-slate-400 hover:text-slate-700 cursor-pointer"><ChevronDown className="w-3 h-3" /></button>
          </div>

          {/* Visibility */}
          <button onClick={() => handleToggleVisibility(item.id)} className={`p-1 rounded-md transition-colors shrink-0 cursor-pointer ${item.isVisible ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
            {item.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          {/* Roles */}
          <button onClick={() => setShowRolesFor(showRolesFor === item.id ? null : item.id)} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors shrink-0 cursor-pointer">
            {item.roles.length}r
          </button>

          {/* Delete */}
          <button onClick={() => handleDelete(item.id)} className="p-1 rounded-md text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 opacity-0 group-hover:opacity-100 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Roles dropdown */}
        {showRolesFor === item.id && (
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
          </div>
        )}

        {placeholderBelow && (
          <div className="h-0.5 bg-blue-500 rounded-full my-0.5 mx-2 shadow-sm" style={{ marginLeft: `${depth * INDENT_PX + 4}px` }} />
        )}

        {/* Children */}
        {isExpanded && hasChildren && item.children!.sort((a: any, b: any) => a.order - b.order).map((child: any) => renderTreeItem(child, depth + 1))}
      </div>
    );
  };

  // Get the ghost item info
  const ghostItem = drag.sourceId ? items.find(i => i.id === drag.sourceId) : null;
  const GhostIcon = ghostItem ? (AVAILABLE_ICONS[ghostItem.iconName] || NavIcon) : null;

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
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{items.length} items</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAddPanel(!showAddPanel)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${showAddPanel ? 'bg-blue-100 text-blue-700 border border-blue-300' : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'}`}>
                <PanelRightOpen className="w-3.5 h-3.5" /> Add Items
              </button>
              {hasUnsaved && (
                <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer disabled:opacity-50">
                  {isSaving ? 'Saving...' : 'Save Menu'}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag grip to reorder</span>
            <span>Drag right → indent (nest)</span>
            <span>Drag left ← outdent</span>
            <span className="flex items-center gap-1"><Edit2 className="w-3 h-3" /> Click title to rename</span>
          </div>
        </div>

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
        <div ref={treeRef} className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {tree.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
              <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-bold text-sm mb-1">Menu is empty</p>
              <p className="text-slate-400 text-xs">Click "Add Items" to start building your menu</p>
            </div>
          ) : (
            tree.map(item => renderTreeItem(item, 0))
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
              <Plus className="w-4 h-4 text-emerald-600" /> Add Items
            </h3>
            <p className="text-[10px] text-slate-500 mt-0.5">Click to add pages to your menu</p>
          </div>
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input type="text" value={addPanelSearch} onChange={(e) => setAddPanelSearch(e.target.value)} placeholder="Search pages..." className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="px-3 py-1.5 border-b border-slate-100 flex flex-wrap gap-1">
            {addPanelCategories.map(cat => (
              <button key={cat} onClick={() => setAddPanelCategory(cat)} className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${addPanelCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{cat}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {filteredPages.map(page => {
              const isAdded = addedKeys.has(page.uniqueKey);
              const PageIcon = AVAILABLE_ICONS[page.icon] || NavIcon;
              return (
                <button key={page.uniqueKey} onClick={() => !isAdded && handleAddPage(page)} disabled={isAdded}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-all text-left ${isAdded ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default' : 'bg-slate-50 text-slate-700 border border-transparent hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 cursor-pointer'}`}>
                  <PageIcon className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold truncate flex-1">{page.title}</span>
                  {isAdded ? <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                </button>
              );
            })}
          </div>
          <CustomLinkAdder onAdd={handleAddCustomLink} />
        </div>
      )}

      {/* DRAG GHOST OVERLAY */}
      {drag.active && ghostItem && GhostIcon && (
        <div
          id="nav-drag-ghost"
          className="fixed z-[9999] pointer-events-none flex items-center gap-2 px-3 py-2 rounded-xl bg-white border-2 border-blue-500 shadow-2xl opacity-90"
          style={{
            left: drag.ghostX,
            top: drag.ghostY,
            width: drag.ghostWidth,
            marginLeft: `${drag.dropDepth * INDENT_PX}px`,
          }}
        >
          <GripVertical className="w-4 h-4 text-blue-400 shrink-0" />
          <GhostIcon className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-blue-800 truncate">{ghostItem.title}</span>
          <span className="text-[9px] font-mono text-blue-400 ml-auto shrink-0">L{drag.dropDepth}</span>
        </div>
      )}
    </div>
  );
};

const CustomLinkAdder: React.FC<{ onAdd: (title: string, url: string) => void }> = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const handleAdd = () => { if (!url.trim()) return; onAdd(title.trim() || 'Custom Link', url.trim()); setTitle(''); setUrl(''); setIsOpen(false); };

  return (
    <div className="border-t border-slate-100">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full px-4 py-2.5 flex items-center gap-2 text-xs font-bold text-purple-700 hover:bg-purple-50 transition-colors cursor-pointer">
        <LinkIcon className="w-3.5 h-3.5" /> Add Custom Link
        {isOpen ? <ChevronDown className="w-3 h-3 ml-auto" /> : <ChevronRight className="w-3 h-3 ml-auto" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Link text" className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none" />
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-purple-500 focus:outline-none" />
          <button onClick={handleAdd} disabled={!url.trim()} className="w-full py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-40">Add Link</button>
        </div>
      )}
    </div>
  );
};
