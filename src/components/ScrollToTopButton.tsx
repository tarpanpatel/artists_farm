import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopButtonProps {
  // Most page shells scroll the window itself; RootAdminDashboard scrolls
  // its own <main> instead (it has its own overflow-auto), so this accepts
  // an optional ref to that element and falls back to window when omitted.
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  threshold?: number;
}

/**
 * Mobile-only "back to top" button - appears after scrolling past `threshold`
 * (default 1000px) and smooth-scrolls back to the top of the page on click.
 * Positioned bottom-left (not bottom-right, which the toast container and the
 * install-app banner both use) and sits above them (z-40) with enough bottom
 * offset to stay clear of the install banner when it's showing.
 */
export const ScrollToTopButton: React.FC<ScrollToTopButtonProps> = ({
  scrollContainerRef,
  threshold = 1000,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const target: HTMLElement | Window = scrollContainerRef?.current || window;

    const handleScroll = () => {
      const scrollTop =
        target === window
          ? window.scrollY
          : (target as HTMLElement).scrollTop;
      setIsVisible(scrollTop > threshold);
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => target.removeEventListener('scroll', handleScroll);
  }, [scrollContainerRef, threshold]);

  const handleClick = () => {
    const target = scrollContainerRef?.current;
    if (target) {
      target.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!isVisible) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Scroll to top"
      title="Scroll to top"
      className="md:hidden fixed bottom-24 right-4 z-40 w-12 h-12 aspect-square shrink-0 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-lg transition-all flex items-center justify-center cursor-pointer scroll-to-top-button"
    >
      <ArrowUp className="w-5 h-5 shrink-0 scroll-to-top-button__icon" />
    </button>
  );
};
