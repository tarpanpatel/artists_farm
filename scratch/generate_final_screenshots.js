import { chromium } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'c:\\xampp\\htdocs\\artists_farm\\assets\\images';

async function generateScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  console.log('Loading Luxe Stays...');
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  const cleanAndCapture = async (filename) => {
    await page.evaluate(() => {
      // Remove any tour pill
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent?.includes('Explore Full App Tour')) {
          btn.remove();
        }
      });
      // Remove toasts
      document.querySelectorAll('[role="alert"]').forEach(alert => alert.remove());
    });
    await page.waitForTimeout(500);
    const dest = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: dest });
    console.log(`Saved ${dest}`);
  };

  // 1. Dashboard
  console.log('1. Capturing screen-dashboard.png...');
  await page.evaluate(() => { window.location.hash = '#dashboard'; });
  await page.waitForTimeout(3000);
  await cleanAndCapture('screen-dashboard.png');

  // 2. Analytics
  console.log('2. Capturing screen-analytics.png...');
  await page.evaluate(() => { window.location.hash = '#dashboard_analytics'; });
  await page.waitForTimeout(3000);
  await cleanAndCapture('screen-analytics.png');

  // 3. Kitchen KDS
  console.log('3. Capturing screen-kitchen.png...');
  await page.evaluate(() => { window.location.hash = '#kitchen_orders'; });
  await page.waitForTimeout(3000);
  await cleanAndCapture('screen-kitchen.png');

  // 4. Cash Drawer / Finances
  console.log('4. Capturing screen-cash.png...');
  await page.evaluate(() => { window.location.hash = '#finances'; });
  await page.waitForTimeout(3000);
  await cleanAndCapture('screen-cash.png');

  // 5. Staff Attendance
  console.log('5. Capturing screen-staff.png...');
  await page.evaluate(() => { window.location.hash = '#attendance_calendar'; });
  await page.waitForTimeout(3000);
  await cleanAndCapture('screen-staff.png');

  await browser.close();
  console.log('ALL 5 SCREENSHOTS GENERATED SUCCESSFULLY!');
}

generateScreenshots().catch(console.error);
