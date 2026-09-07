import React from 'react';
import { humanizeKey } from './humanizeKey';
import {
  Wifi,
  Snowflake,
  Tv,
  Bath,
  ShowerHead,
  Bed,
  BedDouble,
  Coffee,
  Utensils,
  ChefHat,
  WashingMachine,
  Refrigerator,
  Microwave,
  Fan,
  Car,
  ParkingCircle,
  Dumbbell,
  Waves,
  Flame,
  Droplet,
  Plug,
  Speaker,
  Sofa,
  Shirt,
  Toilet,
  Umbrella,
  Leaf,
  Lightbulb,
  Laptop,
  Monitor,
  Gamepad2,
  BookOpen,
  Camera,
  Wind,
  Home,
  Package,
  KeyRound,
  ShieldCheck,
  Music,
  Sun,
  Armchair,
  Check,
  Building,
} from '../components/icons/FlowbiteIcons';

export interface AmenityItem {
  id: string;
  label: string;
  description?: string;
  category: string;
}

export interface AmenityCategory {
  id: string;
  name: string;
  iconName?: string;
  items: AmenityItem[];
}

export const AMENITY_CATEGORIES: AmenityCategory[] = [
  {
    id: 'popular',
    name: 'Popular & Essentials',
    items: [
      { id: 'wifi', label: 'Wi-Fi', description: 'Available throughout the property', category: 'popular' },
      { id: 'air_conditioning', label: 'Air conditioning', description: 'Split-type ductless or central cooling', category: 'popular' },
      { id: 'kitchen', label: 'Kitchen', description: 'Space where guests can cook their own meals', category: 'popular' },
      { id: 'free_parking_on_premises', label: 'Free parking on premises', description: 'Private on-site parking spot', category: 'popular' },
      { id: 'free_street_parking', label: 'Free on-street parking', description: 'Parking on a nearby street that’s free of charge', category: 'popular' },
      { id: 'dedicated_workspace', label: 'Dedicated workspace', description: 'A desk or table with comfortable chair', category: 'popular' },
      { id: 'tv', label: 'TV', description: 'HDTV with cable or streaming apps', category: 'popular' },
      { id: 'hot_water', label: 'Hot water', description: 'Water from sink and shower hot enough for washing', category: 'popular' },
      { id: 'essentials', label: 'Essentials', description: 'Towels, bed sheets, soap, and toilet paper', category: 'popular' },
      { id: 'bed_linen', label: 'Bed linen', description: 'Clean bed sheets, duvet, and pillowcases', category: 'popular' },
    ],
  },
  {
    id: 'bathroom',
    name: 'Bathroom',
    items: [
      { id: 'hot_water_bath', label: 'Hot water', description: 'Geyser or boiler with instant hot water', category: 'bathroom' },
      { id: 'hair_dryer', label: 'Hairdryer', description: 'Hairdryer provided in room', category: 'bathroom' },
      { id: 'shampoo', label: 'Shampoo', description: 'Hair shampoo and conditioner', category: 'bathroom' },
      { id: 'body_soap', label: 'Body soap', description: 'Shower gel and body soap', category: 'bathroom' },
      { id: 'cleaning_products', label: 'Cleaning products', description: 'Basic cleaning supplies on hand', category: 'bathroom' },
      { id: 'shower', label: 'Shower', description: 'Private walk-in shower', category: 'bathroom' },
      { id: 'bathtub', label: 'Bathtub', description: 'Full-size soaking bathtub', category: 'bathroom' },
      { id: 'bidet', label: 'Bidet / Health faucet', description: 'Bidet spray installed in toilet', category: 'bathroom' },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom & Laundry',
    items: [
      { id: 'washing_machine', label: 'Washing machine', description: 'In unit or on premises for laundry', category: 'bedroom' },
      { id: 'dryer', label: 'Dryer', description: 'Clothes dryer available', category: 'bedroom' },
      { id: 'iron', label: 'Iron & Ironing board', description: 'Iron provided for clothing', category: 'bedroom' },
      { id: 'hangers', label: 'Hangers', description: 'Clothes hangers in closet', category: 'bedroom' },
      { id: 'extra_pillows_blankets', label: 'Extra pillows and blankets', description: 'Available in the wardrobe', category: 'bedroom' },
      { id: 'room_darkening_shades', label: 'Room-darkening shades', description: 'Curtains to block outside daylight', category: 'bedroom' },
      { id: 'clothes_drying_rack', label: 'Clothes drying rack', description: 'Foldable rack to air dry laundry', category: 'bedroom' },
      { id: 'wardrobe', label: 'Wardrobe / Closet', description: 'Space for hanging and folded clothes', category: 'bedroom' },
    ],
  },
  {
    id: 'heating_cooling',
    name: 'Heating & Cooling',
    items: [
      { id: 'ac_unit', label: 'Air conditioning', description: 'Split-type ductless cooling system', category: 'heating_cooling' },
      { id: 'ceiling_fan', label: 'Ceiling fan', description: 'Overhead cooling fan', category: 'heating_cooling' },
      { id: 'heating', label: 'Heating', description: 'Room heater or central heating', category: 'heating_cooling' },
    ],
  },
  {
    id: 'safety',
    name: 'Home Safety',
    items: [
      { id: 'smoke_alarm', label: 'Smoke alarm', description: 'Smoke detector installed', category: 'safety' },
      { id: 'carbon_monoxide_alarm', label: 'Carbon monoxide alarm', description: 'CO alarm installed', category: 'safety' },
      { id: 'first_aid_kit', label: 'First aid kit', description: 'Emergency medical kit on site', category: 'safety' },
      { id: 'fire_extinguisher', label: 'Fire extinguisher', description: 'Serviced extinguisher on premises', category: 'safety' },
      { id: 'security_cameras', label: 'Security cameras on property', description: 'Exterior security camera present', category: 'safety' },
    ],
  },
  {
    id: 'internet_office',
    name: 'Internet & Office',
    items: [
      { id: 'fast_wifi', label: 'Wi-Fi', description: 'High-speed wireless internet', category: 'internet_office' },
      { id: 'desk_workspace', label: 'Dedicated workspace', description: 'Desk with ergonomic chair and plug point', category: 'internet_office' },
      { id: 'power_backup', label: 'Power backup / Inverter', description: 'Uninterrupted power during outages', category: 'internet_office' },
    ],
  },
  {
    id: 'kitchen_dining',
    name: 'Kitchen & Dining',
    items: [
      { id: 'full_kitchen', label: 'Kitchen', description: 'Space where guests can cook meals', category: 'kitchen_dining' },
      { id: 'refrigerator', label: 'Refrigerator', description: 'Full size or mini fridge with freezer', category: 'kitchen_dining' },
      { id: 'microwave', label: 'Microwave', description: 'Microwave oven for quick reheating', category: 'kitchen_dining' },
      { id: 'cooking_basics', label: 'Cooking basics', description: 'Pots and pans, oil, salt, and pepper', category: 'kitchen_dining' },
      { id: 'dishes_silverware', label: 'Crockery and cutlery', description: 'Plates, bowls, cups, cutlery, and utensils', category: 'kitchen_dining' },
      { id: 'electric_kettle', label: 'Electric kettle', description: 'Kettle for tea and instant coffee', category: 'kitchen_dining' },
      { id: 'coffee_maker', label: 'Coffee maker', description: 'Coffee machine or French press', category: 'kitchen_dining' },
      { id: 'dining_table', label: 'Dining table', description: 'Table with comfortable seating for meals', category: 'kitchen_dining' },
      { id: 'toaster', label: 'Toaster', description: 'Bread toaster', category: 'kitchen_dining' },
    ],
  },
  {
    id: 'outdoor',
    name: 'Outdoor & Views',
    items: [
      { id: 'balcony_patio', label: 'Patio or balcony', description: 'Private attached outdoor terrace or balcony', category: 'outdoor' },
      { id: 'garden_backyard', label: 'Garden / Backyard', description: 'Lush green lawn or private courtyard', category: 'outdoor' },
      { id: 'outdoor_dining', label: 'Outdoor dining area', description: 'Outdoor dining table and seating', category: 'outdoor' },
      { id: 'outdoor_furniture', label: 'Outdoor furniture', description: 'Seating to relax in open air', category: 'outdoor' },
      { id: 'swimming_pool', label: 'Swimming pool', description: 'Private or shared swimming pool', category: 'outdoor' },
      { id: 'city_view', label: 'City skyline view', description: 'View overlooking the city', category: 'outdoor' },
      { id: 'garden_view', label: 'Garden view', description: 'Scenic views of the garden or greenery', category: 'outdoor' },
    ],
  },
  {
    id: 'services',
    name: 'Services & Facilities',
    items: [
      { id: 'self_check_in', label: 'Self check-in', description: 'Keypad, lockbox, or smart lock entry', category: 'services' },
      { id: 'luggage_dropoff', label: 'Luggage drop-off allowed', description: 'Drop off bags early or store after checkout', category: 'services' },
      { id: 'long_term_stays', label: 'Long-term stays allowed', description: 'Stays of 28 days or more permitted', category: 'services' },
      { id: 'private_entrance', label: 'Private entrance', description: 'Separate street or building entrance', category: 'services' },
      { id: 'elevator', label: 'Elevator / Lift', description: 'Wheelchair-friendly elevator in building', category: 'services' },
      { id: 'housekeeping', label: 'Housekeeping available', description: 'Daily or on-demand cleaning service', category: 'services' },
    ],
  },
];

export const ALL_CATALOG_AMENITIES: AmenityItem[] = AMENITY_CATEGORIES.flatMap((c) => c.items);

const AMENITY_ICON_EXACT: Record<string, React.FC<{ className?: string }>> = {
  WIFI: Wifi,
  WIRELESS_INTERNET: Wifi,
  AIR_CONDITIONING: Snowflake,
  AC: Snowflake,
  TV: Tv,
  CABLE_TV: Tv,
  KITCHEN: ChefHat,
  WASHER: WashingMachine,
  WASHING_MACHINE: WashingMachine,
  DRYER: WashingMachine,
  PARKING: ParkingCircle,
  FREE_PARKING: ParkingCircle,
  FREE_PARKING_ON_PREMISES: ParkingCircle,
  FREE_ON_STREET_PARKING: ParkingCircle,
  HOT_TUB: Waves,
  POOL: Waves,
  SWIMMING_POOL: Waves,
  GYM: Dumbbell,
  ELEVATOR: Building,
};

const AMENITY_ICON_RULES: Array<[string[], React.FC<{ className?: string }>]> = [
  [['WIFI', 'WIRELESS', 'INTERNET'], Wifi],
  [['AIR_CONDITION', 'AIRCON', 'AC_UNIT', 'COOLING'], Snowflake],
  [['SMOKE', 'CARBON_MONOXIDE', 'ALARM', 'EXTINGUISHER', 'FIRST_AID', 'SAFETY', 'SECURE'], ShieldCheck],
  [['HEAT', 'FIREPLACE', 'GEYSER', 'WATER_HEATER'], Flame],
  [['TV', 'TELEVISION', 'NETFLIX', 'CABLE'], Tv],
  [['HAIR_DRYER', 'HAIRDRYER'], Wind],
  [['WASHER', 'WASHING', 'LAUNDRY', 'DRYER'], WashingMachine],
  [['REFRIGERATOR', 'FRIDGE', 'FREEZER'], Refrigerator],
  [['MICROWAVE', 'OVEN', 'TOASTER'], Microwave],
  [['COFFEE', 'TEA', 'KETTLE'], Coffee],
  [['KITCHEN', 'STOVE'], ChefHat],
  [['DISHES', 'SILVERWARE', 'CUTLERY', 'UTENSIL', 'COOKING'], Utensils],
  [['BATHTUB', 'BATH'], Bath],
  [['SHOWER'], ShowerHead],
  [['TOILET', 'BIDET'], Toilet],
  [['BEACH', 'POOL', 'LAKE', 'OCEAN', 'HOT_TUB', 'JACUZZI', 'WATERFRONT'], Waves],
  [['LINEN', 'BEDDING', 'PILLOW', 'BLANKET', 'MATTRESS'], Bed],
  [['BED'], BedDouble],
  [['PARKING', 'GARAGE'], ParkingCircle],
  [['CAR', 'TRANSPORT', 'AIRPORT'], Car],
  [['GYM', 'FITNESS', 'EXERCISE'], Dumbbell],
  [['FAN', 'CEILING_FAN'], Fan],
  [['DESK', 'WORKSPACE', 'LAPTOP'], Laptop],
  [['MONITOR', 'PROJECTOR'], Monitor],
  [['GAME', 'CONSOLE', 'PLAYSTATION', 'XBOX'], Gamepad2],
  [['BOOK', 'READING', 'LIBRARY'], BookOpen],
  [['SOUND', 'SPEAKER', 'STEREO', 'BLUETOOTH'], Speaker],
  [['MUSIC', 'PIANO', 'GUITAR'], Music],
  [['SOFA', 'LOUNGE', 'LIVING'], Sofa],
  [['CHAIR', 'SEATING', 'PATIO', 'BALCONY', 'TERRACE'], Armchair],
  [['HANGER', 'CLOSET', 'WARDROBE', 'IRON', 'CLOTH'], Shirt],
  [['SHAMPOO', 'SOAP', 'TOILETRIES', 'ESSENTIAL'], Droplet],
  [['WATER', 'DRINKING'], Droplet],
  [['GARDEN', 'PLANT', 'BACKYARD', 'OUTDOOR'], Leaf],
  [['LIGHT', 'LAMP'], Lightbulb],
  [['POWER', 'CHARGER', 'SOCKET', 'OUTLET', 'BACKUP', 'INVERTER'], Plug],
  [['UMBRELLA', 'RAIN'], Umbrella],
  [['CAMERA', 'CCTV'], Camera],
  [['LOCK', 'KEYPAD', 'SELF_CHECK', 'ENTRANCE', 'ACCESS'], KeyRound],
  [['BREAKFAST', 'MEAL', 'FOOD'], Coffee],
  [['SUN', 'VIEW', 'GARDEN_VIEW', 'SKYLINE'], Sun],
  [['STORAGE', 'LUGGAGE'], Package],
  [['HOME', 'HOUSE', 'PRIVATE'], Home],
];

export const getAmenityIcon = (key: string): React.FC<{ className?: string }> => {
  const k = (key || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (AMENITY_ICON_EXACT[k]) return AMENITY_ICON_EXACT[k];
  for (const [needles, Icon] of AMENITY_ICON_RULES) {
    if (needles.some((n) => k.includes(n))) return Icon;
  }
  return Check;
};

/* ---------------------------------------------------------------------------
 * OTA vocabulary -> catalog labels (7 Sep 2026)
 *
 * An Airbnb import writes the listing's own amenity constants
 * (WIRELESS_INTERNET, DISHES_AND_SILVERWARE, ...) straight into
 * properties.amenities - see proposeAirbnbRoomConfig() in php/api/router.php,
 * which json_encodes $amenityKeys verbatim. AmenitiesSelectModal decides what
 * is ticked by comparing lowercased LABELS, so an imported vocabulary never
 * lines up with the catalog on its own and every amenity lands in "Custom
 * Added Amenities" instead of lighting up its real checkbox.
 *
 * Two layers fix that, in this order:
 *
 *   1. amenitySlug() strips case and every non-alphanumeric run, so the whole
 *      punctuation class of mismatch resolves with no table at all:
 *      AIR_CONDITIONING / "Air Conditioning" / "air-conditioning" all collapse
 *      onto the catalog's own "Air conditioning". That covers most keys.
 *   2. AMENITY_ALIASES below only has to carry the cases where the two
 *      vocabularies genuinely disagree (WIRELESS_INTERNET vs "Wi-Fi",
 *      BED_LINENS vs "Bed linen"). Keeping it to real disagreements is what
 *      stops it becoming a second copy of the catalog that drifts.
 *
 * Deliberately on the frontend, not in router.php's import: the catalog labels
 * this maps ONTO live in this file, so an alias table anywhere else would be a
 * second source of truth that silently rots the next time a label is reworded.
 * The import drawer normalises before it POSTs, so what reaches the database is
 * already canonical and no consumer needs to know this map exists.
 */

/** "Wi-Fi" / "WIRELESS_INTERNET" / "air-conditioning" -> a comparable key. */
export const amenitySlug = (s: string): string =>
  (s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/**
 * Alias slug -> exact catalog label. Only entries the slug pass CANNOT already
 * resolve belong here; a key that humanises straight onto its label (HOT_WATER,
 * FIRST_AID_KIT, PATIO_OR_BALCONY) must not be listed, or this grows into a
 * duplicate catalog. Every value is asserted against a real catalog label by
 * ORPHAN_AMENITY_ALIASES below.
 */
export const AMENITY_ALIASES: Record<string, string> = {
  // Internet & workspace
  wifi: 'Wi-Fi',
  wireless_internet: 'Wi-Fi',
  internet: 'Wi-Fi',
  pocket_wifi: 'Wi-Fi',
  fast_wifi: 'Wi-Fi',
  high_speed_wifi: 'Wi-Fi',
  laptop_friendly_workspace: 'Dedicated workspace',
  desk: 'Dedicated workspace',
  workspace: 'Dedicated workspace',
  // Heating & cooling
  ac: 'Air conditioning',
  air_conditioner: 'Air conditioning',
  central_air_conditioning: 'Air conditioning',
  split_ac: 'Air conditioning',
  central_heating: 'Heating',
  heater: 'Heating',
  room_heater: 'Heating',
  ceiling_fans: 'Ceiling fan',
  // Entertainment
  cable_tv: 'TV',
  hdtv: 'TV',
  smart_tv: 'TV',
  television: 'TV',
  tv_with_standard_cable: 'TV',
  // Kitchen & dining
  kitchenette: 'Kitchen',
  full_kitchen: 'Kitchen',
  cooking_facilities: 'Kitchen',
  dishes_and_silverware: 'Crockery and cutlery',
  dishes: 'Crockery and cutlery',
  silverware: 'Crockery and cutlery',
  crockery: 'Crockery and cutlery',
  cutlery: 'Crockery and cutlery',
  fridge: 'Refrigerator',
  mini_fridge: 'Refrigerator',
  mini_refrigerator: 'Refrigerator',
  kettle: 'Electric kettle',
  tea_kettle: 'Electric kettle',
  hot_water_kettle: 'Electric kettle',
  coffee: 'Coffee maker',
  coffee_machine: 'Coffee maker',
  nespresso_machine: 'Coffee maker',
  // Bedroom & laundry
  washer: 'Washing machine',
  clothes_washer: 'Washing machine',
  clothes_dryer: 'Dryer',
  iron: 'Iron & Ironing board',
  ironing_board: 'Iron & Ironing board',
  drying_rack: 'Clothes drying rack',
  drying_rack_for_clothing: 'Clothes drying rack',
  bed_linens: 'Bed linen',
  linens: 'Bed linen',
  bed_sheets: 'Bed linen',
  bedsheets: 'Bed linen',
  clothing_storage: 'Wardrobe / Closet',
  wardrobe: 'Wardrobe / Closet',
  closet: 'Wardrobe / Closet',
  blackout_curtains: 'Room-darkening shades',
  room_darkening_blinds: 'Room-darkening shades',
  pillows_and_blankets: 'Extra pillows and blankets',
  // Bathroom
  hair_dryer: 'Hairdryer',
  blow_dryer: 'Hairdryer',
  // Airbnb ships CONDITIONER as its own key; the catalog folds it into the
  // Shampoo item ("Hair shampoo and conditioner"), so it collapses rather than
  // becoming a lone custom chip.
  conditioner: 'Shampoo',
  shower_gel: 'Body soap',
  bidet: 'Bidet / Health faucet',
  health_faucet: 'Bidet / Health faucet',
  hand_shower: 'Bidet / Health faucet',
  bath_tub: 'Bathtub',
  soaking_tub: 'Bathtub',
  walk_in_shower: 'Shower',
  rain_shower: 'Shower',
  // Safety
  smoke_detector: 'Smoke alarm',
  carbon_monoxide_detector: 'Carbon monoxide alarm',
  first_aid: 'First aid kit',
  security_cameras: 'Security cameras on property',
  exterior_security_cameras: 'Security cameras on property',
  cctv: 'Security cameras on property',
  // Parking
  free_parking: 'Free parking on premises',
  private_parking: 'Free parking on premises',
  parking: 'Free parking on premises',
  free_street_parking: 'Free on-street parking',
  street_parking: 'Free on-street parking',
  // Outdoor & views
  garden_or_backyard: 'Garden / Backyard',
  backyard: 'Garden / Backyard',
  garden: 'Garden / Backyard',
  lawn: 'Garden / Backyard',
  balcony: 'Patio or balcony',
  patio: 'Patio or balcony',
  terrace: 'Patio or balcony',
  pool: 'Swimming pool',
  private_pool: 'Swimming pool',
  shared_pool: 'Swimming pool',
  city_view: 'City skyline view',
  skyline_view: 'City skyline view',
  // Services
  keypad: 'Self check-in',
  lockbox: 'Self check-in',
  smart_lock: 'Self check-in',
  luggage_dropoff_allowed: 'Luggage drop-off allowed',
  luggage_storage: 'Luggage drop-off allowed',
  elevator: 'Elevator / Lift',
  lift: 'Elevator / Lift',
  housekeeping: 'Housekeeping available',
  daily_housekeeping: 'Housekeeping available',
  cleaning_available_during_stay: 'Housekeeping available',
  // Power
  power_backup: 'Power backup / Inverter',
  inverter: 'Power backup / Inverter',
  generator: 'Power backup / Inverter',
  backup_power: 'Power backup / Inverter',
};

/** Catalog label by slug. First wins, so labels repeated across categories
 *  (Wi-Fi, Kitchen, Hot water, Air conditioning and Dedicated workspace each
 *  appear twice by design) resolve to one canonical string. */
const CATALOG_LABEL_BY_SLUG: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of ALL_CATALOG_AMENITIES) {
    const slug = amenitySlug(item.label);
    if (slug && !map[slug]) map[slug] = item.label;
  }
  return map;
})();

/** Alias values that no longer name a real catalog label - a rename left them
 *  behind. Empty is correct; asserted by test-amenity-mapping.mjs. */
export const ORPHAN_AMENITY_ALIASES: string[] = Object.entries(AMENITY_ALIASES)
  .filter(([, label]) => !CATALOG_LABEL_BY_SLUG[amenitySlug(label)])
  .map(([slug, label]) => slug + ' -> ' + label);

/**
 * One stored amenity -> the exact catalog label it belongs to, or a readable
 * custom label when the catalog has no home for it.
 *
 * An unrecognised value is never dropped - it stays a custom chip. It is only
 * humanised when it LOOKS like a machine constant (all caps/underscores), so
 * DISHWASHER reads as "Dishwasher" while something the owner typed by hand
 * ("BBQ area", "Jain food on request") survives exactly as written.
 */
export const normalizeAmenityLabel = (raw: string): string => {
  const text = (raw || '').trim();
  if (!text) return '';
  const slug = amenitySlug(text);
  if (!slug) return text;
  const alias = AMENITY_ALIASES[slug];
  if (alias) return alias;
  const exact = CATALOG_LABEL_BY_SLUG[slug];
  if (exact) return exact;
  return /^[A-Z0-9_]+$/.test(text) ? humanizeKey(text) : text;
};

/**
 * Normalise a whole stored list and drop duplicates that only differed by
 * vocabulary - WIFI and WIRELESS_INTERNET both become "Wi-Fi" and one
 * survives, which is what stops an import plus a manual tick showing the guest
 * two chips for the same thing. Order is preserved; first occurrence wins.
 */
export const normalizeAmenityList = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    const label = normalizeAmenityLabel(entry);
    if (!label) continue;
    const key = amenitySlug(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
};
