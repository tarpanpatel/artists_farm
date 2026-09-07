# OpenHands Microagent - GroundCode Resort PMS
# This tells OpenHands the key facts about your codebase so it
# automatically follows your rules when fixing any GitHub issue.

When working on issues in the GroundCode / Artists Farm PMS codebase, always follow these rules:

## Stack
- Frontend: React 18, TypeScript (strict), Vite, Tailwind CSS, Flowbite React
- Backend: PHP (REST API), MySQL (91 tables), PDO prepared statements
- Tests: Playwright (tests/e2e/)

## Critical Design Rules
1. Tab bars must always use attachedTabsTheme + attachedTabsClearTheme from src/utils/tabsTheme.ts. Never use custom pill/capsule tab bars.
2. Buttons must use src/components/Button.tsx with rounded-lg. Never rounded-full for action buttons.
3. Tooltips must use src/components/Popover.tsx. Never bare title="" HTML attributes or Tooltip components.
4. Loading spinner: CSS border-ring (border-[3px] border-blue-100 border-t-blue-500 rounded-full) with class loading-screen-spinner-spin. Never Lucide Loader2 icon.
5. Dark mode is OFF - do not add dark mode toggle logic. The dark: classes are already in the code but inert by design.
6. Delete buttons always use Trash2 icon (Lucide) with red tokens. Never swap to an X icon.

## File Locations
- Main router: src/App.tsx
- API entry: php/api/router.php
- Design system: DESIGN.md
- Project rules: CLAUDE.md

## Testing
After making fixes, run: npx tsc --noEmit -p tsconfig.json to verify TypeScript compiles cleanly.
