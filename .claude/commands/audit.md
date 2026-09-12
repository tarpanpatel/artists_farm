---
description: Audit one area of the site for real bugs and UI problems, then fix what's confirmed.
---

Audit this area of Ground Code for bugs and UI problems, then fix what you confirm:

**$ARGUMENTS**

If the line above is empty, ask me which area before doing anything else — do not
pick one yourself, and do not fall back to "the whole site".

## Scope it before you read anything

A whole-codebase sweep produces shallow, confident-sounding findings and misses
the real bugs. So first, state in one or two lines what you are treating as the
boundary — the files, the endpoints, and the user journey they serve — and
include the backend and frontend halves of that journey together. Most real bugs
in this repo live in the seam between them, not inside either one.

If what I named is too big to read completely, say so and propose a split into
runs, rather than sampling it.

## Ground rules

Read `CLAUDE.md` first, and `DESIGN.md` if the area has UI. Nearly every
recurring bug class here is already written down in one of them.

Hunt for failures a user would actually hit, ranked by what it costs them:
money that is wrong, data that is lost or corrupted, a screen that crashes or
silently renders empty, a lock or guard that does not hold. Style preferences
and hypothetical refactors are not findings.

Pay particular attention to the classes that have actually bitten this codebase
(the full list is in `.claude/agents/code-reviewer.md`), especially:
- totals re-derived from mutable config instead of stored when the transaction
  happened
- a shared endpoint widened to return a new kind of row, with existing consumers
  still assuming the old kind — check every `|| 1` / `|| default` fallback
- `toISOString()` used to mean "today"
- `fetchXFromDB()` swallowing an error as "no data"
- money paths not passing `$propertyId`, or writing outside a transaction
- context hooks used in an `App.tsx` branch that has no provider

## Verify before you claim

Do not report what you have not checked, and do not call anything clean without
saying what you ran. For each finding give the concrete failing input or state
and label it CONFIRMED (with how you verified) or PLAUSIBLE (with what you could
not rule out). A reproduction beats an argument.

Run `npx tsc --noEmit`, `npm run build`, and `php -l` on every PHP file you
touch. For a claim about DB rows or API behaviour, read it back — a 200 response
or a green toast is not evidence.

## UI

Check the code against `DESIGN.md` for real drift: padding scale, Flowbite-only
components, Flowbite icons (`lucide-react` is uninstalled — any import is a build
failure), the single spinner identity, drawer conventions, mobile layout at
~400px, and controls that are natively `disabled` where they should be greyed
but clickable.

You cannot see the rendered page. If a finding needs eyes, say so and ask me for
a screenshot, or ask for permission to drive the browser with Playwright — ask
every time, never assume it.

## Then fix

Fix what you confirmed, hardest-hitting first. Where a bug has a root cause
several symptoms share, fix the cause rather than each symptom.

Tell me plainly what you did NOT fix and why — anything you judged out of scope,
anything that needs my decision, anything a fix cannot recover retroactively.

Do not commit or deploy unless I ask. If another session has uncommitted work in
a file you need, leave that file alone and say so rather than sweeping it into
your changes.
