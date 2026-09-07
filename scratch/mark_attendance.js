import { chromium } from '@playwright/test';

async function markAttendance() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/#attendance_calendar');
  await page.waitForTimeout(3000);

  // Click Enable Bulk Select
  console.log('Clicking Enable Bulk Select...');
  await page.click('button:has-text("Enable Bulk Select")');
  await page.waitForTimeout(500);

  // Click Select Month
  console.log('Clicking Select Month...');
  await page.click('button:has-text("Select Month")');
  await page.waitForTimeout(500);

  // Now see what action buttons appeared for setting status
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());
  });
  console.log('Bulk select buttons:', buttons);

  // Look for Present button
  const presentBtn = page.locator('button:has-text("Present")').first();
  if (await presentBtn.isVisible()) {
    console.log('Clicking Present...');
    await presentBtn.click();
    await page.waitForTimeout(1000);
  }

  // Look for Save / Apply button if any
  const applyBtn = page.locator('button:has-text("Apply"), button:has-text("Save")').first();
  if (await applyBtn.isVisible()) {
    console.log('Clicking Apply/Save...');
    await applyBtn.click();
    await page.waitForTimeout(1000);
  }

  // Exit Bulk Mode
  const exitBtn = page.locator('button:has-text("Exit Bulk Mode")').first();
  if (await exitBtn.isVisible()) {
    await exitBtn.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: 'scratch/attendance_filled.png' });
  console.log('Saved scratch/attendance_filled.png');

  await browser.close();
}

markAttendance().catch(console.error);
