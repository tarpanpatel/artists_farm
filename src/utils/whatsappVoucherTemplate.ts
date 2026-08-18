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
👤 *Guest:* {guest_name}
🏠 *Unit / Room:* {room_name}
📅 *Check-In:* {checkin_date} from {checkin_time}
📅 *Check-Out:* {checkout_date} until {checkout_time}
👥 *Number of Guests:* {guest_count}
💰 *Room Tariff:* ₹{room_tariff}
💰 *Advance Paid:* ₹{advance_paid}
📍 *Address:* {address}
📞 *Contact:* {contact_phone}
🧭 *Google Maps:* {maps_link}
💳 *Pay via UPI:* {upi_id}
📝 *Notes:* {other_notes}
━━━━━━━━━━━━━━━━━
We look forward to welcoming you to {property_name}!`;

/**
 * Substitute {token} values into a template. Optional tokens (maps_link,
 * contact_phone by default) whose value is empty get their WHOLE LINE
 * dropped, rather than left showing e.g. "📍 *Location:* " with nothing
 * after it - most properties won't have filled these in yet.
 */
export function renderWhatsappVoucherTemplate(
  template: string,
  values: Record<string, string>,
  optionalTokens: string[] = [
    '{maps_link}',
    '{contact_phone}',
    '{checkin_time}',
    '{checkout_time}',
    '{upi_id}',
    '{address}',
    '{other_notes}',
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
