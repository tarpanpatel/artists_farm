# Task: Components calling useAuth() render outside AuthProvider and crash

**Repo:** `c:\xampp\htdocs\artists_farm` — this bug exists on **both**
`multi-tenant` and `channel-manager`. Fix it on `multi-tenant` (it is not
Channex-related and should not be stranded on a feature branch), then it can be
merged forward. Check with `git branch --show-current`.

**Read first:** `CLAUDE.md` (project rules — never touch production, don't commit
unless asked).

---

## The bug

Live on staging, reported by Telescope to the admin's phone 30 Aug 2026:

```
[js] Uncaught Error: Error: useAuth must be used within AuthProvider
origin: https://staging.ground-code.com/dist/assets/AuthContext-BCh38_xG.js:1:341
```

`useAuth()` throws when there is no provider above it
(`src/contexts/AuthContext.tsx:34`). `AuthProvider` wraps **only** the property
path, at the very last return of `App()`:

```tsx
// src/App.tsx:3176
return (
  <AuthProvider>
    <DataLoader>{(data) => <AppWithProviders preloadedData={data} />}</DataLoader>
  </AuthProvider>
);
```

Every earlier return in `App()` renders **without** it. At least four of those
render a component that calls `useAuth()`:

| Location | Component | Wrapped in |
|---|---|---|
| `src/App.tsx:3025` | `<LoginPage variant="management">` | nothing at all |
| `src/App.tsx:3101` | `<LoginPage variant="management">` | `ToastProvider` only |
| `src/App.tsx:3119` | `<LoginPage variant="management">` | `ToastProvider` only |
| `src/App.tsx:3038` | `<RootAdminDashboard>` | `ToastProvider` + `ConfirmDialogProvider` |

`LoginPage.tsx:18` calls `useAuth()` unconditionally:

```tsx
const { sessionMismatchNotice, clearSessionMismatchNotice } = useAuth();
```

So the management login screen — the page tenant owners and root admins sign in
through — throws on render. There is no `ErrorBoundary` on these branches, so it
blanks the page rather than degrading.

**This is not new and it is not from the Channel Manager work.** It came in with
commit `9f8827d7` ("Cross-tenant login gate"), which is on both branches.

**This exact class of bug has already happened once here.** Read the comment at
`src/App.tsx:3029-3034`: `AccountSettings` inside `RootAdminDashboard` called
`useToast()` on a branch with no `ToastProvider`, blanking the whole page. That
was fixed by adding a provider to that one branch. The same structural gap then
reappeared with `useAuth`. A fix that only patches today's four call sites will
let it happen a third time.

## What to do

Two parts. Do both.

**Part 1 — stop the crash.**

`sessionMismatchNotice` is `useState` local to `AuthProvider`
(`AuthContext.tsx:62`), set when the provider's own session check detects a
cross-tenant mismatch. It is a **property-path concept**. On the management and
root-admin screens there is no provider, no session check, and therefore no
notice to display — so wrapping those branches in a second `AuthProvider` just to
satisfy the hook would create a second, unrelated auth state. Prefer making the
dependency honestly optional:

- Add `useAuthOptional()` to `AuthContext.tsx` returning `useContext(AuthContext)`
  (i.e. `AuthContextValue | null`) **without** throwing.
- Have `LoginPage` use it and fall back safely — `sessionMismatchNotice` becomes
  `null`, `clearSessionMismatchNotice` a stable no-op. Note it is called at
  `LoginPage.tsx:67` and `:84`, so the no-op must be referentially stable (a
  module-level constant or `useCallback`), not a fresh arrow function each render.
- **Leave `useAuth()` itself strict.** A missing provider is normally a real bug
  and must stay loud. Only components that legitimately render on both sides of
  the provider boundary should use the optional hook.
- Check `RootAdminDashboard` separately — work out *what* it actually uses from
  `useAuth` and whether it genuinely needs a provider (it may want real auth
  state, unlike LoginPage). Say which you concluded and why. Do not just paste
  the optional hook everywhere to make errors stop.

**Part 2 — make the next one impossible to ship silently.**

Every branch of `App()` that returns JSX without going through
`AppWithProviders` is a place this recurs. Add an `ErrorBoundary` around those
returns so a missing provider degrades to a visible error instead of a blank
page, and reports to Telescope with a `section` name identifying the branch.

If you can see a cleaner structural fix — a single shared wrapper the
non-property branches all render through, so provider coverage stops being a
per-branch decision someone has to remember — propose it in your report rather
than building it unasked. That is a bigger refactor than this task.

## Verification

`tsc` passing proves nothing here; this is a runtime context error.

1. `npx tsc --noEmit -p tsconfig.json` clean, and `npm run build` succeeds.
2. **Actually load each of the four routes** and confirm no console error and no
   blank page:
   - the management login page while logged out
   - `/root_dashboard/` while logged out (hits `App.tsx:3025`)
   - `/root_dashboard/` while logged in as a platform admin
   - a tenant dashboard while logged out
3. Confirm the property path still works normally and the cross-tenant
   `sessionMismatchNotice` still appears where it is supposed to — the notice is
   the whole reason `LoginPage` reached for `useAuth`, so a fix that silently
   kills it has traded one bug for a quieter one. Say how you tested this.
4. Confirm no new `useAuth must be used within AuthProvider` entries appear in
   Telescope's JS portal (`/php/errors/`) after exercising the routes.

## Ground rules

- **Never touch production** (`ground-code.com`, `deploy.ps1`) under any
  circumstance.
- Don't commit or deploy unless asked.
- Do not widen `shouldLogError()`'s skip-list in `src/main.tsx` to hide this
  error. See `CLAUDE.md` — that list is for genuine environmental noise only, and
  suppressing real crash messages there is how the JS portal once showed zero
  errors while the app was crashing for users.

## Deliverable

Which routes you actually loaded and what you saw on each. If you could not
reach one (e.g. no platform-admin login available locally), say so plainly rather
than reporting it as passing.
