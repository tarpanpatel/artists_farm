import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  // Compare local header
  const page1 = await context.newPage();
  await page1.goto('http://localhost:3000');
  await page1.waitForLoadState('networkidle');
  
  const localHeader = page1.locator('header');
  const localResult = await localHeader.evaluate((el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  
  console.log('Local header styles:', localResult);
  
  // Compare Flowbite demo header
  const page2 = await context.newPage();
  await page2.goto('https://flowbite.com/application-ui/demo/');
  await page2.waitForLoadState('networkidle');
  
  const flowbiteHeader = page2.locator('nav, header').first();
  const flowbiteResult = await flowbiteHeader.evaluate((el: HTMLElement) => {
    const style = window.getComputedStyle(el);
    return {
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  
  console.log('Flowbite demo header styles:', flowbiteResult);
  
  // Compare
  const borderMatch = localResult.borderBottomWidth === flowbiteResult.borderBottomWidth;
  const shadowMatch = localResult.boxShadow === flowbiteResult.boxShadow;
  
  console.log('Border matches:', borderMatch);
  console.log('Shadow matches:', shadowMatch);
  
  if (!borderMatch || !shadowMatch) {
    console.log('DIFFERENCES FOUND - Header needs updating');
  } else {
    console.log('HEADER ALREADY MATCHES Flowbite demo - no changes needed');
  }
  
  await browser.close();
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});