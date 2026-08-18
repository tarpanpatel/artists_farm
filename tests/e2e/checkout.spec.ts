import { test, expect } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

// Uses the "Today" tab's room-grid (BillingCheckout.tsx renderRoomGroupsGrid),
// which is the same markup on desktop and mobile - no viewport override
// needed here, unlike bookings-edit.spec.ts.
test('opens the checkout settlement modal without mutating the booking', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#all_bookings`);
  await expect(page.getByText('Luxe Stays').first()).toBeVisible({ timeout: 15000 });

  // "Today" is the tab's default state - no click needed to get here.
  const checkoutButton = page.getByRole('button', { name: 'Checkout' }).first();
  await expect(checkoutButton).toBeVisible({ timeout: 15000 });
  await checkoutButton.click();

  // ReceiptEditModal opened in 'edit-and-checkout' mode.
  await expect(page.locator('.receipt-edit-modal__title')).toContainText(
    'Guest Billing & Final Checkout Settlement'
  );

  // Close without saving - must never actually check the guest out, since
  // this runs against the shared public demo property's live data.
  await page.locator('.receipt-edit-modal__root svg.lucide-x').first().click();
  await expect(page.locator('.receipt-edit-modal__root')).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors during checkout modal flow').toEqual([]);
});
