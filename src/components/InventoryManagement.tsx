import React, { useState, useEffect, useMemo } from 'react';
import { Boxes, AlertTriangle, Plus, CheckCircle2, ArrowUpDown, X, Upload, Image as ImageIcon, Search, ShoppingCart, Settings } from 'lucide-react';
import { InventoryItem, StaffMember } from '../types';
import { initialCatalogItems, CatalogItem } from '../data/initialData';
import { fetchStockRequestsFromDB, createStockRequestInDB, updateStockRequestStatusInDB, fetchWastageLogsFromDB, createWastageLogDB, fetchKitchenPurchasesFromDB, createKitchenPurchaseDB, bulkUpdateKitchenPurchasesDB, deleteKitchenPurchaseDB, fetchStaffUsersFromDB, fetchMaterialCategoriesFromDB, updateMaterialCategoryInDB, deleteMaterialCategoryFromDB, addMaterialCategoryToDB, fetchPayeesFromDB, addCatalogItemDB, updateCatalogItemDB, deleteCatalogItemDB, bulkUpdateCatalogCategoryDB, resolveTelegramTemplate, uploadImageDB } from '../services/api';
import { DataTableWrapper } from './DataTable';

interface InventoryManagementProps {
  inventory: InventoryItem[];
  staff: StaffMember[];
  currentUser?: StaffMember | null;
  onUpdateStock: (itemId: string, newStock: number) => void;
  onAddInventoryItem: (item: InventoryItem) => void;
  onUpdateItemImage?: (itemId: string, imagePath: string) => void;
  activeMenuItemKey?: string;
  onDispatchTelegram?: (eventType: string, message: string, channelFilter?: 'all' | 'kitchen' | 'finance' | 'admin') => void;
  onLogAudit?: (actionText: string, extra?: { status?: string; module?: string; user?: string }) => void;
}

export const InventoryManagement: React.FC<InventoryManagementProps> = ({
  inventory,
  staff,
  currentUser,
  onUpdateStock,
  onAddInventoryItem,
  onUpdateItemImage,
  activeMenuItemKey,
  onDispatchTelegram,
  onLogAudit,
}) => {
  const [activeTab, setActiveTab] = React.useState<'stock_log' | 'deficit' | 'requisitions' | 'purchases' | 'fulfill' | 'catalog'>('stock_log');
  const [catalogItems, setCatalogItems] = useState(initialCatalogItems);
  const [selectedCatalogItemIds, setSelectedCatalogItemIds] = useState<number[]>([]);
  const [bulkTargetCategory, setBulkTargetCategory] = useState<string>('');

  // Sync catalogItems with live inventory data from database while retaining all 177 master catalog items
  useEffect(() => {
    if (inventory && inventory.length > 0) {
      const catalogMap = new Map<number, CatalogItem>();
      
      // 1. Seed map with all initialCatalogItems (177 items) keyed by numeric ID
      initialCatalogItems.forEach((item: CatalogItem) => {
        catalogMap.set(item.id, { ...item });
      });

      // 2. Overlay / Merge live DB inventory items by numeric ID or matching name
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
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [editingCatalogItem, setEditingCatalogItem] = useState<CatalogItem | null>(null);
  const [catItemName, setCatItemName] = useState('');
  const [catCategory, setCatCategory] = useState('');
  const [catPrice, setCatPrice] = useState(0);
  const [catPackSize, setCatPackSize] = useState(1);
  const [catUnit, setCatUnit] = useState('Kg');
  const [catImagePath, setCatImagePath] = useState('');
  const [liveCashHandlers, setLiveCashHandlers] = useState<any[]>(staff.filter(u => u.isFinancialHandler));

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
  const [dbCategories, setDbCategories] = useState<{ id: number; name: string }[]>([]);

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

  // Sync recorded-by with logged-in user
  useEffect(() => {
    if (currentUser?.name) {
      setPurRecordedBy(currentUser.name);
    }
  }, [currentUser]);

  // Vendors from database (payee_entities)
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

  const handleToggleSelectItem = (id: number) => {
    setSelectedCatalogItemIds((prev: number[]) =>
      prev.includes(id) ? prev.filter((x: number) => x !== id) : [...prev, id]
    );
  };

  const isAllInCategorySelected = (items: CatalogItem[]) => {
    if (items.length === 0) return false;
    return items.every((item: CatalogItem) => selectedCatalogItemIds.includes(item.id));
  };

  const handleSelectAllInCategory = (items: CatalogItem[], checked: boolean) => {
    const itemIds = items.map((item: CatalogItem) => item.id);
    if (checked) {
      setSelectedCatalogItemIds((prev: number[]) => Array.from(new Set([...prev, ...itemIds])));
    } else {
      setSelectedCatalogItemIds((prev: number[]) => prev.filter((id: number) => !itemIds.includes(id)));
    }
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
      alert(`✅ Successfully assigned selected items to category "${targetCategory}"!`);
    } else {
      alert('⚠️ Failed to assign category. Please try again.');
    }
  };

  const filteredCatalogForDisplay = catalogItems.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(catalogSearch.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });
  const groupedCatalog = filteredCatalogForDisplay.reduce((acc, item) => {
    acc[item.category] = acc[item.category] || [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, CatalogItem[]>);

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
    if (!catItemName) return;
    
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
      alert('⚠️ Cost/Price is mandatory for all items being delivered!');
      return;
    }

    // Mock Transaction
    console.log("Saving delivery manifest:", fulfillData);
    
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
      onDispatchTelegram('Stock Fulfillment', tgMessage, 'kitchen');
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
    alert('✅ Transaction Complete:\n\n1. Variance Analyzed\n2. Shortfalls Logged\n3. Req Items Updated\n4. Master Catalog Synced\n5. Audit Log Written\n6. Telegram Alert Dispatched!');
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
    alert(`✅ Requisition Sheet #${targetSheetId} marked as FULFILLED and saved to database!`);
  };

  const [recentSheets, setRecentSheets] = useState<{ id: string; status: string; date: string; items: string[] }[]>([]);

  const fulfillFromRef = React.useRef<HTMLInputElement>(null);
  const fulfillToRef = React.useRef<HTMLInputElement>(null);
  const [fulfillFilterRange, setFulfillFilterRange] = useState<{ from: string; to: string } | null>(null);

  const handleFilterFulfill = () => {
    const from = fulfillFromRef.current?.value || '';
    const to = fulfillToRef.current?.value || '';
    setFulfillFilterRange({ from, to });
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

  const fulfillTableKey = useMemo(() => JSON.stringify(recentSheets), [recentSheets]);

  useEffect(() => {
    fetchStockRequestsFromDB().then((data) => {
      if (data && data.length > 0) {
        setRecentSheets(data);
      } else {
        setRecentSheets([
          {
            id: '1166',
            status: 'PENDING',
            date: '21 Jul 2026 - 10:21 PM',
            items: ['Green Pea (x1 Kg)', 'Hari Mirchi (x1 Kg)'],
          },
          {
            id: '1165',
            status: 'PENDING',
            date: '21 Jul 2026 - 09:05 PM',
            items: ['Black Pepper (x1 Pcs)', 'Basmati Rice (x1 Pc)'],
          },
          {
            id: '1164',
            status: 'PENDING',
            date: '21 Jul 2026 - 08:53 PM',
            items: ['Ajino Moto (x1 Gm)'],
          },
        ]);
      }
    });
  }, []);

  const stockCatalog = initialCatalogItems.map(item => ({
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
      alert('Supply basket is empty!');
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
      date: `${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
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
      onDispatchTelegram('Requisition', tgMessage, 'kitchen');
    }

    setReqBasket([]);
    setSpecialRequestText('');
    alert(`✅ Requisition Sheet #${newSheetId} dispatched successfully!`);
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
  const [purDate, setPurDate] = useState('2026-07-25');
  const [purItemName, setPurItemName] = useState('');
  const [purSpec, setPurSpec] = useState('N/A');
  const [purQty, setPurQty] = useState<number | ''>('');
  const [purUnit, setPurUnit] = useState('Kg');
  const [purTotalPrice, setPurTotalPrice] = useState<number | ''>('');
  const [purRecordedBy, setPurRecordedBy] = useState(currentUser?.name || 'System');
  const [purVendor, setPurVendor] = useState('');
  const [purSettlementStatus, setPurSettlementStatus] = useState('Paid');
  const [purSettlementMethod, setPurSettlementMethod] = useState('Paid using Farm Cash');
  const [purPaidByStaff, setPurPaidByStaff] = useState('Tarpan Patel');

  // Bulk Finance Interceptor state
  const [selectedPurIds, setSelectedPurIds] = useState<string[]>([]);
  const [selectedVendorToPay, setSelectedVendorToPay] = useState('');
  const [selectedPaidByStaff, setSelectedPaidByStaff] = useState('');
  const [settlementMethod, setSettlementMethod] = useState('Paid using Farm Cash (No Salary Impact)');

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

    alert(`⚠️ Recorded wastage incident: ${wastedQty} ${wastedUnit} of ${wastedItem}. Saved to database.`);
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
        {/* Title */}
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            ⚠️ Kitchen Wastage & Spillage Log
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Formally record spillage, spoilage, or kitchen damage with full accountability and audit trail.
          </p>
        </div>

        {/* Wastage Form */}
        <div className="record-wastage-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-5 space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm border-l-3 border-amber-500 pl-2.5 flex items-center gap-1.5">
            📝 RECORD WASTAGE / SPILLAGE INCIDENT
          </h3>

          <form onSubmit={handleRecordWastage} className="record-wastage-form space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Select Material Item *</label>
                <select
                  required
                  value={wastedItem}
                  onChange={e => setWastedItem(e.target.value)}
                  className="wastage-item-select w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                >
                  <option value="">-- Choose Catalog Item --</option>
                  {catalogItems.map(item => (
                    <option key={item.id} value={item.name}>{item.name} ({item.category})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Wasted / Spilled Quantity *</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min="0.1"
                    step="any"
                    value={wastedQty}
                    onChange={e => setWastedQty(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="wastage-qty-input w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  />
                  <select
                    value={wastedUnit}
                    onChange={e => setWastedUnit(e.target.value)}
                    className="wastage-unit-select p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="Kg">Kg</option>
                    <option value="Gm">Gm</option>
                    <option value="Ltr">Ltr</option>
                    <option value="Ml">Ml</option>
                    <option value="Pcs">Pcs</option>
                    <option value="Pack">Pack</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Reason for Loss *</label>
                <select
                  value={wastedReason}
                  onChange={e => setWastedReason(e.target.value)}
                  className="wastage-reason-select w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                >
                  <option value="Spillage / Leakage">💧 Spillage / Leakage</option>
                  <option value="Spoilage / Expiry">🥬 Spoilage / Expiry</option>
                  <option value="Cooking Wastage">🔥 Cooking Wastage</option>
                  <option value="Damaged Packaging">📦 Damaged Packaging</option>
                  <option value="Theft / Loss">🚨 Theft / Discrepancy</option>
                  <option value="Other">❓ Other Incident</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Reported By</label>
                <input
                  type="text"
                  required
                  value={wastedReportedBy}
                  onChange={e => setWastedReportedBy(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-bold mb-1">Incident Notes / Explanation</label>
                <input
                  type="text"
                  value={wastedNotes}
                  onChange={e => setWastedNotes(e.target.value)}
                  placeholder="e.g. Container dropped during morning prep..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
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

        {/* Wastage Logs Table */}
        <div className="wastage-logs-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs p-5 space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-700 pb-3 flex items-center justify-between">
            <h3 className="font-extrabold text-slate-800 dark:text-white text-sm">
              Wastage & Spillage Audit History
            </h3>
            <span className="font-mono text-slate-400 font-bold">{wastageLogs.length} incidents logged</span>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="datatable wastage-logs-table w-full text-left text-slate-700 dark:text-slate-300 border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 font-bold border-b border-slate-200 dark:border-slate-700 uppercase text-[10px]">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Item Name</th>
                  <th className="p-3">Wasted Quantity</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">Reported By</th>
                  <th className="p-3">Incident Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {wastageLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="p-3 font-mono text-slate-500">{log.date}</td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{log.itemName}</td>
                    <td className="p-3 font-bold text-red-600">{log.wastedQty} {log.unit}</td>
                    <td className="p-3">
                      <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold text-[10px] px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        {log.reason}
                      </span>
                    </td>
                    <td className="p-3 font-semibold">{log.reportedBy}</td>
                    <td className="p-3 text-slate-500 italic">{log.notes || '—'}</td>
                  </tr>
                ))}
                {wastageLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center p-6 text-slate-400 font-semibold">
                      No wastage or spillage incidents recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'purchases') {
    const cashHandlers = staff.filter(u => u.isFinancialHandler);

    const handleSavePurchase = (e: React.FormEvent) => {
      e.preventDefault();
      if (!purItemName || !purQty || !purTotalPrice) {
        alert('Please fill out all required purchase fields!');
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

      alert(`✅ Saved purchase of ${purItemName} (₹${totalPrice}) & synced with Master Catalog!`);
      setPurItemName('');
      setPurQty('');
      setPurTotalPrice('');
    };

    const handleAssignVendor = (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedPurIds.length === 0) {
        alert('Please select at least one purchase item using checkboxes in the log table below!');
        return;
      }
      if (!selectedVendorToPay) {
        alert('Please choose a vendor to assign!');
        return;
      }

      setKitchenPurchases(prev => prev.map(p => selectedPurIds.includes(p.id) ? { ...p, vendorName: `Account: ${selectedVendorToPay}` } : p));
      bulkUpdateKitchenPurchasesDB({ ids: selectedPurIds, vendorName: `Account: ${selectedVendorToPay}` });
      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        onLogAudit(`${currentUserName} assigned vendor '${selectedVendorToPay}' to kitchen purchases: ${selectedPurIds.join(', ')}`);
      }
      alert(`✅ Assigned vendor "${selectedVendorToPay}" to ${selectedPurIds.length} selected items.`);
    };

    const handleMarkSelectedPaid = (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedPurIds.length === 0) {
        alert('Please select at least one purchase item using checkboxes in the log table below!');
        return;
      }

      const isOutOfPocket = settlementMethod.includes('Out of Pocket');
      if (isOutOfPocket && !selectedPaidByStaff) {
        alert('Please select the Cash Handler staff member who paid out of pocket for reimbursement credit!');
        return;
      }

      const totalCostSelected = kitchenPurchases
        .filter(p => selectedPurIds.includes(p.id))
        .reduce((sum, p) => sum + (Number(p.totalPrice) || 0), 0);

      setKitchenPurchases(prev => prev.map(p => selectedPurIds.includes(p.id) ? {
        ...p,
        settlementStatus: 'Paid',
        settlementMethod: isOutOfPocket ? 'Paid Out of Pocket' : 'Farm Cash',
        paidByStaff: isOutOfPocket ? selectedPaidByStaff : ''
      } : p));

      bulkUpdateKitchenPurchasesDB({
        ids: selectedPurIds,
        markPaid: true,
        settlementMethod: isOutOfPocket ? 'Paid Out of Pocket' : 'Farm Cash',
        paidByStaff: selectedPaidByStaff,
        totalAmount: totalCostSelected
      });

      if (onLogAudit) {
        const currentUserName = currentUser?.name || 'Admin';
        const method = isOutOfPocket ? `Paid Out of Pocket by ${selectedPaidByStaff}` : 'Farm Cash';
        onLogAudit(`${currentUserName} marked kitchen purchases [${selectedPurIds.join(', ')}] as Paid via ${method} (total: ₹${totalCostSelected})`);
      }

      if (isOutOfPocket) {
        alert(`✅ Marked selected purchases as PAID OUT OF POCKET by Cash Handler (${selectedPaidByStaff}). Added reimbursement credit of ₹${totalCostSelected} to staff salary advance ledger!`);
      } else {
        alert(`✅ Marked selected purchases as PAID using Farm Cash (₹${totalCostSelected}).`);
      }
      setSelectedPurIds([]);
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
      <div className="space-y-6 text-xs text-slate-800 dark:text-slate-200">
        {/* Top Form: RECORD KITCHEN PURCHASES & STOCK */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-3">
            <span className="text-slate-400 font-bold text-sm">🔍</span>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              RECORD KITCHEN PURCHASES & STOCK
            </h3>
          </div>

          <form onSubmit={handleSavePurchase} className="space-y-4">
            <div>
              <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">PURCHASE DATE</label>
              <input
                type="date"
                required
                value={purDate}
                onChange={e => setPurDate(e.target.value)}
                onClick={e => { try { e.currentTarget.showPicker(); } catch {} }}
                className="w-full p-2.5 text-xs font-semibold text-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-hidden focus:border-cyan-500 bg-white dark:bg-slate-900 cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">
                INVENTORY ITEM DETAIL (SELECT FROM MASTER MATERIALS CATALOG)
              </label>
              <select
                required
                value={purItemName}
                onChange={e => {
                  const val = e.target.value;
                  setPurItemName(val);
                  const matched = catalogItems.find(i => i.name === val);
                  if (matched) {
                    // 1. Auto-fill Specification (e.g. standard pack size/spec)
                    const specText = matched.packSize ? `${matched.packSize} ${matched.unitLabel || matched.packUnit}` : (matched.specification || 'N/A');
                    setPurSpec(specText);

                    // 2. Auto-fill Quantity / Volume
                    const defaultQty = matched.packSize || 1;
                    setPurQty(defaultQty);

                    // 3. Auto-fill Unit
                    const defaultUnit = matched.unitLabel || matched.packUnit || 'Kg';
                    setPurUnit(defaultUnit);

                    // 4. Auto-fill Total Price (₹) = unit price * quantity
                    const unitPrice = matched.price || matched.unit_cost || 0;
                    const calculatedTotal = unitPrice * defaultQty;
                    setPurTotalPrice(calculatedTotal > 0 ? Number(calculatedTotal.toFixed(2)) : '');
                  }
                }}
                className="w-full p-2.5 text-xs font-semibold text-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-hidden focus:border-cyan-500 bg-white dark:bg-slate-900"
              >
                <option value="">Select product from Master Catalog... (e.g., Amul Butter)</option>
                {catalogItems.map(item => (
                  <option key={item.id} value={item.name}>
                    {item.name} ({item.category}) - ₹{item.price}/{item.packUnit || item.unitLabel}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">SPECIFICATION (LOCKED TO CATALOG)</label>
                <input
                  type="text"
                  readOnly
                  value={purSpec}
                  placeholder="Locked from Master Catalog"
                  className="w-full p-2.5 text-xs font-semibold text-slate-500 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-900/80 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">QUANTITY / VOLUME</label>
                <input
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
                  className="w-full p-2.5 text-xs font-semibold text-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-hidden bg-white dark:bg-slate-900"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">UNIT (LOCKED TO CATALOG)</label>
                <input
                  type="text"
                  readOnly
                  value={purUnit}
                  placeholder="Locked from Master Catalog"
                  className="w-full p-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-100 dark:bg-slate-900/80 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">TOTAL PRICE (₹)</label>
                <input
                  type="number"
                  required
                  step="any"
                  value={purTotalPrice}
                  onChange={e => setPurTotalPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0.00"
                  className="w-full p-2.5 text-xs font-extrabold text-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-hidden bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] text-slate-400 font-extrabold uppercase mb-1">RECORDED BY</label>
              <input
                type="text"
                readOnly
                value={purRecordedBy}
                className="w-full p-2.5 text-xs font-semibold text-slate-500 border border-slate-200 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900"
              />
            </div>

            <div>
              <button
                type="submit"
                className="w-full py-3 text-xs font-extrabold text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-colors shadow-xs cursor-pointer tracking-wider"
              >
                Save Purchase & Sync Master Catalog
              </button>
            </div>
          </form>
        </div>

        {/* Bottom Card: RECENT KITCHEN PURCHASE LOG */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs p-6 space-y-4">
          <h3 className="font-extrabold text-slate-900 dark:text-white text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 pb-3">
            RECENT KITCHEN PURCHASE LOG
          </h3>

          {/* Finance & Payroll Interceptor Bar */}
          <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
            {/* Step 1: Assign Vendor */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-slate-700 text-xs w-12">1. To:</span>
              <select
                value={selectedVendorToPay}
                onChange={e => setSelectedVendorToPay(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 max-w-xs w-full"
              >
                <option value="">-- Choose Vendor to Pay --</option>
                {dbVendors.filter(v => v.type === 'Vendor').map(v => (
                  <option key={v.id} value={v.name}>{v.name}</option>
                ))}
              </select>
              <button
                onClick={handleAssignVendor}
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Assign Vendor
              </button>
            </div>

            {/* Step 2: Settlement Engine */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span className="font-bold text-slate-700 text-xs w-12">2. Settled:</span>
              <select
                value={selectedPaidByStaff}
                onChange={e => setSelectedPaidByStaff(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 max-w-xs w-full"
              >
                <option value="">-- Paid By (Cash Handler Only) --</option>
                {cashHandlers.map(u => (
                  <option key={u.id} value={u.username}>
                    💳 {u.username} ({u.role})
                  </option>
                ))}
              </select>

              <select
                value={settlementMethod}
                onChange={e => setSettlementMethod(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 max-w-md w-full"
              >
                <option value="Paid using Farm Cash (No Salary Impact)">Paid using Farm Cash (No Salary Impact)</option>
                <option value="Paid Out of Pocket (Reimbursement Credit)">Paid Out of Pocket (Reimbursement Credit)</option>
              </select>

              <button
                onClick={handleMarkSelectedPaid}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg transition-colors cursor-pointer"
              >
                Mark Selected Paid
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="datatable w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 text-[11px]">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedPurIds(kitchenPurchases.map(p => p.id));
                        } else {
                          setSelectedPurIds([]);
                        }
                      }}
                      checked={selectedPurIds.length > 0 && selectedPurIds.length === kitchenPurchases.length}
                    />
                  </th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Item Description</th>
                  <th className="p-3 font-semibold">Qty</th>
                  <th className="p-3 font-semibold">Total Cost</th>
                  <th className="p-3 font-semibold text-center">Settlement</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {kitchenPurchases.map(pur => (
                  <tr key={pur.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPurIds.includes(pur.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedPurIds([...selectedPurIds, pur.id]);
                          } else {
                            setSelectedPurIds(selectedPurIds.filter(id => id !== pur.id));
                          }
                        }}
                      />
                    </td>
                    <td className="p-3 font-mono text-slate-500">{pur.purchaseDate}</td>
                    <td className="p-3">
                      <p className="font-bold text-slate-900 dark:text-white">{pur.itemName}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{pur.vendorName || 'Account: Unassigned'}</p>
                    </td>
                    <td className="p-3 font-semibold text-slate-700">{pur.quantity} {pur.unit}</td>
                    <td className="p-3 font-extrabold text-slate-900 dark:text-white">₹{Number(pur.totalPrice).toFixed(2)}</td>
                    <td className="p-3 text-center">
                      <span className={`text-[10px] font-extrabold px-3 py-1 rounded-full ${
                        pur.settlementStatus === 'Paid'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {pur.settlementStatus || 'Unpaid'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleDeletePurchase(pur.id, pur.itemName)}
                        className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {kitchenPurchases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center p-6 text-slate-400 font-semibold">
                      No kitchen purchases recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'catalog') {
    return (
      <div className="stock-inventory-container space-y-4">
        {/* Header Title & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="text-slate-800 font-extrabold text-sm uppercase tracking-wider flex items-center gap-2">
            <span>📦</span> Master Materials Catalog
          </div>
          
          <div className="flex-1 max-w-md relative">
            <input
              type="text"
              placeholder="Live filter catalog items..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="w-full pl-8 pr-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:outline-hidden focus:border-cyan-500 shadow-2xs"
            />
            <span className="absolute left-2.5 top-1.5 text-slate-400 text-xs">🔍</span>
          </div>

          <button
            onClick={handleCreateNewCatalogItem}
            className="btn-add-stock-item bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
          >
            <span>+</span> Register New Item
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedCategory('All')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
              selectedCategory === 'All'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({catalogItems.length})
          </button>
          {catalogCategories.map(cat => {
            const count = catalogItems.filter(i => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>

        {/* Category Manager Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCategoryManager(!showCategoryManager)}
            className="btn-manage-categories bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>{showCategoryManager ? 'Hide Categories Manager' : 'Manage Categories'}</span>
          </button>
        </div>

        {/* Category Manager Panel */}
        {showCategoryManager && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="New category name..."
                className="flex-1 p-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
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
                Add
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
              {catalogCategories.filter(c => c !== 'All').map(cat => {
                  const dbCat = dbCategories.find(c => c.name === cat);
                  return (
                    <div key={cat} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
                      {editingCategoryId === dbCat?.id ? (
                    <>
                      <input
                        type="text"
                        value={editingCategoryName}
                        onChange={e => setEditingCategoryName(e.target.value)}
                        onBlur={() => handleRenameCategory(dbCat!.id)}
                        onKeyDown={e => e.key === 'Enter' && handleRenameCategory(dbCat!.id)}
                        autoFocus
                        className="flex-1 p-1 border border-blue-500 rounded text-xs"
                      />
                      <button onClick={() => handleRenameCategory(dbCat!.id)} className="text-green-600 hover:text-green-700 text-xs font-bold cursor-pointer">✓</button>
                      <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer">✕</button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-xs font-semibold text-slate-700 truncate">{cat}</span>
                      <button
                        onClick={() => { setEditingCategoryId(dbCat?.id || 0); setEditingCategoryName(cat); }}
                        className="text-slate-400 hover:text-blue-600 text-xs cursor-pointer"
                        title="Rename"
                      >
                        ✎
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(dbCat?.id || 0, cat)}
                        className="text-slate-400 hover:text-red-600 text-xs cursor-pointer"
                        title="Delete"
                      >
                        ✕
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
              <span className="bg-blue-600 text-white font-extrabold text-xs px-2.5 py-1 rounded-full shadow-3xs">
                {selectedCatalogItemIds.length} Selected
              </span>
              <span className="text-xs text-blue-700 font-semibold">
                items to assign category bulk:
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={bulkTargetCategory}
                onChange={(e) => setBulkTargetCategory(e.target.value)}
                className="flex-1 sm:flex-none bg-white border border-blue-300 text-slate-800 text-xs font-semibold px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              >
                <option value="" disabled>Select Target Category...</option>
                {catalogCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              </select>
              <button
                onClick={() => handleBulkAssignCategory(bulkTargetCategory)}
                disabled={!bulkTargetCategory}
                className="btn-bulk-assign-category bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-2xs shrink-0"
              >
                Assign Category
              </button>
              <button
                onClick={() => setSelectedCatalogItemIds([])}
                className="text-slate-500 hover:text-slate-700 text-xs font-semibold px-2 py-2 cursor-pointer transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Categories Grouping */}
        <div className="space-y-6">
          {Object.entries(groupedCatalog).map(([categoryName, rawItems]) => {
            const items = rawItems as CatalogItem[];
            return (
              <div key={categoryName} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-200 p-3 font-bold text-slate-700 text-sm flex items-center justify-between">
                  <span>
                    {categoryName} <span className="text-slate-400 font-mono text-xs ml-2">({items.length} items)</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 font-bold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllInCategorySelected(items)}
                      onChange={(e) => handleSelectAllInCategory(items, e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Select All Category</span>
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="datatable w-full text-left text-xs">
                    <thead className="bg-white border-b border-slate-100 text-[10px] uppercase text-slate-400">
                      <tr>
                        <th className="p-3 font-semibold w-10">Select</th>
                        <th className="p-3 font-semibold">Image</th>
                        <th className="p-3 font-semibold">Item Name</th>
                        <th className="p-3 font-semibold">Standard Pack</th>
                        <th className="p-3 font-semibold">Base Cost</th>
                        <th className="p-3 font-semibold text-center">Status</th>
                        <th className="p-3 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item: CatalogItem) => (
                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedCatalogItemIds.includes(item.id) ? 'bg-blue-50/30' : ''}`}>
                          <td className="p-3 w-10">
                            <input
                              type="checkbox"
                              checked={selectedCatalogItemIds.includes(item.id)}
                              onChange={() => handleToggleSelectItem(item.id)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            {item.imagePath ? (
                              <img src={item.imagePath} alt={item.name} className="w-[150px] h-[50px] object-cover rounded border border-slate-200 shadow-xs" />
                            ) : (
                              <div className="w-[150px] h-[50px] bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-slate-400 text-[10px] italic">No Image</div>
                            )}
                          </td>
                          <td className="p-3 font-bold text-slate-800">{item.name}</td>
                          <td className="p-3 text-slate-600 font-mono">{item.packSize} {item.packUnit}</td>
                          <td className="p-3 text-slate-600 font-mono">₹{item.price.toFixed(2)}</td>
                          <td className="p-3 text-center">
                            {item.is_verified ? (
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-extrabold text-[10px]">✅ Active</span>
                            ) : (
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-extrabold text-[10px]">⚠️ Review</span>
                            )}
                          </td>
                          <td className="p-3 text-right space-x-2">
                            {!item.is_verified && (
                              <button onClick={() => handleApproveItem(item.id)} className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px] cursor-pointer">
                                Approve
                              </button>
                            )}
                            <button onClick={() => handleEditCatalogItem(item)} className="text-blue-600 hover:text-blue-700 font-bold text-[11px] cursor-pointer">
                              Edit
                            </button>
                            {(currentUser?.role === 'Super Admin' || currentUser?.role === 'Admin') && (
                              <button onClick={() => handleDeleteCatalogItem(item.id, item.name)} className="text-red-600 hover:text-red-700 font-bold text-[11px] cursor-pointer">
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
               ))}
             </tbody>
             </table>
          </div>
              </div>
            );
          })}
          {Object.keys(groupedCatalog).length === 0 && (
             <div className="text-center p-8 bg-slate-50 border border-slate-200 rounded-xl text-slate-500 font-semibold text-sm">
                No catalog items found matching your search.
             </div>
          )}
        </div>

        {/* Add/Edit Modal */}
        {isCatalogModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">
                  {editingCatalogItem ? '✏️ Edit Catalog Item' : '➕ Register New Material'}
                </h3>
                <button onClick={() => setIsCatalogModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <form onSubmit={handleSaveCatalogItem} className="p-4 space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Item Name</label>
                  <input type="text" required value={catItemName} onChange={e => setCatItemName(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden" placeholder="e.g. Tomato Puree" />
                </div>
                
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category</label>
                  <select required value={catCategory} onChange={e => setCatCategory(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden bg-white">
                    <option value="">Select category...</option>
                    {catalogCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Base Price (₹)</label>
                    <input type="number" step="0.01" required value={catPrice} onChange={e => setCatPrice(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden" />
                  </div>
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <label className="block text-slate-700 font-bold mb-1">Pack Size</label>
                      <input type="number" step="0.01" required value={catPackSize} onChange={e => setCatPackSize(Number(e.target.value))} className="w-full p-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden" />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-slate-700 font-bold mb-1">Unit</label>
                      <select value={catUnit} onChange={e => setCatUnit(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:border-blue-500 focus:outline-hidden">
                        {['Kg', 'Gms', 'Liter', 'Ml', 'Packets', 'Pc', 'Box', 'Dozen'].map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Upload Image (Auto-crops to 150x50)</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="w-full p-2 border border-slate-300 rounded-lg text-slate-500" />
                  {catImagePath && (
                    <div className="mt-2">
                      <p className="text-[10px] text-slate-500 mb-1">Preview:</p>
                      <img src={catImagePath} alt="Preview" className="w-[150px] h-[50px] object-cover border border-slate-200 rounded shadow-xs" />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-2xs transition-colors cursor-pointer">
                    Save & Commit Updates
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
          <div className="text-slate-800 font-extrabold text-sm uppercase tracking-wider">
            Stock Request Log
          </div>
          
           <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 mb-0.5">FROM</span>
              <input type="date" ref={fulfillFromRef} className="border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 bg-white shadow-2xs" defaultValue="2026-07-18" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] font-bold text-slate-500 mb-0.5">TO</span>
              <input type="date" ref={fulfillToRef} className="border border-slate-300 rounded-md px-2 py-1 text-xs text-slate-700 bg-white shadow-2xs" defaultValue="2026-07-25" />
            </div>
            <button onClick={handleFilterFulfill} className="mt-3.5 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-1.5 rounded-md shadow-2xs cursor-pointer transition-all active:scale-95">
              Enter
            </button>
          </div>
        </div>

         {/* Table */}
         <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
             <DataTableWrapper key={fulfillTableKey} className="stock-requisitions-table w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-1/4">Requested At</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-1/2">Material Selections Summary</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Status</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredFulfillSheets.map((sheet, index) => (
                  <tr key={sheet.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${index === filteredFulfillSheets.length - 1 ? 'border-none' : ''}`}>
                    <td className="py-4 px-4 text-xs font-semibold text-slate-500">
                      {sheet.date.replace(' - ', ' - ')}
                    </td>
                    <td className="py-4 px-4 text-xs font-semibold text-slate-700">
                      {Array.isArray(sheet.items) && sheet.items.filter(i => Boolean(i && i.trim())).length > 0
                        ? sheet.items.filter(i => Boolean(i && i.trim())).join(', ')
                        : sheet.status === 'FULFILLED' || sheet.status === 'PARTIALLY FULFILLED'
                          ? <span className="italic text-slate-400 font-normal">Fulfilled — no item details recorded</span>
                          : <span className="italic text-slate-400 font-normal">No items</span>
                      }
                    </td>
                    <td className="py-4 px-4 text-center">
                    <span className={`font-extrabold text-[10px] px-2 py-1 rounded-md ${
                      sheet.status === 'PENDING' 
                        ? 'bg-amber-100 text-amber-700'
                        : sheet.status === 'FULFILLED'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-700'
                    }`}>
                      {sheet.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 flex items-center justify-center gap-1.5">
                    <button onClick={() => handleEditFulfill(sheet)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1">
                      <span className="font-mono opacity-80">-</span> Edit
                    </button>
                    {sheet.status === 'PENDING' && (
                      <button onClick={() => handleQuickComplete(sheet)} className="bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-bold px-2 py-1 rounded shadow-2xs cursor-pointer flex items-center gap-1">
                        <span className="font-mono opacity-80">✓</span> Complete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            </DataTableWrapper>
          </div>

        {/* Fulfill Edit Modal */}
        {selectedFulfillSheet && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-700 text-sm tracking-wide uppercase">
                  MODIFY STOCK REQUEST
                </h3>
                <button onClick={() => setSelectedFulfillSheet(null)} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                <div className="pt-2">
                  <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-4">COSTING & DELIVERY MANIFEST</h4>
                  
                  <div className="space-y-5">
                    {selectedFulfillSheet.items.map((itemStr: string, idx: number) => {
                      const namePart = itemStr.split(' (x')[0];
                      const data = fulfillData[namePart] || { qty: 0, cost: 0, size: 1, unit: 'Kg' };
                      
                      return (
                        <div key={idx} className="space-y-2">
                          <h5 className="font-bold text-slate-800 text-sm">{namePart}</h5>
                          <div className="grid grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[9px] text-slate-400 font-semibold mb-1">Delivered Qty</label>
                              <input 
                                type="number" 
                                value={data.qty}
                                onChange={(e) => updateFulfillData(namePart, 'qty', parseInt(e.target.value) || 0)}
                                className="w-full p-2 text-center text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg focus:outline-hidden focus:border-cyan-500 shadow-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] text-slate-400 font-semibold mb-1">Cost / Price (₹)</label>
                              <input 
                                type="number" 
                                value={data.cost}
                                onChange={(e) => updateFulfillData(namePart, 'cost', parseInt(e.target.value) || 0)}
                                className="w-full p-2 text-center text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg focus:outline-hidden focus:border-cyan-500 shadow-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] text-slate-400 font-semibold mb-1">Size (e.g. 500)</label>
                              <input 
                                type="number" 
                                value={data.size}
                                onChange={(e) => updateFulfillData(namePart, 'size', parseInt(e.target.value) || 1)}
                                className="w-full p-2 text-center text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg focus:outline-hidden focus:border-cyan-500 shadow-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] text-slate-400 font-semibold mb-1">Unit Format</label>
                              <select 
                                value={data.unit}
                                onChange={(e) => updateFulfillData(namePart, 'unit', e.target.value)}
                                className="w-full p-2 text-sm font-semibold text-slate-700 border border-slate-200 rounded-lg focus:outline-hidden focus:border-cyan-500 cursor-pointer shadow-xs"
                              >
                                <option value="Kg">Kg</option>
                                <option value="Gm">Gm</option>
                                <option value="Ltr">Ltr</option>
                                <option value="Ml">Ml</option>
                                <option value="Pack">Pack</option>
                                <option value="Pcs">Pcs</option>
                                <option value="Box">Box</option>
                              </select>
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
                  Cancel
                </button>
                <button onClick={handleSaveFulfillQuantities} className="px-6 py-2 text-sm font-bold text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 transition-colors shadow-xs cursor-pointer">
                  Save & Commit Updates
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
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  placeholder="Quick search catalog metrics..."
                  className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-2xs"
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500 text-white shadow-2xs'
                          : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
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
              <h3 className="font-extrabold text-slate-700 text-xs tracking-wider uppercase">
                {reqCategory === 'All Items' ? 'ALL STOCK CATALOG ITEMS' : reqCategory.toUpperCase()}
              </h3>
              <span className="text-[11px] text-slate-400 font-semibold">
                {filteredCatalog.length} items
              </span>
            </div>

            {/* Stock Items Grid with Row Items (Mobile: 1 col, Sm: 2 cols, Lg: 3 cols) */}
            {filteredCatalog.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                <Boxes className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-600 font-bold text-xs">No catalog items found matching "{reqSearch}"</p>
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
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center text-slate-500 font-extrabold text-[10px]">
                          <Boxes className="w-5 h-5 text-cyan-600" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-800 text-xs truncate">
                            {item.name}
                          </h4>
                          <p className="text-slate-500 font-extrabold text-[11px] mt-0.5">
                            Per {item.unit} • ₹{item.rate.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAddToReqBasket(item)}
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all duration-150 flex items-center gap-1 cursor-pointer min-h-[36px] ${
                          isRecentlyAdded
                            ? 'bg-emerald-600 text-white border border-emerald-600 scale-95 animate-pulse shadow-md'
                            : 'bg-slate-50 hover:bg-cyan-50 text-slate-800 hover:text-cyan-700 border border-slate-300 hover:border-cyan-400 active:scale-90 shadow-2xs'
                        }`}
                      >
                        {isRecentlyAdded ? (
                          <span>✓ Added!</span>
                        ) : (
                          <span>+ Add</span>
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
                <h3 className="font-extrabold text-slate-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                  <ShoppingCart className="w-4 h-4 text-slate-700" />
                  <span>SUPPLY BASKET</span>
                </h3>
                <span className="text-[10px] font-extrabold bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded-full border border-cyan-200">
                  {totalReqCount} Items
                </span>
              </div>

              {reqBasket.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-500 text-xs">No materials loaded</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Click + Add on items from catalog</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 divide-y divide-slate-100">
                  {reqBasket.map((b) => (
                    <div
                      key={b.id}
                      className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex-1 truncate pr-1">
                        <h4 className="font-bold text-slate-900 text-xs truncate">
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
                          className="w-7 h-7 hover:bg-slate-100 font-black text-slate-600 flex items-center justify-center cursor-pointer active:scale-90"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-extrabold text-slate-900 text-xs">{b.qty}</span>
                        <button
                          onClick={() =>
                            setReqBasket((prev) =>
                              prev.map((item) => (item.id === b.id ? { ...item, qty: item.qty + 1 } : item))
                            )
                          }
                          className="w-7 h-7 hover:bg-slate-100 font-black text-slate-600 flex items-center justify-center cursor-pointer active:scale-90"
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
                <textarea
                  rows={2}
                  value={specialRequestText}
                  onChange={(e) => setSpecialRequestText(e.target.value)}
                  placeholder="Special/Seasonal Requests (e.g., 2kg Strawberries, 1 box Cornflakes)..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 resize-none"
                />
              </div>

              {/* Dispatch Requirement Button */}
              <button
                onClick={handleDispatchReq}
                disabled={reqBasket.length === 0 && !specialRequestText.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-50 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98]"
              >
                <span>Dispatch Requirement</span>
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
                <div className="bg-cyan-100 text-cyan-800 border border-cyan-200 font-extrabold text-xs px-2.5 py-1 rounded-xl shadow-2xs flex items-center gap-1">
                  <ShoppingCart className="w-3.5 h-3.5 text-cyan-700" />
                  <span>{totalReqCount} Items</span>
                </div>
                <div>
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">TOTAL: </span>
                  <span className="text-emerald-600 font-black text-sm">₹{totalReqSum.toFixed(2)}</span>
                </div>
              </div>

              <button
                onClick={() => setIsReqCartDrawerExpanded(!isReqCartDrawerExpanded)}
                className="bg-white hover:bg-slate-100 text-cyan-700 font-extrabold text-xs px-3 py-1.5 rounded-xl border border-cyan-300 shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              >
                {isReqCartDrawerExpanded ? (
                  <span>▼ Collapse</span>
                ) : (
                  <span>▲ Expand Cart (50%)</span>
                )}
              </button>
            </div>

            {/* Items List */}
            <div className="p-3 flex-1 overflow-y-auto space-y-2">
              {!isReqCartDrawerExpanded && reqBasket.length > 3 && (
                <p className="text-[10px] text-cyan-700 font-extrabold tracking-wide uppercase text-center pb-1">
                  Showing Last 3 Added Items (Click Expand for all {reqBasket.length} items)
                </p>
              )}
              {visibleReqDrawerItems.map((b) => (
                <div
                  key={b.id}
                  className="bg-slate-50 p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-900"
                >
                  <div className="flex-1 pr-1 truncate">
                    <h4 className="font-bold text-slate-900 text-xs truncate">
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
                      className="w-7 h-7 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      -
                    </button>
                    <span className="w-6 text-center font-extrabold text-slate-900 text-xs">
                      {b.qty}
                    </span>
                    <button
                      onClick={() =>
                        setReqBasket((prev) =>
                          prev.map((item) => (item.id === b.id ? { ...item, qty: item.qty + 1 } : item))
                        )
                      }
                      className="w-7 h-7 hover:bg-slate-100 font-black text-slate-700 flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Footer */}
            <div className="p-3 bg-white border-t border-slate-200 shrink-0 space-y-2">
              <textarea
                rows={1}
                value={specialRequestText}
                onChange={(e) => setSpecialRequestText(e.target.value)}
                placeholder="Special/Seasonal Requests (optional)..."
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-cyan-500 resize-none"
              />
              <button
                onClick={handleDispatchReq}
                disabled={reqBasket.length === 0 && !specialRequestText.trim()}
                className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-extrabold text-xs py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-wider active:scale-[0.98] min-h-[40px]"
              >
                <span>Dispatch Requirement</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="stock-inventory-container space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-sm sm:text-base font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            Inventory Catalog & Stock Alert Boundaries
          </h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Monitor stock metrics, receive boundary threshold alerts, and adjust store inventory levels
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn-add-stock-item flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-2xs cursor-pointer transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Add Item
        </button>
      </div>

      {/* Inventory Table & Mobile Cards */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto text-xs">
           <table className="datatable inventory-master-table w-full text-left text-slate-700">
            <thead className="bg-slate-50 font-bold border-b border-slate-200 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Image</th>
                <th className="py-3 px-4">Item Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Current Stock Level</th>
                <th className="py-3 px-4">Min Alert Threshold</th>
                <th className="py-3 px-4">Stock Status</th>
                <th className="py-3 px-4 text-right">Inventory Tracking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventory.map((item) => {
                const isLow = item.currentStock <= item.minThreshold;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="relative w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                        {item.imagePath ? (
                          <img src={item.imagePath} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 text-sm">{item.name}</td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded font-medium">
                        {item.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {item.currentStock} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {item.minThreshold} {item.unit}
                    </td>
                    <td className="py-3 px-4">
                      {isLow ? (
                        <span className="bg-red-100 text-red-800 border border-red-300 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          <span>LOW STOCK ALERT</span>
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 w-max">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Adequate</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 font-bold px-2.5 py-1 rounded-full inline-block">
                        🔒 System Tracked (Requisitions & Wastage)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-slate-100 p-3 space-y-3">
          {inventory.map((item) => {
            const isLow = item.currentStock <= item.minThreshold;
            return (
              <div key={item.id} className="pt-3 first:pt-0 space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {item.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm">{item.name}</h4>
                  </div>
                  {isLow ? (
                    <span className="bg-red-100 text-red-800 border border-red-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-red-600" /> Low Stock
                    </span>
                  ) : (
                    <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Adequate
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Current Stock</span>
                    <span className="font-bold text-slate-900 text-sm">{item.currentStock} {item.unit}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">Min Threshold</span>
                    <span className="font-semibold text-slate-600">{item.minThreshold} {item.unit}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Item Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-800 text-sm">Add New Inventory Item</h3>
              <button onClick={() => setIsAddModalOpen(false)}>
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreateItem} className="space-y-3">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Milk or Basmati Rice"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  <option value="Groceries">Groceries</option>
                  <option value="Dairy">Dairy</option>
                  <option value="Oils">Oils & Spices</option>
                  <option value="Kitchen Fuel">Kitchen Fuel</option>
                  <option value="Maintenance">Maintenance & Cleaning</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Stock Level</label>
                  <input
                    type="number"
                    value={currentStock}
                    onChange={(e) => setCurrentStock(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Min Threshold</label>
                  <input
                    type="number"
                    value={minThreshold}
                    onChange={(e) => setMinThreshold(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Unit</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  >
                    <option value="kg">kg</option>
                    <option value="liters">liters</option>
                    <option value="pcs">pcs</option>
                    <option value="packets">packets</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Item Image Upload / URL</label>
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
                              setImagePath(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>

                    <input
                      type="text"
                      value={imagePath}
                      onChange={(e) => setImagePath(e.target.value)}
                      placeholder="Or enter image URL / path..."
                      className="flex-1 p-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden font-mono text-[11px]"
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
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
