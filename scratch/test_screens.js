import { chromium } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'c:\\xampp\\htdocs\\artists_farm\\assets\\images';

async function testScreens() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  const cleanUI = async () => {
    await page.evaluate(() => {
      // Hide tour pill
      document.querySelectorAll('button, div').forEach(el => {
        if (el.innerText?.includes('Explore Full App Tour')) {
          const container = el.closest('.fixed') || el;
          container.style.display = 'none';
        }
      });
      // Hide toasts
      document.querySelectorAll('[role="alert"], [data-testid="flowbite-toast"]').forEach(el => {
        el.style.display = 'none';
      });
    });
  };

  const screens = [
    { name: 'screen-dashboard.png', hash: '#dashboard', title: 'Dashboard' },
    { name: 'screen-analytics.png', hash: '#dashboard_analytics', title: 'Analytics' },
    { name: 'screen-kitchen.png', hash: '#kitchen_orders', title: 'Kitchen Orders' },
    { name: 'screen-cash.png', hash: '#expenses', title: 'Expenses / Cash' },
    { name: 'screen-staff.png', hash: '#attendance_calendar', title: 'Attendance' },
  ];

  // First open the app and wait for initial mount
  console.log('Loading Luxe Stays...');
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  for (const s of screens) {
    console.log(`Navigating to ${s.title} (${s.hash})...`);
    await page.evaluate((h) => { window.location.hash = h; }, s.hash);
    await page.waitForTimeout(3000);
    await cleanUI();
    const dest = path.join(SCREENSHOT_DIR, s.name);
    await page.screenshot({ path: dest });
    console.log(`Saved ${s.name}`);
  }

  await browser.close();
  console.log('Finished capturing all screens!');
}

testScreens().catch(console.error);
