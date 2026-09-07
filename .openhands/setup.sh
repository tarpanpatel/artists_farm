#!/bin/bash
# .openhands/setup.sh - Runs before OpenHands starts on any issue.
# Gives the AI context about the project so it produces better fixes.

echo "=== GroundCode Resort PMS - OpenHands Setup ==="
echo "Stack: React 18 + TypeScript + Vite + Flowbite + PHP + MySQL"
echo ""

if [ -f "package.json" ]; then
  echo "[1/3] Installing Node.js dependencies..."
  npm ci --prefer-offline 2>/dev/null || npm install
fi

echo "[2/3] Project structure:"
echo "  src/components/  - React components (TypeScript)"
echo "  src/utils/       - Shared utilities (tabsTheme.ts, etc.)"
echo "  php/api/         - PHP REST endpoints (router.php is the entry point)"
echo "  php/billing/     - Billing/receipt logic"
echo "  php/kitchen/     - KDS kitchen display logic"
echo "  tests/e2e/       - Playwright end-to-end tests"

echo "[3/3] Key rules for this codebase:"
echo "  - Tab bars: use attachedTabsTheme from src/utils/tabsTheme.ts"
echo "  - Buttons: use src/components/Button.tsx (Flowbite, rounded-lg, never rounded-full)"
echo "  - Tooltips: use src/components/Popover.tsx - never bare title= attributes"
echo "  - Dark mode is intentionally disabled - do NOT re-enable"
echo "  - Loading spinner: CSS border-ring only (see custom.css), never Loader2 icon"
echo ""
echo "=== Setup complete ==="