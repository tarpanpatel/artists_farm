import React, { createContext, useContext } from 'react';
import { Popover } from './Popover';
import { HelpCircle } from './icons/FlowbiteIcons';

/**
 * Where a field's helper text is shown (9 Sep 2026, explicit request).
 *
 *  - 'popover' (default, unchanged app-wide): a small "?" beside the label, revealed on
 *    hover/tap. Right for dense operational screens where guidance is occasional reference.
 *  - 'inline': the text sits BELOW the field, always visible. Right for SETUP screens - property,
 *    telegram and listing setup - where the owner is meeting each field for the first time and
 *    the guidance is the point, not a footnote. Help nobody opens is help nobody reads.
 *
 * Scoped by CONTEXT rather than a per-field prop deliberately: the property wizard alone has
 * ~15 fields, and a prop would have to be remembered on every future one. Wrapping the form
 * makes the setting a property of the SCREEN, which is what it actually is.
 */
export type FieldHelpMode = 'popover' | 'inline';

const FieldHelpModeContext = createContext<FieldHelpMode>('popover');

export const useFieldHelpMode = (): FieldHelpMode => useContext(FieldHelpModeContext);

export const FieldHelpModeProvider: React.FC<{ mode: FieldHelpMode; children: React.ReactNode }> = ({
  mode,
  children,
}) => <FieldHelpModeContext.Provider value={mode}>{children}</FieldHelpModeContext.Provider>;

/** Always-visible helper text, for `mode === 'inline'`. */
export const FieldHelpText: React.FC<{ content: React.ReactNode; id?: string }> = ({ content, id }) =>
  content ? (
    <p id={id} className="app-helper-text mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      {content}
    </p>
  ) : null;

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
