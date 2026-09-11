import { useRef, useCallback } from 'react';
import type { RefObject, TouchEvent as ReactTouchEvent } from 'react';
import type { TabsRef } from 'flowbite-react';

/**
 * Swipe left/right to move to the next/previous tab - "wherever there are
 * tabs" (11 Sep 2026, explicit request: "make a system wherever there are
 * tabs if swiping towards the next tabs, activates that tab"). Attach the
 * returned `onTouchStart`/`onTouchEnd` to the CONTENT area a `<Tabs>` strip
 * controls (the attached card below it), not the tab strip itself - the
 * strip already legitimately scrolls horizontally on its own (see
 * tabsTheme.ts's `flex-nowrap overflow-x-auto` fix), and swiping there
 * should reveal more tabs, not immediately switch one.
 *
 * `tabsRef.current.setActiveTab(index)` (flowbite-react's `TabsRef`) calls
 * the exact same internal function the library uses for a real tab click -
 * it fires `onActiveTabChange` too (confirmed via
 * node_modules/flowbite-react's own Tabs.js: `setActiveTabWithCallback` is
 * both the click handler AND what `useImperativeHandle` exposes as
 * `setActiveTab`) - so every existing `onActiveTabChange` handler (state
 * sync, URL hash updates, etc.) keeps working unmodified; this hook never
 * needs its own copy of that logic.
 *
 * Deliberately touchend-only, no touchmove/preventDefault at all - a
 * normal vertical scroll is never interrupted or fought over mid-gesture;
 * the direction check below simply ignores the touch afterward if it
 * turns out to have been mostly vertical. And a touch that BEGINS inside
 * an element that can itself scroll horizontally right now (a wide table,
 * a calendar grid with its own overflow-x-auto) is ignored for the whole
 * gesture, so that element's native scroll happens undisturbed instead of
 * racing this hook for the same finger movement - checked once at
 * touchstart via `isHorizontallyScrollable`, not the tab list itself
 * (styling only, not a gesture target).
 */
const SWIPE_MIN_DISTANCE_PX = 60;
// Horizontal movement must exceed vertical by this multiple before it
// counts as a swipe - otherwise a diagonal-ish vertical scroll could
// occasionally cross the raw distance threshold and misfire a tab change.
const SWIPE_DIRECTION_RATIO = 1.5;

function isHorizontallyScrollable(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX);
}

export function useSwipeTabs(
  tabsRef: RefObject<TabsRef | null>,
  activeIndex: number,
  tabCount: number
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const blocked = useRef(false);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    start.current = { x: touch.clientX, y: touch.clientY };
    blocked.current = false;
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node && node !== e.currentTarget) {
      if (isHorizontallyScrollable(node)) {
        blocked.current = true;
        break;
      }
      node = node.parentElement;
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const begin = start.current;
      start.current = null;
      if (!begin || blocked.current) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - begin.x;
      const dy = touch.clientY - begin.y;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;
      const direction = dx < 0 ? 1 : -1; // swipe left -> next tab, swipe right -> previous tab
      const next = activeIndex + direction;
      if (next < 0 || next >= tabCount) return;
      tabsRef.current?.setActiveTab(next);
    },
    [tabsRef, activeIndex, tabCount]
  );

  return { onTouchStart, onTouchEnd };
}
