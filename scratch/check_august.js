import { chromium } from '@playwright/test';

async function checkAugust() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/#attendance_calendar');
  await page.waitForTimeout(3000);

  // Click Prev month button
  await page.click('button:has-text("Prev")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'scratch/attendance_prev.png' });

  // Also check finances scrolled down to Monthly Payout Calculator
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/#finances');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.scrollTo(0, 500);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'scratch/finances_scrolled.png' });

  await browser.close();
}

checkAugust().catch(console.error);
