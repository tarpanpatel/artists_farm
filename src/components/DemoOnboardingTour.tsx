import React, { useState, useEffect } from 'react';
import { Popover } from './Popover';
import { Button } from './Button';
import { Sparkles, ArrowRight, ArrowLeft, X, CheckCircle2, Calendar, MessageSquare, ChefHat, Wallet, BarChart3 } from './icons/FlowbiteIcons';

interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  placement: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  icon: React.ElementType;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'booking-grid',
    targetSelector: '[data-tour="booking-grid"]',
    title: '📅 Interactive Multi-Room Grid',
    description: 'Track real-time room tariffs, check-ins, check-outs, and guest folios in one unified calendar view.',
    placement: 'bottom',
    icon: Calendar,
  },
  {
    id: 'whatsapp-invoicing',
    targetSelector: '[data-tour="whatsapp-invoicing"]',
    title: '📲 1-Click WhatsApp Bills',
    description: 'Send instant booking confirmations and tax receipts with scannable UPI QR codes directly to guest WhatsApp numbers.',
    placement: 'right',
    icon: MessageSquare,
  },
  {
    id: 'kds-kitchen',
    targetSelector: '[data-tour="kds-kitchen"]',
    title: '🍳 Live Kitchen Display (KDS)',
    description: 'Streamline food preparation timers, room service orders, and kitchen stock requisitions in real time.',
    placement: 'bottom',
    icon: ChefHat,
  },
  {
    id: 'petty-cash',
    targetSelector: '[data-tour="petty-cash"]',
    title: '💰 Petty Cash & Expenses',
    description: 'Log daily vendor payouts, staff cash drawer entries, and audit logs with complete financial accountability.',
    placement: 'left',
    icon: Wallet,
  },
  {
    id: 'analytics-summary',
    targetSelector: '[data-tour="analytics-summary"]',
    title: '📊 Revenue & Occupancy Reports',
    description: 'Monitor daily occupancy rates, revenue metrics, and GST reports across single or multi-room properties.',
    placement: 'top',
    icon: BarChart3,
  },
];

interface DemoOnboardingTourProps {
  onStartTrialRequested?: () => void;
}

export const DemoOnboardingTour: React.FC<DemoOnboardingTourProps> = ({ onStartTrialRequested }) => {
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [tourCompleted, setTourCompleted] = useState<boolean>(() => {
    return localStorage.getItem('demo_tour_completed') === 'true';
  });

  useEffect(() => {
    // Auto-start tour on first visit if not completed yet
    if (!tourCompleted && activeStepIndex === null) {
      const timer = setTimeout(() => {
        setActiveStepIndex(0);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [tourCompleted, activeStepIndex]);

  const handleNext = () => {
    if (activeStepIndex === null) return;
    if (activeStepIndex < TOUR_STEPS.length - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (activeStepIndex === null) return;
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
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

  const handleRestartTour = () => {
    setActiveStepIndex(0);
    setTourCompleted(false);
  };

  if (activeStepIndex === null) {
    return (
      <div className="fixed bottom-20 right-6 z-40">
        <button
          type="button"
          onClick={handleRestartTour}
          className="flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full shadow-lg transition-all hover:scale-105"
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>Take Feature Tour</span>
        </button>
      </div>
    );
  }

  const step = TOUR_STEPS[activeStepIndex];
  const StepIcon = step.icon;
  const isFirst = activeStepIndex === 0;
  const isLast = activeStepIndex === TOUR_STEPS.length - 1;

  // Render dummy trigger for Popover anchor
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <Popover
        open={true}
        onOpenChange={(open) => {
          if (!open) handleSkip();
        }}
        placement={step.placement}
        zIndex={99999}
        title={
          <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-900 dark:text-white">
            <div className="flex items-center gap-1.5">
              <StepIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{step.title}</span>
            </div>
            <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
              Step {activeStepIndex + 1} of {TOUR_STEPS.length}
            </span>
          </div>
        }
        content={
          <div className="space-y-3 max-w-sm">
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {step.description}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleSkip}
                className="text-2xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Skip Tour
              </button>

              <div className="flex items-center gap-2">
                {!isFirst && (
                  <Button variant="outline" size="sm" onClick={handlePrev} className="!h-8 !px-2.5 text-2xs">
                    <ArrowLeft className="w-3 h-3 mr-1" /> Prev
                  </Button>
                )}

                <Button variant="primary" size="sm" onClick={handleNext} className="!h-8 !px-3 text-2xs">
                  {isLast ? (
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
