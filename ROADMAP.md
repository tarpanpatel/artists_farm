# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Needs Manual Verification

- **Telegram delivery on booking edits.** `update_guest` now diffs the
  pre-update row and pings the property's Admin Telegram channel with the
  changed fields (see `php/guests/guests.php`) - verified the diff logic
  runs cleanly and doesn't break the save (edited/reverted a live guest name
  with no errors), but actual message delivery to Telegram wasn't confirmed
  from this session (no visibility into the bot/chat from here). Same open
  question for the pre-existing new-booking and ID-upload notifications this
  pattern was copied from. Check the property's actual Admin Telegram chat
  after an edit to confirm the message arrives and reads correctly.

### Dark Mode Toggle — Revisit After 1 Week

- Dark mode toggle is **temporarily disabled** in the header. The toggle
  button is visible but non-functional, and `onToggleDarkMode` is a no-op.
  Revisit after **one week** to decide whether to re-enable the toggle or
  remove it entirely. Do not merge any dark-mode theme changes until then.

---

*Last Updated: August 2026*
