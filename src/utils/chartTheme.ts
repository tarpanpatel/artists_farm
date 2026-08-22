/**
 * Shared ApexCharts theming for every analytics/chart screen in the app.
 *
 * Mirrors Flowbite's own Charts plugin conventions
 * (https://flowbite.com/docs/plugins/charts/): ApexCharts as the library,
 * Inter font, hidden toolbar, dashed grid, data labels off by default -
 * and, per that same doc, chart colors read from the app's live CSS custom
 * properties (getComputedStyle(...).getPropertyValue(...)) instead of
 * hardcoded hex, so a chart's palette follows whatever the Appearance page
 * (Root Admin > Theme Management, src/services/themeService.ts) has
 * actually been set to - the same --color-primary/--color-success/etc.
 * variables src/custom.css already reads for buttons.
 *
 * Not wired to react live to a dark/light toggle: this app has no
 * mechanism anywhere that ever sets a `dark` class (confirmed dead per the
 * comment above --btn-primary-bg in custom.css), so there is currently
 * nothing for a chart to react to - matches the same judgment call already
 * made for Button.tsx's CSS tokens.
 */

const getCssVar = (name: string, fallback: string): string => {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
};

export interface ChartColors {
  brand: string;
  brandSecondary: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

// Reads the platform's live theme colors (Root Admin > Theme Management),
// falling back to this app's existing defaults when unset/unavailable
// (SSR-less build, or the fetch in App.tsx hasn't resolved yet).
export const getChartColors = (): ChartColors => ({
  brand: getCssVar('--color-primary', '#2563eb'),
  brandSecondary: getCssVar('--color-info', '#0ea5e9'),
  success: getCssVar('--color-success', '#10b981'),
  warning: getCssVar('--color-warning', '#f59e0b'),
  danger: getCssVar('--color-error', '#ef4444'),
  info: getCssVar('--color-info', '#0ea5e9'),
});

// Fixed qualitative palette for charts with an arbitrary/unbounded number of
// categories (payment methods, booking sources, expense categories, ...) -
// unlike the brand colors above, a multi-hue category palette isn't a
// themeable "brand" concept, so this stays a flat constant rather than
// reading CSS vars.
export const CHART_QUALITATIVE_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#6b7280'];

// Shared base `chart` block - spread into every chart's own `chart: {...}`
// options after its `type`/`height`, e.g. `chart: { type: 'bar', height: 320, ...chartBase.chart }`.
export const chartBase = {
  chart: { fontFamily: 'Inter, sans-serif', toolbar: { show: false } },
  grid: { strokeDashArray: 4 },
};
