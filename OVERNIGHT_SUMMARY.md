# Overnight summary — 30 Aug 2026

## Done and verified

Each item was proved by executing something, not by reading the code.

**1. Stay restrictions on rate rules** (`3cab0389`, on `multi-tenant`)
`room_rate_rules` gained `min_stay_arrival`, `min_stay_through`, `max_stay`,
`stop_sell`, `closed_to_arrival`, `closed_to_departure`; `rate_per_night` is now
nullable so a rule can carry only restrictions ("3-night minimum at the usual
price"). Confirmed present in the DB with the intended types.

Found while writing the plan: **certification scenarios 5 and 6 were previously
impossible** — the app had no concept of minimum stay or stop-sell, so there was
no business event to trigger.

**2. Per-property currency** (`77f6bd73`, on `multi-tenant`)
`properties.currency` existed from the start but nothing could set it — no form
field, no API parameter — so every property was permanently INR. Now settable
via `create_property_for_tenant` and `update_property`, with a selector in all
three property forms (Edit, Creation Wizard, Setup Wizard) backed by a shared
`src/utils/currencies.ts`.

Verified end-to-end through the real API: `USD` saves, `bogus` is ignored leaving
the previous value intact, `eur` normalises to `EUR`.

**3. Public page respects stop_sell** (`cae5aa0e`, on `multi-tenant`)
A closed night was still advertised as bookable. Verified live: inserting a
stop-sell rule for tomorrow drops the page's available count 2 → 1; removing it
restores 2. The test rule carried no rate, which also exercised the nullable
path.

**4. Channel manager integration** (`c011cd40`, on `channel-manager`)
Gemini's work, reviewed before committing. The important parts hold up:
- Outbox enqueue happens **inside** the business transaction (line 811 enqueue,
  816 commit in `add_guest`) — proven by its own test: a rolled-back transaction
  leaves zero outbox rows, a committed one leaves exactly one.
- **500 days compresses to exactly 2 API calls** — the hard scenario-1
  requirement, measured rather than asserted.
- `update_guest` enqueues both old and new date ranges.
- It did not bypass the concurrency guards; it added enqueues alongside them.
- All 7 `php/channex/` files lint clean; tsc 0.

## A mistake I made and corrected

When committing the Channex work I staged `php/api/router.php`, which swept my
currency backend changes onto `channel-manager` where they didn't belong.
`multi-tenant` silently didn't have them — caught because the end-to-end test
returned "No fields to update" rather than passing. Re-applied to `multi-tenant`
and re-verified.

I also wrote a stop-sell test that used a date nine days out, which lands in
*next* month while the page renders the *current* one. It reported FAIL for the
wrong reason. Fixed the test, not the code.

## State

| Branch | Contents |
|---|---|
| `multi-tenant` | restrictions, currency, stop_sell, plus earlier work — **3 commits unpushed** |
| `channel-manager` | full Channex integration (`c011cd40`) |

Nothing deployed. Staging still runs the build from before tonight's work.

## What needs you

**Decisions / actions only you can take**
1. **Send the Channex email** (two questions: single-unit adaptation, test
   currency). Worth having the adaptation confirmed *before* running eight
   scenarios.
2. **Connect Airbnb** to the Channex sandbox — needs your credentials.
3. **Run the 8 certification scenarios from the UI** and capture Task IDs. These
   must be triggered by a human through the real interface; scripting them is
   exactly what Channex rejects.
4. **Submit the certification form**, then the 30-minute screenshare audit.

**Open build work**
- `RateRuleModal` UI for the new restrictions (min stay / stop sell / CTA / CTD).
  Backend and data model are done; the form controls are what the auditor will
  watch being used, so they need to be genuinely usable.
- Whether to push `multi-tenant` and redeploy staging. I left both alone since
  the restrictions UI isn't built yet — staging would gain backend fields with
  no way to set them.

**Worth knowing**
- ~286 hardcoded `₹` symbols remain in the frontend. Cosmetic, out of scope
  tonight; `currencySymbol()` exists in the new util so anything *new* reads the
  property's real currency rather than adding a 287th.
- That host's SSH is intermittent. If a deploy fails at the swap step, the
  uploaded tarball persists — retry the swap, don't re-upload.
