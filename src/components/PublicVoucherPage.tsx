import React, { useEffect, useState } from 'react';
import { apiFetch, API_BASE } from '../services/api';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

/**
 * Guest-facing booking voucher, reachable at #voucher?token=<40 hex chars>
 * without any login. Added 7 Sep 2026.
 *
 * The token in the URL is the only credential (see php/api/public_voucher.php),
 * and it exists so the public identifier is never guests.id - a sequential id in
 * a public URL would let anyone walk every booking the tenant has.
 *
 * Deliberately its own page rather than a tab of PublicBookingEngine: that page
 * sells availability to a stranger, this one confirms a stay to somebody who has
 * already booked. They share no state, no data source and no purpose, and the
 * booking engine is already large enough to be worth not loading here.
 */

interface VoucherPayment {
  amount: number;
  method: string;
  received_at: string;
}

interface VoucherData {
  booking_id: number;
  guest_name: string;
  phone_number: string;
  status: string;
  checkin_date: string;
  checkout_date: string;
  checkin_time: string | null;
  checkout_time: string | null;
  unit_name: string;
  no_of_guests: number;
  adults: number;
  children: number;
  source: string | null;
  total: number;
  paid: number;
  balance: number;
  security_deposit: number;
  payments: VoucherPayment[];
  property: {
    name: string;
    address: string;
    phone: string;
    maps_link: string;
    house_rules: string;
    instructions: string;
    cancellation_policy: string;
    wifi_network: string;
    house_manual: string;
  };
}

const money = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const dateOnly = (v: string) => String(v || '').split(' ')[0].split('T')[0];

const nightsBetween = (a: string, b: string): number => {
  const x = new Date(dateOnly(a) + 'T00:00:00').getTime();
  const y = new Date(dateOnly(b) + 'T00:00:00').getTime();
  if (isNaN(x) || isNaN(y) || y <= x) return 0;
  return Math.round((y - x) / 86400000);
};

/** Read the token out of the hash, which is where a #voucher?token=… link puts it. */
export const getVoucherTokenFromUrl = (): string => {
  if (typeof window === 'undefined') return '';
  const hash = window.location.hash || '';
  const qs = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const fromHash = new URLSearchParams(qs).get('token');
  // Also accept a normal query string, so a link that survived a redirect which
  // dropped the fragment still resolves instead of showing "not valid".
  return (fromHash || new URLSearchParams(window.location.search).get('token') || '').trim();
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
    <h2 className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{title}</h2>
    {children}
  </section>
);

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span className="text-sm font-medium text-slate-900 dark:text-white text-right break-words">{value}</span>
  </div>
);

export const PublicVoucherPage: React.FC = () => {
  const [data, setData] = useState<VoucherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getVoucherTokenFromUrl();
    if (!token) {
      setError('This voucher link is missing its code.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch(`${API_BASE}?action=get_public_voucher&token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (json.status === 'success' && json.data) setData(json.data);
        else setError(json.message || 'This voucher link is not valid.');
      } catch {
        setError('Could not load this voucher. Please check your connection and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="w-8 h-8 rounded-full border-[3px] border-blue-100 border-t-blue-500 dark:border-slate-800 dark:border-t-blue-400 loading-screen-spinner-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Voucher unavailable</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            If you were sent this link by the property, please ask them to resend it.
          </p>
        </div>
      </div>
    );
  }

  const p = data.property;
  const nights = nightsBetween(data.checkin_date, data.checkout_date);
  const partyLabel = data.children > 0
    ? `${Math.max(0, data.no_of_guests - data.children)} adult${data.no_of_guests - data.children === 1 ? '' : 's'}, ${data.children} child${data.children === 1 ? '' : 'ren'}`
    : `${data.no_of_guests} guest${data.no_of_guests === 1 ? '' : 's'}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-6 px-4">
      <div className="max-w-lg mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 sm:p-6">
        <header className="text-center pb-4">
          <p className="text-2xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Booking confirmed</p>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white mt-1">{p.name}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Booking #{data.booking_id}</p>
        </header>

        <Section title="Your stay">
          <Row label="Guest" value={data.guest_name} />
          {data.unit_name && <Row label="Unit" value={data.unit_name} />}
          <Row
            label="Check-in"
            value={`${formatDateDDMMYYYY(dateOnly(data.checkin_date))}${data.checkin_time ? ` from ${data.checkin_time}` : ''}`}
          />
          <Row
            label="Check-out"
            value={`${formatDateDDMMYYYY(dateOnly(data.checkout_date))}${data.checkout_time ? ` until ${data.checkout_time}` : ''}`}
          />
          {nights > 0 && <Row label="Nights" value={String(nights)} />}
          <Row label="Party" value={partyLabel} />
        </Section>

        <Section title="Payment">
          <Row label="Total" value={money(data.total)} />
          <Row label="Paid" value={money(data.paid)} />
          {data.balance > 0 && (
            <Row
              label="Balance due"
              value={<span className="text-amber-700 dark:text-amber-400 font-bold">{money(data.balance)}</span>}
            />
          )}
          {data.security_deposit > 0 && (
            <Row label="Security deposit (refundable)" value={money(data.security_deposit)} />
          )}
          {data.payments.length > 1 && (
            <ul className="mt-2 space-y-0.5">
              {data.payments.map((pay, i) => (
                <li key={i} className="text-2xs text-slate-500 dark:text-slate-400">
                  {money(pay.amount)} on {formatDateDDMMYYYY(dateOnly(pay.received_at))}
                  {pay.method ? ` (${pay.method})` : ''}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {(p.address || p.phone || p.maps_link) && (
          <Section title="Getting there">
            {p.address && <Row label="Address" value={p.address} />}
            {p.phone && (
              <Row
                label="Phone"
                value={<a className="text-blue-600 dark:text-blue-400 hover:underline" href={`tel:${p.phone}`}>{p.phone}</a>}
              />
            )}
            {p.maps_link && (
              <a
                href={p.maps_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open in Google Maps →
              </a>
            )}
          </Section>
        )}

        {p.instructions && (
          <Section title="Before you arrive">
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.instructions}</p>
          </Section>
        )}

        {/* Policies live on the voucher itself rather than behind another link:
            a guest disputing a charge needs the terms that applied to their own
            booking, at the same URL, not a page the property can quietly edit
            out from under them. */}
        {p.house_rules && (
          <Section title="House rules">
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.house_rules}</p>
          </Section>
        )}

        {p.cancellation_policy && (
          <Section title="Cancellation policy">
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{p.cancellation_policy}</p>
          </Section>
        )}

        <footer className="border-t border-slate-200 dark:border-slate-700 mt-5 pt-3 text-center">
          <p className="text-2xs text-slate-400 dark:text-slate-500">
            Keep this link — it always shows the latest version of your booking.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default PublicVoucherPage;
