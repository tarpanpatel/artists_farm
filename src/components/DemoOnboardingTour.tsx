import React, { useRef, useCallback, useEffect } from 'react';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { Sparkles } from './icons/FlowbiteIcons';
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

// Shared by checkin-folio, cform-filing, and whatsapp-invoicing (28 Aug 2026): all three need BookingDetailsModal
// open and stay inside the drawer sequentially. Each step safely ensures the modal is open.
async function openFirstBookingModal(nav: TourNavContext): Promise<void> {
  // Clean up any lingering hover preview popovers in DOM
  document.querySelectorAll('[data-popover]').forEach((el) => {
    (el as HTMLElement).style.display = 'none';
  });

  // If modal is already open with data-tour="checkin-folio", return early
  if (document.querySelector('[data-tour="checkin-folio"]')) return;

  // Try to find a booking capsule on the current page (e.g. TodayOverview or room OperationalDashboard)
  let bar = document.querySelector('[data-tour="checkin-open-booking-bar"]') as HTMLElement | null;
  if (!bar) {
    goToFirstRoomDashboard(nav);
    bar = (await waitForElement('[data-tour="checkin-open-booking-bar"]', 3000)) as HTMLElement | null;
  }
  if (!bar) return;

  bar.click();

  // Dismiss any hover preview popover that might have opened
  document.querySelectorAll('[data-popover]').forEach((el) => {
    (el as HTMLElement).style.display = 'none';
  });

  // If a preview popover with "View More" appears (on single room OperationalDashboard), click it
  const viewMore = (await waitForElement('[data-tour="checkin-view-more"]', 800)) as HTMLElement | null;
  if (viewMore) {
    viewMore.click();
  }

  // Wait for the modal content to finish mounting
  await waitForElement('[data-tour="checkin-folio"]', 3000);
}

async function openCFormSection(nav: TourNavContext): Promise<void> {
  await openFirstBookingModal(nav);
  // Auto-expand C-Form section if it is collapsed
  const checkbox = document.querySelector('#c-form-filed-checkbox') as HTMLInputElement | null;
  if (checkbox && !checkbox.checked) {
    checkbox.click();
  }
  await waitForElement('[data-tour="cform-filing"]', 2000);
}

async function openSharePreview(nav: TourNavContext): Promise<void> {
  await openFirstBookingModal(nav);
  // Click Share button if preview drawer is not already open
  if (!document.querySelector('[data-tour="share-preview-drawer"]')) {
    const shareBtn = (await waitForElement('[data-tour="whatsapp-invoicing"]', 2000)) as HTMLElement | null;
    if (shareBtn) {
      shareBtn.click();
    }
  }
  await waitForElement('[data-tour="share-preview-drawer"]', 2000);
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
    name: 'Front Desk & Daily Operations',
    badge: 'Core PMS',
    steps: [
      {
        id: 'booking-grid',
        selector: '[data-tour="booking-grid"]',
        title: '📅 Multi-Room Calendar & Daily Operations Overview',
        description: 'Track real-time room availability, daily tariffs, active kitchen orders, pending guest requests, and manage folios right from one unified calendar — getting 50% of your daily operations done instantly.',
        side: 'bottom',
        beforeShow: (nav) => nav.handleNavigateTab('dashboard', 'dashboard'),
      },
      {
        id: 'checkin-folio',
        selector: '[data-tour="checkin-folio"]',
        title: '🔑 Fast Check-In, ID Upload & C-Form Barcode Scan',
        description: 'Effortlessly upload guest Aadhaar/Passport IDs, record advance payments, and upload foreign C-Form PDFs where the Applicant ID is automatically detected via barcode scan and saved to booking records in seconds.',
        side: 'right',
        beforeShow: openCFormSection,
      },
      {
        id: 'whatsapp-invoicing',
        selector: '[data-tour="share-preview-drawer"]',
        title: '📲 1-Click Share & Real-Time WhatsApp Message Preview',
        description: 'Click Share to review the exact formatted booking confirmation and GST bill before sending — complete with guest details, check-in dates, maps link, and scannable UPI QR payment code.',
        side: 'left',
        beforeShow: openSharePreview,
      },
      {
        id: 'bookings-manager',
        selector: '[data-tour="bookings-manager"]',
        title: '📋 Past, Present & Future Bookings Manager',
        description: 'Search and filter across all historical stays, currently checked-in guests, and upcoming future reservations with real-time balance tracking, folios, and instant check-out workflows.',
        side: 'top',
        beforeShow: (nav) => nav.handleNavigateTab('guests', 'all_bookings'),
      },
      {
        id: 'service-requests-board',
        selector: '[data-tour="service-requests-board"]',
        title: '🛎️ Service Requests & 1-Tap Telegram Fulfillment',
        description: 'Log guest housekeeping and room service requests in seconds. Staff get instant Telegram push notifications and can fulfill or update tasks with 1 tap directly from Telegram without needing to open the app.',
        side: 'top',
        beforeShow: (nav) => nav.handleNavigateTab('service_requests', 'service_requests'),
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
        id: 'mobile-bottom-nav',
        selector: '[data-tour="mobile-bottom-nav"]',
        title: '📱 Quick Actions & Mobile Navigation',
        description: 'Quickly access 1-tap booking creation, instant expense logging, food ordering, and seamless navigation across all resort management screens.',
        side: 'top',
        beforeShow: goToFirstRoomDashboard,
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
        beforeShow: (nav) => nav.handleNavigateTab('inventory', 'stock_log'),
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
        id: 'create-team-member',
        selector: '[data-tour="create-team-member"]',
        title: '➕ Add New Staff & Team Accounts',
        description: 'Create and configure new staff member profiles, assign roles, set daily wages or monthly salaries, and manage operational permissions.',
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
  {
    id: 'recipe-builder',
    name: 'Food Menu & Recipe Builder',
    badge: 'Menu Management',
    steps: [
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
  const [hasCompletedOnce, setHasCompletedOnce] = React.useState<boolean>(() => {
    return localStorage.getItem('demo_tour_completed') === 'true';
  });
  const [isTourActive, setIsTourActive] = React.useState<boolean>(false);

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
    setIsTourActive(false);
    setHasCompletedOnce(true);
    localStorage.setItem('demo_tour_completed', 'true');
    onStartTrialRequested?.();
  }, [onStartTrialRequested]);

  const handleSkip = useCallback(() => {
    setIsTourActive(false);
    setHasCompletedOnce(true);
    localStorage.setItem('demo_tour_completed', 'true');
  }, []);

  // Set right before intentionally calling moveTo() with an out-of-range index (Next on the
  // last step) so onDestroyStarted below can tell "finished naturally" apart from "dismissed
  // early via Escape/overlay-click" - both reach onDestroyStarted (see the driver.js source
  // notes below), but only the former should trigger onStartTrialRequested.
  const isFinishingRef = useRef(false);

  // Navigates to a given step's required app state (tab switch / clicks), WITHOUT itself waiting
  // for the target selector to mount - driver.js's own `waitForElement` config already polls for
  // the final highlight target once moveTo() is called.
  const runBeforeShow = useCallback(async (index: number) => {
    if (index < 0 || index >= ALL_STEPS.length) return;
    const step = ALL_STEPS[index];
    if (step.id !== 'checkin-folio' && step.id !== 'whatsapp-invoicing') {
      const closeBtn = document.querySelector('.booking-details-drawer [data-testid="flowbite-drawer-close-button"], [data-testid="modal-close-button"], [aria-label="Close drawer"]') as HTMLElement | null;
      if (closeBtn) closeBtn.click();
    }
    await step.beforeShow?.(navRef.current);
  }, []);

  const navigatingRef = useRef(false);

  const startTour = useCallback(() => {
    setIsTourActive(true);
    const d = driver({
      showProgress: true,
      allowClose: true,
      overlayOpacity: 0.50,
      popoverClass: 'app-tour-popover',
      waitForElement: 4000,
      skipMissingElement: false,
      steps: ALL_STEPS.map((step, idx) => ({
        element: step.selector,
        popover: {
          title: step.title,
          description: step.description,
          side: step.side,
          align: step.align,
          nextBtnText: idx === ALL_STEPS.length - 1 ? 'Get Started' : 'Next',
          prevBtnText: 'Previous',
          showButtons: idx === 0 ? ['next', 'close'] : ['previous', 'next', 'close'],
        },
      })),
      onNextClick: (_el, _step, opts) => {
        if (navigatingRef.current) return;
        const currentIdx = opts.driver.getActiveIndex() ?? opts.index ?? 0;
        const nextIndex = currentIdx + 1;
        if (nextIndex >= ALL_STEPS.length) {
          isFinishingRef.current = true;
          setIsTourActive(false);
          d.destroy();
          handleComplete();
          return;
        }
        navigatingRef.current = true;
        void runBeforeShow(nextIndex)
          .then(() => opts.driver.moveTo(nextIndex))
          .finally(() => { navigatingRef.current = false; });
      },
      onPrevClick: (_el, _step, opts) => {
        if (navigatingRef.current) return;
        const currentIdx = opts.driver.getActiveIndex() ?? opts.index ?? 0;
        const prevIndex = currentIdx - 1;
        if (prevIndex < 0) return;
        navigatingRef.current = true;
        void runBeforeShow(prevIndex)
          .then(() => opts.driver.moveTo(prevIndex))
          .finally(() => { navigatingRef.current = false; });
      },
      onDoneClick: () => {
        setIsTourActive(false);
        d.destroy();
        handleComplete();
      },
      onCloseClick: () => {
        setIsTourActive(false);
        d.destroy();
        handleSkip();
      },
      onDestroyStarted: () => {
        setIsTourActive(false);
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

  if (isTourActive) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-6 z-50 flex items-center gap-2">
      <button
        type="button"
        onClick={startTour}
        className="flex items-center gap-2 px-4 py-2.5 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-xl transition-all hover:scale-102 cursor-pointer ring-4 ring-blue-600/20 active:scale-98"
      >
        <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
        <span>
          {hasCompletedOnce ? '✨ Restart App Tour' : '✨ Explore Full App Tour'} ({ALL_STEPS.length} steps)
        </span>
      </button>
    </div>
  );
};
