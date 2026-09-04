import React, { useRef, useCallback, useEffect } from 'react';
import { Bold, Italic, Strikethrough, List, Quote, Code } from './icons/FlowbiteIcons';
import { Button } from './Button';

interface WhatsAppEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

/**
 * WYSIWYG editor whose VALUE is still WhatsApp markup.
 *
 * The editor used to be a plain textarea, so the author stared at raw markup
 * ("*~66~*", "> 55") instead of the formatting it represents (reported 4 Sep
 * 2026 with a screenshot of exactly that). This renders the formatting instead,
 * while `value`/`onChange` keep speaking WhatsApp markup in both directions -
 * the string that gets saved and later sent to a guest is byte-identical to
 * what the textarea produced, so nothing downstream (the voucher template,
 * `{other_notes}` substitution, the message a guest actually receives) changes.
 *
 * Only inline styles WhatsApp itself supports are offered. There is deliberately
 * no colour/size/font control: anything WhatsApp can't express would be silently
 * dropped on send, which is worse than not offering it.
 */

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** WhatsApp markup -> display HTML. */
function markupToHtml(markup: string): string {
  if (!markup) return '';

  const inline = (text: string): string => {
    let out = escapeHtml(text);
    // Monospace first: its delimiters can legally contain the other markers.
    out = out.replace(/```([\s\S]+?)```/g, '<code>$1</code>');
    // Each marker must wrap at least one non-space, non-marker character, so a
    // lone "*" typed mid-sentence is left alone rather than eating the rest of
    // the line looking for a partner.
    out = out.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');
    out = out.replace(/_([^_\n]+)_/g, '<em>$1</em>');
    out = out.replace(/~([^~\n]+)~/g, '<s>$1</s>');
    return out;
  };

  return markup
    .split('\n')
    .map((line) => {
      const quoted = line.match(/^>\s?(.*)$/);
      if (quoted) return `<blockquote>${inline(quoted[1]) || '<br>'}</blockquote>`;
      const bullet = line.match(/^[•-]\s+(.*)$/);
      if (bullet) return `<div data-bullet="1">• ${inline(bullet[1])}</div>`;
      return `<div>${inline(line) || '<br>'}</div>`;
    })
    .join('');
}

/** Display HTML -> WhatsApp markup. Walks the DOM rather than regexing innerHTML,
 *  so a browser's own contentEditable output (nested <b><i>, stray spans from a
 *  paste, &nbsp;) still serialises correctly. */
function htmlToMarkup(root: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.textContent || '').replace(/ /g, ' ');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join('');
    const tag = el.tagName.toLowerCase();

    switch (tag) {
      case 'br':
        return '\n';
      case 'strong':
      case 'b':
        return inner.trim() ? `*${inner}*` : inner;
      case 'em':
      case 'i':
        return inner.trim() ? `_${inner}_` : inner;
      case 's':
      case 'strike':
      case 'del':
        return inner.trim() ? `~${inner}~` : inner;
      case 'code':
      case 'pre':
        return inner.trim() ? '```' + inner + '```' : inner;
      case 'blockquote':
        return `> ${inner}`;
      default:
        return inner;
    }
  };

  // Top-level children are the lines. A bare text node at the root (what the
  // browser leaves after the last line is deleted) is still one line.
  const lines: string[] = [];
  root.childNodes.forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      if (tag === 'div' || tag === 'p' || tag === 'blockquote') {
        // A <div> the browser built by wrapping several lines can itself hold
        // <br>s; split so one visual line stays one markup line.
        walk(el).split('\n').forEach((l) => lines.push(l));
        return;
      }
      if (tag === 'br') {
        lines.push('');
        return;
      }
    }
    const text = walk(child);
    if (lines.length === 0) lines.push(text);
    else lines[lines.length - 1] += text;
  });

  return lines.join('\n').replace(/​/g, '');
}

const FORMAT_BUTTONS = [
  { icon: Bold, command: 'bold', title: 'Bold' },
  { icon: Italic, command: 'italic', title: 'Italic' },
  { icon: Strikethrough, command: 'strikeThrough', title: 'Strikethrough' },
  { icon: List, command: 'bullet', title: 'Bullet list' },
  { icon: Quote, command: 'quote', title: 'Quote' },
  { icon: Code, command: 'code', title: 'Monospace' },
] as const;

export const WhatsAppEditor: React.FC<WhatsAppEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type your message here...',
  rows = 4,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  // The markup this editor itself last emitted. Re-rendering innerHTML while
  // the caret is inside the element resets it to the start, so the DOM is only
  // rebuilt when `value` changed for some reason OTHER than the user typing
  // here (a form reset, loading a different property).
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmitted.current) return;
    el.innerHTML = markupToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  const emit = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const markup = htmlToMarkup(el);
    lastEmitted.current = markup;
    onChange(markup);
  }, [onChange]);

  const applyFormat = useCallback(
    (command: (typeof FORMAT_BUTTONS)[number]['command']) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();

      if (command === 'bold' || command === 'italic' || command === 'strikeThrough') {
        // execCommand is formally deprecated but is the only API that applies a
        // style to the current selection and keeps the caret where the user left
        // it, across every browser this app supports. The alternative is
        // hand-rolled Range surgery, which is far more code and more ways to be
        // subtly wrong. Revisit if/when a standard replacement actually ships.
        document.execCommand(command);
        emit();
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const text = selection.toString();

      if (command === 'code') {
        document.execCommand('insertHTML', false, `<code>${escapeHtml(text || 'text')}</code>`);
      } else if (command === 'quote') {
        document.execCommand('insertHTML', false, `<blockquote>${escapeHtml(text || 'text')}</blockquote>`);
      } else if (command === 'bullet') {
        document.execCommand('insertHTML', false, `<div data-bullet="1">• ${escapeHtml(text || 'text')}</div>`);
      }
      emit();
    },
    [emit]
  );

  // Enter makes a new line, not a new paragraph with browser-default margins,
  // and paste arrives as plain text so a copy from a styled page can't smuggle
  // in colours/fonts WhatsApp would drop on send anyway.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      emit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    emit();
  };

  return (
    <div className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden whatsapp-editor">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        {FORMAT_BUTTONS.map((btn) => (
          <Button
            key={btn.title}
            variant="tertiary"
            size="xs"
            className="w-7 h-7 rounded-md"
            type="button"
            // onMouseDown, not onClick: a click would blur the editor first and
            // collapse the selection the format is meant to apply to.
            onMouseDown={(e) => {
              e.preventDefault();
              applyFormat(btn.command);
            }}
            title={btn.title}
          >
            <btn.icon className="w-3.5 h-3.5" />
          </Button>
        ))}
        <span className="ml-auto text-2xs text-slate-400 dark:text-slate-500">WhatsApp formatting</span>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        style={{ minHeight: `${Math.max(rows, 2) * 1.5 + 1.5}rem` }}
        className="w-full p-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm overflow-y-auto focus:outline-none whatsapp-editor-surface"
      />
    </div>
  );
};
