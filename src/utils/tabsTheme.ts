/**
 * Shared Flowbite `<Tabs variant="default">` theme override for the
 * "attached tabs" pattern - the tab strip sits directly on top of (touching,
 * no gap) the card/table it controls, reading as one unit. See DESIGN.md's
 * "Attached Tabs Specification" (20 Aug 2026) - this file is the reference
 * implementation that spec points to, so every page adopting the rule
 * should import this constant rather than re-deriving its own copy.
 *
 * Flowbite's own default-variant styling doesn't produce this look by
 * itself (bg-gray-100 active fill, no border at all on inactive tabs, one
 * border-b spanning the whole tablist container) - every property below is
 * a deliberate override of that default:
 *  - Every tab (active or inactive) always carries its own border on all
 *    sides - inactive tabs need this to read as a distinct, closed tab
 *    shape sitting beside the open one, not just plain text.
 *  - The active tab has NO bottom border and a white (dark: gray-800)
 *    background matching the card content below it, so it visually "opens"
 *    straight into that card with no dividing line - this is the actual
 *    mechanism behind "tabs sit on the card", not just proximity.
 *  - Inactive tabs stay fully transparent (no fill) so only the border
 *    outline shows against whatever's behind them.
 *  - -mb-px overlaps the seam where the tabs meet the card below into a
 *    single 1px line instead of doubling up border thickness (added 11 Sep
 *    2026 - the adjacent-tab half of this was removed: the tablist now
 *    carries `gap-px`, a deliberate 1px separation between tabs, so the
 *    `-ml-px`/`first:ml-0` pair that used to overlap one tab's border onto
 *    the next is gone - user requested a visible 1px gap between tabs,
 *    site-wide).
 *  - A `flex-nowrap overflow-x-auto` override was tried here (11 Sep 2026)
 *    to stop a 3rd tab wrapping to its own disconnected-looking centered
 *    row on a narrow phone, then explicitly reverted the same day at the
 *    user's request ("Remove tabs horizontal scrolling") - so this now
 *    stays on Flowbite's own default `flex-wrap`, unmodified. A 3-tab page
 *    (FinancesHub.tsx) can still wrap its 3rd tab to its own row on a very
 *    narrow phone as a result - known, accepted trade-off, not a bug to
 *    silently "fix" again the same way if reported.
 *
 * Usage: place `<Tabs variant="default" theme={attachedTabsTheme}
 * clearTheme={attachedTabsClearTheme} .../>` directly above the card/table
 * it drives, with zero margin/gap between
 * them (they must NOT share one outer bordered wrapper - that reads as
 * "tabs stuck inside a box" rather than "tabs attached to the box"), and
 * give that card `rounded-t-none border-t-0 -mt-px`: `rounded-t-none`
 * because the tabs already own the rounded top edge of the whole unit,
 * `border-t-0` because the card's own default top border would otherwise
 * double up as a second dividing line right under the tabs (found 21 Aug
 * 2026), and `-mt-px` to guarantee zero visible gap even on high-DPI
 * screens where sub-pixel rounding can leave a hairline gap.
 *
 * Also requires each TabItem to be childless (content lives in the card,
 * not as this component's own tabpanel) - see index.css's
 * `[role="tabpanel"]:empty` rule, which exists specifically to stop the
 * app-wide tabpanel padding-top rule from adding an invisible-but-real gap
 * under these intentionally-empty tabpanels (found 21 Aug 2026).
 *
 * `attachedTabsClearTheme` (pass as the `clearTheme` prop alongside
 * `theme`) wipes Flowbite's own active/inactive tab-fill classes
 * (`bg-gray-100`/`text-primary-600`/etc.) before this theme merges on top,
 * instead of relying on `twMerge` to notice `bg-gray-100` and `bg-white`
 * are the same conflict group and correctly drop the former. Without it,
 * the active tab's background/border rendered so faintly against a
 * near-white page that it read as missing entirely (found 21 Aug 2026) -
 * clearing removes any dependency on merge-order behavior for exactly
 * this one property, guaranteeing the tab reads as a real white,
 * three-bordered chip rather than a merge outcome that's merely supposed
 * to look that way.
 */
export const attachedTabsClearTheme = {
  tablist: { tabitem: { variant: { default: { active: true } } } },
  // Flowbite's default tabpanel is 'py-3' (12px top AND bottom padding).
  // attachedTabsTheme's `tabpanel: ''` looked like it should cancel that,
  // but an empty string added during a twMerge-based merge doesn't remove
  // a class the base theme already contributed - it's simply a no-op, so
  // 'py-3' silently survived untouched. Every attached-tabs page still had
  // a real ~12-24px gap under the tab row from this (found 21 Aug 2026,
  // confirmed live: an "empty" tabpanel div was still rendering at 12px
  // tall) even after the [role="tabpanel"]:empty CSS fix, which only ever
  // addressed padding-top - padding-bottom was never touched by that fix
  // at all. Clearing here removes 'py-3' at the source instead of chasing
  // each half of it individually.
  tabpanel: true,
};

export const attachedTabsTheme = {
  base: 'flex flex-col gap-0',
  tabpanel: '',
  tablist: {
    // Flowbite's own tablist.base is just 'flex text-center' - centering the
    // *text inside* each tab, not the row of tabs as a group - so with few
    // short tabs the whole strip packed flush left, leaving a lopsided gap
    // of bare border on the right. justify-center centers the tab group
    // itself within the tablist's full width (found 21 Aug 2026). gap-px
    // (added 11 Sep 2026) separates adjacent tabs by 1px, and the
    // tabitem.base below dropped its -ml-px/first:ml-0 border-overlap pair
    // so that gap is visible rather than collapsed back into a seam.
    base: 'justify-center gap-px',
    // Deliberately NOT overriding this to border-b-0 (tried first, found
    // wrong 21 Aug 2026): with only 2-3 short tabs, the tablist is usually
    // much wider than the tabs themselves, and without the tablist's own
    // border-b there was nothing but bare background filling that leftover
    // width - the border line visibly stopped dead right after the last
    // tab instead of continuing under the empty space next to it. Flowbite's
    // default tablist.variant.default already carries border-b border-
    // gray-200, and it works fine even under the active tab: that tab's own
    // bg-white + z-10 (see tabitem.active.on below) plus its -mb-px overlap
    // sits exactly on top of the tablist's border line and visually erases
    // that one segment of it, while every other segment (inactive tabs'
    // own border-bottom, and the empty trailing space) shows the tablist's
    // border normally.
    tabitem: {
      base: 'relative -mb-px border border-b-0 border-gray-200 dark:border-gray-700',
      variant: {
        default: {
          base: '',
          active: {
            on: 'z-10 bg-white text-blue-600 dark:bg-gray-800 dark:text-blue-400 font-semibold',
            off: 'bg-transparent border-b border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-300',
          },
        },
      },
    },
  },
};

/**
 * Minimal centering override for plain `<Tabs variant="default">` usages
 * that are NOT part of the attached-tabs pattern above (no shared card
 * below, TabItems keep their own children/tabpanel as normal) - e.g.
 * `AnalyticsDashboard.tsx`, `AppearanceSettings.tsx`. Same fix as
 * `attachedTabsTheme.tablist.base` above and for the same reason: Flowbite's
 * default tablist packs the tab group flush left (found 21 Aug 2026).
 */
export const centeredTabsTheme = {
  tablist: { base: 'justify-center' },
};
