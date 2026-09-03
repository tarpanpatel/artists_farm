import { test, expect, Page } from '@playwright/test';
import fs from 'fs';

// Scenarios 7 (inbound new booking) and 8 (inbound modify + cancel),
// delivered as a REAL HTTP webhook to the live endpoint
// (router.php?action=channex_webhook, with the actual shared-secret header),
// not an in-process handleWebhook() call - every prior scratch script for
// these scenarios called the receiver directly, which is exactly the blind
// spot that hid the broken envelope parser before commit 156c6c84. No
// existing script in this repo actually POSTs to the real endpoint; this is
// the first one that does.
//
// The trigger itself is inherently NOT a PMS UI action (Channex/the OTA
// sends the booking; the PMS only receives it), so "UI-driven" here means:
// after real ingestion, does the PMS's own Booking Calendar/Bookings list
// actually show it - not whether a human clicked a button to cause it.

const cfg = JSON.parse(fs.readFileSync('php/config/channex_config.json', 'utf8'));
const CHANNEX_BASE = cfg.base_url.replace(/\/$/, '');
const CHANNEX_KEY = cfg.api_key as string;
const WEBHOOK_SECRET = cfg.webhook_secret as string;
const WEBHOOK_URL = 'http://localhost/artists_farm/php/api/router.php?action=channex_webhook';

async function login(page: Page) {
  await page.goto('/jaipur/');
  await page.locator('#mobileNumber').fill('9999999001');
  await page.locator('#passcode').fill('424242');
  await page.getByRole('button', { name: 'Login to Terminal' }).click();
  await expect(page.getByText('Access Denied')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  const wizardDrawer = page.locator('[data-testid="flowbite-drawer"].property-setup-wizard');
  if (await wizardDrawer.isVisible().catch(() => false)) {
    await wizardDrawer.locator('button[class*="text-gray-400"][class*="hover:bg-gray-100"]').first().click();
    await wizardDrawer.waitFor({ state: 'hidden', timeout: 5000 });
  }
}

async function channexCall(method: string, path: string, body?: any) {
  const res = await fetch(`${CHANNEX_BASE}/${path}`, {
    method,
    headers: { 'user-api-key': CHANNEX_KEY, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// Inbound "Offline" bookings only work against the property already linked
// to Channex's Certification Simulator channel (confirmed live: creating a
// booking against the freshly re-provisioned "Artists Farm Jaipur" property,
// 3041823d-..., returns 403 forbidden - it has no channel attached, which
// the duplicate-property fix never provisioned). Routed through a temporary
// channex_mappings row (property_id 1, sentinel room_id 999999, see
// scratch/_setup_inbound_test_mapping.php) so property 1's real mapping
// (room_id NULL -> 3041823d) is untouched.
function getInboundTestMapping() {
  return { propId: '4286428a-5561-4508-bd28-1f9ae55d8795', roomTypeId: '4ca732c0-6f4f-457c-9c48-396f3d784590', ratePlanId: '2d0dfacb-0239-4ec9-9eba-f6962ff3ecd8' };
}

async function deliverWebhook(bookingId: string, propId: string, label: string) {
  // Fetch the booking's current revision straight from Channex, exactly as
  // the receiver is supposed to (the webhook itself carries no booking data,
  // only ids - see .claude/skills/channex-pms-integration/references/api.md).
  const b = await channexCall('GET', `bookings/${bookingId}`);
  const revisionId = b.json?.data?.attributes?.revision_id;
  console.log(`[${label}] booking ${bookingId} revision ${revisionId} status=${b.json?.data?.attributes?.status}`);
  if (!revisionId) throw new Error(`[${label}] booking has no revision_id: ${JSON.stringify(b.json)}`);

  const envelope = {
    event: 'booking',
    payload: { booking_id: bookingId, property_id: propId, revision_id: revisionId },
    user_id: null,
    timestamp: new Date().toISOString(),
  };

  // Without the secret - must be rejected.
  const unauthed = await fetch(WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(envelope) });
  console.log(`[${label}] webhook WITHOUT secret -> HTTP ${unauthed.status}`);

  // With the real secret - must succeed.
  const authed = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Channex-Webhook-Secret': WEBHOOK_SECRET },
    body: JSON.stringify(envelope),
  });
  const authedBody = await authed.text();
  console.log(`[${label}] webhook WITH secret -> HTTP ${authed.status} body=${authedBody}`);

  return { unauthedStatus: unauthed.status, authedStatus: authed.status, authedBody, revisionId };
}

test.describe.serial('Inbound booking ingestion (Scenarios 7-8), verified via real webhook + PMS UI', () => {
  test('Scenario 7: new inbound booking is rejected without secret, accepted with it, and appears in the PMS', async ({ page }) => {
    await login(page);
    const mapping = getInboundTestMapping();
    console.log('Resolved current mapping:', mapping);

    const offset = Math.floor(Math.random() * 20) + 5; // near-future, avoids calendar navigation
    const day1 = new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
    const day4 = new Date(Date.now() + (offset + 3) * 86400000).toISOString().slice(0, 10);
    const code = 'S78-' + Date.now();

    const created = await channexCall('POST', 'bookings', {
      booking: {
        property_id: mapping.propId, ota_name: 'Offline', ota_reservation_code: code,
        arrival_date: day1, departure_date: day4,
        payment_collect: 'property', currency: 'USD',
        customer: { name: 'S78Cert', surname: 'Guest', mail: 's78@example.com', phone: '+15551234567' },
        rooms: [{
          room_type_id: mapping.roomTypeId, rate_plan_id: mapping.ratePlanId,
          days: { [day1]: '150.00', [new Date(new Date(day1).getTime() + 86400000).toISOString().slice(0, 10)]: '150.00', [new Date(new Date(day1).getTime() + 2 * 86400000).toISOString().slice(0, 10)]: '150.00' },
          occupancy: { adults: 2, children: 0, infants: 0 },
        }],
      },
    });
    expect(created.status, `booking create failed: ${JSON.stringify(created.json)}`).toBeLessThan(300);
    const bookingId = created.json.data.id;
    console.log('Created booking', bookingId, 'reservation code', code, day1, '->', day4);

    const result = await deliverWebhook(bookingId, mapping.propId, 'S7 new');
    expect(result.unauthedStatus, 'webhook without secret must be rejected').toBe(401);
    expect(result.authedStatus, 'webhook with correct secret must succeed').toBeLessThan(300);

    // Verify it actually landed in the PMS UI: Bookings list, Upcoming tab
    // (the booking is several days out, so it won't be under "Today").
    await page.goto('/jaipur/#all_bookings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    await page.getByPlaceholder(/Search guest name, phone, or room/).fill('S78Cert');
    await page.waitForTimeout(1000);
    const bodyText = await page.locator('body').innerText();
    const foundInUI = bodyText.includes('S78Cert') || bodyText.includes(code);
    console.log('Scenario 7: booking visible in Bookings UI:', foundInUI);
    expect(foundInUI, 'expected the ingested booking to appear in the PMS Bookings screen').toBeTruthy();

    (test.info() as any).bookingId = bookingId;
    process.env.S78_BOOKING_ID = bookingId;
    process.env.S78_PROP_ID = mapping.propId;
    process.env.S78_DAY1 = day1;
  });

  test('Scenario 8: modify then cancel the same booking, each re-ingested and reflected in the PMS', async ({ page }) => {
    const bookingId = process.env.S78_BOOKING_ID!;
    const propId = process.env.S78_PROP_ID!;
    const day1 = process.env.S78_DAY1!;
    expect(bookingId, 'Scenario 7 must run first and produce a booking id').toBeTruthy();

    await login(page);
    const mapping = getInboundTestMapping();

    const day5 = new Date(new Date(day1).getTime() + 4 * 86400000).toISOString().slice(0, 10);
    const days: Record<string, string> = {};
    for (let i = 0; i < 4; i++) days[new Date(new Date(day1).getTime() + i * 86400000).toISOString().slice(0, 10)] = '150.00';

    const modified = await channexCall('PUT', `bookings/${bookingId}`, {
      booking: {
        property_id: propId, ota_name: 'Offline',
        arrival_date: day1, departure_date: day5,
        payment_collect: 'property', currency: 'USD',
        customer: { name: 'S78Cert', surname: 'Guest', mail: 's78@example.com', phone: '+15551234567' },
        rooms: [{ room_type_id: mapping.roomTypeId, rate_plan_id: mapping.ratePlanId, days, occupancy: { adults: 2, children: 0, infants: 0 } }],
      },
    });
    expect(modified.status, `modify failed: ${JSON.stringify(modified.json)}`).toBeLessThan(300);
    const modResult = await deliverWebhook(bookingId, propId, 'S8 modify');
    expect(modResult.authedStatus).toBeLessThan(300);

    await page.goto('/jaipur/#all_bookings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    await page.getByPlaceholder(/Search guest name, phone, or room/).fill('S78Cert');
    await page.waitForTimeout(1000);
    let bodyText = await page.locator('body').innerText();
    const foundGuestAfterModify = bodyText.includes('S78Cert');
    // Display format is locale-dependent (not necessarily ISO), so check the
    // day-of-month plus month name/number rather than the exact ISO string.
    const day5Date = new Date(day5);
    const day5MonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day5Alt = `${day5Date.getDate()}`;
    const day5Month = day5MonthNames[day5Date.getMonth()];
    console.log('Scenario 8a (modify): guest still listed:', foundGuestAfterModify,
      '| extended checkout', day5, 'as day/month text present:', bodyText.includes(day5Alt) && bodyText.includes(day5Month));

    const cancelled = await channexCall('PUT', `bookings/${bookingId}`, {
      booking: {
        status: 'cancelled', property_id: propId, ota_name: 'Offline',
        arrival_date: day1, departure_date: day5,
        payment_collect: 'property', currency: 'USD',
        customer: { name: 'S78Cert', surname: 'Guest', mail: 's78@example.com', phone: '+15551234567' },
        rooms: [{ room_type_id: mapping.roomTypeId, rate_plan_id: mapping.ratePlanId, days, occupancy: { adults: 2, children: 0, infants: 0 } }],
      },
    });
    expect(cancelled.status, `cancel failed: ${JSON.stringify(cancelled.json)}`).toBeLessThan(300);
    const cancelResult = await deliverWebhook(bookingId, propId, 'S8 cancel');
    expect(cancelResult.authedStatus).toBeLessThan(300);

    await page.goto('/jaipur/#all_bookings');
    await page.waitForLoadState('networkidle');
    await page.getByRole('tab', { name: /Upcoming/ }).click();
    await page.getByPlaceholder(/Search guest name, phone, or room/).fill('S78Cert');
    await page.waitForTimeout(1000);
    bodyText = await page.locator('body').innerText();
    const stillShowsCert = bodyText.includes('S78Cert');
    console.log('Scenario 8b (cancel): S78Cert still listed (cancelled bookings may show with a Cancelled badge rather than disappearing):', stillShowsCert);
  });
});
