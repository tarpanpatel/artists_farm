# iCal Sync — Fully Retired 3 Sep 2026

Superseded by the Channex channel-manager integration (certification passed 2 Sep 2026,
production credentials pending — see `CHANNEX_GO_LIVE_CHECKLIST.md` in the repo root).

**Update (3 Sep 2026, same day as the archival below):** what started as archiving just the
settings UI ("i dont want any ai to work on it, if i give a sidewide task") became a full
retirement a few hours later, prompted by a live screenshot of staging still showing an
"Airbnb Calendar — Double-Booking Conflict" alert with a "Convert to Booking" button on the
Dashboard, plus an explicit follow-up: "remove anything related to ical syncing etc..". The
"What's still live" section below is **no longer accurate** — everything it described as
load-bearing has now also been archived or cut at the source. Kept for the historical record
of what changed and when; see "What's fully retired now" for the current state.

## What's fully retired now

**Backend, moved here (`git mv`, byte-identical):**

| Archived path (under this folder) | Original path |
|---|---|
| `php/api/ical_sync.php` | `php/api/ical_sync.php` |
| `php/api/ical_export.php` | `php/api/ical_export.php` |
| `php/cron/sync_all_icals.php` | `php/cron/sync_all_icals.php` (cron worker) |
| `php/cron/check_unconverted_ota_bookings.php` | `php/cron/check_unconverted_ota_bookings.php` (cron worker) |
| `php/schema/ical_sync.sql` | `php/schema/ical_sync.sql` (untracked in git, moved anyway for tidiness) |
| `src/components/ICalSyncManager.tsx` | `src/components/ICalSyncManager.tsx` (settings card — archived first, 3 Sep 2026 morning) |
| `src/components/ConvertOtaBookingModal.tsx` | `src/components/ConvertOtaBookingModal.tsx` (the "Convert to Booking" modal) |

**`php/cron/cron_jobs.php`** — the two job definitions (`check_unconverted_ota_bookings`,
`sync_all_icals`) removed from `getCronJobDefinitions()`. Their already-seeded rows in the
live `cron_jobs` table (both local and staging) are **not** auto-deleted by this — INSERT
IGNORE only ever adds rows, nothing here removes them. Root Admin → Cron Jobs can disable them
by hand (no SSH needed), or see the note at the bottom of this file.

**Frontend data sources cut at the source, not left half-wired.** Three components each had
their own independent fetch of `ical_sync.php?action=get_blocked_dates` (OperationalDashboard.tsx
for a SINGLE property, TodayOverview.tsx for a MULTI_KEY one, GuestManagement.tsx for the shared
Add/Edit Booking flow, threaded down into BookingDetailsModal.tsx/BillingCheckout.tsx as the
`icalBlockedDates` prop). All three fetches were deleted outright, not just disabled - the
`blockedDates` state each one held is now permanently `[]` (its own initial value), which is
what makes every consumer below produce nothing to render:

- `otaAlerts`/`conflictAlerts` (OperationalDashboard.tsx's "Booking Alerts" panel, incl. the
  live "Double-Booking Conflict"/"Convert to Booking" row that prompted this) - computation
  left in place (it's pure JS over an always-empty array, zero runtime cost) rather than
  excised, since removing it would also mean touching the calendar-grid's own OTA-capsule
  rendering right next to it, which is explicitly marked a **protected component** in
  CLAUDE.md. Same call made in TodayOverview.tsx.
- `ConvertOtaBookingModal` usage - fully removed (the component itself is archived, so this
  wasn't optional): both the import and the `{otaConversionTarget && (...)}` render block, in
  both OperationalDashboard.tsx and TodayOverview.tsx. `otaConversionTarget`'s own state is now
  write-only (still set by `handleConvertOtaBlock`, called from the calendar-grid segment
  mentioned above, but nothing reads it back to render a modal any more).
- The `icalBlockedDates` prop itself - removed end-to-end (interface + destructure + every
  pass-through), not just left unread: BookingDetailsModal.tsx, BillingCheckout.tsx,
  GuestManagement.tsx (its own `blockedDates` state too, once nothing referenced it any more).
- `ICAL_BLOCKING_ENABLED` (`src/constants/featureFlags.ts`) - the flag itself and the two
  `if (ICAL_BLOCKING_ENABLED) {...}` blocks it gated (BookingDetailsModal.tsx,
  GuestManagement.tsx) removed entirely, since the data feeding them is gone regardless of the
  flag's value.
- `fetchIcalCalendarsFromDB`/`syncAllIcalCalendarsInDB` (`src/services/api.ts`) - removed (were
  already unused since the settings-UI archival earlier the same day).
- The dead-end "Manage Calendar Sync Settings" link (`#ical_sync`, pointing at a page section
  that no longer exists) on a converted-booking's badge tooltip - removed from both
  BookingDetailsModal.tsx and BillingCheckout.tsx, leaving just the informational sentence.

**`php/api/demo_data.php`** - both demo-data generators that seeded fake `ical_sync_configs`/
`ical_synced_events` rows (section 3b "Demo OTA (iCal) Blocks", section 6g "Demo iCal/OTA Sync
Feeds") removed. `clearDemoData()`'s matching cleanup code was **left in place** - it only
deletes, never inserts, so it's still useful for sweeping up any rows a pre-3-Sep-2026 demo-data
generation left behind, and touching it offered no benefit.

## What's NOT done (needs either a code deploy, a Root Admin UI action, or explicit
## permission for a direct SSH DB command - see below)

- **Stale `ical_synced_events`/`ical_sync_configs` rows already on staging** (the ones behind
  the screenshot that prompted this) are **not deleted** - a direct SSH+SQL cleanup attempt
  against the staging server was blocked by the Claude Code permission system (same as an
  earlier attempt this session to fix a webhook scope gap), and per that system's own guidance
  this was not worked around. **This is cosmetic leftover data, not a live bug once this code
  ships**: the frontend no longer fetches `ical_sync.php` at all (see above), and the endpoint
  itself is archived out of the deployed codebase, so nothing can read these rows again
  regardless of how long they sit there.
- **The two retired cron_jobs rows** (`check_unconverted_ota_bookings`, `sync_all_icals`) are
  still `enabled=1` in the live table on both local and staging. Once this code deploys, their
  `script_path` no longer exists, so `dispatcher.php`/`runCronJobNow` will log a harmless
  `'Script file not found'` error each time they'd have run, instead of doing anything. Root
  Admin → Cron Jobs can disable (or the Root Admin UI could grow a delete action) both by hand,
  no SSH required - or ask for the SSH cleanup to be attempted again with explicit sign-off.
- `ical_external_event_id`/`ota_source`/`ota_source_label` columns on `guests`, and the
  overlap-warning query in `php/guests/guests.php`'s `add_guest` action that joins
  `ical_synced_events`/`ical_sync_configs` - deliberately **left alone**. These are generic
  "this booking's origin channel" metadata/checks, not iCal-sync-specific machinery - a booking
  the NEW Channex integration creates could reasonably want the same fields, and the overlap
  query simply returns nothing once the tables it joins are empty, at zero risk.

## Rebuilding or extending later

`git log --all --oneline -- 'php/api/ical_sync.php' 'php/cron/sync_all_icals.php' 'php/cron/check_unconverted_ota_bookings.php' src/components/ICalSyncManager.tsx src/components/ConvertOtaBookingModal.tsx`
shows the real build-up if picking this back up. Every file here is preserved byte-for-byte,
not deleted.
