# Backup & Milestone Recovery Guide

## Restore Commands

```bash
# Restore to single-property milestone (before multi-property upgrade)
git checkout backup-single-property
```

```bash
# Alternative restore using tag (same point)
git checkout milestone-single-property
```

```bash
# List all available milestones
git tag --list
```

```bash
# Go back to latest (if you want to return)
git checkout main
```

## Saved Milestones

| Date | Tag / Branch | Description |
|------|-------------|-------------|
| 2026-07-28 | `style-audit-baseline-2026-07-28` | Style audit baseline |
| 2026-07-29 | `milestone-single-property` / `backup-single-property` | Single-property stable. Recipe Builder + BOM Stock Depletion Engine, Telegram notifications, searchable dropdowns, merged Create/Update user forms, Staff Advances ledger fix |
| 2026-07-29 (v2) | `milestone-single-property` (re-tagged) / `multi` / `db-purity` | Global Toast system (`ToastContext.tsx` + `ToastProvider`), PettyCash `useReducer` refactor + `FALLBACK_EXPENSES` removed, KitchenManagement POS categories + KDS helpers + Staff Meals reducer, AuditLogsView fragment fix |

## What's in `backup-single-property`

- Recipe Builder & BOM Stock Depletion Engine (PHP + frontend)
- Telegram notifications for all money transactions
- Searchable dropdowns (Inventory catalog, Recipe Builder ingredients, Dish selector)
- Merged Create/Update user forms with tabs
- Staff Advances now recorded to cash drawer + ledger
- All financial transactions traced to `financial_ledger`
