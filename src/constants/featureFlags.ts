// Site-wide testing-mode toggles (1 Sep 2026).
//
// ICAL_BLOCKING_ENABLED: while the site is in testing mode (no real guests
// at risk of a double-booking yet), real Airbnb/OTA calendar data pulled in
// via iCal sync was showing up as "blocked" dates in the Add/Edit Booking
// calendars, which is confusing during testing (a struck-through date with
// no obvious in-app booking behind it) and unnecessary before Channex
// certification is done and channels are actually connected through it.
// This flag only affects whether that data is USED to block dates in the
// UI - the backend iCal sync job itself (php/ical_sync.php and its cron)
// keeps running untouched, so flipping this back to true is the only step
// needed to resume using it once the site goes live for real.
export const ICAL_BLOCKING_ENABLED = false;
