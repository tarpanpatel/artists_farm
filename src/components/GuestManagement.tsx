import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Users,
  Receipt,
  CheckCircle2,
  Phone,
  Calendar,
  Building,
  CreditCard,
  IndianRupee,
  FileText,
  Search,
  X,
  AlertCircle,
  Plus,
  Minus,
  QrCode,
  Share2,
  Printer,
  Trash2,
  Sparkles
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { Guest, BillingReceipt, Order } from '../types';

interface GuestManagementProps {
  guests: Guest[];
  receipts: BillingReceipt[];
  orders: Order[];
  onAddGuest: (guest: Guest) => void;
  onCheckoutGuest: (receipt: BillingReceipt) => void;
  activeMenuItemKey?: string;
}

// Full menu dish catalog matching the PHP script dropdown
const DEFAULT_MENU_DISHES = [
  { id: 4, name: 'Aloo Pakoda (6-8pcs)', price: 149.0 },
  { id: 51, name: 'Aloo Paratha', price: 149.0 },
  { id: 55, name: 'Boiled Eggs', price: 149.0 },
  { id: 62, name: 'Boondi Raita', price: 95.0 },
  { id: 58, name: 'Bread Pakoda', price: 98.0 },
  { id: 53, name: 'Bread Toast Butter (2)', price: 50.0 },
  { id: 54, name: 'Bread Toast Jam (2)', price: 60.0 },
  { id: 61, name: 'Breakfast Buffet (Per Person)', price: 300.0 },
  { id: 65, name: 'Chaach', price: 68.0 },
  { id: 49, name: 'Chapati With Butter', price: 38.0 },
  { id: 28, name: 'Cheese Corn Pizza', price: 298.0 },
  { id: 30, name: 'Cheese Grilled Sandwich', price: 198.0 },
  { id: 31, name: 'Cheesy Garlic Bread (6pcs)', price: 149.0 },
  { id: 35, name: 'Chicken Curry (4pcs)', price: 389.0 },
  { id: 13, name: 'Chicken Seekh Kebab', price: 289.0 },
  { id: 12, name: 'Chicken Tikka', price: 359.0 },
  { id: 20, name: 'Chilly Paneer (8-10pcs)', price: 249.0 },
  { id: 21, name: 'Chilly Potatoes (8-10pcs)', price: 198.0 },
  { id: 25, name: 'Chinese Pakoda (6-8pcs)', price: 169.0 },
  { id: 18, name: 'Chow mein', price: 149.0 },
  { id: 69, name: 'Coffee', price: 80.0 },
  { id: 70, name: 'Cold Coffee', price: 148.0 },
  { id: 41, name: 'Daal Fry', price: 149.0 },
  { id: 40, name: 'Daal Tadka', price: 198.0 },
  { id: 44, name: 'Dinner Buffet (Per Person)', price: 600.0 },
  { id: 56, name: 'Egg Bhurji', price: 149.0 },
  { id: 11, name: 'French Fries Peri-Peri', price: 179.0 },
  { id: 10, name: 'French Fries Regular', price: 149.0 },
  { id: 59, name: 'French Toast', price: 149.0 },
  { id: 16, name: 'Fried Papad', price: 40.0 },
  { id: 39, name: 'Gatta Masala', price: 198.0 },
  { id: 66, name: 'Green Salad', price: 119.0 },
  { id: 73, name: 'Hot Chocolate', price: 249.0 },
  { id: 38, name: 'Jeera Aloo', price: 249.0 },
  { id: 46, name: 'Jeera Rice', price: 248.0 },
  { id: 7, name: 'Kaala Chana Chaat', price: 149.0 },
  { id: 6, name: 'Kabuli Chana Chaat', price: 149.0 },
  { id: 33, name: 'Kadhai Paneer', price: 285.0 },
  { id: 42, name: 'Kadhi Pakoda', price: 198.0 },
  { id: 74, name: 'Laal Maans', price: 800.0 },
  { id: 23, name: 'Maggie Regular', price: 98.0 },
  { id: 24, name: 'Masala Maggie', price: 149.0 },
  { id: 17, name: 'Masala Papad', price: 49.0 },
  { id: 68, name: 'Masala Tea', price: 58.0 },
  { id: 5, name: 'Mix-Veg Pakoda (12pcs)', price: 198.0 },
  { id: 36, name: 'Mutton Curry (4pcs)', price: 489.0 },
  { id: 14, name: 'Mutton Seekh Kebab', price: 389.0 },
  { id: 71, name: 'Nimbu Pani', price: 49.0 },
  { id: 72, name: 'Nimbu Soda', price: 59.0 },
  { id: 60, name: 'Omelette', price: 98.0 },
  { id: 26, name: 'OTC Pizza', price: 198.0 },
  { id: 37, name: 'Paneer Bhurji', price: 298.0 },
  { id: 34, name: 'Paneer Butter Masala', price: 285.0 },
  { id: 2, name: 'Paneer Pakoda (10pcs)', price: 195.0 },
  { id: 27, name: 'Paneer Pizza', price: 298.0 },
  { id: 1, name: 'Paneer Tikka (8-10pcs)', price: 249.0 },
  { id: 9, name: 'Pani Puri (8)', price: 49.0 },
  { id: 50, name: 'Paratha Plain', price: 59.0 },
  { id: 8, name: 'Peanut Masala', price: 125.0 },
  { id: 48, name: 'Plain Chapati', price: 29.0 },
  { id: 64, name: 'Plain Curd', price: 58.0 },
  { id: 45, name: 'Plain Rice', price: 198.0 },
  { id: 57, name: 'Poha', price: 98.0 },
  { id: 3, name: 'Pyaz Pakoda (10pcs)', price: 149.0 },
  { id: 52, name: 'Pyaz Paratha', price: 149.0 },
  { id: 67, name: 'Regular Tea', price: 48.0 },
  { id: 15, name: 'Roasted Papad', price: 30.0 },
  { id: 43, name: 'Sev Tamatar', price: 249.0 },
  { id: 32, name: 'Shahi Paneer', price: 285.0 },
  { id: 22, name: 'Sweet Corn Chaat', price: 198.0 },
  { id: 29, name: 'Veg Grilled Sandwich', price: 149.0 },
  { id: 47, name: 'Veg Pulao', price: 298.0 },
  { id: 63, name: 'Veg Raita', price: 149.0 },
  { id: 19, name: 'Veg Spring roll (6-8pcs)', price: 149.0 },
];

export interface IncidentalsItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface AdjustmentItem {
  id: string;
  reason: string;
  amount: number;
  type: 'charge' | 'discount';
}

export interface PaymentSplitRow {
  id: number;
  amount: number;
  mode: 'Cash' | 'UPI';
  recipient: string;
}

export const GuestManagement: React.FC<GuestManagementProps> = ({
  guests,
  receipts,
  orders,
  onAddGuest,
  onCheckoutGuest,
  activeMenuItemKey,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'residents' | 'billing' | 'receipts'>('residents');

  useEffect(() => {
    if (activeMenuItemKey === 'billing_checkout') {
      setActiveSubTab('billing');
    } else if (activeMenuItemKey === 'guest_registration') {
      setActiveSubTab('residents');
    }
  }, [activeMenuItemKey]);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Check-in Modal
  const [isCheckinModalOpen, setIsCheckinModalOpen] = useState(false);

  // Form Checkin State
  const [guestName, setGuestName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [roomNumber, setRoomNumber] = useState('Villa 101');
  const [checkinDate, setCheckinDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedCheckout, setExpectedCheckout] = useState(
    new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  // Selected Active Guest for Billing
  const [selectedGuestId, setSelectedGuestId] = useState<string>(guests[0]?.id || '');

  // Lodging Breakdown Data
  const [baseLodging, setBaseLodging] = useState(12000);
  const [advancePaid, setAdvancePaid] = useState(10000);
  const [advancePayer, setAdvancePayer] = useState('Tarpan');
  const [pendingSettled, setPendingSettled] = useState(2000);
  const [pendingSettledBy, setPendingSettledBy] = useState('Kamlesh');

  // Incidentals Log Items
  const [incidentals, setIncidentals] = useState<IncidentalsItem[]>([
    { id: '1', name: 'French Fries Regular', price: 149.0, quantity: 1 },
    { id: '2', name: 'Laal Maans', price: 800.0, quantity: 1 },
    { id: '3', name: 'French Fries Peri-Peri', price: 179.0, quantity: 1 },
    { id: '4', name: 'Paneer Pakoda (10pcs)', price: 195.0, quantity: 1 },
    { id: '5', name: 'Mix-Veg Pakoda (12pcs)', price: 198.0, quantity: 1 },
    { id: '6', name: 'Pyaz Pakoda (10pcs)', price: 149.0, quantity: 1 },
    { id: '7', name: 'Peanut Masala', price: 125.0, quantity: 1 },
    { id: '8', name: 'Aloo Pakoda (6-8pcs)', price: 149.0, quantity: 1 },
  ]);

  // Insert Food Form
  const [selectedDishId, setSelectedDishId] = useState<string>('');
  const [customDishName, setCustomDishName] = useState('');
  const [customDishPrice, setCustomDishPrice] = useState<number | ''>('');
  const [insertQty, setInsertQty] = useState<number>(1);

  // Custom Adjustments
  const [adjustments, setAdjustments] = useState<AdjustmentItem[]>([
    { id: 'adj-1', reason: 'Misc', amount: 200, type: 'charge' },
  ]);

  // Add Adjustment Form
  const [adjType, setAdjType] = useState<'charge' | 'discount'>('charge');
  const [adjReasonCharge, setAdjReasonCharge] = useState('Misc');
  const [adjReasonDiscount, setAdjReasonDiscount] = useState('');
  const [adjAmount, setAdjAmount] = useState<number | ''>('');

  // Desk Cashier Handling
  const [deskCashier] = useState('Tarpan');

  // Split Payment Matrix Rows
  const [splitRows, setSplitRows] = useState<PaymentSplitRow[]>([
    { id: 1, amount: 2293.0, mode: 'Cash', recipient: 'On-Site Cash Safe' },
  ]);

  // QR Modal Lightbox
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [qrModalTitle, setQrModalTitle] = useState('');
  const [qrModalHasCode, setQrModalHasCode] = useState(false);

  // Print-Friendly Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Active Guest Object
  const currentGuest = guests.find((g) => g.id === selectedGuestId) || guests[0];

  // Whenever selected guest changes, auto-load their fulfilled orders into incidentals
  useEffect(() => {
    if (currentGuest) {
      const guestOrders = orders.filter((o) => o.guestId === currentGuest.id || o.guestName === currentGuest.guestName);
      if (guestOrders.length > 0) {
        const loadedItems: IncidentalsItem[] = [];
        guestOrders.forEach((o) => {
          o.items.forEach((it, idx) => {
            loadedItems.push({
              id: `order-${o.id}-${idx}`,
              name: it.name,
              price: it.unitPrice,
              quantity: it.quantity,
            });
          });
        });
        if (loadedItems.length > 0) {
          setIncidentals(loadedItems);
        }
      }
    }
  }, [selectedGuestId, orders]);

  // Calculate Subtotals & Totals
  const foodTotal = incidentals.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const extraCharges = adjustments
    .filter((a) => a.type === 'charge')
    .reduce((sum, a) => sum + a.amount, 0);
  const discounts = adjustments
    .filter((a) => a.type === 'discount')
    .reduce((sum, a) => sum + a.amount, 0);
  const netAdjustments = extraCharges - discounts;

  const incidentalsSubtotal = foodTotal;
  const lodgingPendingDue = Math.max(0, baseLodging - advancePaid);
  const grandTargetDue = Math.max(0, lodgingPendingDue + foodTotal + netAdjustments);

  // Auto Balance Split Payment Rows
  const totalSplitSum = splitRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const isSplitMatching = Math.abs(totalSplitSum - grandTargetDue) < 0.01;

  // Sync first split row when grandTargetDue changes if only 1 split row
  useEffect(() => {
    if (splitRows.length === 1) {
      setSplitRows([{ ...splitRows[0], amount: grandTargetDue }]);
    }
  }, [grandTargetDue]);

  // Handle Qty Update on Incidentals Item
  const handleUpdateIncidentalsQty = (id: string, delta: number) => {
    setIncidentals((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as IncidentalsItem[]
    );
  };

  // Handle Direct Food Insert
  const handleInsertFoodItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDishId) return;

    let dishName = '';
    let dishPrice = 0;

    if (selectedDishId === 'custom') {
      if (!customDishName.trim() || !customDishPrice || Number(customDishPrice) <= 0) {
        alert('Please provide a valid Custom Dish Name and Price.');
        return;
      }
      dishName = customDishName.trim();
      dishPrice = Number(customDishPrice);
    } else {
      const dish = DEFAULT_MENU_DISHES.find((d) => d.id === Number(selectedDishId));
      if (!dish) return;
      dishName = dish.name;
      dishPrice = dish.price;
    }

    const newItem: IncidentalsItem = {
      id: `inc-${Date.now()}`,
      name: dishName,
      price: dishPrice,
      quantity: Math.max(1, insertQty),
    };

    setIncidentals((prev) => [...prev, newItem]);

    // Reset Form
    setSelectedDishId('');
    setCustomDishName('');
    setCustomDishPrice('');
    setInsertQty(1);
  };

  // Handle Custom Adjustment Form Submit
  const handleAddAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjAmount || Number(adjAmount) <= 0) return;

    const reasonText =
      adjType === 'charge' ? adjReasonCharge : adjReasonDiscount.trim() || 'Service Rebate';

    const newAdj: AdjustmentItem = {
      id: `adj-${Date.now()}`,
      reason: reasonText,
      amount: Number(adjAmount),
      type: adjType,
    };

    setAdjustments((prev) => [...prev, newAdj]);
    setAdjAmount('');
    setAdjReasonDiscount('');
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments((prev) => prev.filter((a) => a.id !== id));
  };

  // Split Row Handlers
  const handleAddSplitRow = () => {
    const nextId = Date.now();
    const remaining = Math.max(0, grandTargetDue - totalSplitSum);
    setSplitRows((prev) => [
      ...prev,
      { id: nextId, amount: remaining, mode: 'UPI', recipient: 'Tarpan [Staff]' },
    ]);
  };

  const handleRemoveSplitRow = (id: number) => {
    if (splitRows.length === 1) return;
    setSplitRows((prev) => {
      const next = prev.filter((r) => r.id !== id);
      // Balance remaining into first row
      const otherSum = next.slice(1).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const firstBal = Math.max(0, grandTargetDue - otherSum);
      if (next[0]) next[0].amount = firstBal;
      return next;
    });
  };

  const handleUpdateSplitRow = (id: number, field: keyof PaymentSplitRow, value: any) => {
    setSplitRows((prev) => {
      return prev.map((row, idx) => {
        if (row.id === id) {
          const updated = { ...row, [field]: value };
          if (field === 'amount' && idx !== 0) {
            // Auto balance back into row 0
            const numVal = Number(value) || 0;
            const otherRowsSum = prev.reduce((acc, r, i) => {
              if (i === 0 || r.id === id) return acc;
              return acc + (Number(r.amount) || 0);
            }, numVal);
            const bal0 = Math.max(0, grandTargetDue - otherRowsSum);
            if (prev[0]) prev[0].amount = bal0;
          }
          return updated;
        }
        return row;
      });
    });
  };

  // QR Code Lightbox Trigger
  const handleTriggerQrModal = (recipient: string) => {
    setQrModalTitle(recipient);
    // Has screenshot for Tarpan or Nandkishore
    const hasCode = recipient.includes('Tarpan') || recipient.includes('Nandkishore');
    setQrModalHasCode(hasCode);
    setIsQrModalOpen(true);
  };

  // Complete Checkout Execution
  const handleCompleteCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSplitMatching) {
      alert(`Error: Split sum (₹${totalSplitSum.toFixed(2)}) must equal target due (₹${grandTargetDue.toFixed(2)}) exactly.`);
      return;
    }

    if (!confirm('Finalize room contract checkout distribution operations?')) return;

    if (currentGuest) {
      const checkoutDateStr = new Date().toISOString().split('T')[0];
      const primaryMode = splitRows[0]?.mode || 'UPI';

      const receipt: BillingReceipt = {
        id: `REC-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        guestId: currentGuest.id,
        guestName: currentGuest.guestName,
        roomNumber: currentGuest.roomNumber,
        checkinDate: currentGuest.checkinDate,
        checkoutDate: checkoutDateStr,
        roomRatePerNight: Math.round(baseLodging / 2),
        nightsCount: 2,
        roomTotal: lodgingPendingDue,
        kitchenTotal: foodTotal,
        miscTotal: extraCharges,
        discount: discounts,
        grandTotal: grandTargetDue,
        status: 'Paid',
        paidAt: `${checkoutDateStr} ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
        paymentMethod: primaryMode,
      };

      onCheckoutGuest(receipt);
      alert(`✅ Settlement completed for ${currentGuest.guestName}! Receipt generated.`);
    }
  };

  // Share Receipt PNG Handler
  const handleShareReceipt = async () => {
    const receiptBox = document.getElementById('printableReceiptModalContent');
    const actionsBar = document.getElementById('printableReceiptActionsBar');
    if (!receiptBox) return;

    if (actionsBar) actionsBar.style.display = 'none';

    try {
      const canvas = await html2canvas(receiptBox, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `Bill_${Date.now()}.png`, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'Final Bill Settlement' });
        } else {
          const link = document.createElement('a');
          link.download = `Bill_${Date.now()}.png`;
          link.href = URL.createObjectURL(blob);
          link.click();
        }
      }, 'image/png');
    } catch (err) {
      alert('Failed to generate image print.');
    } finally {
      if (actionsBar) actionsBar.style.display = 'flex';
    }
  };

  // Check-in Form Submission
  const handleCheckinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !phoneNumber) return;

    const newGuest: Guest = {
      id: `g-${Date.now().toString().slice(-4)}`,
      guestName,
      phoneNumber,
      roomNumber,
      checkinDate,
      expectedCheckout,
      status: 'Active',
      notes,
    };

    onAddGuest(newGuest);
    setIsCheckinModalOpen(false);
    setGuestName('');
    setPhoneNumber('');
    setRoomNumber('Villa 101');
    setNotes('');
  };

  const filteredGuests = guests.filter((g) => {
    const matchesStatus = filterStatus === 'All' || g.status === filterStatus;
    const matchesSearch =
      g.guestName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.roomNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.phoneNumber.includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
            <Receipt className="w-6 h-6 text-blue-600" />
            Guest Billing & Checkout Terminal
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Manage lodging contracts, insert food incidentals, apply adjustments, and run split settlement checkouts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCheckinModalOpen(true)}
            className="text-white bg-blue-600 hover:bg-blue-700 font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Check-in New Resident</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 text-xs font-bold">
        <button
          onClick={() => setActiveSubTab('residents')}
          className={`pb-2.5 px-4 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'residents'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Resident Roster ({guests.length})
        </button>
        <button
          onClick={() => setActiveSubTab('billing')}
          className={`pb-2.5 px-4 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'billing'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <CreditCard className="w-4 h-4 inline mr-1.5" />
          Billing & Checkout Workspace
        </button>
        <button
          onClick={() => setActiveSubTab('receipts')}
          className={`pb-2.5 px-4 transition-colors border-b-2 cursor-pointer ${
            activeSubTab === 'receipts'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <Receipt className="w-4 h-4 inline mr-1.5" />
          Past Receipts Log ({receipts.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: RESIDENT ROSTER                                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'residents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search resident name, phone, villa..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-gray-500 font-medium">Status:</span>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-xs font-semibold bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active Residents</option>
                <option value="Booked">Booked Ahead</option>
                <option value="CheckedOut">Checked Out</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Resident Profile</th>
                    <th className="py-3 px-4">Assigned Unit</th>
                    <th className="py-3 px-4">Stay Dates</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGuests.map((guest) => (
                    <tr key={guest.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{guest.guestName}</div>
                        <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" /> {guest.phoneNumber}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md border border-slate-200 text-xs">
                          {guest.roomNumber}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-800 font-medium">{guest.checkinDate}</div>
                        <div className="text-slate-500 text-[11px]">to {guest.expectedCheckout}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            guest.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : guest.status === 'Booked'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-slate-100 text-slate-600 border border-slate-300'
                          }`}
                        >
                          {guest.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {guest.status === 'Active' ? (
                          <button
                            onClick={() => {
                              setSelectedGuestId(guest.id);
                              setActiveSubTab('billing');
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
                          >
                            Open Billing Workspace →
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Checked Out</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: BILLING & CHECKOUT WORKSPACE (FULL MATCH TO ATTACHED CODE)    */}
      {/* ========================================================================= */}
      {activeSubTab === 'billing' && (
        <div className="space-y-6">
          {/* Active Resident Selector Bar */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <span className="font-bold text-gray-700">Active Resident Account:</span>
              <select
                value={selectedGuestId}
                onChange={(e) => setSelectedGuestId(e.target.value)}
                className="bg-slate-50 border border-slate-300 font-bold text-slate-900 rounded-lg px-3 py-1.5 focus:ring-blue-500 focus:border-blue-500 cursor-pointer text-xs"
              >
                {guests
                  .filter((g) => g.status === 'Active')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.guestName} ({g.roomNumber}) — Phone: {g.phoneNumber}
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-full text-[11px] border border-emerald-300">
                ● Resident Currently In Stay
              </span>
            </div>
          </div>

          {/* 2-COLUMN SPLIT WORKSPACE PANEL */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT COLUMN: ACCOMMODATION + FOOD LOG (LG: 7 COLS) */}
            <div className="lg:col-span-7 space-y-6">
              {/* CARD 1: ACCOMMODATION INVOICE BREAKDOWN */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
                <div className="text-sm font-extrabold text-slate-900 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <span>🏡</span> Accommodation Invoice Breakdown
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-gray-600 font-semibold">Base Lodging Charges:</span>
                  <strong className="text-gray-900 font-bold">₹{baseLodging.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between items-center text-xs py-1">
                  <span className="text-gray-600 font-semibold">Advance Paid:</span>
                  <strong className="text-emerald-600 font-bold">
                    + ₹{advancePaid.toFixed(2)} by {advancePayer}
                  </strong>
                </div>
                <div className="flex justify-between items-center text-xs py-1 border-t border-dashed border-gray-200 pt-2">
                  <span className="text-gray-600 font-semibold">Pending Lodging Due:</span>
                  <strong className="text-emerald-700 font-bold">
                    ₹{lodgingPendingDue.toFixed(2)} Settled via {pendingSettledBy}
                  </strong>
                </div>
              </div>

              {/* CARD 2: FOOD ORDERS & INCIDENTALS LOG */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-4">
                <div className="text-sm font-extrabold text-slate-900 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <span>🍽️</span> Food Orders & Incidentals Log
                </div>

                {/* INSERTION FORM WITH --CUSTOM-- DISH OPTION */}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
                  <form onSubmit={handleInsertFoodItem} className="space-y-3">
                    <div className="flex flex-wrap items-end gap-3 text-xs">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">
                          Select Dish / Item
                        </label>
                        <select
                          value={selectedDishId}
                          onChange={(e) => setSelectedDishId(e.target.value)}
                          required
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-900 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                        >
                          <option value="">-- Choose Menu Dish --</option>
                          <option value="custom" className="font-bold text-cyan-600">
                            -- CUSTOM --
                          </option>
                          {DEFAULT_MENU_DISHES.map((dish) => (
                            <option key={dish.id} value={dish.id}>
                              {dish.name} (₹{dish.price.toFixed(2)})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="w-24">
                        <label className="block text-[11px] font-bold text-slate-600 mb-1 text-center">
                          Quantity
                        </label>
                        <input
                          type="number"
                          value={insertQty}
                          min={1}
                          required
                          onChange={(e) => setInsertQty(Number(e.target.value))}
                          className="w-full p-2 text-center bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <button
                          type="submit"
                          className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-4 py-2 rounded-lg transition-all cursor-pointer shadow-2xs h-[36px]"
                        >
                          + Insert
                        </button>
                      </div>
                    </div>

                    {/* Custom Dish Fields (Visible when -- CUSTOM -- selected) */}
                    {selectedDishId === 'custom' && (
                      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-dashed border-slate-300 text-xs animate-in fade-in">
                        <div className="flex-1 min-w-[180px]">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Custom Dish Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={customDishName}
                            onChange={(e) => setCustomDishName(e.target.value)}
                            placeholder="e.g. Special Thali / Extra Raita"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                          />
                        </div>
                        <div className="w-32">
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Price (₹) *
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={customDishPrice}
                            onChange={(e) =>
                              setCustomDishPrice(e.target.value === '' ? '' : Number(e.target.value))
                            }
                            placeholder="0.00"
                            className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                          />
                        </div>
                      </div>
                    )}
                  </form>
                </div>

                {/* FOOD LOG TABLE */}
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-800">
                    <thead className="bg-slate-100 font-bold border-b border-slate-200 text-slate-600 uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Description Item</th>
                        <th className="py-2.5 px-3 text-center w-[130px]">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {incidentals.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{item.name}</td>
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex items-center bg-slate-100 border border-slate-300 rounded-md p-1 gap-1">
                              <button
                                type="button"
                                onClick={() => handleUpdateIncidentalsQty(item.id, -1)}
                                className="w-7 h-7 bg-slate-200 hover:bg-slate-300 rounded text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer"
                              >
                                -
                              </button>
                              <span className="w-8 text-center font-extrabold text-sm text-slate-800">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateIncidentalsQty(item.id, 1)}
                                className="w-7 h-7 bg-cyan-600 hover:bg-cyan-700 rounded text-white font-bold text-sm flex items-center justify-center cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            ₹{(item.price * item.quantity).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* MANUAL ADJUSTMENTS APPLIED SUMMARY BOX */}
                {adjustments.length > 0 && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wider">
                      Manual Adjustments Applied
                    </span>
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between font-semibold">
                        <span className="text-slate-600">↳ {adj.reason}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              adj.type === 'charge'
                                ? 'text-red-600 font-bold'
                                : 'text-emerald-600 font-bold'
                            }
                          >
                            {adj.type === 'charge' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveAdjustment(adj.id)}
                            className="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                            title="Remove Adjustment"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* INCIDENTALS SUBTOTAL ROW */}
                <div className="pt-2 border-t border-slate-200 text-right text-xs">
                  <span className="font-bold text-slate-700">
                    Food Items Subtotal:&nbsp;
                    <strong className="text-sky-600 text-sm font-extrabold">
                      ₹{foodTotal.toFixed(2)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: CUSTOM ADJUSTMENTS + SPLIT CHECKOUT (LG: 5 COLS) */}
            <div className="lg:col-span-5 space-y-6">
              {/* CARD 3: ADD CUSTOM ADJUSTMENTS */}
              <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs space-y-4 text-xs">
                <div className="text-sm font-extrabold text-slate-900 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <span>➕</span> Add Custom Adjustments
                </div>

                <form onSubmit={handleAddAdjustment} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Strategy Type
                    </label>
                    <select
                      value={adjType}
                      onChange={(e) => setAdjType(e.target.value as 'charge' | 'discount')}
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 cursor-pointer"
                    >
                      <option value="charge">Extra Incidentals Charge (+)</option>
                      <option value="discount">Discount Rebate (-)</option>
                    </select>
                  </div>

                  {adjType === 'charge' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Charge Category
                      </label>
                      <select
                        value={adjReasonCharge}
                        onChange={(e) => setAdjReasonCharge(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900 cursor-pointer"
                      >
                        <option value="Decoration Fees">Decoration Fees</option>
                        <option value="Extra Housekeeping">Extra Housekeeping</option>
                        <option value="Misc">Misc</option>
                        <option value="Pet Stay Charges">Pet Stay Charges</option>
                      </select>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Discount Label
                      </label>
                      <input
                        type="text"
                        value={adjReasonDiscount}
                        onChange={(e) => setAdjReasonDiscount(e.target.value)}
                        placeholder="e.g. Service Apology..."
                        className="w-full p-2 bg-white border border-slate-300 rounded-lg text-slate-900"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Amount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={adjAmount}
                      onChange={(e) =>
                        setAdjAmount(e.target.value === '' ? '' : Number(e.target.value))
                      }
                      placeholder="0.00"
                      className="w-full p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg transition-all cursor-pointer shadow-2xs"
                  >
                    Apply Adjustment
                  </button>
                </form>
              </div>

              {/* CARD 4: SPLIT PAYMENT INTEGRATED FINAL CHECKOUT SETTLEMENT BLOCK */}
              <div className="bg-white p-5 rounded-2xl border-2 border-emerald-500/80 shadow-md space-y-4 text-xs">
                <div className="text-sm font-extrabold text-emerald-800 border-b border-emerald-100 pb-2 flex items-center gap-2">
                  <span>🏁</span> Final Checkout Split Settlement
                </div>

                <form onSubmit={handleCompleteCheckout} className="space-y-4">
                  {/* Target Due & Running Stack Summary */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Pending Lodging Due:</span>
                      <span>₹{lodgingPendingDue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-600 font-medium">
                      <span>Food & Incidentals Subtotal:</span>
                      <span>₹{foodTotal.toFixed(2)}</span>
                    </div>
                    {extraCharges > 0 && (
                      <div className="flex justify-between items-center text-red-600 font-semibold">
                        <span>(+) Extra Charges:</span>
                        <span>+₹{extraCharges.toFixed(2)}</span>
                      </div>
                    )}
                    {discounts > 0 && (
                      <div className="flex justify-between items-center text-emerald-600 font-semibold">
                        <span>(-) Discount Rebate:</span>
                        <span>-₹{discounts.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center font-extrabold text-slate-900 border-t border-slate-200 pt-1.5">
                      <span>Grand Target Due:</span>
                      <span className="text-emerald-700 text-base">₹{grandTargetDue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1 border-t border-dashed border-slate-200">
                      <span>Total Stacked Entered:</span>
                      <span
                        className={`font-bold ${
                          isSplitMatching ? 'text-emerald-600' : 'text-red-600 font-extrabold'
                        }`}
                      >
                        ₹{totalSplitSum.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Cashier Field */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                      Desk Cashier Handling checkout:
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={deskCashier}
                      className="w-full p-2 bg-slate-100 border border-slate-300 rounded-lg font-bold text-slate-600 cursor-not-allowed"
                    />
                  </div>

                  {/* Dynamic Split Distribution Matrix */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-extrabold text-slate-600 uppercase">
                      Split Distribution Matrix
                    </div>

                    <div className="space-y-2.5">
                      {splitRows.map((row) => (
                        <div
                          key={row.id}
                          className="bg-slate-50 border border-slate-300 p-3 rounded-xl relative space-y-2"
                        >
                          {splitRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSplitRow(row.id)}
                              className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold text-sm cursor-pointer"
                              title="Remove row"
                            >
                              ✕
                            </button>
                          )}

                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={row.amount}
                              onChange={(e) =>
                                handleUpdateSplitRow(row.id, 'amount', Number(e.target.value))
                              }
                              placeholder="Amount (₹)"
                              className="flex-1 p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900"
                            />
                            <select
                              value={row.mode}
                              onChange={(e) =>
                                handleUpdateSplitRow(row.id, 'mode', e.target.value as 'Cash' | 'UPI')
                              }
                              className="w-24 p-2 bg-white border border-slate-300 rounded-lg font-bold text-slate-900 cursor-pointer"
                            >
                              <option value="Cash">Cash</option>
                              <option value="UPI">UPI</option>
                            </select>
                          </div>

                          {row.mode === 'UPI' && (
                            <div className="flex items-center gap-2 pt-1 animate-in fade-in">
                              <select
                                value={row.recipient}
                                onChange={(e) =>
                                  handleUpdateSplitRow(row.id, 'recipient', e.target.value)
                                }
                                className="flex-1 p-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-medium cursor-pointer"
                              >
                                <option value="On-Site Cash Safe">On-Site Cash Safe (System)</option>
                                <optgroup label="Staff Accounts (Login Team)">
                                  <option value="Kamlesh [Staff]">Kamlesh [Staff]</option>
                                  <option value="Rohit [Staff]">Rohit [Staff]</option>
                                  <option value="Subrata [Staff]">Subrata [Staff]</option>
                                  <option value="Tarpan [Staff]">Tarpan [Staff]</option>
                                </optgroup>
                                <optgroup label="Core Business Vendors (Groceries/Upkeep)">
                                  <option value="Disposable Shop [Vendor]">Disposable Shop [Vendor]</option>
                                  <option value="Raju [Vendor]">Raju [Vendor]</option>
                                </optgroup>
                                <optgroup label="Third Parties (Pass-Through Routing)">
                                  <option value="Nandkishore [ThirdParty]">Nandkishore [ThirdParty]</option>
                                </optgroup>
                              </select>

                              <button
                                type="button"
                                onClick={() => handleTriggerQrModal(row.recipient)}
                                className="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer text-xs h-[32px] flex items-center gap-1"
                              >
                                <QrCode className="w-3.5 h-3.5" /> Show QR
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddSplitRow}
                      className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-400 text-slate-700 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      ➕ Add Payment Split Row
                    </button>
                  </div>

                  {/* Validation Error Alert */}
                  {!isSplitMatching && (
                    <div className="p-2.5 bg-red-50 border border-red-200 text-red-800 text-center font-bold text-[11px] rounded-lg">
                      ❌ Error: Split sum (₹{totalSplitSum.toFixed(2)}) must equal target due (₹
                      {grandTargetDue.toFixed(2)}) exactly.
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" /> View Print Receipt
                    </button>

                    <button
                      type="submit"
                      disabled={!isSplitMatching}
                      className={`w-full py-3 text-white font-extrabold text-xs rounded-xl shadow-sm transition-all cursor-pointer ${
                        isSplitMatching
                          ? 'bg-emerald-600 hover:bg-emerald-700'
                          : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Complete Checkout & Submit Bill
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PAST RECEIPTS LOG                                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'receipts' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden p-4 space-y-3">
          <h3 className="font-bold text-slate-800 text-sm">Settled Bills & Payment Receipts</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Receipt ID</th>
                  <th className="py-3 px-4">Guest Name</th>
                  <th className="py-3 px-4">Room</th>
                  <th className="py-3 px-4">Stay Dates</th>
                  <th className="py-3 px-4">Breakdown (Room + Kitchen)</th>
                  <th className="py-3 px-4">Grand Total</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receipts.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{rec.id}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{rec.guestName}</td>
                    <td className="py-3 px-4">{rec.roomNumber}</td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      {rec.checkinDate} to {rec.checkoutDate}
                    </td>
                    <td className="py-3 px-4 text-[11px]">
                      ₹{rec.roomTotal} (Room) + ₹{rec.kitchenTotal} (Food)
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-700 text-sm">
                      ₹{rec.grandTotal.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                        {rec.status} ({rec.paymentMethod})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECK-IN NEW RESIDENT MODAL                                               */}
      {/* ========================================================================= */}
      {isCheckinModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-600" />
                Register New Resident Check-in
              </h3>
              <button
                onClick={() => setIsCheckinModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCheckinSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Guest Full Name *</label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Rajesh Sharma"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+91 98290 12345"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Assigned Room / Villa *</label>
                  <select
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Villa 101">Villa 101 (Luxury Pool)</option>
                    <option value="Villa 102">Villa 102 (Farm View)</option>
                    <option value="Cottage 1">Cottage 1 (Garden)</option>
                    <option value="Cottage 2">Cottage 2 (Garden)</option>
                    <option value="Cottage 3">Cottage 3 (Hill View)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Check-in Date</label>
                  <input
                    type="date"
                    value={checkinDate}
                    onChange={(e) => setCheckinDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Expected Checkout</label>
                  <input
                    type="date"
                    value={expectedCheckout}
                    onChange={(e) => setExpectedCheckout(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Special Preferences / Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Breakfast preference, airport pickup details..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCheckinModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-2xs cursor-pointer"
                >
                  Confirm Check-in
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP MODAL 1: HIGH CONTRAST UPI QR LIGHTBOX                             */}
      {/* ========================================================================= */}
      {isQrModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 text-center max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Scan UPI QR Target: {qrModalTitle}
            </h4>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[200px]">
              {qrModalHasCode ? (
                <div className="space-y-3 flex flex-col items-center">
                  <div className="w-48 h-48 bg-white border-2 border-slate-800 p-3 rounded-xl flex flex-col items-center justify-center shadow-md relative">
                    <QrCode className="w-36 h-36 text-slate-900" />
                    <span className="text-[10px] font-mono font-bold text-slate-600 mt-1">
                      artistsfarm@upi
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                    ✓ Verified Payee: {qrModalTitle}
                  </span>
                </div>
              ) : (
                <div className="p-4 text-amber-700 font-bold text-xs">
                  ⚠️ No QR screenshot registered for this recipient ({qrModalTitle}).
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg text-xs cursor-pointer"
            >
              Close Preview Box
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* POPUP MODAL 2: CLEAN PRINT-FRIENDLY RECEIPT                              */}
      {/* ========================================================================= */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-start justify-center p-4 z-50 overflow-y-auto pt-8">
          <div
            id="printableReceiptModalContent"
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4 text-xs relative"
          >
            {/* Modal Actions Bar */}
            <div
              id="printableReceiptActionsBar"
              className="flex items-center justify-between border-b border-slate-100 pb-3"
            >
              <button
                type="button"
                onClick={handleShareReceipt}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" /> Share Bill
              </button>
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(false)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-1.5 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Receipt Content */}
            <div className="space-y-3 pt-2">
              <div className="text-center pb-2 border-b border-slate-200">
                <h3 className="font-extrabold text-base text-slate-900">ARTISTS FARM JAIPUR</h3>
                <p className="text-[11px] text-slate-500 font-medium">Consolidated Stay & KOT Settlement</p>
              </div>

              <div className="flex justify-between text-[11px] border-b border-dashed border-slate-300 pb-2 text-slate-600 font-semibold">
                <span>
                  <b>Phone:</b> 8888888
                </span>
                <span>
                  <b>Date:</b> {new Date().toLocaleDateString('en-GB')}
                </span>
              </div>

              {/* Stay Logistics */}
              <div className="space-y-1">
                <div className="font-bold border-l-2 border-sky-500 pl-2 text-slate-800 text-xs">
                  Stay Logistics
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>Lodging Contract Charges:</span>
                  <span>Rm ₹{baseLodging.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>[-] Advance Paid:</span>
                  <span>₹{advancePaid.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-900 font-bold border-t border-dashed border-slate-200 pt-1">
                  <span>Pending Lodging Settled:</span>
                  <span>₹{lodgingPendingDue.toFixed(2)}</span>
                </div>
              </div>

              {/* KOT Kitchen Incidentals */}
              <div className="space-y-1 pt-2">
                <div className="flex justify-between items-center font-bold border-l-2 border-sky-500 pl-2 text-slate-800 text-xs">
                  <span>KOT Kitchen Incidentals</span>
                  <span>Subtotal: ₹{foodTotal.toFixed(2)}</span>
                </div>
                <div className="space-y-1 pt-1">
                  {incidentals.map((it) => (
                    <div key={it.id} className="flex justify-between text-slate-700">
                      <span>
                        {it.name} x{it.quantity}
                      </span>
                      <span>₹{(it.price * it.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Adjustments: Extra Charges and Discounts */}
              {adjustments.length > 0 && (
                <div className="space-y-1 pt-2 border-t border-dashed border-slate-200">
                  <div className="font-bold border-l-2 border-amber-500 pl-2 text-slate-800 text-xs">
                    Applied Adjustments
                  </div>
                  <div className="space-y-1 pt-1">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex justify-between text-slate-700">
                        <span>↳ {adj.reason}</span>
                        <span
                          className={
                            adj.type === 'charge' ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'
                          }
                        >
                          {adj.type === 'charge' ? '+' : '-'}₹{adj.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="border-t-2 border-b-2 border-slate-900 py-2 flex justify-between font-extrabold text-sm text-slate-900">
                <span>Grand Total Payable:</span>
                <span>₹{grandTargetDue.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
