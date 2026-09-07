import React from 'react';
import { Popover } from './Popover';
import { Badge } from './Badge';
import { HelpCircle } from './icons/FlowbiteIcons';

export interface FieldHelpPopoverProps {
  content: React.ReactNode;
  title?: React.ReactNode;
  className?: string;
  zIndex?: number;
}

/**
 * Standardized Flowbite Popover trigger for field instruction/helper text.
 * Renders a compact bordered "Help?" badge with icon that reveals full guidance on hover/tap.
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
      placement="auto"
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
        className={`inline-flex items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/30 rounded ${className}`}
      >
        <Badge
          variant="neutral"
          size="sm"
          className="cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors inline-flex items-center gap-1"
        >
          <HelpCircle className="w-3 h-3 shrink-0 text-slate-500 dark:text-slate-400" />
          <span>Help?</span>
        </Badge>
      </button>
    </Popover>
  );
};
