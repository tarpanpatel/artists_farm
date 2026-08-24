/**
 * Single source of truth for "is this guest's C-Form actually filed" - added 25 Aug 2026
 * after a live incident: a past booking showed a clean green "Filed" badge everywhere in
 * the app (BookingDetailsModal, BillingCheckout badges, the "requiring attention today"
 * pill, OperationalDashboard/TodayOverview's C-Form Pending alerts, the CSV export) despite
 * having an EMPTY confirmation number - because "Save C-Form" (BookingDetailsModal.tsx) had
 * no validation at all, and every one of those call sites only ever tested whether
 * `cFormFiledAt` was truthy, never whether there was any actual reference/document behind
 * it. `cFormFiledAt` being set is no longer sufficient proof by itself (it wasn't really
 * proof of anything before this fix either - just a timestamp of when someone checked a
 * box) - a guest only counts as genuinely filed once BOTH a filed timestamp AND a
 * confirmation number are on record.
 *
 * Every "is the C-Form filed / pending" check in the app should go through this instead of
 * re-testing `cFormFiledAt`/`c_form_filed_at` in isolation - grep for `cFormFiledAt` before
 * adding a new one, to catch call sites this migration might have missed.
 */
export function isCFormGenuinelyFiled(
  guest:
    | {
        cFormFiledAt?: string | null;
        c_form_filed_at?: string | null;
        cFormNumber?: string | null;
        c_form_number?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!guest) return false;
  const filedAt = guest.cFormFiledAt || guest.c_form_filed_at;
  const number = guest.cFormNumber || guest.c_form_number;
  return !!filedAt && !!(number && number.trim());
}
