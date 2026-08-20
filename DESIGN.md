# Ground Code Design System (DESIGN.md)

**As of 19 Aug 2026, this project strictly follows Flowbite's own design system - `DESIGN.md` no
longer maintains a separate, hand-written set of design rules.** The previous version of this file
(23 numbered sections covering border radius, shadows, buttons, tabs, modals, etc.) has been
removed because several of its rules had drifted from - and were actively contradicting - Flowbite's
real defaults (most notably §10, which mandated a universal `rounded-xl`, the opposite of
Flowbite's real `rounded-lg` default; and the frontmatter's `base_size: "14px"`, the exact wrong
root font-size value that was found and removed from `src/index.css` this same day). Maintaining a
parallel spec that can silently drift out of sync with the actual library is worse than not having
one - it gives every future change a plausible-looking but wrong thing to match against.

## Where to look instead

- **Component-level styling** (buttons, badges, modals, tabs, sidebars, cards, tables, inputs):
  `node_modules/flowbite-react/dist/components/<Component>/theme.js` in this repo is the ground
  truth for exactly what classes `flowbite-react` renders. Read the real file, don't guess.
- **Whole-page layout/spacing patterns**: https://flowbite.com/application-ui/demo/ and its
  sub-pages are real rendered application screens - useful for direct `getComputedStyle()`
  comparison via Playwright, not just visual screenshots (small px/color diffs don't show up in a
  screenshot).
- **Do NOT use flowbite.com/docs/components/* pages as ground truth.** As of 19 Aug 2026 those
  pages use a newer, unreleased "Design System" (custom tokens like `bg-brand`, `text-heading`,
  `rounded-base`) that doesn't exist in the `flowbite-react` npm package this app depends on
  (confirmed `0.12.17` is both installed and the latest published version). Comparing against those
  pages produces false mismatches. See project memory `flowbite_design_system_gap` for the full
  detail if this needs re-verifying later.
- **Icons**: `lucide-react` only, no raw emojis in UI controls - see CLAUDE.md's "Icon Library"
  section, which already states this independent of any Flowbite-specific guidance.
- **Colors/dark-mode/z-index/etc.**: still governed by CLAUDE.md's relevant sections (`UI & Design
  Rules`, the documented z-index scale in `src/index.css`) - those weren't part of the removed
  design-rule set and remain in force.

## If a genuinely new, non-Flowbite-covered pattern comes up

Prefer whatever `flowbite-react` itself offers (check its component list before hand-rolling
something). If there's truly no Flowbite equivalent for a pattern this app needs (e.g. the
proprietary multi-room booking calendar - see CLAUDE.md's "Protected Components" note), build it
with plain Tailwind utility classes matching Flowbite's general visual language (the gray/blue
palette, `rounded-lg`, `shadow-md`, the spacing scale already visible throughout
`node_modules/flowbite-react/dist/components/*/theme.js`) rather than inventing a new one-off style.

## Category Filter Toggle Pattern (Search & Filter Bar)

On screens with search and category filtering (e.g. `MenuManager.tsx`, `InventoryManagement.tsx`, `KitchenManagement.tsx`):
- Category filter pills/bars **must not be open by default**.
- Display a filter toggle button (`<Filter className="w-4 h-4" />`) immediately to the right of the search input box.
- The category filter pills bar/carousel is revealed **only when the user clicks the filter toggle button**.
- Active filter indication: When a non-default category is selected and the filter bar is collapsed, display an active dot indicator on the filter toggle button.

