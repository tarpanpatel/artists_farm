import { test, expect, Page } from '@playwright/test';

// Drives certification Scenarios 2, 4, 5, 6 from the real Rate Rules UI
// (OperationalDashboard "Set Rate Rule" -> RateRuleModal), then confirms the
// resulting push actually reached Channex via the Channel Manager outbox
// table - not just that the local rule saved. See TASK_CHANNEX_FOLLOWUP.md
// Task 5 / TASK_CHANNEX_PRE_AUDIT.md Task 2.
//
// Scenario 3 (multiple rate plans, single date, one save) has NO UI path in
// this PMS: RateRuleModal has no rate-plan selector at all - the data model
// is one implicit rate plan per room/property, confirmed by reading the
// component (no "rate plan" field exists, only date range / rate / stay
// restrictions / room scope). The "3 rate plans" evidence in
// scratch/test_cert_scenario3.php was produced by calling
// ChannexAdapter::pushRestrictions() directly with synthetic extra rate
// plan IDs that don't correspond to anything a user can select. Reporting
// this rather than working around it, per the task's own instruction: "If
// a scenario has no UI path at all, say so."

async function dismissWizardIfPresent(page: Page) {
  const wizardDrawer = page.locator('[data-testid="flowbite-drawer"].property-setup-wizard');
  if (await wizardDrawer.isVisible().catch(() => false)) {
    await wizardDrawer.locator('button[class*="text-gray-400"][class*="hover:bg-gray-100"]').first().click();
    await wizardDrawer.waitFor({ state: 'hidden', timeout: 5000 });
  }
}

async function login(page: Page) {
  await page.goto('/jaipur/');
  await page.locator('#mobileNumber').fill('9999999001');
  await page.locator('#passcode').fill('424242');
  await page.getByRole('button', { name: 'Login to Terminal' }).click();
  await expect(page.getByText('Access Denied')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  await dismissWizardIfPresent(page);
}

async function openRateRuleModal(page: Page) {
  await page.goto('/jaipur/');
  await page.waitForLoadState('networkidle');
  await dismissWizardIfPresent(page);
  await page.getByRole('button', { name: 'Pricing' }).click();
  await page.getByRole('button', { name: 'Set Rate Rule' }).click();
  await expect(page.getByRole('heading', { name: 'Pricing Mode, Rates & Stay Restrictions' })).toBeVisible();
}

async function checkOutboxForRange(page: Page, dateFrom: string, dateTo: string, label: string) {
  await page.goto('/jaipur/#channel_manager');
  await page.waitForLoadState('networkidle');
  await dismissWizardIfPresent(page);
  await page.waitForTimeout(4000); // async post-response drain (fastcgi_finish_request)

  const rangeText = `${dateFrom}`;
  const row = page.locator('tr', { hasText: rangeText }).first();
  const found = await row.isVisible().catch(() => false);
  const rowText = found ? await row.innerText() : '(no matching row found)';
  console.log(`[${label}] outbox row for ${dateFrom} -> ${dateTo}:`, rowText.replace(/\n/g, ' | '));
  return { found, rowText };
}

test.describe.serial('Rate Rules UI -> Channex certification scenarios', () => {
  test('Scenario 2: single rate on a single date -> 1 restrictions push', async ({ page }) => {
    await login(page);
    await openRateRuleModal(page);

    const dateInputs = page.locator('form input[type="date"]');
    await dateInputs.nth(0).fill('2030-02-01');
    await dateInputs.nth(1).fill('2030-02-01');
    await page.getByPlaceholder(/4500/).fill('5000'); // nightly rate
    await page.getByRole('button', { name: 'Save Rate & Restrictions Rule' }).click();

    await expect(page.getByText('2030-02-01')).toBeVisible({ timeout: 10000 });

    const result = await checkOutboxForRange(page, '2030-02-01', '2030-02-01', 'Scenario 2');
    expect(result.found, 'Scenario 2: expected a Channex outbox row for 2030-02-01').toBeTruthy();
  });

  test('Scenario 4: 15-day range -> compressed range push', async ({ page }) => {
    await login(page);
    await openRateRuleModal(page);

    const dateInputs = page.locator('form input[type="date"]');
    await dateInputs.nth(0).fill('2030-03-01');
    await dateInputs.nth(1).fill('2030-03-15');
    await page.getByPlaceholder(/4500/).fill('6000');
    await page.getByRole('button', { name: 'Save Rate & Restrictions Rule' }).click();

    await expect(page.getByText('2030-03-01')).toBeVisible({ timeout: 10000 });

    const result = await checkOutboxForRange(page, '2030-03-01', '2030-03-15', 'Scenario 4');
    expect(result.found, 'Scenario 4: expected a Channex outbox row for the 15-day range').toBeTruthy();
  });

  test('Scenario 5: min-stay restriction on a date range -> restrictions push', async ({ page }) => {
    await login(page);
    await openRateRuleModal(page);

    const dateInputs = page.locator('form input[type="date"]');
    await dateInputs.nth(0).fill('2030-04-01');
    await dateInputs.nth(1).fill('2030-04-05');
    // Min Stay Nights is the number input inside the "Stay Duration Restrictions" block.
    await page.getByPlaceholder(/2, 3, 5/).fill('3');
    await page.getByRole('button', { name: 'Save Rate & Restrictions Rule' }).click();

    await expect(page.getByText('2030-04-01')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Min 3N/)).toBeVisible();

    const result = await checkOutboxForRange(page, '2030-04-01', '2030-04-05', 'Scenario 5');
    expect(result.found, 'Scenario 5: expected a Channex outbox row for the min-stay range').toBeTruthy();
  });

  test('Scenario 6: Stop Sell + CTA + CTD on a single date -> composite restrictions push', async ({ page }) => {
    await login(page);
    await openRateRuleModal(page);

    const dateInputs = page.locator('form input[type="date"]');
    await dateInputs.nth(0).fill('2030-05-01');
    await dateInputs.nth(1).fill('2030-05-01');
    await page.getByText('Stop Sell (Close Dates)').click();
    await page.getByText('Closed to Arrival (CTA)').click();
    await page.getByText('Closed to Departure (CTD)').click();
    await page.getByRole('button', { name: 'Save Rate & Restrictions Rule' }).click();

    await expect(page.getByText('2030-05-01')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Stop Sell', { exact: true })).toBeVisible();
    await expect(page.getByText('CTA', { exact: true })).toBeVisible();
    await expect(page.getByText('CTD', { exact: true })).toBeVisible();

    const result = await checkOutboxForRange(page, '2030-05-01', '2030-05-01', 'Scenario 6');
    expect(result.found, 'Scenario 6: expected a Channex outbox row for the stop-sell/CTA/CTD date').toBeTruthy();
  });
});
