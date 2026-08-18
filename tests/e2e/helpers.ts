import { Page } from '@playwright/test';

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

// Attach console/page error tracking before navigation. Call getErrors()
// after the flow under test to assert nothing real crashed.
export function trackConsoleErrors(page: Page): { getErrors: () => string[] } {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isNoise(msg.text())) {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    if (!isNoise(err.message)) {
      errors.push(err.message);
    }
  });

  return { getErrors: () => errors };
}
