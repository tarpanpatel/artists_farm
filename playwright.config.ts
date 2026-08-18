import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests run against the public demo property (Rivera Resorts /
// Luxe Stays, properties.is_public_demo = 1), which anonymous visitors get
// auto-logged into via AuthContext.tsx's demo-credentials path - so these
// tests need no hardcoded username/passcode. See src/contexts/AuthContext.tsx.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  // login.spec.ts deliberately opts out of storageState (it tests the real
  // cold, cookie-less first visit) - every other spec gets it via
  // testIgnore below, rather than an allow-list, so a new spec file added
  // later is scheduled automatically instead of silently matching nothing.
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'desktop',
      testIgnore: [/auth\.setup\.ts/, /login\.spec\.ts/],
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: 'tests/e2e/.auth/demo.json' },
    },
    {
      name: 'mobile',
      testIgnore: [/auth\.setup\.ts/, /login\.spec\.ts/],
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'], storageState: 'tests/e2e/.auth/demo.json' },
    },
    {
      name: 'cold-start-desktop',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'cold-start-mobile',
      testMatch: /login\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
