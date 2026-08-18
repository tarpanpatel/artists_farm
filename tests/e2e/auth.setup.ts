import { test as setup } from '@playwright/test';
import { DEMO_PROPERTY_PATH, waitForDemoLogin } from './helpers';

// Standard Playwright "auth setup" pattern: log into the public demo
// property once and save the session cookie, so the feature specs
// (bookings-edit/checkout/staff) start already authenticated instead of
// each separately re-triggering AuthContext's demo auto-login flow. This
// also sidesteps a real, separate finding: on a genuinely cold browser
// (no cookies) DataLoader.tsx fires its data requests before the demo
// login resolves, producing a burst of transient 401s - see
// login.spec.ts, which deliberately tests that cold path instead of
// using this saved state.
const authFile = 'tests/e2e/.auth/demo.json';

setup('authenticate against the public demo property', async ({ page }) => {
  await page.goto(DEMO_PROPERTY_PATH);
  await waitForDemoLogin(page);
  await page.context().storageState({ path: authFile });
});
