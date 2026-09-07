import { chromium } from '@playwright/test';

async function getSidebar() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://dev.ground-code.com/rivera-resorts/luxe-stays/');
  await page.waitForTimeout(3000);

  const sidebarItems = await page.evaluate(() => {
    const items = [];
    const elements = document.querySelectorAll('aside a, aside button');
    elements.forEach(el => {
      items.push({
        tag: el.tagName,
        text: el.innerText.trim(),
        href: el.getAttribute('href'),
      });
    });
    return items;
  });

  console.log('Sidebar items:', JSON.stringify(sidebarItems, null, 2));
  await browser.close();
}

getSidebar().catch(console.error);
