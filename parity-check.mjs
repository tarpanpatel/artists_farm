import { chromium } from 'playwright';

const COOKIE_PATH = 'C:\\temp\\app-session.json';

async function getStyles(page, selector) {
  try {
    const elements = await page.$$(selector);
    if (!elements.length) return null;
    const samples = [];
    for (const el of elements.slice(0, 3)) {
      const info = await el.evaluate(function(node) {
        var cs = getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          class: node.className.split(' ').slice(0, 6).join(' '),
          borderRadius: cs.borderRadius,
          padding: cs.padding,
          borderWidth: cs.borderWidth,
          borderColor: cs.borderColor,
          backgroundColor: cs.backgroundColor,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          boxShadow: cs.boxShadow,
        };
      });
      samples.push(info);
    }
    return { count: elements.length, samples };
  } catch(e) {
    return { error: e.message ? e.message.substring(0,80) : 'unknown' };
  }
}

async function main() {
  // === 1. Login via fetch to get session cookie ===
  console.log('=== Logging in ===');
  var fetch;
  try {
    const { default: nodeFetch } = await import('node-fetch');
    fetch = nodeFetch;
  } catch(e) {
    fetch = globalThis.fetch;
  }

  // Use node-fetch or built-in fetch with cookie jar
  var cookieJar;
  try {
    const { CookieJar } = await import('tough-cookie');
    const { wrapper } = await import('tough-cookie-fetch-cookie');
    cookieJar = new CookieJar();
    const wrappedFetch = wrapper(fetch, cookieJar);
    var loginRes = await wrappedFetch('http://localhost:3000/php/api/router.php?action=login_user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile_number: '9999999999', passcode: '368545' }),
    });
    var loginData = JSON.parse(await loginRes.text());
    console.log('Login result:', loginData.success ? 'SUCCESS' : loginData.message);

    // Get cookies
    var cookies = await cookieJar.getCookies('http://localhost:3000');
    console.log('Cookies:', cookies.map(function(c) { return c.name + '=' + c.value.substring(0,30); }).join(', '));
  } catch(e) {
    console.log('Cookie-based login error:', e.message);
    // Fallback: use Playwright's API to login
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Login via Playwright by intercepting the API call
    var loginApi = await context.request;
    var apiContext = await browser.newContext();
    var apiReq = apiContext.request;

    // Use the page to make the login request
    var page = await context.newPage();
    var [response] = await Promise.all([
      page.waitForResponse(function(r) { return r.url().includes('login_user'); }),
      page.evaluate(async function() {
        return await fetch('/php/api/router.php?action=login_user', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mobile_number: '9999999999', passcode: '368545' }),
        }).then(function(r) { return r.json(); });
      }),
    ]);
    var loginData = JSON.parse(await response.text());
    console.log('Login result:', loginData.success ? 'SUCCESS' : loginData.message);

    // Get cookies from page context
    var pageCookies = await page.context().cookies();
    console.log('Page cookies:', pageCookies.map(function(c) { return c.name + '=' + c.value.substring(0,20) + '...'; }).join(', '));

    // Navigate to the app
    await page.goto('http://localhost:3000/artists_farm/vrikshawan/goa-homes/', { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    var isLogin = await page.$('input[type="password"]') !== null;
    console.log('Is on login page:', isLogin);

    if (isLogin) {
      console.log('Filling login form...');
      await page.fill('input[type="tel"]', '9999999999');
      await page.fill('input[type="password"]', '368545');
      await page.press('input[type="password"]', 'Enter');
      await page.waitForTimeout(4000);
      console.log('After login, URL:', page.url());
    }

    // Now search for billing/nav elements
    var navItems = await page.evaluate(function() {
      var items = document.querySelectorAll('a, button, [role="tab"]');
      var result = [];
      for (var i = 0; i < items.length; i++) {
        var text = (items[i].textContent || '').trim();
        if (text && (text.match(/bill/i) || text.match(/checkout/i) || text.match(/guest/i) || text.match(/dashboard/i) || text.match(/kitchen/i))) {
          result.push(text.substring(0, 30));
        }
      }
      return result;
    });
    console.log('Nav items found:', navItems.slice(0, 20));

    await extractAndCompare(page, context);
    await browser.close();
    return;
  }

  // === 2. Launch browser with session cookie ===
  const browser = await chromium.launch({ headless: true });
  var cookieArr = cookies.map(function(c) {
    return {
      name: c.key, value: c.value, domain: 'localhost',
      path: c.domain || '/',
      httpOnly: c.httpOnly || false,
      secure: false,
      sameSite: 'Lax'
    };
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    storageState: { cookies: cookieArr, origins: [] }
  });

  const page = await context.newPage();

  // Load the app
  console.log('\n=== Navigating to app ===');
  await page.goto('http://localhost:3000/artists_farm/vrikshawan/goa-homes/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  var isLogin = await page.$('input[type="password"]') !== null;
  console.log('Is on login page:', isLogin);

  if (isLogin) {
    console.log('Filling login form...');
    await page.fill('input[type="tel"]', '9999999999');
    await page.fill('input[type="password"]', '368545');
    await page.press('input[type="password"]', 'Enter');
    await page.waitForTimeout(4000);
    console.log('After login, URL:', page.url());
  }

  // Find billing/checkout nav items and click
  var navResult = await page.evaluate(function() {
    var items = document.querySelectorAll('a, button, [role="tab"]');
    for (var i = 0; i < items.length; i++) {
      var text = (items[i].textContent || '').trim();
      if (text === 'Billing' || text === 'Checkout' || text === 'Guests' || text === 'Dashboard' || text.match(/bill/i) || text.match(/checkout/i)) {
        items[i].click();
        return 'Clicked: ' + text;
      }
    }
    return 'No matching nav item found';
  });
  console.log('Nav click:', navResult);
  await page.waitForTimeout(2000);

  var hasBillingCheckout = await page.evaluate(function() {
    return !!(document.querySelector('.billing-checkout__grid') ||
      document.querySelector('.billing-checkout__guest-card') ||
      document.querySelector('.react-data-table-component') ||
      document.querySelector('[class*="billing-checkout"]'));
  });
  console.log('Has BillingCheckout elements:', hasBillingCheckout);

  await extractAndCompare(page, context);
  await browser.close();
}

async function extractAndCompare(page, context) {
  // Extract computed styles from app
  console.log('\n=== App Element Styles ===');
  var checks = [
    { label: 'Guest Cards', selector: '.billing-checkout__guest-card, .billing-checkout__room-card' },
    { label: 'DataTable Headers', selector: '.react-data-table-component th, th' },
    { label: 'Badges', selector: 'span[class*="rounded-full"][class*="px"], .badge' },
    { label: 'Primary Buttons', selector: 'button.bg-blue-600, button.bg-amber-500, button.bg-emerald-600' },
    { label: 'Form Inputs', selector: 'input[type="text"], input[type="number"], select' },
    { label: 'Modal Backdrops', selector: '[role="dialog"], .modal-backdrop, .fixed.inset-0' },
    { label: 'DateRangePicker', selector: '.datepicker, [class*="datepicker"]' },
  ];

  for (var i = 0; i < checks.length; i++) {
    var check = checks[i];
    var result = await getStyles(page, check.selector);
    if (result) {
      console.log('\n--- ' + check.label + ' (' + result.count + ' found) ---');
      if (result.error) console.log('  Error:', result.error);
      for (var j = 0; j < result.samples.length; j++) {
        console.log('  ', JSON.stringify(result.samples[j]));
      }
    } else {
      console.log('\n--- ' + check.label + ': No elements found ---');
    }
  }

  // === 3. Flowbite reference comparison ===
  console.log('\n\n=== Flowbite Reference Styles ===');
  var fpage = await context.newPage();

  var flowbiteRefs = [
    { name: 'Badge docs', url: 'https://flowbite.com/docs/components/badge/', selector: 'span[class*="bg-blue-100"], span[class*="bg-green-100"], span[class*="rounded-full"]' },
    { name: 'Button docs', url: 'https://flowbite.com/docs/components/button/', selector: 'button.bg-blue-700, button.bg-blue-600' },
    { name: 'Card docs', url: 'https://flowbite.com/docs/components/card/', selector: '.bg-white.shadow, .bg-white.border' },
    { name: 'Forms docs', url: 'https://flowbite.com/docs/forms/input/', selector: 'input[type="text"], input[type="number"]' },
    { name: 'Modal docs', url: 'https://flowbite.com/docs/components/modal/', selector: '[role="dialog"], .modal' },
  ];

  for (var fi = 0; fi < flowbiteRefs.length; fi++) {
    var ref = flowbiteRefs[fi];
    try {
      await fpage.goto(ref.url, { waitUntil: 'networkidle', timeout: 15000 });
      await fpage.waitForTimeout(1500);
      var result = await getStyles(fpage, ref.selector);
      if (result && result.count > 0) {
        console.log('\n  Flowbite ' + ref.name + ' (' + result.count + ' found):');
        if (result.error) console.log('  Error:', result.error);
        for (var si = 0; si < Math.min(result.samples.length, 3); si++) {
          console.log('  ', JSON.stringify(result.samples[si]));
        }
      } else {
        console.log('\n  Flowbite ' + ref.name + ': No elements found for ' + ref.selector);
      }
    } catch(e) {
      console.log('\n  Flowbite ' + ref.name + ': Error -', e.message ? e.message.substring(0,100) : String(e));
    }
  }
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
