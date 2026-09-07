import { chromium } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'c:\\xampp\\htdocs\\artists_farm\\assets\\images';

async function captureAll() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  // A crisp 1440x900 desktop viewport with 2x scale for retina crispness
  const context = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log('Navigating to Luxe Stays...');
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  // Helper to remove any floating banners or tour pills
  const cleanUI = async () => {
    await page.evaluate(() => {
      document.querySelectorAll('button, div').forEach(el => {
        if (el.innerText?.includes('Explore Full App Tour')) {
          const container = el.closest('.fixed') || el;
          container.style.display = 'none';
        }
      });
    });
  };

  await cleanUI();

  // 1. Operational Dashboard
  console.log('Capturing screen-dashboard.png...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-dashboard.png') });
  console.log('Done screen-dashboard.png');

  // 2. Finances / Analytics
  console.log('Navigating to Finances...');
  await page.click('aside a[href="#finances"]');
  await page.waitForTimeout(3000);
  await cleanUI();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-analytics.png') });
  console.log('Done screen-analytics.png');

  // 3. Kitchen - Food Orders
  console.log('Navigating to Kitchen -> Food Orders...');
  // Click kitchen button
  await page.click('aside button:has-text("Kitchen")');
  await page.waitForTimeout(1000);
  await page.click('aside a:has-text("Food Orders")');
  await page.waitForTimeout(3000);
  await cleanUI();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-kitchen.png') });
  console.log('Done screen-kitchen.png');

  // 4. Expenses / Cash Drawer
  console.log('Navigating to Expenses...');
  await page.click('aside a[href="#expenses"]');
  await page.waitForTimeout(3000);
  await cleanUI();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-cash.png') });
  console.log('Done screen-cash.png');

  // 5. Team / Attendance Calendar
  console.log('Navigating to Team -> Attendance Calendar...');
  await page.click('aside button:has-text("Team")');
  await page.waitForTimeout(1000);
  await page.click('aside a:has-text("Attendance Calendar")');
  await page.waitForTimeout(3000);
  await cleanUI();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-staff.png') });
  console.log('Done screen-staff.png');

  await browser.close();
  console.log('All screenshots captured successfully!');
}

captureAll().catch(console.error);
