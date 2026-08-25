import { test, expect, devices } from '@playwright/test';
import { DEMO_PROPERTY_PATH, trackConsoleErrors } from './helpers';

// The "Upcoming" tab renders MobileBookingCardStack only below the md
// breakpoint (BillingCheckout.tsx swaps to a DataTable on desktop) - force
// a phone viewport here regardless of which project runs this file, so the
// test targets the same markup either way.
test.use({ ...devices['Pixel 7'] });

test('opens and closes the booking details modal from an upcoming booking card', async ({ page }) => {
  const { getErrors } = trackConsoleErrors(page);

  await page.goto(`${DEMO_PROPERTY_PATH}#all_bookings`);
  await expect(page.getByText('Luxe Stays').first()).toBeVisible({ timeout: 15000 });

  // flowbite-react's <TabItem> renders role="tab" (ARIA tablist pattern),
  // not role="button" - the explicit role="tab" overrides the <button>
  // element's implicit button role, so a 'button' locator here always
  // resolved to zero elements and just timed out (found 25 Aug 2026).
  await page.getByRole('tab', { name: /^Upcoming/ }).click();

  const editBookingButton = page.getByRole('button', { name: 'Edit Booking' }).first();
  await expect(editBookingButton).toBeVisible({ timeout: 15000 });
  await editBookingButton.click();

  await expect(page.locator('.booking-details-modal__title')).toBeVisible();

  await page.locator('.booking-details-modal__close-btn').click();
  await expect(page.locator('.booking-details-modal__content')).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors during booking details flow').toEqual([]);
});
