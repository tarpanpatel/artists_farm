import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface PopoverProps {
  content: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactElement<any>;
  trigger?: 'hover' | 'click';
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  offset?: number;
  arrow?: boolean;
  // Default 50 matches the app-wide z-index scale's "ordinary in-page
  // popover" tier (see custom.css's documented scale) - fine for a trigger
  // living in normal page content, but this portals straight to
  // document.body, so a trigger placed INSIDE an already-open z-60/z-70/z-100
  // secondary modal (date pickers, mobile cart drawers, etc. per that same
  // scale) needs an explicit higher value here or its content renders
  // behind that modal's own panel - found 23 Aug 2026 wiring a "Help?"
  // popover into ConvertOtaBookingModal (a z-70 Drawer).
  zIndex?: number;
}

export const Popover: React.FC<PopoverProps> = ({
  content,
  title,
  children,
  trigger = 'click',
  placement = 'top',
  className = '',
  open: controlledOpen,
  onOpenChange,
  offset = 8,
  arrow = true,
  zIndex = 9999,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

  const setIsOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setInternalOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  const targetRef = useRef<HTMLElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<number | null>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    actualPlacement: 'top' | 'bottom' | 'left' | 'right';
    arrowOffset: number;
  }>({
    top: 0,
    left: 0,
    actualPlacement: placement === 'auto' ? 'top' : placement,
    arrowOffset: 0,
  });

  const [isMeasured, setIsMeasured] = useState(false);

  const updatePosition = useCallback(() => {
    if (!targetRef.current || !popoverRef.current) return;

    const targetRect = targetRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let chosenPlacement: 'top' | 'bottom' | 'left' | 'right' =
      placement === 'auto' ? 'top' : placement;

    if (placement === 'auto' || placement === 'top') {
      if (targetRect.top - popoverRect.height - offset < 8) {
        chosenPlacement = 'bottom';
      } else {
        chosenPlacement = 'top';
      }
    } else if (placement === 'bottom') {
      if (targetRect.bottom + popoverRect.height + offset > viewportHeight - 8) {
        chosenPlacement = 'top';
      } else {
        chosenPlacement = 'bottom';
      }
    } else if (placement === 'left') {
      if (targetRect.left - popoverRect.width - offset < 8) {
        chosenPlacement = 'right';
      } else {
        chosenPlacement = 'left';
      }
    } else if (placement === 'right') {
      if (targetRect.right + popoverRect.width + offset > viewportWidth - 8) {
        chosenPlacement = 'left';
      } else {
        chosenPlacement = 'right';
      }
    }

    let top = 0;
    let left = 0;

    if (chosenPlacement === 'top') {
      top = targetRect.top - popoverRect.height - offset;
      left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
    } else if (chosenPlacement === 'bottom') {
      top = targetRect.bottom + offset;
      left = targetRect.left + (targetRect.width - popoverRect.width) / 2;
    } else if (chosenPlacement === 'left') {
      top = targetRect.top + (targetRect.height - popoverRect.height) / 2;
      left = targetRect.left - popoverRect.width - offset;
    } else if (chosenPlacement === 'right') {
      top = targetRect.top + (targetRect.height - popoverRect.height) / 2;
      left = targetRect.right + offset;
    }

    // Keep within horizontal viewport boundaries with padding
    const padding = 8;
    const clampedLeft = Math.max(padding, Math.min(viewportWidth - popoverRect.width - padding, left));
    const clampedTop = Math.max(padding, Math.min(viewportHeight - popoverRect.height - padding, top));

    // Calculate exact arrow offset so it points directly at the center of the trigger element
    const targetCenterX = targetRect.left + targetRect.width / 2;
    const targetCenterY = targetRect.top + targetRect.height / 2;

    let arrowOffset = 0;
    if (chosenPlacement === 'top' || chosenPlacement === 'bottom') {
      arrowOffset = targetCenterX - clampedLeft;
      arrowOffset = Math.max(16, Math.min(popoverRect.width - 16, arrowOffset));
    } else {
      arrowOffset = targetCenterY - clampedTop;
      arrowOffset = Math.max(16, Math.min(popoverRect.height - 16, arrowOffset));
    }

    setCoords({
      top: Math.round(clampedTop),
      left: Math.round(clampedLeft),
      actualPlacement: chosenPlacement,
      arrowOffset: Math.round(arrowOffset),
    });
    setIsMeasured(true);
  }, [offset, placement]);

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!isOpen) {
      setIsMeasured(false);
      return;
    }

    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = () => updatePosition();
    const handleResize = () => updatePosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updatePosition]);

  // Click outside to close (for click triggers)
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        targetRef.current &&
        !targetRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, setIsOpen]);

  const handleMouseEnter = () => {
    if (trigger !== 'hover') return;
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (trigger !== 'hover') return;
    hideTimeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (children.props.onClick) {
      children.props.onClick(e);
    }
    if (hideTimeoutRef.current) {
      window.clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsOpen(!isOpen);
  };

  const clonedChild = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      targetRef.current = node;
      const childRef = (children as any).ref;
      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef && typeof childRef === 'object') {
        childRef.current = node;
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      handleMouseEnter();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      handleMouseLeave();
    },
    onClick: handleClick,
  });

  return (
    <>
      {clonedChild}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            data-popover
            role="tooltip"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex,
              opacity: isMeasured ? 1 : 0,
              visibility: isMeasured ? 'visible' : 'hidden',
            }}
            className={`transition-opacity duration-150 animate-in fade-in zoom-in-95 inline-block ${className}`}
          >
            {/* Flowbite Canonical Popover Container */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden max-w-xs sm:max-w-sm">
              {title && (
                <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/70 border-b border-gray-200 dark:border-gray-700">
                  {typeof title === 'string' ? (
                    <h3 className="font-semibold text-gray-900 dark:text-white text-xs">{title}</h3>
                  ) : (
                    title
                  )}
                </div>
              )}
              {content}
            </div>

            {/* Dynamic Pointer Arrow matching trigger center & header background */}
            {arrow && isMeasured && (
              <div
                style={{
                  position: 'absolute',
                  ...(coords.actualPlacement === 'top'
                    ? { bottom: '-5px', left: `${coords.arrowOffset}px`, transform: 'translateX(-50%) rotate(45deg)' }
                    : coords.actualPlacement === 'bottom'
                    ? { top: '-5px', left: `${coords.arrowOffset}px`, transform: 'translateX(-50%) rotate(45deg)' }
                    : coords.actualPlacement === 'left'
                    ? { right: '-5px', top: `${coords.arrowOffset}px`, transform: 'translateY(-50%) rotate(45deg)' }
                    : { left: '-5px', top: `${coords.arrowOffset}px`, transform: 'translateY(-50%) rotate(45deg)' }),
                }}
                className={`w-2.5 h-2.5 pointer-events-none ${
                  coords.actualPlacement === 'bottom' && title
                    ? 'bg-gray-50 dark:bg-gray-700/70'
                    : 'bg-white dark:bg-gray-800'
                } ${
                  coords.actualPlacement === 'top'
                    ? 'border-r border-b border-gray-200 dark:border-gray-700'
                    : coords.actualPlacement === 'bottom'
                    ? 'border-l border-t border-gray-200 dark:border-gray-700'
                    : coords.actualPlacement === 'left'
                    ? 'border-r border-t border-gray-200 dark:border-gray-700'
                    : 'border-l border-b border-gray-200 dark:border-gray-700'
                }`}
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
};

