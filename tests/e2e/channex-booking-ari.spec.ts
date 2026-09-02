import { test, expect, devices, Page } from '@playwright/test';

// Force mobile viewport for the Upcoming-tab Edit flow, same reasoning as
// bookings-edit.spec.ts: BillingCheckout.tsx swaps to a desktop DataTable
// above the md breakpoint, and MobileBookingCardStack's own "Edit" button
// (the already-proven locator this test reuses) only renders below it.
test.use({ ...devices['Pixel 7'] });

// Verifies the booking-driven half of the Channel Manager outbox (as
// opposed to channex-scenarios-2-6-ui.spec.ts, which drives the Rate Rules
// UI): creating a booking enqueues exactly one 'availability' push for its
// own dates (guests.php add_guest), and editing a booking's dates enqueues
// TWO - one for the vacated old range, one for the new range (guests.php
// update_guest) - see CHANNEX_IMPLEMENTATION.md section 6's hook table.
//
// Uses a real future date range (mid-December 2026) confirmed clear of every
// existing booking on this property - checked directly against the LOCAL DB
// (artists_farm_resort, property_id 1) before writing this: the only
// non-cancelled future bookings there are Apr 2027 and Sept 2028, so
// December 2026 is untouched. A real date range rather than a synthetic 2030
// one because this is a real guest booking that must round-trip through
// add_guest/update_guest's own business logic (conflict checks, duplicate
// checks), not just a rate rule. Runs against localhost:3000 (this suite's
// default baseURL) - same environment channex-scenario1-ui.spec.ts and
// channex-scenarios-2-6-ui.spec.ts already use, since that's where the real
// Channex sandbox credentials (php/config/channex_config.json) live. The
// test guest is deleted at the end so it doesn't linger in real property
// data.

const TEST_GUEST_NAME = 'Channex ARI Test Guest';
const TEST_GUEST_PHONE = '9000000001';

async function dismissWizardIfPresent(page: Page) {
  const wizardDrawer = page.locator('[data-testid="flowbite-drawer"].property-setup-wizard');
  const dismissOnce = async () => {
    if (await wizardDrawer.isVisible().catch(() => false)) {
      await wizardDrawer.locator('button[class*="text-gray-400"][class*="hover:bg-gray-100"]').first().click();
      await wizardDrawer.waitFor({ state: 'hidden', timeout: 5000 });
      return true;
    }
    return false;
  };
  await dismissOnce();
  // The wizard drawer can mount a beat after networkidle - check again
  // after a short wait rather than only at the instant this is first
  // called (found repeatedly writing this spec).
  await page.waitForTimeout(1000);
  await dismissOnce();
}

async function login(page: Page) {
  // BUG (2 Sep 2026, found running this spec): the existing
  // channex-scenario*.spec.ts files' login step ("Login to Terminal") has
  // apparently never actually been proven end-to-end - the real button here
  // reads "Sign In" (LoginPage.tsx's variant='management' default, not
  // 'terminal' - confirmed by reading the component), and their credentials
  // (9999999001/424242) didn't correspond to any real property_id=1 staff
  // user (every real Jaipur user is username-only, phone_number NULL - a
  // username can't be typed here either, this field strips non-digit
  // characters as you type regardless of variant). Their own comment
  // documents the actual original intent though - a dedicated throwaway
  // phone-number test account, id 'usr-ai-test-1' - which just didn't exist
  // locally; created it (see this file's own setup) rather than inventing a
  // different login path.
  await page.goto('/jaipur/');
  await page.waitForLoadState('networkidle');
  // A second test in this file can land here already authenticated (this
  // account's own session persisting some other way than a fresh Playwright
  // context normally would) and get the Property Setup Wizard instead of the
  // login form - dismiss it and skip straight past login if so, rather than
  // timing out waiting for a login field that was never going to appear.
  await dismissWizardIfPresent(page);
  const mobileField = page.locator('#mobileNumber');
  if (await mobileField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await mobileField.pressSequentially('9999999001', { delay: 50 });
    await page.locator('#passcode').pressSequentially('424242', { delay: 50 });
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Access Denied')).toHaveCount(0);
    await page.waitForLoadState('networkidle');
  }
  await dismissWizardIfPresent(page);
}

// Clicks a specific in-month day cell (never a prev/next-month padding cell,
// which carries the same visible number) in whichever datepicker popover is
// currently open - this app runs each side's sub-picker as "one continuous
// popover" (see DateRangePicker.tsx's own comments), so exactly one
// `.datepicker-picker` is ever visible at a time.
async function clickDay(page: Page, day: number) {
  const picker = page.locator('.datepicker-picker:visible').first();
  await picker
    .locator('.datepicker-cell.day:not(.prev):not(.next)', { hasText: new RegExp(`^${day}$`) })
    .click();
}

// BUG (2 Sep 2026, found writing this test): Next-month clicks are
// unreliable in a way a simple "did the title change" retry didn't fully
// catch either - individual clicks can be silently lost (confirmed: title
// unchanged after a click that Playwright reports as normal) AND, separately,
// this app can have several .datepicker-picker instances in the DOM at once
// (documented elsewhere in this codebase as a structural quirk of how many
// DateRangePicker instances end up mounted) - re-querying `page.locator(...)`
// fresh on every single click, rather than reusing one captured locator
// across the whole loop, protects against acting on a stale/wrong instance
// if which one is "the visible one" ever shifts mid-sequence. Converges on
// the actual expected month text rather than trusting any single
// before/after comparison.
async function goToMonth(page: Page, targetLabel: string, maxClicks = 15) {
  for (let i = 0; i < maxClicks; i++) {
    const current = await page.locator('.datepicker-picker:visible').first().locator('.view-switch').innerText();
    if (current === targetLabel) return;
    await page.locator('.datepicker-picker:visible').first().locator('.next-btn').click();
    await page.waitForTimeout(250);
  }
  throw new Error(`goToMonth: never reached "${targetLabel}" after ${maxClicks} Next clicks`);
}

async function clickSaveOnPicker(page: Page) {
  const picker = page.locator('.datepicker-picker:visible').first();
  await picker.locator('.datepicker-save-btn').click();
}

async function checkOutboxRows(page: Page, dateFrom: string, dateTo: string, kind: 'availability' | 'rates', label: string) {
  await page.goto('/jaipur/#channel_manager');
  await page.waitForLoadState('networkidle');
  await dismissWizardIfPresent(page);
  await page.waitForTimeout(4000); // async post-response drain (fastcgi_finish_request)

  const rows = page.locator('tr', { hasText: `${dateFrom} → ${dateTo}` }).filter({ hasText: kind });
  const count = await rows.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    texts.push((await rows.nth(i).innerText()).replace(/\n/g, ' | '));
  }
  console.log(`[${label}] outbox rows for ${dateFrom} -> ${dateTo} (${kind}): count=${count}`, texts);
  return { count, texts };
}

test.describe.serial('Booking UI -> Channex outbox (availability push)', () => {
  test('Create a 1-night booking -> exactly one availability push for those dates', async ({ page }) => {
    await login(page);
    await page.goto('/jaipur/#bookings');
    await page.waitForLoadState('networkidle');
    await dismissWizardIfPresent(page);

    // Two "Add Booking" buttons exist (a Quick Actions tile + the page-header
    // button) - scope to the one actually inside the main content area.
    await page.getByRole('main').getByRole('button', { name: 'Add Booking' }).click();

    // Other flowbite-react Drawers exist elsewhere in the app (a second Add
    // Booking drawer implementation, a notifications/alerts drawer, ...),
    // all mounted but closed - Flowbite keeps closed drawer content in the
    // DOM, animated off-screen via a translate-x-full class rather than
    // unmounting or display:none, so role="dialog"/:visible/"nested inside
    // main" all still match more than one of them (confirmed live, each one
    // found writing this test). The one actually open carries transform-none
    // instead - target that directly rather than any positional heuristic.
    const addDrawer = page.locator('[data-testid="flowbite-drawer"].transform-none');
    await expect(addDrawer).toBeVisible({ timeout: 10000 });

    await addDrawer.getByLabel(/Guest Name/).fill(TEST_GUEST_NAME);
    await addDrawer.getByLabel(/Contact Phone Number/).fill(TEST_GUEST_PHONE);

    // Open the Booking Dates picker (the readOnly "from" field) and pick a
    // clear 1-night range in mid-December 2026.
    await addDrawer.locator('input[name="start"]').click();
    await expect(page.locator('.datepicker-picker:visible')).toBeVisible({ timeout: 5000 });
    await goToMonth(page, 'December 2026');
    await clickDay(page, 15);
    await clickDay(page, 16);
    await clickSaveOnPicker(page);

    await addDrawer.getByRole('button', { name: 'Save Guest Booking' }).click();
    await expect(page.getByText(/Guest name is required|Phone number is required|dates are required/)).toHaveCount(0);
    await page.waitForLoadState('networkidle');

    const result = await checkOutboxRows(page, '2026-12-15', '2026-12-16', 'availability', 'Create');
    expect(result.count, 'exactly one availability row for the new booking\'s own 1-night range').toBe(1);

    // Nothing else should have been pushed for an unrelated range - spot
    // check the immediately-adjacent nights got no row at all.
    const spillover = await checkOutboxRows(page, '2026-12-16', '2026-12-17', 'availability', 'Create spillover check');
    expect(spillover.count, 'no availability row for a date range the booking never touched').toBe(0);
  });

  test('Move the booking 1 week later -> availability pushes for BOTH old and new dates', async ({ page }) => {
    await login(page);
    await page.goto('/jaipur/#bookings');
    await page.waitForLoadState('networkidle');
    await dismissWizardIfPresent(page);

    await page.getByRole('tab', { name: /^Upcoming/ }).click();
    // Real bookings on this property (Auditor John Doe, Envelope, ...) each
    // have their own "Edit" button on the Upcoming list - a bare
    // getByRole('button', {name:'Edit'}) matches all of them at once.
    // Opening this guest's own card first scopes everything after to its
    // own BookingDetailsModal drawer instead.
    await page.getByText(TEST_GUEST_NAME).first().click();
    await expect(page.locator('.booking-details-modal__title')).toBeVisible();

    const drawer = page.locator('[data-testid="flowbite-drawer"]').filter({
      has: page.locator('.booking-details-modal__title'),
    });
    await drawer.getByRole('button', { name: 'Edit', exact: true }).click();

    // The Booking Dates picker here already shows the existing 15->16
    // range - re-picking checkin re-picks the WHOLE range (see
    // DateRangePicker.tsx's re-picking-checkin handling), so clicking 22
    // then 23 in the same December view moves the whole stay a week later.
    await drawer.locator('input[name="start"]').click();
    await expect(page.locator('.datepicker-picker:visible')).toBeVisible({ timeout: 5000 });
    await clickDay(page, 22);
    await clickDay(page, 23);
    await clickSaveOnPicker(page);

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.waitForLoadState('networkidle');

    const oldRange = await checkOutboxRows(page, '2026-12-15', '2026-12-16', 'availability', 'Edit - old dates');
    expect(oldRange.count, 'a NEW availability row (in addition to the create-time one) for the vacated old dates').toBeGreaterThanOrEqual(2);

    const newRange = await checkOutboxRows(page, '2026-12-22', '2026-12-23', 'availability', 'Edit - new dates');
    expect(newRange.count, 'an availability row for the new dates the booking moved to').toBeGreaterThanOrEqual(1);
  });

  test.afterAll(async ({ browser }) => {
    // Cleanup: delete the test guest so it doesn't linger in real property
    // data. Runs even if an earlier test in this file failed partway.
    const page = await browser.newPage();
    try {
      await login(page);
      await page.goto('/jaipur/#bookings');
      await page.waitForLoadState('networkidle');
      await dismissWizardIfPresent(page);
      await page.getByRole('tab', { name: /^Upcoming/ }).click();
      const card = page.getByText(TEST_GUEST_NAME).first();
      if (await card.isVisible().catch(() => false)) {
        await card.click();
        await expect(page.locator('.booking-details-modal__title')).toBeVisible();
        await page.getByRole('button', { name: 'Delete' }).click();
        const confirmBtn = page.getByRole('button', { name: /Delete|Confirm/ }).last();
        await confirmBtn.click();
        console.log('CLEANUP: deleted', TEST_GUEST_NAME);
      } else {
        console.log('CLEANUP: test guest not found, nothing to delete');
      }
    } catch (e) {
      console.log('CLEANUP FAILED - manual cleanup needed for', TEST_GUEST_NAME, e);
    } finally {
      await page.close();
    }
  });
});
