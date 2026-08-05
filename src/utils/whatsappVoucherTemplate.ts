/**
 * WhatsApp booking-confirmation voucher message: one shared default template +
 * substitution logic, used by both the tenant-facing editor (TenantDashboard)
 * and the actual "Share via WhatsApp" send (GuestManagement). A property's
 * `whatsapp_voucher_template` column overrides this; NULL/empty falls back to
 * DEFAULT_WHATSAPP_VOUCHER_TEMPLATE below - same "tenant may customize,
 * sensible default if they don't" shape as Telegram templates.
 */

export interface WhatsappVoucherVariable {
  token: string; // e.g. '{guest_name}'
  label: string;
  optional?: boolean; // true = line gets dropped entirely when the value is empty
}

export const WHATSAPP_VOUCHER_VARIABLES: WhatsappVoucherVariable[] = [
  { token: '{guest_name}', label: 'Guest Name' },
  { token: '{room_name}', label: 'Room / Unit' },
  { token: '{property_name}', label: 'Property Name' },
  { token: '{checkin_date}', label: 'Check-In Date' },
  { token: '{checkout_date}', label: 'Check-Out Date' },
  { token: '{guest_count}', label: 'Number of Guests' },
  { token: '{room_tariff}', label: 'Room Tariff (₹)' },
  { token: '{advance_paid}', label: 'Advance Paid (₹)' },
  { token: '{maps_link}', label: 'Google Maps Link', optional: true },
  { token: '{contact_phone}', label: 'Contact Phone', optional: true },
];

export const DEFAULT_WHATSAPP_VOUCHER_TEMPLATE =
  `🏨 *BOOKING CONFIRMATION VOUCHER*
━━━━━━━━━━━━━━━━
👤 *Guest:* {guest_name}
🏠 *Assigned Room:* {room_name}
📅 *Check-In:* {checkin_date}
📅 *Check-Out:* {checkout_date}
👥 *Number of Guests:* {guest_count}
💰 *Room Tariff:* ₹{room_tariff}
💰 *Advance Paid:* ₹{advance_paid}
📍 *Location:* {maps_link}
📞 *Contact:* {contact_phone}
━━━━━━━━━━━━━━━━
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
  optionalTokens: string[] = ['{maps_link}', '{contact_phone}']
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
