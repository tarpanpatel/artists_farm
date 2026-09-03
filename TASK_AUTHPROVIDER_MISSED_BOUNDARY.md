# Task: One `ErrorBoundary` gap missed in the AuthProvider crash fix, and a full sweep to make sure it's the last one

**Repo:** `c:\xampp\htdocs\artists_farm` — branch `multi-tenant`
(`git branch --show-current`; switch if needed).

**Read first:** `TASK_AUTHPROVIDER_CRASH.md` (the original task) and commit
`8331358d` (the fix that was applied — `git show 8331358d`).

---

## What's missing

The AuthProvider crash fix (commit `8331358d`) added `ErrorBoundary`
wrapping around four render branches in `App.tsx` — "Root Admin Login",
"Root Admin Dashboard", "Management Login", "Root Login" — confirmed present
by inspection.

**A fifth `<LoginPage variant="management">` render site was missed**, around
`App.tsx:2969` (line number as of `multi-tenant` HEAD; may drift):

```tsx
if (isTenantDashboardPath || resolvedTenant) {
  if (!isSessionLoaded) {
    return <LoadingScreen message="Loading session..." />;
  }

  if (!userSession) {
    return <LoginPage variant="management" onLoginSuccess={handleLoginSuccess} />;  // <-- no ErrorBoundary
  }
  ...
```

This isn't an active crash today — `LoginPage` itself now uses
`useAuthOptional()` internally, so it won't throw here. But it defeats the
point of Part 2 of the original task ("make the next one impossible to ship
silently"): if anything rendered on this branch in the future calls
`useAuth()` unconditionally, there's nothing here to catch it, and the page
goes blank with no Telescope report — exactly the failure mode this whole
fix was written to prevent.

## Task

1. Wrap this return in an `ErrorBoundary`, consistent with the naming and
   `section` convention already used for the other four sites (something
   like `"Tenant Dashboard Login"` — pick a name that clearly identifies
   this branch in Telescope).
2. **Do a full sweep, not just this one spot.** The original task's own
   framing was "every branch of `App()` that returns JSX without going
   through `AppWithProviders`" — that was checked by grepping for
   `LoginPage`/`RootAdminDashboard` specifically, which is how this one got
   missed. Go through every early `return` in `App()` (before the final
   `AppWithProviders` return) and confirm each one is wrapped. List every
   branch you found and whether it already had a boundary or you added one.

## Verification

- Load the tenant-dashboard path while logged out (the specific branch this
  patches) and confirm the page renders normally, no console error.
- For any other unwrapped branch you find and fix, say which route/condition
  reaches it and confirm you loaded it too.
- `npx tsc --noEmit -p tsconfig.json` clean, `npm run build` succeeds.

## Ground rules

- Don't delete existing comments.
- Never touch production (`ground-code.com`, `deploy.ps1`).
- Don't commit or deploy unless asked.
- Report which branches you actually loaded and what you saw — "should be
  fine" is not verification, per the standing rule on this integration.

## Deliverable

The list of every early-return branch in `App()`, which already had an
`ErrorBoundary`, which didn't, and confirmation (route loaded, console
checked) for each one you touched.
