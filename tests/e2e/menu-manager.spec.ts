import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

// Regression guard for a real crash found earlier this session: <Search>
// was used in the search bar's JSX without being imported from
// lucide-react, throwing "Search is not defined" and taking down the whole
// Edit Food Menu page via the error boundary.
test('Edit Food Menu page renders without crashing', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#edit_food_menu`);

  await expect(page.getByText('Add Food Menu Item')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/is not defined/)).toHaveCount(0);

  expect(getErrors().map((e) => e.message), 'Unexpected JS console errors on Edit Food Menu').toEqual([]);
});
