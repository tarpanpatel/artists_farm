import React, { useState, useEffect } from 'react';
import { Popover } from './Popover';
import { Button } from './Button';
import {
  Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Calendar, MessageSquare,
  ChefHat, Wallet, BarChart3, Package, Users, Bell, FileText,
  ShieldCheck, Layers,
} from './icons/FlowbiteIcons';

export interface TourCategory {
  id: string;
  name: string;
  badge: string;
  steps: TourStep[];
}

export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  icon: React.ElementType;
}

export const COMPREHENSIVE_TOUR_CATEGORIES: TourCategory[] = [
  {
    id: 'front-desk',
    name: 'Front Desk & Reservations',
    badge: 'Core PMS',
    steps: [
      {
        id: 'booking-grid',
        targetSelector: '[data-tour="booking-grid"]',
        title: '📅 Interactive Booking Grid',
        description: 'Track real-time room availability, nightly tariffs, check-ins, check-outs, and guest folios in one unified calendar view.',
        placement: 'bottom',
        icon: Calendar,
      },
      {
        id: 'checkin-folio',
        targetSelector: '[data-tour="checkin-folio"]',
        title: '🔑 Fast Check-In & Guest ID Upload',
        description: 'Upload guest Aadhaar/Passport documents, record advance payments, and file C-Forms for international guests in under 30 seconds.',
        placement: 'right',
        icon: ShieldCheck,
      },
      {
        id: 'ota-sync',
        targetSelector: '[data-tour="ota-sync"]',
        title: '🔄 2-Way OTA Calendar Sync (iCal)',
        description: 'Sync bookings automatically with Airbnb, Booking.com, Agoda, and MakeMyTrip to prevent double-bookings across channels.',
        placement: 'bottom',
        icon: Layers,
      },
    ],
  },
  {
    id: 'whatsapp-billing',
    name: 'WhatsApp Bills & UPI QR',
    badge: 'Automation',
    steps: [
      {
        id: 'whatsapp-invoicing',
        targetSelector: '[data-tour="whatsapp-invoicing"]',
        title: '📲 1-Click WhatsApp Invoices',
        description: 'Send instant booking vouchers and GST tax invoices with scannable UPI QR codes directly to guest WhatsApp numbers.',
        placement: 'right',
        icon: MessageSquare,
      },
      {
        id: 'whatsapp-templates',
        targetSelector: '[data-tour="whatsapp-templates"]',
        title: '📝 Custom WhatsApp Templates',
        description: 'Customize automated welcome notes, check-out thank you messages, and payment reminders in English and regional languages.',
        placement: 'left',
        icon: MessageSquare,
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
        targetSelector: '[data-tour="kds-kitchen"]',
        title: '🍳 Live Kitchen Display System',
        description: 'Streamline food prep timers, live kitchen order tickets, and room service delivery status on kitchen display screens.',
        placement: 'bottom',
        icon: ChefHat,
      },
      {
        id: 'recipe-builder',
        targetSelector: '[data-tour="recipe-builder"]',
        title: '📖 Recipe Builder & Food Menu Manager',
        description: 'Manage food item pricing, categories, ingredients cost breakdown, and staff meal logs effortlessly.',
        placement: 'top',
        icon: ChefHat,
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
        targetSelector: '[data-tour="inventory-stock"]',
        title: '📦 Raw Material Stock Tracker',
        description: 'Track kitchen grocery stock, linen inventory, and cleaning supplies with automated low-stock reorder threshold alerts.',
        placement: 'right',
        icon: Package,
      },
      {
        id: 'stock-requisition',
        targetSelector: '[data-tour="stock-requisition"]',
        title: '📋 Material Requisitions',
        description: 'Allow kitchen staff to request raw ingredients from store managers with complete approval and audit workflows.',
        placement: 'left',
        icon: Package,
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
        targetSelector: '[data-tour="petty-cash"]',
        title: '💰 Petty Cash & Vendor Expenses',
        description: 'Log daily vendor payouts, staff cash drawer shift openings/closings, and cash drawer reconciliations with zero discrepancy.',
        placement: 'left',
        icon: Wallet,
      },
      {
        id: 'cash-drawer',
        targetSelector: '[data-tour="cash-drawer"]',
        title: '💵 Shift Cash Drawer Balance',
        description: 'Reconcile cash collected at front desk shift changes with automated tallying of cash, UPI, card, and bank transfers.',
        placement: 'top',
        icon: Wallet,
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
        targetSelector: '[data-tour="staff-permissions"]',
        title: '👥 Multi-Role Staff RBAC Permissions',
        description: 'Assign granular access roles (Front Desk, Kitchen Staff, Supervisor, Accountant) to control sensitive financial visibility.',
        placement: 'bottom',
        icon: Users,
      },
      {
        id: 'attendance-salary',
        targetSelector: '[data-tour="attendance-salary"]',
        title: '📅 Attendance Calendar & Monthly Salaries',
        description: 'Track daily staff present/absent logs, advance salary payouts, and generate automated monthly salary slips.',
        placement: 'right',
        icon: Users,
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
        targetSelector: '[data-tour="telegram-alerts"]',
        title: '🤖 Real-Time Telegram Push Alerts',
        description: 'Get instant push alerts on your phone whenever a guest checks in, a kitchen order is placed, or cash is paid out.',
        placement: 'left',
        icon: Bell,
      },
    ],
  },
  {
    id: 'analytics-reports',
    name: 'Analytics, Audit & GST Export',
    badge: 'Business Intel',
    steps: [
      {
        id: 'analytics-summary',
        targetSelector: '[data-tour="analytics-summary"]',
        title: '📊 Revenue, ADR & Occupancy Analytics',
        description: 'Analyze daily occupancy rates, Average Daily Rate (ADR), RevPAR metrics, and payment mode breakdowns.',
        placement: 'top',
        icon: BarChart3,
      },
      {
        id: 'gst-export',
        targetSelector: '[data-tour="gst-export"]',
        title: '📄 1-Click GST Reports & Police Register Export',
        description: 'Export clean Excel/CSV reports for monthly GST returns, B2B invoices, and local police register requirements.',
        placement: 'left',
        icon: FileText,
      },
    ],
  },
];

interface DemoOnboardingTourProps {
  onStartTrialRequested?: () => void;
}

export const DemoOnboardingTour: React.FC<DemoOnboardingTourProps> = ({ onStartTrialRequested }) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(COMPREHENSIVE_TOUR_CATEGORIES[0].id);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [tourCompleted, setTourCompleted] = useState<boolean>(() => {
    return localStorage.getItem('demo_tour_completed') === 'true';
  });

  const currentCategory = COMPREHENSIVE_TOUR_CATEGORIES.find((c) => c.id === activeCategoryId) || COMPREHENSIVE_TOUR_CATEGORIES[0];

  useEffect(() => {
    // Auto-start on first visit
    if (!tourCompleted && activeStepIndex === null) {
      const timer = setTimeout(() => {
        setActiveStepIndex(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [tourCompleted, activeStepIndex]);

  const handleNext = () => {
    if (activeStepIndex === null) return;
    if (activeStepIndex < currentCategory.steps.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    } else {
      // Advance to next category
      const currentCatIdx = COMPREHENSIVE_TOUR_CATEGORIES.findIndex((c) => c.id === activeCategoryId);
      if (currentCatIdx < COMPREHENSIVE_TOUR_CATEGORIES.length - 1) {
        setActiveCategoryId(COMPREHENSIVE_TOUR_CATEGORIES[currentCatIdx + 1].id);
        setActiveStepIndex(0);
      } else {
        handleComplete();
      }
    }
  };

  const handlePrev = () => {
    if (activeStepIndex === null) return;
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    } else {
      const currentCatIdx = COMPREHENSIVE_TOUR_CATEGORIES.findIndex((c) => c.id === activeCategoryId);
      if (currentCatIdx > 0) {
        const prevCat = COMPREHENSIVE_TOUR_CATEGORIES[currentCatIdx - 1];
        setActiveCategoryId(prevCat.id);
        setActiveStepIndex(prevCat.steps.length - 1);
      }
    }
  };

  const handleSkip = () => {
    setActiveStepIndex(null);
    setTourCompleted(true);
    localStorage.setItem('demo_tour_completed', 'true');
  };

  const handleComplete = () => {
    setActiveStepIndex(null);
    setTourCompleted(true);
    localStorage.setItem('demo_tour_completed', 'true');
    onStartTrialRequested?.();
  };

  const handleSelectModule = (catId: string) => {
    setActiveCategoryId(catId);
    setActiveStepIndex(0);
    setTourCompleted(false);
  };

  if (activeStepIndex === null) {
    return (
      <div className="fixed bottom-20 right-6 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => handleSelectModule(COMPREHENSIVE_TOUR_CATEGORIES[0].id)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-full shadow-xl transition-all hover:scale-105 cursor-pointer"
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>✨ Explore Full App Tour (8 Modules)</span>
        </button>
      </div>
    );
  }

  const step = currentCategory.steps[activeStepIndex] || currentCategory.steps[0];
  const StepIcon = step.icon;
  const isFirstOverall = activeCategoryId === COMPREHENSIVE_TOUR_CATEGORIES[0].id && activeStepIndex === 0;
  const isLastOverall = activeCategoryId === COMPREHENSIVE_TOUR_CATEGORIES[COMPREHENSIVE_TOUR_CATEGORIES.length - 1].id && activeStepIndex === currentCategory.steps.length - 1;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover
        open={true}
        onOpenChange={(open) => {
          if (!open) handleSkip();
        }}
        placement={step.placement}
        title={
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-gray-900 dark:text-white">
            <div className="flex items-center gap-1.5 min-w-0">
              <StepIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="truncate">{step.title}</span>
            </div>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shrink-0">
              {currentCategory.name} • {activeStepIndex + 1}/{currentCategory.steps.length}
            </span>
          </div>
        }
        content={
          // px-3 py-2 + text-gray-600 dark:text-gray-300 matches every other Popover
          // usage's own content wrapper in this app (see Header.tsx, ConvertOtaBookingModal.tsx)
          // - Popover.tsx itself never pads {content}, only its optional title bar, so a caller
          // that skips this renders its body flush against the card's rounded edges.
          <div className="px-3 py-2 space-y-3 max-w-sm text-gray-600 dark:text-gray-300">
            {/* Category Selector Pill Bar */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-gray-100 dark:border-gray-700">
              {COMPREHENSIVE_TOUR_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectModule(cat.id)}
                  className={`px-2 py-0.5 text-2xs font-medium rounded-full transition-all shrink-0 cursor-pointer ${cat.id === activeCategoryId ? 'bg-blue-600 text-white font-bold' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}
                >
                  {cat.badge}
                </button>
              ))}
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
              {step.description}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleSkip}
                className="text-2xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 cursor-pointer"
              >
                Skip Tour
              </button>

              <div className="flex items-center gap-2">
                {!isFirstOverall && (
                  <Button variant="secondary" size="sm" onClick={handlePrev} className="h-8! px-2.5! text-2xs">
                    <ArrowLeft className="w-3 h-3 mr-1" /> Prev
                  </Button>
                )}

                <Button variant="primary" size="sm" onClick={handleNext} className="h-8! px-3! text-2xs">
                  {isLastOverall ? (
                    <>
                      <span>Start 30-Day Free Trial</span>
                      <CheckCircle2 className="w-3.5 h-3.5 ml-1" />
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        }
      >
        <div className="w-2 h-2 opacity-0 pointer-events-none" />
      </Popover>
    </div>
  );
};
