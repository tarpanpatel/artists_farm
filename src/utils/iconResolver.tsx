import React from 'react';
import { FLOWBITE_ICONS, NavIcon } from '../components/icons/FlowbiteIcons';

export const getIconComponent = (name: string): React.ElementType => {
  return FLOWBITE_ICONS[name] || NavIcon;
};

