import { chromium,firefox,webkit, FullConfig } from '@playwright/test';
const flowbiteCardStyles = {
  border: '1px solid rgb(226, 232, 240)',
  background: 'rgb(255, 255, 255)',
};
async function testParity() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  // 1. Fetch Flowbite demo page to see what's available
  try {
    await page.goto('https://flowbite.com/application-ui/demo/', { waitUntil: 'networkidle', timeout: 15000 });
    const title = await page.title();
    console.log('Flowbite demo page title:', title);
    const links = await page.$$eval('a[href*="/application-ui/"]', (els: any[]) => els.slice(0,30).map((a: any) => a.getAttribute('href')));
    console.log('Flowbite application-ui sample links:', links);
  } catch(e) {
    console.log('Flowbite fetch error (may be blocked):', e.message?.substring(0,100));
  }
  // 2. Try the app - just check if it loads
  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const appTitle = await page.title();
    console.log('App page title:', appTitle);
    // Check for Tailwind classes on body or main container
    const bodyClass = await page.getAttribute('body', 'class');
    console.log('Body class:', bodyClass);
  } catch(e) {
    console.log('App fetch error:', e.message?.substring(0,100));
  }
  await browser.close();
}
testParity().then(() => console.log('Done')).catch(e => console.error('Fatal:', e));
