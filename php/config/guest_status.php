<?php
// Guest status constants - single source of truth for all guest status values.
// Use these everywhere instead of hardcoded strings to prevent drift.

define('GUEST_STATUS_CHECKED_IN', 'Checked In');
define('GUEST_STATUS_CHECKED_OUT', 'Checked Out');
define('GUEST_STATUS_BOOKED', 'Booked');

// Legacy aliases for backward compatibility during migration
define('GUEST_STATUS_ACTIVE_LEGACY', 'Active');
define('GUEST_STATUS_CONFIRMED_LEGACY', 'Confirmed');
define('GUEST_STATUS_CHECKEDOUT_LEGACY', 'CheckedOut');
// No-space spelling of 'Checked In'. There is no live data in this form, but
// several call sites had hardcoded it, so it stays in the occupancy list below
// to keep those safe rather than being silently dropped.
define('GUEST_STATUS_CHECKEDIN_LEGACY', 'CheckedIn');

/**
 * OVERLAP IS DECIDED BY NIGHTS, NEVER BY CLOCK TIME (owner's rule, 4 Sep 2026)
 *
 * Two stays conflict only if they share a NIGHT. A turnover day is not a
 * conflict no matter what the times say - including when the departing guest
 * leaves at 2pm and the arriving guest is booked in at 11am the same day. That
 * ordering looks like an overlap on a clock and is completely normal in
 * practice: it is handled with an early check-in, bag storage, or housekeeping
 * order, and owners do legitimately enter bookings that way.
 *
 * So every conflict query in this codebase compares DATE() on both sides:
 *
 *     existing.checkin_date < DATE(:new_checkout)
 *     AND DATE(existing.expected_checkout) > DATE(:new_checkin)
 *
 * Half-open, so a genuine shared night is still rejected (that rule is
 * absolute - see CLAUDE.md), while a same-day turnover always passes.
 *
 * The DATE() casts are not cosmetic. `guests.checkin_date` is a DATE column and
 * `expected_checkout` is DATETIME, so a check-in written as "2026-09-11 14:00"
 * is silently truncated to midnight while the checkout keeps 11:00. Comparing
 * them raw reads every arrival as 00:00 and invents conflicts - which is exactly
 * what blocked a real confirmed Airbnb reservation (Max, 6-11 Sep) from ever
 * being ingested, against a guest arriving on his departure day.
 *
 * Applied in: guests.php (add + edit), webhook_receiver.php (new + modify),
 * public_booking.php. Any NEW path that puts a stay on a room's timeline must
 * use the same shape.
 */

/**
 * Every status that means a stay actually OCCUPIES the room, and so must block
 * another booking and must be reported to OTAs as unavailable.
 *
 * Added 4 Sep 2026 after exactly the drift this file's header warns about. Five
 * call sites had hardcoded `IN ('Booked', 'Active', 'CheckedIn')` - 'CheckedIn'
 * with no space, which is not even a value this file defined; the real constant
 * is 'Checked In'. Every currently checked-in guest therefore failed to match:
 *   - ari_drain_worker.php computed their room as FREE and pushed it to Airbnb /
 *     Booking.com as available, while the guest was physically in it
 *   - webhook_receiver.php's conflict checks did not see them, so an inbound OTA
 *     booking could land on an occupied room
 * Verified live against guests #285 and #289, both 'Checked In', both sold as
 * available. Use this helper for any new occupancy check - never a literal list.
 *
 * Deliberately includes both spellings of each legacy status: an occupancy check
 * must fail CLOSED (wrongly blocking a night is recoverable, wrongly selling an
 * occupied one is not).
 */
function guestOccupyingStatuses(): array {
    return [
        GUEST_STATUS_BOOKED,
        GUEST_STATUS_CHECKED_IN,
        GUEST_STATUS_CHECKEDIN_LEGACY,
        GUEST_STATUS_ACTIVE_LEGACY,
        GUEST_STATUS_CONFIRMED_LEGACY,
    ];
}

/** The same list as an inline `IN (?, ?, ...)` placeholder string. */
function guestOccupyingStatusPlaceholders(): string {
    return implode(', ', array_fill(0, count(guestOccupyingStatuses()), '?'));
}
