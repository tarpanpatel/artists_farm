import { chromium } from '@playwright/test';

async function testSingle() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 2,
  });

  console.log('Loading Luxe Stays...');
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  // Hide tour button specifically without touching any ancestor container
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tourBtn = btns.find(b => b.textContent.includes('Explore Full App Tour'));
    if (tourBtn) {
      const parent = tourBtn.parentElement;
      if (parent && parent.className.includes('fixed')) {
        parent.style.visibility = 'hidden';
      } else {
        tourBtn.style.visibility = 'hidden';
      }
    }
  });

  await page.screenshot({ path: 'scratch/dash_test.png' });
  console.log('Saved scratch/dash_test.png');

  // Let's test navigation to analytics
  console.log('Navigating to #dashboard_analytics...');
  await page.evaluate(() => { window.location.hash = '#dashboard_analytics'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/analytics_test.png' });
  console.log('Saved scratch/analytics_test.png');

  // Let's test navigation to expenses
  console.log('Navigating to #expenses...');
  await page.evaluate(() => { window.location.hash = '#expenses'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/expenses_test.png' });
  console.log('Saved scratch/expenses_test.png');

  // Let's test navigation to kitchen_orders
  console.log('Navigating to #kitchen_orders...');
  await page.evaluate(() => { window.location.hash = '#kitchen_orders'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/kitchen_test.png' });
  console.log('Saved scratch/kitchen_test.png');

  // Let's test navigation to attendance_calendar
  console.log('Navigating to #attendance_calendar...');
  await page.evaluate(() => { window.location.hash = '#attendance_calendar'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/staff_test.png' });
  console.log('Saved scratch/staff_test.png');

  await browser.close();
}

testSingle().catch(console.error);
