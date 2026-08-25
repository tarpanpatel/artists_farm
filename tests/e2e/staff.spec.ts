import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

test('opens and closes the Create Team Member modal from Staff & Permissions', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#staff_permissions`);
  // StaffManagement.tsx's PageHeader title was renamed to "Team & Access"
  // (t('team_access_heading')) at some point after this assertion was
  // written - found 25 Aug 2026, the old heading text no longer exists.
  await expect(page.getByText('Team & Access')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Create Team Member' }).click();

  // The drawer's own heading text is "Add user" (userFormTab === 'create'),
  // not "Create Team Member" - that's only the button that opens it (found
  // 25 Aug 2026, another stale assertion from a since-renamed heading).
  await expect(page.getByRole('heading', { name: 'Add user' })).toBeVisible();

  // Close without saving - must not create a real staff account against the
  // shared public demo property's live data. "Close drawer" isn't a unique
  // aria-label - every <Drawer> in the app stays mounted even while closed
  // (see DESIGN.md), and several others share this exact label, so an
  // unscoped locator hits a strict-mode "resolved to 2 elements" error
  // (found 25 Aug 2026, same class of issue as checkout.spec.ts). Scope to
  // the drawer that actually contains this "Add user" heading.
  const drawer = page.locator('[data-testid="flowbite-drawer"]').filter({
    has: page.getByRole('heading', { name: 'Add user' }),
  });
  await drawer.getByRole('button', { name: 'Close drawer' }).click();
  // Not toHaveCount(0) - flowbite-react's <Drawer> never unmounts on close,
  // it only swaps the position class between "transform-none" (open) and an
  // off-screen translate class (see node_modules/flowbite-react/dist/
  // components/Drawer/theme.js) - the heading stays in the DOM, just moved
  // off-screen, so a "gone" assertion here would never pass (found 25 Aug
  // 2026). Assert the real close signal instead: the right-position drawer's
  // own "translate-x-full" (closed) class.
  await expect(drawer).toHaveClass(/translate-x-full/);

  expect(getErrors(), 'Unexpected JS console errors during staff modal flow').toEqual([]);
});
