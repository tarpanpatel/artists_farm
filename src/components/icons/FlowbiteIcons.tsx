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

// Friendly aliases matching Flowbite Outline & Solid icons
export const LayoutDashboard = wrap(getOutline('GridPlus') || getOutline('Grid') || getOutline('TableColumn'));
export const Grid = wrap(getOutline('Grid'));
export const Layers = wrap(getOutline('Layers') || getOutline('FolderDuplicate'));
export const NavIcon = wrap(getOutline('Compass') || getOutline('Bars'));
export const Home = wrap(getOutline('Home'));
export const Building = wrap(getOutline('Building') || getOutline('Landmark'));
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
export const AlertCircle = wrap(getOutline('ExclamationCircle'));
export const AlertTriangle = wrap(getOutline('ExclamationCircle'));
export const XCircle = wrap(getOutline('CloseCircle'));
export const Loader2 = wrap(getOutline('Spinner') || getOutline('Refresh'));

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

export const FLOWBITE_ICONS = catalog;
