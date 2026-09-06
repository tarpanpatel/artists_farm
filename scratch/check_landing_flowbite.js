import { chromium } from '@playwright/test';

async function checkLanding() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });

  // Mobile context (iPhone 440 x 956)
  const mobileContext = await browser.newContext({
    viewport: { width: 440, height: 956 },
    deviceScaleFactor: 2,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost/artists_farm/home.html');
  await mobilePage.waitForTimeout(1000);

  // Screenshot mobile OTA section
  const otaMobile = await mobilePage.$('#channel-manager');
  if (otaMobile) {
    await otaMobile.screenshot({ path: 'scratch/landing_ota_mobile.png' });
  }

  // Screenshot mobile features section
  const featuresMobile = await mobilePage.$('#features-overview');
  if (featuresMobile) {
    await featuresMobile.screenshot({ path: 'scratch/landing_features_mobile.png' });
  }

  // Screenshot mobile pricing section
  const pricingMobile = await mobilePage.$('#pricing');
  if (pricingMobile) {
    await pricingMobile.screenshot({ path: 'scratch/landing_pricing_mobile.png' });
  }

  // Desktop context (1280 x 900)
  const deskContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const deskPage = await deskContext.newPage();
  await deskPage.goto('http://localhost/artists_farm/home.html');
  await deskPage.waitForTimeout(1000);

  // Screenshot desktop OTA section
  const otaDesk = await deskPage.$('#channel-manager');
  if (otaDesk) {
    await otaDesk.screenshot({ path: 'scratch/landing_ota_desktop.png' });
  }

  // Screenshot desktop features section
  const featuresDesk = await deskPage.$('#features-overview');
  if (featuresDesk) {
    await featuresDesk.screenshot({ path: 'scratch/landing_features_desktop.png' });
  }

  // Screenshot desktop pricing section
  const pricingDesk = await deskPage.$('#pricing');
  if (pricingDesk) {
    await pricingDesk.screenshot({ path: 'scratch/landing_pricing_desktop.png' });
  }

  // Screenshot desktop calculator section
  const calcDesk = await deskPage.$('#booking-engine');
  if (calcDesk) {
    await calcDesk.screenshot({ path: 'scratch/landing_calc_desktop.png' });
  }

  await browser.close();
  console.log('Screenshots captured successfully!');
}

checkLanding().catch(err => {
  console.error(err);
  process.exit(1);
});
