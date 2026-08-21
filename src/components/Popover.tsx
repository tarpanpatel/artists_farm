import React, { useState, useRef, useEffect, useCallback } from 'react';
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

  const [coords, setCoords] = useState<{ top: number; left: number; actualPlacement: string }>({
    top: 0,
    left: 0,
    actualPlacement: placement === 'auto' ? 'top' : placement,
  });

  const updatePosition = useCallback(() => {
    if (!targetRef.current || !popoverRef.current) return;

    const targetRect = targetRef.current.getBoundingClientRect();
    const popoverRect = popoverRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let chosenPlacement = placement;

    if (placement === 'auto' || placement === 'top') {
      // If not enough room on top, flip to bottom
      if (targetRect.top - popoverRect.height - offset < 8) {
        chosenPlacement = 'bottom';
      } else {
        chosenPlacement = 'top';
      }
    } else if (placement === 'bottom') {
      // If not enough room on bottom, flip to top
      if (targetRect.bottom + popoverRect.height + offset > viewportHeight - 8) {
        chosenPlacement = 'top';
      } else {
        chosenPlacement = 'bottom';
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
    if (left < padding) {
      left = padding;
    } else if (left + popoverRect.width > viewportWidth - padding) {
      left = viewportWidth - popoverRect.width - padding;
    }

    // Keep within vertical viewport boundaries
    if (top < padding) {
      top = padding;
    } else if (top + popoverRect.height > viewportHeight - padding) {
      top = viewportHeight - popoverRect.height - padding;
    }

    setCoords({
      top: Math.round(top),
      left: Math.round(left),
      actualPlacement: chosenPlacement,
    });
  }, [offset, placement]);

  useEffect(() => {
    if (!isOpen) return;

    // Initial position measurement
    updatePosition();

    const handleScroll = () => {
      updatePosition();
    };
    const handleResize = () => {
      updatePosition();
    };

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
    if (trigger === 'click') {
      setIsOpen(!isOpen);
    }
  };

  const clonedChild = React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      targetRef.current = node;
      // Forward ref if child already had one
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
              zIndex: 99999,
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

            {/* Pointer arrow */}
            {arrow && (
              <div
                className={`absolute w-2 h-2 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rotate-45 pointer-events-none ${
                  coords.actualPlacement === 'top'
                    ? 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b'
                    : coords.actualPlacement === 'bottom'
                    ? 'top-[-5px] left-1/2 -translate-x-1/2 border-l border-t'
                    : coords.actualPlacement === 'left'
                    ? 'right-[-5px] top-1/2 -translate-y-1/2 border-r border-t'
                    : 'left-[-5px] top-1/2 -translate-y-1/2 border-l border-b'
                }`}
              />
            )}
          </div>,
          document.body
        )}
    </>
  );
};
