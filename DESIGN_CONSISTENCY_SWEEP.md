# Design Consistency Sweep — Implementation Plan

**For:** whoever picks this up next (Kilo/DeepSeek/otherwise) — self-contained, no need to re-audit the findings below before starting.

**Relationship to `CSS_THEMING_PLAN.md`:** that doc built the *infrastructure* (CSS custom-property tokens, shared components wired to them) and is done — verified working, `Button`/`Input`/`StyledSelect`/`Badge` all correctly read their tokens. This doc is different: it's about *applying* a consistent convention to existing pages that still make their own one-off styling choices. The tokens don't fix that automatically — they just mean that once a choice is fixed, it's a one-line change instead of a hunt.

**Goal:** the site should look like one product, not like different pages were built in different sessions with different opinions (which is literally what happened). No new visual design — apply the conventions below consistently.

**Stay inside Tailwind utility classes + the existing CSS-variable tokens — nothing else.** No inline `style={{...}}`, no CSS-in-JS, no new stylesheet/styling library, no raw hex values dropped into a `className` when a Tailwind class or token already covers it. Every fix below is a `className` string edit, full stop. This isn't a style preference - it's what makes the whole system upgradeable later: change a token once in `index.css`/the Appearance page, or a Tailwind config value once, and it propagates everywhere. An inline style or a one-off hardcoded value can't be swept up that way and quietly becomes the next inconsistency this exact doc was written to clean up.

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

**Verified findings for the 3 new categories above** (11 Aug 2026, systematic pass across the whole `src/components` tree, not screenshot-driven):
- `gray` vs `slate`: 548 `text-gray-*` + 102 `border-gray-*` hits vs. 1676/1019 for the `slate` equivalents. `slate` is the established convention (tokens, shared components); every `gray` hit is drift.
- Card-wrapper radius+shadow: the identical `bg-white dark:bg-slate-800 rounded-X border ... shadow-Y` pattern appears with **8 different `rounded`+`shadow` combinations** in real usage (`rounded-2xl shadow-xs` most common at 12, down to one-off `rounded-2xl shadow-2xl` and `rounded-lg shadow-2xs`).
- Section-label font-weight: `font-extrabold` (9) vs. `font-bold` (6) on the exact same `border-l-3` card-label heading pattern.

**Checked, not confirmed as a problem** — icon sizing (`w-4 h-4` through `w-12 h-12`) has a very wide spread, but a blanket count can't distinguish "the same icon role sized differently" (a real problem) from "different roles legitimately need different sizes" (correct - an empty-state icon should be bigger than an inline-button icon). Worth a closer, per-role look while doing this sweep, not a blanket rule the way the other findings above are.

**Non-Lucide icons — checked separately, already fully covered, no further action needed**: searched `package.json` and every import statement for `react-icons`/`@heroicons`/`@mui/icons-material`/`flowbite-react`/etc. — none exist anywhere in the codebase (`flowbite-react` was a dependency once, fully removed in an earlier commit). The *only* non-Lucide-icon violation is emoji standing in for icons, already covered above.

**Padding — real, confirmed inconsistency.** Audited every `rounded-xl`/`rounded-2xl` card-style wrapper's own padding: `p-6` (41 uses), `p-4` (34), `p-5` (28), `p-3` (20), plus smaller pockets of `p-8`/`p-2`/`p-12`/`p-1`/`p-0`. Four different values each used dozens of times for what's supposed to be the same "card" role - this is why some pages feel airier and others feel cramped for no reason. Recommend converging the standard card wrapper on **one** padding value (`p-5` is a reasonable middle ground given the spread, or match whatever `PageHeader.tsx`'s own containing card already uses, since that's already sitewide) - go card by card, don't blindly find-and-replace since a handful of genuinely denser/tighter contexts (e.g. compact table-action cells) may legitimately need less.

**Font size on micro-labels — real, confirmed inconsistency.** The small uppercase field-label pattern (things like "DATE & TIME OF RECORD", "QUANTITY") uses **seven different sizes** across the app: `text-[10px]` (289 uses), `text-[11px]` (172), `text-xs` (46, which itself renders 12px), `text-[9px]` (25), `text-sm` (5), `text-[8px]` (4), `text-[7px]` (1). This is the single largest source of the "different font size" feeling - converge on one, `text-[10px]` or `text-[11px]` are the two real contenders given how dominant they already are (together ~80% of all uses), not a fresh third choice.

**Also found while investigating a user-reported screenshot (Expenses page): `DatePicker.tsx`'s trigger button used hardcoded `border-gray-300`/`bg-white`/`py-2` and `focus:ring-blue-500` instead of the `--input-*` tokens and `h-10` fixed height every other field on the same form uses - a leftover from restoring it out of git history earlier this session, never updated to match today's conventions. Already fixed directly (not left for this sweep) since it was a clear, contained bug in a single component - see git history. Worth checking `DateRangePicker.tsx`'s own trigger buttons (built ad-hoc per call site, e.g. `InventoryManagement.tsx`'s Fulfill Stock Requisitions filter) for the same class of drift while doing this sweep, since that pattern - copy old styling, don't reconnect it to current tokens - is exactly how this kind of bug happens.**

## Known instances (a starting punch list — not exhaustive, the greps above will find more)

- **Black button, should be blue**: `StaffManagement.tsx:576` — "⚡ Enable Bulk Select"
- **Green "Edit" button, should be blue** (Bookings page's Edit is correctly blue — this one isn't): `InventoryManagement.tsx:2083`
- **Cyan quantity stepper +/-, should be neutral or match Button.tsx's secondary style**: `KitchenManagement.tsx:1679` and `:1681`
- **Card accent borders to remove**: `PettyCashManagement.tsx:376` (red, "Add Expenses"), `StaffManagement.tsx:622` (indigo, "Active System Users & Staff") and `:729` (orange, "Registered Payees"), `AnalyticsDashboard.tsx:857` (purple)
- **Emoji-as-icon, real violation** (not a false-positive arrow): `InventoryManagement.tsx:879-880` and nearby — wastage/spillage reason dropdown uses 💧🥬🔥📦🚨❓ instead of Lucide icons
- **font-mono inconsistency, concrete example**: `GuestHistory.tsx:162` (Bill amount, font-mono) vs. `BillingCheckout.tsx:413`/`484` (Total/Amount Due, font-extrabold, no mono) — same kind of element, two different fonts
- **Raw `<select>`, not StyledSelect**: `GuestHistory.tsx` (2 instances)
- **One remaining raw, unwrapped date input** (everything else already got wrapped in `<Input>` by earlier work — checked fresh, most of what looked like a bigger list turned out already fixed): `PettyCashManagement.tsx:669`, an inline table-cell date editor. This one's a judgment call — it's a compact inline editor, not a full form field, so a full `<Input>` wrapper may not fit the UX; at minimum match its border/focus styling to the `--input-*` tokens instead of the current hardcoded `border-blue-500`.

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
