/**
 * WhatsApp booking-confirmation voucher message: one shared default template +
 * substitution logic, used by both the tenant-facing editor (TenantDashboard)
 * and the actual "Share via WhatsApp" send (GuestManagement). A property's
 * `whatsapp_voucher_template` column overrides this; NULL/empty falls back to
 * DEFAULT_WHATSAPP_VOUCHER_TEMPLATE below - same "tenant may customize,
 * sensible default if they don't" shape as Telegram templates.
 *
 * RESTORED 12 Sep 2026 - a same-day "two-message WhatsApp strategy" change had
 * overwritten this file's actual default template (not added alongside it),
 * silently dropping the {nights} line in the process, and rewired the whole
 * flow onto an automated backend send that would have failed for nearly every
 * real guest (sendWhatsAppDirectTextMessage() only works within 24h of the
 * CUSTOMER messaging first - a booking/check-in event is business-initiated).
 * The host sends this manually, and the mechanism for that already existed and
 * already worked (this file, GuestManagement's "Share Quote", and
 * BookingDetailsModal's "Share Preview") - restored verbatim from the commit
 * before that change (73057ac0^) rather than reconstructed from memory.
 *
 * Nights line removed again 12 Sep 2026 (this time deliberately, explicit
 * request: "No need to mention number of nights in any of the emails,
 * messages") - not a repeat of the accidental drop above. Check-in/check-out
 * dates already imply the stay length; don't re-add a {nights} display line
 * to either template without another explicit ask.
 */

/**
 * Pre-booking invite ("Make Booking" message), added 12 Sep 2026, this time built
 * on the manual send pattern that already works: a property-level
 * `whatsapp_make_booking_template` override falls back to this default, rendered
 * client-side, sent via a wa.me link a human presses - the same shape as
 * DEFAULT_WHATSAPP_VOUCHER_TEMPLATE below, never an automated backend API call
 * (see this file's own header comment for why that was tried and reverted the
 * same day).
 *
 * Deliberately tenant-agnostic - {address}/{maps_link}/{contact_phone} are real
 * tokens here, not hardcoded text. A property with specific hand-picked
 * directions (multiple map links, a named drop-off spot) writes that into its
 * OWN `whatsapp_make_booking_template` override, the same way one property's
 * confirmation voucher can carry that detail without putting it in the shipped
 * default every tenant inherits.
 *
 * {booking_link} is the one token every send of this message must supply a real
 * value for - it is NOT in renderWhatsappVoucherTemplate()'s optionalTokens list
 * on purpose. This message's entire point is the "confirm your booking" call to
 * action; a template that can silently render without it would violate
 * CLAUDE.md's "every WhatsApp message must carry an action link" rule invisibly,
 * exactly the class of bug that rule exists to prevent.
 */
export const DEFAULT_MAKE_BOOKING_TEMPLATE =
  `🏨 *MAKE YOUR BOOKING*
━━━━━━━━━━━━━━━━━
🏠 *Property:* {property_name}
🏡 *Unit / Room:* {room_name}
💰 *Room Tariff:* ₹{room_tariff} per night
━━━━━━━━━━━━━━━━━

📅 *CHECK-IN & CHECK-OUT*
• Check-in: {checkin_date} from {checkin_time}
• Check-out: {checkout_date} until {checkout_time}
👥 *Guests:* {guest_count}

📍 *Location:* {address}
🧭 *Google Maps:* {maps_link}

🚫 *CANCELLATION POLICY*
{cancellation_policy}

📞 *Questions? Call us:* {contact_phone}

━━━━━━━━━━━━━━━━━
Ready to book? Reply "YES" or click below to confirm your booking.
🔗 *Book Now:* {booking_link}`;

export const MAKE_BOOKING_TOKENS: string[] = Array.from(
  new Set(DEFAULT_MAKE_BOOKING_TEMPLATE.match(/\{[a-z_]+\}/g) || [])
);

export const DEFAULT_WHATSAPP_VOUCHER_TEMPLATE =
  `🏨 *BOOKING CONFIRMATION VOUCHER*
━━━━━━━━━━━━━━━━━
🔖 *Booking ID:* {booking_id}
👤 *Guest:* {guest_name}
📱 *Mobile:* {guest_phone}
🏠 *Unit / Room:* {room_name}
📅 *Check-In:* {checkin_date} from {checkin_time}
📅 *Check-Out:* {checkout_date} until {checkout_time}
👥 *Number of Guests:* {guest_count}
👨‍👩‍👧 *Party:* {guest_breakdown}
💰 *Room Tariff:* ₹{room_tariff}
💰 *Advance Paid:* ₹{advance_paid}
🧾 *Payments:* {payments_list}
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
🔗 *Your booking online:* {voucher_link}
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
    // Only present once a link has actually been minted for this booking - see
    // get_booking_voucher_link. A template keeping this line still sends fine
    // for a booking whose link was never generated.
    '{voucher_link}',
    // Booking-level money and identity (7 Sep 2026). All optional for the same
    // reason as the property fields above - a fully-paid booking should not
    // send "Balance Due: ₹0.00", and a property with no deposit configured
    // should not send a deposit line at all. The caller passes '' and the whole
    // line disappears.
    // Only rendered when children were actually recorded - "3 adults, 0
    // children" is noise, and a booking that never captured a split has
    // nothing honest to say here at all.
    // A booking whose payments were never itemised has nothing to list, and
    // a one-payment booking already said the amount on the Advance Paid line.
    '{payments_list}',
    '{guest_breakdown}',
    // A SINGLE (non-multi-key) property has only one unit, so "Unit / Room:
    // <property name>" just repeats the Property line above it - callers pass
    // '' here for a single property (12 Sep 2026, explicit request: "in
    // single property no need to have Unit/Room line") and this drops the
    // whole line rather than showing a blank room name.
    '{room_name}',
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
