// Shared currency list for the property forms (Edit / Creation Wizard / Setup
// Wizard), which must stay in sync with each other - see the property-form
// parity rule. Kept deliberately short: these are the currencies this product
// realistically onboards in, not an ISO 4217 dump nobody scrolls through.
//
// INR stays first and is the default, since that is the whole existing tenant
// base. USD is second because Channex certification requires a USD test
// property (their automated log checkers match exact dollar values).
export interface CurrencyOption {
  value: string;
  label: string;
  symbol: string;
}

export const PROPERTY_CURRENCIES: CurrencyOption[] = [
  { value: 'INR', label: 'INR — Indian Rupee', symbol: '₹' },
  { value: 'USD', label: 'USD — US Dollar', symbol: '$' },
  { value: 'EUR', label: 'EUR — Euro', symbol: '€' },
  { value: 'GBP', label: 'GBP — Pound Sterling', symbol: '£' },
  { value: 'AED', label: 'AED — UAE Dirham', symbol: 'د.إ' },
  { value: 'AUD', label: 'AUD — Australian Dollar', symbol: 'A$' },
  { value: 'CAD', label: 'CAD — Canadian Dollar', symbol: 'C$' },
  { value: 'SGD', label: 'SGD — Singapore Dollar', symbol: 'S$' },
  { value: 'LKR', label: 'LKR — Sri Lankan Rupee', symbol: 'Rs' },
  { value: 'NPR', label: 'NPR — Nepalese Rupee', symbol: 'Rs' },
  { value: 'THB', label: 'THB — Thai Baht', symbol: '฿' },
];

export const PROPERTY_CURRENCY_OPTIONS = PROPERTY_CURRENCIES.map((c) => ({
  value: c.value,
  label: c.label,
}));

// The app still renders a hardcoded ₹ in ~286 places, so this is not yet a
// general-purpose formatter - it exists so anything NEW reads the property's
// real currency instead of adding a 287th hardcoded symbol. Falls back to the
// code itself for a currency not listed above rather than guessing a symbol.
export function currencySymbol(code?: string | null): string {
  if (!code) return '₹';
  const match = PROPERTY_CURRENCIES.find((c) => c.value === code.toUpperCase());
  return match ? match.symbol : code.toUpperCase();
}
