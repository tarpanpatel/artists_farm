import { chromium } from '@playwright/test';

async function testSubmenus() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(3000);

  // Click Kitchen
  console.log('Clicking Kitchen button...');
  await page.click('aside button:has-text("Kitchen")');
  await page.waitForTimeout(1000);
  const kitchenSub = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('aside a, aside button')).map(el => el.innerText.trim());
  });
  console.log('After kitchen click:', kitchenSub);

  // Click Team
  console.log('Clicking Team button...');
  await page.click('aside button:has-text("Team")');
  await page.waitForTimeout(1000);
  const teamSub = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('aside a, aside button')).map(el => el.innerText.trim());
  });
  console.log('After team click:', teamSub);

  await browser.close();
}

testSubmenus().catch(console.error);
