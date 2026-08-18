import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

// Regression guard for a real bug found earlier this session: the
// Master Materials Catalog / "Edit Kitchen Stock" tab was the only tab in
// InventoryManagement.tsx missing a <PageHeader>, so it opened straight
// into the tab-switcher buttons with no title above them.
test('Edit Kitchen Stock has a page title above the catalog tabs', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#edit_kitchen_stock`);

  await expect(page.getByRole('heading', { name: 'Edit Kitchen Stock' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Master Materials Catalog')).toBeVisible();

  expect(getErrors().map((e) => e.message), 'Unexpected JS console errors on Edit Kitchen Stock').toEqual([]);
});
