import React from 'react';
import { Popover } from './Popover';
import { HelpCircle } from './icons/FlowbiteIcons';

export interface FieldHelpPopoverProps {
  content: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
  zIndex?: number;
}

/**
 * Standardized Flowbite Popover trigger for field instruction/helper text.
 * Renders an unobtrusive help icon that reveals full guidance on hover/tap.
 */
export const FieldHelpPopover: React.FC<FieldHelpPopoverProps> = ({
  content,
  title,
  className = '',
  zIndex = 9999,
}) => {
  if (!content) return null;

  const headerTitle =
    typeof title === 'string'
      ? title.replace(/\*+/g, '').replace(/\s+/g, ' ').trim()
      : title;

  return (
    <Popover
      trigger="hover"
      placement="top"
      zIndex={zIndex}
      title={headerTitle || 'Help'}
      content={
        <div className="px-3 py-2 text-xs text-gray-700 dark:text-gray-200 max-w-xs leading-relaxed">
          {content}
        </div>
      }
    >
      <button
        type="button"
        aria-label={typeof headerTitle === 'string' ? `Help for ${headerTitle}` : 'Help information'}
        className={`inline-flex items-center justify-center text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 transition-colors cursor-pointer p-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded-full ${className}`}
      >
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
      </button>
    </Popover>
  );
};
