# iCal Sync Settings UI — Archived 3 Sep 2026

Removed from the working app because it's being superseded by the Channex channel-manager
integration (certification passed 2 Sep 2026, production credentials pending — see
`CHANNEX_GO_LIVE_CHECKLIST.md` in the repo root). The user's explicit reason for archiving now
rather than waiting for full Channex rollout: "i dont want any ai to work on it, if i give a
sidewide task" — this folder, and the pointer in `CLAUDE.md`, exist so a future site-wide sweep
(design consistency, safe-area audit, etc.) skips this UI rather than spending effort polishing
something being retired.

**This archive is narrower than it might look — read "What's still live" below before assuming
the whole iCal feature is gone.** Only the settings/management UI (the card where someone adds,
edits, or manually syncs a calendar feed) is archived. The backend that actually syncs already-
configured feeds, and the OTA-booking-conflict-alert system built on top of it, are untouched and
still running.

## What's here, and where it came from

| Archived path (under this folder) | Original path in the app |
|---|---|
| `src/components/ICalSyncManager.tsx` | `src/components/ICalSyncManager.tsx` (the settings card: add/edit/remove a calendar feed, manual "Sync Now") |

## What was severed elsewhere (not moved here — these files serve other purposes too)

- **`src/components/EditPropertyPage.tsx`** — the `<ICalSyncManager propertyId={property.id} ... />`
  card (shown only for `property_type === 'SINGLE'`) and its import are gone. Replaced with a
  comment pointing here.
- **`src/components/MultiKeyPropertyOverview.tsx`** — the equivalent card on a MULTI_KEY room's own
  Edit Room page (`<ICalSyncManager propertyId={selectedRoom.id} ... parentPropertySlug={...} />`,
  wrapped in a `data-tour="ota-sync"` div) is gone the same way.
- **`src/components/DemoOnboardingTour.tsx`** — the `'ota-sync'` step (title "🔄 2-Way OTA Calendar
  Sync (iCal)") that pointed `[data-tour="ota-sync"]` at the div above is removed entirely, not
  just left dangling. The tour is built with `skipMissingElement: false` (see the file's own
  `goToFirstRoomDashboard` comment) — a step whose selector can't be found doesn't get skipped, it
  silently ends the *entire* tour early. Leaving the step in place after removing its target would
  have quietly truncated onboarding for every new MULTI_KEY signup.
- **`src/components/Header.tsx`** — the "Sync calendars" quick-action button (the `RefreshCw` icon
  that used to appear in the Switch-Property header slot for anyone without
  `canSwitchProperties`) is gone: `icalCalendars`/`isSyncingIcal` state, the fetch `useEffect`, and
  `handleSyncAllCalendars` all removed. `fetchIcalCalendarsFromDB`/`syncAllIcalCalendarsInDB` in
  `src/services/api.ts` were **not** removed or moved — they're just unused now (TS doesn't flag
  unused exports), left in place in case a scoped-down version of this UI is ever rebuilt.

## What's still live (deliberately NOT touched, and why)

Unlike the AI Assistant archive (`_unwanted/ai/`), the backend here was **not** moved or disabled.
It's genuinely load-bearing for things that have nothing to do with whether there's a settings UI:

- **`php/api/ical_sync.php`** — not just an HTTP endpoint. `php/cron/check_unconverted_ota_bookings.php`
  does `require_once` on it directly for `getUnconvertedDueBlocks()`, and that cron job is real and
  currently running (`check_unconverted_ota_bookings`, every 6 hours per `cron_jobs.php` — confirmed
  live on staging 2 Sep 2026, actively processing real iCal-synced event IDs). Guarding or moving
  this file the way `ai_assistant.php` got a `410` guard would have taken that cron down too — it's
  `require_once`'d as a function library from a CLI script, not just hit as a web endpoint, so an
  early-exit HTTP-shaped guard at the top would kill the whole cron run the moment it's required.
- **`php/api/ical_export.php`**, **`php/cron/sync_all_icals.php`**, **`php/schema/ical_sync.sql`** —
  left in place for the same reason: real, currently-scheduled, currently-working code, not part of
  the settings UI being retired.
- **`ical_sync_configs`, `ical_synced_events` tables** — untouched. Any calendar feed already
  configured (via demo data or earlier testing) keeps syncing on schedule exactly as before; there's
  just no UI left to add a new one or trigger a manual sync by hand.

## Rebuilding or extending later

- If Channex ends up not covering every OTA a given property needs, a scoped-down version of this
  UI (read-only status + the manual "Sync Now" button, without the free-form add-a-new-feed form)
  might be worth bringing back per-property rather than restoring the whole thing — the original
  file is preserved byte-for-byte here to start from.
- `git log --all --oneline -- 'php/api/ical_sync.php' 'php/cron/sync_all_icals.php' src/components/ICalSyncManager.tsx`
  shows the real build-up if picking this back up.
