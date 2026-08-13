/**
 * Tenant welcome message: shown to Root Admin as a live preview when editing
 * the template, and used to build the WhatsApp share link after a tenant is
 * created. The actual rendering for the *email* itself happens server-side
 * (php/utils/welcome_template.php) using the identical template text and
 * variable syntax, kept in sync with this file - same "root admin may
 * customize, sensible default if they don't" shape as
 * whatsappVoucherTemplate.ts.
 */

export interface WelcomeTemplateVariable {
  token: string; // e.g. '{tenant_name}'
  label: string;
}

export const TENANT_WELCOME_VARIABLES: WelcomeTemplateVariable[] = [
  { token: '{tenant_name}', label: 'Tenant Name' },
  { token: '{login_url}', label: 'Login URL' },
  { token: '{username}', label: 'Username (Phone)' },
  { token: '{temp_passcode}', label: 'Temporary Passcode' },
];

export const DEFAULT_TENANT_WELCOME_TEMPLATE =
  `ðŸŽ‰ Welcome to Ground Code, {tenant_name}!

Your property management account is ready.

ðŸ”— Login: {login_url}
ðŸ“± Username (your phone number): {username}
ðŸ”‘ Temporary Passcode: {temp_passcode}

You'll be asked to set a new 6-digit passcode the first time you log in.

Need help? Just reply to this message.`;

export function renderTenantWelcomeTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  Object.entries(values).forEach(([key, val]) => {
    result = result.split(`{${key}}`).join(val ?? '');
  });
  return result;
}

