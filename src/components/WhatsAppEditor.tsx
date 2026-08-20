import React, { useRef, useCallback } from 'react';
import { Bold, Italic, Strikethrough, List, Quote, Code } from 'lucide-react';
import { Button } from './Button';
import { Textarea } from './Textarea';

interface WhatsAppEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

const FORMAT_BUTTONS = [
  { label: 'B', icon: Bold, wrap: ['*', '*'], title: 'Bold' },
  { label: 'I', icon: Italic, wrap: ['_', '_'], title: 'Italic' },
  { label: 'S', icon: Strikethrough, wrap: ['~', '~'], title: 'Strikethrough' },
  { label: '•', icon: List, wrap: ['\n• ', ''], title: 'Bullet list' },
  { label: '“', icon: Quote, wrap: ['\n> ', ''], title: 'Quote' },
  { label: '</>', icon: Code, wrap: ['```', '```'], title: 'Code block' },
];

export const WhatsAppEditor: React.FC<WhatsAppEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type your message here...',
  rows = 4,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const applyFormat = useCallback(
    (before: string, after: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const replacement = before + (selectedText || 'text') + after;

      const newValue = value.substring(0, start) + replacement + value.substring(end);
      onChange(newValue);

      setTimeout(() => {
        textarea.focus();
        const cursorStart = start + before.length;
        const cursorEnd = cursorStart + (selectedText || 'text').length;
        textarea.setSelectionRange(cursorStart, cursorEnd);
      }, 0);
    },
    [value, onChange]
  );

  return (
    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden whatsapp-editor">
       <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
         {FORMAT_BUTTONS.map((btn) => (
           <Button key={btn.title} variant="tertiary" size="xs" className="w-7 h-7 rounded-md" type="button" onClick={() => applyFormat(btn.wrap[0], btn.wrap[1])} title={btn.title}>
             <btn.icon className="w-3.5 h-3.5" />
           </Button>
         ))}
         <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">WhatsApp formatting</span>
       </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full p-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm resize-y focus:outline-none"
      />
    </div>
  );
};
