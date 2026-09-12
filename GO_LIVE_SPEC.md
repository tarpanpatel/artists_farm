# Go Live — Spec

**Status:** draft for review, no code written
**Date:** 12 Sep 2026 (revised same day after checking industry practice — §1a)
**Companion to:** [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — that file lists the bugs; this
proposes the structural fix for why they kept happening.

---

## 1. The problem

There is currently no deliberate moment when a property goes live. Setup finishes, the
Airbnb import happens somewhere in the middle of it, prices arrive whenever the owner gets
to them, and activation is a button on an unrelated page with no connection to any of it.

Every incident on 11 Sep came out of that gap:

| Incident | Root cause in this framing |
|---|---|
| ₹3,500 pushed to a live listing | Import ran before a price existed, so code invented one |
| Listing "Mapped & Active", channel never activated | No single place says what state the property is in |
| Patel Colony mapped-but-dormant for days | Nothing tells the owner they haven't gone live |
| `pending_price` units vanish from mapping | No surface shows a unit still needs a price |
| AVL=0 on both channels after "Go Live" success | Activation reported success; nobody read back what Channex held |

The pattern is **invisible state**, not missing controls. After 11 Sep's fixes the two
dangerous boundaries are guarded — a mapping can't be created without a real price, and
activation sits behind the Push Confirmation Gate. What's missing is the owner being able
to see where they stand and finish deliberately.

## 1a. What established channel managers actually do

Checked rather than assumed (12 Sep 2026) — Guesty, Hostaway, and industry writeups on
channel-manager/PMS onboarding. Three things they do that this spec did not originally
account for:

1. **They import the OTA's existing rate on connection, and treat it as required, not
   optional.** There is never a state where a listing is mapped but priced at nothing —
   which is the exact gap the ₹3,500 fallback was invented to paper over. Ground Code
   already reversed its own "never import a price" stance on 6 Sep 2026 (`router.php`
   `default_daily_price`), for the same reason — but it is offered as a proposal the
   owner can decline, which is how the gap still opened. **Revision: make accepting a
   base price mandatory at the moment a listing is mapped to a unit that has none** — not
   a global mandatory field, only a hard requirement on the specific action that would
   otherwise create the gap.

2. **They tell the host, explicitly and loudly, "we are now in charge of your calendar."**
   Guesty's own documentation: connecting a listing sets it to Full Sync, "rates and
   availability... should be managed in Guesty," and anything changed directly on Airbnb
   "will be overridden... the next time syncing occurs." That is the same `sync_all` lock
   that greyed out The Artists' Farm's Airbnb calendar — except the host is told in
   advance, as the point of the product, instead of discovering it as a locked screen.
   **Revision: Stage 4 gets an explicit "Airbnb hands control to Ground Code" screen**,
   separate from the price/date confirmation already there.

3. **Nobody treats channel activation as fire-and-forget self-service.** Standard practice
   before calling a connection live is a full round-trip test — a real inbound booking, a
   real cancellation — not just a successful activate call. Channex supports this
   directly: add the "Booking CRS" test app in their dashboard, create a booking by hand,
   confirm it arrives via the feed within a minute, then cancel it and confirm that flows
   too. This is also consistent with this product's own White-Glove Telegram onboarding
   decision (CLAUDE.md) — channel connection is a moment worth the same care, not a
   feature to ship as pure self-service and hope nobody needs help.
   **Revision: Stage 5 gains a test-booking step**, exercised before the property is
   marked fully live, not only a passive readback after the fact.

## 2. Principles

1. **Show computed facts, never assertions.** Every number on this page is read from the
   database or from Channex at the moment of display. No label describes a state that
   wasn't checked (this is the failure behind every entry in LAUNCH_CHECKLIST.md §0).
2. **Local state is not truth.** `channel_connections.status` is our own stored copy. Where
   it matters, ask Channex and show both — including when they disagree.
3. **Read-only until the owner says otherwise.** Phase 1 writes nothing at all.
4. **A gap is shown as a gap.** A unit with no price says "needs a price", never ₹0 and
   never an invented default.
5. **Incremental pushes stay automatic.** This governs *going live*. Once live, a booking
   or rate change must still sync on its own — that's the product.

## 3. The page

New route: `#go_live` — its own page, not a step inside `PropertySetupWizard`.

**Why its own page:** pricing seven units isn't one sitting and must be resumable across
days; `PropertySetupWizard` is a dismissible *nudge* component, which is the wrong
container for the step that decides whether rooms are sellable; and the page stays useful
after launch as the answer to "is my channel actually syncing?"

**Entry point:** reuse the strip that already exists above the content area. Today it reads
*"Finish Setting Up Parent Property (3 of 5 steps done) → Continue Setup"*. Once setup is
complete it becomes *"Not live yet — 2 of 4 steps to go → Review & Go Live"*, pointing here.
Same pattern, no new concept.

### Stage 1 — Setup ✅
Read-only mirror of what the existing wizard already tracks. Present so the sequence reads
as one journey; not re-implemented.

### Stage 2 — Pricing & details
Per unit: base rate, check-in/out, capacity, and how many of the next 365 nights have an
explicit price (from `computeRateCoverage()`, which already exists).

A unit with no price is the headline item, because this is the exact state that used to
silently drop a listing out of the channel mapping with a success message.

**Mandatory price at mapping (revised, §1a.1):** when Stage 3 maps a listing onto a unit
that has no price yet, Airbnb's own `default_daily_price` (already fetched by
`proposeAirbnbRoomConfig()`) is shown and **must be accepted or overridden before the
mapping completes** — not skippable to "fill in later." This does not make price a
globally required field (a unit created directly in Ground Code, never mapped to an OTA,
is unaffected); it closes only the specific action that used to create a mapped-but-priced-
at-nothing unit. If Airbnb has no price either, the owner must type one — the mapping
simply cannot proceed with a real gap underneath it.

*Phase 1: shows the gaps read-only. Phase 2: the mandatory-accept flow above.*

### Stage 3 — Connect & map
Per listing: which Ground Code unit it maps to, its rate plan id, and whether mapping is
complete. Units blocked by a missing price from Stage 2 are shown as blocked **here**,
with a link back — rather than being quietly absent.

### Stage 4 — Review & go live
Two distinct screens, not one, because they are different questions and conflating them is
part of how the `sync_all` lock came as a surprise:

**4a. What's about to change** — the existing `PushConfirmationGate` component and
`channex_push_preflight` endpoint, moved into this flow rather than reached from a separate
page. Unchanged behaviour: the real unpriced nights and the rate that would be sent; the
real dates about to be opened; the property name typed out; enforced server-side.

**4b. Airbnb hands control to Ground Code (new, §1a.2).** A plain-language screen shown
once per channel, before that channel's first activation:

> *"Once live, Airbnb's own calendar becomes read-only for these dates. Any price or
> block you set directly on Airbnb will be overwritten the next time Ground Code syncs.
> From today, manage this listing's prices and availability here — not on Airbnb."*

This is not new enforcement — `sync_all` already does this the moment a channel goes
live. It is telling the owner the true, current behaviour *before* they find a greyed-out
calendar and assume something is broken, exactly as happened on The Artists' Farm. Shown
once per channel (a flag on the connection row), not on every visit to the page.

### Stage 5 — Verify
The step that has never existed, and the one that would have caught the 3 Sep AVL=0
incident on the day it happened.

**5a. Test booking (new, §1a.3).** Before a channel is marked fully live, prompt the owner
(or support, during white-glove onboarding) to run Channex's own round-trip test: add the
Booking CRS test app in the Channex dashboard, create a test booking by hand, confirm it
lands in Ground Code within a minute via the feed, then cancel it and confirm the
cancellation also lands. This exercises the entire inbound path — including the conflict/
overbooking handling fixed 11 Sep — against a channel that has zero real guests on it yet.
Recorded as done/skipped on the connection row; skippable (some properties won't have
someone free to do this immediately) but visibly not-yet-done rather than silently assumed.

**5b. Readback verification.** After activation, read back from Channex what it actually
holds for a sample window (default: next 30 days) and compare against what Ground Code
computes. Show matches and discrepancies concretely — "12 Oct: Channex says 0 available,
Ground Code says 1".

**On demand, not on page load** — it's real API calls. A "Verify now" button, with the
timestamp of the last check shown.

## 4. Data

### One new endpoint: `channex_go_live_status` (GET, read-only)

Assembled from things that already exist:

| Piece | Source | Exists? |
|---|---|---|
| Connections + local rooms + rate plan ids | `listChannexChannelConnections()`, same query as `channex_channel_connection_status` | ✅ |
| Live channel state | `ChannexChannelClient::checkReadiness()` | ✅ (already calls Channex) |
| Unpriced nights per unit | `AriDrainWorker::computeRateCoverage()` | ✅ |
| Unit prices / times / capacity | `properties` rows | ✅ |
| `pending_price` units | `channex_mappings.sync_status` | ✅ (added 11 Sep) |
| Availability/rate readback | `ChannexClient::get('availability')` / `get('restrictions')` | ⚠️ client exists, no caller yet |

Response shape (sketch):

```jsonc
{
  "stage": 3,                          // computed, first incomplete stage
  "is_live": false,                    // any channel genuinely active
  "units": [
    { "room_id": 42, "name": "Autumn Studio",
      "default_tariff": 4000, "has_price": true,
      "priced_nights": 365, "unpriced_nights": 0,
      "channex_rate_plan_id": "58e399bb-…",
      "sync_status": "ok",             // or "pending_price"
      "mapped_listing_id": "12345678", "blockers": [] }
  ],
  "channels": [
    { "channel_code": "airbnb",
      "local_status": "ready_to_activate",
      "channex_status": "inactive",    // read live
      "state_matches": true,           // ← flags local/remote drift
      "readiness": { … }, "last_error": null }
  ],
  "verify": {                          // only when explicitly run
    "checked_at": "2026-09-12T…",
    "window": ["2026-09-12","2026-10-12"],
    "discrepancies": [ … ]
  },
  "blockers": [
    { "code": "unit_no_price", "unit": "Photographer's Studio",
      "message": "Needs a base price before this unit can go live." }
  ],
  "sync_control_ack": {                // §1a.2 - per channel, once ever
    "airbnb": { "acknowledged_at": null }
  },
  "test_booking": {                    // §1a.3 - per channel
    "airbnb": { "status": "not_started" }   // not_started | done | skipped
  }
}
```

`state_matches` is deliberately prominent. Our stored status disagreeing with Channex is
exactly what wasted an hour on Patel Colony, and it should be a visible red flag rather
than something a person has to notice.

### Cost / safety notes
- `checkReadiness()` is one call per connected channel per page load. Acceptable; cache
  briefly if it proves noisy.
- Readback is only on the explicit "Verify now" action.
- The endpoint performs **no writes** — including no content sync, no mapping, no
  activation.

## 5. Reused vs. new

**Reused as-is:** `PushConfirmationGate.tsx`, `channex_push_preflight`,
`channex_channel_activate` (and its server-side enforcement), `computeRateCoverage()`,
`checkReadiness()`, `proposeAirbnbRoomConfig()` (already fetches Airbnb's
`default_daily_price` — Stage 2's mandatory-accept flow reads from this, doesn't refetch),
the existing setup-banner pattern.

**New:** the `#go_live` page, the `channex_go_live_status` endpoint, the readback
comparison, the mandatory-price-at-mapping flow, the sync-control acknowledgment screen
(4b), the test-booking tracker (5a), and (Phase 2) inline price editing.

**Explicit non-goals:** no change to how incremental pushes work; no new gate in the drain
worker (the real boundaries are mapping and activation, both already guarded); no change
to the existing setup wizard's steps beyond the hand-off link; the test booking (5a) is a
tracked prompt, not an automated test Ground Code runs itself — Channex has no API to
inject one (per the channex-pms-integration skill), only the dashboard's Booking CRS app.

## 6. Phasing

| Phase | Scope | Risk | Status |
|---|---|---|---|
| **1** | Read-only page + `channex_go_live_status`. Shows stage, units, prices, mapping, live channel state, drift flag, blockers. | Very low — no writes | ✅ Shipped 12 Sep 2026 |
| **2a** | Inline price entry on the Go Live page (`channex_set_unit_price`) + visible reporting when a listing is skipped for lacking a price, in both mapping paths (`channex_channel_save_mapping` and the auto-import). | Medium — writes prices, triggers content-sync self-heal; never binds a channel | ✅ Shipped 12 Sep 2026 (soft form — see below) |
| **2b** | The hard-block form of §1a.1: mapping cannot *complete* until a price is accepted, not just reported after the fact. | Medium — same writes as 2a, plus a new required UI step in `ChannelConnectWizard.tsx` | ✅ Shipped 12 Sep 2026 (client-side block; server-side still open — §7.6) |
| **3** | Stage 4a+4b: preflight gate + sync-control disclosure, then activation. | Higher — this is the live push | ✅ Shipped 12 Sep 2026 |
| **4a** | Stage 5a: test-booking tracker. | Low — a tracked prompt, nothing automated | ⏳ Not built |
| **4b** | Stage 5b: readback verification ("Verify now"). | Low — read-only API calls | ✅ Shipped 12 Sep 2026 |

**Phase 3 note.** 4a (the preflight gate) already existed and already ran on activation — it
needed no wiring. What was missing was 4b, and it shipped as a **disclosure card on the Go
Live step, not a fourth confirmation**: the consent that matters is the typed property name on
the next screen, and a third thing to tick would only train people to click through all of
them — which is exactly why the two original consent checkboxes were removed on 9 Sep. It
states the permanent consequence (the OTA's calendar stops being editable for this listing and
its own edits get overwritten on the next sync), which is a different fact from "this push
replaces things now" and the one that was actually discovered the hard way, as a greyed-out
Airbnb calendar that looked like a fault.

**Phase 4b note — it reuses the daily cron's comparison rather than adding a second one.**
`channex_sync_audit.php` had been doing this exact night-by-night readback since 5 Sep, but
only daily and only to Telescope/push, which is right for background monitoring and useless
at the moment someone actually wants to know. The comparison was extracted to
`php/channex/sync_audit.php`; the cron and the new `channex_verify_sync` endpoint both call
it. A check whose entire purpose is detecting disagreement is the last place to keep two
implementations that could themselves disagree.

*Caught during that extraction, before it shipped:* deriving the cron's `$livePropertyIds`
from the audit's `problems` (rather than returning it explicitly) would have emptied it
whenever availability was healthy — silently switching off the cron's rate-coverage and
overlapping-bookings checks precisely when everything looked fine.

**Why Phase 2 split into 2a/2b.** §1a.1 asked for a hard block — mapping refuses to
complete without a price. 2a shipped the softer half first (the gap made *visible*:
named units in both the response and the UI, plus an inline tool to fix it), because a
true hard block meant modifying `ChannelConnectWizard.tsx`'s live multi-step flow, which
that pass hadn't reviewed deeply enough to touch safely alongside a backend change.

**2b then shipped the block itself (12 Sep 2026), in three parts:**

1. **`default_tariff` now travels with the local-rooms payload** (both
   `channex_channel_connection_status` and the auto-create-rooms response), because the
   mapping step previously had no way to know whether a unit had a price.
2. **The mapping step's message was wrong and is now correct.** It read *"Not yet synced
   to Channex — sync property content first"* for any unit without a rate plan. Since 11
   Sep that advice is usually false and actively unhelpful: content sync ran fine, then
   correctly declined to invent a price. Telling the owner to re-sync sends them round a
   loop that cannot fix it. The two cases are now distinguished, and the no-price case
   carries an inline price field (reusing `channex_set_unit_price`) that fixes it on the
   spot.
3. **`handleSaveMapping()` refuses to proceed** while any unit being mapped lacks a
   price, naming the units and pointing at the field on the same screen.

**The server-side half of 2b is deliberately still open**, pending §7.6. The server
still *accepts* such a save and reports the skipped units honestly (2a's
`skipped_no_price`), rather than hard-refusing — because "map now, price later" may be a
legitimate API-driven workflow, and converting that into a server refusal is a product
decision, not something to settle silently inside a UI handler. Nothing is lost either
way: the skip is reported, never silent.

**What was deliberately NOT live-tested.** `channex_set_unit_price` was verified by
code review and by reusing `update_room_tariff`'s own proven side effect (the exact
same outbox-enqueue-then-drain pattern already running in production), not by calling
it against a real property with an active channel — doing so would itself trigger a
real ARI push, which is exactly the kind of unrequested live action this whole project
now treats as a hard line. If this is tested live, use a property with no active
channel connection first.

Phase 1 is worth shipping alone. Nearly every incident was invisible state, and Phase 1
makes the state visible without being able to cause a new one. Phase 2a closes the
*reporting* half of the gap that produced the ₹3,500 incident; 2b would close it
structurally by making the gap impossible to walk past, not just visible.

## 7. Decisions needed before building

1. **Route/placement** — `#go_live` as proposed, or fold into the existing OTA Channels
   page as a third tab next to "Channel Connections" / "Live Rates & Sync Console"?
2. **Who sees it** — Super Admin/Admin only, or any staff role?
3. **Does it apply to an already-live property?** Proposed: yes — it becomes the health
   view ("live on 2 channels, last verified 3 hrs ago"). Confirms it isn't throwaway UI.
4. **Verify window** — 30 days proposed. Longer is a better check and a slower page.
5. **Phase 2 scope** — prices only, or also check-in/out times and capacity?
6. **(new, §1a.1) Mandatory price at mapping — hard block or strong default?** Proposed as
   a hard block (mapping cannot complete without an accepted price). Confirm this is
   acceptable UX for the case where the owner genuinely wants to map now and price later —
   if that's a real workflow, this needs a named "map without pricing yet" override rather
   than silently being impossible.
7. **(new, §1a.3) Who performs the test booking?** The owner, self-service, or support as
   part of white-glove onboarding (consistent with the Telegram pairing model)? Changes
   whether 5a needs owner-facing instructions or is purely an internal/support checklist
   item recorded against the connection.
