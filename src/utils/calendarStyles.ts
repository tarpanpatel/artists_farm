/**
 * Shared calendar state -> style rules (added 12 Sep 2026, explicit request).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The app draws stays on two structurally different calendar surfaces:
 *   - `TodayOverview.tsx`        - a rooms x days multicalendar grid
 *   - `OperationalDashboard.tsx` - a single-property weeks x 7 month grid
 *
 * Their LAYOUT is legitimately different and is deliberately NOT unified here.
 * What had silently drifted apart was the state -> appearance mapping, which has
 * nothing to do with which calendar you happen to be looking at: "this date is
 * in the past" and "this stay has already ended" mean exactly the same thing on
 * both, so they must look the same on both.
 *
 * The drift found 12 Sep 2026 was not merely a shade mismatch - the single
 * calendar was missing the rules outright:
 *   - it computed `isPastDay` but used it only to disable drag handlers, so past
 *     day cells rendered identical to future ones (white);
 *   - it greyed a capsule only when status was CheckedOut, so a booking whose
 *     dates had simply elapsed without anyone flipping the status stayed full
 *     blue - visible on staging as an 8-9 Sep bar still bright blue on the 12th.
 *
 * So this module exports the DECISION (which token applies in which state), not
 * just the colours. A plain CSS variable would have let the grey be restyled in
 * one place but would not have given the single calendar the missing rule.
 *
 * HOW TO CHANGE A COLOUR
 * ----------------------
 * Edit the token here once; both calendars follow. Any new surface that draws
 * date cells or stay capsules must import from here rather than re-declaring
 * its own classes - that re-declaration is exactly how this drifted.
 *
 * TAILWIND NOTE: every class string below must stay a COMPLETE literal. Never
 * build one by interpolation (`bg-${c}-200`) - Tailwind's scanner reads this
 * file as plain text and will not emit a class it cannot see spelled out.
 */

// ---------------------------------------------------------------------------
// Date helpers - one definition of "past", shared by both calendars
// ---------------------------------------------------------------------------

/**
 * Normalise any date representation the calendars deal with into a plain
 * `YYYY-MM-DD` key. Accepts a `Date`, a bare `YYYY-MM-DD`, or a DB-shaped
 * `YYYY-MM-DD HH:mm:ss` / ISO `YYYY-MM-DDTHH:mm:ss` string.
 *
 * Uses local date parts for a `Date` (never `toISOString()`, which shifts to UTC
 * and can land on the previous day for IST evening times).
 */
export const toDateKey = (value: string | Date | null | undefined): string => {
  if (!value) return '';
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
      value.getDate()
    ).padStart(2, '0')}`;
  }
  return String(value).split('T')[0].split(' ')[0];
};

/** A day is past once it is strictly before today. Today itself is never past. */
export const isPastDayKey = (
  dayValue: string | Date | null | undefined,
  todayKey: string
): boolean => {
  const key = toDateKey(dayValue);
  return !!key && key < todayKey;
};

/**
 * A stay/block has fully elapsed once its checkout/end boundary is strictly
 * before today.
 *
 * `end` is the EXCLUSIVE checkout boundary, so a guest checking out today has
 * NOT elapsed - they are still on the property this morning. This matches the
 * half-open availability rule (CLAUDE.md, "Multi-Key Rooms & Bookings") and
 * `BookingDetailsModal.tsx`'s own `isPastBooking` lock.
 */
export const isElapsedStay = (
  endValue: string | Date | null | undefined,
  todayKey: string
): boolean => {
  const key = toDateKey(endValue);
  return !!key && key < todayKey;
};

// ---------------------------------------------------------------------------
// Day cell tokens
// ---------------------------------------------------------------------------

/** Past day cell, nothing else on it. */
export const CAL_PAST_DAY_BG = 'bg-[#f1f3f5] dark:bg-slate-800/70';
/** Past day cell that is also a blocked/stop-sell night - a shade deeper. */
export const CAL_PAST_DAY_BLOCKED_BG = 'bg-[#ebeef1] dark:bg-slate-800/90';
/** Border colour a past cell takes, on surfaces that draw per-cell borders. */
export const CAL_PAST_DAY_BORDER = 'border-slate-200 dark:border-slate-700';

/** Muted text (date number, per-night price) inside a past cell. */
export const CAL_PAST_DAY_TEXT = 'text-slate-400 dark:text-slate-500';
/** Muted text inside a past cell that is ALSO blocked - dimmer again. */
export const CAL_PAST_DAY_BLOCKED_TEXT = 'text-slate-400/70 dark:text-slate-600';
/** Diagonal stop-sell slash, dimmed for a past night. */
export const CAL_PAST_DAY_SLASH = 'stroke-slate-300/80 dark:stroke-slate-600/70';
/** Diagonal stop-sell slash on a current/future night. */
export const CAL_DAY_SLASH = 'stroke-slate-300 dark:stroke-slate-600';

/**
 * Background (and optionally border) for a PAST day cell.
 *
 * Only past states live here on purpose. Each calendar keeps its own
 * present/future cell background, because those genuinely differ by surface
 * (the month grid uses shared grid dividers; the multicalendar draws a border
 * per cell) - and restyling them was not part of this change.
 */
export const getPastDayCellClasses = (opts?: {
  isBlocked?: boolean;
  withBorder?: boolean;
}): string => {
  const bg = opts?.isBlocked ? CAL_PAST_DAY_BLOCKED_BG : CAL_PAST_DAY_BG;
  return opts?.withBorder ? `${bg} ${CAL_PAST_DAY_BORDER}` : bg;
};

/** Muted text colour for content inside a past day cell. */
export const getPastDayTextClasses = (opts?: { isBlocked?: boolean }): string =>
  opts?.isBlocked ? CAL_PAST_DAY_BLOCKED_TEXT : CAL_PAST_DAY_TEXT;

/** Tooltip shown on a past cell, explaining why it is inert. */
export const CAL_PAST_DAY_TITLE =
  'This date is in the past and can no longer be priced, blocked, or booked';

// ---------------------------------------------------------------------------
// Stay capsule tokens
// ---------------------------------------------------------------------------
//
// Each colour is split into a base token and a separate hover token, because
// the two surfaces hover differently: the multicalendar shifts the capsule's
// background, while the month grid dims the whole capsule via `hover:opacity-90`
// on its own element. Passing `withHover: false` keeps the month grid's existing
// behaviour instead of stacking two competing hover effects on one element.

/** A stay whose dates have fully elapsed. Outranks source and status (below). */
export const CAL_CAPSULE_PAST =
  'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600';
export const CAL_CAPSULE_PAST_HOVER = 'hover:bg-slate-300 dark:hover:bg-slate-600';

/**
 * Guest already checked out (status-driven), but the stay has not elapsed.
 *
 * Deliberately an ALIAS of the elapsed token rather than a second copy of the
 * same literal: the two are distinct states that happen to share one colour
 * today, and aliasing keeps "change the grey once" true. Give it its own literal
 * only if the two are ever meant to look different.
 */
export const CAL_CAPSULE_CHECKED_OUT = CAL_CAPSULE_PAST;
export const CAL_CAPSULE_CHECKED_OUT_HOVER = CAL_CAPSULE_PAST_HOVER;

/** A converted OTA booking (Airbnb/Booking.com etc). */
export const CAL_CAPSULE_OTA_BOOKING =
  'bg-amber-600 dark:bg-amber-700 text-white border border-amber-700/30';
export const CAL_CAPSULE_OTA_BOOKING_HOVER = 'hover:bg-amber-700';

/** A direct/staff-created booking. */
export const CAL_CAPSULE_DIRECT =
  'bg-blue-600 dark:bg-blue-600 text-white border border-blue-700/30';
export const CAL_CAPSULE_DIRECT_HOVER = 'hover:bg-blue-700';

/**
 * Colour classes for a stay capsule.
 *
 * Precedence is deliberate and must not be reordered: an elapsed stay reads as
 * a historical record, which is the more important fact once true - so it wins
 * over both the OTA colour and the checked-out colour. This is the rule the
 * month grid was missing entirely before 12 Sep 2026.
 */
export const getCapsuleClasses = (state: {
  isPast?: boolean;
  isOtaBooking?: boolean;
  isCheckedOut?: boolean;
  withHover?: boolean;
}): string => {
  const withHover = state.withHover !== false;
  if (state.isPast) {
    return withHover ? `${CAL_CAPSULE_PAST} ${CAL_CAPSULE_PAST_HOVER}` : CAL_CAPSULE_PAST;
  }
  if (state.isCheckedOut) {
    return withHover
      ? `${CAL_CAPSULE_CHECKED_OUT} ${CAL_CAPSULE_CHECKED_OUT_HOVER}`
      : CAL_CAPSULE_CHECKED_OUT;
  }
  if (state.isOtaBooking) {
    return withHover
      ? `${CAL_CAPSULE_OTA_BOOKING} ${CAL_CAPSULE_OTA_BOOKING_HOVER}`
      : CAL_CAPSULE_OTA_BOOKING;
  }
  return withHover ? `${CAL_CAPSULE_DIRECT} ${CAL_CAPSULE_DIRECT_HOVER}` : CAL_CAPSULE_DIRECT;
};

// ---------------------------------------------------------------------------
// Unconverted OTA-block capsule tokens
// ---------------------------------------------------------------------------
//
// A synced OTA hold that is not yet a real booking. Red because it still needs
// staff action (CLAUDE.md, "Calendar bar conventions for OTA bookings").
//
// These return a border COLOUR only, with no `border` width class - both call
// sites already carry `border` in their own base className. Keep it that way.

export const CAL_CAPSULE_OTA_BLOCK =
  'bg-red-600 dark:bg-red-700 text-white border-red-700/40';
export const CAL_CAPSULE_OTA_BLOCK_HOVER = 'hover:bg-red-500';

/**
 * A past OTA block. Deliberately a slightly deeper grey than an elapsed guest
 * stay (slate-300 vs slate-200): both are history, but an unconverted hold that
 * elapsed without ever becoming a booking is a different record from a stay that
 * simply ran its course. Colocated here so a future grey change is still one
 * edit, even though the two are not the same value.
 */
export const CAL_CAPSULE_OTA_BLOCK_PAST =
  'bg-slate-300 dark:bg-slate-600 text-slate-600 dark:text-slate-300 border-slate-400/40';
export const CAL_CAPSULE_OTA_BLOCK_PAST_HOVER = 'hover:bg-slate-300 dark:hover:bg-slate-600';

/** Colour classes for an unconverted OTA-block capsule. */
export const getOtaBlockCapsuleClasses = (state: {
  isPast?: boolean;
  withHover?: boolean;
}): string => {
  const withHover = state.withHover !== false;
  if (state.isPast) {
    return withHover
      ? `${CAL_CAPSULE_OTA_BLOCK_PAST} ${CAL_CAPSULE_OTA_BLOCK_PAST_HOVER}`
      : CAL_CAPSULE_OTA_BLOCK_PAST;
  }
  return withHover
    ? `${CAL_CAPSULE_OTA_BLOCK} ${CAL_CAPSULE_OTA_BLOCK_HOVER}`
    : CAL_CAPSULE_OTA_BLOCK;
};
