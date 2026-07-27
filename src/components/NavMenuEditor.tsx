import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sortable from 'sortablejs';
import {
  GripVertical, Plus, Trash2, Edit2, Eye, EyeOff, ChevronDown, ChevronRight,
  Check, X, LayoutDashboard, Users, CreditCard, ShoppingCart,
  UtensilsCrossed, Utensils, ClipboardList, Truck, CookingPot, Boxes,
  Wallet, UserCheck, Receipt, TrendingDown, Package, ShoppingBag,
  BarChart3, ScrollText, Grid, Bot, Settings, Navigation as NavIcon,
  Link as LinkIcon, ExternalLink, Paintbrush, ChevronUp, List,
  Layers, DollarSign, ShieldCheck,
  PanelLeftClose, PanelRightOpen
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

export const NavMenuEditor: React.FC<NavMenuEditorProps> = ({
  navItems,
  onUpdateNavItems,
  activeRole,
}) => {
  const [items, setItems] = useState<NavMenuItem[]>(navItems);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRolesFor, setShowRolesFor] = useState<string | null>(null);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sortableInstances = useRef<Sortable[]>([]);
  const sortableContainerRef = useRef<HTMLDivElement>(null);

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

  // ========== SORTABLE.JS SETUP ==========
  // Extract flat list from DOM after Sortable reorders
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
        if (childUl) {
          processList(childUl, id);
        }
      });
    };
    const rootUl = sortableContainerRef.current?.querySelector(':scope > ul') as HTMLUListElement | null;
    if (rootUl) processList(rootUl, null);
    return result;
  }, [items]);

  // Initialize Sortable on all <ul> elements
  const initSortable = useCallback(() => {
    // Destroy previous instances
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

  // Re-init sortable when tree changes
  useEffect(() => {
    const timer = setTimeout(initSortable, 50);
    return () => clearTimeout(timer);
  }, [tree, expandedIds, initSortable]);

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

  // Flatten visible tree for indent/outdent/move buttons
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

  // Render tree item as <li>
  const renderTreeItem = (item: NavMenuItem & { children?: any[] }, depth: number = 0) => {
    const isExpanded = expandedIds.has(item.id);
    const isEditing = editingId === item.id;
    const hasChildren = item.children && item.children.length > 0;
    const IconComp = AVAILABLE_ICONS[item.iconName] || NavIcon;

    const depthColors = ['border-l-blue-400', 'border-l-emerald-400', 'border-l-amber-400'];
    const depthBg = ['', 'bg-blue-50/30', 'bg-emerald-50/30'];

    return (
      <li key={item.id} data-id={item.id} className="nav-menu-item" style={{ paddingLeft: depth > 0 ? `${depth * 24}px` : '0px' }}>
        <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-l-[3px] transition-all text-xs group my-0.5 ${
          item.isVisible ? 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-2xs' :
          'bg-slate-50 border-slate-200 opacity-60'
        } ${depthColors[Math.min(depth, 2)]} ${depthBg[Math.min(depth, 2)] || ''}`}>
          {/* Drag Handle */}
          <div className="hs-handle p-0.5 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 cursor-grab active:cursor-grabbing shrink-0 transition-colors"
            title="Drag to reorder or nest">
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

        {/* Children rendered as nested <ul> */}
        {isExpanded && hasChildren && (
          <ul data-sortable className="ml-2 pl-3 border-l-2 border-slate-200 my-1">
            {item.children!.sort((a: any, b: any) => a.order - b.order).map((child: any) => renderTreeItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[600px]">
      {/* Menu Structure */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <h3 className="font-extrabold text-slate-900 text-sm">Menu Structure</h3>
              <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">{items.length} items</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const newId = `nav-${Date.now().toString().slice(-6)}`;
                const newItem: NavMenuItem = {
                  id: newId,
                  title: 'New Menu Item',
                  tabKey: 'dashboard',
                  uniqueKey: `new_${newId}`,
                  iconName: 'LayoutDashboard',
                  order: items.length + 1,
                  roles: ['Super Admin', 'Admin'],
                  isVisible: true,
                  parentId: null,
                };
                setItems(prev => [...prev, newItem]);
                setEditingId(newId);
                setEditTitle('New Menu Item');
                markDirty();
              }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer">
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
            <span className="flex items-center gap-1"><GripVertical className="w-3 h-3" /> Drag grip to reorder</span>
            <span>Nest by dragging between levels</span>
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
        <div ref={sortableContainerRef} className="flex-1 overflow-y-auto p-3">
          {tree.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
              <LayoutDashboard className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 font-bold text-sm mb-1">Menu is empty</p>
              <p className="text-slate-400 text-xs">Click "Add Items" to start building your menu</p>
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

    </div>
  );
};
