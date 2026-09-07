import { chromium } from '@playwright/test';

async function test() {
  console.log('Launching Chrome...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  console.log('Chrome launched successfully!');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.error('BROWSER PAGEERROR:', err));
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'scratch/initial_page.png' });
  console.log('Current URL:', page.url());
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('Body text snippet:', bodyText.substring(0, 300));
  await browser.close();
}

test().catch(err => console.error('Error:', err));
