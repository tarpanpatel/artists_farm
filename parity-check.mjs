import { chromium } from 'playwright';

async function getStyles(page, selector) {
  try {
    var elements = await page.$$(selector);
    if (!elements.length) return null;
    var samples = [];
    for (var el of elements.slice(0, 3)) {
      var info = await el.evaluate(function(node) {
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
  var browser = await chromium.launch({ headless: true });
  var context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  var page = await context.newPage();

  // === 1. Login via form ===
  console.log('=== Logging in ===');
  await page.goto('http://localhost:3000/artists_farm/vrikshawan/goa-homes/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // The app renders a terminal login page. Fill in the credentials.
  // The form has: input[type="tel"] for mobile_number, input[type="password"] for passcode
  var mobileInput = await page.$('input[type="tel"]');
  var passcodeInput = await page.$('input[type="password"]');

  if (mobileInput && passcodeInput) {
    console.log('Found login form - filling credentials');
    await mobileInput.fill('9999999999');
    await passcodeInput.fill('368545');

    // Submit by pressing Enter on the passcode field
    await passcodeInput.press('Enter');
    await page.waitForTimeout(4000);

    // Check if login succeeded
    var isLogin = await page.$('input[type="password"]') !== null;
    console.log('Still on login page:', isLogin);
    console.log('Current URL:', page.url());
  } else {
    console.log('Login form not found');
    var bodyText = await page.evaluate(function() { return (document.body.innerText || '').substring(0,200); });
    console.log('Page body:', bodyText);
  }

  // Navigate to dashboard
  await page.goto('http://localhost:3000/artists_farm/vrikshawan/goa-homes/#dashboard', { waitUntil: 'networkidle', timeout: 10000 }).catch(function(){});
  await page.waitForTimeout(3000);

  // Find nav items to identify available tabs
  var navItems = await page.evaluate(function() {
    var items = document.querySelectorAll('a, button, [role="tab"]');
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var text = (items[i].textContent || '').trim();
      if (text && (text.match(/bill/i) || text.match(/checkout/i) || text.match(/guest/i) || text.match(/dashboard/i) || text.match(/kitchen/i) || text.match(/staff/i))) {
        result.push(text.substring(0, 30));
      }
    }
    return result;
  });
  console.log('Nav items:', navItems.slice(0, 20));

  // Try clicking Billing/Checkout tab
  var navResult = await page.evaluate(function() {
    var items = document.querySelectorAll('a, button, [role="tab"]');
    for (var i = 0; i < items.length; i++) {
      var text = (items[i].textContent || '').trim();
      if (text.match(/bill/i) || text === 'Checkout' || text.match(/checkout/i)) {
        items[i].click();
        return 'Clicked: ' + text;
      }
    }
    return 'Not found - trying #billing hash';
  });
  console.log('Nav click:', navResult);
  await page.waitForTimeout(2000);

  // Check what's on the page
  var pageContent = await page.evaluate(function() {
    var texts = [];
    var headers = document.querySelectorAll('h1, h2, h3, h4');
    for (var i = 0; i < Math.min(headers.length, 20); i++) {
      texts.push(headers[i].textContent.trim());
    }
    return texts;
  });
  console.log('Headers on page:', pageContent);

  // Check for key UI component classes
  var hasClasses = await page.evaluate(function() {
    return {
      billingCheckout: !!document.querySelector('[class*="billing-checkout"]'),
      dataTable: !!document.querySelector('.react-data-table-component'),
      card: !!document.querySelector('.card, [class*="card"]'),
      badge: !!document.querySelector('.badge, span[class*="badge"]'),
      flowbiteModal: !!document.querySelector('[data-modal]'),
      datepicker: !!document.querySelector('.datepicker, [class*="datepicker"]'),
      statCard: !!document.querySelector('[class*="stat-card"]'),
    };
  });
  console.log('Component presence:', JSON.stringify(hasClasses));

  // === 2. Extract app styles ===
  console.log('\n=== App Element Styles ===');
  var checks = [
    { label: 'Guest/Room Cards', selector: '.billing-checkout__guest-card, .billing-checkout__room-card, .stat-card, [class*="card"][class*="shadow"]' },
    { label: 'Table Headers (th)', selector: 'th' },
    { label: 'Table Cells (td)', selector: 'td' },
    { label: 'Badges', selector: 'span[class*="rounded-full"], .badge, [class*="badge"]:not([class*="badge-"])' },
    { label: 'Primary Buttons', selector: 'button.bg-blue-600, button.bg-amber-500, button.bg-emerald-600, button[class*="btn"]' },
    { label: 'Form Inputs', selector: 'input[type="text"], input[type="number"], select, input[type="tel"]' },
    { label: 'DateRangePicker', selector: '.datepicker, [class*="datepicker"]' },
  ];

  for (var i = 0; i < checks.length; i++) {
    var result = await getStyles(page, checks[i].selector);
    if (result) {
      console.log('\n--- ' + checks[i].label + ' (' + result.count + ' found) ---');
      if (result.error) console.log('  Error:', result.error);
      for (var j = 0; j < result.samples.length; j++) {
        console.log('  ', JSON.stringify(result.samples[j]));
      }
    } else {
      console.log('\n--- ' + checks[i].label + ': No elements found ---');
    }
  }

  // === 3. Flowbite reference styles ===
  console.log('\n\n=== Flowbite Reference Styles ===');
  var fpage = await context.newPage();

  var flowbiteRefs = [
    { name: 'Badge', url: 'https://flowbite.com/docs/components/badge/', selector: 'span[class*="rounded-full"]' },
    { name: 'Button', url: 'https://flowbite.com/docs/components/button/', selector: 'button.bg-blue-700, button.bg-blue-600, button[class*="bg-blue"]' },
    { name: 'Card', url: 'https://flowbite.com/docs/components/card/', selector: '.bg-white.shadow, .bg-white.border, .card' },
    { name: 'Forms', url: 'https://flowbite.com/docs/forms/input/', selector: 'input[type="text"], input[type="number"]' },
    { name: 'Table', url: 'https://flowbite.com/docs/components/table/', selector: 'th, td' },
  ];

  for (var fi = 0; fi < flowbiteRefs.length; fi++) {
    var ref = flowbiteRefs[fi];
    try {
      await fpage.goto(ref.url, { waitUntil: 'networkidle', timeout: 15000 });
      await fpage.waitForTimeout(2000);
      var result = await getStyles(fpage, ref.selector);
      if (result && result.count > 0) {
        console.log('\n  Flowbite ' + ref.name + ' (' + result.count + ' found):');
        if (result.error) console.log('  Error:', result.error);
        for (var si = 0; si < Math.min(result.samples.length, 3); si++) {
          console.log('  ', JSON.stringify(result.samples[si]));
        }
      } else {
        console.log('\n  Flowbite ' + ref.name + ': No elements found');
      }
    } catch(e) {
      console.log('\n  Flowbite ' + ref.name + ': Error -', e.message ? e.message.substring(0,100) : String(e));
    }
  }

  await browser.close();
}

main().catch(function(e) { console.error('Fatal:', e); process.exit(1); });
