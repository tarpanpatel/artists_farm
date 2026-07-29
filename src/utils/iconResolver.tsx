import React from 'react';
import * as LucideIcons from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  ShoppingCart,
  UtensilsCrossed,
  Utensils,
  ClipboardList,
  Truck,
  CookingPot,
  ShieldCheck,
  Calendar,
  Receipt,
  TrendingDown,
  Package,
  ShoppingBag,
  Sliders,
  BarChart3,
  BookOpen,
  Boxes,
  Layers,
  Link as LinkIcon,
  DollarSign,
  FileSpreadsheet,
  Send,
  Lock,
  Activity,
  Paintbrush,
  UserCheck,
  ShieldAlert,
  User,
  Wallet,
  HelpCircle,
  ScrollText,
  Grid,
  Bot,
  Settings,
  Navigation as NavIcon,
} from 'lucide-react';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  CreditCard,
  ShoppingCart,
  UtensilsCrossed,
  Utensils,
  ClipboardList,
  Truck,
  CookingPot,
  ShieldCheck,
  Calendar,
  Receipt,
  TrendingDown,
  Package,
  ShoppingBag,
  Sliders,
  BarChart3,
  BookOpen,
  Boxes,
  Layers,
  Link: LinkIcon,
  LinkIcon,
  DollarSign,
  FileSpreadsheet,
  Send,
  Lock,
  Activity,
  Paintbrush,
  UserCheck,
  ShieldAlert,
  User,
  Wallet,
  ScrollText,
  Grid,
  Bot,
  Settings,
  NavIcon,
};

interface DynamicIconProps {
  name: string;
  className?: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, className = 'w-4 h-4' }) => {
  const IconComponent = iconMap[name] || (LucideIcons as any)[name] || HelpCircle;
  return <IconComponent className={className} />;
};

export const getIconComponent = (name: string): React.ElementType => {
  return iconMap[name] || (LucideIcons as any)[name] || HelpCircle;
};
