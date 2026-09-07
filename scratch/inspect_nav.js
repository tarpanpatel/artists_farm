import { chromium } from '@playwright/test';

async function inspectNav() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(4000);

  // Print all links and buttons with their text and hrefs
  const navLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button'))
      .map(el => ({
        tag: el.tagName,
        text: el.innerText.trim().replace(/\n+/g, ' '),
        href: el.getAttribute('href'),
        id: el.id,
        classes: el.className
      }))
      .filter(item => item.text.length > 0 && item.text.length < 50);
  });

  console.log('Nav Elements:', JSON.stringify(navLinks, null, 2));

  await browser.close();
}

inspectNav().catch(console.error);
