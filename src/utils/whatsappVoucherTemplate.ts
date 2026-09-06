/**
 * WhatsApp booking-confirmation voucher message: one shared default template +
 * substitution logic, used by both the tenant-facing editor (TenantDashboard)
 * and the actual "Share via WhatsApp" send (GuestManagement). A property's
 * `whatsapp_voucher_template` column overrides this; NULL/empty falls back to
 * DEFAULT_WHATSAPP_VOUCHER_TEMPLATE below - same "tenant may customize,
 * sensible default if they don't" shape as Telegram templates.
 */

export const DEFAULT_WHATSAPP_VOUCHER_TEMPLATE =
  `🏨 *BOOKING CONFIRMATION VOUCHER*
━━━━━━━━━━━━━━━━━
🔖 *Booking ID:* {booking_id}
👤 *Guest:* {guest_name}
📱 *Mobile:* {guest_phone}
🏠 *Unit / Room:* {room_name}
📅 *Check-In:* {checkin_date} from {checkin_time}
📅 *Check-Out:* {checkout_date} until {checkout_time}
🌙 *Nights:* {nights}
👥 *Number of Guests:* {guest_count}
👨‍👩‍👧 *Party:* {guest_breakdown}
💰 *Room Tariff:* ₹{room_tariff}
💰 *Advance Paid:* ₹{advance_paid}
💰 *Balance Due:* ₹{balance_due}
🔐 *Security Deposit (refundable):* ₹{security_deposit}
📍 *Address:* {address}
📞 *Contact / Phone:* {contact_phone}
🧭 *Google Maps:* {maps_link}
💳 *Pay via UPI:* {upi_id}
📷 *Payment QR Code:* {upi_qr_code_url}
📝 *Notes & Instructions:* {other_notes}
📶 *WiFi:* {wifi_network}
🔑 *WiFi Password:* {wifi_password}
🏡 *House Manual:* {house_manual}
━━━━━━━━━━━━━━━━━
We look forward to welcoming you to {property_name}!`;

/**
 * Every token the default template uses, in the order it uses them - shown as
 * the help text under the wording editor in PropertyEditForm. Derived from the
 * template itself rather than hand-listed, so the help can never drift from
 * what actually substitutes (7 Sep 2026).
 */
export const VOUCHER_TOKENS: string[] = Array.from(
  new Set(DEFAULT_WHATSAPP_VOUCHER_TEMPLATE.match(/\{[a-z_]+\}/g) || [])
);

/**
 * Substitute {token} values into a template. Optional tokens whose value is
 * empty get their WHOLE LINE dropped, rather than left showing empty labels.
 */
export function renderWhatsappVoucherTemplate(
  template: string,
  values: Record<string, string>,
  optionalTokens: string[] = [
    '{maps_link}',
    '{google_maps_link}',
    '{contact_phone}',
    '{property_phone}',
    '{phone}',
    '{checkin_time}',
    '{checkout_time}',
    '{upi_id}',
    '{upi_qr_code_url}',
    '{qr_code}',
    '{address}',
    '{property_address}',
    '{other_notes}',
    '{instructions}',
    // Optional like every other property-level detail: a property with no wifi
    // recorded drops the whole line rather than sending "WiFi:" with nothing
    // after it. Added 6 Sep 2026 with the Airbnb guest-info import.
    '{wifi_network}',
    '{wifi_password}',
    '{house_manual}',
    // Booking-level money and identity (7 Sep 2026). All optional for the same
    // reason as the property fields above - a fully-paid booking should not
    // send "Balance Due: ₹0.00", and a property with no deposit configured
    // should not send a deposit line at all. The caller passes '' and the whole
    // line disappears.
    // Only rendered when children were actually recorded - "3 adults, 0
    // children" is noise, and a booking that never captured a split has
    // nothing honest to say here at all.
    '{guest_breakdown}',
    '{guest_phone}',
    '{balance_due}',
    '{security_deposit}',
  ]
): string {
  const lines = template.split('\n');
  const keptLines = lines.filter((line) => {
    const isEmptyOptionalLine = optionalTokens.some(
      (token) => line.includes(token) && !values[token.slice(1, -1)]
    );
    return !isEmptyOptionalLine;
  });
  let result = keptLines.join('\n');
  Object.entries(values).forEach(([key, val]) => {
    result = result.split(`{${key}}`).join(val ?? '');
  });
  return result;
}

/**
 * Guest-facing arrival details that live on the property row and travel together
 * to the voucher (added 6 Sep 2026, imported from an Airbnb listing).
 *
 * Bundled as ONE prop rather than three, deliberately: `propertyInstructions`
 * alone already threads through 6 components and ~20 call sites (App.tsx ->
 * MultiKeyPropertyOverview -> OperationalDashboard/TodayOverview/BillingCheckout
 * -> GuestManagement -> BookingDetailsModal), and CLAUDE.md's "Props Threading"
 * note exists precisely because that fan-out is easy to get half-done. Three
 * separate props would have tripled the churn and the next guest-info field
 * would repeat it; one bundle costs a single line per call site and the field
 * after this needs no threading at all.
 */
export interface PropertyGuestInfo {
  wifiNetwork?: string;
  wifiPassword?: string;
  houseManual?: string;
}
