import React, { useRef, useCallback, useEffect } from 'react';
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

// Fixed 28 Aug 2026 - found live: for a MULTI_KEY property's own #dashboard tab with no room
// selected, App.tsx renders TodayOverview for the calendar, NOT OperationalDashboard - the
// booking-grid/kds-kitchen/checkin-folio/whatsapp-invoicing data-tour anchors all live inside
// OperationalDashboard, which only mounts once a SPECIFIC room is selected (same component the
// protected "Booking Calendar Row" note in CLAUDE.md describes as reused per-room). A plain
// handleNavigateTab('dashboard','dashboard') therefore never finds any of those 4 anchors, and
// driver.js's skipMissingElement cascades through every remaining step trying to find a match -
// when none of the 14 match, it reaches its own "no more steps" teardown path and silently marks
// the tour finished, which is why the trigger button used to vanish after one click with nothing
// ever visibly highlighted. Fix: drill into the first child room the exact same way the ota-sync
// step already correctly does, for every step whose anchor lives inside OperationalDashboard.
function goToFirstRoomDashboard(nav: TourNavContext): void {
  const roomSlug = nav.getFirstChildRoomSlug();
  if (roomSlug) {
    nav.onNavigateToRoom(roomSlug, 'dashboard');
  } else {
    // SINGLE-property fallback (shouldn't happen given this tour is MULTI_KEY-only, but avoids
    // silently stranding the tour if it's ever mounted somewhere unexpected).
    nav.handleNavigateTab('dashboard', 'dashboard');
  }
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
  goToFirstRoomDashboard(nav);
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
        beforeShow: goToFirstRoomDashboard,
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
        beforeShow: goToFirstRoomDashboard,
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
  const driverRef = useRef<Driver | null>(null);

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
    localStorage.setItem('demo_tour_completed', 'true');
    onStartTrialRequested?.();
  }, [onStartTrialRequested]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('demo_tour_completed', 'true');
  }, []);

  // Set right before intentionally calling moveTo() with an out-of-range index (Next on the
  // last step) so onDestroyStarted below can tell "finished naturally" apart from "dismissed
  // early via Escape/overlay-click" - both reach onDestroyStarted (see the driver.js source
  // notes below), but only the former should trigger onStartTrialRequested.
  const isFinishingRef = useRef(false);

  // Navigates to a given step's required app state (tab switch / clicks), WITHOUT itself waiting
  // for the target selector to mount - driver.js's own `waitForElement`/`skipMissingElement`
  // config (set on the driver() call below) already polls for the final highlight target once
  // moveTo() is called, so duplicating that wait here would be redundant. This function only
  // needs to handle the app-navigation side.
  const runBeforeShow = useCallback(async (index: number) => {
    if (index < 0 || index >= ALL_STEPS.length) return;
    await ALL_STEPS[index].beforeShow?.(navRef.current);
  }, []);

  const navigatingRef = useRef(false);

  const startTour = useCallback(() => {
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.65,
      popoverClass: 'app-tour-popover',
      // driver.js's own built-in wait: after moveTo() targets a step, it polls (MutationObserver
      // + timeout, verified in node_modules/driver.js source) for that step's element to appear
      // before highlighting, and skips the step entirely if it never does within this window -
      // exactly what's needed for tab-switch navigation whose target is lazy-loaded/code-split.
      waitForElement: 4000,
      skipMissingElement: true,
      steps: ALL_STEPS.map((step) => ({
        element: step.selector,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
        },
      })),
      // Overriding onNextClick/onPrevClick hands driver.js's own internal advance logic
      // entirely to us (confirmed in source: defining these skips the built-in moveNext/
      // movePrevious path) - so beforeShow's navigation always runs BEFORE moveTo() lets
      // driver.js start highlighting, on both Next and Prev.
      onNextClick: (_el, _step, opts) => {
        if (navigatingRef.current) return;
        const nextIndex = (opts.index ?? -1) + 1;
        if (nextIndex >= ALL_STEPS.length) {
          isFinishingRef.current = true;
          opts.driver.moveTo(nextIndex);
          return;
        }
        navigatingRef.current = true;
        void runBeforeShow(nextIndex)
          .then(() => opts.driver.moveTo(nextIndex))
          .finally(() => { navigatingRef.current = false; });
      },
      onPrevClick: (_el, _step, opts) => {
        if (navigatingRef.current) return;
        const prevIndex = (opts.index ?? 1) - 1;
        if (prevIndex < 0) return;
        navigatingRef.current = true;
        void runBeforeShow(prevIndex)
          .then(() => opts.driver.moveTo(prevIndex))
          .finally(() => { navigatingRef.current = false; });
      },
      // Defining onCloseClick hands the popover's own Close(X) button fully to us too (skips
      // driver.js's internal closeClick->destroy path entirely, confirmed in source) - a plain
      // direct destroy() here never reaches onDestroyStarted below (its `e` param is only true
      // on driver.js's OWN internal dismiss paths, not an app-called destroy()).
      onCloseClick: () => {
        d.destroy();
        handleSkip();
      },
      // Reached only via driver.js's own internal dismiss paths we don't override above -
      // Escape key and clicking the dimmed overlay (both confirmed in source to call its
      // internal h() with the default e=true, which invokes this hook instead of destroying
      // outright) - AND our own onNextClick's out-of-range moveTo() call above, which internally
      // takes the same h() path when the target index has no matching step. isFinishingRef
      // disambiguates the two.
      onDestroyStarted: () => {
        d.destroy();
        if (isFinishingRef.current) {
          isFinishingRef.current = false;
          handleComplete();
        } else {
          handleSkip();
        }
      },
    });

    driverRef.current = d;
    // beforeShow must complete BEFORE drive(0) starts - driver.js begins waiting for step 0's
    // element the instant drive() is called, so calling it first would start that wait against
    // whatever tab happened to be active before any tour navigation ran.
    navigatingRef.current = true;
    void runBeforeShow(0)
      .then(() => d.drive(0))
      .finally(() => { navigatingRef.current = false; });
  }, [runBeforeShow, handleComplete, handleSkip]);

  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  return (
    <div className="fixed bottom-20 right-6 z-40 flex items-center gap-2">
      <button
        type="button"
        onClick={startTour}
        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-2xl transition-all hover:scale-105 cursor-pointer ring-4 ring-blue-600/20"
      >
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>✨ {t('explore_full_app_tour_button', 'Explore Full App Tour')} ({ALL_STEPS.length} {t('tour_modules_label', 'steps')})</span>
      </button>
    </div>
  );
};
