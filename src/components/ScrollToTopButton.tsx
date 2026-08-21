import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { Tooltip } from './Tooltip';

interface ScrollToTopButtonProps {
  threshold?: number;
}

/**
 * Mobile-only "back to top" button - appears after scrolling past `threshold`
 * (default 500px) and smooth-scrolls back to the top on click. Mounted once,
 * globally, in main.tsx (a sibling of <App />) rather than per-page, so
 * every view gets the same condition automatically instead of each page
 * shell having to remember to wire it up.
 *
 * Most pages scroll the window, but a few (e.g. RootAdminDashboard's own
 * <main overflow-auto>) scroll an internal container instead, where
 * window.scrollY never changes. A capture-phase listener on `document`
 * catches scroll events from any of them - scroll events don't bubble, but
 * capture-phase listeners on an ancestor still see them - so this needs no
 * per-page scrollContainerRef prop; whichever element last scrolled becomes
 * the active target for both the visibility check and the click handler.
 */
export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({ threshold = 500 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const activeScrollElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const getScrollTop = (target: EventTarget | null): number => {
      if (!target || target === document || target === window) {
        return window.scrollY || document.documentElement.scrollTop;
      }
      return (target as HTMLElement).scrollTop;
    };

    const handleScroll = (e: Event) => {
      const isWindowOrDocument = e.target === document || e.target === window;
      activeScrollElRef.current = isWindowOrDocument ? null : (e.target as HTMLElement);
      setIsVisible(getScrollTop(e.target) > threshold);
    };

    // capture: true catches scroll events bubbling up from any internally
    // scrolling descendant, not just the window itself.
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', handleScroll, true);
  }, [threshold]);

  const handleClick = () => {
    const el = activeScrollElRef.current;
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!isVisible) return null;

  return (
    <Tooltip content="Scroll to top" position="left">
      <button
        type="button"
        onClick={handleClick}
        aria-label="Scroll to top"
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-lg flex items-center justify-center cursor-pointer transition-transform"
      >
        <ArrowUp className="w-5 h-5 shrink-0" />
      </button>
    </Tooltip>
  );
};
