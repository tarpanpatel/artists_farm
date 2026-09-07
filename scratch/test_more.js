import { chromium } from '@playwright/test';

async function testMore() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 860 },
    deviceScaleFactor: 2,
  });

  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  // Hide tour button
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const tourBtn = btns.find(b => b.textContent.includes('Explore Full App Tour'));
    if (tourBtn) tourBtn.remove();
  });

  // 1. Finances
  console.log('Navigating to #finances...');
  await page.evaluate(() => { window.location.hash = '#finances'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/finances_test.png' });

  // 2. Attendance salaries
  console.log('Navigating to #attendance_salaries...');
  await page.evaluate(() => { window.location.hash = '#attendance_salaries'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/attendance_salaries_test.png' });

  // 3. Team & Access (staff permissions)
  console.log('Navigating to #staff_permissions...');
  await page.evaluate(() => { window.location.hash = '#staff_permissions'; });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'scratch/staff_permissions_test.png' });

  await browser.close();
}

testMore().catch(console.error);
