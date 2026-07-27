import React from 'react';
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
};

interface DynamicIconProps {
  name: string;
  className?: string;
}

export const DynamicIcon: React.FC<DynamicIconProps> = ({ name, className = 'w-4 h-4' }) => {
  const IconComponent = iconMap[name] || HelpCircle;
  return <IconComponent className={className} />;
};

export const getIconComponent = (name: string): React.ElementType => {
  return iconMap[name] || HelpCircle;
};
