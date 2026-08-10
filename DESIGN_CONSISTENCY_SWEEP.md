# Design Consistency Sweep — Implementation Plan

**For:** whoever picks this up next (Kilo/DeepSeek/otherwise) — self-contained, no need to re-audit the findings below before starting.

**Relationship to `CSS_THEMING_PLAN.md`:** that doc built the *infrastructure* (CSS custom-property tokens, shared components wired to them) and is done — verified working, `Button`/`Input`/`StyledSelect`/`Badge` all correctly read their tokens. This doc is different: it's about *applying* a consistent convention to existing pages that still make their own one-off styling choices. The tokens don't fix that automatically — they just mean that once a choice is fixed, it's a one-line change instead of a hunt.

**Goal:** the site should look like one product, not like different pages were built in different sessions with different opinions (which is literally what happened). No new visual design — apply the conventions below consistently.

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
```

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
