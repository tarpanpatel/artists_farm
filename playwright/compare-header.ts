import { test, expect } from '@playwright/test';

test('compare header border and shadow', async ({ page }) => {
  // Compare local header
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  
  const localHeader = page.locator('header');
  const localBorderBottom = await localHeader.evaluate((el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  
  console.log('Local header styles:', localBorderBottom);
  
  // Compare Flowbite demo header
  await page.goto('https://flowbite.com/application-ui/demo/');
  await page.waitForLoadState('networkidle');
  
  // Find a nav or header element in Flowbite demo
  const flowbiteHeader = page.locator('nav, header').first();
  const flowbiteBorderBottom = await flowbiteHeader.evaluate((el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  
  console.log('Flowbite demo header styles:', flowbiteBorderBottom);
  
  // Compare
  const borderMatch = localBorderBottom.borderBottomWidth === flowbiteBorderBottom.borderBottomWidth;
  const shadowMatch = localBorderBottom.boxShadow === flowbiteBorderBottom.boxShadow;
  
  console.log('Border matches:', borderMatch);
  console.log('Shadow matches:', shadowMatch);
  
  if (!borderMatch || !shadowMatch) {
    console.log('DIFFERENCES FOUND - Header needs updating');
    process.exit(1);
  } else {
    console.log('HEADER ALREADY MATCHES Flowbite demo - no changes needed');
  }
});