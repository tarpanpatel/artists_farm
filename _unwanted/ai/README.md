# AI Assistant — Archived 26 Aug 2026

Removed entirely from the working app at the user's explicit request ("remove AI chat feature, and
pull all its code from the app... There shouldn't be a single line of code related to AI in
working files of the app"). Planned to be rebuilt properly in future — see `ROADMAP.md` in the
repo root for the tracking entry. This folder exists so that future work doesn't start from zero;
it is **not** part of the working app and must never be required/imported from `php/` or `src/`
again while it lives here (see the deny-all `.htaccess` one level up).

For the full original architecture/design writeup (offline intent engine, the Gemini/OpenAI/
OpenCode Zen trial plan, RBAC per intent, etc.), read `AI.md` in this same folder — it was the
single source of truth for this feature and is preserved byte-for-byte.

## What's here, and where it came from

| Archived path (under this folder) | Original path in the app |
|---|---|
| `AI.md` | `AI.md` (repo root) |
| `php/ai/offline_intent_engine.php` | `php/ai/offline_intent_engine.php` |
| `php/ai/nav_menu_intents.php` | `php/ai/nav_menu_intents.php` |
| `php/api/ai_assistant.php` | `php/api/ai_assistant.php` |
| `php/api/ai_config.php` | `php/api/ai_config.php` |
| `php/config/ai_config.json` | `php/config/ai_config.json` (gitignored — holds the real API key; was never in git history, only in this one working copy) |
| `php/tests/test_ai_intents.php` | `php/tests/test_ai_intents.php` |
| `src/components/AIChatWidget.tsx` | `src/components/AIChatWidget.tsx` (the floating chat bubble UI) |
| `src/components/LocalLLMChat.tsx` | `src/components/LocalLLMChat.tsx` (already orphaned/unreferenced before this removal — found during the sweep, archived alongside the rest since it's the same feature family) |

## What was severed elsewhere (not moved here — these files serve other purposes too)

Restoring the feature means re-wiring these integration points, not just copying the files back:

- **`src/App.tsx`** — the `AIChatWidget` import, `isAIChatOpen` state, and its full render block
  (the `onNavigate`/`onOpenAddBooking`/`onOpenAddExpense`/`onOpenTelegramModal`/
  `onOpenAddServiceRequest` callback wiring) were removed. The seven `initialXxx` deep-link-prefill
  state variables that callback used to populate (`initialExpenseData`, `initialStaffMealName`,
  `initialEditStaffName`, `initialReqData`, `initialServiceRequestData`, `initialAddStaffData`,
  `initialNewMenuItemData`) were removed too — they were 100% exclusive to this feature (confirmed
  empirically: TypeScript flagged every one of their setters as unused the moment the chat widget's
  callback was deleted, since nothing else in the app ever wrote to them).
- **`src/components/Header.tsx`** — the "Help?" button (`onToggleAIChat` prop, its click handler)
  is gone. It had no purpose other than opening this chat.
- **`src/components/RootAdminDashboard.tsx`** — the entire "AI Services Config" sidebar section and
  its card (provider picker, API key field, custom Ollama endpoint, the online/offline toggle) is
  gone: `aiConfig`/`hasApiKeyByProvider`/`isSavingAiConfig` state, `handleToggleAiModeHeader`/
  `handleSaveAiConfig` handlers, the `'ai_services'` entry in `SectionType`/`VALID_SECTIONS`, and
  the whole JSX block.
- **`src/components/KitchenManagement.tsx`, `StaffManagement.tsx`, `ServiceRequestsManagement.tsx`,
  `PettyCashManagement.tsx`** — each had one or two deep-link "pre-fill this drawer from a chat
  command" `useEffect` blocks (with their own guard state, e.g. `appliedReqPrefill`,
  `appliedEditStaffName`) built exclusively for this feature. All removed, along with the
  `initialXxx` props that fed them and (in KitchenManagement) the synthetic `'kitchen_requisitions'`
  tab-routing key that existed only so the assistant's navigate action had something to target.
- **`php/errors/logger.php`** — `maybeSendWebPushAlert()`'s routine-noise allowlist no longer
  exempts `'AI Query'`/`'AI Outcome'`/`'AI Config Updated'` (the severities `ai_assistant.php`/
  `ai_config.php` used to log under portal `ai_chat`/`system`) from triggering a push notification,
  since nothing can log those severities any more. If rebuilding, re-add whatever this feature's
  routine (non-error) severities are back into that allowlist array, or every normal chat message
  will alert someone's phone like it's an error.

## Rebuilding later

- Read `AI.md` first — it documents the real architecture decisions (why offline-first, the RBAC
  model per intent, the provider trial-week plan) that took real iteration to get right; don't
  re-derive them from scratch.
- The deep-link prefill pattern (chat command → pre-filled, still-editable drawer, human always
  clicks the final "Save"/"Log Request"/etc. themselves) was a deliberate, repeated design choice
  across every integration point above — worth keeping if rebuilt, not just an implementation
  detail.
- Grep this repo's git history for `git log --all --oneline -- AI.md 'php/ai/*' 'php/api/ai_*.php'`
  to see the real build-up (including the 25 Aug 2026 OpenCode Zen provider switch and the 24 Aug
  RBAC-per-intent hardening) rather than assuming this archive is the only record.
