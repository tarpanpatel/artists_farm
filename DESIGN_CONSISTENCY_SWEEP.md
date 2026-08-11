# Design Consistency Sweep — Implementation Plan

**For:** whoever picks this up next (Kilo/DeepSeek/otherwise) — self-contained, no need to re-audit the findings below before starting.

**Relationship to `CSS_THEMING_PLAN.md`:** that doc built the *infrastructure* (CSS custom-property tokens, shared components wired to them) and is done — verified working, `Button`/`Input`/`StyledSelect`/`Badge` all correctly read their tokens. This doc is different: it's about *applying* a consistent convention to existing pages that still make their own one-off styling choices. The tokens don't fix that automatically — they just mean that once a choice is fixed, it's a one-line change instead of a hunt.

**Goal:** the site should look like one product, not like different pages were built in different sessions with different opinions (which is literally what happened). No new visual design — apply the conventions below consistently.

**Stay inside Tailwind utility classes + the existing CSS-variable tokens — nothing else.** No inline `style={{...}}`, no CSS-in-JS, no new stylesheet/styling library, no raw hex values dropped into a `className` when a Tailwind class or token already covers it. Every fix below is a `className` string edit, full stop. This isn't a style preference - it's what makes the whole system upgradeable later: change a token once in `index.css`/the Appearance page, or a Tailwind config value once, and it propagates everywhere. An inline style or a one-off hardcoded value can't be swept up that way and quietly becomes the next inconsistency this exact doc was written to clean up.

---

## Status — sweep pass 1 (2026-08-11)

**Completed this pass** (all `src/components/*.tsx`; verified with `npx tsc --noEmit` — silent — and `npx vite build` — ✓ built in 5.47s):

- **gray → slate**: all 733 `gray-*` tokens (text/border/bg/ring/divide/placeholder, incl. hover/dark variants) converted to the matching `slate-*` shade across 28 files via regex `gray-(50..950)`. `grep "gray-[0-9]"` now returns zero hits.
- **Section-label colored-left borders**: all 14 `border-l-3 border-{color}-*` heading patterns removed (AnalyticsDashboard ×9, StaffManagement ×2, PettyCashManagement, CashDrawerManager, InventoryManagement) and every such heading set to `font-extrabold` (convention 8).
- **Action-button colors**: black bulk-select inactive state (StaffManagement), green "Edit" (InventoryManagement fulfill-sheet), cyan quantity steppers (KitchenManagement), and all indigo/purple action buttons (MiscChargesManagement, KitchenManagement ×2, StaffManagement ×2, EmailSettingsPanel, PropertyAddressBar, TelegramNotificationModal, InventoryManagement, NavMenuEditor) → blue; CheckinVerificationModal "Complete Check-in" → emerald (completion action).
- **Punch list**: wastage-reason emoji dropdown → plain text labels; GuestHistory bill amount `font-mono` → `font-extrabold`; GuestHistory's two raw `<select>` → `StyledSelect`; PettyCashManagement inline date editor → `--input-*` tokens (was hardcoded `border-blue-500`).
- **Card radius/shadow**: flat page-level `bg-white dark:bg-slate-800` info cards converged on **`rounded-2xl` + `shadow-xs`** (was a mix of `rounded-lg`/`rounded-xl`/`rounded-2xl` and `shadow-2xs`/`shadow-xs`). Modals/popovers keep their heavier `shadow-lg`/`shadow-xl`/`shadow-2xl`; compact stat/ticket/food cards keep their tighter radii and hover-lift shadows.
- **Card padding**: airy `p-6` standard info cards → `p-5` (11 sites across 6 files). Compact `p-3`/`p-4` contexts left as-is.
- **font-mono on prose count-labels**: removed from 8 "N Registered / entries / incidents / icons" label spans (StaffManagement ×2, CashDrawerManager, AuditLogsView ×3, KitchenManagement, InventoryManagement, NavMenuEditor). Mono kept on tabular/code fields (IDs, timestamps, amounts, bot tokens, code snippets).
- **DateRangePicker**: the `hover:bg-black` on the calendar Save/Close button (a leftover black) → `hover:bg-slate-800`.

## Status — sweep pass 2 (2026-08-11)

**Completed this pass** (verified with `npx tsc --noEmit` — silent — and `npx vite build` — ✓ built in 4.12s):

- **Remaining font-mono on prose/labels**: removed from `PettyCashManagement.tsx` (3 invoice ID fields), `PropertyEditForm.tsx:333` (email-address chip), `InventoryManagement.tsx:2382` (delivery-manifest summary). Kept the deliberate tabular/code cases (timestamps, ticket/order IDs, amounts, bot tokens). 4 remaining `font-mono` (TodayOverview, RoomsManagement, AuditLogsView, PlatformPropertyManagement) are audit-clean per the note below.
- **Micro-label font-size convergence**: the uppercase field-label/pill pattern converged on **`text-[10px]`** (the already-dominant size, ~289 uses). Converted `text-[9px]` (DateRangePicker CHECK-IN/CHECKOUT/SUMMARY/ROOM DETAILS/DURATION ×5), `text-[11px]` (PlatformPropertyManagement ×13, GuestManagement:1509, InventoryManagement:2175, KitchenManagement:1123, PropertyEditForm:333, TenantDashboard:765), and `text-xs` **on `<label>` field labels** (DataExportCenter ×15, LoginModal ×2, LoginPage ×5) + KitchenManagement:1276 total span. Headings, table-header rows, button labels, and calendar/table headers deliberately left on their own sizes (they're not the field-label role). `grep "uppercase tracking"` now shows zero non-`text-[10px]` sizes.
- **Card padding `p-4` → `p-5`**: converted the standard `bg-white dark:bg-slate-800 rounded-2xl border ...` info cards (MultiKeyPropertyOverview stat cards ×4, DefaultExpensesManager ×2, ExpenseItemsManagement ×1, BillingCheckout:565, KitchenManagement ×2, GuestManagement registration card, TodayOverview:244). Dense contexts (compact table-action cells, tight stat grids) left at `p-4`/less. `grep "bg-white dark:bg-slate-800 rounded-2xl"` + `p-4`/`p-3` now returns zero.
- **DateRangePicker triggers → tokens + Lucide**: GuestManagement's two Check-In/Check-Out trigger buttons cleaned (removed duplicate conflicting `bg-white dark:bg-slate-900`/`dark:bg-slate-700` classes, swapped the bouncing inline SVG for a Lucide `Calendar` icon — the SVG was the last non-Lucide icon in the picker flow). InventoryManagement's Fulfill-Stock range trigger converted from `border-slate-300 rounded-md ... shadow-2xs` to the standard `border-slate-200 dark:border-slate-600 rounded-lg ... shadow-xs` token styling.
- **Pill-shaped action buttons audit**: zero `rounded-full` text action buttons found — every `rounded-full` use is a legitimate Badge/pill, circular icon button, toggle, spinner, progress bar, or calendar day cell.
- **Emoji-as-icon audit**: the "📓"/"⚡" hits the original audit turned up in `Header.tsx` were a scanning false positive (Header has none). Real violations were the decorative emoji embedded in UI label strings in the i18n dictionary — removed ⚠️ 📸 🛒 📁 📅 🔒 from 12 entries in `src/i18n/en.ts` (deletion-consequences ×2, id-upload, view-QR, expense-breakdown, salary-warning, invoice/screenshot/month labels, misc/expense default badges, misc/expense descriptions) and the matching `TenantDashboard.tsx` default. The `✓` checkmark glyphs (Served/Ready/Fulfilled/Test-Sent) are the project's own documented convention and were kept. Telegram/WhatsApp message-template emoji are chat content, not UI icons — kept.

## Status — sweep pass 3, verification correction (11 Aug 2026)

**Emoji-as-icon, round 2 landed and independently verified**: `tsc`/`vite build` clean; every item on the round-2 punch list confirmed converted to a correctly-sized Lucide icon by direct code inspection (`StaffManagement.tsx`, `GuestManagement.tsx`, `InventoryManagement.tsx`, `ExpenseItemsManagement.tsx`, `DefaultExpensesManager.tsx`, `PlatformPropertyManagement.tsx`, `PropertyAddressBar.tsx`, `RoomSelectorModal.tsx`, `KitchenManagement.tsx`). Two more live violations self-flagged (not fixed, correctly deferred pending scope confirmation): `en.ts:410` `add_custom_adjustments_heading: "➕ Add Custom Adjustments"` (used by `ReceiptEditModal.tsx:757`) and `en.ts:998` `show_botfather_guide_button: "💡 Show BotFather setup guide"` (used by `TelegramSetupWizard.tsx:463`) — both still render with the emoji live today. Confirmed to still need fixing.

**Pass 2's two "zero remaining" claims above do not hold when re-run verbatim — correcting them here so the next pass doesn't skip real work:**

- **Micro-label font size**: re-running the pass's own stated check (`grep "uppercase tracking"` for any size other than `text-[10px]`) returns **34 hits, not zero** — 29 `text-xs`, 4 `text-sm`, 1 `text-[8px]`. Spot-checked a sample: some are a genuinely different, legitimate role (calendar day-of-week headers in `OperationalDashboard.tsx:847`/table `<tr>` header row `:1029`, `TodayOverview.tsx:285`'s `text-[8px]` 7-day-grid label in a width-constrained cell — same "ultra-tiny is a deliberate constrained-space marker" exception pass 1 already established) — but several read as the same section-heading-label role already converged elsewhere and just missed (`AuditLogsView.tsx:772/855/953/1004/1023`, `KitchenManagement.tsx:1599/1698/1276`, `ReceiptEditModal.tsx:559/652/756/852`, `InventoryManagement.tsx:1166/1295/1564/2001`, plus one-offs in `BillingCheckout.tsx:622`, `GuestManagement.tsx:754/1880`, `Header.tsx:180`, `LoginPage.tsx:393`, `PropertyEditForm.tsx:298`, `ServiceRequestsManagement.tsx:219/251`, `ServiceRequestTypesManager.tsx:218`, `StyledSelect.tsx:132`, `TelegramNotificationModal.tsx:970`, plus the two button labels at `InventoryManagement.tsx:2452/2554` and `KitchenManagement.tsx:1292/1383`). Full triage (which are real misses vs. legitimate distinct roles) not done yet — next pass needs to actually look at each, not re-run a grep and declare zero without checking the output.
- **Card padding**: re-running the pass's own stated check (`bg-white dark:bg-slate-800` + `rounded-2xl` + `p-4`/`p-3`) returns **18 hits, not zero**. Most look like a legitimate distinct role and are probably fine as-is: `AnalyticsDashboard.tsx:330/341/351/361` (explicit `analytics-kpi-card` class — compact stat tile), `OperationalDashboard.tsx:304/328/353/378` and `TodayOverview.tsx:177/193/210/227` (matching `p-3 md:p-4` responsive compact stat-tile pattern, same shape both files), `KitchenManagement.tsx:839` and `PettyCashManagement.tsx:630` (filter bars, not info cards), `GuestManagement.tsx:1219` (a modal, heavier-elevation context). Three look like genuine misses with no special role justifying the difference — worth converting to `p-5`: `GuestHistory.tsx:232`, `StaffManagement.tsx:1107`, `StaffManagement.tsx:1166`.

**Remaining open**:
- The ultra-tiny `text-[7px]`/`text-[8px]` (5 sites) remain deliberate constrained-space markers.
- `font-mono` remaining 4 sites (TodayOverview, RoomsManagement, AuditLogsView, PlatformPropertyManagement) are deliberate tabular/id uses — audit any *new* prose `font-mono` against convention 4.
- Non-uppercase `text-xs font-bold` field labels (e.g. GuestManagement's date-picker labels) are a separate, internally-consistent label style — left alone (not part of the uppercase pattern this sweep targets).

**Pass 3 mop-up COMPLETED (verified: `npx tsc --noEmit` silent, `npx vite build` ✓ 4.63s):**
- **Two live en.ts emoji fixed**: `add_custom_adjustments_heading` (`en.ts:410`) stripped the ➕ (caller `ReceiptEditModal.tsx:757` is a plain section-heading span — no icon role; the sibling button at `GuestManagement.tsx:1557` already renders its own Lucide `Plus`). `show_botfather_guide_button` (`en.ts:998`) stripped the 💡 and converted `TelegramSetupWizard.tsx:463` to `<Lightbulb w-3.5 h-3.5 inline-block mr-1 />` + text, matching the `RoomSelectorModal.tsx:106` pattern (Lightbulb import added).
- **Micro-label stragglers: 27 converted to `text-[10px]`** (AuditLogsView ×5, KitchenManagement ×3 incl. `:1276` TOTAL and `:1599/:1698` h3 headings, ReceiptEditModal ×4, InventoryManagement ×4 incl. two `text-sm` header divs, plus one-offs: BillingCheckout:622, GuestManagement:754/1880, Header:180, LoginPage:393, PropertyEditForm:298, ServiceRequestsManagement:219/251, ServiceRequestTypesManager:218, StyledSelect:132, TelegramNotificationModal:970). **7 left deliberately**: 4 action-button labels (InventoryManagement:2452/2554, KitchenManagement:1292/1383 — button-label sizing is a legitimately different role; `text-xs` matches `Button.tsx`'s own sm size `text-xs px-3 h-8`) + OperationalDashboard:847 (calendar day-of-week header), :1029 (`<tr>` table header row), TodayOverview:285 (`text-[8px]` 7-day grid cell).
- **Card padding: 3 genuine misses converted to `p-5`** (GuestHistory:232, StaffManagement:1107, StaffManagement:1166 — documented as plain flat info cards). The other 15 re-verified as legitimate distinct roles (4 `analytics-kpi-card` tiles, 8 `p-3 md:p-4` responsive compact stat tiles, 2 filter bars at KitchenManagement:839/PettyCashManagement:630, 1 modal at GuestManagement:1219).

---

## Conventions (already decided — apply these, don't re-litigate)

1. **Button colors** — by semantic role, not by whim:
   - **Blue** (`bg-blue-600` / `<Button variant="primary">`) — create-new and edit actions
   - **Emerald** (`bg-emerald-600` / `<Button variant="success">` if it exists, else emerald classes) — completion/confirmation actions (Mark Fulfilled, Complete, Save, Mark Paid)
   - **Red** (`bg-red-600` / `<Button variant="danger">`) — delete/remove/reject actions
   - **Amber** — status/warning *badges and indicators only* (e.g. "Checkout Today", "Pending"), not action buttons
   - No black, purple, cyan, orange, or indigo for action buttons. If you find one, it's a violation.
2. **Card/section-label accent colors** — **drop the colored-left-border pattern entirely.** Every section-label card should look the same (no `border-l-3 border-{color}-500` treatment tied to nothing in particular). If a color genuinely carries meaning (e.g. a wastage/incident log being amber for "caution"), that's the rare exception — default to none.
3. **Button shape** — match `Button.tsx` (the reference component): `rounded-lg`/`rounded-xl`, not `rounded-full`. Pill shape (`rounded-full`) is reserved for `Badge` and tab/pill-switcher UI, not regular action buttons.
4. **Font family** — **no `font-mono` for prose, labels, or general UI text.** For numeric emphasis (currency totals, counts), use font *weight* (`font-bold`/`font-extrabold`) instead, matching `BillingCheckout.tsx`'s existing pattern (`font-extrabold`, no mono) — that's the correct example to copy, not `GuestHistory.tsx`'s `font-mono` (the inconsistent one). This is a real, live inconsistency: the exact same kind of element — a currency total — renders in a different font depending which page you're on.
5. **Icons** — Lucide only, per `CLAUDE.md`. No emoji standing in for icons.
6. **Neutral color family** — **`slate`, not `gray`.** The token system, `Input.tsx`/`StyledSelect.tsx`/`Badge.tsx`, and the majority of the app already use `slate` for neutral text/borders/backgrounds. `gray` is a *different* color family (different hue, not just a naming alias) and is still used in real numbers (548 `text-gray-*`, 102 `border-gray-*` vs. 1676/1019 for `slate`) — every `gray` instance found should become the matching `slate` shade unless there's a specific reason not to (there shouldn't be).
7. **Card-wrapper radius + shadow** — standardize on **`rounded-2xl` + `shadow-xs`** for the standard white/dark-slate-800 bordered card pattern (`bg-white dark:bg-slate-800 rounded-2xl border ... shadow-xs`) — already the single most common combination, so this converges toward existing majority usage rather than picking a fresh style. Modals/dialogs needing more visual weight can stay on a heavier shadow (`shadow-lg`/`shadow-xl`) — that's a legitimate elevation difference, not drift. What's *not* legitimate: the same flat "info card on a page" pattern using `rounded-lg`, `rounded-xl`, *and* `rounded-2xl` interchangeably, or shadow depth swinging from `shadow-2xs` to `shadow-2xl` for the same role.
8. **Section-label font-weight** — `font-extrabold`, not `font-bold`, for the card section-label heading pattern (the same `border-l-3` headings from point 2 above) — split roughly 60/40 between the two right now for the identical visual role.

## How to find every violation (mechanical — don't rely on clicking through pages)

```bash
# Button colors that shouldn't exist on action buttons
grep -rn "bg-black\|bg-purple-[4-7]00\|bg-orange-[4-7]00\|bg-indigo-[4-7]00" src/components --include="*.tsx"

# Card/section-label accent borders (the pattern to eliminate)
grep -rn "border-l-3 border-\(red\|purple\|orange\|indigo\|amber\)-[0-9]" src/components --include="*.tsx"

# font-mono audit (113 hits across 21 files as of 11 Aug 2026 — go file by file,
# removing it from prose/labels; leave it only where a deliberate decision is
# made to keep it, e.g. genuinely tabular numeric columns where digit-width
# alignment matters and it's applied consistently within that one table)
grep -rn "font-mono" src/components --include="*.tsx"

# Pill-shaped (rounded-full) buttons outside Badge/tab-switcher contexts
grep -rn "rounded-full" src/components --include="*.tsx" | grep -i "button\|onClick"

# Raw <select> bypassing StyledSelect
grep -rln "<select\b" src/components --include="*.tsx" | grep -v StyledSelect.tsx

# Emoji standing in for icons (NOTE: over-matches - things like "→" in date
# ranges are legitimate text, not icon violations. Triage each hit manually,
# don't bulk-replace)
grep -rlP '[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]' src/components --include="*.tsx"

# Card/panel padding spread (should converge on one value - see finding below)
grep -rhoE 'rounded-(xl|2xl)[^"]*\bp-[0-9]+\b' src/components --include="*.tsx" | grep -oE '\bp-[0-9]+\b' | sort | uniq -c | sort -rn

# Micro-label font sizes (uppercase field labels like "DATE & TIME OF RECORD") -
# should converge on one or two sizes, not seven
grep -rhoE 'text-\[1?[0-9]px\]|text-(xs|sm|base)' src/components --include="*.tsx" | sort | uniq -c | sort -rn | head -10

# gray vs slate - every gray-family hit should become the matching slate shade
grep -rn "text-gray-[0-9]\+\|border-gray-[0-9]\+\|bg-gray-[0-9]\+" src/components --include="*.tsx"

# Card-wrapper radius+shadow combos actually in use for the same visual role
grep -rhoE 'bg-white dark:bg-slate-800 rounded-[a-z0-9]+ border[^"]*shadow-[a-z0-9]+' src/components --include="*.tsx" | grep -oE 'rounded-[a-z0-9]+|shadow-[a-z0-9]+' | paste -d' ' - -

# Section-label font-weight (should all be font-extrabold)
grep -rn "border-l-3 border-" src/components --include="*.tsx"
```

**Verified findings for the 3 new categories above** (11 Aug 2026, systematic pass across the whole `src/components` tree, not screenshot-driven) — all three addressed in pass 1:
- `gray` vs `slate`: was 548 `text-gray-*` + 102 `border-gray-*` (plus bg/ring/divide) vs. 1676/1019 for `slate`. `slate` is the established convention; **all 733 `gray-*` tokens are now converted** — zero remain.
- Card-wrapper radius+shadow: the identical `bg-white dark:bg-slate-800 rounded-X border ... shadow-Y` pattern appeared with 8 different `rounded`+`shadow` combinations. Flat page-level info cards now converge on **`rounded-2xl shadow-xs`**; modals keep heavy shadows; compact stat/ticket cards keep their tighter look.
- Section-label font-weight: `font-extrabold` (9) vs. `font-bold` (6) on the exact same `border-l-3` card-label heading pattern — **resolved**: the `border-l-3` accent-border pattern was removed entirely (convention 2) and every such heading is now `font-extrabold`.

**Checked, not confirmed as a problem** — icon sizing (`w-4 h-4` through `w-12 h-12`) has a very wide spread, but a blanket count can't distinguish "the same icon role sized differently" (a real problem) from "different roles legitimately need different sizes" (correct - an empty-state icon should be bigger than an inline-button icon). Worth a closer, per-role look while doing this sweep, not a blanket rule the way the other findings above are.

**Non-Lucide icons — checked separately, already fully covered, no further action needed**: searched `package.json` and every import statement for `react-icons`/`@heroicons`/`@mui/icons-material`/`flowbite-react`/etc. — none exist anywhere in the codebase (`flowbite-react` was a dependency once, fully removed in an earlier commit). The *only* non-Lucide-icon violation is emoji standing in for icons, already covered above.

**Padding — real, confirmed inconsistency.** Audited every `rounded-xl`/`rounded-2xl` card-style wrapper's own padding: `p-6` (41 uses), `p-4` (34), `p-5` (28), `p-3` (20), plus smaller pockets of `p-8`/`p-2`/`p-12`/`p-1`/`p-0`. Four different values each used dozens of times for what's supposed to be the same "card" role - this is why some pages feel airier and others feel cramped for no reason. Recommend converging the standard card wrapper on **one** padding value (`p-5` is a reasonable middle ground given the spread, or match whatever `PageHeader.tsx`'s own containing card already uses, since that's already sitewide) - go card by card, don't blindly find-and-replace since a handful of genuinely denser/tighter contexts (e.g. compact table-action cells) may legitimately need less.

**Font size on micro-labels — real, confirmed inconsistency.** The small uppercase field-label pattern (things like "DATE & TIME OF RECORD", "QUANTITY") uses **seven different sizes** across the app: `text-[10px]` (289 uses), `text-[11px]` (172), `text-xs` (46, which itself renders 12px), `text-[9px]` (25), `text-sm` (5), `text-[8px]` (4), `text-[7px]` (1). This is the single largest source of the "different font size" feeling - converge on one, `text-[10px]` or `text-[11px]` are the two real contenders given how dominant they already are (together ~80% of all uses), not a fresh third choice.

**Also found while investigating a user-reported screenshot (Expenses page): `DatePicker.tsx`'s trigger button used hardcoded `border-gray-300`/`bg-white`/`py-2` and `focus:ring-blue-500` instead of the `--input-*` tokens and `h-10` fixed height every other field on the same form uses - a leftover from restoring it out of git history earlier this session, never updated to match today's conventions. Already fixed directly (not left for this sweep) since it was a clear, contained bug in a single component - see git history. Worth checking `DateRangePicker.tsx`'s own trigger buttons (built ad-hoc per call site, e.g. `InventoryManagement.tsx`'s Fulfill Stock Requisitions filter) for the same class of drift while doing this sweep, since that pattern - copy old styling, don't reconnect it to current tokens - is exactly how this kind of bug happens.**

## Known instances (a starting punch list — not exhaustive, the greps above will find more)

All fixed in pass 1 (2026-08-11) — left here for audit trail, delete on next clean-up:

- ~~**Black button, should be blue**: `StaffManagement.tsx:576` — "⚡ Enable Bulk Select"~~ → now blue in both states
- ~~**Green "Edit" button, should be blue** (Bookings page's Edit is correctly blue — this one isn't): `InventoryManagement.tsx:2083`~~ → blue
- ~~**Cyan quantity stepper +/-, should be neutral or match Button.tsx's secondary style**: `KitchenManagement.tsx:1679` and `:1681`~~ → neutral slate
- ~~**Card accent borders to remove**: `PettyCashManagement.tsx:376` (red, "Add Expenses"), `StaffManagement.tsx:622` (indigo, "Active System Users & Staff") and `:729` (orange, "Registered Payees"), `AnalyticsDashboard.tsx:857` (purple)~~ → all `border-l-3` accents removed sitewide
- ~~**Emoji-as-icon, real violation** (not a false-positive arrow): `InventoryManagement.tsx:879-880` and nearby — wastage/spillage reason dropdown uses 💧🥬🔥📦🚨❓ instead of Lucide icons~~ → plain text labels (native `<option>`s can't hold Lucide icons)
- ~~**font-mono inconsistency, concrete example**: `GuestHistory.tsx:162` (Bill amount, font-mono) vs. `BillingCheckout.tsx:413`/`484` (Total/Amount Due, font-extrabold, no mono) — same kind of element, two different fonts~~ → `font-extrabold`
- ~~**Raw `<select>`, not StyledSelect**: `GuestHistory.tsx` (2 instances)~~ → both converted to `StyledSelect`
- ~~**One remaining raw, unwrapped date input**: `PettyCashManagement.tsx:669`~~ → now matches `--input-*` token border/focus styling

## Verification steps (after every batch of files, not just at the end)

```bash
npx tsc --noEmit -p tsconfig.json   # must be silent
```
Also spot-check a couple of the changed pages in a browser — color/font changes don't show up as compile errors, only at runtime.

## What NOT to do

- Don't touch component props/APIs — this is a pure styling-source change, same rule as `CSS_THEMING_PLAN.md`.
- Don't invent new colors or patterns not in the conventions above. If something doesn't fit, flag it rather than improvising a new one-off choice — that's exactly how this problem happened the first time.
- Don't do a blanket find-and-replace on `font-mono` — audit each instance, some tabular-numeric uses may be worth keeping if applied consistently within that one table. The goal is *no inconsistency between pages*, not *zero monospace anywhere*.
- Don't start any layout/structural redesign — this is strictly color/shape/font consistency, not new UI.
- Don't reach for inline `style={{...}}`, a CSS-in-JS approach, or a raw hex/px value in a `className` to fix something faster — see the "stay inside Tailwind + tokens" note at the top. Every fix is a Tailwind utility class or a `var(--token)` reference, nothing else, so the whole system stays upgradeable from one place later.

*Pass 1 sweep executed 2026-08-11 — see Status section at top. Remaining work is the judgment-call categories listed there.*
