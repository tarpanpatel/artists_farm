# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### PWA / Add to Home Screen App Installation
Add support for Progressive Web App (PWA) installation. When accessed on a mobile device or desktop browser, display a premium, non-intrusive prompt/notification to "Add to Home Screen" or "Install App". Clicking it will trigger the browser's native PWA installation flow.

### Plain-Language UI Text + Centralized Strings File
UI copy is currently hardcoded inline across ~52 component files (e.g. "Authorization Role" in StaffManagement.tsx), written in formal/jargon-y English that's unfriendly to staff who aren't fluent readers. Two-part effort:
1. **Extract to one file**: create `src/i18n/en.ts` - a flat, keyed strings object (e.g. `team_role: "Team Role"`) - and have components read from it instead of inlining text. Keyed (not just English-as-the-source) so a future `hi.ts` or similar can sit alongside it without a code rewrite, if translation is ever needed. No i18n library needed for now - single language, plain object, no added dependency.
2. **Reword toward plain English** as strings get extracted: "Authorization Role" -> "Team Role", and similar case-by-case simplifications flagged during the pass or from staff feedback.
Roll out phased, not as one big-bang pass: start with the screens staff touch daily (sidebar/nav, Guest Registration, Operational Dashboard), extract + reword those, then expand outward. Once the file exists, future wording tweaks are a one-line edit instead of a code hunt.

---
*Last Updated: August 2026*
