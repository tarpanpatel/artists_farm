import React, { useState, useRef, useCallback, useEffect } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { Sparkles } from './icons/FlowbiteIcons';
import { t } from '../i18n/en';
import type { TabType } from './Navigation';

// Rebuilt 28 Aug 2026 - the previous version rendered a fixed bottom-right popover that never
// actually pointed at any real element (`targetSelector` was defined on every step but never read
// anywhere in the render logic - confirmed live via screenshot, "just like a small slide show").
// This version drives driver.js (https://driverjs.com/) against real `data-tour="..."` DOM anchors,
// navigating the app to the right tab/room/modal before each step and waiting for the target to
// actually mount before highlighting it. Scoped to MULTI_KEY properties only (explicit decision -
// the OTA-sync step's real anchor only exists per-room, via a child room's own `edit_property`
// sub-tab; a SINGLE-property equivalent would need a different path entirely).
//
// 2 steps from the original 16 were cut entirely rather than repurposed (explicit decision):
// "Custom WhatsApp Templates" (no such customization exists - it was explicitly removed 26 Aug
// 2026, see PropertyEditForm.tsx) and "1-Click GST Reports & Police Register Export" (no GST or
// police-register export exists anywhere in DataExportCenter.tsx - verified, zero matches).

export interface TourNavContext {
  handleNavigateTab: (tab: TabType, menuItemKey?: string) => void;
  onNavigateToRoom: (roomSlug: string, initialTab?: TabType) => void;
  getFirstChildRoomSlug: () => string | null;
}

interface TourStep {
  id: string;
  selector: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  beforeShow?: (nav: TourNavContext) => Promise<void> | void;
}

interface TourCategory {
  id: string;
  name: string;
  badge: string;
  steps: TourStep[];
}

// Shared by checkin-folio and whatsapp-invoicing (28 Aug 2026): both need BookingDetailsModal
// open, but they can't literally share one mounted instance - the ota-sync step in between
// navigates to a different room's edit_property sub-tab, which unmounts the Dashboard subtree
// (and its `selectedBooking` state) that opened the modal. Each step independently re-runs this
// same 2-click sequence instead: click the first visible booking bar (opens a small preview
// Popover), then its "View More" button (this is what actually calls setSelectedBooking() and
// opens the real modal). Demo data guarantees at least one real booking per room for a MULTI_KEY
// property, so this is safe to assume.
async function openFirstBookingModal(nav: TourNavContext): Promise<void> {
  nav.handleNavigateTab('dashboard', 'dashboard');
  const bar = await waitForElement('[data-tour="checkin-open-booking-bar"]');
  if (!bar) return;
  (bar as HTMLElement).click();
  const viewMore = await waitForElement('[data-tour="checkin-view-more"]');
  if (!viewMore) return;
  (viewMore as HTMLElement).click();
}

// Polls (rAF loop) rather than a fixed setTimeout - tab content in this app is React.lazy/Suspense
// code-split, so how long a target takes to actually mount varies with connection/cache state.
function waitForElement(selector: string, timeoutMs = 4000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    let done = false;
    const finish = (el: Element | null) => {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve(el);
    };

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) finish(found);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timeoutId = setTimeout(() => finish(null), timeoutMs);
  });
}

const TOUR_CATEGORIES: TourCategory[] = [
  {
    id: 'front-desk',
    name: 'Front Desk & Reservations',
    badge: 'Core PMS',
    steps: [
      {
        id: 'booking-grid',
        selector: '[data-tour="booking-grid"]',
        title: '📅 Interactive Booking Grid',
        description: 'Track real-time room availability, nightly tariffs, check-ins, check-outs, and guest folios in one unified calendar view.',
        side: 'bottom',
        beforeShow: (nav) => nav.handleNavigateTab('dashboard', 'dashboard'),
      },
      {
        id: 'checkin-folio',
        selector: '[data-tour="checkin-folio"]',
        title: '🔑 Fast Check-In & Guest ID Upload',
        description: 'Upload guest Aadhaar/Passport documents, record advance payments, and file C-Forms for international guests in under 30 seconds.',
        side: 'right',
        beforeShow: openFirstBookingModal,
      },
      {
        id: 'ota-sync',
        selector: '[data-tour="ota-sync"]',
        title: '🔄 2-Way OTA Calendar Sync (iCal)',
        description: 'Sync bookings automatically with Airbnb, Booking.com, Agoda, and MakeMyTrip to prevent double-bookings across channels.',
        side: 'bottom',
        beforeShow: (nav) => {
          const roomSlug = nav.getFirstChildRoomSlug();
          if (roomSlug) nav.onNavigateToRoom(roomSlug, 'edit_property');
        },
      },
      {
        id: 'whatsapp-invoicing',
        selector: '[data-tour="whatsapp-invoicing"]',
        title: '📲 1-Click WhatsApp Invoices',
        description: 'Send instant booking vouchers and GST tax invoices with scannable UPI QR codes directly to guest WhatsApp numbers.',
        side: 'right',
        beforeShow: openFirstBookingModal,
      },
    ],
  },
  {
    id: 'kds-kitchen',
    name: 'Kitchen Display & Dining',
    badge: 'Food & Beverage',
    steps: [
      {
        id: 'kds-kitchen',
        selector: '[data-tour="kds-kitchen"]',
        title: '🍳 Live Kitchen Display System',
        description: 'Streamline food prep timers, live kitchen order tickets, and room service delivery status on kitchen display screens.',
        side: 'bottom',
        beforeShow: (nav) => nav.handleNavigateTab('dashboard', 'dashboard'),
      },
      {
        id: 'recipe-builder',
        selector: '[data-tour="recipe-builder"]',
        title: '📖 Recipe Builder & Food Menu Manager',
        description: 'Manage food item pricing, categories, ingredients cost breakdown, and staff meal logs effortlessly.',
        side: 'top',
        beforeShow: (nav) => nav.handleNavigateTab('kitchen', 'beta_recipe_builder'),
      },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory & Stock Requisitions',
    badge: 'Store Operations',
    steps: [
      {
        id: 'inventory-stock',
        selector: '[data-tour="inventory-stock"]',
        title: '📦 Raw Material Stock Tracker',
        description: 'Track kitchen grocery stock, linen inventory, and cleaning supplies with automated low-stock reorder threshold alerts.',
        side: 'right',
        beforeShow: (nav) => nav.handleNavigateTab('inventory', 'edit_kitchen_stock'),
      },
      {
        id: 'stock-requisition',
        selector: '[data-tour="stock-requisition"]',
        title: '📋 Material Requisitions',
        description: 'Allow kitchen staff to request raw ingredients from store managers with complete approval and audit workflows.',
        side: 'left',
        beforeShow: (nav) => nav.handleNavigateTab('inventory', 'stock_requests'),
      },
    ],
  },
  {
    id: 'petty-cash',
    name: 'Petty Cash & Expense Control',
    badge: 'Financials',
    steps: [
      {
        id: 'petty-cash',
        selector: '[data-tour="petty-cash"]',
        title: '💰 Petty Cash & Vendor Expenses',
        description: 'Log daily vendor payouts, staff cash drawer shift openings/closings, and cash drawer reconciliations with zero discrepancy.',
        side: 'left',
        beforeShow: (nav) => nav.handleNavigateTab('petty_cash', 'expenses'),
      },
      {
        id: 'cash-drawer',
        selector: '[data-tour="cash-drawer"]',
        title: '💵 Shift Cash Drawer Balance',
        description: 'Reconcile cash collected at front desk shift changes with automated tallying of cash, UPI, card, and bank transfers.',
        side: 'top',
        beforeShow: (nav) => nav.handleNavigateTab('petty_cash', 'finances'),
      },
    ],
  },
  {
    id: 'staff-management',
    name: 'Staff, Attendance & Salary',
    badge: 'HR & Team',
    steps: [
      {
        id: 'staff-permissions',
        selector: '[data-tour="staff-permissions"]',
        title: '👥 Multi-Role Staff RBAC Permissions',
        description: 'Assign granular access roles (Front Desk, Kitchen Staff, Supervisor, Accountant) to control sensitive financial visibility.',
        side: 'bottom',
        beforeShow: (nav) => nav.handleNavigateTab('staff', 'staff_permissions'),
      },
      {
        id: 'attendance-salary',
        selector: '[data-tour="attendance-salary"]',
        title: '📅 Attendance Calendar & Monthly Salaries',
        description: 'Track daily staff present/absent logs, advance salary payouts, and generate automated monthly salary slips.',
        side: 'right',
        beforeShow: (nav) => nav.handleNavigateTab('staff', 'attendance_calendar'),
      },
    ],
  },
  {
    id: 'telegram-alerts',
    name: 'Real-Time Operations Alerts',
    badge: 'Push Bot',
    steps: [
      {
        id: 'telegram-alerts',
        selector: '[data-tour="telegram-alerts"]',
        title: '🤖 Real-Time Telegram Push Alerts',
        description: 'Get instant push alerts on your phone whenever a guest checks in, a kitchen order is placed, or cash is paid out.',
        side: 'left',
        beforeShow: (nav) => nav.handleNavigateTab('telegram', 'telegram'),
      },
    ],
  },
  {
    id: 'analytics-reports',
    name: 'Analytics & Business Intel',
    badge: 'Business Intel',
    steps: [
      {
        id: 'analytics-summary',
        selector: '[data-tour="analytics-summary"]',
        title: '📊 Revenue, ADR & Occupancy Analytics',
        description: 'Analyze daily occupancy rates, Average Daily Rate (ADR), and Profit per Room Night metrics.',
        side: 'top',
        beforeShow: (nav) => nav.handleNavigateTab('analytics', 'dashboard_analytics'),
      },
    ],
  },
];

const ALL_STEPS: TourStep[] = TOUR_CATEGORIES.flatMap((cat) => cat.steps);

interface DemoOnboardingTourProps {
  onStartTrialRequested?: () => void;
  handleNavigateTab: (tab: TabType, menuItemKey?: string) => void;
  onNavigateToRoom: (roomSlug: string, initialTab?: TabType) => void;
  firstChildRoomSlug: string | null;
}

export const DemoOnboardingTour: React.FC<DemoOnboardingTourProps> = ({
  onStartTrialRequested,
  handleNavigateTab,
  onNavigateToRoom,
  firstChildRoomSlug,
}) => {
  const [tourCompleted, setTourCompleted] = useState<boolean>(() => {
    return localStorage.getItem('demo_tour_completed') === 'true';
  });

  const driverRef = useRef<Driver | null>(null);
  const navigatingRef = useRef(false);

  // Refs so the driver.js config (built once, on tour start) always reads current values without
  // needing to be torn down and rebuilt every time a prop changes.
  const navRef = useRef<TourNavContext>({
    handleNavigateTab,
    onNavigateToRoom,
    getFirstChildRoomSlug: () => firstChildRoomSlug,
  });
  useEffect(() => {
    navRef.current = { handleNavigateTab, onNavigateToRoom, getFirstChildRoomSlug: () => firstChildRoomSlug };
  }, [handleNavigateTab, onNavigateToRoom, firstChildRoomSlug]);

  const handleComplete = useCallback(() => {
    setTourCompleted(true);
    localStorage.setItem('demo_tour_completed', 'true');
    onStartTrialRequested?.();
  }, [onStartTrialRequested]);

  const handleSkip = useCallback(() => {
    setTourCompleted(true);
    localStorage.setItem('demo_tour_completed', 'true');
  }, []);

  // The one function every transition (initial start, Next, Prev) funnels through - each step
  // fully describes its own required app state via beforeShow rather than a delta from the
  // previous step, so the same function handles both directions plus the very first step.
  const goToStep = useCallback(async (index: number, d: Driver) => {
    if (navigatingRef.current) return;
    if (index < 0) return;
    if (index >= ALL_STEPS.length) {
      d.destroy();
      handleComplete();
      return;
    }

    navigatingRef.current = true;
    try {
      const step = ALL_STEPS[index];
      await step.beforeShow?.(navRef.current);
      const found = await waitForElement(step.selector);
      if (!found) {
        // Selector never appeared (navigation failed, or this demo property genuinely has no
        // data for this step) - skip forward rather than leaving the tour stuck on a blank
        // highlight.
        navigatingRef.current = false;
        if (index + 1 < ALL_STEPS.length) {
          await goToStep(index + 1, d);
        } else {
          d.destroy();
          handleComplete();
        }
        return;
      }
      d.moveTo(index);
    } finally {
      navigatingRef.current = false;
    }
  }, [handleComplete]);

  const startTour = useCallback(() => {
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.65,
      popoverClass: 'app-tour-popover',
      steps: ALL_STEPS.map((step) => ({
        element: step.selector,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      })),
      onNextClick: (_el, _step, opts) => {
        void goToStep(opts.state.activeIndex! + 1, d);
      },
      onPrevClick: (_el, _step, opts) => {
        void goToStep((opts.state.activeIndex ?? 1) - 1, d);
      },
      onCloseClick: () => {
        d.destroy();
        handleSkip();
      },
      onDestroyStarted: () => {
        if (!d.hasNextStep()) {
          // Finished naturally (Next on the last step) - handled by goToStep's own
          // out-of-range branch, nothing to do here.
          d.destroy();
          return;
        }
        d.destroy();
        handleSkip();
      },
    });

    driverRef.current = d;
    void goToStep(0, d);
  }, [goToStep, handleSkip]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  if (tourCompleted) return null;

  return (
    <div className="fixed bottom-20 right-6 z-40 flex items-center gap-2">
      <button
        type="button"
        onClick={startTour}
        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-xl transition-all hover:scale-105 cursor-pointer"
      >
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>✨ {t('explore_full_app_tour_button', 'Explore Full App Tour')} ({ALL_STEPS.length} {t('tour_modules_label', 'steps')})</span>
      </button>
    </div>
  );
};
