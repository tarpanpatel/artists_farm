# Task: Go live on Channex production — checklist for when credentials arrive

**Repo:** `c:\xampp\htdocs\artists_farm` — branch **`channel-manager`**
(`git branch --show-current`; switch if needed).

**Read first:** `CLAUDE.md` (project rules), `CHANNEX_IMPLEMENTATION.md`, and
`php/config/channex_config.json` (gitignored, sandbox credentials live there now).

**Credentials:** `php/config/channex_config.json` — gitignored. Never commit it,
never print the key.

---

## Why this exists

Certification (self-cert + Channex's live screenshare review) is passed. Channex's
own docs (`pms-certification-tests.md`) say the next step is manual on their side:
*"we provide production credentials and the next steps for going live."* There is
no published production base URL — it only ever comes in that handoff. This file
is the checklist for the moment it arrives, written now while the investigation
is fresh rather than re-derived under time pressure later.

Two branches are relevant and easy to conflate — don't:
- **`channel-manager`** — where all Channex work happened (100+ commits), currently
  deployed to `staging.ground-code.com` via the deploy-panel.
- **`multi-tenant`** — what `deploy.ps1` actually ships to **production**
  (`ground-code.com`). It pushes/pulls `origin multi-tenant` by name, hardcoded.
  `channel-manager` has never been merged into it — production currently has
  **zero** Channex code.

A merge of `channel-manager` into `multi-tenant` was done as prep on
**`channel-manager-mt-merge`** (pushed to origin, not yet merged into either real
branch) — 6 conflicts resolved, `tsc --noEmit` clean (bar one pre-existing,
unrelated `LegalDrawer.tsx` unused-import error already on `channel-manager`'s own
tip), `npm run build` clean. Review that branch's diff against `multi-tenant`
before fast-forwarding it in; it will need a re-merge if either branch has moved
since 2 Sep 2026.

---

## Step 1 — Land the code on `multi-tenant`

```
git fetch origin
git checkout multi-tenant
git merge origin/channel-manager-mt-merge   # or re-merge channel-manager directly if it's moved on
```

Verify `npx tsc --noEmit` and `npm run build` clean before proceeding. Don't run
`deploy.ps1` yet — do that only once Step 2's config is in place on the server, or
the first production request will hit whatever `channex_config.json` (if any)
happens to already exist there.

## Step 2 — Swap the config on the production server

`php/config/channex_config.json` is gitignored — it's never touched by `git pull`,
so placing it once on the server survives every future deploy. On `~/ground-code.com`
via SSH (`deploy.ps1`'s `$SshHost`/`$SshPort`/`$SshUser`/`$SshKey`):

```json
{
    "_comment": "Channex.io PRODUCTION credentials. Gitignored - never commit.",
    "environment": "production",
    "base_url": "<from Channex's go-live email>",
    "api_key": "<from Channex's go-live email>",
    "webhook_secret": "<from Channex's go-live email, or generate one and register it in Step 4>",
    "webhook_callback_url": "https://ground-code.com/php/api/router.php?action=channex_webhook"
}
```

`webhook_callback_url` matters more than it looks: `ChannexAdapter::registerWebhook()`
only uses the `callback_url` argument if the caller passes one — otherwise it reads
this config key, and if that's *also* missing it silently falls back to a
**hardcoded staging URL** (`ChannexAdapter.php:151`). Skip this key and call Step 4
without an explicit `callback_url` param, and the production Channex account gets
registered to deliver bookings to staging instead — include it here, or always pass
`callback_url` explicitly in Step 4, not both left to chance.

Note: `environment` is documentation only — `ChannexClient.php`/`ChannexAdapter.php`
never branch on it, only `base_url` is functional. Don't rely on it as a safety
switch.

## Step 3 — Reset the property↔Channex mappings (easy to miss, silently wrong if skipped)

`channex_mappings` (`property_id`/`room_id` → `channex_property_id`/
`channex_room_type_id`/`channex_rate_plan_id`) currently holds **sandbox** UUIDs
from the certification account. `content_sync.php`'s sync is intentionally
idempotent — if a mapping row already has a `channex_property_id`, it reuses it
without re-checking the remote side exists. Swapping only the config leaves these
sandbox UUIDs in place, pointed at an account that no longer applies: every ARI
push after that will look like it's succeeding locally while 404ing (or worse,
silently no-op'ing) against the real Channex account.

Before/immediately after the credential swap, clear the mapping rows for whichever
properties are going live:

```sql
DELETE FROM channex_mappings WHERE property_id IN (<production property ids>);
```

Then re-run content sync from the ChannelManager UI (the "Sync" action that calls
`action=channex_content_sync`) for each — this recreates property/room
type/rate plan on the production Channex account and stores the new real UUIDs.

## Step 4 — Register the production webhook

No UI button exists for this (`TASK_CHANNEX_CERT_GAPS.md` flagged it as a nice-to-have
that was never built) — it's one POST:

```
POST https://ground-code.com/php/api/router.php?action=channex_register_webhook
  callback_url=https://ground-code.com/php/api/router.php?action=channex_webhook
  channex_property_id=<optional - omit for account-wide, or set per property if ChannexAdapter::registerWebhook requires it - check its signature>
```

The receiving endpoint (`action=channex_webhook`, `php/api/router.php` case
`'channex_webhook'`) checks the `X-Channex-Webhook-Secret` header against
`webhook_secret` in Step 2's config — make sure that value matches what gets
registered/what Channex sends.

Verify with a real HTTP round-trip, not an in-process call (this exact gap once
hid a real bug — see `TASK_CHANNEX_CERT_GAPS.md`): confirm `GET /webhooks` on
Channex's side now shows the registration, and that a POST to the endpoint without
the secret header returns 401.

## Step 5 — Confirm the outbox drain worker runs in production

The drain worker (`php/channex/worker_runner.php` / `ari_drain_worker.php`) needs
something to invoke it repeatedly in production the same way it does on staging —
confirm a cron entry (or equivalent scheduled task) exists on `~/ground-code.com`
before relying on live ARI pushes; if staging's cron was set up by hand during
development, it won't exist on the production checkout automatically.

## Step 6 — Smoke test before calling it live

Re-run (against production, real Channex production account) the same scenarios
the certification review covered: a rate/availability push reflects on the OTA
side within the expected window, a real inbound booking through the webhook
creates a guest row with `ack_status = 'ACKED'`, a modification and a cancellation
each round-trip correctly. Don't consider this done on "the config is swapped and
nothing errored" — that's exactly the state Step 3 warns silently looks fine while
being wrong.

---

## Open items noticed during the production-readiness pass (2 Sep 2026), not yet acted on

- `TASK_CHANNEX_*.md` files in the repo root are historical work-order docs from
  the certification push — worth a quick skim before Step 6 in case any left a
  task genuinely unresolved rather than just historical.
- `channex_register_webhook` has no frontend affordance — worth a small UI button
  in ChannelManager.tsx eventually so this isn't a manual curl step every time an
  environment's callback URL changes, per `TASK_CHANNEX_CERT_GAPS.md`'s original
  suggestion. Not blocking for a one-time production go-live.
