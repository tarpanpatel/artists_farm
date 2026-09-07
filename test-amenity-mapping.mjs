/**
 * Guards the OTA amenity mapping in src/utils/amenityCatalog.ts.
 *
 * Run: node test-amenity-mapping.mjs
 *
 * Three things can rot silently here, and all three are invisible in the UI
 * until a real import lands:
 *   1. An alias pointing at a catalog label that has since been reworded, so
 *      the imported amenity ticks nothing and reappears as a custom chip.
 *   2. An alias the slug pass already resolves, i.e. a second copy of the
 *      catalog growing inside the alias table.
 *   3. A real Airbnb constant nobody mapped, quietly landing in "Custom Added
 *      Amenities" instead of its own checkbox.
 *
 * The catalog is TSX-importing TypeScript, so it is bundled through esbuild
 * (already a Vite dependency) rather than reimplemented here - the point is to
 * test the shipped code, not a copy of it.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const workDir = mkdtempSync(join(tmpdir(), 'amenity-map-'));
const bundlePath = join(workDir, 'amenityCatalog.mjs');

try {
  // shell:true is required on Windows - Node refuses to spawn npx.cmd directly
  // (EINVAL) since the 18.20/20.12 .cmd-spawn hardening.
  execSync(
    `npx esbuild src/utils/amenityCatalog.ts --bundle --format=esm --platform=node ` +
    `--jsx=automatic --outfile="${bundlePath}" --log-level=error`,
    { stdio: 'inherit' }
  );
} catch {
  console.error('FAIL: could not bundle src/utils/amenityCatalog.ts');
  rmSync(workDir, { recursive: true, force: true });
  process.exit(1);
}

const {
  AMENITY_ALIASES,
  ALL_CATALOG_AMENITIES,
  ORPHAN_AMENITY_ALIASES,
  amenitySlug,
  normalizeAmenityLabel,
  normalizeAmenityList,
} = await import(pathToFileURL(bundlePath).href);

rmSync(workDir, { recursive: true, force: true });

const failures = [];
const notes = [];

// 1. Every alias must name a real catalog label.
if (ORPHAN_AMENITY_ALIASES.length) {
  failures.push(`Aliases pointing at labels the catalog no longer has:\n    ${ORPHAN_AMENITY_ALIASES.join('\n    ')}`);
}

// 2. No alias should duplicate what the slug pass already handles.
const catalogSlugs = new Set(ALL_CATALOG_AMENITIES.map((i) => amenitySlug(i.label)));
const redundant = Object.keys(AMENITY_ALIASES).filter((slug) => catalogSlugs.has(slug));
if (redundant.length) {
  failures.push(`Redundant aliases - the slug pass already resolves these:\n    ${redundant.join(', ')}`);
}

// 3. Real Airbnb amenity constants must land on a catalog label, not a custom
//    chip. Anything genuinely absent from the catalog is listed under
//    UNMAPPED_BY_DESIGN so a new gap shows up as a failure, not as silence.
const AIRBNB_KEYS = [
  'WIRELESS_INTERNET', 'WIFI', 'POCKET_WIFI', 'INTERNET',
  'AIR_CONDITIONING', 'CENTRAL_AIR_CONDITIONING', 'HEATING', 'CENTRAL_HEATING', 'CEILING_FAN',
  'TV', 'CABLE_TV', 'HDTV',
  'KITCHEN', 'KITCHENETTE', 'REFRIGERATOR', 'MINI_FRIDGE', 'MICROWAVE', 'TOASTER',
  'COOKING_BASICS', 'DISHES_AND_SILVERWARE', 'COFFEE_MAKER', 'HOT_WATER_KETTLE', 'DINING_TABLE',
  'WASHER', 'DRYER', 'IRON', 'HANGERS', 'BED_LINENS', 'EXTRA_PILLOWS_AND_BLANKETS',
  'ROOM_DARKENING_SHADES', 'DRYING_RACK_FOR_CLOTHING', 'CLOTHING_STORAGE',
  'HOT_WATER', 'HAIR_DRYER', 'SHAMPOO', 'CONDITIONER', 'BODY_SOAP', 'CLEANING_PRODUCTS',
  'BATHTUB', 'BIDET',
  'SMOKE_ALARM', 'SMOKE_DETECTOR', 'CARBON_MONOXIDE_ALARM', 'CARBON_MONOXIDE_DETECTOR',
  'FIRST_AID_KIT', 'FIRE_EXTINGUISHER', 'SECURITY_CAMERAS', 'EXTERIOR_SECURITY_CAMERAS',
  'DEDICATED_WORKSPACE', 'LAPTOP_FRIENDLY_WORKSPACE',
  'FREE_PARKING_ON_PREMISES', 'FREE_PARKING', 'FREE_STREET_PARKING',
  'PATIO_OR_BALCONY', 'GARDEN_OR_BACKYARD', 'OUTDOOR_FURNITURE', 'OUTDOOR_DINING_AREA',
  'POOL', 'CITY_SKYLINE_VIEW', 'GARDEN_VIEW',
  'SELF_CHECK_IN', 'KEYPAD', 'LOCKBOX', 'SMART_LOCK', 'PRIVATE_ENTRANCE',
  'LUGGAGE_DROPOFF_ALLOWED', 'LONG_TERM_STAYS_ALLOWED', 'ELEVATOR', 'CLEANING_AVAILABLE_DURING_STAY',
];

/** Airbnb keys the catalog deliberately has no item for. They stay as custom
 *  chips (never dropped); listing them here is the record of that decision. */
const UNMAPPED_BY_DESIGN = new Set([
  'DISHWASHER', 'HOT_TUB', 'GYM', 'BBQ_GRILL', 'BREAKFAST', 'LOCK_ON_BEDROOM_DOOR',
  'MOUNTAIN_VIEW', 'BEACH_ACCESS', 'PORTABLE_FANS', 'OVEN', 'STOVE', 'PETS_ALLOWED',
]);

const catalogLabels = new Set(ALL_CATALOG_AMENITIES.map((i) => i.label));
const unmapped = AIRBNB_KEYS.filter((k) => !catalogLabels.has(normalizeAmenityLabel(k)));
if (unmapped.length) {
  failures.push(`Airbnb constants that do NOT reach a catalog label:\n    ${unmapped.join(', ')}`);
}

for (const key of UNMAPPED_BY_DESIGN) {
  const label = normalizeAmenityLabel(key);
  if (catalogLabels.has(label)) {
    notes.push(`${key} now maps to "${label}" - remove it from UNMAPPED_BY_DESIGN.`);
  }
}

// 4. Behavioural checks that the shape of the whole thing still holds.
const cases = [
  ['WIRELESS_INTERNET', 'Wi-Fi', 'differing vocabulary resolves via the alias table'],
  ['AIR_CONDITIONING', 'Air conditioning', 'punctuation-only difference resolves with no alias'],
  ['ROOM_DARKENING_SHADES', 'Room-darkening shades', 'hyphenated label resolves'],
  ['LUGGAGE_DROPOFF_ALLOWED', 'Luggage drop-off allowed', 'dropoff vs drop-off resolves'],
  ['Air Conditioning', 'Air conditioning', 'an already-humanised legacy row still resolves'],
  ['DISHWASHER', 'Dishwasher', 'an unknown constant is humanised, never dropped'],
  ['BBQ area', 'BBQ area', 'owner-typed text is left exactly as written'],
  ['Jain food on request', 'Jain food on request', 'owner-typed prose is left alone'],
  ['', '', 'empty stays empty'],
];
for (const [input, expected, why] of cases) {
  const actual = normalizeAmenityLabel(input);
  if (actual !== expected) {
    failures.push(`normalizeAmenityLabel(${JSON.stringify(input)}) = ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)} (${why})`);
  }
}

// 5. De-duplication: two vocabularies for one amenity must collapse to one row.
const deduped = normalizeAmenityList(['WIFI', 'WIRELESS_INTERNET', 'Wi-Fi', 'AIR_CONDITIONING', 'Air conditioning']);
if (JSON.stringify(deduped) !== JSON.stringify(['Wi-Fi', 'Air conditioning'])) {
  failures.push(`Duplicate collapse failed: got ${JSON.stringify(deduped)}`);
}
if (normalizeAmenityList('not an array').length !== 0 || normalizeAmenityList(null).length !== 0) {
  failures.push('normalizeAmenityList must return [] for a non-array input');
}

const mappedCount = AIRBNB_KEYS.length - unmapped.length;
console.log(`Catalog items: ${ALL_CATALOG_AMENITIES.length} (${catalogSlugs.size} unique labels)`);
console.log(`Aliases: ${Object.keys(AMENITY_ALIASES).length}`);
console.log(`Airbnb constants covered: ${mappedCount}/${AIRBNB_KEYS.length}`);
for (const n of notes) console.log(`NOTE: ${n}`);

if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS');
