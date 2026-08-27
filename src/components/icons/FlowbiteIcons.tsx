import React from 'react';
import * as FlowbiteOutline from 'flowbite-react-icons/outline';
import * as FlowbiteSolid from 'flowbite-react-icons/solid';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
}

// Helper wrapper to ensure uniform class, size and SVG props on Flowbite icon components
const wrap = (comp: any): React.FC<IconProps> => {
  return ({ size = 20, className = '', ...props }: IconProps) => {
    if (!comp) return null;
    const Comp = comp;
    return <Comp width={size} height={size} className={className} aria-hidden="true" {...props} />;
  };
};

const getOutline = (name: string) => (FlowbiteOutline as any)[`Svg${name}`] || (FlowbiteOutline as any)[name];

// Broader lookup (checks both outline AND solid, both with/without the "Svg"
// export prefix) - used for the large lucide-react replacement alias block
// below (22 Aug 2026 "remove lucide-react site-wide" sweep). The curated
// aliases above only ever needed outline icons so getOutline() was enough;
// several of the ~150 additional Lucide names being retired here only have a
// reasonable Flowbite equivalent in the solid set, so this checks both to
// avoid a name silently resolving to nothing (wrap() renders null if the
// looked-up component is undefined - no build error, just a blank icon).
const getAny = (name: string) =>
  (FlowbiteOutline as any)[`Svg${name}`] ||
  (FlowbiteOutline as any)[name] ||
  (FlowbiteSolid as any)[`Svg${name}`] ||
  (FlowbiteSolid as any)[name];

// Type alias for the removed lucide-react `LucideIcon` type - used by files
// (expenseIcons.ts, InventoryManagement.tsx) that keep a lookup table of
// icon components keyed by keyword rather than importing icons by name
// directly.
export type FlowbiteIconComponent = React.FC<IconProps>;

// Friendly aliases matching Flowbite Outline & Solid icons
export const LayoutDashboard = wrap(getOutline('GridPlus') || getOutline('Grid') || getOutline('TableColumn'));
export const Grid = wrap(getOutline('Grid'));
export const Layers = wrap(getOutline('Layers') || getOutline('FolderDuplicate'));
export const NavIcon = wrap(getOutline('Compass') || getOutline('Bars'));
export const Home = wrap(getOutline('Home'));
export const Building = wrap(getOutline('Building') || getOutline('Landmark'));
export const MapPin = wrap(getOutline('MapPin'));
export const DoorOpen = wrap(getOutline('OpenDoor') || getOutline('Door'));
export const Users = wrap(getOutline('UsersGroup') || getOutline('User'));
export const User = wrap(getOutline('User'));
export const UserRound = User;
export const UserCheck = wrap(getOutline('UserCheck') || getOutline('User'));

// Kitchen & Hospitality
export const Utensils = wrap(getOutline('Utensils') || getOutline('Cart'));
export const UtensilsCrossed = Utensils;
export const CookingPot = wrap(getOutline('Fire') || getOutline('Utensils'));
export const ClipboardList = wrap(getOutline('ClipboardList') || getOutline('List'));
export const Package = wrap(getOutline('Archive') || getOutline('InboxFull'));
export const Boxes = wrap(getOutline('FolderDuplicate') || getOutline('Archive'));
export const ShoppingCart = wrap(getOutline('Cart'));
export const ShoppingBag = wrap(getOutline('ShoppingBag') || getOutline('Bag'));
export const Truck = wrap(getOutline('Truck'));

// Finance & Ledger
export const CreditCard = wrap(getOutline('CreditCard'));
export const DollarSign = wrap(getOutline('Dollar') || getOutline('Cash'));
export const Wallet = wrap(getOutline('Wallet'));
export const Receipt = wrap(getOutline('Receipt'));
export const BarChart = wrap(getOutline('ChartLineUp') || getOutline('ChartPie'));
export const BarChart3 = wrap(getOutline('ChartLineUp'));
export const TrendingDown = wrap(getOutline('ArrowDown'));
export const TrendingUp = wrap(getOutline('ArrowUp'));
export const Activity = wrap(getOutline('Heart'));

// Calendar & Time
export const Calendar = wrap(getOutline('CalendarMonth') || getOutline('Calendar'));
export const Clock = wrap(getOutline('Clock'));

// Communication & Security
export const Bell = wrap(getOutline('Bell') || getOutline('BellActive'));
export const Send = wrap(getOutline('PaperPlane') || getOutline('ShareAll'));
export const Mail = wrap(getOutline('Envelope'));
export const MessageCircle = wrap(getOutline('Messages') || getOutline('MessageCaption'));
export const QuestionCircle = wrap(getAny('QuestionCircle') || getAny('InfoCircle'));
export const ShieldCheck = wrap(getOutline('ShieldCheck') || getOutline('Shield'));
export const ShieldAlert = wrap(getOutline('ShieldCheck'));
export const Lock = wrap(getOutline('Lock'));

// Actions & Controls
export const Plus = wrap(getOutline('Plus'));
export const Pencil = wrap(getOutline('Edit'));
export const Edit2 = Pencil;
export const Trash2 = wrap(getOutline('TrashBin'));
export const Check = wrap(getOutline('Check'));
export const X = wrap(getOutline('Close'));
export const Search = wrap(getOutline('Search'));
export const Filter = wrap(getOutline('Filter'));
export const RefreshCw = wrap(getOutline('Refresh'));
export const Upload = wrap(getOutline('Upload'));
export const Download = wrap(getOutline('Download'));
export const LogOut = wrap(getOutline('ArrowRightToBracket'));
export const Save = wrap(getOutline('FloppyDisk') || getOutline('Check') || getOutline('Download'));
export const Share2 = wrap(getOutline('ShareNodes') || getOutline('ShareAll'));
export const LinkIcon = wrap(getOutline('Link'));
export const ExternalLink = wrap(getOutline('ArrowUpRightFromSquare') || getOutline('Link'));
export const Eye = wrap(getOutline('Eye'));
export const EyeOff = wrap(getOutline('EyeSlash'));
export const GripVertical = wrap(getOutline('DotsHorizontal'));

// Navigation Chevrons & Arrows
export const ChevronDown = wrap(getOutline('ChevronDown'));
export const ChevronRight = wrap(getOutline('ChevronRight'));
export const ChevronLeft = wrap(getOutline('ChevronLeft'));
export const ChevronUp = wrap(getOutline('ChevronUp'));
export const ArrowRight = wrap(getOutline('ArrowRight'));
export const ArrowLeft = wrap(getOutline('ArrowLeft'));

// Status & Feedback
export const CheckCircle2 = wrap(getOutline('CheckCircle'));
export const CheckCircle = CheckCircle2;
export const AlertCircle = wrap(getOutline('ExclamationCircle'));
export const AlertTriangle = wrap(getOutline('ExclamationCircle'));
export const XCircle = wrap(getOutline('CloseCircle'));
// Loader2 (fixed 27 Aug 2026, live report raised multiple times: "why still 2 types of
// loading"). This used to be `wrap(getOutline('Spinner') || getOutline('Refresh'))` -
// flowbite-react-icons has no "Spinner" icon at all, so every one of this app's ~40 loading-spinner
// call sites silently fell back to the Refresh icon (two curved arrows) instead, which - once
// `animate-spin` is applied - looks nothing like a spinning ring, unlike every other loading
// indicator in the app (e.g. index.html's own pure-CSS #initial-loader__spinner shown before React
// even mounts). Rebuilt as a real standalone spinner SVG (the exact path lucide-react's own
// Loader2 used, from before this app's Lucide migration - a near-complete circle with one gap)
// instead of depending on Flowbite ever adding a matching icon. Every existing call site's
// `<Loader2 className="... animate-spin" />` usage is unaffected - same IconProps shape, same
// size/className override behavior as every other icon in this file.
export const Loader2: React.FC<IconProps> = ({ size = 20, className = '', ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    {...props}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
export const Info = wrap(getOutline('InfoCircle'));

// Settings, Data & Utilities
export const Settings = wrap(getOutline('Cog') || getOutline('AdjustmentsVertical'));
export const Sliders = wrap(getOutline('AdjustmentsHorizontal'));
export const FileSpreadsheet = wrap(getOutline('FileChartBar') || getOutline('FileLines'));
export const BookOpen = wrap(getOutline('BookOpen') || getOutline('Book'));
export const Paintbrush = wrap(getOutline('Palette') || getOutline('WandMagicSparkles'));
export const Palette = wrap(getOutline('Palette'));
export const Moon = wrap(getOutline('Moon'));
export const Sun = wrap(getOutline('Sun'));
export const Globe = wrap(getOutline('Globe'));
export const Phone = wrap(getOutline('Phone'));
export const HelpCircle = wrap(getOutline('QuestionCircle'));
export const ScrollText = wrap(getOutline('FileLines') || getOutline('FileCode'));
export const Bot = wrap(getOutline('CodeFork') || getOutline('WandMagicSparkles'));
export const PanelLeftClose = wrap(getOutline('Bars'));
export const PanelRightOpen = wrap(getOutline('Bars'));

// -------------------------------------------------------------
// LUCIDE-REACT RETIREMENT ALIASES (22 Aug 2026)
// -------------------------------------------------------------
// Every name below is a Lucide icon name that was still imported directly
// from 'lucide-react' somewhere in the app before this sweep. None of these
// are exact glyph matches - Flowbite's icon set is UI/interface-focused and
// doesn't carry a literal icon for every physical object or foodstuff Lucide
// has (armchair, washing machine, fridge, dumbbell, etc.) - each is the
// closest reasonable Flowbite equivalent, verified to actually resolve
// against the installed flowbite-react-icons package (not guessed). A
// handful fall back to a generic icon (InboxFull for "appliance with no
// dedicated glyph", Shapes for "furniture with no dedicated glyph") rather
// than force a misleading literal match - see IndianRupee below for the one
// case worth knowing about specifically.
export const Apple = wrap(getAny('Apple'));
export const Armchair = wrap(getAny('Shapes'));
export const ArrowRightLeft = wrap(getAny('ArrowsRepeat'));
export const ArrowUp = wrap(getAny('ArrowUp'));
export const Balloon = wrap(getAny('GiftBox'));
export const Banana = wrap(getAny('Apple'));
export const Bath = wrap(getAny('WaterBottle'));
export const Battery = wrap(getAny('Battery'));
export const BatteryCharging = wrap(getAny('Battery'));
export const Bean = wrap(getAny('BowlFood'));
export const Bed = wrap(getAny('Bed'));
export const BedDouble = wrap(getAny('Bed'));
export const Blend = wrap(getAny('GlassWater'));
export const Bold = wrap(getAny('LetterBold'));
export const Book = wrap(getAny('Book'));
export const Bookmark = wrap(getAny('Bookmark'));
export const Box = wrap(getAny('Cube'));
export const Briefcase = wrap(getAny('Briefcase'));
export const Building2 = wrap(getAny('Building'));
export const Cake = wrap(getAny('CakeCandles'));
export const Calculator = wrap(getAny('CashRegister'));
export const CalendarClock = wrap(getAny('CalendarWeek'));
export const CalendarDays = wrap(getAny('CalendarWeek'));
export const CalendarPlus = wrap(getAny('CalendarPlus'));
export const Camera = wrap(getAny('CameraPhoto'));
export const Candy = wrap(getAny('CandyCane'));
export const Car = wrap(getAny('Truck'));
export const Carrot = wrap(getAny('Carrot'));
export const CheckSquare = wrap(getAny('CheckPlusCircle'));
export const ChefHat = wrap(getAny('Utensils') || getAny('Cart'));
export const Cherry = wrap(getAny('Apple'));
export const Citrus = wrap(getAny('Lemon'));
export const ClipboardEdit = wrap(getAny('ClipboardCheck'));
export const Cloud = wrap(getAny('CloudArrowUp'));
export const Code = wrap(getAny('Code'));
export const Coffee = wrap(getAny('MugHot'));
export const Cookie = wrap(getAny('Cookie'));
export const Copy = wrap(getAny('FileCopy'));
export const CornerDownRight = wrap(getAny('Reply'));
export const Croissant = wrap(getAny('BreadSlice'));
export const CupSoda = wrap(getAny('GlassWater'));
export const Database = wrap(getAny('Database'));
export const DatabaseBackup = wrap(getAny('Database'));
export const Delete = wrap(getAny('Close'));
export const DoorClosed = wrap(getAny('OpenDoor'));
export const Droplet = wrap(getAny('WaterBottle'));
export const Droplets = wrap(getAny('GlassWaterDroplet'));
export const Drumstick = wrap(getAny('DrumstickBite'));
export const Dumbbell = wrap(getAny('Cube'));
export const Egg = wrap(getAny('Egg'));
export const Eraser = wrap(getAny('CloseCircle'));
export const Fan = wrap(getAny('Refresh'));
export const FileCode = wrap(getAny('FileCode'));
export const FileText = wrap(getAny('FileLines'));
export const Fish = wrap(getAny('Fish'));
export const Flame = wrap(getAny('Fire'));
export const FlaskConical = wrap(getAny('Flask'));
export const Flower2 = wrap(getAny('Seedling'));
export const Folder = wrap(getAny('Folder'));
export const FolderCog = wrap(getAny('Folder'));
export const FolderOpen = wrap(getAny('FolderOpen'));
export const Frame = wrap(getAny('FileImage'));
export const Fuel = wrap(getAny('Truck'));
export const Gamepad2 = wrap(getAny('ClapperboardPlay'));
export const Gift = wrap(getAny('GiftBox'));
export const GlassWater = wrap(getAny('GlassWater'));
export const Grape = wrap(getAny('Apple'));
export const Hammer = wrap(getAny('Hammer'));
export const HandPlatter = wrap(getAny('BowlFood'));
export const Handshake = wrap(getAny('BadgeCheck'));
export const HardDrive = wrap(getAny('Database'));
export const HardDriveDownload = wrap(getAny('ArrowDownToBracket'));
export const Hash = wrap(getAny('Tag'));
export const HeartPulse = wrap(getAny('Heart'));
export const Hotel = wrap(getAny('Building'));
export const IdCard = wrap(getAny('ProfileCard'));
export const Image = wrap(getAny('Image'));
export const ImageIcon = wrap(getAny('Image'));
// No Indian Rupee glyph exists in Flowbite's icon set (only Dollar/Euro/
// Bitcoin) - a "$" icon next to a ₹ amount would misrepresent the currency,
// so this uses a currency-neutral cash/banknote icon instead of a wrong
// symbol. Worth knowing if a screen looks like it's "missing" its rupee icon.
export const IndianRupee = wrap(getAny('Cash'));
export const Italic = wrap(getAny('LetterItalic'));
export const KeyRound = wrap(getAny('ApiKey'));
export const Landmark = wrap(getAny('Landmark'));
export const Laptop = wrap(getAny('LaptopCode'));
export const LayoutGrid = wrap(getAny('Grid'));
export const Leaf = wrap(getAny('Seedling'));
export const LeafyGreen = wrap(getAny('Seedling'));
export const Lightbulb = wrap(getAny('Lightbulb'));
export const Link = wrap(getAny('Link'));
export const List = wrap(getAny('List'));
export const LockKeyhole = wrap(getAny('Lock'));
export const LogIn = wrap(getAny('ArrowLeftToBracket'));
export const Megaphone = wrap(getAny('Bullhorn'));
export const Menu = wrap(getAny('Bars'));
export const MessageSquare = wrap(getAny('Messages'));
export const Microwave = wrap(getAny('InboxFull'));
export const Milk = wrap(getAny('GlassWater'));
export const Minus = wrap(getAny('Minus'));
export const Monitor = wrap(getAny('DesktopPc'));
export const MoreVertical = wrap(getAny('DotsVertical'));
export const Music = wrap(getAny('Music'));
export const Navigation = wrap(getAny('Compass') || getAny('Bars'));
export const Nut = wrap(getAny('Seedling'));
export const PackagePlus = wrap(getAny('Archive'));
export const Paperclip = wrap(getAny('PaperClip'));
export const ParkingCircle = wrap(getAny('MapPinAlt'));
export const Pen = wrap(getAny('Pen'));
export const PenTool = wrap(getAny('PenNib'));
export const Percent = wrap(getAny('SalePercent'));
export const PieChart = wrap(getAny('ChartPie'));
export const Plug = wrap(getAny('InboxFull'));
export const PlusSquare = wrap(getAny('CirclePlus'));
export const Printer = wrap(getAny('Printer'));
export const QrCode = wrap(getAny('QrCode'));
export const Quote = wrap(getAny('Quote'));
export const Redo = wrap(getAny('Redo'));
export const Refrigerator = wrap(getAny('InboxFull'));
export const Rocket = wrap(getAny('Rocket'));
export const RotateCcw = wrap(getAny('Refresh'));
export const Sandwich = wrap(getAny('Burger'));
export const Scale = wrap(getAny('ScaleBalanced'));
export const ScanLine = wrap(getAny('QrCode'));
export const Scissors = wrap(getAny('Tools'));
export const Server = wrap(getAny('Server'));
export const Settings2 = wrap(getAny('Cog'));
export const Share = wrap(getAny('ShareNodes') || getAny('ShareAll'));
export const Shirt = wrap(getAny('TShirt'));
export const ShowerHead = wrap(getAny('WaterBottle'));
export const Smartphone = wrap(getAny('MobilePhone'));
export const Snowflake = wrap(getAny('InboxFull'));
export const Sofa = wrap(getAny('Shapes'));
export const Soup = wrap(getAny('BowlFood'));
export const Sparkles = wrap(getAny('WandMagicSparkles'));
export const Speaker = wrap(getAny('ComputerSpeaker'));
export const SprayCan = wrap(getAny('WandMagicSparkles'));
export const Sprout = wrap(getAny('Seedling'));
export const Square = wrap(getAny('Stop'));
export const Strikethrough = wrap(getAny('TextSlash'));
export const Target = wrap(getAny('Flag'));
export const ToggleLeft = wrap(getAny('AdjustmentsHorizontal'));
export const Toilet = wrap(getAny('InboxFull'));
export const Tv = wrap(getAny('DesktopPc'));
export const Type = wrap(getAny('FontFamily'));
export const Umbrella = wrap(getAny('LifeSaver'));
export const Underline = wrap(getAny('LetterUnderline'));
export const Undo = wrap(getAny('Reply'));
export const UserCog = wrap(getAny('UserSettings'));
export const Users2 = wrap(getAny('UsersGroup') || getAny('User'));
export const WashingMachine = wrap(getAny('InboxFull'));
export const Waves = wrap(getAny('GlassWaterDroplet'));
export const Wheat = wrap(getAny('Wheat'));
export const Wifi = wrap(getAny('Globe'));
export const WifiOff = wrap(getAny('Globe'));
export const Wind = wrap(getAny('Refresh'));
export const Wrench = wrap(getAny('Tools'));
export const Zap = wrap(getAny('Lightbulb'));

// -------------------------------------------------------------
// COMPLETE FLOWBITE CATALOG: ALL 751+ OUTLINE AND SOLID ICONS
// -------------------------------------------------------------
const catalog: Record<string, React.FC<IconProps>> = {};

// 1. Register all Outline icons (strip "Svg" prefix or keep both)
Object.entries(FlowbiteOutline).forEach(([rawName, comp]) => {
  if (typeof comp === 'function' || typeof comp === 'object') {
    const cleanName = rawName.startsWith('Svg') ? rawName.slice(3) : rawName;
    const wrapped = wrap(comp);
    catalog[cleanName] = wrapped;
    catalog[`${cleanName}Outline`] = wrapped;
    catalog[rawName] = wrapped;
  }
});

// 2. Register all Solid icons
Object.entries(FlowbiteSolid).forEach(([rawName, comp]) => {
  if (typeof comp === 'function' || typeof comp === 'object') {
    const cleanName = rawName.startsWith('Svg') ? rawName.slice(3) : rawName;
    const wrapped = wrap(comp);
    catalog[`${cleanName}Solid`] = wrapped;
    if (!catalog[cleanName]) {
      catalog[cleanName] = wrapped;
    }
  }
});

// 3. Register standard friendly aliases
catalog['LayoutDashboard'] = LayoutDashboard;
catalog['Grid'] = Grid;
catalog['Layers'] = Layers;
catalog['NavIcon'] = NavIcon;
catalog['Home'] = Home;
catalog['Building'] = Building;
catalog['MapPin'] = MapPin;
catalog['DoorOpen'] = DoorOpen;
catalog['Users'] = Users;
catalog['User'] = User;
catalog['UserRound'] = UserRound;
catalog['UserCheck'] = UserCheck;
catalog['Utensils'] = Utensils;
catalog['UtensilsCrossed'] = UtensilsCrossed;
catalog['CookingPot'] = CookingPot;
catalog['ClipboardList'] = ClipboardList;
catalog['Package'] = Package;
catalog['Boxes'] = Boxes;
catalog['ShoppingCart'] = ShoppingCart;
catalog['ShoppingBag'] = ShoppingBag;
catalog['Truck'] = Truck;
catalog['CreditCard'] = CreditCard;
catalog['DollarSign'] = DollarSign;
catalog['Wallet'] = Wallet;
catalog['Receipt'] = Receipt;
catalog['BarChart'] = BarChart;
catalog['BarChart3'] = BarChart3;
catalog['TrendingDown'] = TrendingDown;
catalog['TrendingUp'] = TrendingUp;
catalog['Activity'] = Activity;
catalog['Calendar'] = Calendar;
catalog['Clock'] = Clock;
catalog['Bell'] = Bell;
catalog['Send'] = Send;
catalog['Mail'] = Mail;
catalog['MessageCircle'] = MessageCircle;
catalog['ShieldCheck'] = ShieldCheck;
catalog['ShieldAlert'] = ShieldAlert;
catalog['Lock'] = Lock;
catalog['Plus'] = Plus;
catalog['Pencil'] = Pencil;
catalog['Edit2'] = Edit2;
catalog['Trash2'] = Trash2;
catalog['Check'] = Check;
catalog['X'] = X;
catalog['Search'] = Search;
catalog['Filter'] = Filter;
catalog['RefreshCw'] = RefreshCw;
catalog['Upload'] = Upload;
catalog['Download'] = Download;
catalog['LogOut'] = LogOut;
catalog['Share2'] = Share2;
catalog['LinkIcon'] = LinkIcon;
catalog['ExternalLink'] = ExternalLink;
catalog['Eye'] = Eye;
catalog['EyeOff'] = EyeOff;
catalog['GripVertical'] = GripVertical;
catalog['ChevronDown'] = ChevronDown;
catalog['ChevronRight'] = ChevronRight;
catalog['ChevronLeft'] = ChevronLeft;
catalog['ChevronUp'] = ChevronUp;
catalog['ArrowRight'] = ArrowRight;
catalog['ArrowLeft'] = ArrowLeft;
catalog['CheckCircle2'] = CheckCircle2;
catalog['AlertCircle'] = AlertCircle;
catalog['AlertTriangle'] = AlertTriangle;
catalog['XCircle'] = XCircle;
catalog['Loader2'] = Loader2;
catalog['CheckCircle'] = CheckCircle;
catalog['Info'] = Info;
catalog['Settings'] = Settings;
catalog['Sliders'] = Sliders;
catalog['FileSpreadsheet'] = FileSpreadsheet;
catalog['BookOpen'] = BookOpen;
catalog['Paintbrush'] = Paintbrush;
catalog['Palette'] = Palette;
catalog['Moon'] = Moon;
catalog['Sun'] = Sun;
catalog['Globe'] = Globe;
catalog['Phone'] = Phone;
catalog['HelpCircle'] = HelpCircle;
catalog['ScrollText'] = ScrollText;
catalog['Bot'] = Bot;
catalog['PanelLeftClose'] = PanelLeftClose;
catalog['PanelRightOpen'] = PanelRightOpen;

// 4. Register the lucide-react retirement aliases (22 Aug 2026)
catalog['Apple'] = Apple;
catalog['Armchair'] = Armchair;
catalog['ArrowRightLeft'] = ArrowRightLeft;
catalog['ArrowUp'] = ArrowUp;
catalog['Balloon'] = Balloon;
catalog['Banana'] = Banana;
catalog['Bath'] = Bath;
catalog['Battery'] = Battery;
catalog['BatteryCharging'] = BatteryCharging;
catalog['Bean'] = Bean;
catalog['Bed'] = Bed;
catalog['BedDouble'] = BedDouble;
catalog['Blend'] = Blend;
catalog['Bold'] = Bold;
catalog['Book'] = Book;
catalog['Bookmark'] = Bookmark;
catalog['Box'] = Box;
catalog['Briefcase'] = Briefcase;
catalog['Building2'] = Building2;
catalog['Cake'] = Cake;
catalog['Calculator'] = Calculator;
catalog['CalendarClock'] = CalendarClock;
catalog['CalendarDays'] = CalendarDays;
catalog['CalendarPlus'] = CalendarPlus;
catalog['Camera'] = Camera;
catalog['Candy'] = Candy;
catalog['Car'] = Car;
catalog['Carrot'] = Carrot;
catalog['CheckSquare'] = CheckSquare;
catalog['ChefHat'] = ChefHat;
catalog['Cherry'] = Cherry;
catalog['Citrus'] = Citrus;
catalog['ClipboardEdit'] = ClipboardEdit;
catalog['Cloud'] = Cloud;
catalog['Code'] = Code;
catalog['Coffee'] = Coffee;
catalog['Cookie'] = Cookie;
catalog['Copy'] = Copy;
catalog['CornerDownRight'] = CornerDownRight;
catalog['Croissant'] = Croissant;
catalog['CupSoda'] = CupSoda;
catalog['Database'] = Database;
catalog['DatabaseBackup'] = DatabaseBackup;
catalog['Delete'] = Delete;
catalog['DoorClosed'] = DoorClosed;
catalog['Droplet'] = Droplet;
catalog['Droplets'] = Droplets;
catalog['Drumstick'] = Drumstick;
catalog['Dumbbell'] = Dumbbell;
catalog['Egg'] = Egg;
catalog['Eraser'] = Eraser;
catalog['Fan'] = Fan;
catalog['FileCode'] = FileCode;
catalog['FileText'] = FileText;
catalog['Fish'] = Fish;
catalog['Flame'] = Flame;
catalog['FlaskConical'] = FlaskConical;
catalog['Flower2'] = Flower2;
catalog['Folder'] = Folder;
catalog['FolderCog'] = FolderCog;
catalog['FolderOpen'] = FolderOpen;
catalog['Frame'] = Frame;
catalog['Fuel'] = Fuel;
catalog['Gamepad2'] = Gamepad2;
catalog['Gift'] = Gift;
catalog['GlassWater'] = GlassWater;
catalog['Grape'] = Grape;
catalog['Hammer'] = Hammer;
catalog['HandPlatter'] = HandPlatter;
catalog['Handshake'] = Handshake;
catalog['HardDrive'] = HardDrive;
catalog['HardDriveDownload'] = HardDriveDownload;
catalog['Hash'] = Hash;
catalog['HeartPulse'] = HeartPulse;
catalog['Hotel'] = Hotel;
catalog['IdCard'] = IdCard;
catalog['Image'] = Image;
catalog['ImageIcon'] = ImageIcon;
catalog['IndianRupee'] = IndianRupee;
catalog['Italic'] = Italic;
catalog['KeyRound'] = KeyRound;
catalog['Landmark'] = Landmark;
catalog['Laptop'] = Laptop;
catalog['LayoutGrid'] = LayoutGrid;
catalog['Leaf'] = Leaf;
catalog['LeafyGreen'] = LeafyGreen;
catalog['Lightbulb'] = Lightbulb;
catalog['Link'] = Link;
catalog['List'] = List;
catalog['LockKeyhole'] = LockKeyhole;
catalog['LogIn'] = LogIn;
catalog['Megaphone'] = Megaphone;
catalog['Menu'] = Menu;
catalog['MessageSquare'] = MessageSquare;
catalog['Microwave'] = Microwave;
catalog['Milk'] = Milk;
catalog['Minus'] = Minus;
catalog['Monitor'] = Monitor;
catalog['MoreVertical'] = MoreVertical;
catalog['Music'] = Music;
catalog['Navigation'] = Navigation;
catalog['Nut'] = Nut;
catalog['PackagePlus'] = PackagePlus;
catalog['Paperclip'] = Paperclip;
catalog['ParkingCircle'] = ParkingCircle;
catalog['Pen'] = Pen;
catalog['PenTool'] = PenTool;
catalog['Percent'] = Percent;
catalog['PieChart'] = PieChart;
catalog['Plug'] = Plug;
catalog['PlusSquare'] = PlusSquare;
catalog['Printer'] = Printer;
catalog['QrCode'] = QrCode;
catalog['Quote'] = Quote;
catalog['Redo'] = Redo;
catalog['Refrigerator'] = Refrigerator;
catalog['Rocket'] = Rocket;
catalog['RotateCcw'] = RotateCcw;
catalog['Sandwich'] = Sandwich;
catalog['Scale'] = Scale;
catalog['ScanLine'] = ScanLine;
catalog['Scissors'] = Scissors;
catalog['Server'] = Server;
catalog['Settings2'] = Settings2;
catalog['Share'] = Share;
catalog['Shirt'] = Shirt;
catalog['ShowerHead'] = ShowerHead;
catalog['Smartphone'] = Smartphone;
catalog['Snowflake'] = Snowflake;
catalog['Sofa'] = Sofa;
catalog['Soup'] = Soup;
catalog['Sparkles'] = Sparkles;
catalog['Speaker'] = Speaker;
catalog['SprayCan'] = SprayCan;
catalog['Sprout'] = Sprout;
catalog['Square'] = Square;
catalog['Strikethrough'] = Strikethrough;
catalog['Target'] = Target;
catalog['ToggleLeft'] = ToggleLeft;
catalog['Toilet'] = Toilet;
catalog['Tv'] = Tv;
catalog['Type'] = Type;
catalog['Umbrella'] = Umbrella;
catalog['Underline'] = Underline;
catalog['Undo'] = Undo;
catalog['UserCog'] = UserCog;
catalog['Users2'] = Users2;
catalog['WashingMachine'] = WashingMachine;
catalog['Waves'] = Waves;
catalog['Wheat'] = Wheat;
catalog['Wifi'] = Wifi;
catalog['WifiOff'] = WifiOff;
catalog['Wind'] = Wind;
catalog['Wrench'] = Wrench;
catalog['Zap'] = Zap;

export const FLOWBITE_ICONS = catalog;
export { TelegramIcon } from './TelegramIcon';
