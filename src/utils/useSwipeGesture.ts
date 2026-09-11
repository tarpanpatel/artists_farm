import { useRef, useCallback } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';

/**
 * Directional swipe hooks for a single element - `useVerticalSwipe` (up/
 * down) and `useHorizontalSwipe` (left/right). Added 11 Sep 2026 for the
 * Kitchen POS cart sheet ("Swiping down should close it and swiping the
 * tab up should open it").
 *
 * ── WHERE A SWIPE MAY BE ADDED (read before adding a new one) ──
 *
 * Two rules, both set the same day after a swipe pass was built too
 * broadly and pulled back: "don't do things which can lead to loss of
 * work done by user or user gets confused why it works at some places
 * and some times".
 *
 *  1. NEVER put a swipe on a surface that can discard typed input. A
 *     swipe is a gesture people make by accident mid-scroll; a button
 *     press isn't. "They could already have lost it by pressing Escape /
 *     tapping the tab" is NOT a defence - those are deliberate, a thumb
 *     drag is not. This is why there is no swipe-to-close on `<Drawer>`:
 *     29 of the 33 drawer-bearing components hold form inputs (the
 *     multi-step wizards, PushConfirmationGate), and there the swipe
 *     surface IS the form, so no guard can protect it.
 *
 *     Where the hazard is in the app rather than in the gesture, fix the
 *     app. Tab swiping (useSwipeTabs.ts) was nearly dropped for this -
 *     FinancesHub rendered its panels with `&&`, so leaving a tab
 *     unmounted a half-filled Petty Cash expense, OCR receipt and all.
 *     But TAPPING the tab already did that, so the real defect was the
 *     unmounting, not the swipe: those panels are now kept mounted and
 *     hidden once visited, which fixes both.
 *
 *  2. The same swipe on the same surface must always do the same thing.
 *     A gesture that needs an "unless your finger happened to land on X"
 *     exception to be safe is a gesture that shouldn't be there. Note
 *     the scroll-edge checks below are NOT such an exception - "a list
 *     with more to scroll scrolls instead of dismissing" is how every
 *     bottom sheet on both mobile platforms behaves, so it matches what
 *     people already expect rather than surprising them, and the content
 *     visibly moves instead of the gesture silently doing nothing.
 *
 *     A swipe target must also cover the surface it belongs to, blank
 *     space included - see useSwipeTabs.ts, where binding to a wrapper
 *     around the content left every empty area below it dead.
 *
 * What's left for THESE hooks after those rules: surfaces holding no
 * user input at all - the POS cart sheet (closing it keeps the cart; the
 * tab still shows the running total), the nav sidebar, and read-only
 * image lightboxes.
 *
 * Non-invasive by design: touchend-only, no touchmove handler and no
 * preventDefault anywhere, so native scrolling is never interrupted or
 * fought over mid-gesture - the direction/distance check below simply
 * decides afterward whether that touch counted as a swipe.
 *
 * The scroll-edge rule is what makes this safe to put on a panel that
 * contains its own scrollable list: a downward swipe only dismisses when
 * the list under the finger was ALREADY scrolled to the top when the
 * touch began (and an upward swipe only fires when it was at the bottom).
 * Without that, flicking a half-scrolled cart list downward would close
 * the drawer instead of scrolling it - the single most common complaint
 * about hand-rolled bottom sheets.
 */
const SWIPE_MIN_DISTANCE_PX = 50;
// Vertical movement must exceed horizontal by this multiple - otherwise a
// mostly-sideways drag could cross the distance threshold and misfire.
const SWIPE_DIRECTION_RATIO = 1.5;

function findVerticalScroller(from: EventTarget | null, boundary: EventTarget | null): HTMLElement | null {
  let node = from as HTMLElement | null;
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node);
    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(style.overflowY)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function findHorizontalScroller(from: EventTarget | null, boundary: EventTarget | null): HTMLElement | null {
  let node = from as HTMLElement | null;
  while (node && node !== boundary) {
    const style = window.getComputedStyle(node);
    if (node.scrollWidth > node.clientWidth + 1 && /(auto|scroll)/.test(style.overflowX)) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export interface VerticalSwipeOptions {
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useVerticalSwipe({ onSwipeUp, onSwipeDown }: VerticalSwipeOptions) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  // Set synchronously, right before onSwipeUp/onSwipeDown fires, and left
  // set afterward (not auto-cleared) so a caller that ALSO has an onClick
  // on the same element can check it (11 Sep 2026 code review fix). A touch
  // that ends as a recognized swipe still gets a synthetic `click` from the
  // browser afterward - always strictly after this touchend has already run
  // and set this ref, since a single touch interaction dispatches touchend
  // before any following click - so a click handler that reads `justSwiped
  // .current` will always see the up-to-date value for the gesture that
  // just happened. Whoever reads it is responsible for resetting it back to
  // false afterward (see the pull-tab's onClick in KitchenManagement.tsx),
  // the same way a native `event.defaultPrevented` check works.
  const justSwiped = useRef(false);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    start.current = { x: touch.clientX, y: touch.clientY };
    scroller.current = findVerticalScroller(e.target, e.currentTarget);
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const begin = start.current;
      const scrollEl = scroller.current;
      start.current = null;
      scroller.current = null;
      if (!begin) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - begin.x;
      const dy = touch.clientY - begin.y;
      if (Math.abs(dy) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dy) < Math.abs(dx) * SWIPE_DIRECTION_RATIO) return;
      if (dy > 0) {
        // Swiped down - dismiss, but only if the list under the finger had
        // nothing left to scroll upward into.
        if (scrollEl && scrollEl.scrollTop > 0) return;
        justSwiped.current = true;
        onSwipeDown?.();
      } else {
        // Swiped up - only once the list under the finger is at its end.
        if (scrollEl && scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 1) return;
        justSwiped.current = true;
        onSwipeUp?.();
      }
    },
    [onSwipeUp, onSwipeDown]
  );

  return { onTouchStart, onTouchEnd, justSwiped };
}

export interface HorizontalSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Left/right counterpart of useVerticalSwipe, with the same scroll-edge
 * rule applied sideways: a leftward swipe only fires once whatever is
 * under the finger has no more room to scroll left, so flicking a wide
 * table sideways never doubles as a dismiss.
 */
export function useHorizontalSwipe({ onSwipeLeft, onSwipeRight }: HorizontalSwipeOptions) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLElement | null>(null);

  const onTouchStart = useCallback((e: ReactTouchEvent<HTMLElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    start.current = { x: touch.clientX, y: touch.clientY };
    scroller.current = findHorizontalScroller(e.target, e.currentTarget);
  }, []);

  const onTouchEnd = useCallback(
    (e: ReactTouchEvent<HTMLElement>) => {
      const begin = start.current;
      const scrollEl = scroller.current;
      start.current = null;
      scroller.current = null;
      if (!begin) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - begin.x;
      const dy = touch.clientY - begin.y;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE_PX) return;
      if (Math.abs(dx) < Math.abs(dy) * SWIPE_DIRECTION_RATIO) return;
      if (dx < 0) {
        if (scrollEl && scrollEl.scrollLeft > 0) return;
        onSwipeLeft?.();
      } else {
        if (scrollEl && scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 1) return;
        onSwipeRight?.();
      }
    },
    [onSwipeLeft, onSwipeRight]
  );

  return { onTouchStart, onTouchEnd };
}
