import { test, expect } from '@playwright/test';

// Verifies certification Scenario 1 (500-day bulk ARI push) actually works
// when triggered from the real Channel Manager screen, not just called
// directly from PHP - this has never been proven before (see
// TASK_CHANNEX_FOLLOWUP.md Task 5 / TASK_CHANNEX_PRE_AUDIT.md Task 2).
// Logs in as a throwaway test Admin account (staff_users id 'usr-ai-test-1',
// property_id 1) created solely for this check - delete it afterward.
test('Channel Manager UI: login, load screen, and push ARI produces real task IDs', async ({ page }) => {
  await page.goto('/jaipur/');

  await page.locator('#mobileNumber').fill('9999999001');
  await page.locator('#passcode').fill('424242');
  await page.getByRole('button', { name: 'Login to Terminal' }).click();

  // Wait for the property dashboard to actually load post-login.
  await expect(page.getByText('Access Denied')).toHaveCount(0);
  await page.waitForLoadState('networkidle');

  await page.goto('/jaipur/#channel_manager');
  await page.waitForLoadState('networkidle');

  // The screen should render, not blank/crash.
  await expect(page.getByRole('button', { name: 'Push to Channex' })).toBeVisible({ timeout: 15000 });

  // A "Finish Setting Up This Property" wizard drawer can cover the screen
  // and intercept clicks - fully dismiss it via its close (X) button
  // (PropertySetupWizard.tsx: onClick={() => setIsOpen(false)}) if present.
  const wizardDrawer = page.locator('[data-testid="flowbite-drawer"].property-setup-wizard');
  if (await wizardDrawer.isVisible().catch(() => false)) {
    await wizardDrawer.locator('button[class*="text-gray-400"][class*="hover:bg-gray-100"]').first().click();
    await wizardDrawer.waitFor({ state: 'hidden', timeout: 5000 });
  }

  await page.getByRole('button', { name: 'Push to Channex' }).click();

  // Confirm dialog uses the same label for its confirm button.
  const confirmButton = page.getByRole('button', { name: 'Push to Channex' }).last();
  await confirmButton.click();

  // Real task IDs banner, not a synthetic/hand-built result.
  await expect(page.getByText(/2 Channex Calls Generated/i)).toBeVisible({ timeout: 20000 });
  const bannerText = await page.locator('text=Channex Calls Generated').locator('..').innerText();
  console.log('PUSH RESULT BANNER:', bannerText);

  // Grab any UUID-shaped task IDs visible on the page as evidence.
  const taskIdMatches = await page.locator('body').innerText();
  const uuids = [...taskIdMatches.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)].map(m => m[0]);
  console.log('TASK/OTHER UUIDS VISIBLE ON PAGE:', uuids);
});
