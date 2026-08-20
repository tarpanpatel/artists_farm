import React, { useState, useEffect } from 'react';
import { Modal, ModalHeader, ModalBody, ModalFooter, TextInput as FlowbiteTextInput, Checkbox } from 'flowbite-react';
import { Button } from './Button';
import { Input } from './Input';
import {
  Utensils,
  Navigation as NavIcon,
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  ShieldCheck,
  CheckSquare,
  Square,
  Grid,
  Upload,
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  Boxes,
  Wallet,
  UserCheck,
  BarChart3,
  ScrollText,
  Settings,
  Bot,
  GripVertical,
  CreditCard,
  ShoppingCart,
  ClipboardList,
  Truck,
  CookingPot,
  Receipt,
  TrendingDown,
  Package,
  ShoppingBag,
  Filter,
} from 'lucide-react';
import { MenuItem, NavMenuItem } from '../types';
import { uploadImageDB } from '../services/api';
import { NavMenuEditor } from './NavMenuEditor';
import { StyledSelect } from './StyledSelect';
import { PageHeader } from './PageHeader';
import { t } from '../i18n/en';
import { SYSTEM_ROLES, NAV_CATEGORIES } from '../data/appConfig';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';

interface MenuManagerProps {
  foodMenu: MenuItem[];
  onAddFoodItem: (newItem: MenuItem) => void;
  onUpdateFoodItem: (id: number, updated: Partial<MenuItem>) => void;
  onDeleteFoodItem: (id: number) => void;
  navItems: NavMenuItem[];
  onUpdateNavItems: (items: NavMenuItem[]) => void;
  activeMenuItemKey?: string;
  kitchenModuleEnabled?: boolean;
}

const AVAILABLE_ICONS = [
  { name: 'LayoutDashboard', icon: LayoutDashboard },
  { name: 'Users', icon: Users },
  { name: 'CreditCard', icon: CreditCard },
  { name: 'ShoppingCart', icon: ShoppingCart },
  { name: 'UtensilsCrossed', icon: UtensilsCrossed },
  { name: 'Utensils', icon: Utensils },
  { name: 'ClipboardList', icon: ClipboardList },
  { name: 'Truck', icon: Truck },
  { name: 'CookingPot', icon: CookingPot },
  { name: 'Boxes', icon: Boxes },
  { name: 'Wallet', icon: Wallet },
  { name: 'UserCheck', icon: UserCheck },
  { name: 'Receipt', icon: Receipt },
  { name: 'TrendingDown', icon: TrendingDown },
  { name: 'Package', icon: Package },
  { name: 'ShoppingBag', icon: ShoppingBag },
  { name: 'BarChart3', icon: BarChart3 },
  { name: 'ScrollText', icon: ScrollText },
  { name: 'Grid', icon: Grid },
  { name: 'Bot', icon: Bot },
  { name: 'Settings', icon: Settings },
  { name: 'NavIcon', icon: NavIcon },
];

export const MenuManager: React.FC<MenuManagerProps> = ({
  foodMenu,
  onAddFoodItem,
  onUpdateFoodItem,
  onDeleteFoodItem,
  navItems,
  onUpdateNavItems,
  activeMenuItemKey,
  kitchenModuleEnabled = true,
}) => {
  const { staff } = useStaff();
  const { activeRole } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'food_menu' | 'nav_menu'>('food_menu');

  useEffect(() => {
    if (activeMenuItemKey === 'edit_main_menu') {
      setActiveSubTab('nav_menu');
    } else if (activeMenuItemKey === 'edit_food_menu') {
      setActiveSubTab('food_menu');
    }
  }, [activeMenuItemKey]);

  // Food Menu state
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFoodCategory, setSelectedFoodCategory] = useState<string>('All');
  const [showCategoryFilters, setShowCategoryFilters] = useState(false);
  const [isAddFoodModalOpen, setIsAddFoodModalOpen] = useState(false);
  const [editingFoodItem, setEditingFoodItem] = useState<MenuItem | null>(null);

  // New/Edit Food Form State
  const [foodForm, setFoodForm] = useState<{
    name: string;
    category: string;
    price: number;
    available: boolean;
    imagePath: string;
  }>({
    name: '',
    category: 'Starters',
    price: 150,
    available: true,
    imagePath: '',
  });

  // Navigation / Main Menu state
  const [iconPickerTargetId, setIconPickerTargetId] = useState<string | null>(null);

  // Add / Edit Navigation Item Modal state
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [editingNavItem] = useState<NavMenuItem | null>(null);
  const [navForm, setNavForm] = useState<{
    title: string;
    tabKey: string;
    uniqueKey: string;
    category: string;
    iconName: string;
    roles: string[];
    isVisible: boolean;
    customUrl: string;
    openInNewTab: boolean;
    parentId: string | null;
  }>({
    title: '',
    tabKey: 'dashboard',
    uniqueKey: '',
    category: 'Main Sections',
    iconName: 'LayoutDashboard',
    roles: ['Super Admin', 'Manager', 'Staff'],
    isVisible: true,
    customUrl: '',
    openInNewTab: false,
    parentId: null,
  });

  // Drag and Drop state for Navigation items

  // Drag and Drop state for Food items
  const [draggedFoodIndex, setDraggedFoodIndex] = useState<number | null>(null);
  const [dragOverFoodIndex, setDragOverFoodIndex] = useState<number | null>(null);

  // Passcode verification modal
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState('');
  const [pendingPasscodeAction, setPendingPasscodeAction] = useState<(() => void) | null>(null);

  const foodCategories = ['All', ...Array.from(new Set(foodMenu.map((item) => item.category).filter(Boolean)))];

  const filteredFoodItems = foodMenu.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(foodSearch.toLowerCase());
    const matchesCat = selectedFoodCategory === 'All' || item.category === selectedFoodCategory;
    return matchesSearch && matchesCat;
  });

  // Passcode verification
  const requirePasscode = (action: () => void) => {
    setPasscodeInput('');
    setPasscodeError('');
    setPendingPasscodeAction(() => action);
    setPasscodeModalOpen(true);
  };

  const handleVerifyPasscode = () => {
    const entered = passcodeInput.trim();
    const match = staff.find(s => (s.passcodePin || (s as any).passcode || '').toString().trim() === entered);
    if (match) {
      setPasscodeModalOpen(false);
      setPasscodeInput('');
      setPasscodeError('');
      const action = pendingPasscodeAction;
      setPendingPasscodeAction(null);
      if (action) action();
    } else {
      setPasscodeError('Invalid passcode. Please try again.');
      setPasscodeInput('');
    }
  };

  // Food Handlers
  const handleOpenAddFood = () => {
    setEditingFoodItem(null);
    setFoodForm({
      name: '',
      category: 'Starters',
      price: 150,
      available: true,
      imagePath: '',
    });
    setIsAddFoodModalOpen(true);
  };

  const handleOpenEditFood = (item: MenuItem) => {
    setEditingFoodItem(item);
    setFoodForm({
      name: item.name,
      category: item.category,
      price: item.price,
      available: item.available,
      imagePath: item.imagePath || '',
    });
    setIsAddFoodModalOpen(true);
  };

  const handleSaveFoodItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodForm.name.trim()) return;

    // Upload image if one is selected (base64 data URI)
    let savedImagePath = foodForm.imagePath;
    if (foodForm.imagePath && foodForm.imagePath.startsWith('data:image')) {
      const uploadedUrl = await uploadImageDB(foodForm.imagePath, 'menu');
      if (uploadedUrl) {
        savedImagePath = uploadedUrl;
      }
    }

    if (editingFoodItem) {
      onUpdateFoodItem(editingFoodItem.id, {
        name: foodForm.name,
        category: foodForm.category,
        price: Number(foodForm.price),
        available: foodForm.available,
        imagePath: savedImagePath,
      });
    } else {
      const newId = Date.now();
      onAddFoodItem({
        id: newId,
        name: foodForm.name,
        category: foodForm.category,
        price: Number(foodForm.price),
        available: foodForm.available,
        imagePath: savedImagePath,
      });
    }
    setIsAddFoodModalOpen(false);
  };

  // Drag and drop handler for Food menu
  const handleFoodDragStart = (e: React.DragEvent, index: number) => {
    setDraggedFoodIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleFoodDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverFoodIndex !== index) {
      setDragOverFoodIndex(index);
    }
  };

  const handleFoodDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedFoodIndex === null || draggedFoodIndex === targetIndex) {
      setDraggedFoodIndex(null);
      setDragOverFoodIndex(null);
      return;
    }

    const reordered = [...filteredFoodItems];
    const [movedItem] = reordered.splice(draggedFoodIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);

    // Update food menu order state
    setDraggedFoodIndex(null);
    setDragOverFoodIndex(null);
  };

  const handleSelectIcon = (navId: string, iconName: string) => {
    const updated = navItems.map((item) =>
      item.id === navId ? { ...item, iconName } : item
    );
    onUpdateNavItems(updated);
    setIconPickerTargetId(null);
  };

  const handleSaveNavItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!navForm.title.trim()) return;

    if (editingNavItem) {
      const updated = navItems.map((item) =>
        item.id === editingNavItem.id
          ? {
              ...item,
              title: navForm.title,
              tabKey: navForm.tabKey,
              uniqueKey: navForm.uniqueKey,
              category: navForm.category,
              iconName: navForm.iconName,
              roles: navForm.roles,
              isVisible: navForm.isVisible,
              customUrl: navForm.customUrl,
              openInNewTab: navForm.openInNewTab,
              parentId: navForm.parentId,
            }
          : item
      );
      onUpdateNavItems(updated);
    } else {
      const newItem: NavMenuItem = {
        id: `nav-${Date.now().toString().slice(-4)}`,
        title: navForm.title,
        tabKey: navForm.tabKey,
        uniqueKey: navForm.uniqueKey || navForm.title.toLowerCase().replace(/\s+/g, '_'),
        category: navForm.category,
        iconName: navForm.iconName,
        order: navItems.length + 1,
        roles: navForm.roles,
        isVisible: navForm.isVisible,
        customUrl: navForm.customUrl,
        openInNewTab: navForm.openInNewTab,
        parentId: navForm.parentId,
      };
      onUpdateNavItems([...navItems, newItem]);
    }
    setIsNavModalOpen(false);
  };

  const isStandalonePage = activeMenuItemKey === 'edit_food_menu' || activeMenuItemKey === 'edit_main_menu';

  return (
    <div className="menu-manager space-y-5">
      {/* Header Banner (Hidden on direct standalone pages) */}
      {!isStandalonePage && (
        <PageHeader
          title={t('system_menu_manager_heading', 'System Menu Manager')}
          subtitle={t('system_menu_manager_subtitle', 'Reorder main navigation items with drag & drop, configure access control (RBAC), and manage kitchen food catalog')}
        >
          {/* Sub-tab Navigation Switcher */}
          <div className="menu-manager__sub-tabs flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 w-full md:w-auto shrink-0">
            <Button
              variant={activeSubTab === 'nav_menu' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveSubTab('nav_menu')}
              leftIcon={<NavIcon className="w-4 h-4" />}
            >
              <span>{t('edit_main_menu_tab_label', 'Edit Main Menu')} ({navItems.length})</span>
            </Button>
            <Button
              variant={activeSubTab === 'food_menu' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveSubTab('food_menu')}
              leftIcon={<Utensils className="w-4 h-4" />}
            >
              <span>{t('food_catalog_tab_label', 'Food Catalog')} ({foodMenu.length})</span>
            </Button>
          </div>
        </PageHeader>
      )}

      {/* SUB-TAB 1: WORDPRESS-STYLE MAIN MENU MANAGER */}
      {activeSubTab === 'nav_menu' && (
        <NavMenuEditor
          navItems={navItems}
          onUpdateNavItems={onUpdateNavItems}
          activeRole={activeRole}
          hideKitchenItems={!kitchenModuleEnabled}
        />
      )}

      {/* SUB-TAB 2: FOOD MENU CATALOG (Matching #take_food_order layout & grouping) */}
      {activeSubTab === 'food_menu' && (
        <div className="menu-manager__food-menu space-y-4">
          {/* Top Search Bar & Controls */}
          <div className="bg-white dark:bg-slate-800 p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="relative flex-1">
                  <FlowbiteTextInput
                    id="menu-catalog-search"
                    autoComplete="off"
                    icon={Search}
                    value={foodSearch}
                    onChange={(e) => setFoodSearch(e.target.value)}
                    placeholder={t('search_food_items_placeholder', 'Quick search catalog metrics...')}
                    className="w-full"
                  />
                  {foodSearch && (
                    <button
                      type="button"
                      onClick={() => setFoodSearch('')}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer z-10"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCategoryFilters((v) => !v)}
                  className={`relative h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                    showCategoryFilters
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                      : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                  }`}
                  title={t('toggle_category_filters_tooltip', 'Filter by category')}
                  aria-label="Toggle category filters"
                  aria-expanded={showCategoryFilters}
                >
                  <Filter className="w-4 h-4" />
                  {selectedFoodCategory !== 'All' && !showCategoryFilters && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800" />
                  )}
                </button>
              </div>

              <Button variant="primary" size="sm" onClick={handleOpenAddFood} leftIcon={<Plus className="w-4 h-4" />}>
                <span>{t('add_food_menu_item_button', 'Add Food Menu Item')}</span>
              </Button>
            </div>

            {/* Category Filter Carousel (shown only when clicked on button next to search box) */}
            {showCategoryFilters && (
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                {foodCategories.map((cat) => {
                  const isSelected = selectedFoodCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedFoodCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {cat === 'All' ? 'All Menu' : cat}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Food Grid (Matching #take_food_order POS 6-column grid) */}
          <div className="menu-manager__food-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {filteredFoodItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleFoodDragStart(e, index)}
                onDragOver={(e) => handleFoodDragOver(e, index)}
                onDrop={(e) => handleFoodDrop(e, index)}
                className={`menu-manager__food-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200/90 dark:border-slate-700 p-2.5 shadow-md hover:shadow-md transition-all flex flex-col justify-between cursor-grab active:cursor-grabbing ${
                  draggedFoodIndex === index ? 'opacity-40 border-blue-400' : ''
                } ${item.available ? '' : 'bg-red-50/20 dark:bg-red-950/20'}`}
              >
                <div className="space-y-1.5">
                  {/* Category Tag & Availability Badge */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 overflow-hidden">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">
                        {item.category}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => onUpdateFoodItem(item.id, { available: !item.available })}
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer shrink-0 ${
                        item.available
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
                      }`}
                    >
                      {item.available ? t('available_badge', 'Available') : t('out_of_stock_badge', 'Out of Stock')}
                    </button>
                  </div>

                  {/* Image Preview & Quick Upload */}
                  <div className="relative group rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700/60 border border-slate-200/80 dark:border-slate-600 h-20 sm:h-16 flex items-center justify-center">
                    {item.imagePath ? (
                      <img
                        src={item.imagePath}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-0.5 text-slate-400 dark:text-slate-500 p-1">
                        <UtensilsCrossed className="w-5 h-5" />
                      </div>
                    )}

                    <label
                      className="absolute inset-0 bg-slate-900/70 text-white flex items-center justify-center gap-1 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-2xs"
                      title={t('upload_image_for_item_tooltip', 'Upload Image for this item')}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload</span>
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const dataUri = reader.result as string;
                              const uploadedUrl = await uploadImageDB(dataUri, 'menu');
                              onUpdateFoodItem(item.id, { imagePath: uploadedUrl || dataUri });
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div>
                    <h4 className="font-semibold text-slate-800 dark:text-slate-200 text-xs leading-tight line-clamp-2 min-h-[28px]">
                      {item.name}
                    </h4>
                    <p className="text-emerald-700 dark:text-emerald-400 font-extrabold text-xs sm:text-[11px] mt-0.5">
                      ₹{item.price}
                    </p>
                  </div>
                </div>

                {/* Footer Controls: Edit & Delete */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between mt-1 text-xs">
                  <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500">#{item.id}</span>
                  <div className="flex items-center gap-1">
                    <Button variant="primary" size="sm" onClick={() => requirePasscode(() => handleOpenEditFood(item))} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                      {t('edit_item_tooltip', 'Edit Item')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => requirePasscode(() => onDeleteFoodItem(item.id))}
                      className="p-1 rounded-md bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                      title={t('delete_item_tooltip', 'Delete Item')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ICON PICKER MODAL */}
      <Modal show={Boolean(iconPickerTargetId)} onClose={() => setIconPickerTargetId(null)} className="z-58" size="md" dismissible>
        <ModalHeader as="div">
          <span>{t('select_navigation_icon_heading', 'Select Navigation Icon')}</span>
        </ModalHeader>
        <ModalBody>
          <div className="menu-manager__icon-grid grid grid-cols-4 gap-3 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg max-h-80 overflow-y-auto">
            {AVAILABLE_ICONS.map((item) => {
              const IconComp = item.icon;
              return (
                <button
                  key={item.name}
                  onClick={() => handleSelectIcon(iconPickerTargetId!, item.name)}
                  className="menu-manager__icon-option p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 hover:text-emerald-600 rounded-lg flex flex-col items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-md"
                >
                  <IconComp className="w-6 h-6" />
                  <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 truncate w-full text-center">
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        </ModalBody>
      </Modal>

      {/* ADD / EDIT MAIN MENU ITEM MODAL */}
      <Modal show={isNavModalOpen} onClose={() => setIsNavModalOpen(false)} className="z-58" size="md" dismissible>
        <ModalHeader as="div">
          <span>{editingNavItem ? t('edit_main_menu_item_heading', 'Edit Main Menu Item') : t('add_new_main_menu_item_heading', 'Add New Main Menu Item')}</span>
        </ModalHeader>
        <form onSubmit={handleSaveNavItem} className="app-form app-form--save-nav-item menu-manager__nav-form">
          <ModalBody className="space-y-3.5 text-xs">
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('menu_title_label', 'Menu Title / Label')}</label>
              <Input
                type="text"
                required
                value={navForm.title}
                onChange={(e) => setNavForm({ ...navForm, title: e.target.value })}
                placeholder={t('resident_registration_placeholder', 'e.g. Resident Registration')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('target_section_tab_label', 'Target Section / Tab')}</label>
                <StyledSelect
                  value={navForm.tabKey}
                  onChange={(val) => setNavForm({ ...navForm, tabKey: val })}
                  options={[
                    { value: 'dashboard', label: 'Dashboard' },
                    { value: 'guests', label: 'Residents & Billing' },
                    { value: 'kitchen', label: 'Kitchen & Orders' },
                    { value: 'inventory', label: 'Inventory & Stock' },
                    { value: 'petty_cash', label: 'Expenses' },
                    { value: 'staff', label: 'Staff & HR' },
                    { value: 'analytics', label: 'Analytics' },
                    { value: 'audit_logs', label: 'Audit Logs' },
                    { value: 'menu_manager', label: 'Menu Manager' },
                    { value: 'telegram', label: 'Telegram Bot' },
                  ]}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_group_label', 'Category Group')}</label>
                <StyledSelect
                  value={navForm.category}
                  onChange={(val) => setNavForm({ ...navForm, category: val })}
                  options={NAV_CATEGORIES.filter((c) => c !== 'All Categories').map((cat) => ({ value: cat, label: cat }))}
                />
              </div>
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('parent_menu_item_label', 'Parent Menu Item (Hierarchy)')}</label>
              <StyledSelect
                value={navForm.parentId || ''}
                onChange={(val) => setNavForm({ ...navForm, parentId: val || null })}
                options={[
                  { value: '', label: t('root_level_no_parent_option', 'Root Level (no parent)') },
                  ...navItems.filter((i) => i.id !== editingNavItem?.id).map((item) => ({
                    value: item.id,
                    label: item.parentId ? `\u00A0\u00A0\u21B3 ${item.title}` : item.title,
                  })),
                ]}
              />
              <p className="text-[10px] text-slate-400 mt-1">{t('nest_item_hierarchy_help', 'Nest this item under another menu item to create a hierarchy group.')}</p>
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('icon_label', 'Icon')}</label>
              <div className="grid grid-cols-6 gap-2 p-2 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                {AVAILABLE_ICONS.slice(0, 12).map((item) => {
                  const IconC = item.icon;
                  const isSelected = navForm.iconName === item.name;
                  return (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setNavForm({ ...navForm, iconName: item.name })}
                      className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white shadow-md'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <IconC className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('permitted_roles_rbac_label', 'Permitted Roles (RBAC)')}</label>
              <div className="menu-manager__role-chips flex flex-wrap gap-1.5">
                {SYSTEM_ROLES.map((role) => {
                  const isChecked = navForm.roles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => {
                        const updatedRoles = isChecked
                          ? navForm.roles.filter((r) => r !== role)
                          : [...navForm.roles, role];
                        setNavForm({ ...navForm, roles: updatedRoles });
                      }}
                      className={`menu-manager__role-chip text-[11px] font-semibold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
                      }`}
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span>{role}</span>
                    </button>
                  );
                })}
              </div>
            </div>

<Checkbox
                  id="nav-visibility-cb"
                  checked={navForm.isVisible}
                  onChange={e => setNavForm({ ...navForm, isVisible: e.target.checked })}
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{t('visible_in_system_navigation_label', 'Visible in System Navigation')}</span>

            <div className="menu-manager__custom-link-box bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('custom_link_optional_heading', 'Custom Link (Optional)')}</p>
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('external_url_custom_link_label', 'External URL / Custom Link')}</label>
                <Input
                  type="url"
                  value={navForm.customUrl}
                  onChange={(e) => setNavForm({ ...navForm, customUrl: e.target.value })}
                  placeholder={t('custom_link_url_placeholder', 'e.g. https://example.com or /some/path')}
                />
                <p className="text-[10px] text-slate-400 mt-1">{t('custom_link_help', 'If set, clicking this menu item opens this link instead of an internal tab.')}</p>
              </div>
              <Checkbox
                  id="nav-open-in-new-tab-cb"
                  checked={navForm.openInNewTab}
                  onChange={e => setNavForm({ ...navForm, openInNewTab: e.target.checked })}
                />
                <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">{t('open_link_new_browser_tab_label', 'Open link in new browser tab')}</span>
            </div>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsNavModalOpen(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              {editingNavItem ? t('save_changes_button', 'Save Changes') : t('create_item_button', 'Create Item')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* ADD/EDIT FOOD ITEM MODAL */}
      <Modal show={isAddFoodModalOpen} onClose={() => setIsAddFoodModalOpen(false)} className="z-58" size="md" dismissible>
        <ModalHeader as="div">
          <span>{editingFoodItem ? t('edit_food_menu_item_heading', 'Edit Food Menu Item') : t('add_new_food_menu_item_heading', 'Add New Food Menu Item')}</span>
        </ModalHeader>
        <form onSubmit={handleSaveFoodItem} className="app-form app-form--save-food-item menu-manager__food-form">
          <ModalBody className="space-y-3 text-xs">
            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('item_title_name_label', 'Item Title / Name')}</label>
              <Input
                type="text"
                required
                value={foodForm.name}
                onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
                placeholder={t('paneer_butter_masala_placeholder', 'e.g. Paneer Butter Masala')}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('menu_category_label', 'Category')}</label>
                <StyledSelect
                  value={foodForm.category}
                  onChange={(val) => setFoodForm({ ...foodForm, category: val })}
                  options={foodCategories.filter((c) => c !== 'All').map((cat) => ({ value: cat, label: cat }))}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('price_rupees_label', 'Price (₹)')}</label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={foodForm.price}
                  onChange={(e) => setFoodForm({ ...foodForm, price: Number(e.target.value) })}
                />
              </div>
            </div>

            <div>
              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('item_image_upload_url_label', 'Item Image Upload / URL')}</label>
              <div className="menu-manager__field space-y-2">
                <div className="menu-manager__upload-row flex items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-300 dark:border-slate-600">
                    <Upload className="w-4 h-4" />
                    <span>{t('upload_image_button', 'Upload Image')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setFoodForm({ ...foodForm, imagePath: reader.result as string });
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>

                  <Input
                    type="text"
                    value={foodForm.imagePath}
                    onChange={(e) => setFoodForm({ ...foodForm, imagePath: e.target.value })}
                    placeholder={t('or_enter_image_url_placeholder', 'Or enter image URL / asset path...')}
                    className="flex-1"
                  />
                </div>

                {/* Image Preview Box */}
                {foodForm.imagePath && (
                  <div className="menu-manager__preview relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
                    <img
                      src={foodForm.imagePath}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setFoodForm({ ...foodForm, imagePath: '' })}
                      className="menu-manager__preview-remove absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900 cursor-pointer"
                      title={t('remove_image_tooltip', 'Remove Image')}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

<Checkbox
                  id="food-available-cb"
                  checked={foodForm.available}
                  onChange={e => setFoodForm({ ...foodForm, available: e.target.checked })}
                />
                <span className="font-semibold text-slate-800 dark:text-slate-200">{t('item_currently_available_label', 'Item Currently Available in Kitchen')}</span>
          </ModalBody>
          <ModalFooter className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsAddFoodModalOpen(false)}
            >
              {t('cancel_button', 'Cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
            >
              {editingFoodItem ? t('save_changes_button', 'Save Changes') : t('create_item_button', 'Create Item')}
            </Button>
          </ModalFooter>
        </form>
      </Modal>

      {/* PASSCODE VERIFICATION MODAL */}
      <Modal show={passcodeModalOpen} onClose={() => { setPasscodeModalOpen(false); setPendingPasscodeAction(null); setPasscodeInput(''); setPasscodeError(''); }} className="z-58" size="sm" dismissible>
        <ModalHeader as="div">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{t('passcode_required_heading', 'Passcode Required')}</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-normal">{t('enter_staff_passcode_message', 'Enter any staff passcode to proceed')}</p>
            </div>
          </div>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <Input
            type="password"
            autoComplete="new-password"
            autoFocus
            maxLength={6}
            value={passcodeInput}
            onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleVerifyPasscode(); } }}
            placeholder={t('enter_passcode_placeholder', 'Enter passcode')}
            inputMode="numeric"
            className="text-center"
          />

          {passcodeError && (
            <p className="menu-manager__passcode-error text-red-500 text-xs font-semibold text-center">{passcodeError}</p>
          )}
        </ModalBody>
        <ModalFooter className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() => { setPasscodeModalOpen(false); setPendingPasscodeAction(null); setPasscodeInput(''); setPasscodeError(''); }}
          >
            {t('cancel_button', 'Cancel')}
          </Button>
          <Button
            variant="warning"
            onClick={handleVerifyPasscode}
          >
            {t('verify_continue_button', 'Verify & Continue')}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
