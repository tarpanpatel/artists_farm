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

- **Core Flowbite Source Repository & Component Codes**:
  https://github.com/themesberg/flowbite/tree/main/content/components
  These are the core canonical Flowbite component codes and markup patterns to be used across all screens on this site.
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
- **Icons (CRITICAL - standing rule since 21 Aug 2026)**: Use Flowbite's icon set - see the
  [Flowbite icons reference](https://github.com/themesberg/flowbite/blob/main/content/customize/icons.md).
  No raw emojis in UI controls either. `lucide-react` is being phased out project-wide and must not
  be used for any new or touched UI - do not reintroduce Lucide imports in new components. Migration
  is in progress, not done: as of 21 Aug 2026 `lucide-react` is still a dependency and still imported
  in ~76 files across `src/`. Replace icons screen-by-screen as you touch a file - don't do a mass
  find-replace sweep unless explicitly asked for one.
- **Typography & Font Discipline Rule (Strict Limit)**:
  - **Font Families (Maximum 2)**: Never have more than 2 font families across the entire application or landing pages (Primary body/UI font: `Inter, sans-serif`; optional monospace/code font: `monospace` only where strictly required for technical IDs/code snippets, otherwise 1 universal clean font).
  - **Font Sizes (Maximum 3 per view/screen)**: Never have more than 3 distinct font sizes on any given screen, card, or component layout. Standardize strictly on:
    1. **Heading / Stat Size**: `text-lg` (or `text-xl`/`text-base` for primary card/section titles).
    2. **Standard Body / Action Size**: `text-xs` (for UI labels, buttons, list items, paragraphs, table cells).
    3. **Micro / Tag / Metadata Size**: `text-2xs` (for badges, sub-labels, timestamps, pill chips).
- **GroundCode Brand Manifesto Rule (Strict Compliance)**: Always strictly adhere to `GROUNDCODE_BRAND_MANIFESTO.md` across all marketing copy, landing pages, competitive comparisons, UI labels, and user communication:
  - **No line longer than 10 words**: Keep all lines, bullets, and sentences punchy, short, and scannable.
  - **Maximum visuals, images, and icons — least words**: Favor diagrams, icon tiles, and interactive elements over heavy paragraphs.
  - **Friendly Homestay Host Tone**: Write like talking to a friendly homestay host, never like an academic whitepaper or corporate slide deck.
  - **No corporate jargon or lectures**: Never lecture about "money leakage" or "pennywise profit". Small business owners care most about operations ease; smooth operations naturally eliminate loss.
  - **Never show fake URLs**: (e.g. `domain.com/path`) in screenshots or examples.
  - **Never mention tablets**: Clients must feel their mobile phone is completely sufficient.
  - **Telegram strictly for staff operations**: Cleaners, caretakers, guards, cooks use Telegram with zero apps to install.
  - **WhatsApp strictly for guests**: Direct booking vouchers, checkout bills, folios, and fast quotes only.
  - **Product Scope Honesty**: GroundCode actually has nearly everything a complete hotel PMS should have, ready for wide testing, but we deliberately start with smaller properties first for stability.
- **Fonts**: Flowbite's default fonts everywhere.
- **Component library**: `flowbite-react` (+ the `flowbite` Tailwind plugin and the official markup
  patterns linked above) is the standard for all new, rebuilt, or updated components, modals, forms,
  and tables. The **existing** hand-built shared components (`src/components/Input.tsx`,
  `StyledSelect.tsx`, `Button.tsx`, etc.) are still in active use across most of the
  app and are **not** dead code - don't delete or bypass them ad hoc. They get replaced
  screen-by-screen as part of the migration, same as icons. (`Tooltip.tsx` was this list's one
  exception - deleted 24 Aug 2026 once the "no `<Tooltip>` components" rule below was finally
  enforced everywhere, leaving it with zero real usages left to bypass.)
- **Dark mode**: every color utility needs a `dark:` variant - no exceptions.
- **Flowbite Toast Exact Styling Standard Rule**: All toast notifications across the entire platform (success, error/danger, warning, interactive feedback) must strictly follow the official Flowbite Toast component specifications ([https://flowbite.com/docs/components/toast/](https://flowbite.com/docs/components/toast/)) using `<Toast>` / `<ToastToggle>` or `src/components/ToastContext.tsx`. Never build custom unstyled centered floating green pills, ad-hoc alert toasts, or borderless toast notifications. Toasts must always feature: (1) `rounded-lg` container with dark mode token support (`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg`), (2) `w-8 h-8 rounded-lg` colored icon badge chip (`bg-green-100 text-green-500 dark:bg-green-800 dark:text-green-200` for success, `bg-red-100 text-red-500 dark:bg-red-800 dark:text-red-200` for error, `bg-orange-100 text-orange-500 dark:bg-orange-700 dark:text-orange-200` for warning), (3) `ms-3 text-sm font-normal text-gray-900 dark:text-white` body typography, and (4) standard dismiss toggle button.
- **Z-index**: governed by the scale documented directly in `src/index.css` - never adjust
  header/sidebar/modal z-index in isolation.
- **All Badges Must Be Flowbite Default Badges Rule (Strict Standard)**: All badges, status chips, count tags, and indicator labels across the entire platform must strictly adhere to Flowbite's official Default Badge specifications ([https://github.com/themesberg/flowbite/blob/main/content/components/badge.md](https://github.com/themesberg/flowbite/blob/main/content/components/badge.md)).
  - **No Borders (Default Badge Standard)**: Flowbite Default Badges do **NOT** have borders. Never add `border` or `border-*` classes to default badges. They rely strictly on Flowbite's soft background fill and strong text color pairings (`bg-*-100 text-*-800 dark:bg-*-900 dark:text-*-300`).
  - **Standard Rounded Corners (NEVER `rounded-full`)**: Never use `rounded-full` (capsule/pill badges); Flowbite explicitly classifies `rounded-full` as a separate non-default pill variant (`## Pill badges`). All badges must strictly use Flowbite's default badge geometry with standard `rounded` (or `rounded-md`, 4px) corners, `text-xs font-medium` (or `text-2xs font-semibold`), and standard padding (`px-2.5 py-0.5 rounded` or `px-2 py-0.5 rounded`).
- **Non-Interactive Badges & Button Exclusivity Rule**: Badges (`<Badge>`) and status/count chips are strictly passive, non-interactive visual indicators. Anything that performs an action, triggers navigation, jumps dates (e.g. 'Today'), or opens dialogs must NEVER be rendered as a badge or in badge-like chip styles (`bg-blue-50 text-blue-600 rounded-md`). Interactive actions must strictly use formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, `variant="outline"`, or `variant="ghost"`) so users have unambiguous visual button affordances.
- **OTA Badges & Branding Rule**: Everywhere OTA sources and channel names are displayed across the site (e.g. Airbnb, Booking.com, Agoda, Expedia, Vrbo), they must strictly be rendered in a badge with a clean white background in light mode and gray-800 in dark mode (`bg-white text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700`), preceded by the official OTA platform brand logo before the name (e.g. `<OtaBadge>` / `<AirbnbIcon>` / `<BookingComIcon>`). Never render OTA badges with yellow/amber or colored backgrounds, and never display OTA names as plain unbranded text.
- **Colors**: not a separate hand-picked palette - follow `flowbite-react`'s own semantic color
  tokens per `node_modules/flowbite-react/dist/components/*/theme.js` rather than hand-picking
  Tailwind color classes, same ground-truth approach as everything else here.
- **Device Mockups (marketing/landing pages only, added 30 Aug 2026)**: `home.html` (the public
  marketing landing page - plain static HTML + compiled Tailwind, not `flowbite-react`, so the
  component-library rules above don't apply to it) uses two distinct app-screenshot mockup styles,
  picked by what the screen actually is:
  - **Desktop "browser chrome" mockup** (dark `bg-slate-900` bezel + red/amber/emerald traffic-light
    dots) for screens genuinely used on a desktop/tablet - the Dashboard, Analytics, Kitchen Display,
    Cash Drawer, and Payroll screenshot sections all use this.
  - **Real phone Device Mockup** (`https://flowbite.com/docs/components/device-mockups/` - the
    smartphone frame: 14px bezel, 2.5rem corner radius, notch + side-button divs) for anything that's
    genuinely phone-native, first used for the Telegram staff-ops chat screen (`#telegram-ops`) since
    staff actually use Telegram on their phones, not in a browser window. Use this same frame for any
    future WhatsApp/PWA-screen marketing mockup.
  - **Re-confirms the warning right above**: fetching that device-mockups doc page live (30 Aug 2026)
    reproduced the exact same unreleased-token-class problem - it renders its example with
    `border-default`/`bg-base`/`bg-neutral-primary`, none of which exist in this project's compiled
    Tailwind. The frame's pixel dimensions/structure in that doc page are real and stable and worth
    reusing; the color class names are not - substitute real Tailwind color utilities (this page uses
    `slate-900`, matching its existing browser-chrome bezels) instead of copying the doc's classes
    verbatim. See the phone-mockup markup already built out in `home.html`'s `#telegram-ops` section
    for the corrected, working version.

## If a genuinely new, non-Flowbite-covered pattern comes up

Prefer whatever `flowbite-react` itself offers (check its component list before hand-rolling
something). If there's truly no Flowbite equivalent for a pattern this app needs (e.g. the
proprietary multi-room booking calendar - see CLAUDE.md's "Protected Components" note), build it
with plain Tailwind utility classes matching Flowbite's general visual language (the gray/blue
palette, `rounded-lg`, `shadow-md`, the spacing scale already visible throughout
`node_modules/flowbite-react/dist/components/*/theme.js`) rather than inventing a new one-off style.

## Card Action Buttons & Secondary Edit Button Rules

- **Buttons Everywhere (No Plain Linked Text for Actions) Rule**: Everywhere across the site, interactive primary and secondary actions (e.g. "Open Property", "Manage", "View Details", "Save", "Create", "Edit") must strictly be rendered as formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, etc.) rather than plain linked text, colored anchor links (`text-teal-600`, `text-blue-600`), or clickable text spans. Users must always have clear visual button affordances so they unambiguously know what is clickable.
- **Horizontal Space-Saving Card Layout Rule**: Resource, property, and entity cards (such as in property pickers, selection dialogs, and overview lists) must arrange the icon on the left with title and slug/metadata placed horizontally to the right of the icon (`flex items-center gap-3`), accompanied by an explicit action button on the right. Never vertically stack icons above titles in full-width list cards when horizontal placement saves vertical space and prevents unnecessary vertical scrolling.
- **Action Button Hierarchy & Ghost Button Usage**:
  - **Primary CTA (`variant="primary"`)**: High-intent primary action (e.g. "Open Property", "Save Changes", "Create Booking"). Solid filled Flowbite blue. Exactly 1 dominant primary action per card or view group.
  - **Secondary Action (`variant="secondary"`)**: Form/modal cancel, secondary options, auxiliary filters. Outlined/bordered button.
  - **Secondary Edit Action (`variant="edit"`)**: Specifically reserved for Edit actions (`bg-blue-50 border border-blue-200 text-blue-700`). Never use primary blue for editing.
  - **Ghost Action (`variant="ghost"`)**: Lightweight utility actions (header Back navigation, dismiss actions, table row quick icons, header logout). Keeps the layout feeling light, airy, and modern without heavy visual borders competing with content, while ensuring full button ergonomics (touch sizing, hover pill highlight, focus states).
  - **Destructive Action (`variant="danger"` or `variant="ghost"` with red tokens)**: Delete or Log Out actions must strictly use red styling tokens (`text-red-600 dark:text-red-400` or `hover:text-red-600 dark:hover:text-red-400` / `hover:bg-red-50 dark:hover:bg-red-950/40`) to clearly signify destructive or session-terminating actions.
- **Primary Action Primacy**: Main primary action buttons on cards (e.g. "Open Property", "Manage", "Create") must use `<Button variant="primary">`.
- **Secondary Edit Buttons**: Edit buttons are secondary maintenance actions and must **never** use primary button styling (e.g. solid filled primary blue). Everywhere across the site, edit actions on cards or headers must strictly use `<Button variant="secondary">` (or `<Button variant="outline">` where appropriate) to maintain visual hierarchy.
- **Red Delete & Logout Action Icons Rule**: All delete action icons/buttons and logout action icons/buttons across the platform must strictly use red styling tokens (`text-red-600 dark:text-red-400` or `hover:text-red-600 dark:hover:text-red-400` / `hover:bg-red-50 dark:hover:bg-red-950/40`) to clearly signify destructive or session-terminating actions.

## Category Filter Toggle Pattern (Search & Filter Bar)

On screens with search and category filtering (e.g. `MenuManager.tsx`, `InventoryManagement.tsx`, `KitchenManagement.tsx`):
- Category filter pills/bars **must not be open by default**.
- Display a filter toggle button (`<Filter className="w-4 h-4" />`) immediately to the right of the search input box.
- The category filter pills bar/carousel is revealed **only when the user clicks the filter toggle button**.
- Active filter indication: When a non-default category is selected and the filter bar is collapsed, display an active dot indicator on the filter toggle button.

## Tooltips & Popovers Specification (Flowbite Popover Standard)

Canonical reference: https://github.com/themesberg/flowbite/blob/main/content/components/popover.md

- **Never use generic OS/browser `title="..."` attributes or basic `<Tooltip>` components** for UI information, tooltips, or hover alerts.
- All hover tooltips and interactive micro-cards across the site must strictly use `<Popover>` (`src/components/Popover.tsx`) styling:
  - **Container**: `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg text-xs`
  - **Header** (when titled): `px-3 py-2 bg-gray-50 dark:bg-gray-700/60 border-b border-gray-200 dark:border-gray-700 font-semibold text-gray-900 dark:text-white rounded-t-lg`
  - **Body**: `px-3 py-2 text-gray-600 dark:text-gray-300`
  - **Trigger**: Support `trigger="hover"` for informative popover tooltips and `trigger="click"` for action popovers.

## Single Calendar Specification (Flowbite Application UI Demo Calendar)

Canonical reference: https://flowbite.com/application-ui/demo/pages/calendar/

All single monthly calendars across the platform (such as single-room booking calendars, operational overview calendars, and attendance views) must follow the Flowbite Application UI Calendar layout:
- **Card Container**: `bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden`
- **Toolbar / Header**:
  - Month & year title (`text-base sm:text-lg font-bold text-gray-900 dark:text-white`) paired with navigation buttons (`<`, `>` chevron controls) and a quick `"Today"` jump button.
  - Context badges or action buttons aligned cleanly on the right.
- **Day-of-Week Columns**:
  - 7-column header grid (`grid grid-cols-7 border-y border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 py-2.5`) with uppercase tracking (`text-xs font-semibold uppercase tracking-wider text-center text-gray-500 dark:text-gray-400`).
- **Calendar Grid & Cells**:
  - 7-column grid using standard Flowbite grid dividers (`grid grid-cols-7 divide-x divide-y divide-gray-200 dark:divide-gray-700 border-b border-gray-200 dark:border-gray-700`).
  - Leading/trailing inactive cells: `min-h-[100px] p-2 bg-gray-50/50 dark:bg-gray-800/40`.
  - Active cells: `min-h-[100px] p-2 bg-white dark:bg-gray-800 flex flex-col justify-between`.
  - Today date badge: highlighted with a blue circular badge (`inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold shadow-xs`).
  - Event / Booking pills: `rounded-md px-2 py-1 text-xs font-medium shadow-2xs` using Flowbite semantic color tokens (`blue`, `purple`, `emerald`, `amber`, `gray`).

## Booking Capsules Must Inset Into the Check-in and Check-out Cells (added 7 Sep 2026, explicit request)

Canonical reference: Airbnb's host Multicalendar (`airbnb.co.in/multicalendar`).

**On ANY calendar that draws a stay as a bar/capsule across date cells, the capsule must NOT fill
the check-in and check-out cells edge to edge - and the two ends are NOT the same size.** A stay's
check-in edge shows the last 70% of its check-in cell; its check-out edge shows only the first 20%
of its check-out cell. The two are asymmetric on purpose - see "Why asymmetric" below.

Given a stay whose check-in falls on column index `S` and check-out on column index `E`, with
`w` = one cell's width, `v_in` = 0.7 (check-in visible fraction) and `v_out` = 0.2 (check-out
visible fraction):

```
left  = (S + (1 - v_in)) * w              /* = (S + 0.3) * w - starts 30% into the arrival cell */
width = (E - S - (1 - v_in - v_out)) * w  /* = (E - S - 0.1) * w */
```

A 2-night stay 11 → 13 therefore spans 1.9 cells; a 1-night stay spans 0.9 cell - both far fuller
than an edge-to-edge fill would suggest they should be trimmed, while still leaving a gap (below).

**Why asymmetric, not the same fraction on both ends:** a stay's check-out edge and the NEXT
stay's check-in edge only ever share ONE cell, on a same-day turnover - and their visible
fractions only need to sum to under 100% for a gap to survive there
(`v_out + (1 - v_in) < 1`, i.e. `v_out < v_in`), regardless of the individual values. 20%+70%=90%,
leaving a real 10%-of-a-cell gap. This lets the check-in side be pushed much fuller than a
symmetric split could ever allow at the same gap size - which also happens to match the real-world
asymmetry the "Why" section below describes: a departing guest's morning-only presence on the
check-out day is a small tail; an arriving guest's afternoon-through-next-morning presence on the
check-in day is most of it.

**Revision history.** All four revisions happened 7 Sep 2026, the same day this rule was added,
across live comparisons against Airbnb's own calendar and its own host Multicalendar screenshots:
1. Original cut: 20% per side, symmetric (2-night stay = 1.4 cells) - correct in shape but too
   aggressive, making a 1-night stay (0.4 cell wide) read as a stray sliver rather than a booking.
2. First correction: dropped to 10% per side - a mistake in the wrong direction (a smaller
   per-side fraction shrinks the capsule further, it does not grow it - 10%/side is thinner than
   the original 20%, not fuller). Caught when larger numbers were proposed next and the arithmetic
   was re-checked from scratch.
3. Second correction: 35% per side, symmetric (2-night = 1.7 cells, 1-night = 0.7 cell) - fixed
   the direction, but its own write-up here claimed an asymmetric split "does not help - it
   still consumes the same shared-cell budget" - that claim was wrong (see "Why asymmetric"
   above: it is specifically the size relationship between the two sides that matters, not their
   sum against some fixed budget). This version briefly shipped alongside a same-day-turnover
   marker UI in `TodayOverview.tsx` (a small combined ↔ badge + popover, added and then removed
   the same day once the asymmetric gap below made it unnecessary).
4. Current: asymmetric 70%/20% (2-night = 1.9 cells, 1-night = 0.9 cell) - the check-out side is
   kept deliberately small specifically so the check-in side can be pushed much fuller than any
   symmetric split allows at the same 10%-of-a-cell gap (see "Why asymmetric" above).

**Why.** A stay does not own the whole of either end day - the guest arrives in the afternoon and
leaves in the morning (Airbnb's own reservation detail for these listings: check-in 1:00 pm,
check-out 11:00 am). Two consequences follow, and both are the real reason for this rule:

- **Same-day turnover has to stay readable.** One guest checks out on the 13th and another checks in
  on the 13th; that is legal and routine (see CLAUDE.md's half-open overlap rule). If both capsules
  fill the 13th edge to edge they collide into one continuous bar and read as a double-booking - the
  single most alarming thing this app can show a property owner. Insetting leaves a visible gap that
  says "this room turns over today."
- **A blank-looking end cell is a lie in the other direction.** Filling the check-out cell entirely
  also implies the room is unavailable that night, when it is in fact bookable.

**This is presentation only.** The underlying availability maths stays half-open
(`existing_start < new_end && existing_end > new_start`) exactly as it is - do not "fix" overlap
detection to match the visuals, and do not treat the check-out date as an occupied night. A stay
11 → 13 occupies the nights of the 11th and 12th; that is what any highlight, count or conflict
check must use. The asymmetric inset is how that fact is drawn, not a change to what it means.

**Where the asymmetric inset applies:** the two surfaces that actually draw stay capsules -
`TodayOverview.tsx` and `OperationalDashboard.tsx` (both render them into a separate absolutely
positioned overlay; grep `data-cal-capsule`). Any new capsule surface joins this list.

**Where only the second half applies:** the public booking engine's availability grid
(`PublicBookingEngine.tsx`) paints one cell per day and draws no capsules, so there is no bar to
inset - but "the check-out date is not a night" governs it just the same. Its per-room highlight
therefore covers check-in through check-out-minus-one, and only for rooms free every night of the
stay (`getRoomRangeStatus()`; fixed 7 Sep 2026, when asking for 11 → 13 highlighted the 13th and lit
up rooms that were free on just one day of the range).

## Calendar State Styling Is Shared, Not Per-Calendar (added 12 Sep 2026, explicit request)

**"This date is in the past" and "this stay has already ended" mean the same thing on every
calendar, so they must LOOK the same on every calendar.** These rules have nothing to do with which
surface you happen to be viewing, so they live in one file - `src/utils/calendarStyles.ts` - and
both calendar surfaces import from it:

- `TodayOverview.tsx` - the rooms x days multicalendar
- `OperationalDashboard.tsx` - the single-property weeks x 7 month grid

**Only the state -> appearance mapping is shared. Layout is not** - the two grids are legitimately
different shapes, and unifying them was explicitly not the goal. Each also keeps its own
present/future cell background (the month grid draws its lines with `divide-x`/`divide-y` on the
week row; the multicalendar draws a border per cell), and its own hover idiom (the multicalendar
shifts a capsule's background; the month grid dims the whole capsule with `hover:opacity-90` - hence
`getCapsuleClasses({ withHover: false })` there, so the two don't stack).

**The module exports the DECISION, not just the colours** - `getCapsuleClasses()`,
`getOtaBlockCapsuleClasses()`, `getPastDayCellClasses()`, `getPastDayTextClasses()`, plus the shared
`isElapsedStay()`/`isPastDayKey()` predicates. This is the point: the drift found 12 Sep 2026 was
not a mismatched shade, it was the month grid **missing the rules outright** -

- it computed `isPastDay` but used it only to disable drag handlers, so elapsed day cells rendered
  identical to future ones (plain white);
- it greyed a capsule only on `CheckedOut` status, so a booking whose dates had simply elapsed
  without anyone flipping the status stayed full blue - seen on staging as an 8-9 Sep bar still
  bright blue on the 12th.

A CSS custom property would have made the grey restyleable in one place but would have fixed
neither of those, because what was missing was the rule, not the hex.

**Capsule colour precedence, and it must not be reordered:** elapsed > checked-out > OTA > direct.
An elapsed stay reads as a historical record, which is the more important fact once it is true, so
it outranks both the source colour and the status colour.

**Rules for anyone adding a calendar surface, or changing a colour:**
- Changing a shade = edit the token in `calendarStyles.ts` once; both calendars follow. Never
  re-declare a calendar state colour in a component - that re-declaration is exactly how this drifted.
- Any new surface that draws date cells or stay capsules imports from this module (and also joins
  the asymmetric-inset rule above; grep `data-cal-capsule`).
- Every class string in that file must stay a COMPLETE literal - never build one by interpolation
  (`bg-${c}-200`), since Tailwind scans it as plain text and will not emit a class it cannot see
  spelled out.
- `isElapsedStay()` treats the end date as the EXCLUSIVE checkout boundary, so a guest checking out
  today has not elapsed. This matches the half-open availability rule in CLAUDE.md and
  `BookingDetailsModal.tsx`'s own `isPastBooking` lock - don't "simplify" it to `<=`.

## Date/Time Input Fields (found 21 Aug 2026)

The spec above governs full monthly **calendar views**. It says nothing about single date/time
**input fields**, which is why two raw native inputs slipped through every prior pass unflagged:
`KitchenManagement.tsx`'s Staff Meals "Date & Time of Record" (`type="datetime-local"`) and
`PettyCashManagement.tsx`'s Edit Expense modal (`type="date"` + `type="time"`). A raw
`type="date"`/`type="datetime-local"` input opens the browser's own OS-level picker (Chrome's
month grid + scrollable hour/minute columns) — not Flowbite, not stylable past the
`::-webkit-calendar-picker-indicator` icon (see `src/index.css`'s existing "Global Date Input"
block), and visually inconsistent with the rest of the app by construction, not by mistake.

**Rule**: any single date-entry field uses flowbite-react's real `Datepicker` component
(`node_modules/flowbite-react/dist/components/Datepicker`), not a raw `<input type="date">`.
**Caveat**: `Datepicker`'s props (`value`/`onChange`: `Date | null`, `minDate`, `maxDate`, etc.)
are date-only — no time support at all. For a field that needs a time component too (Staff Meals,
PettyCash's expense time), pair `Datepicker` for the date half with a separate `type="time"` input
for the time half (still native, still opens an OS picker, but it's a narrower, unavoidable gap —
flowbite-react has no Timepicker) rather than leaving the whole field as `type="datetime-local"`.

## No Icons Inside Input Fields (added 29 Aug 2026, explicit request: "I don't want any icons inside fields")

**A text input's box contains text and nothing else.** No glyph is absolutely-positioned over a `<input>` / `<textarea>`, and the input never carries `pl-9`/`pl-10`/`pr-10`-style padding reserved for one.

- **Leading decoration** (a search magnifier, a mail/user/lock glyph, a "+91" badge, etc.) is removed. If the field genuinely needs a label beyond its `placeholder`, use the real `<label>` or `helperText`, not an in-field icon.
- **Trailing controls** (a clear-"×", a password show/hide eye) move to a real `<button>` **beside** the field (outside its border), or are dropped. They are not painted inside the input.
- **Validation state**: the red/green **border + ring + message** from the Flowbite validation pattern stay (see "Real-Time Form Validation" in CLAUDE.md), but the inline `AlertTriangle`/`CheckCircle2` **icon inside the field is dropped** - this rule supersedes that part of the pattern. `src/components/Input.tsx` renders those; the icon overlay comes out, the `error`/`success` colour + `helperText` message stay.
- **`src/components/Input.tsx`'s `leftIcon`/`rightIcon` props are deprecated** - do not pass them on new code; existing call sites get migrated (icon removed, or moved to a sibling element) screen-by-screen as each file is touched, same cadence as the Lucide migration.
- **Exempt - native widget affordances, not "icons in a field"**: a `<select>` / `StyledSelect` dropdown chevron and flowbite-datepicker's calendar-trigger button. These *define what the control is* (a select with no chevron reads as a broken text box) and are part of the widget, not decoration layered onto a text input. If the user later wants these gone too, that's a separate call.

## DataTable & Table Log Specifications

Canonical Flowbite Datatables reference: https://github.com/themesberg/flowbite/blob/main/content/components/tables.md

All log tables, financial ledgers, receipts, and management tables across the application must adhere strictly to these rules:
1. **Vertical Hierarchy over Equal Stretches**:
   - Never stretch action forms and log tables side-by-side with equal height containers.
   - Action/Creation forms sit naturally on top in a compact card, followed by the full-width DataTable below.
2. **Standardized Toolbar Heights & Controls**:
   - All top-bar controls (Search input, timeframe selectors, category/payment dropdowns, Export CSV, and Action buttons) must share uniform `h-10` (40px) height, `text-xs font-medium`, `rounded-lg` borders, and cohesive hover/focus states.
   - Timeframe and date filter selects must specify at least `min-w-[200px]` to prevent month/year strings from truncating.
3. **Persistent Column Headers**:
   - Always include `persistTableHead` on all `<DataTable>` instances so column headers remain permanently visible during search, filter, and pagination changes.
4. **Content-Proportioned Column Widths & Sort Icon Clearances**:
   - Column widths must fit their underlying content AND their full uppercase header title with sort icon clearance:
     - **ID / Code Columns**: `minWidth: '130px–140px'` (never < 130px on sortable IDs)
     - **Timestamp / Date Billed / Checkout**: `minWidth: '150px–170px'`
     - **Category / Status / Payment Method**: `minWidth: '140px–160px'`
     - **Monetary Totals & Currency Columns** (e.g. `Stay Tariff`, `Food & Extras`, `Total Earned (₹)`, `Pending Payout (₹)`): `minWidth: '135px–160px'` with `tabular-numbers font-semibold`
     - **Primary Description / Name Columns**: Fluid `grow: 2` with `minWidth: '180px–220px'` to comfortably absorb remaining horizontal space without collapsing
     - **Actions Column**: Sized to fit contained buttons (`minWidth: '120px–240px'`) with `whitespace-nowrap flex items-center gap-2` to prevent button label wrapping.
5. **Standard Typography**:
   - All cell primary values use standard application font (`text-xs font-semibold text-gray-900 dark:text-white`).
   - Do NOT use `font-mono` on ID fields or fake blue links unless the ID actively navigates or opens a dedicated record modal.
   - Secondary subtitle metadata uses `text-2xs text-gray-500 dark:text-gray-400`.
6. **Action Buttons**:
   - Use standard `<Button size="sm">` (`h-8`, `text-xs font-medium`, `whitespace-nowrap shrink-0`) for Edit, Delete, or View actions.
7. **Pagination Dropdown**:
   - Rows-per-page dropdown is styled with opaque backgrounds (`#ffffff` light / `#1f2937` dark) and custom Flowbite arrows so options never render with transparent or glitchy overlays.
8. **Column Header Titles Never Truncate or Wrap Letter-by-Letter**:
   - **Horizontal Scroll Wrapper Requirement**: Every desktop `<DataTable>` must live inside a container with `overflow-x-auto` (e.g. `<div className="hidden md:block overflow-x-auto">`) so that wide multi-column tables scroll horizontally smoothly instead of shrinking column widths below their minimum readable size.
   - **Header Text Whitespace**: Both `src/utils/tableStyles.ts` (`headCells`) and `src/custom.css` (`.rdt_columnText`) enforce `white-space: nowrap !important; overflow: hidden; text-overflow: ellipsis; line-height: 1.3 !important;`. Header labels must NEVER break or wrap character-by-character into single vertical letters.
   - **Sortable Header Clearance**: `react-data-table-component` renders a sort arrow icon (~20px) inside sortable column headers alongside the 24px–28px cell padding. Sizing sortable columns with at least `minWidth: '130px–160px'` (per Rule 4) guarantees full header titles (`Receipt ID`, `Date Billed`, `Stay Tariff`, `Grand Total`, `Total Earned (₹)`) display completely without truncation or ellipses.
9. **Row Selection** (reference: flowbite.com/application-ui/demo/e-commerce/transactions/,
   added 21 Aug 2026) - only on tables where a real bulk action exists (bulk delete, bulk
   export-selected, bulk status change). `selectableRows` + a `selectableRowsComponent` that
   renders `flowbite-react`'s real `Checkbox` (see "Form Controls" above - never
   `react-data-table-component`'s native default). Don't add selection checkboxes to a table
   just to visually match the reference if nothing actually consumes the selection - check what
   bulk action would attach before enabling this on a given table.
10. **Numbered Pagination Footer** (same reference) - "Showing X-Y of Z" plus page-number
    buttons, not just prev/next arrows. Every table in the app currently uses
    `react-data-table-component`'s stock default pagination component (confirmed 21 Aug 2026:
    zero hits for `paginationComponent` anywhere in `src/`). Build one shared numbered-pagination
    component and pass it as `paginationComponent` on every `<DataTable>`, the same "one shared
    object, import it everywhere" pattern as `attachedTabsTheme` - don't re-derive it per page.
11. **Desktop Table / Mobile Card Split** (per [[mobile_first_requirement]] - a real Tailwind
    breakpoint swap, not just responsive classes on the table itself) - every `<DataTable>` needs
    a `hidden md:block` desktop table paired with a `md:hidden` mobile card list at the same
    breakpoint. This is already the convention on ~9 of the app's biggest table screens
    (`KitchenManagement.tsx`, `BillingCheckout.tsx`, `StaffManagement.tsx`,
    `InventoryManagement.tsx`, `PettyCashManagement.tsx`, `AuditLogsView.tsx`,
    `CashDrawerManager.tsx`, `MiscChargesManagement.tsx`, `ICalSyncManager.tsx`) - it just was
    never written down, so nothing enforces it on tables that don't have it yet. **Gap found
    21 Aug 2026**: each of those 9 files hand-rolls its own card markup and its own manual
    pagination slicing independently - there is no shared mobile-card component, so the
    breakpoint strategy is consistent but the actual card look can still drift page to page.
    When touching this rule, prefer extracting one shared component over adding a 10th hand-rolled
    copy.

## Attached Tabs Specification (Default Variant)

Canonical Flowbite Tabs reference: https://github.com/themesberg/flowbite/blob/main/content/components/tabs.md

All primary sub-page and section tab bars across the platform (e.g. `#take_food_order` / `#kitchen_orders` in `KitchenManagement.tsx`, Master Materials vs Categories in `InventoryManagement.tsx`, Appearance/Theme settings, the booking-status tabs in `BillingCheckout.tsx`) start from `variant="default"` on `<Tabs>`, but where a tab bar sits directly above the card/table it controls, it must use the **attached-tabs** treatment rather than Flowbite's bare default styling - reference implementation: `src/utils/tabsTheme.ts`'s `attachedTabsTheme` (20 Aug 2026, superseding the earlier plain bottom-border spec this section used to describe). Import that constant rather than re-deriving the theme object per page.
- **Tabs always sit on the card, never inside it**: the `<Tabs>` and the card/table below it are siblings with zero gap between them (no shared border/bg wrapper around both - that reads as "tabs stuck inside a box", not "tabs attached to the box"). The card gets `rounded-t-none border-t-0 -mt-px`: `rounded-t-none` since the tabs own the rounded top edge of the whole unit, `border-t-0` because the card's own default top border would otherwise draw a second dividing line right under the tabs (found 21 Aug 2026 - `attachedTabsTheme` only controls the *tabs'* borders, not the card's own default 4-sided one), and `-mt-px` to close any hairline gap high-DPI rounding can leave.
- **Adjacent tabs are separated by a 1px gap** (`gap-px` on the tablist, added 11 Sep 2026 after an explicit request) rather than overlapped. Earlier this spec/tabsTheme used `-ml-px`/`first:ml-0` on each tabitem to melt one tab's border into the next, welding the pair into a single seam; the tablist now carries `gap-px` instead and the tabitem's `-ml-px`/`first:ml-0` are gone, so each tab reads as its own distinct bordered chip with a visible hairline of the tablist's border-b showing between them. If you build a tablist `base` override of `attachedTabsTheme.tablist.base` (e.g. `InventoryManagement.tsx`'s `justify-end flex-row-reverse` - it replaces rather than spreads the base), repeat `gap-px` in it or that page silently loses the site-wide gap.
- **Every tab has its own border, active or inactive** - not just the container. This is what lets an inactive tab read as a distinct, closed tab shape next to the open one, unlike Flowbite's stock default variant which puts no border on inactive tabs at all.
- **Active tab**: white background (`dark:bg-gray-800`, matching the card's own background) and **no bottom border** - the tab visually "opens" straight into the card below it with no dividing line. This is the actual mechanism behind "sitting on the card", not just visual proximity.
- **Inactive tabs**: fully transparent background (no fill) so only the border outline shows, plus a bottom border (closing the box) that the active tab deliberately omits.
- **Tab Content Isolation**: each `TabItem` stays childless where the tab bar is attached to a card this way - the actual tab content lives in the card below (driven by the same active-tab state), not as the `Tabs` component's own tabpanel. This still leaves a real, empty `[role="tabpanel"]` div in the DOM (Flowbite always renders one per tab) - the app-wide `[role="tabpanel"] { padding-top: 0.5rem !important }` rule doesn't know it's empty and was inserting a real 8px gap under the tab row on every page using this pattern until `[role="tabpanel"]:empty { padding-top: 0 !important }` was added in `index.css` to exempt it (found 21 Aug 2026).

## Buttons

- **No button ever has a box-shadow**, in any state (default/hover/active/focus) - flat fill + border only. This is a deliberate departure from Flowbite's own `Button` theme.js, which puts `shadow-sm` on its base and additional `shadow-sm`/`shadow-xs` on solid color variants; the shared `src/components/Button.tsx` explicitly cancels all of it with `shadow-none` per color (20 Aug 2026).
- Any hand-rolled `<button>` styled to look like an action button (rather than a plain icon-only control) should be migrated to `src/components/Button.tsx` when touched, both for this shadow rule and for the DataTable Action Buttons rule below - don't hand-copy its color classes onto a raw `<button>`.
- **Strict No Capsule / No Pill Buttons Rule (added 7 Sep 2026, explicit request)**: Action buttons across the platform must **NEVER** use capsule or pill shapes (`rounded-full`, `rounded-3xl`, or custom small heights where border radius approaches 50% of the element height). All interactive action buttons must strictly follow official Flowbite button geometry:
  - Exclusively render buttons via the shared Flowbite `<Button>` component (`src/components/Button.tsx`).
  - Standard corner radius is strictly `rounded-lg` (8px), matching Flowbite's default button specification.
  - Buttons must use standard Flowbite sizing: `size="sm"` (`h-8` / 32px, `px-3 text-xs font-semibold`), `size="md"` (`h-10` / 40px), or `size="lg"` (`h-12` / 48px). At `h-8` (32px), `rounded-lg` (8px) maintains a crisp, rectangular button silhouette with rounded corners, never collapsing into a stadium/capsule shape.
  - Capsule (`rounded-full`) geometry is strictly reserved for circular avatar indicators or round icon chips. All badges, status chips, and count indicators must strictly use Flowbite's default badge style (`rounded` / `rounded-md`, never `rounded-full` pills) per the Badges Specification. Never use capsule geometry for interactive action buttons.

## Form Controls (Checkboxes, Radios, Toggles, Selects)

Ground truth is the theme.js files directly - `node_modules/flowbite-react/dist/components/
{Checkbox,Radio,ToggleSwitch,Select}/theme.js` - not memory or assumption, same method as
everything else in this file. **But reading theme.js text is not sufficient on its own - see the
correction below.**

- **Checkbox**: theme.js says `rounded`, not circular. A checkbox styled as a circle is a bug,
  not a variant (found 21 Aug 2026: `InventoryManagement.tsx`'s `selectableRows` DataTable had no
  `selectableRowsComponent`, so `react-data-table-component` rendered its own native checkbox
  instead of routing through this theme at all - check any `selectableRows` DataTable for the
  same gap).
  - **Correction, same day**: a checkbox using the exact correct component and exact correct
    `rounded` class was *still* found rendering as a full circle (`KitchenManagement.tsx`'s Staff
    Meals screen). Root cause: this project imports Flowbite's own theme package
    (`@import "flowbite/src/themes/default"` in `src/index.css`), and that package's
    `default.css` sets `--radius: 8px` as the token the bare `rounded` utility maps to - genuinely
    Flowbite's own current default, not a project misconfiguration (confirmed by measuring
    flowbite.com's own live checkbox demo, which renders ~4px, not circular - so this is a real
    gap in Flowbite's own theme.js not accounting for its own token at checkbox scale, not
    intended behavior to match). 8px radius on a 16px (`w-4 h-4`) checkbox is exactly 50% - a
    mathematical circle. **Fixed** with a global override in `src/index.css`:
    `input[type='checkbox'] { border-radius: 4px !important; }` - scoped to checkboxes only,
    never touches Radio's legitimate `rounded-full`.
  - **The actual lesson**: matching theme.js's literal class name text is necessary but **not
    sufficient**. This exact component read as compliant from source alone. Verify any shape/size
    claim by actually rendering the page and checking `getComputedStyle(el).borderRadius` (or a
    screenshot) - not by reading class names against theme.js text.
- **Radio**: `rounded-full` - circular is correct here, don't "fix" radios to match checkboxes.
- **ToggleSwitch**: pill-shaped track, its own shape family - for genuine on/off switches, not a
  checkbox substitute.
- **Select**: `rounded-lg` field.

## Flowbite Modals & Drawers Specification (Right Slide-over Drawers)

Canonical Flowbite Drawer reference: https://github.com/themesberg/flowbite/blob/main/content/components/drawer.md

All action modals, creation forms, and secondary management dialogs across the site (e.g. `New Service Request`, `Manage Custom Types`, item configurations, edit sheets):
- **Right Position**: Modals and form dialogs must open as a **Right-Side Drawer** (`<Drawer position="right" open={...} onClose={...}>`).
- **Structure**:
  - Top header with title, iconography, and explicit close button (`X`).
  - Scrollable content body (`flex-1 overflow-y-auto p-4`).
  - Fixed footer with Cancel & Action buttons (`p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2 bg-gray-50 dark:bg-gray-850`).
- **Bottom-Anchored Drawer Footer Safe Area (added 28 Aug 2026, explicit report + screenshot)**: any drawer whose footer is a `shrink-0` flex child sitting OUTSIDE the scrollable content area (i.e. the primary action button is pinned to the physical bottom edge of the drawer, not just the end of scrollable content) must add `env(safe-area-inset-bottom)` to that footer's bottom padding - e.g. `p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]` - not a plain `p-4`. Found live in `SelfOnboardingWizard.tsx`'s "Next Step" footer: on an iPhone with a home-indicator bar, the button sat with zero breathing room above it. This is a *different* case from `App.tsx`'s shared `<main>` (which already handles its own safe-area-bottom + persistent mobile nav bar clearance) and from a footer that's merely the last item inside a scrollable `DrawerItems` region (like `BookingDetailsModal.tsx`'s own footer) - only a truly fixed/pinned footer needs this explicit inset. Check for this same gap before shipping any new `shrink-0` footer bar.
- **Z-Index**: Modals and right drawers operate at `z-58` per application z-index layering scale.
- **In-Drawer Management**: When a drawer presents a list of entities (such as custom service types, material categories, or payment accounts), users must be able to **add new items directly from inside the drawer** via an inline creation form at the top, alongside inline edit and delete actions.
- **Documented exception - read-only reference content may be a CENTRED MODAL (added 7 Sep 2026, explicit request)**: the rule above governs *dialogs you act in* - creation forms, edit sheets, management panels. A dialog that only presents information to read and dismiss may be a centred modal instead. The distinction is whether the user is performing a task (drawer) or consulting reference material (modal). Current instance: `PublicBookingEngine.tsx`'s **Unit Details** modal on the public booking page - room description, amenities, sleeping arrangement, check-in/out times. Note that the *booking form* on that same page stays a right slide-over, so both patterns coexist there deliberately and by role, not by accident. **Do not "fix" the Unit Details modal into a drawer** - it was a drawer first and was changed on the owner's explicit call. A hand-rolled modal still owes the same backdrop-click-to-close wiring as a hand-rolled drawer (see the next bullet), but NOT the safe-area footer inset above: a centred panel capped at `max-h-[90vh]` never reaches the home-indicator bar that rule exists for.
- **Click-Outside-to-Close (added 4 Sep 2026, explicit request)**: every drawer must close when the user clicks the dimmed backdrop area outside the panel, not just its `X`/Cancel controls. `flowbite-react`'s real `<Drawer>` already does this for free - its `backdrop` prop defaults to `true` and renders a click-to-`onClose` overlay div (see `node_modules/flowbite-react/dist/components/Drawer/Drawer.js`), so any call site passing a real `onClose` gets this automatically; never pass `backdrop={false}` on a dismissible drawer. A **hand-rolled** slide-over (a plain `fixed inset-0` overlay div, built outside `flowbite-react` - e.g. `PublicBookingEngine.tsx`'s public-facing "Complete Your Booking" drawer) does not get this for free and must wire it by hand: `onClick={onClose}` on the outer backdrop div, and `onClick={(e) => e.stopPropagation()}` on the inner panel div so clicks inside the drawer don't bubble up and close it.

**Exception - confirmation/alert prompts (no form fields)**: a dialog that's fundamentally a yes/no or OK prompt - not a data-entry form or a list - is a centered `flowbite-react` `<Modal size="md|lg" popup dismissible className="z-9999 ...">`, not a right-side drawer, even though several of these were briefly rebuilt as drawers on 22 Aug 2026 during the drawer sweep. Reverted 23 Aug 2026 (explicit user report + screenshot): a short prompt in a full-height drawer left most of the drawer an empty void, with Cancel/Confirm stranded far below the message - a bad fit, unlike this rule's other drawers, which hold genuine multi-field forms or lists. `z-9999` (not `z-58`) matches custom.css's own z-index scale, which already reserves an "always on top" tier for toasts + the confirm dialog, so it stacks above an already-open drawer/page-modal.
- `ConfirmDialogContext.tsx` - the app-wide `useConfirm()`/`confirm()`/`alertModal()` dialog ("Delete this booking?", "Remove this feed?", etc.) - use this one for any NEW short plain-string confirmation, don't hand-roll another.
- `GlobalModal.tsx` - the app-wide `window.alert`/`window.showConfirm`/`window.showAlert` dialog (legacy call sites, e.g. `InventoryManagement.tsx`'s "Delete category?").
- `TenantDashboard.tsx`'s Delete Property / Not Enough Slots / Upgrade Package dialogs - kept as their own custom Modals (richer content than a plain string - a bulleted consequences list, conditional notes) rather than migrated onto `ConfirmDialogContext`, but still modals, not drawers. That file's Add Property and Edit Property dialogs are genuine multi-field forms and correctly stay Drawers.

**MANDATORY - nested dialogs never stack a second Drawer (25 Aug 2026, explicit user report + rule request)**: this is a *separate* rule from the confirmation/alert exception above and applies regardless of content length or field count - a real multi-field form is included. If a dialog is opened while ANOTHER drawer is already open (i.e. it's a step/sub-action reached from inside that drawer, not a top-level entry point of its own), it must be a centered `<Modal>`, never a second right-side `<Drawer>` stacked on top. Two same-edge slide-over drawers on screen at once reads as "the first one closed and a different one opened," not "a step within the same flow" - and closing the inner one has repeatedly been coded (wrongly) to also close the outer one "since you're back at a blank drawer edge anyway," which is its own separate bug class this rule prevents by construction.
  - Found live 25 Aug 2026: `CheckinVerificationModal.tsx` (opened via `onOpenIdVerification` from inside `BookingDetailsModal.tsx`, which is itself a Drawer) was a second stacked Drawer, and its close handler in `OperationalDashboard.tsx` nulled `selectedBooking` right along with it - "Complete Check-in" dumped the user all the way back to the dashboard instead of back into Booking Details. Fixed by converting it to a Modal and removing that extra null-out.
  - Before adding any new dialog that opens from inside an existing drawer, check: is a drawer already open when this can appear? If yes, this is a Modal by default, not a Drawer - don't wait for it to misbehave first.

## Wizard / Setup Stepper (added 29 Aug 2026, explicit request)

The multi-step "timeline stepper" at the top of a setup/creation wizard (`PropertySetupWizard.tsx`, `PropertyCreationWizard.tsx`, `SelfOnboardingWizard.tsx`, and any future one) is **not** a passive progress display - **the circular icon for each step must be clickable and jump to that step.**

- The circle is a real `<button type="button">`, not a `<span>` - with `aria-label` ("Go to {label} step") and `aria-current="step"` on the active one. Keep `cursor-pointer` and the existing per-state colour classes.
- **Jumping forward** persists the current step first (same as the "Next Step" button) and applies the same first-step gate (e.g. Basics' required address) - but does **not** validate, save, or auto-fill any step skipped over.
- **Skipped-over steps keep the existing position-based status logic** (`idx < stepIndex && !step.isDone` → the amber "passed but incomplete" `AlertCircle` state; `step.isDone` → the emerald "complete" state). Clicking "Notes" straight after "Basics" leaves Contact/Payments/Operations showing amber-incomplete, exactly as clicking "Next" past them would. **Do not add per-step "visited" tracking** - status is purely a function of `stepIndex` + each step's own `isDone`, so navigating back returns the forward steps to their untouched grey.
- **Jumping backward** is a plain `setStepIndex(idx)` with no persist/validation (matches the "Back" button), so a half-typed invalid field on the current step never traps the user on it.
- Disable the circle buttons while `saving` or once the wizard is `finished`.

## Badges Specification (Flowbite Default Badge Standard)

Canonical Flowbite Badges reference: https://github.com/themesberg/flowbite/blob/main/content/components/badge.md

All status badges, count chips, indicator labels, and entity tags across the application must strictly adhere to Flowbite's official **Default Badges** specification:

1. **Strict Default Badge Geometry (`rounded`, NOT `rounded-full`)**:
   - In Flowbite, default badges feature standard rounded corners: `rounded` (or `rounded-md`, ~4px corner radius).
   - Capsule or pill geometry (`rounded-full`) is explicitly a separate, non-default variant in Flowbite ("Pill badges").
   - **Never render badges as `rounded-full` capsules.** All badges across the platform must strictly use the default `rounded` (or `rounded-md`) shape.
2. **Typography & Padding**:
   - **Standard Badge**: `text-xs font-medium px-2.5 py-0.5 rounded` (or `text-2xs font-semibold px-2 py-0.5 rounded`).
   - **Large Badge** (when specifically required for high-visibility banners): `text-sm font-medium px-3 py-1 rounded`.
3. **No Borders (Default Badges Have NO Borders)**:
   - Flowbite's **Default Badges** do **NOT** have borders. (In Flowbite's documentation, "Bordered badges" is a separate non-default example).
   - All standard badges across the application must strictly be Default Badges with no borders:
     - **Default / Blue**: `bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300`
     - **Gray / Neutral / Alternative**: `bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300`
     - **Red / Failure / Danger**: `bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300`
     - **Green / Success**: `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300`
     - **Yellow / Amber / Warning**: `bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300`
     - **Cyan / Info**: `bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-300`
     - **Indigo**: `bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300`
     - **Purple**: `bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300`
     - *(Exception: White OTA platform badges retain a subtle border `border border-gray-200 dark:border-gray-700` solely for contrast against white card surfaces).*
4. **Shared Component Usage**:
   - Exclusively use the shared `<Badge>` component (`src/components/Badge.tsx`) or direct Flowbite markup matching the classes above.
5. **Passive Indicator Exclusivity**:
   - Badges are strictly passive, non-interactive visual indicators.
   - Never use a badge as a clickable button, date-picker trigger, or modal launcher. All interactive actions must strictly be formal Flowbite `<Button>` components (`variant="primary"`, `variant="secondary"`, `variant="outline"`, or `variant="ghost"`).

## Universal Booking Card Consistency Rule (added 8 Sep 2026, explicit request)

All guest booking cards across the platform—including **Today**, **Upcoming**, and **Past** tabs on both mobile viewports and desktop grid layouts—must strictly use the unified `<BookingCard>` component (`src/components/BookingCard.tsx`) to ensure visual, typographic, and architectural consistency:

1. **Card Header**:
   - Left side: Guest full name, booking `#ID`, optional room/cottage name chip (displayed when `showRoomBadge={true}` in multi-room views such as Upcoming and Past tabs), total guest count, and contact utility icons (`BookingContactActions` for WhatsApp and direct call).
   - Right side: Status badge stack (e.g. `Checked In Today`, `Check-in Pending`, `ID Pending`, `C-Form Filed / Pending`, `Cancelled`).
2. **Stay Dates & OTA Platform Badge Container (`billing-checkout__guest-card-dates`)**:
   - Dates container displays stay dates on the left (`<Calendar /> Checkin → Checkout` with calculated nights count directly below).
   - **OTA Badge Right-Aligned**: The official OTA platform badge (`<OtaBadge>`) must strictly be placed on the **right side** of the dates container (`flex items-center justify-between gap-2`). It must never be placed in the guest name header row where it crowds name text and wraps awkwardly on mobile viewports.
3. **Financial Summary Grid**:
   - 4-quadrant layout displaying:
     - `Room Charges` (or `Not set` italic when 0; omitted on OTA bookings when room charges equal total paid to avoid duplicate display).
     - `Food & Incidentals` (rendered when > 0).
     - Paid amount: strictly labeled `Advance Paid:` for offline/direct bookings, and `Total Paid:` for OTA bookings.
     - `Amount Due` (highlighted in red) or `Refund Due` (highlighted in amber) only when an outstanding balance or refund exists.
4. **Action Buttons**:
   - Primary view action: `<Button variant="secondary" size="sm">` ("View Booking" / "View") to open `BookingDetailsModal`.
   - Checkout action: `<Button variant="warning" size="sm">` ("Checkout") rendered whenever checkout is eligible.
   - All buttons must strictly use Flowbite `<Button>` components (`rounded-lg`).
5. **Guest Notes Alert**:
   - When sanitized OTA guest notes exist, render as a compact alert container (`cleanGuestNotes`) at the bottom of the card.
6. **Search & Filter Empty States**:
   - When any search or filter query is active (`searchTerm.trim().length > 0`), the empty state across all tabs must strictly display: `"No bookings found matching your criteria."` (`t('no_bookings_matching_criteria')`).
   - Default empty states (e.g. `"No bookings today."`, `"No upcoming bookings."`, `"No past bookings."`) are strictly reserved for when no search or filter query is entered.

## No Border-Radius on Edge-to-Edge / Full-Bleed Mobile Blocks Rule (added 11 Sep 2026, explicit request)

On mobile screen viewports (`< sm` / `< 640px`), the outer main page container (`.app-shell__main`) enforces full-bleed edge-to-edge layout with zero horizontal padding (`px-0`).

Consequently, any block, card, dashed empty-state container, table wrapper, or filter row that spans the full viewport width (`w-full`) touching the left and right screen edges must strictly follow these rules:

1. **Remove Border-Radius on Mobile (`rounded-none sm:rounded-lg`)**:
   - Never use `rounded-lg`, `rounded-xl`, or any curved corners on blocks that bleed to the edges of mobile viewports.
   - When curved corners are applied to an edge-to-edge element, the rounded corners visibly curve away from the straight physical edges and bezels of the phone, leaving awkward empty notches, gaps, and broken visual alignments.
   - All full-bleed containers and empty-state boxes must strictly use `rounded-none sm:rounded-lg` (or `rounded-none sm:rounded-xl`).

2. **Remove Left/Right Side Borders on Mobile (`border-x-0 sm:border-x` or `border-y sm:border`)**:
   - Any bordered or dashed full-bleed container must drop its left and right vertical borders on mobile viewports (`border-x-0 sm:border-x` or `border-y sm:border`).
   - Having vertical border lines pressed directly against the physical phone bezel looks unpolished; borders on full-bleed mobile elements must strictly serve as top and bottom horizontal dividers (`border-y`).

3. **Empty States (`<EmptyState>`) Mobile Standard**:
   - `<EmptyState>` components default to `rounded-none sm:rounded-lg`. When placed in full-bleed views (e.g. Live Tickets, queue tabs, log views), ensure `border-x-0 sm:border-x` is applied to maintain clean edge-to-edge continuity.



