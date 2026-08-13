import React, { useState, useEffect, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { Boxes, AlertTriangle, Plus, CheckCircle2, X, Upload, Image as ImageIcon, Search, ShoppingCart, Settings, Landmark, Wallet, Coins, Package, Check, ClipboardEdit, Pencil, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react';
import { InventoryItem, CatalogItem } from '../types';
import { t } from '../i18n/en';
import { PageHeader } from './PageHeader';
import { Input } from './Input';
import { Textarea } from './Textarea';
import { StyledSelect } from './StyledSelect';
import { DateRangePicker } from './DateRangePicker';
import { fetchStockRequestsFromDB, createStockRequestInDB, updateStockRequestStatusInDB, fetchWastageLogsFromDB, createWastageLogDB, fetchKitchenPurchasesFromDB, createKitchenPurchaseDB, bulkUpdateKitchenPurchasesDB, deleteKitchenPurchaseDB, fetchStaffUsersFromDB, fetchMaterialCategoriesFromDB, updateMaterialCategoryInDB, deleteMaterialCategoryFromDB, addMaterialCategoryToDB, toggleIngredientCategoryInDB, fetchPayeesFromDB, addCatalogItemDB, updateCatalogItemDB, deleteCatalogItemDB, bulkUpdateCatalogCategoryDB, resolveTelegramTemplate, uploadImageDB, addDrawerEntryToDB, recordOutOfPocketCredit } from '../services/api';
import { useToast } from './ToastContext';
import { useStaff } from '../contexts/StaffContext';
import { useAuth } from '../contexts/AuthContext';
import { useInventoryContext } from '../contexts/InventoryContext';
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from '../utils/dateUtils';


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
  const { currentUser } = useAuth();
  const { inventory } = useInventoryContext();
  const [activeTab, setActiveTab] = React.useState<'stock_log' | 'deficit' | 'requisitions' | 'purchases' | 'fulfill' | 'catalog'>('stock_log');

  useEffect(() => {
    if (!activeMenuItemKey) return;
    if (activeMenuItemKey === 'stock_requests') setActiveTab('requisitions');
    else if (activeMenuItemKey === 'fulfill_stock_req') setActiveTab('fulfill');
    else if (activeMenuItemKey === 'deficit_shortfalls_log') setActiveTab('deficit');
    else if (activeMenuItemKey === 'stock_log') setActiveTab('stock_log');
    else if (activeMenuItemKey === 'kitchen_purchases') setActiveTab('purchases');
    else if (activeMenuItemKey === 'edit_kitchen_stock') setActiveTab('catalog');
  }, [activeMenuItemKey]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<number[]>([]);
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>('');

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
  const [catalogTableKey, setCatalogTableKey] = useState(0);
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
    fetchStaffUsersFromDB().then((users) => {
      if (users && users.length > 0) {
        const handlers = users.filter((u: any) => u.isFinancialHandler);
        if (handlers.length > 0) {
          setLiveCashHandlers(handlers);
        }
      }
    });
  }, []);

  // Material categories from database (for CRUD operations)
  // TODO: dbCategories should be passed as props from a central context instead of being fetched locally
  const [dbCategories, setDbCategories] = useState<{ id: number; name: string; is_ingredient: number }[]>([]);

  useEffect(() => {
    fetchMaterialCategoriesFromDB().then((cats) => {
      if (cats && cats.length > 0) {
        setDbCategories(cats);
      }
    });
  }, []);

  // Category filter pills derived from actual catalog items (always in sync with data)
  const catalogCategories = React.useMemo(() => {
    const cats = Array.from(new Set(catalogItems.map((item) => item.category).filter(Boolean)));
    return ['All', ...cats];
  }, [catalogItems]);
  const { showToast } = useToast();

  // Sync recorded-by with logged-in user
  useEffect(() => {
    if (currentUser?.name) {
      setPurRecordedBy(currentUser.name);
    }
  }, [currentUser]);

  // Vendors from database (payee_entities)
  // TODO: dbVendors should be passed as props from a central context instead of being fetched locally
  const [dbVendors, setDbVendors] = useState<{ id: string; name: string; type: string }[]>([]);

  useEffect(() => {
    fetchPayeesFromDB().then((payees) => {
      if (payees && payees.length > 0) {
        setDbVendors(payees);
      }
    });
  }, []);

  // Category filter for catalog
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Category management state
  const [showCategoryManager, setShowCategoryManager] = useState(false);
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
      setCatalogTableKey(k => k + 1);
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
      const match = itemStr.match(/\(x(\d+)\s*([a-zA-Z]+)?\)/);
      const qty = match ? parseInt(match[1]) : 1;
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
      const match = itemStr.match(/\(x(\d+)\s*([a-zA-Z]+)?\)/);
      const orderedQty = match ? parseInt(match[1]) : 1;
      const orderedUnit = match && match[2] ? match[2] : '';
      const orderTag = orderedUnit ? `${orderedQty} ${orderedUnit}` : `${orderedQty}`;
      
      const data = fulfillData[namePart];
      if (!data) return;

      if (data.qty !== orderedQty) {
        allDeliveredEqOrdered = false;
      }
      if (data.qty > 0) {
        allDeliveredZero = false;
        anyDelivered = true;
      }

      if (data.qty === 0) {
        manifestStr += `\n❌ <b>${namePart}</b>\n   └ Ordered: ${orderTag} | Recd: 0 (NOT DELIVERED)`;
      } else {
        manifestStr += `\n✅ <b>${namePart}</b>\n   └ Ordered: ${orderTag} | Recd: ${data.qty} ${data.unit} @ ₹${data.cost}`;
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

  const handleQuickComplete = (sheet: any) => {
    const targetSheetId = sheet.id;
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
  const [fulfillSearch, setFulfillSearch] = useState('');

  const [fulfillRangeOpen, setFulfillRangeOpen] = useState(false);
  const [fulfillFilterRange, setFulfillFilterRange] = useState<{ from: string; to: string } | null>(null);

  const todayDate = new Date();
  const padDate = (n: number) => String(n).padStart(2, '0');
  const todayStr = `${todayDate.getFullYear()}-${padDate(todayDate.getMonth() + 1)}-${padDate(todayDate.getDate())}`;
  const weekAgoDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 6);
  const weekAgoStr = `${weekAgoDate.getFullYear()}-${padDate(weekAgoDate.getMonth() + 1)}-${padDate(weekAgoDate.getDate())}`;

  // Draft from/to while the picker is open - only committed to
  // fulfillFilterRange (which actually drives the table) via "Enter", same
  // apply-on-demand behavior the old ref-based inputs had.
  const [fulfillFromDraft, setFulfillFromDraft] = useState(weekAgoStr);
  const [fulfillToDraft, setFulfillToDraft] = useState(todayStr);

  const handleFilterFulfill = () => {
    setFulfillFilterRange({ from: fulfillFromDraft, to: fulfillToDraft });
  };

  const filteredFulfillSheets = fulfillFilterRange
    ? recentSheets.filter(sheet => {
        const sheetDateStr = sheet.date.split(' - ')[0].trim();
        const sheetDate = new Date(sheetDateStr);
        const from = new Date(fulfillFilterRange.from);
        const to = new Date(fulfillFilterRange.to);
        to.setHours(23, 59, 59, 999);
        return sheetDate >= from && sheetDate <= to;
      })
    : recentSheets;


  useEffect(() => {
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
    });
  }, []);

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

  const handleDispatchReq = async () => {
    if (reqBasket.length === 0 && !specialRequestText.trim()) {
      showToast('Supply basket is empty!', { type: 'warning' });
      return;
    }
    const newSheetId = `${1167 + recentSheets.length}`;
    const items = reqBasket.map((b) => `${b.name} (x${b.qty} ${b.unit})`);
    if (specialRequestText.trim()) {
      items.push(`Special Notes: ${specialRequestText.trim()}`);
    }
    const newSheet = {
      id: newSheetId,
      status: 'PENDING',
      date: `${new Date().toLocaleDateString('en-GB')} - ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
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
      const tgMessage = resolved || `📋 <b>NEW STOCK REQUISITION SHEET #${newSheetId}</b>\n━━━━━━━━━━━━━━━━━━\n👤 Requested By: <b>${currentUser?.name || 'Staff'}</b>\n📅 Date: ${newSheet.date}\n🟢 Status: <b>PENDING</b>\n━━━━━━━━━━━━━━━━━━\n📝 Items Requested:\n${itemsListStr}`;
      onDispatchTelegram('Requisition', tgMessage, 'kitchen', undefined, 'requisition_material_request');
    }

    setReqBasket([]);
    setSpecialRequestText('');
    showToast(`Requisition Sheet #${newSheetId} dispatched successfully!`, { type: 'success' });
  };

  React.useEffect(() => {
    if (activeMenuItemKey === 'deficit_shortfalls_log') {
      setActiveTab('deficit');
    } else if (activeMenuItemKey === 'fulfill_stock_req') {
      setActiveTab('fulfill');
    } else if (activeMenuItemKey === 'stock_requests') {
      setActiveTab('requisitions');
    } else if (activeMenuItemKey === 'kitchen_purchases') {
      setActiveTab('purchases');
    } else if (activeMenuItemKey === 'edit_kitchen_stock') {
      setActiveTab('catalog');
    } else {
      setActiveTab('stock_log');
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
  const [wastedItem, setWastedItem] = useState('');
  const [wastedQty, setWastedQty] = useState<number | ''>('');
  const [wastedUnit, setWastedUnit] = useState('Kg');
  const [wastedReason, setWastedReason] = useState('Spillage / Leakage');
  const [wastedReportedBy, setWastedReportedBy] = useState('Tarpan');
  const [wastedNotes, setWastedNotes] = useState('');

  // Kitchen Purchases Ledger State
  const [kitchenPurchases, setKitchenPurchases] = useState<any[]>([]);
  const [purDate, setPurDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [purItemName, setPurItemName] = useState('');
  const [purSpec, setPurSpec] = useState('N/A');
  const [purQty, setPurQty] = useState<number | ''>('');
  const [purUnit, setPurUnit] = useState('Kg');
  const [purTotalPrice, setPurTotalPrice] = useState<number | ''>('');
  const [purRecordedBy, setPurRecordedBy] = useState(currentUser?.name || 'System');

  // Bulk Finance Interceptor state
  const [selectedPurIds, setSelectedPurIds] = useState<string[]>([]);
  const [selectedVendorToPay, setSelectedVendorToPay] = useState('');
  const [selectedPaidByStaff, setSelectedPaidByStaff] = useState(currentUser?.name || currentUser?.username || '');
  const [settlementFarmCash, setSettlementFarmCash] = useState<number | ''>('');
  const [settlementOutOfPocket, setSettlementOutOfPocket] = useState<number | ''>('');
  const [purSearch, setPurSearch] = useState('');

  useEffect(() => {
    const total = kitchenPurchases.filter(p => selectedPurIds.includes(p.id)).reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
    if (total > 0 && settlementFarmCash === '' && settlementOutOfPocket === '') {
      setSettlementFarmCash(total);
    }
  }, [selectedPurIds]);

  useEffect(() => {
    fetchWastageLogsFromDB().then((logs) => {
      if (logs && logs.length > 0) {
        setWastageLogs(logs);
      }
    });

    fetchKitchenPurchasesFromDB().then((data) => {
      if (data && data.length > 0) {
        setKitchenPurchases(data);
      }
    });
  }, []);

  const filteredKitchenPurchases = useMemo(() => {
    if (!purSearch.trim()) return kitchenPurchases;
    const q = purSearch.toLowerCase().trim();
    return kitchenPurchases.filter(p =>
      p.itemName.toLowerCase().includes(q) ||
      (p.vendorName || '').toLowerCase().includes(q)
    );
  }, [kitchenPurchases, purSearch]);

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
      <div className="kitchen-wastage-container space-y-6 text-xs text-slate-800 dark:text-slate-200">
        <PageHeader
          title="Kitchen Wastage & Spillage Log"
          subtitle="Formally record spillage, spoilage, or kitchen damage with full accountability and audit trail."
        />

        {/* Wastage Form */}
        <div className="record-wastage-card max-w-[550px] w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <h3 className="inventory-management__subtitle font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
            <ClipboardEdit className="w-4 h-4" /> RECORD WASTAGE / SPILLAGE INCIDENT
          </h3>

          <form onSubmit={handleRecordWastage} className="record-wastage-form app-form app-form--record-wastage space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Select Material Item *</label>
                <StyledSelect
                  searchable
                  value={wastedItem}
                  onChange={setWastedItem}
                  placeholder="-- Choose Catalog Item --"
                  options={catalogItems.map(item => ({ value: item.name, label: `${item.name} (${item.category})` }))}
                />
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Wasted / Spilled Quantity *</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    required
                    min="0.1"
                    step="any"
                    value={wastedQty}
                    onChange={e => setWastedQty(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="wastage-qty-input w-full font-bold"
                  />
                  <StyledSelect
                    className="w-28 shrink-0"
                    value={wastedUnit}
                    onChange={setWastedUnit}
                    options={['Kg', 'Gm', 'Ltr', 'Ml', 'Pcs', 'Pack'].map(u => ({ value: u, label: u }))}
                  />
                </div>
              </div>

              <div>
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Reason for Loss *</label>
                <StyledSelect
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Input
                  label="Reported By"
                  type="text"
                  required
                  value={wastedReportedBy}
                  onChange={e => setWastedReportedBy(e.target.value)}
                />
              </div>

              <div>
                <Input
                  label="Incident Notes / Explanation"
                  type="text"
                  value={wastedNotes}
                  onChange={e => setWastedNotes(e.target.value)}
                  placeholder="e.g. Container dropped during morning prep..."
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="btn-log-wastage bg-amber-600 hover:bg-amber-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-2xs cursor-pointer transition-colors flex items-center gap-2"
              >
                <span>LOG WASTAGE INCIDENT</span>
              </button>
            </div>
          </form>
        </div>

        {/* Wastage Logs DataTable */}
        <div className="wastage-logs-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs overflow-hidden">
          <DataTable
            columns={[
              {
                name: 'Date',
                selector: (log: any) => log.date,
                sortable: true,
                width: '110px',
                cell: (log: any) => <span className="font-mono text-[11px] text-slate-500">{formatDateDDMMYYYY(log.date)}</span>,
              },
              {
                name: 'Item Name',
                selector: (log: any) => log.itemName,
                sortable: true,
                grow: 2,
                cell: (log: any) => <span className="font-bold text-slate-900 dark:text-white text-xs">{log.itemName}</span>,
              },
              {
                name: 'Wasted Qty',
                selector: (log: any) => log.wastedQty,
                sortable: true,
                width: '100px',
                cell: (log: any) => <span className="font-bold text-red-600 dark:text-red-400 text-xs">{log.wastedQty} {log.unit}</span>,
              },
              {
                name: 'Reason',
                selector: (log: any) => log.reason,
                sortable: true,
                width: '140px',
                cell: (log: any) => (
                  <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold text-[10px] px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">{log.reason}</span>
                ),
              },
              {
                name: 'Reported By',
                selector: (log: any) => log.reportedBy,
                sortable: true,
                width: '120px',
                cell: (log: any) => <span className="font-semibold text-xs">{log.reportedBy}</span>,
              },
              {
                name: 'Incident Notes',
                selector: (log: any) => log.notes || '',
                grow: 2,
                cell: (log: any) => <span className="text-slate-500 italic text-xs">{log.notes || '—'}</span>,
              },
            ]}
            data={wastageLogs}
            pagination
            paginationPerPage={10}
            paginationRowsPerPageOptions={[10, 25, 50]}
            highlightOnHover
            subHeader={
              <div className="w-full flex items-center justify-between py-2">
                <h3 className="inventory-management__subtitle font-bold text-slate-800 dark:text-white text-sm">Wastage & Spillage Audit History</h3>
                <span className="text-slate-400 font-bold text-xs">{wastageLogs.length} incidents</span>
              </div>
            }
            customStyles={{
              subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent', borderBottom: '1px solid #e2e8f0' } },
              headCells: { style: { fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', paddingLeft: '12px' } },
              cells: { style: { fontSize: '12px', color: '#334155', paddingLeft: '12px' } },
              rows: { style: { minHeight: '48px' } },
            }}
            noDataComponent={
              <div className="p-8 text-center text-slate-400 font-semibold text-xs">No wastage or spillage incidents recorded.</div>
            }
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'purchases') {
    const cashHandlers = staff.filter(u => u.isFinancialHandler);

    const handleSavePurchase = (e: React.FormEvent) => {
      e.preventDefault();
      if (!purItemName || !purQty || !purTotalPrice) {
        showToast('Please fill out all required purchase fields!', { type: 'warning' });
        return;
      }

      const qty = Number(purQty);
      const totalPrice = Number(purTotalPrice);
      const unitCost = qty > 0 ? Number((totalPrice / qty).toFixed(2)) : totalPrice;

      const newPur = {
        id: `pur-${Date.now().toString().slice(-4)}`,
        purchaseDate: purDate,
        itemName: purItemName,
        specification: purSpec || 'N/A',
        quantity: qty,
        unit: purUnit,
        totalPrice: totalPrice,
        unitCost: unitCost,
        recordedBy: purRecordedBy,
        vendorName: 'Unassigned Vendor',
        settlementStatus: 'Unpaid',
        settlementMethod: 'Farm Cash',
        paidByStaff: ''
      };

      setKitchenPurchases(prev => [newPur, ...prev]);
      createKitchenPurchaseDB(newPur);

      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} recorded kitchen purchase of ${qty} ${purUnit} of '${purItemName}' for ₹${totalPrice}`);
      }

      // Sync Master Catalog unit_cost and current_stock if recognized
      const matchedCat = catalogItems.find(i => i.name.toLowerCase() === purItemName.toLowerCase());
      if (matchedCat) {
        setCatalogItems(prev => prev.map(i => i.id === matchedCat.id ? { ...i, price: unitCost, packUnit: purUnit } : i));
      }

      showToast(`Saved purchase of ${purItemName} (₹${totalPrice}) & synced with Master Catalog!`, { type: 'success' });
      setPurItemName('');
      setPurQty('');
      setPurTotalPrice('');
    };

    const handleAssignVendor = (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedPurIds.length === 0) {
        showToast('Please select at least one purchase item using checkboxes in the log table below!', { type: 'warning' });
        return;
      }
      if (!selectedVendorToPay) {
        showToast('Please choose a vendor to assign!', { type: 'warning' });
        return;
      }

      setKitchenPurchases(prev => prev.map(p => selectedPurIds.includes(p.id) ? { ...p, vendorName: `Account: ${selectedVendorToPay}` } : p));
      bulkUpdateKitchenPurchasesDB({ ids: selectedPurIds, vendorName: `Account: ${selectedVendorToPay}` });
      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} assigned vendor '${selectedVendorToPay}' to kitchen purchases: ${selectedPurIds.join(', ')}`);
      }
      showToast(`Assigned vendor "${selectedVendorToPay}" to ${selectedPurIds.length} selected items.`, { type: 'success' });
    };

    const handleMarkSelectedPaid = (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedPurIds.length === 0) {
        showToast('Please select at least one purchase item using checkboxes in the log table below!', { type: 'warning' });
        return;
      }
      if (!selectedPaidByStaff) {
        showToast('Please select who paid (Step 2: Paid By)!', { type: 'warning' });
        return;
      }

      const totalCostSelected = kitchenPurchases
        .filter(p => selectedPurIds.includes(p.id))
        .reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);

      const farmCash = Number(settlementFarmCash || 0);
      const outOfPocket = Number(settlementOutOfPocket || 0);
      const totalSplit = farmCash + outOfPocket;

      if (totalSplit !== totalCostSelected) {
        showToast(`Split amounts (₹${farmCash} + ₹${outOfPocket} = ₹${totalSplit}) must equal total selected ₹${totalCostSelected}.`, { type: 'warning' });
        return;
      }

      const settlementMethod = outOfPocket > 0 ? (farmCash > 0 ? 'Split' : 'Paid Out of Pocket') : 'Farm Cash';

      setKitchenPurchases(prev => prev.map(p => selectedPurIds.includes(p.id) ? {
        ...p,
        settlementStatus: 'Paid',
        settlementMethod: settlementMethod,
        paidByStaff: selectedPaidByStaff
      } : p));

      bulkUpdateKitchenPurchasesDB({
        ids: selectedPurIds,
        markPaid: true,
        settlementMethod: settlementMethod,
        paidByStaff: selectedPaidByStaff,
        totalAmount: totalCostSelected
      });

      if (farmCash > 0) {
        addDrawerEntryToDB({
          staff_id: staff.find(s => s.name === selectedPaidByStaff || s.username === selectedPaidByStaff)?.id || currentUser?.id || '',
          staff_name: selectedPaidByStaff,
          type: 'handover',
          amount: farmCash,
          notes: `Drawer paid for kitchen purchases (${selectedPurIds.length} items)`,
        });
      }

      if (outOfPocket > 0) {
        const staffMember = staff.find(s => s.name === selectedPaidByStaff || s.username === selectedPaidByStaff);
        recordOutOfPocketCredit({
          staff_id: staffMember?.id || currentUser?.id || '',
          staff_name: selectedPaidByStaff,
          amount: outOfPocket,
          description: `Out-of-pocket for kitchen purchases (${selectedPurIds.length} items)`,
        });
      }

      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        const desc = farmCash > 0 && outOfPocket > 0
          ? `Farm Cash ₹${farmCash} + Out of Pocket ₹${outOfPocket} by ${selectedPaidByStaff}`
          : farmCash > 0 ? `Farm Cash ₹${farmCash}` : `Out of Pocket ₹${outOfPocket} by ${selectedPaidByStaff}`;
        onLogAudit(`${currentUserName} marked kitchen purchases [${selectedPurIds.join(', ')}] as Paid via ${desc} (total: ₹${totalCostSelected})`);
      }

      if (onDispatchTelegram) {
        const items = kitchenPurchases.filter(p => selectedPurIds.includes(p.id)).map(p => `• ${p.itemName} (${p.quantity} ${p.unit}) — ₹${Number(p.totalPrice).toLocaleString('en-IN')}`).join('\n');
        const msg = `<b>🧾 KITCHEN PURCHASE PAYMENT</b>\n━━━━━━━━━━━━━━━━\n👤 <b>Paid By:</b> ${selectedPaidByStaff}\n🏦 <b>Farm Cash:</b> ₹${farmCash.toLocaleString('en-IN')}\n👝 <b>Out of Pocket:</b> ₹${outOfPocket.toLocaleString('en-IN')}\n💰 <b>Total:</b> ₹${totalCostSelected.toLocaleString('en-IN')}\n\n<b>Items:</b>\n${items}\n━━━━━━━━━━━━━━━━`;
        onDispatchTelegram('Kitchen Purchase Payment', msg, 'finance');
      }

      showToast(`Marked ${selectedPurIds.length} purchases as Paid. ₹${farmCash} from Farm Cash, ₹${outOfPocket} Out of Pocket.`, { type: 'success' });
      setSelectedPurIds([]);
      setSettlementFarmCash('');
      setSettlementOutOfPocket('');
    };

    const handleDeletePurchase = (id: string, name: string) => {
      (window as any).showConfirm(`Are you sure you want to delete purchase record #${id} (${name})? This action will be etched into the immutable audit trail.`, () => {
        setKitchenPurchases(prev => prev.filter(p => p.id !== id));
        deleteKitchenPurchaseDB({ id, itemName: name, user: 'Tarpan (Admin)' });
        if (onLogAudit) {
          const currentUserName = currentUser?.name || 'Admin';
          onLogAudit(`${currentUserName} deleted kitchen purchase record #${id} for '${name}'`);
        }
        (window as any).showConfirm(`🗑️ Purchase record deleted and logged to immutable audit trail.`, () => {});
      });
    };

    return (
      <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200 inventory-management">
        {/* Top Form: RECORD KITCHEN PURCHASES & STOCK */}
        <div className="max-w-[550px] w-full bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <Search className="text-slate-400 w-4 h-4" />
            <h3 className="inventory-management__subtitle font-bold text-slate-900 dark:text-white text-[10px] uppercase tracking-wider">
              {t('record_kitchen_purchases_header', 'Record Kitchen Purchases & Stock')}
            </h3>
          </div>

          <form onSubmit={handleSavePurchase} className="app-form app-form--save-purchase space-y-4">
            <div>
              <Input
                label={t('purchase_date_label', 'Purchase Date')}
                type="date"
                required
                value={purDate}
                onChange={e => setPurDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch {} }}
                className="cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                {t('inventory_item_detail_label', 'Inventory Item Detail (Select from Master Materials Catalog)')}
              </label>
              <StyledSelect
                searchable
                value={purItemName}
                onChange={val => {
                  setPurItemName(val);
                  const matched = catalogItems.find(i => i.name === val);
                  if (matched) {
                    const specText = matched.packSize ? `${matched.packSize} ${matched.unitLabel || matched.packUnit}` : (matched.specification || 'N/A');
                    setPurSpec(specText);
                    const defaultQty = matched.packSize || 1;
                    setPurQty(defaultQty);
                    const defaultUnit = matched.unitLabel || matched.packUnit || 'Kg';
                    setPurUnit(defaultUnit);
                    const unitPrice = matched.price || matched.unit_cost || 0;
                    const calculatedTotal = unitPrice * defaultQty;
                    setPurTotalPrice(calculatedTotal > 0 ? Number(calculatedTotal.toFixed(2)) : '');
                  }
                }}
                placeholder="Select product from Master Catalog... (e.g., Amul Butter)"
                options={catalogItems.map(item => ({
                  value: item.name,
                  label: `${item.name} (${item.category}) - ₹${item.price}/${item.packUnit || item.unitLabel}`,
                }))}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Input
                  label={t('specification_label')}
                  type="text"
                  readOnly
                  value={purSpec}
                  placeholder={t('locked_from_catalog_placeholder')}
                  className="cursor-not-allowed"
                />
              </div>

              <div>
                <Input
                  label={t('quantity_volume_label')}
                  type="number"
                  required
                  step="any"
                  min="0.001"
                  value={purQty}
                  onChange={e => {
                    const qVal = e.target.value === '' ? '' : Number(e.target.value);
                    setPurQty(qVal);
                    // Recalculate price if item matched
                    const matched = catalogItems.find(i => i.name === purItemName);
                    if (matched && typeof qVal === 'number') {
                      const uPrice = matched.price || matched.unit_cost || 0;
                      setPurTotalPrice(Number((uPrice * qVal).toFixed(2)));
                    }
                  }}
                  placeholder="0.000"
                />
              </div>

              <div>
                <Input
                  label={t('unit_locked_label')}
                  type="text"
                  readOnly
                  value={purUnit}
                  placeholder="Locked from Master Catalog"
                  className="cursor-not-allowed font-bold"
                />
              </div>

              <div>
                <Input
                  label={t('total_price_label')}
                  type="number"
                  required
                  step="any"
                  value={purTotalPrice}
                  onChange={e => setPurTotalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="font-bold"
                />
              </div>
            </div>

            <div>
              <Input
                label={t('recorded_by_label')}
                type="text"
                readOnly
                value={purRecordedBy}
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full py-3 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-colors shadow-xs cursor-pointer tracking-wider"
              >
                {t('save_purchase_sync_button')}
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Card: RECENT KITCHEN PURCHASE LOG */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <h3 className="inventory-management__subtitle font-bold text-slate-900 dark:text-white text-[10px] uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-3">
            {t('recent_kitchen_purchase_log_header')}
          </h3>

          {/* Finance & Payroll Interceptor Bar */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            {/* Step 1: Assign Vendor */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-700 text-xs w-12">{t('vendor_to_pay_label')}</span>
              <StyledSelect
                className="max-w-xs w-full"
                value={selectedVendorToPay}
                onChange={setSelectedVendorToPay}
                placeholder={t('choose_vendor_placeholder')}
                options={dbVendors.filter(v => v.type === 'Vendor').map(v => ({ value: v.name, label: v.name }))}
              />
              <button
                onClick={handleAssignVendor}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Assign Vendor
              </button>
            </div>

            {/* Step 2: Settlement Engine */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 text-xs w-12">{t('paid_by_label')}</span>
              {currentUser && (currentUser.role === 'Admin' || currentUser.role === 'Super Admin') ? (
                <StyledSelect
                  className="max-w-xs w-full"
                  value={selectedPaidByStaff}
                  onChange={setSelectedPaidByStaff}
                  placeholder={t('choose_paid_by_placeholder')}
                  options={cashHandlers.map(u => ({
                    value: u.name,
                    label: `${u.name} (${u.role})`,
                  }))}
                />
              ) : (
                <Input
                  value={selectedPaidByStaff}
                  readOnly
                  className="max-w-xs w-full"
                />
              )}

              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                <Coins size={14} /> ₹{(kitchenPurchases.filter(p => selectedPurIds.includes(p.id)).reduce((s, p) => s + (Number(p.totalPrice) || 0), 0)).toLocaleString('en-IN')}
              </span>

              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600">
                  <Landmark size={14} className="text-slate-500" /> {t('cash_label')}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={settlementFarmCash}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setSettlementFarmCash(val);
                    const total = kitchenPurchases.filter(p => selectedPurIds.includes(p.id)).reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
                    if (typeof val === 'number') setSettlementOutOfPocket(Math.max(0, total - val));
                  }}
                  placeholder="0"
                  className="w-20 text-center"
                />
                <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600">
                  <Wallet size={14} className="text-slate-500" /> {t('pocket_label')}
                </span>
                <Input
                  type="number"
                  min="0"
                  value={settlementOutOfPocket}
                  onChange={e => {
                    const val = e.target.value === '' ? '' : Number(e.target.value);
                    setSettlementOutOfPocket(val);
                    const total = kitchenPurchases.filter(p => selectedPurIds.includes(p.id)).reduce((s, p) => s + (Number(p.totalPrice) || 0), 0);
                    if (typeof val === 'number') setSettlementFarmCash(Math.max(0, total - val));
                  }}
                  placeholder="0"
                  className="w-20 text-center"
                />
              </div>

<button
                 onClick={handleMarkSelectedPaid}
                 className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
               >
                 {t('mark_selected_paid_button')}
               </button>
            </div>
          </div>

          <DataTable
            columns={[
              {
                name: (
                  <input
                    type="checkbox"
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedPurIds(filteredKitchenPurchases.map(p => p.id));
                      } else {
                        setSelectedPurIds([]);
                      }
                    }}
                    checked={selectedPurIds.length > 0 && selectedPurIds.length === filteredKitchenPurchases.length}
                  />
                ),
                width: '48px',
                cell: (row: any) => (
                  <input
                    type="checkbox"
                    checked={selectedPurIds.includes(row.id)}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedPurIds([...selectedPurIds, row.id]);
                      } else {
                        setSelectedPurIds(selectedPurIds.filter((id: string) => id !== row.id));
                      }
                    }}
                  />
                ),
              },
              {
                name: t('date_column_header'),
                selector: (row: any) => row.purchaseDate,
                sortable: true,
                width: '110px',
                cell: (row: any) => <span className="font-mono text-slate-500">{row.purchaseDate}</span>,
              },
              {
                name: t('item_description_column_header'),
                selector: (row: any) => row.itemName,
                sortable: true,
                grow: 2,
                cell: (row: any) => (
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{row.itemName}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{row.vendorName || 'Account: Unassigned'}</p>
                  </div>
                ),
              },
              {
                name: t('qty_column_header'),
                selector: (row: any) => row.quantity,
                sortable: true,
                width: '80px',
                cell: (row: any) => <span className="font-semibold text-slate-700">{row.quantity} {row.unit}</span>,
              },
              {
                name: t('total_cost_column_header'),
                selector: (row: any) => row.totalPrice,
                sortable: true,
                width: '110px',
                right: true,
                cell: (row: any) => <span className="font-bold text-slate-900 dark:text-white">₹{Number(row.totalPrice).toFixed(2)}</span>,
              },
              {
                name: t('settlement_column_header'),
                selector: (row: any) => row.settlementStatus,
                sortable: true,
                width: '110px',
                center: true,
                cell: (row: any) => (
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${
                    row.settlementStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {row.settlementStatus || 'Unpaid'}
                  </span>
                ),
              },
              {
                name: t('action_column_header'),
                width: '100px',
                right: true,
                cell: (row: any) => (
                  <button
                    onClick={() => handleDeletePurchase(row.id, row.itemName)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    {t('delete_button')}
                  </button>
                ),
                ignoreRowClick: true,
                allowOverflow: true,
              },
            ]}
            data={filteredKitchenPurchases}
            subHeader={
              <div className="w-full flex items-center gap-2 py-2 px-1">
                <Input
                  type="text"
                  placeholder={t('search_by_item_vendor_placeholder')}
                  value={purSearch}
                  onChange={e => setPurSearch(e.target.value)}
                  className="w-full max-w-sm"
                />
              </div>
            }
            pagination
            paginationPerPage={25}
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
            highlightOnHover
            noDataComponent={
              <div className="p-6 text-center text-slate-400 font-semibold">{t('no_data_purchases_message')}</div>
            }
            customStyles={{
              subHeader: {
                style: {
                  padding: 0,
                  minHeight: 0,
                  backgroundColor: 'transparent',
                },
              },
              headCells: {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  paddingLeft: '12px',
                  paddingRight: '12px',
                },
              },
              cells: {
                style: {
                  fontSize: '13px',
                  color: '#334155',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingLeft: '12px',
                  paddingRight: '12px',
                },
              },
              headRow: {
                style: {
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                },
              },
              rows: {
                style: {
                  minHeight: '56px',
                  borderBottom: '1px solid #f1f5f9',
                },
              },
              pagination: {
                style: {
                  borderTop: '1px solid #e2e8f0',
                  fontSize: '12px',
                },
              },
            }}
          />
        </div>
      </div>
    );
  }

  if (activeTab === 'catalog') {
    return (
      <div className="stock-inventory-container space-y-4">
        {/* Header Title & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-slate-800 font-bold text-[10px] uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-700" /> {t('master_materials_catalog_header')}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCategoryManager(!showCategoryManager)}
              className="btn-manage-categories bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>{showCategoryManager ? t('hide_categories_button') : t('manage_categories_button')}</span>
            </button>
            <button
              onClick={handleCreateNewCatalogItem}
              className="btn-add-stock-item bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>+ {t('register_new_item_button')}</span>
            </button>
          </div>
        </div>

        {/* Category Manager Panel */}
        {showCategoryManager && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 space-y-3">
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
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-xs font-bold cursor-pointer"
              >
                {t('add_category_button')}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {catalogCategories.filter(c => c !== 'All').map(cat => {
                  const dbCat = dbCategories.find(c => c.name === cat);
                  return (
                    <div key={cat} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
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
                      <button onClick={() => handleRenameCategory(dbCat!.id)} className="text-green-600 hover:text-green-700 cursor-pointer p-1">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer p-1">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{cat}</span>
                      <button
                        onClick={async () => {
                          if (!dbCat) return;
                          const newVal = !dbCat.is_ingredient;
                          const ok = await toggleIngredientCategoryInDB(dbCat.id, newVal);
                          if (ok) {
                            setDbCategories((prev: any[]) => prev.map(c => c.id === dbCat.id ? { ...c, is_ingredient: newVal ? 1 : 0 } : c));
                          }
                        }}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${dbCat?.is_ingredient ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}
                        title={dbCat?.is_ingredient ? 'Used in recipes' : 'Not used in recipes'}
                      >
                        {dbCat?.is_ingredient ? t('ingredient_badge') : t('not_food_badge')}
                      </button>
                      <button
                        onClick={() => { setEditingCategoryId(dbCat?.id || 0); setEditingCategoryName(cat); }}
                        className="text-slate-400 hover:text-blue-600 text-xs cursor-pointer"
                        title={t('rename_tooltip')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(dbCat?.id || 0, cat)}
                        className="text-slate-400 hover:text-red-600 text-xs cursor-pointer"
                        title={t('delete_button')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
               );
            })}
            </div>
          </div>
        )}

        {/* Bulk Action Bar */}
        {selectedCatalogItemIds.length > 0 && (
          <div className="bulk-category-action-bar bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs animate-in fade-in slide-in-from-top-2 duration-250">
            <div className="flex items-center gap-2">
              <span className="bg-blue-600 text-white font-bold text-xs px-2.5 py-1 rounded-full shadow-3xs">
                {selectedCatalogItemIds.length} Selected
              </span>
              <span className="text-xs text-blue-700 font-semibold">
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
                className="btn-bulk-assign-category bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0"
              >
                {t('assign_category_button')}
              </button>
              <button
                onClick={() => setSelectedCatalogItemIds([])}
                className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-2 py-2 cursor-pointer transition-colors"
              >
                {t('clear_button')}
              </button>
            </div>
          </div>
        )}

        {/* Catalog DataTable */}
        <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <DataTable
            key={catalogTableKey}
            columns={[
              {
                name: t('image_column_header'),
                width: '170px',
                cell: (row: CatalogItem) => (
                  row.imagePath ? (
                    <img src={row.imagePath} alt={row.name} className="w-[150px] h-[50px] object-cover rounded border border-slate-200" />
                  ) : (
                    <div className="w-[150px] h-[50px] bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-slate-400 text-[10px] italic">{t('no_image_label')}</div>
                  )
                ),
                sortable: false,
              },
              {
                name: t('item_name_label'),
                selector: (row: CatalogItem) => row.name,
                sortable: true,
                grow: 2,
                cell: (row: CatalogItem) => <span className="font-bold text-slate-800">{row.name}</span>,
              },
              {
                name: t('category_label'),
                selector: (row: CatalogItem) => row.category,
                sortable: true,
                width: '140px',
                cell: (row: CatalogItem) => (
                  <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">{row.category}</span>
                ),
              },
              {
                name: t('pack_column_header'),
                selector: (row: CatalogItem) => `${row.packSize} ${row.packUnit}`,
                sortable: true,
                width: '120px',
                cell: (row: CatalogItem) => <span className="text-slate-600">{row.packSize} {row.packUnit}</span>,
              },
              {
                name: t('cost_column_header'),
                selector: (row: CatalogItem) => row.price,
                sortable: true,
                width: '90px',
                right: true,
                cell: (row: CatalogItem) => <span className="text-slate-600">₹{row.price.toFixed(2)}</span>,
              },
              {
                name: t('status_column_header'),
                selector: (row: CatalogItem) => row.is_verified ? 1 : 0,
                sortable: true,
                width: '100px',
                cell: (row: CatalogItem) => (
                  row.is_verified ? (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">{t('active_status_badge')}</span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{t('review_status_badge')}</span>
                  )
                ),
              },
              {
                name: 'Actions',
                width: '180px',
                cell: (row: CatalogItem) => (
                  <div className="flex items-center gap-2">
                    {!row.is_verified && (
                      <button onClick={() => handleApproveItem(row.id)} className="text-emerald-600 hover:text-emerald-700 font-medium text-xs cursor-pointer">
                        Approve
                      </button>
                    )}
                    <button onClick={() => handleEditCatalogItem(row)} className="inline-flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                      {t('edit_button')}
                    </button>
                    {(currentUser?.role === 'Super Admin' || currentUser?.role === 'Admin') && (
                      <button onClick={() => handleDeleteCatalogItem(row.id, row.name)} className="text-red-600 hover:text-red-700 font-medium text-xs cursor-pointer">
                  {t('delete_button')}
                      </button>
                    )}
                  </div>
                ),
                ignoreRowClick: true,
                allowOverflow: true,
              },
            ]}
            data={catalogItems.filter(item => {
              const matchesSearch = !catalogSearch.trim() || item.name.toLowerCase().includes(catalogSearch.toLowerCase()) || item.category.toLowerCase().includes(catalogSearch.toLowerCase());
              const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
              return matchesSearch && matchesCategory;
            })}
            subHeader={
              <div className="w-full flex flex-col gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500 font-medium shrink-0 text-xs">{t('filter_label')}</span>
                  {catalogCategories.map(cat => {
                    const count = catalogItems.filter(i => i.category === cat).length;
                    const isActive = selectedCategory === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder={t('search_by_name_category_placeholder')}
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full max-w-sm"
                  />
                </div>
              </div>
            }
            pagination
            paginationPerPage={25}
            paginationRowsPerPageOptions={[10, 25, 50, 100]}
            highlightOnHover
            pointerOnHover
            selectableRows
            selectableRowsHighlight
            onSelectedRowsChange={({ selectedRows }) => {
              setSelectedCatalogItemIds(selectedRows.map((r: CatalogItem) => r.id));
            }}
            noDataComponent={
              <div className="p-8 text-center text-slate-400 text-sm">{t('no_catalog_items_search_message')}</div>
            }
            defaultSortFieldId={3}
            defaultSortAsc={true}
            customStyles={{
              subHeader: {
                style: {
                  padding: 0,
                  minHeight: 0,
                  backgroundColor: 'transparent',
                },
              },
              headCells: {
                style: {
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                  paddingLeft: '16px',
                  paddingRight: '16px',
                },
              },
              cells: {
                style: {
                  fontSize: '13px',
                  color: '#334155',
                  paddingTop: '12px',
                  paddingBottom: '12px',
                  paddingLeft: '16px',
                  paddingRight: '16px',
                },
              },
              rows: {
                style: {
                  minHeight: '56px',
                  borderBottom: '1px solid #f1f5f9',
                },
                highlightOnHoverStyle: {
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                },
              },
              headRow: {
                style: {
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #e2e8f0',
                },
              },
              pagination: {
                style: {
                  borderTop: '1px solid #e2e8f0',
                  fontSize: '12px',
                },
              },
            }}
          />
        </div>

        {/* Add/Edit Modal */}
        {isCatalogModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
                <h3 className="inventory-management__subtitle font-bold text-slate-800 dark:text-white">
                  {editingCatalogItem ? t('edit_catalog_item_heading') : t('register_new_material_heading')}
                </h3>
                <button onClick={() => setIsCatalogModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCatalogItem} className="app-form app-form--save-catalog-item p-4 space-y-4 text-xs">
                <div>
                  <Input label={t('item_name_label')} type="text" required value={catItemName} onChange={e => setCatItemName(e.target.value)} placeholder="e.g. Tomato Puree" />
                </div>

                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_label')}</label>
                  <StyledSelect
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
                      <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('unit_label')}</label>
                      <StyledSelect
                        value={catUnit}
                        onChange={setCatUnit}
                        options={['Kg', 'Gms', 'Liter', 'Ml', 'Packets', 'Pc', 'Box', 'Dozen'].map(u => ({ value: u, label: u }))}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('upload_image_label')}</label>
                  <Input type="file" accept="image/*" onChange={handleImageUpload} className="w-full p-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg text-slate-500 dark:text-slate-400" />
                  {catImagePath && (
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">{t('preview_label')}</p>
                      <img src={catImagePath} alt="Preview" className="w-[150px] h-[50px] object-cover border border-slate-200 dark:border-slate-700 rounded shadow-xs" />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer">
                    {t('save_commit_updates_button')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (activeTab === 'fulfill') {
    return (
      <div className="space-y-4">
        {/* Header Title & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-slate-800 font-bold text-[10px] uppercase tracking-wider">
            {t('stock_request_log_header')}
          </div>
          
           <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFulfillRangeOpen(true)}
              className="border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 shadow-xs hover:border-slate-400 dark:hover:border-slate-500 transition-colors cursor-pointer"
            >
              <span className="inline-flex items-center gap-1">{formatDateDDMMYYYY(fulfillFromDraft)} <ArrowRight className="w-3 h-3" /> {formatDateDDMMYYYY(fulfillToDraft)}</span>
            </button>
            <button onClick={handleFilterFulfill} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs px-4 py-1.5 rounded-md shadow-2xs cursor-pointer transition-all active:scale-95">
{t('enter_button')}
            </button>
          </div>
        </div>

        {fulfillRangeOpen && (
          <DateRangePicker
            isOpen={fulfillRangeOpen}
            onClose={() => setFulfillRangeOpen(false)}
            checkinDate={fulfillFromDraft}
            checkoutDate={fulfillToDraft}
            onCheckinChange={setFulfillFromDraft}
            onCheckoutChange={setFulfillToDraft}
            heading={t('stock_request_log_header')}
            description={t('fulfill_stock_range_description', 'Pick a from/to range to filter requisitions below')}
            fromLabel={t('from_label')}
            toLabel={t('to_label')}
          />
        )}

         {/* Table */}
         <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
             <DataTable
                columns={[
                  {
                    name: t('requested_at_column_header'),
                    selector: (row: any) => row.date,
                   sortable: true,
                   grow: 1,
                   cell: (row: any) => <span className="text-xs font-semibold text-slate-500">{formatDateTimeDDMMYYYY(row.date)}</span>,
                 },
                  {
                    name: t('material_selections_summary_column_header'),
                    selector: (row: any) => Array.isArray(row.items) ? row.items.filter((i: string) => Boolean(i && i.trim())).join(', ') : '',
                   sortable: true,
                   grow: 2,
                   cell: (row: any) => (
                     <span className="text-xs font-semibold text-slate-700">
                       {Array.isArray(row.items) && row.items.filter((i: string) => Boolean(i && i.trim())).length > 0
                         ? row.items.filter((i: string) => Boolean(i && i.trim())).join(', ')
                         : row.status === 'FULFILLED' || row.status === 'PARTIALLY FULFILLED'
                           ? <span className="italic text-slate-400 font-normal">Fulfilled — no item details recorded</span>
                           : <span className="italic text-slate-400 font-normal">No items</span>
                       }
                     </span>
                   ),
                 },
                  {
                    name: t('status_column_header'),
                    selector: (row: any) => row.status,
                   sortable: true,
                   center: true,
                   cell: (row: any) => (
                     <span className={`font-bold text-[10px] px-2 py-1 rounded-md ${
                       row.status === 'PENDING'
                         ? 'bg-amber-100 text-amber-700'
                         : row.status === 'FULFILLED'
                           ? 'bg-emerald-100 text-emerald-700'
                           : 'bg-slate-100 text-slate-700'
                     }`}>
                       {row.status}
                     </span>
                   ),
                 },
                  {
                    name: t('actions_column_header'),
                    center: true,
                     cell: (row: any) => (
                     <div className="flex items-center justify-center gap-1.5">
<button onClick={() => handleEditFulfill(row)} className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-2 rounded shadow-2xs cursor-pointer flex items-center gap-1 min-h-[36px]">
                          <span className="opacity-80">-</span> {t('edit_button')}
                        </button>
                       {row.status === 'PENDING' && (
<button onClick={() => handleQuickComplete(row)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-2 rounded shadow-2xs cursor-pointer flex items-center gap-1 min-h-[36px]">
                            <Check className="w-3.5 h-3.5 opacity-80" /> {t('complete_button')}
                          </button>
                       )}
                     </div>
                   ),
                 },
               ]}
               data={filteredFulfillSheets.filter((row) => {
                 if (!fulfillSearch.trim()) return true;
                 const term = fulfillSearch.toLowerCase();
                 const itemsStr = Array.isArray(row.items) ? row.items.join(' ').toLowerCase() : '';
                 return row.date.toLowerCase().includes(term) || row.status.toLowerCase().includes(term) || itemsStr.includes(term);
               })}
                subHeader={
                  <div className="w-full flex items-center gap-2 py-2">
                    <Input
                      type="text"
                      placeholder={t('search_by_date_status_material_placeholder')}
                      value={fulfillSearch}
                      onChange={(e) => setFulfillSearch(e.target.value)}
                      className="w-full max-w-sm"
                    />
                 </div>
               }
               pagination
               paginationPerPage={10}
               paginationRowsPerPageOptions={[10, 15, 25, 50]}
               highlightOnHover
               pointerOnHover
               dense
                noDataComponent={
                  <div className="p-8 text-center text-slate-400 text-sm">{t('no_stock_request_sheets_message')}</div>
                }
                customStyles={{
                  subHeader: {
                    style: {
                      padding: 0,
                      minHeight: 0,
                      backgroundColor: 'transparent',
                    },
                  },
                  headCells: {
                    style: {
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#94a3b8',
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      paddingLeft: '12px',
                    },
                  },
                  cells: {
                    style: {
                      paddingTop: '12px',
                      paddingBottom: '12px',
                      paddingLeft: '12px',
                    },
                  },
                  rows: {
                    style: {
                      minHeight: '48px',
                      borderBottomStyle: 'solid',
                      borderBottomWidth: '1px',
                      borderBottomColor: '#f1f5f9',
                    },
                  },
                }}
             />
           </div>

        {/* Fulfill Edit Modal */}
        {selectedFulfillSheet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="inventory-management__subtitle font-bold text-slate-700 text-sm tracking-wide uppercase">
                  {t('modify_stock_request_header')}
                </h3>
                <button onClick={() => setSelectedFulfillSheet(null)} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="pt-2">
                  <h4 className="inventory-management__caption text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-4">{t('costing_delivery_manifest_header')}</h4>
                  
                  <div className="space-y-5">
                    {selectedFulfillSheet.items.map((itemStr: string, idx: number) => {
                      const namePart = itemStr.split(' (x')[0];
                      const data = fulfillData[namePart] || { qty: 0, cost: 0, size: 1, unit: 'Kg' };
                      
                      return (
                        <div key={idx} className="space-y-2">
                          <h5 className="inventory-management__label font-bold text-slate-800 text-sm">{namePart}</h5>
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('delivered_qty_label')}</label>
                              <Input 
                                type="number" 
                                value={data.qty}
                                onChange={(e) => updateFulfillData(namePart, 'qty', parseInt(e.target.value) || 0)}
                                className="w-full text-center"
                              />
                            </div>
                            <div>
                              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('cost_price_label')}</label>
                              <Input 
                                type="number" 
                                value={data.cost}
                                onChange={(e) => updateFulfillData(namePart, 'cost', parseInt(e.target.value) || 0)}
                                className="w-full text-center"
                              />
                            </div>
                            <div>
                              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('size_label')}</label>
                              <Input 
                                type="number" 
                                value={data.size}
                                onChange={(e) => updateFulfillData(namePart, 'size', parseInt(e.target.value) || 1)}
                                className="w-full text-center"
                              />
                            </div>
                            <div>
                              <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('unit_format_label')}</label>
                              <StyledSelect
                                value={data.unit}
                                onChange={(val) => updateFulfillData(namePart, 'unit', val)}
                                options={['Kg', 'Gm', 'Ltr', 'Ml', 'Pack', 'Pcs', 'Box'].map(u => ({ value: u, label: u }))}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button onClick={() => setSelectedFulfillSheet(null)} className="px-6 py-2 text-sm font-bold text-white bg-slate-500 rounded-lg hover:bg-slate-600 transition-colors shadow-xs cursor-pointer">
                  {t('cancel_button')}
                </button>
                <button onClick={handleSaveFulfillQuantities} className="px-6 py-2 text-sm font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors shadow-xs cursor-pointer">
                  {t('save_commit_updates_button')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  if (activeTab === 'requisitions') {
    const filteredCatalog = stockCatalog.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(reqSearch.toLowerCase().trim());
      const matchesCategory = reqCategory === 'All Items' || item.category === reqCategory;
      return matchesSearch && matchesCategory;
    });

    const categories = [
      'All Items',
      ...catalogCategories.filter(c => c !== 'All')
    ];

    const totalReqCount = reqBasket.reduce((sum, b) => sum + b.qty, 0);
    const totalReqSum = reqBasket.reduce((sum, b) => sum + ((b.rate || 0) * b.qty), 0);
    const visibleReqDrawerItems = isReqCartDrawerExpanded ? [...reqBasket].reverse() : [...reqBasket].slice(-3).reverse();

    return (
      <div className="stock-requisitions-container space-y-4 pb-48 lg:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
          {/* Left Side (Desktop: 3 columns, Mobile: 1 column full width) */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 shadow-2xs p-3.5 sm:p-4 space-y-3.5">
            {/* Sticky Search & Category Pills Bar */}
            <div className="bg-white pt-2 pb-3 space-y-3 -mx-1 px-1 sm:-mx-4 sm:px-4 border-b border-slate-100 shadow-2xs rounded-t-xl">
              {/* Quick Search Bar */}
              <div className="relative">
                <Input
                  type="text"
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  placeholder={t('quick_search_catalog_placeholder')}
                  leftIcon={<Search className="w-4 h-4 text-slate-400" />}
                  className="pr-9"
                />
                {reqSearch && (
                  <button
                    onClick={() => setReqSearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Category Pills Bar (Horizontal Scrollable) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
                {categories.map((cat) => {
                  const isSelected = reqCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setReqCategory(cat)}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Category Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="inventory-management__subtitle font-bold text-slate-700 text-xs tracking-wider uppercase">
                {reqCategory === 'All Items' ? t('all_stock_catalog_items_header') : reqCategory.toUpperCase()}
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold">
                {filteredCatalog.length} items
              </span>
            </div>

            {/* Stock Items Grid with Row Items (Mobile: 1 col, Sm: 2 cols, Lg: 3 cols) */}
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-bold text-xs">{t('no_catalog_items_found_message')} "{reqSearch}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filteredCatalog.map((item) => {
                  const isRecentlyAdded = recentlyAddedReqId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`bg-white rounded-xl border p-2 flex items-center justify-between gap-2.5 transition-all ${
                        isRecentlyAdded
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                          : 'border-slate-200/90 hover:border-cyan-400 hover:shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {/* Item Icon Thumbnail */}
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-500 font-bold text-[10px]">
                          <Boxes className="w-5 h-5 text-cyan-600" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="inventory-management__caption font-bold text-slate-800 text-xs truncate">
                            {item.name}
                          </h4>
                          <p className="text-slate-500 font-bold text-[11px] mt-0.5">
                            Per {item.unit} • ₹{item.rate.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddToReqBasket(item)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 flex items-center gap-1 cursor-pointer min-h-[36px] ${
                          isRecentlyAdded
                            ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                            : 'bg-slate-50 hover:bg-cyan-50 text-slate-800 hover:text-cyan-700 border border-slate-300 hover:border-cyan-400 active:scale-90 shadow-2xs'
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
            <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex-col justify-between space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="inventory-management__subtitle font-bold text-slate-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                  <span>{t('supply_basket_header')}</span>
                </h3>
                <span className="text-[10px] font-bold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full border border-cyan-200">
                  {totalReqCount} Items
                </span>
              </div>

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
                        <h4 className="inventory-management__caption font-bold text-slate-900 text-xs truncate">
                          {b.name} <span className="text-slate-500 font-normal">({b.unit})</span>
                        </h4>
                      </div>
                       <div className="flex items-center border border-slate-300 rounded-lg bg-white shrink-0 overflow-hidden">
                         <button
                           onClick={() =>
                             setReqBasket((prev) =>
                               prev
                                 .map((item) => (item.id === b.id ? { ...item, qty: item.qty - 1 } : item))
                                 .filter((item) => item.qty > 0)
                             )
                           }
                           className="w-8 h-8 hover:bg-slate-100 font-bold text-slate-700 flex items-center justify-center cursor-pointer active:scale-90"
                         >
                           -
                         </button>
                         <span className="w-6 text-center font-bold text-slate-900 text-xs">{b.qty}</span>
                         <button
                           onClick={() =>
                             setReqBasket((prev) =>
                               prev.map((item) => (item.id === b.id ? { ...item, qty: item.qty + 1 } : item))
                             )
                           }
                           className="w-8 h-8 hover:bg-slate-100 font-bold text-slate-700 flex items-center justify-center cursor-pointer active:scale-90"
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
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 resize-none"
                />
              </div>

              {/* Dispatch Requirement Button */}
              <button
                onClick={handleDispatchReq}
                disabled={reqBasket.length === 0 && !specialRequestText.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98]"
              >
                <span>{t('dispatch_requirement_button')}</span>
              </button>
            </div>

          </div>
        </div>

        {/* MOBILE ONLY Light-Theme Bottom Cart Drawer (lg:hidden, Collapsible & 50vh Expandable) */}
        {(reqBasket.length > 0 || specialRequestText.trim()) && (
          <div
            className={`fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white text-slate-900 rounded-t-2xl shadow-2xl border-t border-slate-200 transition-all duration-300 flex flex-col ${
              isReqCartDrawerExpanded ? 'h-[50vh]' : 'max-h-[260px]'
            }`}
          >
            {/* Header Bar */}
            <div className="p-3 bg-slate-50 rounded-t-2xl border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-cyan-100 text-cyan-800 border border-cyan-200 font-bold text-xs px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1">
                  <ShoppingCart className="w-3.5 h-3.5 text-cyan-700" />
                  <span>{totalReqCount} Items</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">TOTAL: </span>
                  <span className="text-emerald-600 font-bold text-sm">₹{totalReqSum.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => setIsReqCartDrawerExpanded(!isReqCartDrawerExpanded)}
                className="bg-white hover:bg-slate-100 text-cyan-700 font-bold text-xs px-3 py-1.5 rounded-xl border border-cyan-300 shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
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
              {!isReqCartDrawerExpanded && reqBasket.length > 3 && (
                <p className="text-[10px] text-cyan-700 font-bold tracking-wide uppercase text-center pb-1">
                  {t('showing_last_3_items_prefix')} {reqBasket.length} {t('showing_last_3_items_suffix')}
                </p>
              )}
              {visibleReqDrawerItems.map((b) => (
                <div
                  key={b.id}
                  className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-900"
                >
                  <div className="flex-1 pr-1 truncate">
                    <h4 className="inventory-management__caption font-bold text-slate-900 text-xs truncate">
                      {b.name} <span className="text-slate-500 font-normal">({b.unit})</span>
                    </h4>
                  </div>

                  <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden shrink-0">
                    <button
                      onClick={() =>
                        setReqBasket((prev) =>
                          prev
                            .map((item) => (item.id === b.id ? { ...item, qty: item.qty - 1 } : item))
                            .filter((item) => item.qty > 0)
                        )
                      }
                      className="w-7 h-7 hover:bg-slate-100 font-bold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-bold text-slate-900 text-xs">
                      {b.qty}
                    </span>
                    <button
                      onClick={() =>
                        setReqBasket((prev) =>
                          prev.map((item) => (item.id === b.id ? { ...item, qty: item.qty + 1 } : item))
                        )
                      }
                      className="w-7 h-7 hover:bg-slate-100 font-bold text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Footer */}
            <div className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
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
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[40px]"
              >
                <span>{t('dispatch_requirement_button')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const stockLogColumns = [
    {
      name: t('image_column_header'),
      width: '70px',
      cell: (item: InventoryItem) => (
        <div className="relative w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
          {item.imagePath ? (
            <img src={item.imagePath} alt={item.name} className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-4 h-4 text-slate-400" />
          )}
        </div>
      ),
    },
    {
      name: t('item_name_label'),
      selector: (item: InventoryItem) => item.name,
      sortable: true,
      grow: 1,
      cell: (item: InventoryItem) => (
        <span className="font-bold text-slate-900 dark:text-white text-sm">{item.name}</span>
      ),
    },
    {
      name: t('category_label'),
      selector: (item: InventoryItem) => item.category,
      sortable: true,
      cell: (item: InventoryItem) => (
        <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded font-medium text-xs">
          {item.category}
        </span>
      ),
    },
    {
      name: t('current_stock_column_header'),
      selector: (item: InventoryItem) => item.currentStock,
      sortable: true,
      width: '130px',
      cell: (item: InventoryItem) => (
        <span className="font-bold text-slate-800 dark:text-slate-200">{item.currentStock} {item.unit}</span>
      ),
    },
    {
      name: t('min_threshold_column_header'),
      selector: (item: InventoryItem) => item.minThreshold,
      sortable: true,
      width: '130px',
      cell: (item: InventoryItem) => (
        <span className="text-slate-500">{item.minThreshold} {item.unit}</span>
      ),
    },
    {
      name: t('status_column_header'),
      width: '160px',
      cell: (item: InventoryItem) => {
        const isLow = item.currentStock <= item.minThreshold;
        return isLow ? (
          <span className="bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <AlertTriangle className="w-3 h-3 text-red-600" />
            {t('low_stock_badge').toUpperCase()}
          </span>
        ) : (
          <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            {t('in_stock_badge')}
          </span>
        );
      },
    },
    {
      name: t('tracking_column_header'),
      width: '180px',
      cell: () => (
        <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-600 font-bold px-2.5 py-1 rounded-full inline-block">
          {t('system_tracked_badge')}
        </span>
      ),
    },
  ];

  const stockLogSubHeader = (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
        <Input
          type="text"
          value={stockLogSearch}
          onChange={(e) => setStockLogSearch(e.target.value)}
          placeholder={t('search_inventory_placeholder')}
          className="pl-9"
        />
      </div>
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs cursor-pointer transition-colors"
      >
        <Plus className="w-3.5 h-3.5" /> {t('add_new_item_button')}
      </button>
    </div>
  );

  return (
    <div className="stock-inventory-container space-y-6">
      <PageHeader title={t('inventory_catalog_heading')} subtitle={t('inventory_catalog_subtitle')} />

      {/* Desktop DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={stockLogColumns}
          data={filteredInventory}
          pagination
          paginationPerPage={15}
          paginationRowsPerPageOptions={[15, 30, 50, 100]}
          subHeader={stockLogSubHeader}
          customStyles={{
            subHeader: { style: { padding: 0, minHeight: 0, backgroundColor: 'transparent' } },
            headRow: { style: { backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' } },
            headCells: { style: { fontSize: '11px', fontWeight: 600, color: '#64748b', paddingLeft: '12px' } },
            cells: { style: { fontSize: '13px', color: '#334155', padding: '12px' } },
            rows: { style: { minHeight: '52px' } },
          }}
          noDataComponent={
            <div className="text-center p-8 text-slate-400 font-semibold text-xs">
              {inventory.length === 0 ? 'No inventory items found.' : 'No items match your search.'}
            </div>
          }
        />
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="divide-y divide-slate-100 p-3 space-y-3">
          {filteredInventory.map((item) => {
            const isLow = item.currentStock <= item.minThreshold;
            return (
              <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {item.category}
                    </span>
                    <h4 className="inventory-management__caption font-bold text-slate-900 text-sm">{item.name}</h4>
                  </div>
                  {isLow ? (
                    <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-600" /> {t('low_stock_badge')}
                    </span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> {t('in_stock_badge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">{t('current_stock_column_header')}</span>
                    <span className="font-bold text-slate-900 text-sm">{item.currentStock} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">{t('min_threshold_column_header')}</span>
                    <span className="font-semibold text-slate-600">{item.minThreshold} {item.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {filteredInventory.length === 0 && (
            <div className="text-center p-6 text-slate-400 font-semibold text-xs">{t('no_inventory_items_message')}</div>
          )}
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="inventory-management__subtitle font-bold text-slate-800 text-sm">{t('add_new_item_button')}</h3>
              <button onClick={() => setIsAddModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="app-form app-form--create-item space-y-3">
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
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('category_label')}</label>
                <StyledSelect
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
                  <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('unit_label')}</label>
                  <StyledSelect
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
                <label className="app-label block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">{t('item_image_upload_label')}</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-2 rounded-xl cursor-pointer flex items-center gap-1.5 shadow-2xs text-xs shrink-0 transition-all">
                      <Upload className="w-4 h-4" />
                      <span>{t('upload_image_button')}</span>
                      <Input
                        type="file"
                        accept="image/*"
                        className="hidden"
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
                      />
                    </label>

                    <Input
                      type="text"
                      value={imagePath}
                      onChange={(e) => setImagePath(e.target.value)}
                      placeholder={t('or_enter_image_url_placeholder')}
                      className="flex-1 font-mono text-[11px]"
                    />
                  </div>

                  {/* Image Preview Box */}
                  {imagePath && (
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-300 bg-slate-50">
                      <img
                        src={imagePath}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setImagePath('')}
                        className="absolute top-1 right-1 bg-slate-900/80 text-white p-0.5 rounded-full hover:bg-slate-900"
                        title="Remove Image"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg"
                >
                  {t('cancel_button')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  {t('save_item_button')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
