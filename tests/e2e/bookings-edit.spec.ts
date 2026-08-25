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

  // MobileBookingCardStack.tsx's per-guest action button is labeled just
  // "Edit" (or "View" when canEdit is false), never "Edit Booking" - found
  // 25 Aug 2026, another stale assertion.
  const editBookingButton = page.getByRole('button', { name: 'Edit', exact: true }).first();
  await expect(editBookingButton).toBeVisible({ timeout: 15000 });
  await editBookingButton.click();

  await expect(page.locator('.booking-details-modal__title')).toBeVisible();

  // '.booking-details-modal__close-btn' was never a real class - the close
  // button has no class of its own, only aria-label="Close drawer" (found 25
  // Aug 2026). That label also isn't unique (several other drawers share it),
  // so scope to the drawer that actually contains this title, same fix as
  // checkout.spec.ts/staff.spec.ts needed.
  const drawer = page.locator('[data-testid="flowbite-drawer"]').filter({
    has: page.locator('.booking-details-modal__title'),
  });
  await drawer.getByRole('button', { name: 'Close drawer' }).click();
  // Unlike StaffManagement's Team Member drawer (which stays mounted with
  // local isOpen state, needing a class-based check instead), this modal's
  // <Drawer open={Boolean(guest)}> is driven by the parent's guest state -
  // onClose() clears it there, so BookingDetailsModal's parent stops
  // rendering it entirely and the title really does leave the DOM.
  await expect(page.locator('.booking-details-modal__title')).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors during booking details flow').toEqual([]);
});
