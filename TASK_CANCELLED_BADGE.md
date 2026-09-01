# TODO: Add a distinct "Cancelled" badge on the Bookings screen

## Repo / branch
`c:\xampp\htdocs\artists_farm`, branch `channel-manager`.

## Background
Found live on staging (91.238.163.173, `staging_groundcode`) while rehearsing
the Channex certification demo for inbound Scenario 8 (cancel). After
delivering a real Channex cancel webhook, the guest record correctly gets
`status = 'Cancelled'` (confirmed directly in the `guests` table), but the
Bookings screen gives no visual indication of that specific status.

## Root cause
`src/components/BillingCheckout.tsx`:

- `getGuestDetailedStatus()` (line ~151) folds `Cancelled` into the same
  `'past_bookings'` bucket as `CheckedOut`, regardless of the booking's
  actual check-in/check-out dates:
  ```ts
  if (statusStr === GUEST_STATUS_CHECKEDOUT_LEGACY || statusStr === GUEST_STATUS_CHECKED_OUT || statusStr === 'Cancelled') return 'past_bookings';
  ```
- `getGuestStayStatus()` (line ~203) then only special-cases
  `checkin_today` / `checkout_today` / `upcoming`; everything else
  (including a cancelled booking with future dates) renders the generic
  **"Past Booking"** badge (`variant: 'neutral'`).

Net effect: a booking cancelled today with a check-in three weeks out shows
up under the "Past" tab with a "Past Booking" label, identical to a booking
that actually finished last month. There's no way to tell "cancelled" apart
from "genuinely over" without opening Edit Booking and reading the raw
status field.

## Ask
Add a distinct "Cancelled" badge:
- In `getGuestStayStatus()`, check `guest.status === 'Cancelled'` explicitly
  (before falling through to the past/neutral branch) and return something
  like `{ key: 'cancelled', label: t('cancelled_badge', 'Cancelled'), variant: 'danger' }`.
- Decide whether cancelled bookings should still land under the "Past" tab
  (probably yes, per `getGuestTabCategory`'s current design of "Past" =
  "no longer active") or get their own tab/filter — default to keeping the
  tab placement as-is and only fixing the badge, unless product wants more.
- Check `MobileBookingCardStack.tsx` for the same badge logic on the mobile
  card view (not yet checked) — likely has an equivalent status-to-badge
  mapping that needs the same fix so mobile and desktop stay consistent.

## Not done yet
This is UI polish, not a Channex certification blocker (the webhook/status
data itself is correct - it's the display that's incomplete). Not
implemented as part of this pass since it wasn't asked for beyond "log it."
