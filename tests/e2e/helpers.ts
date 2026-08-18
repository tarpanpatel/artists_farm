import { Page, expect } from '@playwright/test';

// Public demo property (properties.is_public_demo = 1) - AuthContext.tsx
// auto-logs anonymous visitors into this one via a real login_user call
// using demo-only credentials, so tests never need a hardcoded
// username/passcode. See src/contexts/AuthContext.tsx.
export const DEMO_PROPERTY_PATH = '/rivera-resorts/luxe-stays/';

// Mirrors main.tsx's shouldLogError() noise-list exactly, so these tests
// flag the same things Telescope's JS Browser portal is designed to catch
// (see CLAUDE.md "Telescope Error Center") and nothing more.
const NOISE_PATTERNS = ['chrome-extension', 'ResizeObserver loop limit'];

function isNoise(message: string): boolean {
  return NOISE_PATTERNS.some((p) => message.includes(p));
}

interface TimestampedError {
  message: string;
  at: number;
}

// Attach console/page error tracking before navigation. Each error is
// timestamped so callers can distinguish "happened during a known startup
// race" from "happened after the app settled" instead of only matching on
// message text (see login.spec.ts).
export function trackConsoleErrors(page: Page): { getErrors: () => TimestampedError[] } {
  const errors: TimestampedError[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isNoise(msg.text())) {
      errors.push({ message: msg.text(), at: Date.now() });
    }
  });

  page.on('pageerror', (err) => {
    if (!isNoise(err.message)) {
      errors.push({ message: err.message, at: Date.now() });
    }
  });

  return { getErrors: () => errors };
}

// Shared by auth.setup.ts and login.spec.ts: the property name in the
// header/sidebar is the signal AuthContext's demo auto-login succeeded and
// replaced the login form with the real app shell.
export async function waitForDemoLogin(page: Page): Promise<void> {
  await expect(page.getByText('Luxe Stays').first()).toBeVisible({ timeout: 20000 });
}
