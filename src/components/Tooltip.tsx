import React from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  return (
    <span className="relative inline-flex group cursor-help tooltip">
      {children}
      <span
        role="tooltip"
        className="absolute left-1/2 bottom-full z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg opacity-0 transition-opacity duration-150 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 tooltip__content"
      >
        {content}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800 tooltip__arrow" />
      </span>
    </span>
  );
};
