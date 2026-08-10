import React, { useState, useEffect } from 'react';
import {
  UtensilsCrossed,
  Soup,
  ClipboardList,
  PackageCheck,
  Trash2,
  Boxes,
  ShoppingBag,
  BookOpen,
  Sliders,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Clock,
  Package,
  GripVertical,
  RotateCcw,
  CookingPot,
} from 'lucide-react';
import { Button } from './Button';
import { Badge } from './Badge';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { useAuth } from '../contexts/AuthContext';
import { useKitchenContext } from '../contexts/KitchenContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { NavMenuItem } from '../types';

interface KitchenDashboardProps {
  onNavigate: (uniqueKey: string, tabKey?: string) => void;
  navItems?: NavMenuItem[];
}

export const KitchenDashboard: React.FC<KitchenDashboardProps> = ({ onNavigate, navItems }) => {
  const { activeRole } = useAuth();
  const { pendingOrdersCount } = useKitchenContext();
  const { lowStockCount, requisitions } = useInventoryContext();

  const [customCardOrder, setCustomCardOrder] = useState<string[] | null>(() => {
    try {
      const saved = localStorage.getItem('kitchen_dashboard_card_order');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);

  const pendingRequisitionsCount = (requisitions || []).filter(
    (r: any) => r.status === 'Pending' || r.status === 'Requested'
  ).length;

  const cards: Array<{
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<any>;
    color: string;
    buttonVariant: 'primary' | 'secondary' | 'tertiary' | 'success' | 'danger' | 'warning';
    badgeText: string | null;
    badgeVariant: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
    uniqueKey: string;
    tabKey: string;
  }> = [
    {
      id: 'take_food_order',
      title: t('take_food_order_heading', 'Take Food Order'),
      description: t('take_food_order_desc', 'Create new KOT orders, select tables/rooms, and send directly to kitchen.'),
      icon: UtensilsCrossed,
      color: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60',
      buttonVariant: 'success',
      badgeText: pendingOrdersCount > 0 ? `${pendingOrdersCount} Active` : null,
      badgeVariant: 'success',
      uniqueKey: 'take_food_order',
      tabKey: 'kitchen',
    },
    {
      id: 'kitchen_orders',
      title: t('kitchen_orders_heading', 'Kitchen Live Orders'),
      description: t('kitchen_orders_desc', 'Live Kitchen Display System (KDS) queue to track active KOT orders, cooking status, and prep.'),
      icon: CookingPot,
      color: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/60',
      buttonVariant: 'warning',
      badgeText: pendingOrdersCount > 0 ? `${pendingOrdersCount} Preparing` : null,
      badgeVariant: 'warning',
      uniqueKey: 'kitchen_orders',
      tabKey: 'kitchen',
    },
    {
      id: 'stock_requests',
      title: t('stock_requests_heading', 'Stock Requests'),
      description: t('stock_requests_desc', 'Submit material and raw ingredient requisitions to central inventory.'),
      icon: ClipboardList,
      color: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/60',
      buttonVariant: 'primary',
      badgeText: pendingRequisitionsCount > 0 ? `${pendingRequisitionsCount} Pending` : null,
      badgeVariant: 'info',
      uniqueKey: 'stock_requests',
      tabKey: 'inventory',
    },
    {
      id: 'fulfill_stock_req',
      title: t('fulfill_stock_req_heading', 'Fulfill Stock Requests'),
      description: t('fulfill_stock_req_desc', 'Approve, fulfill, and issue requested inventory items to kitchen departments.'),
      icon: PackageCheck,
      color: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800/60',
      buttonVariant: 'primary',
      badgeText: null,
      badgeVariant: 'info',
      uniqueKey: 'fulfill_stock_req',
      tabKey: 'inventory',
    },
    {
      id: 'staff_meals',
      title: t('staff_meals_heading', 'Staff Meals'),
      description: t('staff_meals_desc', 'Record daily staff food consumption, meal allowances, and kitchen staff logs.'),
      icon: Soup,
      color: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60',
      buttonVariant: 'warning',
      badgeText: null,
      badgeVariant: 'warning',
      uniqueKey: 'staff_meals',
      tabKey: 'kitchen',
    },
    {
      id: 'deficit_shortfalls_log',
      title: t('kitchen_wastage_heading', 'Kitchen Wastage'),
      description: t('kitchen_wastage_desc', 'Log spoiled ingredients, broken items, shortfalls, and kitchen waste logs.'),
      icon: Trash2,
      color: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60',
      buttonVariant: 'danger',
      badgeText: lowStockCount > 0 ? `${lowStockCount} Low Stock` : null,
      badgeVariant: 'danger',
      uniqueKey: 'deficit_shortfalls_log',
      tabKey: 'inventory',
    },
    {
      id: 'stock_log',
      title: t('stock_log_heading', 'Stock Log & Adjustment'),
      description: t('stock_log_desc', 'Audit full inventory stock history, track usage trends, and adjust stock counts.'),
      icon: Boxes,
      color: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/60',
      buttonVariant: 'primary',
      badgeText: null,
      badgeVariant: 'neutral',
      uniqueKey: 'stock_log',
      tabKey: 'inventory',
    },
    {
      id: 'kitchen_purchases',
      title: t('kitchen_purchases_heading', 'Kitchen Purchases'),
      description: t('kitchen_purchases_desc', 'Log raw ingredient purchases, vendor invoices, supplier costs, and bills.'),
      icon: ShoppingBag,
      color: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60',
      buttonVariant: 'primary',
      badgeText: null,
      badgeVariant: 'neutral',
      uniqueKey: 'kitchen_purchases',
      tabKey: 'inventory',
    },
    {
      id: 'edit_kitchen_stock',
      title: t('edit_kitchen_stock_heading', 'Edit Kitchen Stock'),
      description: t('edit_kitchen_stock_desc', 'Manage raw inventory catalog items, alert thresholds, units, and supplier info.'),
      icon: Sliders,
      color: 'bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
      buttonVariant: 'secondary',
      badgeText: null,
      badgeVariant: 'neutral',
      uniqueKey: 'edit_kitchen_stock',
      tabKey: 'inventory',
    },
    {
      id: 'edit_food_menu',
      title: t('edit_food_menu_heading', 'Edit Food Menu'),
      description: t('edit_food_menu_desc', 'Add new dishes, update prices, manage categories, and customize food items.'),
      icon: BookOpen,
      color: 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/60',
      buttonVariant: 'secondary',
      badgeText: null,
      badgeVariant: 'neutral',
      uniqueKey: 'edit_food_menu',
      tabKey: 'menu_manager',
    },
  ];

  const normalizedActiveRole = (activeRole || '').toLowerCase().trim();
  const isSuperOrRoot = normalizedActiveRole === 'super admin' || normalizedActiveRole === 'root admin';

  const visibleCards = cards.filter((card) => {
    if (!navItems || navItems.length === 0) return true;
    const item = navItems.find((i) => i.uniqueKey === card.uniqueKey);
    if (!item) return false;
    if (!item.isVisible) return false;
    if (isSuperOrRoot) return true;
    if (!item.roles || item.roles.length === 0) return true;
    return item.roles.some((r) => r.toLowerCase().trim() === normalizedActiveRole);
  });

  // Calculate default order strictly matching sidebar nav sequence
  const getDefaultCardOrder = (): string[] => {
    const defaultSequence = [
      'take_food_order',
      'kitchen_orders',
      'stock_requests',
      'fulfill_stock_req',
      'staff_meals',
      'deficit_shortfalls_log',
      'stock_log',
      'kitchen_purchases',
      'edit_kitchen_stock',
      'edit_food_menu',
    ];

    if (!navItems || navItems.length === 0) return defaultSequence;

    const navIndexMap = new Map<string, number>();
    navItems.forEach((item, index) => {
      if (item.uniqueKey) {
        navIndexMap.set(item.uniqueKey, item.order ?? index);
      }
    });

    return [...cards]
      .sort((a, b) => {
        const idxA = navIndexMap.has(a.uniqueKey) ? navIndexMap.get(a.uniqueKey)! : defaultSequence.indexOf(a.uniqueKey);
        const idxB = navIndexMap.has(b.uniqueKey) ? navIndexMap.get(b.uniqueKey)! : defaultSequence.indexOf(b.uniqueKey);
        return idxA - idxB;
      })
      .map((c) => c.id);
  };

  const activeOrder = customCardOrder || getDefaultCardOrder();

  const orderedVisibleCards = [...visibleCards].sort((a, b) => {
    const idxA = activeOrder.indexOf(a.id);
    const idxB = activeOrder.indexOf(b.id);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  // HTML5 Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedCardId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCardId !== id) {
      setDragOverCardId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCardId || draggedCardId === targetId) return;

    const currentOrderIds = orderedVisibleCards.map((c) => c.id);
    const fromIdx = currentOrderIds.indexOf(draggedCardId);
    const toIdx = currentOrderIds.indexOf(targetId);

    if (fromIdx !== -1 && toIdx !== -1) {
      const nextOrder = [...currentOrderIds];
      const [moved] = nextOrder.splice(fromIdx, 1);
      nextOrder.splice(toIdx, 0, moved);

      setCustomCardOrder(nextOrder);
      try {
        localStorage.setItem('kitchen_dashboard_card_order', JSON.stringify(nextOrder));
      } catch (err) {
        console.error('Failed to save card order:', err);
      }
    }
    setDraggedCardId(null);
    setDragOverCardId(null);
  };

  const handleDragEnd = () => {
    setDraggedCardId(null);
    setDragOverCardId(null);
  };

  const handleResetOrder = () => {
    try {
      localStorage.removeItem('kitchen_dashboard_card_order');
    } catch {}
    setCustomCardOrder(null);
  };

  return (
    <div className="space-y-2 md:space-y-6">
      <PageHeader
        title={t('kitchen_dashboard_title', 'Kitchen & Dining Operations')}
        subtitle={t('kitchen_dashboard_subtitle', 'Central command for food orders, staff meals, ingredient stock, and inventory logs.')}
      >
        {/* Live Quick Stats Badges */}
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold text-emerald-700 dark:text-emerald-300">
          <Clock className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{pendingOrdersCount} {t('active_orders_label', 'Active Orders')}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/60 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>{lowStockCount} {t('low_stock_label', 'Low Stock Items')}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 md:px-3 md:py-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 rounded-lg md:rounded-xl text-[10px] md:text-xs font-bold text-blue-700 dark:text-blue-300">
          <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{pendingRequisitionsCount} {t('open_requests_label', 'Open Stock Req')}</span>
        </div>
      </PageHeader>

      {/* Action Grid - Drag and Drop Enabled via 6-dots Handle */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 md:gap-5">
        {orderedVisibleCards.map((card) => {
          const IconComponent = card.icon;
          const isDragging = draggedCardId === card.id;
          const isDragOver = dragOverCardId === card.id;

          return (
            <div
              key={card.id}
              onDragOver={(e) => handleDragOver(e, card.id)}
              onDrop={(e) => handleDrop(e, card.id)}
              onDragEnd={handleDragEnd}
              className={`bg-white dark:bg-slate-800 rounded-xl md:rounded-2xl border transition-all duration-200 p-2 md:p-5 flex flex-col justify-between group relative select-none ${
                isDragging
                  ? 'opacity-30 scale-[0.98] border-dashed border-blue-400 shadow-none'
                  : isDragOver
                  ? 'ring-2 ring-blue-500 ring-offset-2 border-blue-400 dark:border-blue-500 scale-[1.01] shadow-lg'
                  : 'border-slate-200 dark:border-slate-700 shadow-2xs hover:shadow-md'
              }`}
            >
              {/* Mobile Layout (bare icon without square box, compact 1-row layout) */}
              <div className="flex md:hidden items-center justify-between gap-2 w-full">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-grab active:cursor-grabbing p-0.5 rounded transition-colors shrink-0"
                    title="Drag handle"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  {/* Bare Icon without square box on mobile */}
                  <IconComponent className="w-4.5 h-4.5 text-slate-700 dark:text-slate-200 shrink-0" />
                  <div className="min-w-0 flex-1 flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {card.title}
                    </h3>
                    {card.badgeText && (
                      <Badge variant={card.badgeVariant} className="text-[9px] font-bold py-0 px-1 inline-flex shrink-0">
                        {card.badgeText}
                      </Badge>
                    )}
                  </div>
                </div>

                <Button
                  variant={card.buttonVariant}
                  size="sm"
                  className="shrink-0 font-bold px-2.5 py-1 cursor-pointer text-[11px] h-7"
                  onClick={() => onNavigate(card.uniqueKey, card.tabKey)}
                  rightIcon={<ArrowRight className="w-3 h-3" />}
                >
                  <span>Open</span>
                </Button>
              </div>

              {/* Desktop Layout (full rich card with description) */}
              <div className="hidden md:flex flex-col justify-between h-full space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id)}
                        className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing p-1 -m-1 rounded-md transition-colors"
                        title="Drag handle - click & drag to reorder"
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div className={`p-3 rounded-xl border ${card.color} transition-transform group-hover:scale-105`}>
                        <IconComponent className="w-6 h-6" />
                      </div>
                    </div>
                    {card.badgeText && (
                      <Badge variant={card.badgeVariant} className="font-bold">
                        {card.badgeText}
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {card.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60">
                  <Button
                    variant={card.buttonVariant}
                    size="sm"
                    block
                    className="justify-center gap-2 font-bold cursor-pointer"
                    onClick={() => onNavigate(card.uniqueKey, card.tabKey)}
                    rightIcon={<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />}
                  >
                    <span>Open {card.title}</span>
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
