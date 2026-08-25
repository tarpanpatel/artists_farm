// One-off script: renders the exact Flowbite outline icon chosen for each
// lucide `data-lucide="..."` name still used in home.html/index3.html, to raw
// static SVG markup, so it can be inlined directly into those static HTML
// pages (removing the unpkg.com/lucide@latest runtime dependency). Not part
// of the app - run once via `npx tsx extract_icons.tsx`, output consumed by
// patch_landing_pages.mjs, then discarded.
import { renderToStaticMarkup } from 'react-dom/server';
import * as Outline from 'flowbite-react-icons/outline';
import fs from 'fs';

// data-lucide name -> Flowbite outline export name (verified to exist against
// the installed flowbite-react-icons package - see FlowbiteIcons.tsx for the
// same mapping philosophy used across the rest of the app).
const map: Record<string, string> = {
  'alert-triangle': 'ExclamationCircle',
  'arrow-right': 'ArrowRight',
  'banknote': 'Cash',
  'bar-chart-3': 'ChartLineUp',
  'bell-ring': 'BellActive',
  'bot': 'CodeFork',
  'building': 'Building',
  'camera': 'CameraPhoto',
  'check': 'Check',
  'check-circle': 'CheckCircle',
  'check-circle-2': 'CheckCircle',
  'coffee': 'MugHot',
  'eye-off': 'EyeSlash',
  'file-check': 'FileCheck',
  'filter': 'Filter',
  'gauge': 'ChartMixed',
  'help-circle': 'QuestionCircle',
  'home': 'Home',
  'layout-grid': 'Grid',
  'log-in': 'ArrowLeftToBracket',
  'message-circle': 'Messages',
  'message-square': 'Messages',
  'percent': 'SalePercent',
  'qr-code': 'QrCode',
  'send': 'PaperPlane',
  'shield': 'Shield',
  'shield-check': 'ShieldCheck',
  'smartphone': 'MobilePhone',
  'sparkles': 'WandMagicSparkles',
  'trees': 'Seedling',
  'user-check': 'UserCheck',
  'users': 'UsersGroup',
  'utensils': 'Utensils',
  'wallet': 'Wallet',
};

const out: Record<string, { markup: string; viaFallback?: boolean }> = {};
for (const [lucideName, flowbiteName] of Object.entries(map)) {
  const Comp = (Outline as any)[flowbiteName];
  if (!Comp) {
    console.error(`MISSING: ${lucideName} -> ${flowbiteName}`);
    continue;
  }
  const html = renderToStaticMarkup(
    // width/height/class deliberately omitted - the real <i> tag's own
    // class="w-4 h-4 ..." gets applied to the wrapping <svg> at splice time,
    // exactly like lucide.createIcons() used to copy it over.
    (Comp as any)({})
  );
  out[lucideName] = { markup: html };
}

fs.writeFileSync(
  new URL('./icon_svgs.json', import.meta.url),
  JSON.stringify(out, null, 2)
);
console.log(`Wrote ${Object.keys(out).length} icons`);
