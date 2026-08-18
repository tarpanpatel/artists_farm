import { test, expect, devices } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

// The "Upcoming" tab swaps to a DataTable at the md breakpoint
// (BillingCheckout.tsx renders MobileBookingCardStack below it, the
// DataTable above) - force desktop viewport here regardless of which
// project runs this file, mirroring how bookings-edit.spec.ts forces
// mobile for the card-stack view. Between the two, both branches of that
// breakpoint swap get real coverage.
test.use({ ...devices['Desktop Chrome'] });

test('desktop Upcoming tab renders the bookings table', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#all_bookings`);
  await expect(page.getByText('Luxe Stays').first()).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: /^Upcoming/ }).click();

  await expect(page.getByText('Guest Details')).toBeVisible({ timeout: 15000 });
  // The mobile card stack is still in the DOM (md:hidden) but must not be
  // the visible one at this viewport.
  await expect(page.locator('.mobile-booking-card-stack')).toBeHidden();

  expect(getErrors().map((e) => e.message), 'Unexpected JS console errors on desktop bookings table').toEqual([]);
});
