# Task: Fix scenarios 3-5 (broken by the property rebuild) and cherry-pick the AuthProvider fix

**Repo:** `c:\xampp\htdocs\artists_farm` — branch `channel-manager` unless stated
otherwise (`git branch --show-current`).

**Read first:** `CLAUDE.md`, `TASK_CHANNEX_MAPPING_REGRESSION.md` (the property
rebuild this task's bug comes from), `TASK_AUTHPROVIDER_CRASH.md`.

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Task 1 — Scenarios 3, 4, 5 are broken by the property rebuild (verified, not hypothetical)

When the duplicate "Artists Farm Jaipur" properties were cleaned up, the
canonical property was deleted and recreated from scratch as
`3041823d-4456-4068-a9b1-bb3f7b8a2662`, with exactly **one** rate plan
(`b253a8d1-...`, "Standard Rate"). The old property (and its `Non-Refundable`
and `Weekend Special` rate plans) no longer exist.

`scratch/test_cert_scenario3.php`, `test_cert_scenario4.php`, and
`test_cert_scenario5.php` still hardcode the **old, now-deleted** rate plan
UUIDs:

```php
$RP_NRF = '4f8395a0-6ebf-4863-bd4f-5e1e58a189d9'; // Non-Refundable — deleted
$RP_WKD = 'ca663d80-206e-4251-8999-62ae06b99fe0'; // Weekend Special — deleted
```

Confirmed live: `GET /rate_plans?filter[property_id]=3041823d-4456-4068-a9b1-bb3f7b8a2662`
returns exactly 1 rate plan. These three scenarios explicitly require
**multiple rate plans** (per `CHANNEX_IMPLEMENTATION.md` §3), so this isn't
optional — do this before touching the test files:

1. Provision two more rate plans on the current property `3041823d-...`,
   under its existing room type (`28c503f9-...`): one "Non-Refundable", one
   "Weekend Special" (or reasonably equivalent names), same shape as the
   existing `POST /rate_plans` calls already in the codebase.
2. Update `test_cert_scenario3.php`, `4.php`, `5.php` with the new rate plan
   UUIDs.
3. **While you're in there**: consider having these tests resolve rate plan
   IDs by querying `GET /rate_plans?filter[property_id]=...` and matching by
   title, instead of hardcoding UUIDs. Hardcoded UUIDs are exactly what broke
   here, and the property will very plausibly get rebuilt again. Not
   mandatory, but flag if you don't do it and why.
4. **Actually run** scenarios 3, 4, and 5 (`php scratch/test_cert_scenario{3,4,5}.php`)
   and paste the verbatim output. Do not report pass/fail from reading the
   code — `test_cert_scenario2.php` already looked correct on inspection and
   still needed to actually be executed to confirm it. These three must be
   run for real, against the live sandbox, after the rate plans exist.

## Task 2 — Cherry-pick the AuthProvider crash fix onto `multi-tenant`

Still not done. Checked directly: `git show multi-tenant:src/contexts/AuthContext.tsx`
has zero occurrences of `useAuthOptional`. `TASK_AUTHPROVIDER_CRASH.md`
describes the bug and required fix in full — follow it there. Summary:

- `useAuth()` throws when there's no `AuthProvider` above it. The management
  login page and two `RootAdminDashboard` render paths in `App.tsx` have no
  provider and crash on `multi-tenant` today (confirmed live on staging via
  Telescope).
- Cherry-pick **only** the fix: `useAuthOptional()` in `AuthContext.tsx`,
  `LoginPage.tsx`'s use of it, and the `ErrorBoundary` wrapping in `App.tsx`.
  Nothing Channex-related — `multi-tenant` doesn't have `php/channex/`.
- Follow `TASK_AUTHPROVIDER_CRASH.md`'s own verification steps: load all four
  affected routes on `multi-tenant`, confirm no console error, confirm
  `sessionMismatchNotice` still works on the property path (that's the
  reason `LoginPage` needed `useAuth` in the first place — don't silently
  break it while fixing the crash).
- After cherry-picking, re-run `git show multi-tenant:src/contexts/AuthContext.tsx | grep useAuthOptional`
  yourself and paste the output — that's the check that caught this being
  undone last time.

## Ground rules

- **Verify against the live API/database and paste verbatim output.** Not a
  summary, not "should work" — the actual command and its actual result.
  This file exists because a prior "all scenarios verified" claim on this
  exact integration did not survive being checked (twice).
- Only cite a script as evidence if it exists and you ran it.
- Guard any new `require_once` of `php/channex/*` with `is_file()` +
  `function_exists()`.
- Do not delete existing comments.
- **Never touch production** (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.

## Deliverable

For Task 1: the new rate plan UUIDs, and the verbatim pass/fail output of all
three scenario scripts actually executed. For Task 2: confirmation
`useAuthOptional` exists on `multi-tenant` after the cherry-pick, plus what
you saw loading each of the four routes.
