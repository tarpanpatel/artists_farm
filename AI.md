# Ground Code AI Assistant (AI.md)

This file documents the AI Chat Widget / AI Assistant's architecture and the decisions behind its
current evolution plan, so any future session (human or AI) can pick up where the last one left
off instead of re-deriving or re-deciding any of this from scratch.

## Two-tier architecture

1. **Offline rule-based intent engine** (`php/ai/offline_intent_engine.php`) - the default,
   free, zero-external-dependency engine. Pure PHP logic: no database, no session, no API calls.
   Table-driven and *scored*, not a fixed if/elseif chain - every phrase list in
   `getIntentTable()` is scored independently against the incoming message, and the
   highest-scoring intent wins regardless of table position (see that file's own top comment for
   the full "why scored, not first-match-wins" reasoning). Covers this app's whole real action
   surface: ~10 real actions (add booking, log expense, mark C-Form filed, request material,
   navigate to a page, ...) plus a handful of info-only queries (booking counts, C-Form guidance,
   tariff guidance, ...).
2. **Online providers** (Gemini / OpenAI / a custom OpenAI-compatible endpoint) - opt-in,
   configured via Root Admin → "AI Services Config" (`php/api/ai_config.php`, stored in
   `php/config/ai_config.json`). Real decision, dated 24 Aug 2026 (see `ai_assistant.php`'s own
   top comment): **offline is the default because online usage cost scales with traffic, and this
   app's action set is small/closed enough that a well-built offline matcher covers it without
   that ongoing cost.**

`php/api/ai_assistant.php` is the single real HTTP entry point for both: it does auth/session/
rate-limiting/RBAC, then either calls an online provider (if enabled + a real API key is present)
or falls through to the offline engine. `src/components/AIChatWidget.tsx` is the chat UI; its
"Offline Engine Active" badge reflects which path actually answered the last message.

## The Gemini trial-week plan (decided 24-25 Aug 2026)

**Why**: this app's realistic query space is finite - a hotel PMS/KDS has a bounded, closed set of
things a staff member would ever actually ask about, unlike a general-purpose assistant. So rather
than guessing at phrasings to hand-write into the offline engine, the plan is to run a real LLM
(Gemini) for about a week, let it answer live staff traffic, then **mine the real
question→answer pairs it produced afterward and convert the common/recurring ones into permanent
offline intents** in `getIntentTable()`. This is a one-time (or occasional) cost to permanently
widen the free engine's coverage, not a plan to run Gemini forever.

**Where the monitoring data lives**: Telescope Error Center (`/php/errors/`) → **`ai_chat`
portal**. Two log entries per message:
- `'AI Query'` - the raw incoming prompt, logged before any engine/provider has run.
- `'AI Outcome'` - the prompt again, which action type matched (or `'NONE'` if it fell through to
  a plain-text reply), whether it came from `offline` or an online `provider`, and (added 25 Aug
  2026 - this was missing and needed for the plan to actually work) **the real reply text**, up
  to 2000 chars. Without the reply text, review only ever showed "what was asked", never "what
  the AI actually said back" - the more important half for writing a matching offline reply.

Neither of these triggers a phone push notification (nor does `'AI Config Updated'`) - routine AI
chat usage isn't an error. `'Gemini Call Failed'` (a real provider-call failure, e.g. a bad/expired
key) still alerts correctly - see `php/errors/logger.php`'s `maybeSendWebPushAlert()`.

**How to graduate a real trial finding into permanent offline coverage**:
1. Open Telescope's `ai_chat` portal, find a real `'AI Outcome'` entry with `action_type: 'NONE'`
   (or a wrong/undesired action) and a good Gemini reply.
2. Find the intent in `getIntentTable()` that *should* have matched, and append one phrase (or an
   AND-group) to its `'phrases'` list - never add a new if-block, the whole file is intentionally
   one scored table. If nothing close exists, add a new intent block.
3. Add one covering row to `php/tests/test_ai_intents.php` so the phrasing is locked in by the
   test suite, not just caught by the next live user who happens to try it again.

## CURRENT STATUS (updated 25 Aug 2026): trial provider switched to OpenCode Zen, not Gemini

The trial week's actual provider ended up being **OpenCode Zen** (opencode.ai's model gateway),
not Gemini - same plan, different provider, per explicit user decision. `php/api/ai_assistant.php`
now has a real `'opencode_zen'` branch (OpenAI-compatible `/chat/completions` endpoint), and
`'opencode_zen'` is selectable in Root Admin → AI Services Config's provider dropdown.

**Model**: `big-pickle` - chosen after directly testing the real API with the account's own key
(not guessed): it's free (`"cost":"0"` on every response, no payment method needed) and gives
real, coherent, on-topic answers. Several other candidates either don't exist for this account
(`ModelError`), exist but need a payment method the account doesn't have (`gpt-5.5`/
`claude-sonnet-5`/`gemini-3.7-flash` all returned `CreditsError`), or were temporarily unavailable
upstream (`deepseek-v4-flash-free`). `GET https://opencode.ai/zen/v1/models` (with a valid key)
lists every model id actually available to a given account if a different one is wanted later.

**The API key itself is deliberately never set by an AI session** - the user enters it directly
into Root Admin → AI Services Config's own form (explicit instruction, 25 Aug 2026: "Can u not put
it in root dashboard [i.e. in code/config], so that i can update api keys myself and add other LLM
to replace this in future"). This is also just the correct security practice regardless - the key
never needs to touch a git commit or an AI session's hands at all this way. Whoever manages this
next should expect the config to already be self-service through that same form, no code change
needed to swap providers/keys.

The original Gemini plan's own historical blocker (documented before the provider switch, kept for
reference): `php/config/ai_config.json` had `"enabled": true, "provider": "gemini"` but an empty
`"api_key"` and no `GEMINI_API_KEY` env var - meaning it was silently falling through to the
offline engine the whole time despite looking "on". If Gemini is ever revisited, that's still the
first thing to check.

`php/api/ai_assistant.php` also documents (24 Aug 2026) that `recordGeminiUsage()`/the
`'usage_summary'` response field/AIChatWidget's matching usage display are all **temporary,
time-boxed code built specifically for this trial** - safe to delete once the trial is done and
online mode is switched back off, not meant as permanent infrastructure.

## Known limitation (why this plan exists at all)

The offline engine is a keyword/phrase matcher, not a real language model - it can only ever be as
good as its hand-written intent table. A genuinely novel question outside every known intent
always falls to the same generic capability-summary reply, regardless of what was actually asked.

**Fixed 25 Aug 2026** (reported live: "The offline ai is not able reply to simple questions"): a
pre-sales `visitor_product_info` intent (meant for an anonymous website visitor asking about
pricing/features - a caller that structurally can never reach this endpoint, since it requires a
logged-in session) had `'what is'` / `'tell me'` / `'about'` / `'how does'` as trigger phrases -
near-universal prefixes for real operational questions. This was hijacking ordinary staff
questions ("how does the c-form work", "what is the wifi password") into an irrelevant sales pitch
instead of a real answer or the honest fallback. See `offline_intent_engine.php`'s own comment on
that intent for the full story - a good example of exactly the kind of coverage gap this whole
Gemini-trial-and-mine-transcripts plan exists to keep finding and fixing.

## File index

| File | Role |
|---|---|
| `php/ai/offline_intent_engine.php` | The rule-based matcher itself - dependency-free, testable standalone |
| `php/tests/test_ai_intents.php` | Its test suite (66 cases as of 25 Aug 2026) |
| `php/ai/nav_menu_intents.php` | Auto-generates a "navigate to X" intent for every real `nav_menu_items` row |
| `php/api/ai_assistant.php` | The one real HTTP entry point - auth/session/rate-limit/RBAC, then dispatch to offline engine or an online provider |
| `php/api/ai_config.php` | Reads/writes `php/config/ai_config.json` (Root Admin's "AI Services Config") |
| `src/components/AIChatWidget.tsx` | The chat UI |
| `src/components/CronJobsManager.tsx` | Unrelated - do not confuse with the AI intent table; different Root Admin page |
| Telescope `ai_chat` portal (`/php/errors/`) | Where every query + outcome is logged for review |
