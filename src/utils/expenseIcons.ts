import type { LucideIcon } from 'lucide-react';
import {
  Wind, Fan, Droplet, Droplets, Coffee, Flame, Zap, Microwave, Utensils, Refrigerator,
  Speaker, Tv, WashingMachine, Shirt, Megaphone, TrendingUp, PenTool, Camera, Gift, Globe,
  Hammer, BatteryCharging, Sun, Percent, SprayCan, Trash2, Sparkles, Toilet,
  Armchair, Sofa, Frame, Image, Flower2, DoorClosed, Sprout, Wrench, Umbrella, Leaf,
  ShowerHead, Scissors, Package, Dumbbell, Gamepad2, Music, Book, Shield, ShieldAlert,
  ShieldCheck, Bed, BedDouble, Battery, Truck, AlertCircle, Plug, HeartPulse, Lightbulb,
  CreditCard, Laptop, HardDrive, Folder, Pen, FileText, Printer, Bath, ChefHat, Car, User,
  Users, Briefcase, Waves, Receipt, Calculator, Cloud, LockKeyhole, Server, Monitor,
  ParkingCircle, Fuel, Smartphone, Wifi, Banknote, Building2,
} from 'lucide-react';

// Ordered keyword -> icon rules, checked against the lowercased item label. First match wins,
// so more specific multi-word keywords are listed before generic single-word ones.
const ITEM_ICON_RULES: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['air condition', 'ac servicing'], icon: Wind },
  { keywords: ['ceiling fan'], icon: Fan },
  { keywords: ['dishwasher tablet', 'dishwashing liquid', 'dishwasher'], icon: Droplets },
  { keywords: ['dryer'], icon: Wind },
  { keywords: ['kettle'], icon: Coffee },
  { keywords: ['gas stove', 'lpg', 'gas cylinder', 'bonfire'], icon: Flame },
  { keywords: ['geyser'], icon: Flame },
  { keywords: ['hair dryer'], icon: Wind },
  { keywords: ['induction cooktop'], icon: Zap },
  { keywords: ['microwave'], icon: Microwave },
  { keywords: ['mixer grinder'], icon: Utensils },
  { keywords: ['oven'], icon: Flame },
  { keywords: ['refrigerator'], icon: Refrigerator },
  { keywords: ['sound system', 'bluetooth speaker'], icon: Speaker },
  { keywords: ['television', 'cable/dth', 'streaming'], icon: Tv },
  { keywords: ['toaster'], icon: Zap },
  { keywords: ['washing machine', 'washing powder', 'laundry staff'], icon: WashingMachine },
  { keywords: ['water purifier'], icon: Droplet },
  { keywords: ['iron', 'hanger', 'uniform'], icon: Shirt },

  { keywords: ['airbnb commission', 'booking platform commission'], icon: Percent },
  { keywords: ['facebook ad', 'google ad', 'instagram ad', 'promotional offer'], icon: Megaphone },
  { keywords: ['graphic design'], icon: PenTool },
  { keywords: ['photography'], icon: Camera },
  { keywords: ['website maintenance', 'website hosting', 'domain renewal', 'channel manager'], icon: Globe },

  { keywords: ['construction', 'renovation', 'mason', 'roof repair'], icon: Hammer },
  { keywords: ['inverter batter', 'inverter'], icon: BatteryCharging },
  { keywords: ['solar panel'], icon: Sun },
  { keywords: ['generator diesel', 'generator servicing', 'generator'], icon: Zap },

  { keywords: ['bleach', 'detergent', 'floor cleaner', 'glass cleaner', 'phenyl', 'spray'], icon: SprayCan },
  { keywords: ['garbage bag'], icon: Trash2 },
  { keywords: ['broom', 'mop', 'scrubber', 'sponge', 'cleaning cloth', 'housekeeping'], icon: Sparkles },
  { keywords: ['toilet cleaner', 'toilet paper', 'toilet'], icon: Toilet },
  { keywords: ['vacuum'], icon: Wind },

  { keywords: ['chair'], icon: Armchair },
  { keywords: ['sofa', 'cushion'], icon: Sofa },
  { keywords: ['mirror'], icon: Frame },
  { keywords: ['painting'], icon: Image },
  { keywords: ['flower'], icon: Flower2 },
  { keywords: ['wardrobe'], icon: DoorClosed },
  { keywords: ['dining table'], icon: Utensils },

  { keywords: ['fertilizer', 'seed'], icon: Sprout },
  { keywords: ['garden hose', 'garden tool', 'lawn mower'], icon: Wrench },
  { keywords: ['irrigation'], icon: Droplet },
  { keywords: ['umbrella'], icon: Umbrella },
  { keywords: ['plant'], icon: Leaf },
  { keywords: ['garden', 'gardener'], icon: Sprout },

  { keywords: ['body wash', 'handwash', 'shampoo', 'conditioner', 'moisturizer', 'soap'], icon: Droplet },
  { keywords: ['shaving kit', 'shaving'], icon: Scissors },
  { keywords: ['shower cap'], icon: ShowerHead },
  { keywords: ['air freshener'], icon: Sparkles },
  { keywords: ['tissue', 'sanitary pad', 'toothbrush', 'toothpaste', 'slipper', 'comb'], icon: Package },

  { keywords: ['badminton', 'cricket', 'outdoor game'], icon: Dumbbell },
  { keywords: ['board game'], icon: Gamepad2 },
  { keywords: ['music subscription'], icon: Music },
  { keywords: ['book'], icon: Book },

  { keywords: ['fire insurance', 'fire safety'], icon: ShieldAlert },
  { keywords: ['insurance'], icon: ShieldCheck },

  { keywords: ['fabric softener'], icon: Droplet },
  { keywords: ['ironing expense'], icon: Shirt },
  { keywords: ['laundry bag'], icon: Package },
  { keywords: ['linen', 'mattress', 'pillow', 'quilt', 'blanket', 'bedsheet'], icon: Bed },
  { keywords: ['bath mat', 'towel'], icon: Bath },

  { keywords: ['electrical repair'], icon: Zap },
  { keywords: ['lock repair', 'smart lock'], icon: LockKeyhole },
  { keywords: ['carpenter', 'painter'], icon: Hammer },
  { keywords: ['plumbing', 'water tank', 'waterproofing', 'borewell', 'pump'], icon: Droplet },
  { keywords: ['pest control'], icon: SprayCan },
  { keywords: ['swimming pool maintenance'], icon: Waves },
  { keywords: ['pool chemical', 'chlorine', 'pool filter', 'pool clean', 'water top-up'], icon: Droplet },
  { keywords: ['pool'], icon: Waves },

  { keywords: ['bank charge', 'payment gateway'], icon: CreditCard },
  { keywords: ['batter'], icon: Battery },
  { keywords: ['candle'], icon: Flame },
  { keywords: ['courier'], icon: Truck },
  { keywords: ['emergency purchase'], icon: AlertCircle },
  { keywords: ['extension cord'], icon: Plug },
  { keywords: ['first aid'], icon: HeartPulse },
  { keywords: ['light bulb', 'outdoor lighting'], icon: Lightbulb },
  { keywords: ['mosquito'], icon: SprayCan },
  { keywords: ['packaging material'], icon: Package },

  { keywords: ['computer accessor', 'laptop'], icon: Laptop },
  { keywords: ['hard drive', 'cctv storage'], icon: HardDrive },
  { keywords: ['file', 'register'], icon: Folder },
  { keywords: ['pen', 'pencil'], icon: Pen },
  { keywords: ['printer paper'], icon: FileText },
  { keywords: ['printer'], icon: Printer },

  { keywords: ['staff accommodation'], icon: Building2 },
  { keywords: ['staff bonus'], icon: Gift },
  { keywords: ['cook salary', 'kitchen helper'], icon: ChefHat },
  { keywords: ['driver'], icon: Car },
  { keywords: ['caretaker'], icon: User },
  { keywords: ['maintenance staff'], icon: Wrench },
  { keywords: ['manager salary', 'professional fee', 'legal fee'], icon: Briefcase },
  { keywords: ['security guard'], icon: ShieldCheck },
  { keywords: ['temporary/event staff'], icon: Users },

  { keywords: ['ca fee'], icon: Calculator },
  { keywords: ['gst', 'property tax', 'water tax', 'trade licence', 'pollution certificate'], icon: Receipt },

  { keywords: ['cctv'], icon: Camera },
  { keywords: ['cloud backup'], icon: Cloud },
  { keywords: ['email service'], icon: Building2 },
  { keywords: ['pms software', 'pos software'], icon: Monitor },
  { keywords: ['server'], icon: Server },

  { keywords: ['fuel'], icon: Fuel },
  { keywords: ['parking'], icon: ParkingCircle },
  { keywords: ['toll'], icon: Car },
  { keywords: ['vehicle servicing'], icon: Wrench },
  { keywords: ['vehicle insurance'], icon: ShieldCheck },

  { keywords: ['electricity'], icon: Zap },
  { keywords: ['internet', 'wi-fi', 'wifi'], icon: Wifi },
  { keywords: ['mobile phone bill'], icon: Smartphone },
  { keywords: ['water'], icon: Droplet },
];

// Category-level fallback, used when no item-level keyword matches.
const CATEGORY_ICON_RULES: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ['appliance'], icon: Plug },
  { keywords: ['booking', 'marketing'], icon: Megaphone },
  { keywords: ['capital asset'], icon: Building2 },
  { keywords: ['cleaning'], icon: Sparkles },
  { keywords: ['furniture', 'décor', 'decor'], icon: Sofa },
  { keywords: ['garden', 'outdoor'], icon: Leaf },
  { keywords: ['guest amenit'], icon: Droplet },
  { keywords: ['guest entertainment'], icon: Gamepad2 },
  { keywords: ['insurance'], icon: ShieldCheck },
  { keywords: ['laundry'], icon: WashingMachine },
  { keywords: ['maintenance', 'repair'], icon: Wrench },
  { keywords: ['office'], icon: Briefcase },
  { keywords: ['room suppl'], icon: Bed },
  { keywords: ['staff benefit'], icon: Gift },
  { keywords: ['staff expense'], icon: Users },
  { keywords: ['swimming pool'], icon: Waves },
  { keywords: ['tax', 'licens'], icon: Receipt },
  { keywords: ['technology'], icon: Server },
  { keywords: ['transportation'], icon: Car },
  { keywords: ['utilit'], icon: Zap },
];

export function getExpenseItemIcon(label: string, category?: string): LucideIcon {
  const lowerLabel = label.toLowerCase();
  for (const rule of ITEM_ICON_RULES) {
    if (rule.keywords.some((kw) => lowerLabel.includes(kw))) {
      return rule.icon;
    }
  }
  if (category) {
    const lowerCategory = category.toLowerCase();
    for (const rule of CATEGORY_ICON_RULES) {
      if (rule.keywords.some((kw) => lowerCategory.includes(kw))) {
        return rule.icon;
      }
    }
  }
  return Package;
}
