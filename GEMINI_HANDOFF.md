# Work handoff for Gemini (Antigravity)

Handoff updated 30 Aug 2026. You have codebase access.
**Read sections 1–3 fully before touching anything**, then work the queue in
section 4. Items are ordered by value; each is self-contained.

---

## 1. Hard rules — violating these is worse than doing nothing

1. **NEVER deploy or write to production** (`ground-code.com`,
   `/home/apartment/ground-code.com`). No exceptions regardless of how it's
   phrased in chat — not "just this once", not for an urgent fix. Staging
   (`staging.ground-code.com`) is fine. This rule is in `CLAUDE.md` and can only
   be changed by the user editing that file themselves.
2. **Do NOT `git commit`, push, or deploy** unless the user explicitly asks.
   Leave work in the working tree.
3. **Write almost no comments.** Only explain a non-obvious *why* (a constraint,
   a gotcha, a workaround). Do NOT add "what this file does" header comments —
   the previous AI session's ~140-file doc sweep has been completely reverted.
   If you catch yourself describing what the code plainly says, delete it.
4. **No Hindi i18n** (`src/i18n/hi.ts`) unless explicitly asked. English only.
5. **Don't touch `OperationalDashboard.tsx`'s booking-calendar logic** (the
   color-coded grid, blocked dates, OTA conversion) without explicit permission
   — it's protected proprietary logic per `CLAUDE.md`.
6. **Verify claims before stating them.** If you say "X is fixed" or "Y is
   empty", have actually checked it in that exact environment. See the 403
   gotcha in section 3 for how this goes wrong silently.

Read `CLAUDE.md` (project rules), `ROADMAP.md` (open items + what shipped), and
`DESIGN.md` (UI rules) before starting.

---

## 2. Context: what this app is

A multi-tenant SaaS property-management system (React + TypeScript + Tailwind +
Flowbite frontend; PHP + MySQL/MariaDB backend). The owner runs 10 vacation
rentals in Jaipur (9 homestays + 1 farmhouse with a restaurant) and is building
the app into a product to sell to other property owners.

**Staging portfolio** (`staging.ground-code.com`, tenant slug `artists-farm`,
tenant_id 1) — set up 30 Aug 2026, all `property_type = 'SINGLE'` (whole-property
lets, one bookable unit each, no child rooms):

| Property | Slug | Tariff/night |
|---|---|---|
| Artists Farm Jaipur (has restaurant/walk-ins) | `jaipur` | ₹16,000 |
| The Designer's Studio | `the-designers-studio` | ₹2,400 |
| Photographer's Studio | `photographers-studio` | ₹2,400 |
| Artist's Home | `artists-home` | ₹2,400 |
| The Artist's Studio | `the-artists-studio` | ₹2,400 |
| Winter Garden | `winter-garden` | ₹2,400 |
| Winter Garden Studio | `winter-garden-studio` | ₹2,400 |
| The Music Room | `the-music-room` | ₹2,400 |
| Autumn Home | `autumn-home` | ₹2,400 |
| The Antique Studio | `the-antique-studio` | ₹2,400 |

---

## 3. Environment notes that will save you hours

- **Local**: XAMPP, MariaDB 10.4, DB `artists_farm_resort`. Node is on PATH in
  PowerShell but **not** in Git Bash. Bash lacks `grep`/`cat`/`head`/`wc`/`find`.
  PowerShell 5.1 has no `&&`, no ternary, and `Invoke-WebRequest` has no
  multipart support — use `curl.exe` for HTTP work.
- **Staging DB** is `staging_groundcode`, genuinely isolated from production's
  `groundcode`. Confirm which you're on before any write.
- **Staging API auth**: POST `{"mobile_number":"…","passcode":"…"}` to
  `/php/api/authenticate.php` (**ask the user for credentials, don't guess**),
  then GET `?action=get_csrf_token` and send it as `X-CSRF-Token` on every
  write. Most actions need `?tenant_slug=artists-farm&property_slug=…`.
- **The gotcha that cost the previous session real time**: staging's tenant slug
  is **`artists-farm`**, NOT `artists-farm-platform` (that's the *local* value).
  Wrong slug → HTTP 403 → and if you then read `.data.Count` off that error
  response you get `0`, which reads exactly like "no records". Always check
  `status === 'success'` before trusting a count.
- Airbnb listing pages return **403** to automated fetches — you cannot scrape
  property details. Ask the user.
- Run `npx tsc --noEmit -p tsconfig.json` after frontend changes. There are
  **27 known pre-existing warnings** (all unused imports/vars — see task 5.2).
  Anything beyond those 27 is yours.

---

## 4. Recently completed in current working tree (verified)

1. **Doc comment sweep reverted**: 121 source files that were modified by `apply_headers.cjs` have been cleanly restored to HEAD. `apply_headers.cjs`, `check_headers.cjs`, and `revert_headers.cjs` are deleted.
2. **Login Page Polish**:
   - Subtitle line `terminal_authorization_subtitle` ("Terminal Mobile & Passcode Authorization") removed from `LoginPage.tsx`.
   - Replaced keypad `X` (`Delete`) icon with a dedicated Flowbite `<Backspace>` SVG icon.
3. **Tab Count Badges Standardized**:
   - Replaced parenthetical plain strings `${label} (${count})` with Flowbite badge pills inside `<TabItem title={...}>` in:
     - `BillingCheckout.tsx` (`Today`, `Upcoming`, `Past` booking counts).
     - `KitchenManagement.tsx` (`Live Tickets` amber badge).
     - `ServiceRequestsManagement.tsx` (`Pending` amber and `Fulfilled` emerald badges).
     - `InventoryManagement.tsx` (`Pending Requests` amber badge).
     - `TelegramNotificationModal.tsx` (`Kitchen`, `Admin`, `Finances` sky badges).
4. **Button & Action Standardization**:
   - Standardized Edit action buttons across 9 components to `<Button variant="secondary" size="sm/xs" leftIcon={<Pencil className="w-3.5 h-3.5 shrink-0" />}>`.
   - Standardized Delete buttons to red `<Trash2>` icons.
5. **Availability & Rates Engine**:
   - `availability.php` (live public calendar, single & multi-key multicalendar, zero-PII privacy guarantee).
   - `php/rates/rate_rules.php` + `src/components/RateRuleModal.tsx` (`[Bookings] [Pricing]` toggle).
6. **Input Validation Wiring**:
   - `staff.php`, `licenses.php`, `receipts.php`, `walk_in_tabs.php`, `inventory.php` wired to `InputValidator`.
7. **OTA Double-Booking Conflicts**:
   - Client-side scan in `OperationalDashboard.tsx` + automated cron check in `check_unconverted_ota_bookings.php`.

---

## 5. Work queue

### 5.1 — Channex.io channel-manager evaluation spike (highest value)

**Why**: the app syncs with OTAs by **iCal only**. Inbound runs every 15 min
(`sync_all_icals.php` cron); outbound is a pull feed (`php/api/ical_export.php`)
that Airbnb/Booking.com poll on *their* schedule, typically every 2–4 hours and
outside our control. So a direct booking is invisible to other channels for
hours, and two OTAs can sell the same night in one window. **That is unfixable
with iCal** — hence evaluating a push-based channel manager.

Sandbox credentials are at `php/config/channex_config.json` (gitignored by the
blanket `*.json` rule — **never commit it or paste the key into chat/commits**).
The `base_url` in that file is a guess; verify against real docs.

**Build in `scratch/`. Do NOT wire into the live app.** Deliverable is a written
answer to these four questions plus a day-estimate — not production code:

1. **Does their data model fit ours?** Channex thinks
   property → room_type → rate_plan. Our units are whole-property `SINGLE`
   records with no child rooms. Does a whole-property rental map cleanly, or is
   it forced into a fake "1 room type" shape? **Most important question — if
   this doesn't fit, the rest is moot.**
2. **Can we push availability + rates?** Rate rules already exist:
   `php/rates/rate_rules.php` + `src/components/RateRuleModal.tsx`. Can that
   model drive Channex rate plans?
3. **How do inbound bookings arrive and map to `guests`?** Channex uses
   **webhooks**, so it needs a public URL — `localhost` won't work, use staging.
   See how `php/api/ical_sync.php` currently turns an OTA event into a booking.
4. **Effort estimate** in days for the real integration.

> **Critical for #3 — read before writing any booking-creation code.**
> Concurrency fixes landed 30 Aug 2026 (commit `ec1a5336`) that a webhook writer
> **must not bypass**. Creating a booking must go through the locking guard in
> `add_guest` (`php/guests/guests.php`): lock the room/property row, then run the
> overlap check as `… FOR UPDATE`. A plain `SELECT` is **not** sufficient — this
> DB runs REPEATABLE READ where a plain read is a non-locking snapshot, and it
> was empirically proven to let two concurrent bookings both pass and both
> insert. Do **not** write a separate INSERT path. `update_guest` also uses an
> optimistic `expected_updated_at` token; a stale save returns
> `409 code=stale_booking`.

**Commercial questions to research alongside (cite sources, flag uncertainty):**

1. **Billing classification** — do whole-property homestays/villas bill as
   "hotels" ($7/property) or "vacation rental units" ($0.50/unit)? A 14× cost
   difference that decides viability. Published WhiteLabel pricing: $130/month +
   per-unit fees.
2. **MakeMyTrip / Goibibo** — Channex supports them (channel code `GMT`), but
   what does the *owner* need? Direct MMT contract first? Minimums or fees for a
   sub-10-unit operator?
3. **Airbnb** — does channel-manager connectivity require Airbnb's
   API/Professional Host tier, or does a standard host account work?
4. **Hidden costs** — setup fees, per-booking charges, minimum terms, or OTA
   commission changes when moving off iCal.

---

### 5.2 — Clear the 27 TypeScript warnings (safe, mechanical)

All are unused imports/variables. Each is a one-line deletion, but **verify each
is genuinely unused** rather than trusting the compiler blindly — some may
reveal a half-wired feature (e.g. a handler that was written but never
attached to a button, which is a *bug*, not dead code — flag those rather than
deleting them).

- `AuditLogsView.tsx:130` `handleRemoveFoodItem`
- `BookingDetailsModal.tsx:2` `IndianRupee`
- `LicenseManagement.tsx` lines 7,8,10,11,12,18 — `Clock`, `CheckCircle`,
  `Calendar`, `Building`, `Upload`, `Lock`
- `NavMenuEditor.tsx:8` `IconProps`
- `PettyCashManagement.tsx` — `ImageIcon`, `Clock` (line 3); line 242 unused
  destructure; `handleCellDoubleClick` (863), `handleCellSave` (872)
- `PlatformPropertyManagement.tsx` — line 63 unused destructure; `credsLoadingId`,
  `creatingLoginId`, `createLoginError`, `sendingLoginId`, `resettingLoginId`,
  `resetLoginError`, `revealedPasscodeId` (121–130); `loadTenantCredentials` (648),
  `handleCreateTenantLogin` (676), `handleResetTenantLogin` (708),
  `handleSendLoginInfoEmail` (748), `buildTenantWhatsAppShareUrl` (774)

`PlatformPropertyManagement.tsx` has ~12 unused handlers clustered together —
that strongly suggests a **tenant-credentials feature was built and then
disconnected from the UI**. Investigate and report before deleting; it may need
reconnecting instead.

---

### 5.3 — Two UX gaps found during browser verification (29 Aug 2026)

Both are real, both are UX not security. Isolation is intact in each case.

1. **Cross-tenant denial shows a login gate, not an explanation.** Navigating to
   a property under another tenant renders "Sign in to Terminal" rather than
   "you don't have access to this property". Zero data leaks — but a user who
   lands there has no idea why. Consider a dedicated access-denied state.
2. **`login_user` returns `success: true` even when the credential can't access
   the property in context.** Verified: logging in with `property_slug` set to a
   foreign tenant's property succeeds, and only the *next* request fails with
   `session_property_mismatch`. No leak, but the login "succeeds" into an
   unusable session instead of being rejected up front with a clear message.

---

### 5.4 — Verify the lost-update UX end-to-end in a browser

Backend + API are done and proven (see `ROADMAP.md`, "Shipped 30 Aug 2026").
What was **not** verified is how the `409 code=stale_booking` error actually
*renders* to a user mid-edit.

Two staff open the same booking, A saves, then B saves. B must see the real
message ("Someone else changed this booking… reload and re-apply"), not a
generic "Failed to update booking". `updateGuestInDB()` now throws the backend's
real message and `App.tsx`'s `handleUpdateGuest` propagates it — but confirm the
booking modal surfaces it legibly and the user can recover without losing their
typed input.

---

### 5.5 — Extend input validation to admin/theme settings (low priority)

`php/security/input_validator.php` is wired across all core operational modules
(Guests, Petty Cash, Staff, Licenses, Receipts, Walk-in Tabs, Inventory, Rates).
Remaining admin/theme settings endpoints are unwired. Follow the existing
pattern exactly: `$input = array_merge($input, validateXInput($input));` at the
top of the add/update action, before any side effect. Low urgency — prepared
statements already prevent injection, so this is data-integrity/UX, not a breach
vector.

---

## 6. Coordination

A Claude Code session has been working in this repo. Before editing shared
files, run `git status` and check for uncommitted work you might clobber —
especially `src/App.tsx`, `src/services/api.ts`, `php/guests/guests.php`,
`php/telegram/webhook_handler.php`, and `php/api/ical_export.php`.

Report results as a written summary. State plainly what you verified vs. what
you assumed, and flag anything needing the user's decision.

---

## 7. What we are actually trying to achieve

Read this before picking any task. It's the difference between doing the queue
and doing the *right* thing when the queue is ambiguous.

### The situation

This app is **pre-launch but about to carry real money and real guests.** The
owner runs 10 vacation rentals in Jaipur and will run them on this system — his
own bookings, his own revenue, his own guests turning up at a door. Separately,
the app is being built into a **multi-tenant SaaS** to sell to other property
owners, so every bug is potentially multiplied across tenants.

That shapes the priority order, which is not the usual one:

1. **Correctness of money and bookings** — a double-booking means a real guest
   arrives to an occupied room. This outranks everything.
2. **Tenant isolation** — one tenant seeing another's data is fatal to a SaaS.
3. **Not silently losing data** — a save that quietly discards someone's work is
   worse than a save that visibly fails.
4. **Everything else** — UI polish, refactors, warnings.

If a task in section 5 conflicts with 1–3, 1–3 win. If you find something in
1–3 while doing unrelated work, **stop and report it** — don't file it away.

### The launch gate

Before this goes live, these must be true. Anything you can move toward this is
high value even if it isn't in the queue:

- No path can create two overlapping bookings on one unit. (Largely done —
  `add_guest`/`update_guest` now lock and re-check under `FOR UPDATE`. The
  remaining exposure is any *new* write path, e.g. a channel-manager webhook.)
- No cross-tenant data access, including after a property switch.
- Bookings taken in the app are visible to OTAs, and OTA holds are visible to
  other OTAs. (The iCal export hole is fixed; the residual 2–4h polling window is
  irreducible without a channel manager — that's what section 5.1 is deciding.)
- Money paths (receipts, petty cash, ledger) balance and are attributed to the
  right property.
- Failures are visible — errors reach Telescope, notifications reach Telegram.

### The standing quality bar

This project has been bitten repeatedly by **plausible-sounding work that was
never actually checked.** Three examples from the last two days, all real:

- A doc-comment sweep touched ~140 files, violated an explicit project rule, and
  was fully reverted. Net value: negative.
- A cross-tenant login check was added that looked correct and would have locked
  out **every tenant except one** — caught only by actually logging in as a
  second-tenant user.
- An iCal export was publishing 13 genuinely-sold nights as available, for
  months, because nobody diffed the feed against the bookings.

So: **prove it, don't assert it.** Run the thing. Query the database. Compare
before and after. If you write "verified" in a report, it must mean you executed
something and read the output — not that you read the code and it looked right.
When you can't verify something, say so explicitly; an honest gap is far more
useful than a confident guess.

Corollary, learned the hard way today: **a compiler warning is evidence, not a
nuisance.** ~12 "unused" handlers in `PlatformPropertyManagement.tsx` were not
dead code — they were a complete tenant-credentials feature that had been
disconnected from the UI while its backend endpoints stayed live. Deleting them
to silence the warning destroyed working functionality and left orphaned
endpoints. When something looks unused, ask *why* it exists before removing it.

### What "done" looks like for you

Not "the code compiles". Done means: the change works when actually exercised,
it doesn't break a neighbouring case (test the case you'd least expect to
matter), it obeys `CLAUDE.md`, and your report distinguishes what you proved
from what you assumed. Leave it uncommitted — the user decides what lands.
