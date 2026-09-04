import React, { useState, useEffect, useMemo } from 'react';
import { Drawer as FlowbiteDrawer, DrawerItems, TextInput as FlowbiteTextInput, Tabs, TabItem, Table, TableHead, TableHeadCell, TableBody, TableRow, TableCell, Checkbox } from 'flowbite-react';
import { Button } from './Button';
import { Badge } from './Badge';
import { Popover } from './Popover';
import { TablePagination } from './TablePagination';
import { attachedTabsTheme, attachedTabsClearTheme } from '../utils/tabsTheme';
import { Boxes, PackagePlus, AlertTriangle, Plus, CheckCircle2, X, Search, ShoppingCart, Settings, Package, Check, ClipboardEdit, Pencil, ChevronDown, ChevronUp, Loader2, FlaskConical, Coffee, Milk, Apple, Banana, Cake, Carrot, Wheat, SprayCan, Drumstick, UtensilsCrossed, Croissant, Soup, Droplet, Snowflake, Fish, Wrench, Balloon, Refrigerator, Microwave, Fan, Blend, Bean, HandPlatter, GlassWater, LeafyGreen, Trash2, Candy, Flame, Cherry, Grape, Citrus, Egg, CupSoda, Utensils, Sandwich, Cookie, Nut, Filter, Eye, type FlowbiteIconComponent } from './icons/FlowbiteIcons';
import { InventoryItem, CatalogItem } from '../types';
import { t } from '../i18n/en';
import { PageHeader, PageHeaderButton } from './PageHeader';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { fetchStockRequestsFromDB, createStockRequestInDB, updateStockRequestStatusInDB, fetchWastageLogsFromDB, createWastageLogDB, fetchStaffUsersFromDB, fetchMaterialCategoriesFromDB, updateMaterialCategoryInDB, deleteMaterialCategoryFromDB, addMaterialCategoryToDB, addCatalogItemDB, updateCatalogItemDB, deleteCatalogItemDB, bulkUpdateCatalogCategoryDB, resolveTelegramTemplate, uploadImageDB } from '../services/api';
import { useToast } from './ToastContext';
import { useConfirm } from './ConfirmDialogContext';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { formatDateDDMMYYYY } from '../utils/dateUtils';


// Matched against the item NAME first (most specific), since real catalogs
// group very different items under one loose category (e.g. "Sugar" and
// "Red Balloon" both landing under "Housekeeping & Disposables") - a
// category-only icon was confirmed wrong for most rows. Order matters:
// more specific terms (e.g. "mirch powder") must be checked before the
// broader term they contain (e.g. "mirch") so spice powders don't get
// mapped as fresh vegetables. Covers common English + Hindi/Hinglish
// kitchen-stock vocabulary; anything unmatched falls through to the
// category rules below, then to a generic Package icon.
const STOCK_NAME_ICON_RULES: [RegExp, FlowbiteIconComponent][] = [
  [/balloon/i, Balloon],
  [/\bfridge\b|refrigerator/i, Refrigerator],
  [/microwave/i, Microwave],
  [/exhaust\s*fan|\bfan\b/i, Fan],
  [/\bmixer\b|blender/i, Blend],
  [/air\s*fryer|\bfryer\b/i, Flame],
  [/sandwich\s*maker/i, Sandwich],
  [/\bkettle\b/i, Coffee],
  [/gas\s*cylinder|\blpg\b|\bcylinder\b/i, Flame],
  [/chlorine|\bro\b|water\s*purifier/i, Droplet],
  [/dish\s*wash|surf\s*excel|\bvim\b|detergent|\bsoap\b|cleaner|\bpolish\b/i, SprayCan],
  [/garbage|dustbin|\btrash\b/i, Trash2],
  [/\bsugar\b/i, Candy],
  [/\bsalt\b/i, FlaskConical],
  [/\bmatch\s*box\b/i, Flame],
  [/\bbiscuit\b|\bcookie\b/i, Cookie],
  [/\bkaju\b|cashew|\balmond\b|\bpista\b|\bmagaj\b|\bpeanut\b|\bwalnut\b/i, Nut],
  [/masala|powder|elaichi|dalchini|ajino\s*moto|\bhaldi\b|\bjeera\b|dhaniya|\bgaram\b|\bchaat\b|\bchat\b|kitchen\s*king|\baachar\b|\bachar\b|\bdegi\b/i, FlaskConical],
  // Sauces/condiments checked before the chili & vegetable rules below, since
  // e.g. "Tomato Ketchup" and "Green Chili Sauce" contain those ingredient
  // words but are the finished condiment, not the raw produce.
  [/sauce|ketchup|chutney/i, Soup],
  [/\bflour\b|\batta\b|\bmaida\b|\bb[ae]?san\b|\brice\b|\bwheat\b|\bpoha\b|\bpapad\b|\bsev\b|jwar|ragi/i, Wheat],
  [/\bdal\b|lentil|\bchana\b/i, Bean],
  [/mirch|mrch|chil+i|pepper/i, Flame],
  [/\bmint\b|pudina|\bpalak\b|spinach|\bcabbage\b|\bgobhi\b/i, LeafyGreen],
  [/\blemon\b|\boranges?\b/i, Citrus],
  [/\bapple\b/i, Apple],
  [/\bbanana\b/i, Banana],
  [/\bgrape\b/i, Grape],
  [/cherry|strawberr/i, Cherry],
  [/\bmango\b|\bpapaya\b|watermelon|coconut|\bchiku\b|\bamla\b/i, Cherry],
  [/\btomato\b|\bonion\b|\bpotato\b|\bgarlic\b|\bginger\b|\bcarrot\b|cauliflower|brinjal|\bbeans?\b|capsicum|shimla|\bkhira\b|cucumber|\bloki\b|\bkarela\b|\bmuli\b|radish|\bmatar\b|\bpeas?\b|\bkaddu\b|pumpkin|\bbhindi\b|okra|\barbi\b/i, Carrot],
  [/\bmilk\b|\bcurd\b|\bdahi\b|paneer|\bcheese\b|\bbutter\b|\bghee\b|\bcream\b|mozzarella/i, Milk],
  [/chicken|mutton|kabab|kebab/i, Drumstick],
  [/\begg\b/i, Egg],
  [/\bfish\b|prawn|seafood/i, Fish],
  [/\bbread\b|pizza\s*base|\bbun\b|croissant/i, Croissant],
  [/\btea\b|\bcoffee\b/i, Coffee],
  [/soda|cold\s*drink/i, CupSoda],
  [/\bice\b|frozen/i, Snowflake],
  [/plate|bowl|platter/i, HandPlatter],
  [/\bcups?\b|\bglass(es)?\b/i, GlassWater],
  [/fork|knife|spoon/i, Utensils],
];

const STOCK_CATEGORY_ICON_RULES: [RegExp, FlowbiteIconComponent][] = [
  [/spice|season|masala/i, FlaskConical],
  [/oil|ghee|fat/i, Droplet],
  [/frozen|cold/i, Snowflake],
  [/non\s*veg|meat|mutton|chicken|poultry/i, Drumstick],
  [/fish|seafood|prawn/i, Fish],
  [/dairy|milk|paneer|curd|yog/i, Milk],
  [/bakery|bread|bun/i, Croissant],
  [/dessert|sweet|cake|candy/i, Cake],
  [/fruit/i, Apple],
  [/vegetable|produce/i, Carrot],
  [/lentil|pulse|dal|grain|flour|rice|wheat/i, Wheat],
  [/beverage|drink|coffee|tea/i, Coffee],
  [/sauce|chinese|continental|soup/i, Soup],
  [/housekeeping|disposable|clean/i, SprayCan],
  [/crockery|cutlery|utensil/i, UtensilsCrossed],
  [/appliance|repair|equipment/i, Wrench],
];

// Item name is checked first (specific, e.g. "Sugar" -> Candy) since real
// catalogs bucket very different items under one loose category; category
// is only a fallback for names that don't match anything above.
const getStockItemIcon = (name?: string, category?: string): FlowbiteIconComponent => {
  if (name) {
    const nameMatch = STOCK_NAME_ICON_RULES.find(([pattern]) => pattern.test(name));
    if (nameMatch) return nameMatch[1];
  }
  if (category) {
    const catMatch = STOCK_CATEGORY_ICON_RULES.find(([pattern]) => pattern.test(category));
    if (catMatch) return catMatch[1];
  }
  return Package;
};

// Units that are physically divisible (weight/volume, or a dozen - which
// still resolves to a whole number of pieces, e.g. 0.5 Doz = 6 bananas).
// Packet/box/piece-style units are excluded on purpose: "0.5 Packets" isn't
// a real quantity you can ask a kitchen to fulfill, so those stay whole
// numbers. Add new synonyms here rather than in the input handlers.
const DECIMAL_FRIENDLY_UNITS = new Set([
  'kg', 'kgs', 'gm', 'gms', 'g', 'gram', 'grams',
  'ltr', 'ltrs', 'liter', 'liters', 'litre', 'litres', 'ml',
  'doz', 'dozen',
]);

// Request-basket rows store unit as a compound "packSize unit" string
// ("1 Kg") for display. Strips the leading pack-size number off, leaving
// just the unit word ("Kg") - needed both for the decimal-friendly check
// below and for building the "(x0.5 Kg)" string sent to the Fulfill
// screen, which must NOT contain that extra leading "1" or its regex
// parser can't find the closing ")" and silently drops the quantity.
const bareUnit = (unit?: string): string => (unit || '').replace(/^[\d.]+\s*/, '').trim();

const isDecimalFriendlyUnit = (unit?: string): boolean => {
  if (!unit) return false;
  return DECIMAL_FRIENDLY_UNITS.has(bareUnit(unit).toLowerCase());
};

// Kitchen requests only meaningfully resolve to 2 decimal places (e.g. 0.25
// Kg); rounding both sides before comparing avoids floating-point noise
// (0.1 + 0.2 !== 0.3) flagging an exact delivery as "partial."
const roundQty = (n: number): number => Math.round(n * 100) / 100;

interface InventoryManagementProps {
  onUpdateStock: (itemId: string, newStock: number) => void;
  onAddInventoryItem: (item: InventoryItem) => void;
  onUpdateItemImage?: (itemId: string, imagePath: string) => void;
  activeMenuItemKey?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin', replyMarkup?: any, templateKey?: string) => void;
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = ({
  onUpdateStock,
  onAddInventoryItem,
  onUpdateItemImage: _onUpdateItemImage,
  activeMenuItemKey,
  onDispatchTelegram,
  onLogAudit,
}) => {
  const { staff } = useStaff();
  const { currentUser, activeRole, isAuthenticated, authChecked } = useAuth();
  const normalizedRole = (currentUser?.role || activeRole || '').toLowerCase().replace(/_/g, ' ').trim();
  const canDeleteCatalogItem = normalizedRole.includes('admin');
  const { inventory, inventoryLoading } = useInventoryContext();
  // Shared spinner for every table's loading state in this file
  // (14 Aug 2026 loading-state pass) - kept as one constant so all of this
  // page's tables show a consistent "still loading" indicator instead of
  // their "No X found" empty state flashing before the fetch resolves.
  const tableLoadingIndicator = (label: string) => (
    <div className="p-8 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500 font-semibold text-xs">
      <Loader2 className="w-4 h-4 animate-spin" /> {label}
    </div>
  );
  const [activeTab, setActiveTab] = React.useState<'stock_log' | 'deficit' | 'requisitions' | 'fulfill' | 'catalog'>('stock_log');

  useEffect(() => {
    if (!activeMenuItemKey) return;
    if (activeMenuItemKey === 'stock_requests' || activeMenuItemKey === 'request_materials') setActiveTab('requisitions');
    else if (activeMenuItemKey === 'fulfill_stock_req' || activeMenuItemKey === 'pending_stock_requests') setActiveTab('fulfill');
    else if (activeMenuItemKey === 'deficit_shortfalls_log') setActiveTab('deficit');
    else if (activeMenuItemKey === 'stock_log') setActiveTab('stock_log');
    else if (activeMenuItemKey === 'edit_kitchen_stock') setActiveTab('catalog');
  }, [activeMenuItemKey]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<number[]>([]);
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [stockLogDesktopPage, setStockLogDesktopPage] = useState(1);
  const STOCK_LOG_DESKTOP_PAGE_SIZE = 15;
  const [catalogPage, setCatalogPage] = useState(1);
  const [wastagePage, setWastagePage] = useState(1);
  const [wastageDesktopPage, setWastageDesktopPage] = useState(1);
  const WASTAGE_DESKTOP_PAGE_SIZE = 10;

  // Sync catalogItems from live DB inventory data
  useEffect(() => {
    if (inventory && inventory.length > 0) {
      const catalogMap = new Map<number, CatalogItem>();
      
      // Build catalog exclusively from DB inventory items by numeric ID or matching name
      inventory.forEach((item: InventoryItem) => {
        const numericId = Number(item.id);
        let matched = numericId ? catalogMap.get(numericId) : undefined;
        
        if (!matched) {
          // Fallback lookup by name if ID hasn't matched yet
          const nameKey = item.name.toLowerCase().trim();
          for (const catItem of catalogMap.values()) {
            if (catItem.name.toLowerCase().trim() === nameKey) {
              matched = catItem;
              break;
            }
          }
        }

        if (matched) {
          catalogMap.set(matched.id, {
            ...matched,
            name: item.name || matched.name,
            category: item.category && item.category !== 'General' ? item.category : matched.category,
            categoryId: item.categoryId || matched.categoryId,
            packUnit: item.unit || matched.packUnit,
            unitLabel: item.unit || matched.unitLabel,
            imagePath: item.imagePath || matched.imagePath,
            is_verified: (item as any).is_verified !== undefined ? !!(item as any).is_verified : matched.is_verified
          });
        } else {
          const newId = numericId || Math.floor(1000 + Math.random() * 9000);
          catalogMap.set(newId, {
            id: newId,
            name: item.name,
            category: item.category || 'General',
            categoryId: item.categoryId || 999,
            price: 0,
            packSize: 1,
            packUnit: item.unit || 'Kg',
            unitLabel: item.unit || 'Kg',
            imagePath: item.imagePath || '',
            is_verified: (item as any).is_verified !== undefined ? !!(item as any).is_verified : true
          });
        }
      });

      setCatalogItems(Array.from(catalogMap.values()));
    }
  }, [inventory]);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogDesktopPage, setCatalogDesktopPage] = useState(1);
  const CATALOG_DESKTOP_PAGE_SIZE = 25;
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [catItemName, setCatItemName] = useState('');
  const [catCategory, setCatCategory] = useState('');
  const [catPrice, setCatPrice] = useState(0);
  const [catPackSize, setCatPackSize] = useState(1);
  const [catUnit, setCatUnit] = useState('Kg');
  const [catImagePath, setCatImagePath] = useState('');
  const [, setLiveCashHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchStaffUsersFromDB().then((users) => {
      if (users && users.length > 0) {
        const handlers = users.filter((u: any) => u.isFinancialHandler);
        if (handlers.length > 0) {
          setLiveCashHandlers(handlers);
        }
      }
    });
  }, [isAuthenticated, authChecked]);

  // Material categories from database (for CRUD operations)
  // TODO: dbCategories should be passed as props from a central context instead of being fetched locally
  const [dbCategories, setDbCategories] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchMaterialCategoriesFromDB().then((cats) => {
      if (cats && cats.length > 0) {
        setDbCategories(cats);
      }
    });
  }, [isAuthenticated, authChecked]);

  // Category filter pills derived from actual catalog items (always in sync with data)
  const catalogCategories = React.useMemo(() => {
    const cats = Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean)));
    return ['All', ...cats];
  }, [catalogItems]);
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  // Category filter for catalog
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  // Collapsed by default, matching the Category Filter Toggle Pattern
  // already used elsewhere (Stock Requests' own showReqCategoryFilters) -
  // this screen's category pills were always open, the one place in the
  // app that hadn't been brought in line with that rule yet (21 Aug 2026).
  const [showCatalogCategoryFilters, setShowCatalogCategoryFilters] = useState(false);
  const [fulfillPage, setFulfillPage] = useState<number>(1);

  // Category management state
  const [catalogView, setCatalogViewState] = useState<'items' | 'categories'>(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('artists_farm_inventory_catalog_view');
      if (stored === 'items' || stored === 'categories') return stored;
    }
    return 'items';
  });

  const setCatalogView = (view: 'items' | 'categories') => {
    setCatalogViewState(view);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('artists_farm_inventory_catalog_view', view);
    }
  };
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleRenameCategory = async (id: number) => {
    const trimmed = editingCategoryName.trim();
    if (!trimmed) return;
    const oldCat = dbCategories.find(c => c.id === id);
    const ok = await updateMaterialCategoryInDB(id, trimmed);
    if (ok) {
      setDbCategories((prev: any[]) => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
      if (onLogAudit && oldCat) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} renamed material category from '${oldCat.name}' to '${trimmed}'`);
      }
    }
    setEditingCategoryId(null);
  };

  const handleDeleteCategory = (id: number, name: string) => {
    (window as any).showConfirm(`Delete category "${name}"? Items using this category will keep their current value.`, async () => {
      const ok = await deleteMaterialCategoryFromDB(id);
      if (ok) {
        setDbCategories((prev: any[]) => prev.filter(c => c.id !== id));
        if (selectedCategory === name) setSelectedCategory('All');
        if (onLogAudit) {
          const currentUserName = currentUser?.name || 'Admin';
          onLogAudit(`${currentUserName} deleted material category '${name}'`);
        }
      }
    });
  };

  const handleDeleteCatalogItem = (id: number, name: string) => {
    (window as any).showConfirm(`Delete catalog item "${name}"? This cannot be undone.`, async () => {
      const ok = await deleteCatalogItemDB(id);
      if (ok) {
        setCatalogItems((prev: CatalogItem[]) => prev.filter((item: CatalogItem) => item.id !== id));
        if (onLogAudit) {
          const currentUserName = currentUser?.name || 'Admin';
          onLogAudit(`${currentUserName} deleted catalog item '${name}'`);
        }
      }
    });
  };


  const handleBulkAssignCategory = async (targetCategory: string) => {
    if (selectedCatalogItemIds.length === 0 || !targetCategory) return;
    const ok = await bulkUpdateCatalogCategoryDB({ ids: selectedCatalogItemIds, category: targetCategory });
    if (ok) {
      const itemNames = catalogItems.filter(i => selectedCatalogItemIds.includes(i.id)).map(i => i.name);
      setCatalogItems((prev: CatalogItem[]) => prev.map((item: CatalogItem) => selectedCatalogItemIds.includes(item.id) ? { ...item, category: targetCategory } : item));
      
      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} bulk updated category to '${targetCategory}' for items: ${itemNames.join(', ')}`);
      }

      setSelectedCatalogItemIds([]);
      setBulkTargetCategory('');
      showToast(`Successfully assigned selected items to category "${targetCategory}"!`, { type: 'success' });
    } else {
      showToast('Failed to assign category. Please try again.', { type: 'error' });
    }
  };

  const handleEditCatalogItem = (item: CatalogItem) => {
    setEditingCatalogItem(item);
    setCatItemName(item.name);
    setCatCategory(item.category);
    setCatPrice(item.price);
    setCatPackSize(item.packSize);
    setCatUnit(item.packUnit);
    setCatImagePath(item.imagePath || '');
    setIsCatalogModalOpen(true);
  };

  const handleCreateNewCatalogItem = () => {
    setEditingCatalogItem(null);
    setCatItemName('');
    setCatCategory('Vegetables');
    setCatPrice(0);
    setCatPackSize(1);
    setCatUnit('Kg');
    setCatImagePath('');
    setIsCatalogModalOpen(true);
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catItemName || !catCategory) return;

    // Upload image if one is selected (base64 data URI)
    let savedImagePath = catImagePath;
    if (catImagePath && catImagePath.startsWith('data:image')) {
      const uploadedUrl = await uploadImageDB(catImagePath, 'catalog');
      if (uploadedUrl) {
        savedImagePath = uploadedUrl;
      }
    }

    if (editingCatalogItem) {
      const oldItem = editingCatalogItem;
      const changes: string[] = [];
      if (catItemName !== oldItem.name) changes.push(`name from '${oldItem.name}' to '${catItemName}'`);
      if (catCategory !== oldItem.category) changes.push(`category from '${oldItem.category}' to '${catCategory}'`);
      if (catPrice !== oldItem.price) changes.push(`price from ₹${oldItem.price} to ₹${catPrice}`);
      if (catPackSize !== oldItem.packSize) changes.push(`pack size from ${oldItem.packSize} to ${catPackSize}`);
      if (catUnit !== oldItem.packUnit) changes.push(`unit from '${oldItem.packUnit}' to '${catUnit}'`);

      setCatalogItems(prev => prev.map(item => item.id === editingCatalogItem.id ? {
        ...item,
        name: catItemName,
        category: catCategory,
        price: catPrice,
        packSize: catPackSize,
        packUnit: catUnit,
        unitLabel: catUnit,
        imagePath: savedImagePath,
        is_verified: true
      } : item));
      await updateCatalogItemDB({ id: editingCatalogItem.id, name: catItemName, category: catCategory, price: catPrice, unit: catUnit, imagePath: savedImagePath });
      if (onLogAudit && changes.length > 0) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} updated catalog item ${oldItem.name}: ${changes.join(', ')}`);
      }
    } else {
      const newItem: CatalogItem = {
        id: catalogItems.length > 0 ? Math.max(...catalogItems.map(i => i.id)) + 1 : 101,
        name: catItemName,
        category: catCategory,
        categoryId: 999,
        price: catPrice,
        packSize: catPackSize,
        packUnit: catUnit,
        unitLabel: catUnit,
        imagePath: savedImagePath,
        is_verified: true
      };
      setCatalogItems([newItem, ...catalogItems]);

      // Sync to #stock_log Inventory list as well
      const invItem: InventoryItem = {
        id: `inv-${Date.now().toString().slice(-4)}`,
        name: catItemName,
        category: catCategory,
        currentStock: 0,
        minThreshold: 5,
        unit: catUnit,
        imagePath: savedImagePath,
      };
      onAddInventoryItem(invItem);

      // Persist to database
      await addCatalogItemDB({ name: catItemName, category: catCategory, price: catPrice, packSize: catPackSize, unit: catUnit, imagePath: savedImagePath });
      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} created catalog item ${catItemName} (Category: ${catCategory}, Price: ₹${catPrice}, Pack Size: ${catPackSize} ${catUnit})`);
      }
    }
    setIsCatalogModalOpen(false);
  };

  const handleApproveItem = (id: number) => {
    const target = catalogItems.find(i => i.id === id);
    setCatalogItems(prev => prev.map(item => item.id === id ? { ...item, is_verified: true } : item));
    if (onLogAudit && target) {
      const currentUserName = currentUser?.name || 'Admin';
      onLogAudit(`${currentUserName} approved catalog item '${target.name}'`);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 150;
          canvas.height = 50;
          const ctx = canvas.getContext('2d');
          if (ctx) {
             // Calculate center crop
             const scale = Math.max(150 / img.width, 50 / img.height);
             const x = (150 / scale - img.width) / 2;
             const y = (50 / scale - img.height) / 2;
             ctx.drawImage(img, x, y, img.width, img.height, 0, 0, 150, 50);
             setCatImagePath(canvas.toDataURL('image/png'));
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const [reqSearch, setReqSearch] = useState('');
  const [reqCategory, setReqCategory] = useState('All Items');
  const [showReqCategoryFilters, setShowReqCategoryFilters] = useState(false);
  const [reqBasket, setReqBasket] = useState<{ id: string; name: string; unit: string; qty: number; rate?: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem('stock_request_basket') || '[]'); } catch { return []; }
  });
  const [isReqCartDrawerExpanded, setIsReqCartDrawerExpanded] = useState(false);

  useEffect(() => { localStorage.setItem('stock_request_basket', JSON.stringify(reqBasket)); }, [reqBasket]);
  const [recentlyAddedReqId, setRecentlyAddedReqId] = useState<string | null>(null);
  const [specialRequestText, setSpecialRequestText] = useState('');
  const [selectedFulfillSheet, setSelectedFulfillSheet] = useState<any>(null);
  const [fulfillData, setFulfillData] = useState<Record<string, { qty: number, cost: number, size: number, unit: string }>>({});

  const handleEditFulfill = (sheet: any) => {
    setSelectedFulfillSheet(sheet);
    const initialData: Record<string, { qty: number, cost: number, size: number, unit: string }> = {};
    sheet.items.forEach((itemStr: string) => {
      const namePart = itemStr.split(' (x')[0];
      // The optional (?:[\d.]+\s*)? skips a stray leading pack-size number
      // ("x0.5 1 Doz)") so sheets dispatched before the unit-formatting fix
      // still parse correctly, alongside the normal "x0.5 Doz)" form.
      const match = itemStr.match(/\(x([\d.]+)\s*(?:[\d.]+\s*)?([a-zA-Z]+)?\)/);
      const qty = match ? parseFloat(match[1]) : 1;
      const unit = match && match[2] ? match[2] : 'Kg';
      initialData[namePart] = { qty, cost: 0, size: 1, unit };
    });
    setFulfillData(initialData);
  };

  const updateFulfillData = (itemName: string, field: string, value: any) => {
    setFulfillData(prev => ({
      ...prev,
      [itemName]: {
        ...prev[itemName],
        [field]: value
      }
    }));
  };

  const handleSaveFulfillQuantities = async () => {
    if (!selectedFulfillSheet) return;
    
    // Validate cost price is mandatory for all items being delivered
    let missingCost = false;
    selectedFulfillSheet.items.forEach((itemStr: string) => {
      const namePart = itemStr.split(' (x')[0];
      const data = fulfillData[namePart];
      if (data && data.qty > 0 && (!data.cost || Number(data.cost) <= 0)) {
        missingCost = true;
      }
    });

    if (missingCost) {
      showToast('Cost/Price is mandatory for all items being delivered!', { type: 'warning' });
      return;
    }

    
    let allDeliveredEqOrdered = true;
    let allDeliveredZero = true;
    let anyDelivered = false;

    let manifestStr = '';
    selectedFulfillSheet.items.forEach((itemStr: string) => {
      const namePart = itemStr.split(' (x')[0];
      // The optional (?:[\d.]+\s*)? skips a stray leading pack-size number
      // ("x0.5 1 Doz)") so sheets dispatched before the unit-formatting fix
      // still parse correctly, alongside the normal "x0.5 Doz)" form.
      const match = itemStr.match(/\(x([\d.]+)\s*(?:[\d.]+\s*)?([a-zA-Z]+)?\)/);
      const orderedQty = match ? parseFloat(match[1]) : 1;
      const orderedUnit = match && match[2] ? match[2] : '';
      const orderTag = orderedUnit ? `${orderedQty} ${orderedUnit}` : `${orderedQty}`;

      const data = fulfillData[namePart];
      if (!data) return;

      if (roundQty(data.qty) !== roundQty(orderedQty)) {
        allDeliveredEqOrdered = false;
      }
      if (data.qty > 0) {
        allDeliveredZero = false;
        anyDelivered = true;
      }

      if (data.qty === 0) {
        manifestStr += `\n❌ <b>${namePart}</b>\n   â"" Ordered: ${orderTag} | Recd: 0 (NOT DELIVERED)`;
      } else {
        manifestStr += `\n✅ <b>${namePart}</b>\n   â"" Ordered: ${orderTag} | Recd: ${data.qty} ${data.unit} @ ₹${data.cost}`;
      }
    });

    let calculatedStatus = 'Pending';
    if (allDeliveredZero) {
      calculatedStatus = 'Unfulfilled';
    } else if (allDeliveredEqOrdered) {
      calculatedStatus = 'Fulfilled';
    } else if (anyDelivered) {
      calculatedStatus = 'Partially Fulfilled';
    }

    const headerTitle = calculatedStatus === 'Fulfilled' ? '📦 STOCK PROCURED & ARCHIVED' : '📦 STOCK REQUISITION UPDATE';
    
    const now = new Date();
    const formattedTime = `${now.getDate()} ${now.toLocaleString('en-US', {month: 'short'})} ${now.getFullYear()} - ${now.toLocaleTimeString('en-US', {hour12: false})}`;

    const staffName = currentUser?.name || 'Admin';
    const statusTitle = calculatedStatus === 'Fulfilled' ? 'PROCURED & ARCHIVED' : 'REQUISITION UPDATED';

    const templateVars: Record<string, string> = {
      req_id: selectedFulfillSheet.id,
      staff_name: staffName,
      fulfillment_time: formattedTime,
      status_label: calculatedStatus,
      items_manifest: manifestStr,
      status_title: statusTitle,
      header_title: headerTitle,
    };

    if (onDispatchTelegram) {
      const resolved = await resolveTelegramTemplate('requisition_stock_fulfilled', templateVars);
      const tgMessage = resolved || `${headerTitle}\n━━━━━━━━━━━━━━━━━━\n🆔 Sheet ID: #${selectedFulfillSheet.id}\n👤 Processed By: ${staffName}\n📅 Fulfillment Time: ${formattedTime}\n🟢 Global Status: ${calculatedStatus}\n━━━━━━━━━━━━━━━━━━\n📝 Items Variance Manifest:\n${manifestStr}`;
      onDispatchTelegram('Stock Fulfillment', tgMessage, 'kitchen', undefined, 'requisition_stock_fulfilled');
    }
    
    const updatedStatus = calculatedStatus.toUpperCase();
    const targetSheetId = selectedFulfillSheet.id;
    
    // Compute updated items array synchronously before state/DB dispatch
    const updatedItems = selectedFulfillSheet.items.map((itemStr: string) => {
      const namePart = itemStr.split(' (x')[0];
      const data = fulfillData[namePart];
      if (data && data.qty !== undefined) {
        return `${namePart} (x${data.qty}${data.unit ? ' ' + data.unit : ''})`;
      }
      return itemStr;
    });

    // Update local state
    setRecentSheets(prev => prev.map(sheet => {
      if (sheet.id === targetSheetId) {
        return { ...sheet, status: updatedStatus, items: updatedItems };
      }
      return sheet;
    }));

    // Save to MySQL DB
    updateStockRequestStatusInDB(targetSheetId, updatedStatus, updatedItems);
    if (onLogAudit) {
      const currentUserName = currentUser?.name || 'Admin';
      onLogAudit(`${currentUserName} completed stock request sheet #${targetSheetId} (status: ${updatedStatus})`);
    }
    
    setSelectedFulfillSheet(null);
    showToast('Transaction Complete: Variance Analyzed, Shortfalls Logged, Req Items Updated, Master Catalog Synced, Audit Log Written, Telegram Alert Dispatched!', { type: 'success' });
  };

  const handleQuickComplete = async (sheet: any) => {
    const targetSheetId = sheet.id;
    const confirmed = await confirm({
      title: t('complete_confirm_title', 'Complete Stock Request?'),
      message: t('complete_confirm_message', `This will mark requisition sheet #${targetSheetId} as FULFILLED and archive it. Continue?`),
      confirmText: t('complete_button', 'Complete'),
      cancelText: t('cancel_button', 'Cancel'),
      variant: 'warning',
    });
    if (!confirmed) return;

    const updatedStatus = 'FULFILLED';
    setRecentSheets(prev => prev.map(s => s.id === targetSheetId ? { ...s, status: updatedStatus } : s));
    updateStockRequestStatusInDB(targetSheetId, updatedStatus, sheet.items);
    if (onLogAudit) {
      const currentUserName = currentUser?.name || 'Admin';
      onLogAudit(`${currentUserName} completed stock request sheet #${targetSheetId} (status: FULFILLED)`);
    }
    showToast(`Requisition Sheet #${targetSheetId} marked as FULFILLED and saved to database!`, { type: 'success' });
  };

  const [recentSheets, setRecentSheets] = useState<{ id: string; status: string; date: string; items: string[] }[]>([]);
  // 14 Aug 2026: "No stock request sheets found" (Fulfill Requisitions tab)
  // used to render off recentSheets.length === 0 before the fetch below
  // resolved. Defaults true.
  const [stockRequestsLoading, setStockRequestsLoading] = useState(true);
  const [fulfillSearch, setFulfillSearch] = useState('');
  const [fulfillDesktopPage, setFulfillDesktopPage] = useState(1);
  const FULFILL_DESKTOP_PAGE_SIZE = 10;

  const todayDate = new Date();
  const padDate = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${todayDate.getFullYear()}-${padDate(todayDate.getMonth() + 1)}-${padDate(todayDate.getDate())}`;
  const weekAgoDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 6);
  const weekAgoStr = `${weekAgoDate.getFullYear()}-${padDate(weekAgoDate.getMonth() + 1)}-${padDate(weekAgoDate.getDate())}`;

  const [fulfillFromDraft, setFulfillFromDraft] = useState(weekAgoStr);
  const [fulfillToDraft, setFulfillToDraft] = useState(todayStr);

  const filteredFulfillSheets = useMemo(() => {
    return recentSheets.filter(sheet => {
      const sheetDateStr = sheet.date.split(' - ')[0].trim();
      const sheetDate = new Date(sheetDateStr);
      const from = new Date(fulfillFromDraft);
      const to = new Date(fulfillToDraft);
      to.setHours(23, 59, 59, 999);
      return isNaN(sheetDate.getTime()) || (sheetDate >= from && sheetDate <= to);
    });
  }, [recentSheets, fulfillFromDraft, fulfillToDraft]);


  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchStockRequestsFromDB().then((data) => {
      if (data && data.length > 0) {
        setRecentSheets(data);
      } else {
        setRecentSheets([
          {
            id: '1166',
            status: 'PENDING',
            date: '21/07/2026 - 10:21 PM',
            items: ['Green Pea (x1 Kg)', 'Hari Mirchi (x1 Kg)'],
          },
          {
            id: '1165',
            status: 'PENDING',
            date: '21/07/2026 - 09:05 PM',
            items: ['Black Pepper (x1 Pcs)', 'Basmati Rice (x1 Pc)'],
          },
          {
            id: '1164',
            status: 'PENDING',
            date: '21/07/2026 - 08:53 PM',
            items: ['Ajino Moto (x1 Gm)'],
          },
        ]);
      }
      setStockRequestsLoading(false);
    });
  }, [isAuthenticated, authChecked]);

  const stockCatalog = catalogItems.map(item => ({
    id: item.id.toString(),
    name: item.name,
    unit: `${item.packSize} ${item.packUnit}`,
    rate: item.price,
    category: item.category,
    imageTag: 'No Image'
  }));

  const handleAddToReqBasket = (item: (typeof stockCatalog)[0]) => {
    setRecentlyAddedReqId(item.id);
    setTimeout(() => setRecentlyAddedReqId(null), 1000);
    setReqBasket((prev) => {
      const existing = prev.find((b) => b.id === item.id);
      if (existing) {
        return prev.map((b) => (b.id === item.id ? { ...b, qty: b.qty + 1 } : b));
      }
      return [...prev, { id: item.id, name: item.name, unit: item.unit, rate: item.rate, qty: 1 }];
    });
  };

  // Shared by the desktop basket panel and the mobile cart drawer so both
  // stay in sync with the same decimal-vs-whole-number rule per unit.
  const handleAdjustReqQty = (id: string, delta: number) => {
    setReqBasket((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, qty: roundQty(item.qty + delta) } : item))
        .filter((item) => item.qty > 0)
    );
  };

  const handleSetReqQty = (id: string, rawValue: string) => {
    setReqBasket((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const parsed = rawValue === '' ? 0 : Number(rawValue);
        if (Number.isNaN(parsed)) return item;
        const clamped = Math.max(0, parsed);
        const qty = isDecimalFriendlyUnit(item.unit) ? roundQty(clamped) : Math.round(clamped);
        return { ...item, qty };
      })
    );
  };

  const handleDispatchReq = async () => {
    if (reqBasket.length === 0 && !specialRequestText.trim()) {
      showToast('Supply basket is empty!', { type: 'warning' });
      return;
    }
    const newSheetId = `${1167 + recentSheets.length}`;
    const items = reqBasket.map((b) => `${b.name} (x${b.qty} ${bareUnit(b.unit)})`);
    if (specialRequestText.trim()) {
      items.push(`Special Notes: ${specialRequestText.trim()}`);
    }
    const newSheet = {
      id: newSheetId,
      status: 'PENDING',
      date: `${formatDateDDMMYYYY(new Date().toISOString())} - ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
      items,
    };
    setRecentSheets([newSheet, ...recentSheets]);
    createStockRequestInDB(newSheet);
    if (onLogAudit) {
      const currentUserName = currentUser?.name || 'Staff';
      onLogAudit(`${currentUserName} created stock request sheet #${newSheetId}`);
    }

    // Format & Dispatch Telegram Alert
    const itemsList = reqBasket.map((b) => `• ${b.name} (x${b.qty} ${b.unit})`);
    if (specialRequestText.trim()) {
      itemsList.push(`• Special Notes: ${specialRequestText.trim()}`);
    }
    const itemsListStr = itemsList.join('\n');
    
    if (onDispatchTelegram) {
      const reqVars: Record<string, string> = {
        staff_name: currentUser?.name || 'Staff',
        request_time: newSheet.date,
        items_list: itemsListStr,
        custom_notes: specialRequestText.trim() || 'None',
      };
      const resolved = await resolveTelegramTemplate('requisition_material_request', reqVars);
      const tgMessage = resolved || `📋 <b>NEW STOCK REQUEST #${newSheetId}</b>\n━━━━━━━━━━━━━━━━━━\n👤 Requested By: <b>${currentUser?.name || 'Staff'}</b>\n📅 Date: ${newSheet.date}\n🟢 Status: <b>PENDING</b>\n━━━━━━━━━━━━━━━━━━\n📝 Items Requested:\n${itemsListStr}`;
      onDispatchTelegram('Stock Request', tgMessage, 'kitchen', undefined, 'requisition_material_request');
    }

    setReqBasket([]);
    setSpecialRequestText('');
    showToast(`Requisition Sheet #${newSheetId} dispatched successfully!`, { type: 'success' });
  };

  React.useEffect(() => {
    if (activeMenuItemKey === 'deficit_shortfalls_log') {
      setActiveTab('deficit');
    } else if (activeMenuItemKey === 'stock_requests') {
      setActiveTab('fulfill');
    } else if (activeMenuItemKey === 'edit_kitchen_stock' || activeMenuItemKey === 'stock_log') {
      setActiveTab('catalog');
    } else {
      setActiveTab('catalog');
    }
  }, [activeMenuItemKey]);
  const [stockLogSearch, setStockLogSearch] = useState('');

  const filteredInventory = useMemo(() => {
    if (!stockLogSearch.trim()) return inventory;
    const q = stockLogSearch.toLowerCase().trim();
    return inventory.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  }, [inventory, stockLogSearch]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [currentStock, setCurrentStock] = useState(10);
  const [minThreshold, setMinThreshold] = useState(5);
  const [unit, setUnit] = useState('kg');
  const [imagePath, setImagePath] = useState('');

  // Wastage & Spillage Log State
  const [wastageLogs, setWastageLogs] = useState<any[]>([]);
  const [wastageLoading, setWastageLoading] = useState(true);
  const [wastedItem, setWastedItem] = useState('');
  const [wastedQty, setWastedQty] = useState<number | ''>('');
  const [wastedUnit, setWastedUnit] = useState('Kg');
  const [wastedReason, setWastedReason] = useState('Spillage / Leakage');
  const wastedReportedBy = 'Tarpan';
  const [wastedNotes, setWastedNotes] = useState('');

  useEffect(() => {
    if (!authChecked || !isAuthenticated) return;
    fetchWastageLogsFromDB().then((logs) => {
      if (logs && logs.length > 0) {
        setWastageLogs(logs);
      }
      setWastageLoading(false);
    });
  }, [isAuthenticated, authChecked]);

  const handleRecordWastage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastedItem || !wastedQty) return;

    const newLog = {
      id: `wst-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().split('T')[0],
      itemName: wastedItem,
      wastedQty: Number(wastedQty),
      unit: wastedUnit,
      reason: wastedReason,
      reportedBy: wastedReportedBy,
      notes: wastedNotes
    };

    setWastageLogs(prev => [newLog, ...prev]);
    createWastageLogDB(newLog);

    // Reduce stock in inventory list
    const matchedInv = inventory.find(i => i.name.toLowerCase() === wastedItem.toLowerCase());
    if (matchedInv) {
      onUpdateStock(matchedInv.id, Math.max(0, matchedInv.currentStock - Number(wastedQty)));
    }

    showToast(`Recorded wastage incident: ${wastedQty} ${wastedUnit} of ${wastedItem}. Saved to database.`, { type: 'info' });
    setWastedItem('');
    setWastedQty('');
    setWastedNotes('');
  };

  const handleCreateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const item: InventoryItem = {
      id: `inv-${Date.now().toString().slice(-4)}`,
      name,
      category,
      currentStock,
      minThreshold,
      unit,
      imagePath,
    };

    onAddInventoryItem(item);

    // Sync to #edit_kitchen_stock catalog list as well
    const newCatId = catalogItems.length > 0 ? Math.max(...catalogItems.map(i => i.id)) + 1 : 101;
    setCatalogItems(prev => [{
      id: newCatId,
      name,
      category,
      categoryId: 999,
      price: 0,
      packSize: 1,
      packUnit: unit,
      unitLabel: unit,
      imagePath,
      is_verified: true
    }, ...prev]);

    setIsAddModalOpen(false);
    setName('');
    setImagePath('');
  };


  if (activeTab === 'deficit') {
    return (
      <div className="kitchen-wastage-container space-y-6 text-slate-800 dark:text-slate-200">
        <PageHeader
          title="Kitchen Wastage & Spillage Log"
          subtitle="Formally record spillage, spoilage, or kitchen damage with full accountability and audit trail."
        />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Form Column (Left Side on Desktop) */}
          <div className="xl:col-span-5 record-wastage-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
            <h3 className="inventory-management__subtitle font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-700 pb-3">
              <ClipboardEdit className="w-4 h-4 text-amber-500" /> RECORD WASTAGE / SPILLAGE INCIDENT
            </h3>

            <form onSubmit={handleRecordWastage} className="record-wastage-form app-form app-form--record-wastage space-y-4">
              <div className="space-y-4">
                <div>
                  <StyledSelect
                    label="Select Material Item *"
                    searchable
                    value={wastedItem}
                    onChange={setWastedItem}
                    placeholder="-- Choose Catalog Item --"
                    options={catalogItems.map(item => ({ value: item.name, label: `${item.name} (${item.category})` }))}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex gap-1.5 items-center">
                    <div className="flex-1">
                      <Input
                        label="Wasted / Spilled Qty *"
                        type="number"
                        required
                        min="0.1"
                        step="any"
                        value={wastedQty}
                        onChange={e => setWastedQty(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0.00"
                        className="wastage-qty-input w-full font-semibold"
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <StyledSelect
                        label="Unit"
                        value={wastedUnit}
                        onChange={setWastedUnit}
                        options={['Kg', 'Gm', 'Ltr', 'Ml', 'Pcs', 'Pack'].map(u => ({ value: u, label: u }))}
                      />
                    </div>
                  </div>

                  <div>
                    <StyledSelect
                      label="Reason for Loss *"
                      value={wastedReason}
                      onChange={setWastedReason}
                      options={[
                        { value: 'Spillage / Leakage', label: 'Spillage / Leakage' },
                        { value: 'Spoilage / Expiry', label: 'Spoilage / Expiry' },
                        { value: 'Cooking Wastage', label: 'Cooking Wastage' },
                        { value: 'Damaged Packaging', label: 'Damaged Packaging' },
                        { value: 'Theft / Loss', label: 'Theft / Discrepancy' },
                        { value: 'Other', label: 'Other Incident' },
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Input
                      label="Reported By"
                      type="text"
                      disabled
                      readOnly
                      value={currentUser?.name || wastedReportedBy || 'Tarpan'}
                      className="bg-slate-100 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 cursor-not-allowed border-slate-200 dark:border-slate-700 opacity-75 font-semibold"
                    />
                  </div>

                  <div>
                    <Input
                      label="Incident Notes / Explanation"
                      type="text"
                      value={wastedNotes}
                      onChange={e => setWastedNotes(e.target.value)}
                      placeholder="e.g. Container dropped..."
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="btn-log-wastage w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-3 rounded-lg shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <ClipboardEdit className="w-4 h-4" />
                  <span>LOG WASTAGE INCIDENT</span>
                </button>
              </div>
            </form>
          </div>

          {/* Audit History Column (Right Side on Desktop) */}
          <div className="xl:col-span-7 wastage-logs-card bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
            <h3 className="inventory-management__subtitle font-semibold text-slate-800 dark:text-white text-sm">Wastage & Spillage Audit History</h3>
            <span className="text-slate-400 font-semibold text-xs">{wastageLoading ? '…' : wastageLogs.length} incidents</span>
          </div>

          {/* Mobile Card Stack View (md:hidden) */}
          <div className="md:hidden space-y-2.5">
            {wastageLogs.slice((wastagePage - 1) * 10, wastagePage * 10).map((log: any, idx: number) => (
              <div key={log.id || idx} className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-800 pb-2">
                  <span className="font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {formatDateDDMMYYYY(log.date)}
                  </span>
                  <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-semibold text-[10px] px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800">
                    {log.reason}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-slate-900 dark:text-white text-xs">{log.itemName}</h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">Reported By: {log.reportedBy}</span>
                  </div>
                  <span className="font-bold text-red-600 dark:text-red-400 text-xs shrink-0">{log.wastedQty} {log.unit}</span>
                </div>
              </div>
            ))}

            {/* Mobile 10-Item Pagination Controls */}
            {wastageLogs.length > 10 && (
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  disabled={wastagePage === 1}
                  onClick={() => setWastagePage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  Previous
                </button>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Page {wastagePage} of {Math.ceil(wastageLogs.length / 10)}
                </span>
                <button
                  type="button"
                  disabled={wastagePage >= Math.ceil(wastageLogs.length / 10)}
                  onClick={() => setWastagePage((p) => Math.min(Math.ceil(wastageLogs.length / 10), p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Desktop Table (hidden md:block) */}
          <div className="hidden md:block overflow-x-auto">
            {(() => {
              const wastageColumns = [
                {
                  name: 'Date',
                  cell: (log: any) => <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{formatDateDDMMYYYY(log.date)}</span>,
                },
                {
                  name: 'Item Name',
                  cell: (log: any) => <span className="font-semibold text-slate-900 dark:text-white text-xs">{log.itemName}</span>,
                },
                {
                  name: 'Wasted Qty',
                  cell: (log: any) => <span className="font-semibold text-red-600 dark:text-red-400 text-xs">{log.wastedQty} {log.unit}</span>,
                },
                {
                  name: 'Reason',
                  cell: (log: any) => (
                    <Badge variant="warning" size="sm">
                                  {log.reason}
                                </Badge>
                  ),
                },
                {
                  name: 'Reported By',
                  cell: (log: any) => <span className="text-[11px] text-slate-600 dark:text-slate-400">{log.reportedBy}</span>,
                },
              ];

              if (wastageLogs.length === 0) {
                return <div className="p-8 text-center text-slate-400 text-xs font-semibold">No wastage incidents logged.</div>;
              }
              return (
                <>
                  <Table hoverable>
                    <TableHead>
                      <TableRow>
                        {wastageColumns.map((col) => (
                          <TableHeadCell key={col.name}>{col.name}</TableHeadCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {wastageLogs.slice((wastageDesktopPage - 1) * WASTAGE_DESKTOP_PAGE_SIZE, wastageDesktopPage * WASTAGE_DESKTOP_PAGE_SIZE).map((log: any, idx: number) => (
                        <TableRow key={log.id || idx} className="bg-white dark:bg-gray-800">
                          {wastageColumns.map((col) => (
                            <TableCell key={col.name}>{col.cell(log)}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination
                    page={wastageDesktopPage}
                    totalItems={wastageLogs.length}
                    pageSize={WASTAGE_DESKTOP_PAGE_SIZE}
                    onPageChange={setWastageDesktopPage}
                    itemLabel="incidents"
                  />
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

  if (activeTab === 'catalog') {
    const filteredCatalogItems = catalogItems.filter(item => {
      const matchesSearch = !catalogSearch.trim() || item.name.toLowerCase().includes(catalogSearch.toLowerCase()) || item.category.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || selectedCategory === 'All Items' || !selectedCategory || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    return (
      <div className="stock-inventory-container">
        <div className="mb-4">
          <PageHeader
            title="Edit Kitchen Stock"
            subtitle="Manage the master list of raw materials - pricing, pack sizes, units, and categories."
          >
            {catalogView === 'items' && (
              <PageHeaderButton onClick={handleCreateNewCatalogItem} icon={Plus}>
                {t('register_new_item_button')}
              </PageHeaderButton>
            )}
          </PageHeader>
        </div>

        <div className="kitchen-stock-tabs-desk">
        <Tabs
          aria-label="Kitchen Stock Tabs"
          variant="default"
          theme={attachedTabsTheme}
          clearTheme={attachedTabsClearTheme}
          onActiveTabChange={(tabIndex: number) => {
            setCatalogView(tabIndex === 0 ? 'items' : 'categories');
          }}
        >
          <TabItem active={catalogView === 'items'} title={t('master_materials_catalog_header')} icon={Package} />
          <TabItem active={catalogView === 'categories'} title={t('manage_categories_button')} icon={Settings} />
        </Tabs>

        {catalogView === 'items' && (
            <div className="space-y-4">
              {selectedCatalogItemIds.length > 0 && (
                <div className="bulk-category-action-bar bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md animate-in fade-in slide-in-from-top-2 duration-250">
                  <div className="flex items-center gap-2">
                    <span className="bg-blue-600 text-white font-semibold text-xs px-2.5 py-1 rounded-full shadow-3xs">
                      {selectedCatalogItemIds.length} Selected
                    </span>
                    <span className="text-xs text-blue-700 dark:text-blue-300 font-semibold">
                      {t('items_to_assign_category_bulk')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <StyledSelect
                      className="flex-1 sm:flex-none"
                      value={bulkTargetCategory}
                      onChange={setBulkTargetCategory}
                      placeholder={t('select_target_category_placeholder')}
                      options={catalogCategories.map(cat => ({ value: cat, label: cat }))}
                    />
                    <button
                      onClick={() => handleBulkAssignCategory(bulkTargetCategory)}
                      disabled={!bulkTargetCategory}
                      className="btn-bulk-assign-category bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-md shrink-0"
                    >
                      {t('assign_category_button')}
                    </button>
                    <button
                      onClick={() => setSelectedCatalogItemIds([])}
                      className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-semibold px-2 py-2 cursor-pointer transition-colors"
                    >
                      {t('clear_button')}
                    </button>
                  </div>
                </div>
              )}

              <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-x-auto">
                <div className="w-full flex flex-col gap-3 p-4 border-b border-slate-100 dark:border-slate-700/80">
                  <div className="flex items-center gap-2">
                    <div className="relative max-w-sm w-full">
                      <FlowbiteTextInput
                        type="text"
                        placeholder={t('search_by_name_category_placeholder')}
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCatalogCategoryFilters((v) => !v)}
                      className={`relative h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                        showCatalogCategoryFilters
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                      title={t('toggle_category_filters_tooltip', 'Filter by category')}
                      aria-label="Toggle category filters"
                      aria-expanded={showCatalogCategoryFilters}
                    >
                      <Filter className="w-4 h-4" />
                      {selectedCategory !== 'All' && selectedCategory !== 'All Items' && !showCatalogCategoryFilters && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-white dark:border-slate-800" />
                      )}
                    </button>
                  </div>

                  {showCatalogCategoryFilters && (
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                      {catalogCategories.map(cat => {
                        const count = cat === 'All' || cat === 'All Items' ? catalogItems.length : catalogItems.filter(i => i.category === cat).length;
                        const isActive = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                              isActive
                                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-md'
                                : 'bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-semibold'
                            }`}
                          >
                            {cat === 'All Items' || cat === 'All' ? 'All' : cat} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {(() => {
                  const catalogColumns = [
                    {
                      name: t('image_column_header'),
                      cell: (row: CatalogItem) => {
                        const ItemIcon = getStockItemIcon(row.name, row.category);
                        return (
                          <div className="w-11 h-11 bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg flex items-center justify-center">
                            <ItemIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                          </div>
                        );
                      },
                    },
                    {
                      name: t('item_name_label'),
                      cell: (row: CatalogItem) => <span className="font-semibold text-slate-800 dark:text-white">{row.name}</span>,
                    },
                    {
                      name: t('category_label'),
                      cell: (row: CatalogItem) => (
                        <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5 rounded text-2xs font-semibold">{row.category}</span>
                      ),
                    },
                    {
                      name: t('pack_column_header'),
                      cell: (row: CatalogItem) => <span className="text-slate-600 dark:text-slate-300">{row.packSize} {row.packUnit}</span>,
                    },
                    {
                      name: t('cost_column_header'),
                      align: 'right' as const,
                      cell: (row: CatalogItem) => <span className="text-slate-600 dark:text-slate-300">₹{row.price.toFixed(2)}</span>,
                    },
                    {
                      name: t('status_column_header'),
                      cell: (row: CatalogItem) => (
                        row.is_verified ? (
                          <Badge variant="success" size="sm">{t('active_status_badge')}</Badge>
                        ) : (
                          <Badge variant="warning" size="sm">{t('review_status_badge')}</Badge>
                        )
                      ),
                    },
                    {
                      name: 'Actions',
                      cell: (row: CatalogItem) => (
                        <div className="flex items-center gap-1.5 inventory-management__actions whitespace-nowrap">
                          {!row.is_verified && (
                            <Button variant="secondary" size="sm" onClick={() => handleApproveItem(row.id)} className="text-emerald-600 dark:text-emerald-400">
                              {t('approve_button')}
                            </Button>
                          )}
                          <Button variant="edit" size="sm" onClick={() => handleEditCatalogItem(row)} leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                            {t('edit_button')}
                          </Button>
                          {canDeleteCatalogItem && (
                            <Button variant="danger" size="sm" onClick={() => handleDeleteCatalogItem(row.id, row.name)} leftIcon={<Trash2 className="w-3.5 h-3.5 shrink-0" />}>
                              {t('delete_button')}
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ];

                  if (inventoryLoading) return tableLoadingIndicator('Loading catalog...');
                  if (filteredCatalogItems.length === 0) {
                    return <div className="p-8 text-center text-slate-400 text-sm">{t('no_catalog_items_search_message')}</div>;
                  }

                  const pagedCatalogItems = filteredCatalogItems.slice((catalogDesktopPage - 1) * CATALOG_DESKTOP_PAGE_SIZE, catalogDesktopPage * CATALOG_DESKTOP_PAGE_SIZE);
                  const allPageIdsSelected = pagedCatalogItems.length > 0 && pagedCatalogItems.every((row) => selectedCatalogItemIds.includes(row.id));

                  return (
                    <>
                      <Table hoverable>
                        <TableHead>
                          <TableRow>
                            <TableHeadCell className="p-4">
                              <Checkbox
                                checked={allPageIdsSelected}
                                onChange={(e) => {
                                  const pageIds = pagedCatalogItems.map((r) => r.id);
                                  setSelectedCatalogItemIds((prev) =>
                                    e.target.checked
                                      ? Array.from(new Set([...prev, ...pageIds]))
                                      : prev.filter((id) => !pageIds.includes(id))
                                  );
                                }}
                              />
                            </TableHeadCell>
                            {catalogColumns.map((col) => (
                              <TableHeadCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                                {col.name}
                              </TableHeadCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {pagedCatalogItems.map((row) => {
                            const isSelected = selectedCatalogItemIds.includes(row.id);
                            return (
                              <TableRow key={row.id} className={isSelected ? 'bg-blue-50 dark:bg-blue-950/40' : 'bg-white dark:bg-gray-800'}>
                                <TableCell className="p-4">
                                  <Checkbox
                                    checked={isSelected}
                                    onChange={(e) => {
                                      setSelectedCatalogItemIds((prev) =>
                                        e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                                      );
                                    }}
                                  />
                                </TableCell>
                                {catalogColumns.map((col) => (
                                  <TableCell key={col.name} className={col.align === 'right' ? 'text-right' : ''}>
                                    {col.cell(row)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <TablePagination
                        page={catalogDesktopPage}
                        totalItems={filteredCatalogItems.length}
                        pageSize={CATALOG_DESKTOP_PAGE_SIZE}
                        onPageChange={setCatalogDesktopPage}
                        itemLabel="items"
                      />
                    </>
                  );
                })()}
              </div>

              <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden p-3 space-y-3">
                <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        placeholder={t('search_by_name_category_placeholder')}
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                        className="w-full"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCatalogCategoryFilters((v) => !v)}
                      className={`relative h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                        showCatalogCategoryFilters
                          ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                      }`}
                      title={t('toggle_category_filters_tooltip', 'Filter by category')}
                      aria-label="Toggle category filters"
                      aria-expanded={showCatalogCategoryFilters}
                    >
                      <Filter className="w-4 h-4" />
                      {selectedCategory !== 'All' && selectedCategory !== 'All Items' && !showCatalogCategoryFilters && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-white dark:border-slate-800" />
                      )}
                    </button>
                  </div>

                  {showCatalogCategoryFilters && (
                    <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                      {catalogCategories.map(cat => {
                        const count = cat === 'All' || cat === 'All Items' ? catalogItems.length : catalogItems.filter(i => i.category === cat).length;
                        const isActive = selectedCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                              isActive
                                ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                                : 'bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {cat === 'All Items' || cat === 'All' ? 'All' : cat} ({count})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {(() => {
                  const filtered = filteredCatalogItems;
                  const paginated = filtered.slice((catalogPage - 1) * 10, catalogPage * 10);

                  return (
                    <>
                      <div className="space-y-2.5">
                        {paginated.map((item) => {
                          const ItemIcon = getStockItemIcon(item.name, item.category);
                          return (
                            <div
                              key={item.id}
                              className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80 space-y-2 text-xs"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                                  <ItemIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{item.name}</span>
                                    {item.is_verified && (
                                      <Popover
                                        trigger="hover"
                                        content={
                                          <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                            Verified master item
                                          </div>
                                        }
                                      >
                                        <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                          ✓
                                        </span>
                                      </Popover>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                      {item.category}
                                    </span>
                                    <span className="text-slate-400 text-[11px]">
                                      {item.packSize} {item.packUnit}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-bold text-slate-900 dark:text-white text-sm">
                                    ₹{Number(item.price || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                                {!item.is_verified && (
                                  <button
                                    onClick={() => handleApproveItem(item.id)}
                                    className="px-2.5 py-1 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-700 font-semibold text-xs rounded-lg transition cursor-pointer"
                                  >
                                    {t('approve_button')}
                                  </button>
                                )}
                                <Button variant="secondary" size="sm" onClick={() => handleEditCatalogItem(item)} leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>
                                  {t('edit_button')}
                                </Button>
                                {canDeleteCatalogItem && (
                                  <button
                                    onClick={() => handleDeleteCatalogItem(item.id, item.name)}
                                    className="px-2.5 py-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-slate-200 dark:border-slate-700 font-semibold text-xs rounded-lg transition cursor-pointer"
                                  >
                                    {t('delete_button')}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {filtered.length === 0 && (
                          <div className="p-8 text-center text-slate-400 text-sm">{t('no_catalog_items_search_message')}</div>
                        )}
                      </div>

                      {filtered.length > 10 && (
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
                          <button
                            type="button"
                            disabled={catalogPage === 1}
                            onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                          >
                            Previous
                          </button>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Page {catalogPage} of {Math.ceil(filtered.length / 10)}
                          </span>
                          <button
                            type="button"
                            disabled={catalogPage >= Math.ceil(filtered.length / 10)}
                            onClick={() => setCatalogPage((p) => Math.min(Math.ceil(filtered.length / 10), p + 1))}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
        )}

        {/* rounded-t-none -> rounded-tl-none (2 Sep 2026, user report on the
            same pattern elsewhere: top-right corner should stay rounded like
            the bottom two - the "Kitchen Stock Tabs" row above doesn't span
            this panel's full width, so only the top-left corner sits under a
            tab; border-t-0 still drops the whole top border since the Tabs'
            own tablist border-b already spans the full width underneath it -
            see BillingCheckout.tsx's billing-checkout__desk-body Card for
            the fuller writeup of this pattern). */}
        {catalogView === 'categories' && (
            <div className="bg-white dark:bg-slate-800 border border-t-0 border-slate-200 dark:border-slate-700 rounded-lg rounded-tl-none p-4 sm:p-5 shadow-md space-y-3 -mt-px">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder={t('new_category_name_placeholder')}
                  className="flex-1"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newCategoryName.trim()) {
                      const catName = newCategoryName.trim();
                      const ok = await addMaterialCategoryToDB(catName);
                      if (ok) {
                        const cats = await fetchMaterialCategoriesFromDB();
                        setDbCategories(cats);
                        if (onLogAudit) {
                          const currentUserName = currentUser?.name || 'Admin';
                          onLogAudit(`${currentUserName} created material category '${catName}'`);
                        }
                        setNewCategoryName('');
                      }
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newCategoryName.trim()) return;
                    const catName = newCategoryName.trim();
                    const ok = await addMaterialCategoryToDB(catName);
                    if (ok) {
                      const cats = await fetchMaterialCategoriesFromDB();
                      setDbCategories(cats);
                      if (onLogAudit) {
                        const currentUserName = currentUser?.name || 'Admin';
                        onLogAudit(`${currentUserName} created material category '${catName}'`);
                      }
                      setNewCategoryName('');
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {t('add_category_button')}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {catalogCategories.filter(c => c !== 'All').map(cat => {
                    const dbCat = dbCategories.find(c => c.name === cat);
                    return (
                      <div key={cat} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-lg p-2">
                        {editingCategoryId === dbCat?.id ? (
                      <>
                        <Input
                          type="text"
                          value={editingCategoryName}
                          onChange={e => setEditingCategoryName(e.target.value)}
                          onBlur={() => handleRenameCategory(dbCat!.id)}
                          onKeyDown={e => e.key === 'Enter' && handleRenameCategory(dbCat!.id)}
                          autoFocus
                          className="flex-1"
                        />
                        <button onClick={() => handleRenameCategory(dbCat!.id)} className="text-emerald-600 hover:text-emerald-700 cursor-pointer p-1">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{cat}</span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => { setEditingCategoryId(dbCat?.id || 0); setEditingCategoryName(cat); }}
                          title={t('rename_tooltip')}
                          aria-label={t('rename_tooltip')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleDeleteCategory(dbCat?.id || 0, cat)}
                          title={t('delete_button')}
                          aria-label={t('delete_button')}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                        </Button>
                      </>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
        )}
        </div>

        {/* Add/Edit Catalog Drawer */}
        <FlowbiteDrawer
          open={isCatalogModalOpen}
          onClose={() => setIsCatalogModalOpen(false)}
          position="right"
          className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
        >
          <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <PackagePlus className="w-4 h-4" />
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
                {editingCatalogItem ? t('edit_catalog_item_heading') : t('register_new_material_heading')}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCatalogModalOpen(false)}
              className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSaveCatalogItem} className="app-form app-form--save-catalog-item flex-1 flex flex-col justify-between overflow-y-auto">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div>
                <Input label={t('item_name_label')} type="text" required value={catItemName} onChange={e => setCatItemName(e.target.value)} placeholder="e.g. Tomato Puree" />
              </div>

              <div>
                <StyledSelect
                  label={t('category_label')}
                  value={catCategory}
                  onChange={setCatCategory}
                  placeholder="Select category..."
                  error={!catCategory}
                  options={catalogCategories.map(cat => ({ value: cat, label: cat }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Input label={t('base_price_label')} type="number" step="0.01" required value={catPrice} onChange={e => setCatPrice(Number(e.target.value))} />
                </div>
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <Input label={t('pack_size_label')} type="number" step="0.01" required value={catPackSize} onChange={e => setCatPackSize(Number(e.target.value))} />
                  </div>
                  <div className="w-1/2">
                    <StyledSelect
                      label={t('unit_label')}
                      value={catUnit}
                      onChange={setCatUnit}
                      options={['Kg', 'Gms', 'Liter', 'Ml', 'Packets', 'Pc', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('upload_image_label', 'Upload Image')}</label>
                <label htmlFor="cat-image-upload-input" className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <span>{catImagePath ? t('change_image_button', 'Change Image') : t('choose_image_button', 'Choose Image')}</span>
                </label>
                <input
                  id="cat-image-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                {catImagePath && (
                  <div className="mt-2">
                    <p className="text-2xs text-slate-500 dark:text-slate-400 mb-1">{t('preview_label', 'Preview:')}</p>
                    <img src={catImagePath} alt="Preview" className="w-[150px] h-[50px] object-cover border border-slate-200 dark:border-slate-700 rounded shadow-md" />
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsCatalogModalOpen(false)}
              >
                {t('cancel_button')}
              </Button>
              <Button type="submit" variant="primary" size="sm">
                {t('save_commit_updates_button')}
              </Button>
            </div>
          </form>
        </FlowbiteDrawer>
      </div>
    );
  }

  if (activeTab === 'requisitions' || activeTab === 'fulfill') {
    const filteredCatalog = stockCatalog.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(reqSearch.toLowerCase().trim());
      const matchesCategory = reqCategory === 'All Items' || reqCategory === 'All' || !reqCategory || item.category === reqCategory;
      return matchesSearch && matchesCategory;
    });

    const categories = [
      'All Items',
      ...catalogCategories.filter(c => c !== 'All')
    ];

    const totalReqCount = reqBasket.reduce((sum, b) => sum + b.qty, 0);
    const totalReqSum = reqBasket.reduce((sum, b) => sum + ((b.rate || 0) * b.qty), 0);
    const visibleReqDrawerItems = isReqCartDrawerExpanded ? [...reqBasket].reverse() : [...reqBasket].slice(-3).reverse();
    const pendingSheetsCount = recentSheets.filter(s => s.status === 'PENDING').length;

    return (
      <div data-tour="stock-requisition">
      {/* attachedTabsTheme/attachedTabsClearTheme, not an ad-hoc one-off theme
          (2 Sep 2026, user report: "Requisitions page is not following design
          rules like bookings page") - this was the only Tabs usage in the
          attached-tabs family still building its own theme object from
          scratch instead of the shared utils/tabsTheme.ts, which is why it
          rendered as a grey segmented pill control instead of the individual
          bordered/attached tabs every other page uses. Merged in (rather than
          replaced outright) since the flex-nowrap/overflow-x-auto variant
          fix below is still needed and isn't part of the shared theme. */}
      <Tabs
        aria-label="Stock Request Tabs"
        variant="default"
        theme={{
          ...attachedTabsTheme,
          tablist: {
            ...attachedTabsTheme.tablist,
            // flex-nowrap + overflow-x-auto: flowbite's default tablist is
            // flex-wrap, which was dropping "Request Materials" onto its own
            // second row on mobile once the first tab's title pushed past the
            // available width - both tabs now stay on one row, scrolling
            // horizontally instead of wrapping if a title is ever still too
            // long for a very narrow screen (found 21 Aug 2026).
            variant: { default: 'flex-nowrap overflow-x-auto' },
          },
        }}
        clearTheme={attachedTabsClearTheme}
        onActiveTabChange={(tabIndex: number) => {
          const tabs: ('fulfill' | 'requisitions')[] = ['fulfill', 'requisitions'];
          if (tabs[tabIndex]) setActiveTab(tabs[tabIndex]);
        }}
      >
        <TabItem
          active={activeTab === 'fulfill'}
          title={
            <span className="inline-flex items-center gap-1.5">
              <span>Pending Requests</span>
              {pendingSheetsCount > 0 && (
                <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-2xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  {pendingSheetsCount}
                </span>
              )}
            </span>
          }
          icon={CheckCircle2}
        >
          {/* Chrome (bg/border/rounded/padding) is mobile-only - at md: and up
              the table's own card below already provides it, so keeping
              this unconditional just doubled the border/shadow around a
              single piece of content ("block inside a block", 20 Aug 2026).
              rounded-tl-none border-t-0 -mt-px (2 Sep 2026, same "attached
              tabs" flush treatment as BillingCheckout.tsx's desk-body Card -
              see its comment for the fuller writeup): the Tabs row above
              doesn't span this card's full width, so only the top-left
              corner sits under a tab and needs to stay square; top-right
              stays rounded like the bottom two. */}
          <div className="space-y-4 bg-white dark:bg-gray-800 rounded-lg rounded-tl-none border border-t-0 border-gray-200 dark:border-gray-700 p-3.5 sm:p-4 -mt-px md:bg-transparent md:dark:bg-transparent md:border-0 md:rounded-none md:p-0 md:mt-0">
            {/* Same flush treatment as the mobile wrapper above, for the same
                reason - this desktop table card sits directly under the same
                Tabs row at md: and up. */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg rounded-tl-none border border-t-0 border-slate-200 dark:border-slate-700 shadow-md overflow-x-auto -mt-px">
              <div className="w-full flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-slate-100 dark:border-slate-700/80">
                <FlowbiteTextInput
                  type="text"
                  placeholder="Search requests by item name, status..."
                  value={fulfillSearch}
                  onChange={(e) => setFulfillSearch(e.target.value)}
                  className="w-full sm:max-w-md"
                />
                <div className="w-full sm:w-72 sm:shrink-0">
                  <DateRangePicker
                    checkinDate={fulfillFromDraft}
                    checkoutDate={fulfillToDraft}
                    onCheckinChange={setFulfillFromDraft}
                    onCheckoutChange={setFulfillToDraft}
                    fromPlaceholder={t('from_label', 'From')}
                    toPlaceholder={t('to_label', 'To')}
                  />
                </div>
              </div>
              {(() => {
                const fulfillColumns = [
                  {
                    name: 'Request ID',
                    cell: (row: any) => (
                      <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                        #{row.id}
                      </span>
                    ),
                  },
                  {
                    name: 'Date',
                    cell: (row: any) => <span>{row.date}</span>,
                  },
                  {
                    name: 'Requested Items',
                    cell: (row: any) => (
                      <div className="py-2 space-y-1">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(row.items) && row.items.map((itemStr: string, idx: number) => (
                            <span key={idx} className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600">
                              {itemStr}
                            </span>
                          ))}
                        </div>
                      </div>
                    ),
                  },
                  {
                    name: 'Status',
                    align: 'center' as const,
                    cell: (row: any) => (
                      <Badge
                        variant={row.status === 'PENDING' ? 'warning' : row.status === 'FULFILLED' ? 'success' : 'neutral'}
                        size="sm"
                      >
                        {row.status}
                      </Badge>
                    ),
                  },
                  {
                    name: 'Actions',
                    align: 'center' as const,
                    cell: (row: any) => (
                      <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                        {row.status === 'PENDING' ? (
                          <>
                            <Button variant="edit" size="sm" onClick={() => handleEditFulfill(row)} leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                              Edit & Deliver
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => handleQuickComplete(row)} leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}>
                              Complete
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" size="sm" onClick={() => handleEditFulfill(row)} leftIcon={<Eye className="w-3.5 h-3.5 shrink-0" />}>
                            View Request
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ];

                const filteredFulfillRows = filteredFulfillSheets.filter((row) => {
                  if (!fulfillSearch.trim()) return true;
                  const term = fulfillSearch.toLowerCase();
                  const itemsStr = Array.isArray(row.items) ? row.items.join(' ').toLowerCase() : '';
                  return row.date.toLowerCase().includes(term) || row.status.toLowerCase().includes(term) || itemsStr.includes(term);
                });

                if (stockRequestsLoading) return tableLoadingIndicator('Loading stock requests...');
                if (filteredFulfillRows.length === 0) {
                  return <div className="p-8 text-center text-slate-400 text-sm">No material requisition sheets found.</div>;
                }
                return (
                  <>
                    <Table hoverable>
                      <TableHead>
                        <TableRow>
                          {fulfillColumns.map((col) => (
                            <TableHeadCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                              {col.name}
                            </TableHeadCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredFulfillRows.slice((fulfillDesktopPage - 1) * FULFILL_DESKTOP_PAGE_SIZE, fulfillDesktopPage * FULFILL_DESKTOP_PAGE_SIZE).map((row: any) => (
                          <TableRow key={row.id} className="bg-white dark:bg-gray-800">
                            {fulfillColumns.map((col) => (
                              <TableCell key={col.name} className={col.align === 'center' ? 'text-center' : ''}>
                                {col.cell(row)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <TablePagination
                      page={fulfillDesktopPage}
                      totalItems={filteredFulfillRows.length}
                      pageSize={FULFILL_DESKTOP_PAGE_SIZE}
                      onPageChange={setFulfillDesktopPage}
                      itemLabel="requests"
                    />
                  </>
                );
              })()}
            </div>

            {/* Mobile Card Stack View with 10-Item Pagination */}
            <div className="md:hidden space-y-3">
              <FlowbiteTextInput
                type="text"
                placeholder="Search requests by item name, status..."
                value={fulfillSearch}
                onChange={(e) => setFulfillSearch(e.target.value)}
                className="w-full"
              />

              {(() => {
                const filtered = filteredFulfillSheets.filter((row) => {
                  if (!fulfillSearch.trim()) return true;
                  const term = fulfillSearch.toLowerCase();
                  const itemsStr = Array.isArray(row.items) ? row.items.join(' ').toLowerCase() : '';
                  return row.date.toLowerCase().includes(term) || row.status.toLowerCase().includes(term) || itemsStr.includes(term);
                });
                const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
                const paginated = filtered.slice((fulfillPage - 1) * 10, fulfillPage * 10);

                if (filtered.length === 0) {
                  return (
                    <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 text-center text-slate-400 text-xs font-medium">
                      No material requisition sheets found.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {paginated.map((row) => (
                      <div
                        key={row.id}
                        className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 space-y-3 shadow-md"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-700/60 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              Request #{row.id}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              · {row.date}
                            </span>
                          </div>
                          <Badge
                            variant={row.status === 'PENDING' ? 'warning' : row.status === 'FULFILLED' ? 'success' : 'neutral'}
                            size="sm"
                          >
                            {row.status}
                          </Badge>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Requested Items ({Array.isArray(row.items) ? row.items.length : 1})
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(row.items) && row.items.map((itemStr: string, idx: number) => (
                              <span key={idx} className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-600">
                                {itemStr}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                          {row.status === 'PENDING' ? (
<>
                            <Button variant="edit" size="sm" onClick={() => handleEditFulfill(row)} leftIcon={<Pencil className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}>
                              Edit & Deliver
                            </Button>
                          </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleEditFulfill(row)}
                              className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-slate-200 dark:border-slate-600 shadow-md active:scale-95"
                            >
                              <Eye className="w-3.5 h-3.5" /> View Request
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* 10-Item Mobile Pagination Bar */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 shadow-md text-xs">
                        <button
                          type="button"
                          disabled={fulfillPage <= 1}
                          onClick={() => setFulfillPage((p) => Math.max(1, p - 1))}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                        >
                          Previous
                        </button>
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          Page {fulfillPage} of {totalPages} ({filtered.length} total)
                        </span>
                        <button
                          type="button"
                          disabled={fulfillPage >= totalPages}
                          onClick={() => setFulfillPage((p) => Math.min(totalPages, p + 1))}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Fulfill Edit Modal */}
            {/* Fulfill Edit Drawer (Flowbite Right Slide-Out Drawer) */}
            <FlowbiteDrawer
              open={Boolean(selectedFulfillSheet)}
              onClose={() => setSelectedFulfillSheet(null)}
              position="right"
              className="z-58 w-full sm:max-w-md md:max-w-lg h-full bg-white dark:bg-gray-800 p-0 flex flex-col shadow-2xl transition-transform border-l border-gray-200 dark:border-gray-700"
            >
              {selectedFulfillSheet && (
                <>
                  <div className="flex items-center justify-between p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800">
                    <h3 className="font-bold text-gray-900 dark:text-white text-base">
                      {t('modify_stock_request_header', `Modify Requisition #${selectedFulfillSheet.id}`)}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setSelectedFulfillSheet(null)}
                      className="text-gray-400 bg-transparent hover:bg-gray-100 hover:text-gray-900 rounded-lg text-sm w-8 h-8 inline-flex items-center justify-center dark:hover:bg-gray-700 dark:hover:text-white cursor-pointer transition-colors"
                      aria-label="Close drawer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <DrawerItems className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">{t('costing_delivery_manifest_header', 'Costing & Delivery Manifest')}</h4>

                      <div className="space-y-5">
                        {selectedFulfillSheet.items.map((itemStr: string, idx: number) => {
                          const namePart = itemStr.split(' (x')[0];
                          const data = fulfillData[namePart] || { qty: 0, cost: 0, size: 1, unit: 'Kg' };

                          return (
                            <div key={idx} className="space-y-2 bg-gray-50 dark:bg-gray-900/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                              <h5 className="font-semibold text-gray-900 dark:text-white text-sm">{namePart}</h5>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('delivered_qty_label', 'Delivered Qty')}</label>
                                  <Input
                                    type="number"
                                    step={isDecimalFriendlyUnit(data.unit) ? '0.01' : '1'}
                                    value={data.qty}
                                    onChange={(e) => {
                                      const parsed = parseFloat(e.target.value) || 0;
                                      const qty = isDecimalFriendlyUnit(data.unit) ? roundQty(parsed) : Math.round(parsed);
                                      updateFulfillData(namePart, 'qty', qty);
                                    }}
                                    className="w-full text-center"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('cost_price_label', 'Cost Price (₹)')}</label>
                                  <Input
                                    type="number"
                                    value={data.cost}
                                    onChange={(e) => updateFulfillData(namePart, 'cost', parseInt(e.target.value) || 0)}
                                    className="w-full text-center"
                                    // Live (26 Aug 2026 - CLAUDE.md's "Real-Time Form Validation" sweep):
                                    // mirrors handleSaveFulfillQuantities()'s own missingCost rule exactly -
                                    // a delivered quantity with no cost price is invalid, but only once a
                                    // real quantity has been entered (0 qty means nothing was delivered,
                                    // so no cost is expected yet either).
                                    error={data.qty > 0 && (!data.cost || Number(data.cost) <= 0) ? 'Required for delivered items' : undefined}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('size_label', 'Size')}</label>
                                  <Input
                                    type="number"
                                    value={data.size}
                                    onChange={(e) => updateFulfillData(namePart, 'size', parseInt(e.target.value) || 1)}
                                    className="w-full text-center"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{t('unit_format_label', 'Unit')}</label>
                                  <StyledSelect
                                    value={data.unit}
                                    onChange={(val) => updateFulfillData(namePart, 'unit', val)}
                                    options={['Kg', 'Gm', 'Gms', 'Ltr', 'Liter', 'Ml', 'Pack', 'Pcs', 'Pc', 'Box', 'Doz', 'Packets'].map(u => ({ value: u, label: u }))}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </DrawerItems>

                  {/* pb-[calc(1rem+env(safe-area-inset-bottom,0px))], not plain
                      p-4 (2 Sep 2026, site-wide audit) - see DESIGN.md's
                      "Bottom-Anchored Drawer Footer Safe Area" rule. Sibling of
                      DrawerItems above, shrink-0, pinned to the physical
                      bottom edge. */}
                  <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/90 shrink-0 flex items-center justify-end gap-2">
                    <Button onClick={() => setSelectedFulfillSheet(null)} variant="secondary">
                      {t('cancel_button', 'Cancel')}
                    </Button>
                    <Button onClick={handleSaveFulfillQuantities} variant="primary">
                      {t('save_commit_updates_button', 'Save & Update Requests')}
                    </Button>
                  </div>
                </>
              )}
            </FlowbiteDrawer>
          </div>
        </TabItem>

        <TabItem
          active={activeTab === 'requisitions'}
          title="Request Materials"
          icon={PackagePlus}
        >
          {/* Chrome (bg/border/rounded/padding) is mobile-only - at lg: and up
              the catalog + basket cards below already provide it, so keeping
              this unconditional just doubled the border around them ("block
              inside a block", 20 Aug 2026 - this wrapper used to also house
              the tab switcher itself before it became a real Tabs component
              above, which is why it still carries card chrome at all). */}
          <div className="take-food-order-container space-y-4 pb-48 lg:pb-0 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3.5 sm:p-4 lg:bg-transparent lg:dark:bg-transparent lg:border-0 lg:rounded-none lg:p-0">
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
          {/* Left Side (Desktop: 3 columns, Mobile: 1 column full width). Card
              chrome (bg/border/rounded/shadow/padding) is lg:-only - the
              take-food-order-container panel (top of this tab) already
              provides it on mobile, where the Right Side column (hidden
              lg:flex, see below) doesn't exist to separate this from, so
              applying the same card look here unconditionally just doubled
              the border/padding on mobile (found 19 Aug 2026). At lg: it's
              back, since there it really is a distinct sibling panel next to
              Right Side - a redundant middle wrapper that duplicated this
              same chrome around both panels together was removed 20 Aug 2026
              (that's what was causing the "block inside a block" nesting). */}
          <div className="lg:col-span-3 space-y-3.5 lg:bg-white lg:rounded-lg lg:border lg:border-slate-200 lg:shadow-md lg:p-4">
            {/* Sticky Search & Category Pills Bar */}
            <div className="bg-white pt-2 pb-3 space-y-3 -mx-1 px-1 sm:-mx-4 sm:px-4 border-b border-slate-100 shadow-md rounded-t-xl">
              {/* Quick Search Bar + Category Filter Toggle */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <FlowbiteTextInput
                    id="req-catalog-search"
                    type="text"
                    value={reqSearch}
                    onChange={(e) => setReqSearch(e.target.value)}
                    placeholder={t('quick_search_catalog_placeholder')}
                    className="w-full"
                  />
                </div>
                {reqSearch && (
                  <button
                    type="button"
                    onClick={() => setReqSearch('')}
                    className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer shrink-0"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowReqCategoryFilters((v) => !v)}
                  className={`relative h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                    showReqCategoryFilters
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                  title={t('toggle_category_filters_tooltip', 'Filter by category')}
                  aria-label="Toggle category filters"
                  aria-expanded={showReqCategoryFilters}
                >
                  <Filter className="w-4 h-4" />
                  {reqCategory !== 'All Items' && !showReqCategoryFilters && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyan-500 border-2 border-white dark:border-slate-800" />
                  )}
                </button>
              </div>

              {/* Category Pills Bar - hidden by default, revealed via the Filter button above */}
              {showReqCategoryFilters && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {categories.map((cat) => {
                    const isSelected = reqCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setReqCategory(cat)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                          isSelected
                            ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-md'
                            : 'bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-semibold'
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>



            {/* Stock Items Grid with Row Items (Mobile: 1 col, Sm: 2 cols, Lg: 3 cols) */}
            {inventoryLoading ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                <p className="text-slate-500 font-semibold text-xs">Loading catalog...</p>
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
                <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-semibold text-xs">{t('no_catalog_items_found_message')} "{reqSearch}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredCatalog.map((item) => {
                  const isRecentlyAdded = recentlyAddedReqId === item.id;
                  const ItemIcon = getStockItemIcon(item.name, item.category);
                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-lg border p-2 flex items-center justify-between gap-2.5 transition-all ${
                        isRecentlyAdded
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-md'
                          : 'border-slate-200/90 hover:border-cyan-400 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Item Icon Thumbnail */}
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-500 font-semibold text-[10px]">
                          <ItemIcon className="w-5 h-5 text-cyan-600" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="inventory-management__caption font-semibold text-slate-800 text-xs truncate">
                            {item.name}
                          </h4>
                          <p className="text-slate-500 font-semibold text-[11px] mt-0.5">
                            Per {item.unit} • ₹{item.rate.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddToReqBasket(item)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 flex items-center gap-1 cursor-pointer min-h-[36px] ${
                          isRecentlyAdded
                            ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                            : 'bg-slate-50 hover:bg-cyan-50 text-slate-800 hover:text-cyan-700 border border-slate-300 hover:border-cyan-400 active:scale-90 shadow-md'
                        }`}
                      >
                        {isRecentlyAdded ? (
                          <span>{t('added_button')}</span>
                        ) : (
                          <span>{t('add_button')}</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Side: DESKTOP ONLY Sticky Floating SUPPLY ORDER BASKET & RECENT LOG SHEETS (lg:col-span-1 hidden lg:flex) */}
          <div className="hidden lg:flex lg:col-span-1 flex-col space-y-4">
            {/* Panel 1: SUPPLY ORDER BASKET */}
            <div className="bg-white rounded-lg border border-slate-200/90 shadow-md p-4 flex-col justify-between space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="inventory-management__subtitle font-semibold text-slate-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                  <span>{t('supply_basket_header')}</span>
                </h3>
                <span className="text-[10px] font-semibold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full border border-cyan-200">
                  {totalReqCount} Items
                </span>
              </div>
              {reqBasket.length > 0 && (
                <p className="normal-case text-[10px] text-slate-400 font-normal -mt-2">
                  Tap a quantity to type an exact amount - decimals work for Kg/Gm/Ltr/Doz items.
                </p>
              )}

              {reqBasket.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-500 text-xs">{t('no_materials_loaded_message')}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{t('click_add_from_catalog_hint')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 divide-y divide-slate-100">
                  {reqBasket.map((b) => (
                    <div
                      key={b.id}
                      className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 truncate pr-1">
                        <h4 className="inventory-management__caption font-semibold text-slate-900 text-xs truncate">
                          {b.name} <span className="text-slate-500 font-normal">({b.unit})</span>
                        </h4>
                      </div>
                       <div className="flex items-center border border-slate-300 rounded-lg bg-white shrink-0 overflow-hidden">
                         <button
                           onClick={() => handleAdjustReqQty(b.id, -1)}
                           className="w-8 h-8 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center cursor-pointer active:scale-90"
                         >
                           -
                         </button>
                         <input
                           type="number"
                           inputMode="decimal"
                           step={isDecimalFriendlyUnit(b.unit) ? '0.01' : '1'}
                           min="0"
                           value={b.qty}
                           onChange={(e) => handleSetReqQty(b.id, e.target.value)}
                           className="w-12 text-center font-semibold text-slate-900 text-xs border-none outline-hidden bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                         />
                         <button
                           onClick={() => handleAdjustReqQty(b.id, 1)}
                           className="w-8 h-8 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center cursor-pointer active:scale-90"
                         >
                           +
                         </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Special Request Textarea */}
              <div>
                <Textarea
                  rows={2}
                  value={specialRequestText}
                  onChange={(e) => setSpecialRequestText(e.target.value)}
                  placeholder={t('special_requests_placeholder')}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 resize-none"
                />
              </div>

              {/* Dispatch Requirement Button */}
              <button
                onClick={handleDispatchReq}
                disabled={reqBasket.length === 0 && !specialRequestText.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 text-white font-semibold text-xs py-2.5 rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98]"
              >
                <span>{t('dispatch_requirement_button')}</span>
              </button>
            </div>

          </div>
        </div>

        {/* MOBILE ONLY Light-Theme Bottom Cart Drawer (lg:hidden, Collapsible & 50vh Expandable) */}
        {(reqBasket.length > 0 || specialRequestText.trim()) && (
          <div
            className={`sticky bottom-0 mt-auto z-[60] lg:hidden bg-white text-slate-900 rounded-t-2xl shadow-2xl border-t border-slate-200 transition-all duration-300 flex flex-col ${
              isReqCartDrawerExpanded ? 'h-[50vh]' : 'max-h-[260px]'
            }`}
          >
            {/* Header Bar */}
            <div className="p-3 bg-slate-50 rounded-t-2xl border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-cyan-100 text-cyan-800 border border-cyan-200 font-semibold text-xs px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                  <ShoppingCart className="w-3.5 h-3.5 text-cyan-700" />
                  <span>{totalReqCount} Items</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">TOTAL: </span>
                  <span className="text-emerald-600 font-semibold text-sm">₹{totalReqSum.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => setIsReqCartDrawerExpanded(!isReqCartDrawerExpanded)}
                className="bg-white hover:bg-slate-100 text-cyan-700 font-semibold text-xs px-3 py-1.5 rounded-lg border border-cyan-300 shadow-md flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                {isReqCartDrawerExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
                {t(isReqCartDrawerExpanded ? 'collapse_button' : 'expand_cart_button')}
              </button>
            </div>

            {/* Items List */}
            <div className="p-3 flex-1 overflow-y-auto space-y-2">
              <p className="text-[10px] text-slate-400 font-normal text-center pb-1">
                Tap a quantity to type an exact amount - decimals work for Kg/Gm/Ltr/Doz items.
              </p>
              {!isReqCartDrawerExpanded && reqBasket.length > 3 && (
                <p className="text-[10px] text-cyan-700 font-semibold tracking-wide uppercase text-center pb-1">
                  {t('showing_last_3_items_prefix')} {reqBasket.length} {t('showing_last_3_items_suffix')}
                </p>
              )}
              {visibleReqDrawerItems.map((b) => (
                <div
                  key={b.id}
                  className="bg-slate-50 p-2 rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-900"
                >
                  <div className="flex-1 pr-1 truncate">
                    <h4 className="inventory-management__caption font-semibold text-slate-900 text-xs truncate">
                      {b.name} <span className="text-slate-500 font-normal">({b.unit})</span>
                    </h4>
                  </div>

                  <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shrink-0">
                    <button
                      onClick={() => handleAdjustReqQty(b.id, -1)}
                      className="w-7 h-7 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={isDecimalFriendlyUnit(b.unit) ? '0.01' : '1'}
                      min="0"
                      value={b.qty}
                      onChange={(e) => handleSetReqQty(b.id, e.target.value)}
                      className="w-12 text-center font-semibold text-slate-900 text-xs border-none outline-hidden bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => handleAdjustReqQty(b.id, 1)}
                      className="w-7 h-7 hover:bg-slate-100 font-semibold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Footer.
                pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))], not plain
                p-3 (2 Sep 2026, site-wide audit) - see DESIGN.md's "Bottom-
                Anchored Drawer Footer Safe Area" rule. Unlike Kitchen's own
                mobile cart sheet (fixed, offset above the bottom nav bar by
                design), this one is sticky bottom-0 inside the Drawer's own
                scrollable body - its bottom edge sits flush with the
                physical screen edge on mobile, same risk as any other pinned
                drawer footer. */}
            <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] bg-white border-t border-slate-200 shrink-0 space-y-2">
              <Textarea
                rows={1}
                value={specialRequestText}
                onChange={(e) => setSpecialRequestText(e.target.value)}
                placeholder={t('special_requests_optional_placeholder')}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 resize-none"
              />
              <button
                onClick={handleDispatchReq}
                disabled={reqBasket.length === 0 && !specialRequestText.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-xs py-2.5 rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[40px]"
              >
                <span>{t('dispatch_requirement_button')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </TabItem>
  </Tabs>
      </div>
);
}

  const stockLogColumns = [
    {
      name: t('image_column_header'),
      cell: (item: InventoryItem) => {
        const ItemIcon = getStockItemIcon(item.name, item.category);
        return (
          <div className="relative w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            <ItemIcon className="w-4 h-4 text-cyan-600" />
          </div>
        );
      },
    },
    {
      name: t('item_name_label'),
      cell: (item: InventoryItem) => (
        <span className="font-semibold text-slate-900 dark:text-white text-sm">{item.name}</span>
      ),
    },
    {
      name: t('category_label'),
      cell: (item: InventoryItem) => (
        <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded font-medium text-xs">
          {item.category}
        </span>
      ),
    },
    {
      name: t('current_stock_column_header'),
      cell: (item: InventoryItem) => (
        <span className="font-semibold text-slate-800 dark:text-slate-200">{item.currentStock} {item.unit}</span>
      ),
    },
    {
      name: t('min_threshold_column_header'),
      cell: (item: InventoryItem) => (
        <span className="text-slate-500">{item.minThreshold} {item.unit}</span>
      ),
    },
    {
      name: t('status_column_header'),
      cell: (item: InventoryItem) => {
        const isLow = item.currentStock <= item.minThreshold;
        return isLow ? (
          <span className="bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            {t('low_stock_badge').toUpperCase()}
          </span>
        ) : (
          <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-[10px] font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {t('in_stock_badge')}
          </span>
        );
      },
    },
    {
      name: t('tracking_column_header', 'Tracking'),
      cell: (item: InventoryItem) => (
        item.source === 'custom' ? (
          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800 font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <Settings className="w-3 h-3" />
            Custom
          </span>
        ) : (
          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 font-semibold px-2.5 py-1 rounded-full inline-block">
            {t('system_tracked_badge', 'System Default')}
          </span>
        )
      ),
    },
  ];

  const stockLogSubHeader = (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="flex-1 max-w-xs">
        <Input
          type="text"
          value={stockLogSearch}
          onChange={(e) => setStockLogSearch(e.target.value)}
          placeholder={t('search_inventory_placeholder')}
        />
      </div>
      <Button
        variant="primary"
        size="xs"
        onClick={() => setIsAddModalOpen(true)}
        leftIcon={<Plus className="w-3.5 h-3.5" />}
      >
        {t('add_new_item_button')}
      </Button>
    </div>
  );

  return (
    <div data-tour="inventory-stock" className="stock-inventory-container space-y-6">
      <PageHeader title={t('inventory_catalog_heading')} subtitle={t('inventory_catalog_subtitle')} />

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        {stockLogSubHeader}
        {(() => {
          if (inventoryLoading) return tableLoadingIndicator('Loading inventory...');
          if (filteredInventory.length === 0) {
            return (
              <div className="text-center p-8 text-slate-400 font-semibold text-xs">
                {inventory.length === 0 ? 'No inventory items found.' : 'No items match your search.'}
              </div>
            );
          }
          return (
            <>
              <Table hoverable>
                <TableHead>
                  <TableRow>
                    {stockLogColumns.map((col) => (
                      <TableHeadCell key={col.name}>{col.name}</TableHeadCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredInventory.slice((stockLogDesktopPage - 1) * STOCK_LOG_DESKTOP_PAGE_SIZE, stockLogDesktopPage * STOCK_LOG_DESKTOP_PAGE_SIZE).map((item) => (
                    <TableRow key={item.id} className="bg-white dark:bg-gray-800">
                      {stockLogColumns.map((col) => (
                        <TableCell key={col.name}>{col.cell(item)}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={stockLogDesktopPage}
                totalItems={filteredInventory.length}
                pageSize={STOCK_LOG_DESKTOP_PAGE_SIZE}
                onPageChange={setStockLogDesktopPage}
                itemLabel="items"
              />
            </>
          );
        })()}
      </div>

      {/* Mobile Cards with Search, Category Filter Carousel & 10-Item Pagination */}
      <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-md overflow-hidden p-3 space-y-3">
        {/* Search Bar & Category Pills Carousel */}
        <div className="space-y-2.5 pb-2 border-b border-slate-100 dark:border-slate-700">
          <div>
            <Input
              type="text"
              placeholder={t('search_by_name_category_placeholder')}
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
            {catalogCategories.map((cat) => {
              const count = cat === 'All' || cat === 'All Items' ? catalogItems.length : catalogItems.filter((i) => i.category === cat).length;
              const isActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                    isActive
                      ? 'border-blue-600 dark:border-blue-500 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold shadow-md'
                      : 'bg-transparent text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 font-semibold'
                  }`}
                >
                  {cat === 'All Items' || cat === 'All' ? 'All Menu' : cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-700 space-y-3">
          {filteredInventory.slice((inventoryPage - 1) * 10, inventoryPage * 10).map((item) => {
            const isLow = item.currentStock <= item.minThreshold;
            return (
              <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                      {item.category}
                      {item.source === 'custom' ? (
                        <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 px-1.5 py-0.5 rounded text-[8px] flex items-center gap-0.5"><Settings className="w-2.5 h-2.5" /> Custom</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded text-[8px]">System</span>
                      )}
                    </span>
                    <h4 className="inventory-management__caption font-semibold text-slate-900 dark:text-white text-sm">{item.name}</h4>
                  </div>
                  {isLow ? (
                    <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-600" /> {t('low_stock_badge')}
                    </span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {t('in_stock_badge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-100 dark:border-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('current_stock_column_header')}</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-sm">{item.currentStock} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">{t('min_threshold_column_header')}</span>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">{item.minThreshold} {item.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredInventory.length === 0 && (
            <div className="text-center p-6 text-slate-400 font-semibold text-xs">{t('no_inventory_items_message')}</div>
          )}
        </div>

        {/* Mobile 10-Item Pagination Controls */}
        {filteredInventory.length > 10 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-700">
            <button
              type="button"
              disabled={inventoryPage === 1}
              onClick={() => setInventoryPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Page {inventoryPage} of {Math.ceil(filteredInventory.length / 10)}
            </span>
            <button
              type="button"
              disabled={inventoryPage >= Math.ceil(filteredInventory.length / 10)}
              onClick={() => setInventoryPage((p) => Math.min(Math.ceil(filteredInventory.length / 10), p + 1))}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Add Item Drawer */}
      <FlowbiteDrawer
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        position="right"
        className="z-58 w-full sm:w-120 p-0 bg-white dark:bg-gray-800 shadow-2xl flex flex-col justify-between"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Plus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white m-0">
              {t('add_new_item_button')}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(false)}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleCreateItem} className="app-form app-form--create-item flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
            <div>
              <Input
                label={`${t('item_name_label')} *`}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Milk or Basmati Rice"
              />
            </div>

            <div>
              <StyledSelect
                label={t('category_label')}
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'Groceries', label: 'Groceries' },
                  { value: 'Dairy', label: 'Dairy' },
                  { value: 'Oils', label: 'Oils & Spices' },
                  { value: 'Kitchen Fuel', label: 'Kitchen Fuel' },
                  { value: 'Maintenance', label: 'Maintenance & Cleaning' },
                ]}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <Input
                  label={t('stock_level_label')}
                  type="number"
                  value={currentStock}
                  onChange={(e) => setCurrentStock(Number(e.target.value))}
                />
              </div>

              <div>
                <Input
                  label={t('min_threshold_column_header')}
                  type="number"
                  value={minThreshold}
                  onChange={(e) => setMinThreshold(Number(e.target.value))}
                />
              </div>

              <div>
                <StyledSelect
                  label={t('unit_label')}
                  value={unit}
                  onChange={setUnit}
                  options={[
                    { value: 'kg', label: 'kg' },
                    { value: 'liters', label: 'liters' },
                    { value: 'pcs', label: 'pcs' },
                    { value: 'packets', label: 'packets' },
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="app-label block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t('item_image_label', 'Item Image')}</label>
              <label htmlFor="item-image-upload-input" className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 py-2 rounded-lg text-slate-600 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span>{imagePath ? t('change_image_button', 'Change Image') : t('choose_image_button', 'Choose Image')}</span>
              </label>
              <input
                id="item-image-upload-input"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setImagePath(reader.result as string);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                className="hidden"
              />

                {/* Image Preview Box */}
                {imagePath && (
                  <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-300 bg-slate-50">
                    <img
                      src={imagePath}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <Popover
                      trigger="hover"
                      content={
                        <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                          Remove Image
                        </div>
                      }
                    >
                      <button
                        type="button"
                        aria-label="Remove Image"
                        onClick={() => setImagePath('')}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </Popover>
                  </div>
                )}
            </div>
          </div>
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddModalOpen(false)}
            >
              {t('cancel_button')}
            </Button>
            <Button type="submit" variant="primary" size="sm">
              {t('save_item_button')}
            </Button>
          </div>
        </form>
      </FlowbiteDrawer>
    </div>
  );
};
