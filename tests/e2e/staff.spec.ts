import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

test('opens and closes the Create Team Member modal from Staff & Permissions', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#staff_permissions`);
  await expect(page.getByText('Active System Users & Staff')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Create Team Member' }).click();

  await expect(page.getByRole('heading', { name: 'Create Team Member' })).toBeVisible();

  // Close without saving - must not create a real staff account against the
  // shared public demo property's live data.
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('heading', { name: 'Create Team Member' })).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors during staff modal flow').toEqual([]);
});
