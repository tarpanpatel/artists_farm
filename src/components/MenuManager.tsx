import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Navigation as NavIcon,
  Plus,
  Edit2,
  Trash2,
  Search,
  Eye,
  EyeOff,
  MoveUp,
  MoveDown,
  Check,
  X,
  ShieldCheck,
  CheckSquare,
  Square,
  Sparkles,
  DollarSign,
  Tag,
  Grid,
  ListFilter,
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
  Layers,
  Link as LinkIcon,
  Info,
  Paintbrush
} from 'lucide-react';
import { MenuItem, NavMenuItem, StaffMember } from '../types';
import { uploadImageDB } from '../services/api';
import { CustomCSSOverride } from './CustomCSSOverride';
import { NavMenuEditor } from './NavMenuEditor';
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
}) => {
  const { staff } = useStaff();
  const { activeRole } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'food_menu' | 'nav_menu' | 'custom_css'>('food_menu');

  useEffect(() => {
    if (activeMenuItemKey === 'edit_main_menu') {
      setActiveSubTab('nav_menu');
    } else if (activeMenuItemKey === 'edit_food_menu') {
      setActiveSubTab('food_menu');
    } else if (activeMenuItemKey === 'custom_css') {
      setActiveSubTab('custom_css');
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
  const [navSearch, setNavSearch] = useState('');
  const [selectedNavCategory, setSelectedNavCategory] = useState('All Categories');
  const [iconPickerTargetId, setIconPickerTargetId] = useState<string | null>(null);

  // Add / Edit Navigation Item Modal state
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [editingNavItem, setEditingNavItem] = useState<NavMenuItem | null>(null);
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
  const [draggedNavIndex, setDraggedNavIndex] = useState<number | null>(null);
  const [dragOverNavIndex, setDragOverNavIndex] = useState<number | null>(null);

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

  const filteredNavItems = navItems.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(navSearch.toLowerCase()) ||
      item.tabKey.toLowerCase().includes(navSearch.toLowerCase()) ||
      (item.uniqueKey && item.uniqueKey.toLowerCase().includes(navSearch.toLowerCase()));
    const matchesCat =
      selectedNavCategory === 'All Categories' || item.category === selectedNavCategory;
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

  // Navigation Menu Handlers & Drag-and-Drop
  const handleToggleNavVisibility = (id: string) => {
    const updated = navItems.map((item) =>
      item.id === id ? { ...item, isVisible: !item.isVisible } : item
    );
    onUpdateNavItems(updated);
  };

  const handleMoveNavItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= navItems.length) return;

    const copy = [...navItems];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    const reordered = copy.map((item, idx) => ({ ...item, order: idx + 1 }));
    onUpdateNavItems(reordered);
  };

  const handleNavDragStart = (e: React.DragEvent, index: number) => {
    setDraggedNavIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleNavDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverNavIndex !== index) {
      setDragOverNavIndex(index);
    }
  };

  const handleNavDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedNavIndex === null || draggedNavIndex === targetIndex) {
      setDraggedNavIndex(null);
      setDragOverNavIndex(null);
      return;
    }

    const copy = [...navItems];
    const [draggedItem] = copy.splice(draggedNavIndex, 1);
    copy.splice(targetIndex, 0, draggedItem);

    const reordered = copy.map((item, idx) => ({ ...item, order: idx + 1 }));
    onUpdateNavItems(reordered);

    setDraggedNavIndex(null);
    setDragOverNavIndex(null);
  };

  const handleNavDragEnd = () => {
    setDraggedNavIndex(null);
    setDragOverNavIndex(null);
  };

  const handleToggleRolePermission = (navId: string, roleName: string) => {
    const updated = navItems.map((item) => {
      if (item.id !== navId) return item;
      const hasRole = item.roles.includes(roleName);
      const newRoles = hasRole
        ? item.roles.filter((r) => r !== roleName)
        : [...item.roles, roleName];
      return { ...item, roles: newRoles };
    });
    onUpdateNavItems(updated);
  };

  const handleSelectIcon = (navId: string, iconName: string) => {
    const updated = navItems.map((item) =>
      item.id === navId ? { ...item, iconName } : item
    );
    onUpdateNavItems(updated);
    setIconPickerTargetId(null);
  };

  const handleOpenAddNavModal = () => {
    setEditingNavItem(null);
    setNavForm({
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
    setIsNavModalOpen(true);
  };

  const handleOpenEditNavModal = (item: NavMenuItem) => {
    setEditingNavItem(item);
    setNavForm({
      title: item.title,
      tabKey: item.tabKey,
      uniqueKey: item.uniqueKey || '',
      category: item.category || 'Main Sections',
      iconName: item.iconName,
      roles: item.roles,
      isVisible: item.isVisible,
      customUrl: (item as any).customUrl || '',
      openInNewTab: (item as any).openInNewTab || false,
      parentId: item.parentId || null,
    });
    setIsNavModalOpen(true);
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

  const handleDeleteNavItem = (id: string) => {
    (window as any).showConfirm('Are you sure you want to remove this menu item from the system menu?', () => {
      const updated = navItems.filter((i) => i.id !== id).map((item, idx) => ({ ...item, order: idx + 1 }));
      onUpdateNavItems(updated);
    });
  };

  const isStandalonePage = activeMenuItemKey === 'edit_food_menu' || activeMenuItemKey === 'edit_main_menu';

  return (
    <div className="space-y-5">
      {/* Header Banner (Hidden on direct standalone pages) */}
      {!isStandalonePage && (
        <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-200">
                <Grid className="w-4 h-4" />
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight">System Menu Manager</h2>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Reorder main navigation items with drag & drop, configure access control (RBAC), and manage kitchen food catalog
            </p>
          </div>

          {/* Sub-tab Navigation Switcher */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 w-full md:w-auto shrink-0">
            <button
              onClick={() => setActiveSubTab('nav_menu')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeSubTab === 'nav_menu'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <NavIcon className="w-4 h-4" />
              <span>Edit Main Menu ({navItems.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('food_menu')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeSubTab === 'food_menu'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Utensils className="w-4 h-4" />
              <span>Food Catalog ({foodMenu.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('custom_css')}
              className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${
                activeSubTab === 'custom_css'
                  ? 'bg-blue-700 text-white shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Paintbrush className="w-4 h-4" />
              <span>CSS Override</span>
            </button>
          </div>
        </div>
      )}

      {/* SUB-TAB 1: WORDPRESS-STYLE MAIN MENU MANAGER */}
      {activeSubTab === 'nav_menu' && (
        <NavMenuEditor
          navItems={navItems}
          onUpdateNavItems={onUpdateNavItems}
          activeRole={activeRole}
        />
      )}

      {/* SUB-TAB 2: FOOD MENU CATALOG */}
      {activeSubTab === 'food_menu' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  autoComplete="off"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder="Search food items..."
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full pl-9 p-2"
                />
              </div>

              {/* Category Dropdown */}
              <select
                value={selectedFoodCategory}
                onChange={(e) => setSelectedFoodCategory(e.target.value)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-xs rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 font-semibold"
              >
                {foodCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleOpenAddFood}
              className="w-full md:w-auto text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-bold text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food Menu Item</span>
            </button>
          </div>

          {/* Food Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredFoodItems.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleFoodDragStart(e, index)}
                onDragOver={(e) => handleFoodDragOver(e, index)}
                onDrop={(e) => handleFoodDrop(e, index)}
                className={`bg-white rounded-xl border p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between cursor-grab active:cursor-grabbing ${
                  draggedFoodIndex === index ? 'opacity-40 border-blue-400' : ''
                } ${item.available ? 'border-gray-200' : 'border-red-200 bg-red-50/20'}`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <GripVertical className="w-4 h-4 text-slate-300 hover:text-slate-600 shrink-0" />
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 border border-gray-200">
                        {item.category}
                      </span>
                    </div>

                    <button
                      onClick={() => onUpdateFoodItem(item.id, { available: !item.available })}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                        item.available
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                      }`}
                    >
                      {item.available ? 'Available' : 'Out of Stock'}
                    </button>
                  </div>

                  {/* Food Item Image Preview / Quick Upload */}
                  <div className="relative group rounded-lg overflow-hidden bg-gray-50 border border-gray-200 h-28 flex items-center justify-center">
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
                      <div className="flex flex-col items-center gap-1 text-gray-400 p-2">
                        <ImageIcon className="w-6 h-6" />
                        <span className="text-[10px] font-medium">No Image Uploaded</span>
                      </div>
                    )}

                    {/* Quick Image Upload Overlay Button */}
                    <label
                      className="absolute inset-0 bg-slate-900/60 text-white flex items-center justify-center gap-1 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-2xs"
                      title="Upload Image for this item"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Image</span>
                      <input
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
                    <h4 className="font-bold text-gray-900 text-sm">{item.name}</h4>
                    <p className="text-emerald-700 font-extrabold text-sm mt-0.5">₹{item.price.toFixed(2)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-3 text-xs">
                  <span className="text-[10px] font-mono text-gray-400">ID: {item.id}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => requirePasscode(() => handleOpenEditFood(item))}
                      className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
                      title="Edit Item"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => requirePasscode(() => onDeleteFoodItem(item.id))}
                      className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors cursor-pointer"
                      title="Delete Item"
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

      {/* SUB-TAB 3: CUSTOM CSS OVERRIDE */}
      {activeSubTab === 'custom_css' && (
        <CustomCSSOverride />
      )}

      {/* ICON PICKER MODAL */}
      {iconPickerTargetId && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="font-bold text-slate-900 text-sm">Select Navigation Icon</h3>
              <button
                onClick={() => setIconPickerTargetId(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 p-2 bg-slate-50 rounded-xl max-h-80 overflow-y-auto">
              {AVAILABLE_ICONS.map((item) => {
                const IconComp = item.icon;
                return (
                  <button
                    key={item.name}
                    onClick={() => handleSelectIcon(iconPickerTargetId, item.name)}
                    className="p-3 bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-xl flex flex-col items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-2xs"
                  >
                    <IconComp className="w-6 h-6" />
                    <span className="text-[9px] font-bold text-slate-500 truncate w-full text-center">
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
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingNavItem ? 'Edit Main Menu Item' : 'Add New Main Menu Item'}
              </h3>
              <button
                onClick={() => setIsNavModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNavItem} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Menu Title / Label</label>
                <input
                  type="text"
                  required
                  value={navForm.title}
                  onChange={(e) => setNavForm({ ...navForm, title: e.target.value })}
                  placeholder="e.g. Resident Registration"
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Target Section / Tab</label>
                  <select
                    value={navForm.tabKey}
                    onChange={(e) => setNavForm({ ...navForm, tabKey: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold focus:outline-hidden"
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="guests">Residents & Billing</option>
                    <option value="kitchen">Kitchen & Orders</option>
                    <option value="inventory">Inventory & Stock</option>
                    <option value="petty_cash">Expenses</option>
                    <option value="staff">Staff & HR</option>
                    <option value="analytics">Analytics</option>
                    <option value="audit_logs">Audit Logs</option>
                    <option value="menu_manager">Menu Manager</option>
                    <option value="telegram">Telegram Bot</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category Group</label>
                  <select
                    value={navForm.category}
                    onChange={(e) => setNavForm({ ...navForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold focus:outline-hidden"
                  >
                    {NAV_CATEGORIES.filter((c) => c !== 'All Categories').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Parent Menu Item (Hierarchy)</label>
                <select
                  value={navForm.parentId || ''}
                  onChange={(e) => setNavForm({ ...navForm, parentId: e.target.value || null })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold focus:outline-hidden"
                >
                  <option value="">Root Level (no parent)</option>
                  {navItems.filter((i) => i.id !== editingNavItem?.id).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.parentId ? `\u00A0\u00A0\u21B3 ${item.title}` : item.title}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">Nest this item under another menu item to create a hierarchy group.</p>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Icon</label>
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
                <label className="font-bold text-slate-700 block mb-1">Permitted Roles (RBAC)</label>
                <div className="flex flex-wrap gap-1.5">
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
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1 transition-all cursor-pointer ${
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
                <span className="font-bold text-slate-800">Visible in System Navigation</span>
              </label>

              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Custom Link (Optional)</p>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">External URL / Custom Link</label>
                  <input
                    type="url"
                    value={navForm.customUrl}
                    onChange={(e) => setNavForm({ ...navForm, customUrl: e.target.value })}
                    placeholder="e.g. https://example.com or /some/path"
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">If set, clicking this menu item opens this link instead of an internal tab.</p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={navForm.openInNewTab}
                    onChange={(e) => setNavForm({ ...navForm, openInNewTab: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="font-bold text-slate-700 text-xs">Open link in new browser tab</span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNavModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm cursor-pointer"
                >
                  {editingNavItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD/EDIT FOOD ITEM MODAL */}
      {isAddFoodModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingFoodItem ? 'Edit Food Menu Item' : 'Add New Food Menu Item'}
              </h3>
              <button
                onClick={() => setIsAddFoodModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFoodItem} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Item Title / Name</label>
                <input
                  type="text"
                  required
                  value={foodForm.name}
                  onChange={(e) => setFoodForm({ ...foodForm, name: e.target.value })}
                  placeholder="e.g. Paneer Butter Masala"
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Category</label>
                  <select
                    value={foodForm.category}
                    onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold focus:outline-hidden"
                  >
                    {foodCategories.filter((c) => c !== 'All').map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={foodForm.price}
                    onChange={(e) => setFoodForm({ ...foodForm, price: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Item Image Upload / URL</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs shrink-0 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>Upload Image</span>
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

                    <input
                      type="text"
                      value={foodForm.imagePath}
                      onChange={(e) => setFoodForm({ ...foodForm, imagePath: e.target.value })}
                      placeholder="Or enter image URL / asset path..."
                      className="flex-1 p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-mono text-[11px]"
                    />
                  </div>

                  {/* Image Preview Box */}
                  {foodForm.imagePath && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-50">
                      <img
                        src={foodForm.imagePath}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFoodForm({ ...foodForm, imagePath: '' })}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900 cursor-pointer"
                        title="Remove Image"
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
                <span className="font-bold text-slate-800">Item Currently Available in Kitchen</span>
              </label>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddFoodModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm cursor-pointer"
                >
                  {editingFoodItem ? 'Save Changes' : 'Create Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASSCODE VERIFICATION MODAL */}
      {passcodeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">Passcode Required</h3>
                <p className="text-slate-500 text-xs">Enter any staff passcode to proceed</p>
              </div>
            </div>

            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              maxLength={6}
              value={passcodeInput}
              onChange={e => { setPasscodeInput(e.target.value); setPasscodeError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleVerifyPasscode(); } }}
              placeholder="Enter passcode"
              className="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 text-center text-lg font-mono tracking-[0.3em] focus:border-amber-500 focus:ring-2 focus:ring-amber-200 outline-none"
            />

            {passcodeError && (
              <p className="text-red-500 text-xs font-bold text-center">{passcodeError}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setPasscodeModalOpen(false); setPendingPasscodeAction(null); setPasscodeInput(''); setPasscodeError(''); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVerifyPasscode}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs cursor-pointer transition-colors shadow-sm"
              >
                Verify & Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
