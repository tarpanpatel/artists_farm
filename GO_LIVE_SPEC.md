# Go Live — Spec

**Status:** draft for review, no code written
**Date:** 12 Sep 2026
**Companion to:** [PRE_LAUNCH_CHECK.md](PRE_LAUNCH_CHECK.md) — that file lists the bugs; this
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

## 2. Principles

1. **Show computed facts, never assertions.** Every number on this page is read from the
   database or from Channex at the moment of display. No label describes a state that
   wasn't checked (this is the failure behind every entry in PRE_LAUNCH_CHECK.md §0).
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

*Phase 1: shows the gaps. Phase 2: lets you fill them inline.*

### Stage 3 — Connect & map
Per listing: which Ground Code unit it maps to, its rate plan id, and whether mapping is
complete. Units blocked by a missing price from Stage 2 are shown as blocked **here**,
with a link back — rather than being quietly absent.

### Stage 4 — Review & go live
The existing `PushConfirmationGate` component and `channex_push_preflight` endpoint, moved
into this flow rather than reached from a separate page. Unchanged behaviour: the real
unpriced nights and the rate that would be sent; the real dates about to be opened; the
property name typed out; enforced server-side.

### Stage 5 — Verify
The step that has never existed, and the one that would have caught the 3 Sep AVL=0
incident on the day it happened.

After activation, read back from Channex what it actually holds for a sample window
(default: next 30 days) and compare against what Ground Code computes. Show matches and
discrepancies concretely — "12 Oct: Channex says 0 available, Ground Code says 1".

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
  ]
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
`checkReadiness()`, the existing setup-banner pattern.

**New:** the `#go_live` page, the `channex_go_live_status` endpoint, the readback
comparison, and (Phase 2) inline price editing.

**Explicit non-goals:** no change to how incremental pushes work; no new gate in the drain
worker (the real boundaries are mapping and activation, both already guarded); no change
to the existing setup wizard's steps beyond the hand-off link.

## 6. Phasing

| Phase | Scope | Risk |
|---|---|---|
| **1** | Read-only page + `channex_go_live_status`. Shows stage, units, prices, mapping, live channel state, drift flag, blockers. | Very low — no writes |
| **2** | Inline pricing in Stage 2, so a blocker can be cleared without leaving the page. Re-runs content sync for `pending_price` units once a real price exists. | Medium — writes prices, triggers sync |
| **3** | Stage 4 + 5 wired in: gate reached from here, activation, then readback verification. | Higher — this is the live push |

Phase 1 is worth shipping alone. Nearly every incident was invisible state, and Phase 1
makes the state visible without being able to cause a new one.

## 7. Decisions needed before building

1. **Route/placement** — `#go_live` as proposed, or fold into the existing OTA Channels
   page as a third tab next to "Channel Connections" / "Live Rates & Sync Console"?
2. **Who sees it** — Super Admin/Admin only, or any staff role?
3. **Does it apply to an already-live property?** Proposed: yes — it becomes the health
   view ("live on 2 channels, last verified 3 hrs ago"). Confirms it isn't throwaway UI.
4. **Verify window** — 30 days proposed. Longer is a better check and a slower page.
5. **Phase 2 scope** — prices only, or also check-in/out times and capacity?
