# 🗺️ Artists Farm — Project Roadmap & TODO List

This document tracks identified bugs, pending backend API integrations, and upcoming feature enhancements across the **Artists Farm** SaaS Resort Management System. Completed items are removed once shipped — see git history (`git log -p ROADMAP.md`) for what's already been done and how.

---

## 🟢 Open Items

### Plain-Language UI Text + Centralized Strings File
UI copy is currently hardcoded inline across ~52 component files (e.g. "Authorization Role" in StaffManagement.tsx), written in formal/jargon-y English that's unfriendly to staff who aren't fluent readers. Two-part effort:
1. **Extract to one file**: `src/i18n/en.ts` - a flat, keyed strings object (e.g. `team_role: "Team Role"`) - components read from it instead of inlining text. Keyed (not just English-as-the-source) so a future `hi.ts` or similar can sit alongside it without a code rewrite, if translation is ever needed. No i18n library - single language, plain object, no added dependency.
2. **Reword toward plain English** as strings get extracted: "Authorization Role" -> "Team Role", "Current Resident Profile" -> "Guest Currently Staying", "KDS Queue" -> "Order Queue", and similar case-by-case simplifications flagged during each pass or from staff feedback.

Rolled out phased, not as one big-bang pass. Done so far - the three daily-use screens named as the starting point:
- ✅ Sidebar/nav (`Navigation.tsx`)
- ✅ Guest Registration (`GuestManagement.tsx`)
- ✅ Operational Dashboard (`OperationalDashboard.tsx`)

Remaining: expand outward to the other ~49 component files (StaffManagement.tsx's "Authorization Role" - the original motivating example - is still unconverted). Once a screen's strings are extracted, future wording tweaks on it are a one-line edit instead of a code hunt.

---
*Last Updated: August 2026*
