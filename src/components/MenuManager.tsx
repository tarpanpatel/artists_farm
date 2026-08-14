import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import {
  Utensils,
  Navigation as NavIcon,
  Plus,
  Edit2,
  Trash2,
  X,
  ShieldCheck,
  CheckSquare,
  Square,
  Grid,
  Image as ImageIcon,
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

      {/* SUB-TAB 2: FOOD MENU CATALOG */}
      {activeSubTab === 'food_menu' && (
        <div className="menu-manager__food-menu space-y-4">
          {/* Controls Bar */}
          <div className="menu-manager__controls bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="menu-manager__controls-filters flex items-center gap-2 w-full md:w-auto">
              <div className="w-full md:w-64">
                <Input
                  autoComplete="off"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder={t('search_food_items_placeholder', 'Search food items...')}
                />
              </div>

              {/* Category Dropdown */}
              <StyledSelect
                className="w-40"
                value={selectedFoodCategory}
                onChange={setSelectedFoodCategory}
                options={foodCategories.map((cat) => ({ value: cat, label: cat }))}
              />
            </div>

            <button
              onClick={handleOpenAddFood}
              className="menu-manager__add-food-btn w-full md:w-auto text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-semibold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t('add_food_menu_item_button', 'Add Food Menu Item')}</span>
            </button>
          </div>

          {/* Food Grid */}
          <div className="menu-manager__food-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredFoodItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleFoodDragStart(e, index)}
                onDragOver={(e) => handleFoodDragOver(e, index)}
                onDrop={(e) => handleFoodDrop(e, index)}
                className={`menu-manager__food-card bg-white rounded-xl border p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between cursor-grab active:cursor-grabbing ${
                  draggedFoodIndex === index ? 'opacity-40 border-blue-400' : ''
                } ${item.available ? 'border-slate-200' : 'border-red-200 bg-red-50/20'}`}
              >
                <div className="menu-manager__food-card-content space-y-2">
                  <div className="menu-manager__food-card-top flex items-center justify-between gap-2">
                    <div className="menu-manager__food-card-tags flex items-center gap-1.5">
                      <GripVertical className="w-4 h-4 text-slate-300 hover:text-slate-600 shrink-0" />
                      <span className="menu-manager__food-category text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                        {item.category}
                      </span>
                    </div>

                    <button
                      onClick={() => onUpdateFoodItem(item.id, { available: !item.available })}
                      className={`menu-manager__availability-badge text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        item.available
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                      }`}
                    >
                      {item.available ? t('available_badge', 'Available') : t('out_of_stock_badge', 'Out of Stock')}
                    </button>
                  </div>

                  {/* Food Item Image Preview / Quick Upload */}
                  <div className="menu-manager__food-image relative group rounded-lg overflow-hidden bg-slate-50 border border-slate-200 h-28 flex items-center justify-center">
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
                      <div className="menu-manager__food-image-empty flex flex-col items-center gap-1 text-slate-400 p-2">
                        <ImageIcon className="w-6 h-6" />
                        <span className="text-[10px] font-medium">{t('no_image_uploaded_label', 'No Image Uploaded')}</span>
                      </div>
                    )}

                    {/* Quick Image Upload Overlay Button */}
                    <label
                      className="menu-manager__image-upload-overlay absolute inset-0 bg-slate-900/60 text-white flex items-center justify-center gap-1 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-2xs"
                      title={t('upload_image_for_item_tooltip', 'Upload Image for this item')}
                    >
                      <Upload className="w-4 h-4" />
                      <span>{t('upload_image_button', 'Upload Image')}</span>
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
                    <h4 className="menu-manager__food-name font-semibold text-slate-900 text-sm">{item.name}</h4>
                    <p className="menu-manager__food-price text-emerald-700 font-semibold text-sm mt-0.5">₹{item.price.toFixed(2)}</p>
                  </div>
                </div>

                <div className="menu-manager__food-card-footer flex items-center justify-between pt-3 border-t border-slate-100 mt-3 text-xs">
                  <span className="menu-manager__food-id text-[10px] font-mono text-slate-400">ID: {item.id}</span>
                  <div className="menu-manager__food-actions flex items-center gap-1">
                    <button
                      onClick={() => requirePasscode(() => handleOpenEditFood(item))}
                      className="menu-manager__food-action-btn p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                      title={t('edit_item_tooltip', 'Edit Item')}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => requirePasscode(() => onDeleteFoodItem(item.id))}
                      className="menu-manager__food-action-btn menu-manager__food-action-btn--danger p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
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
      {iconPickerTargetId && (
        <div className="menu-manager__modal-overlay fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="menu-manager__icon-picker-modal bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="menu-manager__modal-header flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="menu-manager__modal-title font-semibold text-slate-900 text-sm">{t('select_navigation_icon_heading', 'Select Navigation Icon')}</h3>
              <button
                onClick={() => setIconPickerTargetId(null)}
                className="menu-manager__modal-close w-7 h-7 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="menu-manager__icon-grid grid grid-cols-4 gap-3 p-2 bg-slate-50 rounded-xl max-h-80 overflow-y-auto">
              {AVAILABLE_ICONS.map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleSelectIcon(iconPickerTargetId, item.name)}
                    className="menu-manager__icon-option p-3 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <IconComp className="w-6 h-6" />
                    <span className="text-[9px] font-semibold text-slate-500 truncate w-full text-center">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT MAIN MENU ITEM MODAL */}
      {isNavModalOpen && (
        <div className="menu-manager__modal-overlay fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="menu-manager__nav-modal bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="menu-manager__modal-header flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="menu-manager__modal-title font-semibold text-slate-900 text-base">
                {editingNavItem ? t('edit_main_menu_item_heading', 'Edit Main Menu Item') : t('add_new_main_menu_item_heading', 'Add New Main Menu Item')}
              </h3>
              <button
                onClick={() => setIsNavModalOpen(false)}
                className="menu-manager__modal-close w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNavItem} className="app-form app-form--save-nav-item menu-manager__nav-form space-y-3.5 text-xs">
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
                <div className="grid grid-cols-6 gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
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
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
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
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            : 'bg-white border-slate-200 text-slate-400'
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

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={navForm.isVisible}
                  onChange={(e) => setNavForm({ ...navForm, isVisible: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-slate-800">{t('visible_in_system_navigation_label', 'Visible in System Navigation')}</span>
              </label>

              <div className="menu-manager__custom-link-box bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-3">
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={navForm.openInNewTab}
                    onChange={(e) => setNavForm({ ...navForm, openInNewTab: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-slate-700 text-xs">{t('open_link_new_browser_tab_label', 'Open link in new browser tab')}</span>
                </label>
              </div>

              <div className="menu-manager__modal-footer pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNavModalOpen(false)}
                  className="menu-manager__modal-cancel px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="menu-manager__modal-submit px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm cursor-pointer"
                >
                  {editingNavItem ? t('save_changes_button', 'Save Changes') : t('create_item_button', 'Create Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD/EDIT FOOD ITEM MODAL */}
      {isAddFoodModalOpen && (
        <div className="menu-manager__modal-overlay fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="menu-manager__food-modal bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="menu-manager__modal-header flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="menu-manager__modal-title font-semibold text-slate-900 text-base">
                {editingFoodItem ? t('edit_food_menu_item_heading', 'Edit Food Menu Item') : t('add_new_food_menu_item_heading', 'Add New Food Menu Item')}
              </h3>
              <button
                onClick={() => setIsAddFoodModalOpen(false)}
                className="menu-manager__modal-close w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFoodItem} className="app-form app-form--save-food-item menu-manager__food-form space-y-3 text-xs">
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
                    <label className="menu-manager__upload-btn bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs shrink-0 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>{t('upload_image_button', 'Upload Image')}</span>
                      <Input
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
                    <div className="menu-manager__preview relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-50">
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

              <label className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={foodForm.available}
                  onChange={(e) => setFoodForm({ ...foodForm, available: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span className="font-semibold text-slate-800">{t('item_currently_available_label', 'Item Currently Available in Kitchen')}</span>
              </label>

              <div className="menu-manager__modal-footer pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddFoodModalOpen(false)}
                  className="menu-manager__modal-cancel px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  {t('cancel_button', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="menu-manager__modal-submit px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm cursor-pointer"
                >
                  {editingFoodItem ? t('save_changes_button', 'Save Changes') : t('create_item_button', 'Create Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSCODE VERIFICATION MODAL */}
      {passcodeModalOpen && (
        <div className="menu-manager__modal-overlay fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="menu-manager__passcode-modal bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="menu-manager__passcode-heading flex items-center gap-3">
              <div className="menu-manager__passcode-icon w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="menu-manager__passcode-title font-semibold text-slate-900 text-sm">{t('passcode_required_heading', 'Passcode Required')}</h3>
                <p className="menu-manager__passcode-text text-slate-500 text-xs">{t('enter_staff_passcode_message', 'Enter any staff passcode to proceed')}</p>
              </div>
            </div>

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

            <div className="menu-manager__passcode-actions flex justify-end gap-2">
              <button
                onClick={() => { setPasscodeModalOpen(false); setPendingPasscodeAction(null); setPasscodeInput(''); setPasscodeError(''); }}
                className="menu-manager__passcode-cancel px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer transition-colors"
              >
                {t('cancel_button', 'Cancel')}
              </button>
              <button
                onClick={handleVerifyPasscode}
                className="menu-manager__passcode-verify px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold text-xs cursor-pointer transition-colors shadow-sm"
              >
                {t('verify_continue_button', 'Verify & Continue')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
