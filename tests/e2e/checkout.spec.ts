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

  // ReceiptEditModal opened in 'edit-and-checkout' mode. Heading text is
  // t('checkout_settlement_heading', 'Checkout and Billing') as of 25 Aug
  // 2026 - this assertion still had the modal's older heading text, another
  // stale-selector drift found the same day as the lucide-x fix below.
  await expect(page.locator('.receipt-edit-modal__title')).toContainText(
    'Checkout and Billing'
  );

  // Scoped to the drawer containing this modal's own title, not just "any
  // Close button" - every <Drawer> in the app stays mounted in the DOM even
  // while closed (see DESIGN.md), so an unscoped selector could match a
  // different, already-present drawer's close button instead of this one.
  // '.receipt-edit-modal__root svg.lucide-x' (the old selector here) matched
  // neither a real class nor a real element any more: this modal's actual
  // outer wrapper never carried a "receipt-edit-modal__root" class, and the
  // icon library was migrated off lucide-react to Flowbite icons (22 Aug
  // 2026), which never renders a "lucide"/"lucide-x" class at all - so this
  // click had silently stopped finding anything, timing out the test.
  const drawer = page.locator('[data-testid="flowbite-drawer"]').filter({
    has: page.locator('.receipt-edit-modal__title'),
  });

  // Close without saving - must never actually check the guest out, since
  // this runs against the shared public demo property's live data.
  // exact: true matters here - the drawer's footer also has a "Checkout &
  // Close Booking" button, which Playwright's default substring name match
  // would otherwise treat as also matching "Close".
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.receipt-edit-modal__title')).toHaveCount(0);

  expect(getErrors(), 'Unexpected JS console errors during checkout modal flow').toEqual([]);
});
