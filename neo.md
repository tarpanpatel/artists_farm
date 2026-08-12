# Task: Add BEM-style custom classes to every element

Add a unique, stable CSS class to every meaningful visual element
(containers, cards, buttons, inputs, headers, badges) across
`src/components/*.tsx`, using BEM-style naming:
`component-name__element-name` (kebab-case), e.g.
`header__profile-badge`, `receipt-modal__lodging-input`,
`kitchen-dashboard__order-card`. The component name prefix should match
the file name (lowercased, hyphenated).

## Hard rules — do not deviate

1. **Additive only.** Append the new class to the *existing* `className`
   string — never remove, rename, or reorder any existing Tailwind
   classes.
2. **Never touch logic.** Don't modify conditionals, ternaries, ARIA
   attributes, event handlers, or any non-className prop. If a
   `className` is built dynamically (template literal, ternary,
   `classnames()` call), append the new static class into that same
   expression without changing its branching logic.
3. **One component file per commit-sized batch.** Don't do a sweeping
   multi-file regex pass — go file by file so a mistake stays contained
   and diffable.
4. **No new dependencies, no new files, no renamed files.**
5. **Skip elements that already have a clearly unique class** (don't
   double up).
6. After each file, run `npm run build` and confirm it still succeeds
   before moving to the next file.

## Practical notes for running this

- **Scope it in waves rather than all-at-once** — start with the pages
  worth skinning per-tenant (Header, Navigation, the two overview
  dashboards, GuestManagement, BillingCheckout) rather than demanding
  all ~60 components in one shot. Easier to review, easier to catch a
  bad pattern before it repeats everywhere.
- **Work in a separate branch or worktree**, not directly on
  `multi-tenant` — this is a huge diff by line count even though each
  change is trivial, and it shouldn't fight with the live deploy branch.
- **Final review pass before it ships**: confirm the build is actually
  clean, spot-check a few files for the "additive only" rule holding up,
  and make sure nothing dynamic got flattened. Fast review since the
  diff shape is trivial to scan (pure `className` additions), unlike
  reviewing claimed logic bugs.
