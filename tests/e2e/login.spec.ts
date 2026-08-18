import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

test('public demo property auto-logs in with no manual login form', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(DEMO_PROPERTY_PATH);

  // AuthContext's demo auto-login replaces the login form with the app
  // shell - the property name in the header/sidebar is the signal it worked.
  await expect(page.getByText('Luxe Stays').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Access Denied')).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors on initial load').toEqual([]);
});
