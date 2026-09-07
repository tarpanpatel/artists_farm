import { chromium } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = 'c:\\xampp\\htdocs\\artists_farm\\assets\\images';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('LOG:', msg.type(), msg.text()));

  console.log('Navigating...');
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForSelector('text=Luxe Stays', { timeout: 25000 });
  console.log('Luxe Stays header visible!');
  await page.waitForTimeout(3000);

  // Hide tour pill and toast
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.textContent?.includes('Explore Full App Tour')) {
        const p = el.closest('div.fixed') || el.parentElement;
        if (p) p.style.display = 'none';
      }
    });
  });

  // 1. Dashboard screenshot
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-dashboard.png') });
  console.log('Saved screen-dashboard.png');

  // Let's inspect all sidebar button/link texts
  const items = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('aside a, aside button, [role="navigation"] a, [role="navigation"] button'))
      .map(el => ({ text: el.innerText.trim(), tag: el.tagName }));
  });
  console.log('Sidebar items:', JSON.stringify(items));

  // 2. Click "Expenses"
  console.log('Clicking Expenses...');
  const expenseEl = page.locator('aside >> text=Expenses, nav >> text=Expenses').first();
  if (await expenseEl.isVisible()) {
    await expenseEl.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-cash.png') });
    console.log('Saved screen-cash.png');
  } else {
    console.log('Expenses not visible');
  }

  // 3. Click "Kitchen"
  console.log('Clicking Kitchen...');
  const kitchenEl = page.locator('aside >> text=Kitchen, nav >> text=Kitchen').first();
  if (await kitchenEl.isVisible()) {
    await kitchenEl.click();
    await page.waitForTimeout(1500);
    // Click sub item if any or capture
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-kitchen.png') });
    console.log('Saved screen-kitchen.png');
  } else {
    console.log('Kitchen not visible');
  }

  // 4. Click "Finances"
  console.log('Clicking Finances...');
  const financeEl = page.locator('aside >> text=Finances, nav >> text=Finances').first();
  if (await financeEl.isVisible()) {
    await financeEl.click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-analytics.png') });
    console.log('Saved screen-analytics.png');
  } else {
    console.log('Finances not visible');
  }

  // 5. Click "Team"
  console.log('Clicking Team...');
  const teamEl = page.locator('aside >> text=Team, nav >> text=Team').first();
  if (await teamEl.isVisible()) {
    await teamEl.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'screen-staff.png') });
    console.log('Saved screen-staff.png');
  } else {
    console.log('Team not visible');
  }

  await browser.close();
}

run().catch(console.error);
