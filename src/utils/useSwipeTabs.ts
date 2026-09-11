import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { TabsRef } from 'flowbite-react';

/**
 * Swipe left/right anywhere on the page to move to the next/previous tab
 * (11 Sep 2026, explicit request: "make a system wherever there are tabs
 * if swiping towards the next tabs, activates that tab").
 *
 * Listeners go on the PAGE CONTAINER (`.app-shell__main`, or the nearest
 * `<main>`), not on a wrapper around the tab content. That's deliberate
 * and is the whole reason this is a hook that reaches for a DOM node
 * instead of a `<div>` the caller wraps its content in: a wrapper is only
 * as tall as the content inside it, so on any tab whose content is short
 * - an empty state, a two-row list - the entire blank area below it was
 * dead to the gesture. Reported exactly that way ("swiping doesn't work
 * outside the dashes box. Basically when there is no content blank
 * area"), on Kitchen's empty Live Tickets queue. `<main>` is `flex-1`
 * inside a `min-h-screen` column (App.tsx), so it always spans the full
 * page area including the empty space - swipe anywhere and it responds.
 *
 * Tabs that live inside a drawer or modal pass their own `targetRef`
 * instead; those panels are overlaid on the page, so they need their own
 * boundary rather than the page's. Touches starting inside any such
 * overlay are ignored by the page-level listener for the same reason -
 * otherwise swiping within an open drawer would quietly flip the tabs on
 * the page behind it.
 *
 * `tabsRef.current.setActiveTab(index)` calls the very same internal
 * function a real tab click does - flowbite's Tabs.js exposes
 * `setActiveTabWithCallback` through `useImperativeHandle` - so every
 * existing `onActiveTabChange` handler (state sync, URL hash updates)
 * keeps working untouched and this never needs its own copy of it.
 *
 * Non-invasive by design: touchend-only, passive listeners, no
 * preventDefault anywhere, so vertical scrolling is never interrupted or
 * fought over mid-gesture. The direction check simply decides afterward
 * whether that touch counted as a horizontal swipe.
 */
const SWIPE_MIN_DISTANCE_PX = 80;
// Horizontal movement must beat vertical by this much, so an ordinary
// (often slightly diagonal) scroll flick can't register as a swipe.
// 80px / 2x deliberately errs strict: some tab panels hold inline,
// un-autosaved work, so an accidental switch costs more than a swipe
// that occasionally needs a second, more definite try. 80px is still
// only about a fifth of a phone's width - an easy intentional flick.
const SWIPE_DIRECTION_RATIO = 2;

const OVERLAY_SELECTOR = '[data-testid="flowbite-drawer"], [role="dialog"]';

/**
 * A horizontally scrollable ancestor between the touch and the boundary.
 * When one is under the finger the gesture belongs to it - a wide table
 * scrolls sideways instead of changing tab. That reads correctly rather
 * than mysteriously, because the table visibly moves; the alternative
 * (hijacking it into a tab change) would make the table unscrollable.
 */
function hasHorizontalScroller(from: EventTarget | null, boundary: HTMLElement): boolean {
  let node = from as HTMLElement | null;
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node);
    if (node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX)) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export interface SwipeTabsOptions {
  /** For tabs inside a drawer/modal - their own container, not the page. */
  targetRef?: RefObject<HTMLElement | null>;
  /** Skip wiring entirely (e.g. a role that only ever sees one tab). */
  enabled?: boolean;
}

export function useSwipeTabs(
  tabsRef: RefObject<TabsRef | null>,
  activeIndex: number,
  tabCount: number,
  options?: SwipeTabsOptions
) {
  const { targetRef, enabled = true } = options ?? {};
  // Kept in a ref so the listeners never need re-attaching as the active
  // tab changes - they read the current value at touch time instead.
  const state = useRef({ activeIndex, tabCount });
  state.current = { activeIndex, tabCount };

  useEffect(() => {
    if (!enabled || tabCount < 2) return;
    const target =
      targetRef?.current ??
      (document.querySelector('.app-shell__main') as HTMLElement | null) ??
      (document.querySelector('main') as HTMLElement | null);
    if (!target) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      tracking = false;
      const touch = e.touches[0];
      if (!touch) return;
      const el = e.target as HTMLElement | null;
      // An open drawer/modal owns its own gestures - see the note above.
      if (!targetRef && el?.closest?.(OVERLAY_SELECTOR)) return;
      if (hasHorizontalScroller(el, target)) return;
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;
      const { activeIndex: current, tabCount: total } = state.current;
      const next = current + (dx < 0 ? 1 : -1); // swipe left -> next tab
      if (next < 0 || next >= total) return;
      tabsRef.current?.setActiveTab(next);
    };

    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      target.removeEventListener('touchstart', onTouchStart);
      target.removeEventListener('touchend', onTouchEnd);
    };
  }, [tabsRef, targetRef, enabled, tabCount]);
}
