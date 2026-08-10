# CSS Theming System — Implementation Plan

**Status (11 Aug 2026): Phases 1-4 done and verified** — `Input.tsx`/`StyledSelect.tsx`/`Badge.tsx` all correctly wired to their tokens, page-scope classes intact, `tsc`/Vite both clean. Phase 5 (raw-element migration) deliberately not started, per this doc's own instruction.

Two follow-ups found *after* this plan was originally handed off (not failures of whoever implemented it - these were never written into the plan below) are now also fixed: `--btn-primary-*`/`--btn-danger-*` in `index.css` were still static hex, disconnected from the Appearance page's `--color-primary`/`--color-error` (now derive from them, with a static fallback for before the JS theme-fetch resolves); `theme-overrides.css` only had 1 `emerald-*` rule despite `emerald-*` being the actually-used success color family (38 real usages vs. 5 for `green-*`) - regenerated systematically (every shade, not hand-picked) via `gen_theme_overrides.js`, kept in the session scratchpad that built it, so coverage doesn't silently rot again.

---

**For:** whoever picks this up next (Kilo or otherwise) — this doc is self-contained, you shouldn't need to re-audit anything below before starting.

**Goal:** WordPress-style theming in this Tailwind v4 + React app — change one CSS rule, have it apply to every instance of a component sitewide, while still being able to override just one page/section if needed. Two layers, both additive (nothing gets removed from existing markup):

1. **Layer 1 (universal):** CSS custom properties in `src/index.css`, consumed by shared components via Tailwind's `bg-[var(--token)]` arbitrary-value syntax. Change the variable once → every instance sitewide updates, zero React changes.
2. **Layer 2 (page/section-specific):** a scope class already sitting on several page wrapper divs (currently decorative only) — wire it up so `.guest-management-container .app-select-button { ... }` can override just one page.

## Why this, not just "more shared components"

The app already has shared components (`Button`, `Input`, `StyledSelect`, `Badge`). That alone isn't enough — a header-consistency pass done earlier in this project found 14 pages had drifted to raw `<h2>`/`<button>` markup instead of using the shared pattern. A CSS-token layer is a second, independent safety net: even a raw element that bypasses the component still inherits from `:root` if it carries the right class name.

## Audit results — what's already there vs. what's dead

**`Button.tsx` is the working reference implementation — copy this pattern, don't reinvent it.** It already does exactly what's being asked for:

```tsx
// src/components/Button.tsx (excerpt, already correct, no changes needed here)
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--btn-primary-bg)] hover:bg-[var(--btn-primary-hover)] active:bg-[var(--btn-primary-active)] text-[var(--btn-primary-text)] focus:ring-4 focus:ring-[var(--btn-primary-ring)] shadow-sm hover:shadow',
  // ...
};
```
backed by `src/index.css`:
```css
:root {
  --btn-primary-bg: #2563eb;
  --btn-primary-hover: #1d4ed8;
  /* ... */
}
html.dark {
  --btn-primary-bg: #3b82f6;
  /* ... */
}
```
Change `--btn-primary-bg` once → every `<Button variant="primary">` on the site updates, light and dark mode both handled by the `html.dark` block already present.

**Everything else stops short:**

| File | Marker classes present? | CSS vars exist? | Actually wired up? |
|---|---|---|---|
| `Button.tsx` | `app-btn`, `app-btn-{variant}`, `app-btn-{size}` | `--btn-*` (index.css:9-33, 55-79) | ✅ Yes |
| `Input.tsx` | `app-input-wrapper`, `app-input`, `app-input-error`, `app-input-disabled`, `app-label`, `app-error-text`, `app-helper-text` | `--input-*` (index.css:35-51, 81-97) | ❌ **No** — tokens defined, `Input.tsx` hardcodes Tailwind colors directly (`bg-white dark:bg-slate-900`, `border-slate-300`, etc.) instead of reading them |
| `StyledSelect.tsx` | `app-select-wrapper`, `app-select-button`, `app-select-dropdown` | none yet | ❌ No CSS rules target these classes at all — pure hardcoded Tailwind |
| `Badge.tsx` | `app-badge`, `app-badge-{variant}` | none yet | ❌ Same — marker classes present, no CSS rules, colors hardcoded in a `variantClasses` map |

So the marker-class naming convention (`app-*`) is already established and consistent — just needs the CSS side finished for 3 of the 4 components.

## Phase 1: Wire up `Input.tsx` to the existing (currently dead) `--input-*` tokens

Current `Input.tsx` (relevant excerpt, `src/components/Input.tsx:58-68`):
```tsx
className={`
  app-input ${hasError ? 'app-input-error' : ''} ${disabled ? 'app-input-disabled' : ''}
  w-full h-10 px-3.5 text-sm font-medium rounded-lg transition-all duration-200 outline-none
  bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500
  border ${
    disabled
      ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
      : hasError
      ? 'border-red-400 dark:border-red-500 focus:ring-4 focus:ring-red-100 dark:focus:ring-red-900/30'
      : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 focus:border-cyan-500 dark:focus:border-cyan-400 focus:ring-4 focus:ring-cyan-100 dark:focus:ring-cyan-900/30'
  }
  ${leftIcon ? 'pl-10' : ''}
  ${rightIcon ? 'pr-10' : ''}
  ${className}
`}
```

Replace the hardcoded color/border/bg utilities with the existing tokens (mirror `Button.tsx`'s approach exactly):
```tsx
className={`
  app-input ${hasError ? 'app-input-error' : ''} ${disabled ? 'app-input-disabled' : ''}
  w-full h-10 px-3.5 text-sm font-medium rounded-lg transition-all duration-200 outline-none
  bg-[var(--input-bg-default)] text-[var(--input-text-default)] placeholder:text-[var(--input-placeholder)]
  border ${
    disabled
      ? 'border-[var(--input-border-disabled)] bg-[var(--input-bg-disabled)] text-[var(--input-text-disabled)] cursor-not-allowed opacity-60'
      : hasError
      ? 'border-[var(--input-border-error)] bg-[var(--input-bg-error)] text-[var(--input-text-error)] focus:ring-4 focus:ring-[var(--input-ring-error)]'
      : 'border-[var(--input-border-default)] hover:border-slate-400 dark:hover:border-slate-500 focus:border-[var(--input-border-focus)] focus:ring-4 focus:ring-[var(--input-ring-focus)]'
  }
  ${leftIcon ? 'pl-10' : ''}
  ${rightIcon ? 'pr-10' : ''}
  ${className}
`}
```
No `index.css` changes needed for this phase — the tokens already exist in both the `:root` and `html.dark` blocks.

## Phase 2: Add `--select-*` tokens, wire into `StyledSelect.tsx`

Add to `src/index.css`, inside the existing `:root { ... }` block (after the `--input-*` tokens, before the closing `}` at line 52):
```css
  /* Select - Light */
  --select-bg: #ffffff;
  --select-border-default: #cbd5e1;
  --select-border-hover: #94a3b8;
  --select-border-focus: #06b6d4;
  --select-ring-focus: rgba(6, 182, 212, 0.25);
  --select-dropdown-bg: #ffffff;
  --select-dropdown-border: #e2e8f0;
  --select-option-hover: #f8fafc;
  --select-option-selected-bg: #eff6ff;
  --select-option-selected-text: #1d4ed8;
```
And inside the existing `html.dark { ... }` block (after `--input-*` dark tokens, before its closing `}` at line 98):
```css
  /* Select - Dark */
  --select-bg: #0f172a;
  --select-border-default: #475569;
  --select-border-hover: #64748b;
  --select-border-focus: #22d3ee;
  --select-ring-focus: rgba(34, 211, 238, 0.3);
  --select-dropdown-bg: #1e293b;
  --select-dropdown-border: #334155;
  --select-option-hover: #334155;
  --select-option-selected-bg: rgba(30, 58, 138, 0.4);
  --select-option-selected-text: #60a5fa;
```
(Color choices above default to the site's existing cyan-accent select styling seen today in `StyledSelect.tsx` — adjust the hex values to your preference before implementing, this is just a starting point that preserves current visuals.)

Then update `src/components/StyledSelect.tsx`'s `className` strings (lines 80-96 for the button, line 107 for the dropdown, lines 144-150 for options) to replace the hardcoded `border-slate-300`/`bg-white dark:bg-slate-800`/etc. with the new `var(--select-*)` references, same pattern as Phase 1.

## Phase 3: Add `--badge-*` tokens, wire into `Badge.tsx`

`Badge.tsx` currently has 5 variants (`success`, `danger`, `warning`, `info`, `neutral`) each with a hardcoded Tailwind class string in a `variantClasses` map (`src/components/Badge.tsx:11-17`). Same pattern: add `--badge-success-bg`, `--badge-success-text`, `--badge-success-border` (×5 variants ×2 modes = 30 tokens) to `index.css`, then replace the map's string values with `bg-[var(--badge-success-bg)] text-[var(--badge-success-text)] border-[var(--badge-success-border)]` etc.

## Phase 4: Activate the existing (currently dead) page-scope wrapper classes

These wrapper classes already exist in the codebase, applied to page root divs, but have zero CSS behind them today — they're just descriptive names:
- `guest-management-container` — `GuestManagement.tsx`
- `expenses-page-container` — `PettyCashManagement.tsx`
- `stock-inventory-container` — `InventoryManagement.tsx`
- `analytics-dashboard-container` — `AnalyticsDashboard.tsx`
- `kitchen-wastage-container` — `InventoryManagement.tsx` (deficit/wastage sub-view)

Once Phases 1-3 land, these become real override hooks for free:
```css
/* Only the Analytics page's selects get a slightly different focus ring */
.analytics-dashboard-container .app-select-button:focus {
  --select-ring-focus: rgba(147, 51, 234, 0.25);
}
```
No React changes needed for this phase — just add CSS rules as specific pages need one-off tweaks. Don't add speculative overrides here; only add a page-scope rule when there's an actual design request for that one page.

**Not every page has one of these wrapper classes yet.** If a future one-off override is needed on a page that doesn't have a scope class, add `className="page-{name}"` to that page's root div first (follow the existing naming style), then write the scoped CSS rule.

## Phase 5 (separate, larger, do later): migrate raw elements that bypass the shared components

Today's audit was limited to the 4 shared components. There are ad-hoc raw `<input>`, `<select>`, and badge-like `<span>` elements scattered across the app that don't use `Input`/`StyledSelect`/`Badge` at all (same drift problem the header-consistency pass found for `<h2>`/`<button>`). These won't benefit from Phases 1-3 until migrated to use the shared components. This is comparable in scope to the earlier header migration (14 files) — treat it as its own project, not a quick add-on. Suggested approach: `grep -rn "<select\b" src/components` and `grep -rn "<input\b" src/components` (excluding `Input.tsx`/`StyledSelect.tsx` themselves) to build the file list, then migrate one at a time, verifying `tsc --noEmit` after each.

## Verification steps (do these after every phase, not just at the end)

```bash
npx tsc --noEmit -p tsconfig.json   # must be silent — any output is a real error
```
Also spot-check a couple of pages in the browser (light + dark mode) for each component touched — CSS var typos don't show up as compile errors, only as wrong colors at runtime.

## What NOT to do

- Don't remove any existing Tailwind utility classes from JSX while doing this — the `app-*`/`page-*` classes are additive hooks, not replacements. Only the *color/border/bg* utilities inside the shared components get swapped for `var()` references; layout utilities (`flex`, `gap-2`, `rounded-lg`, etc.) stay as-is.
- Don't touch `Badge`/`Input`/`StyledSelect`'s *props/behavior* — this is a pure styling-source change, the component APIs stay identical.
- Don't start Phase 5 (raw-element migration) until Phases 1-4 are done and verified — it's a much bigger, separate effort.
