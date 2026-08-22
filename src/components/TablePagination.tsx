import React from 'react';
import { ChevronLeft, ChevronRight } from './icons/FlowbiteIcons';

// Shared pager for the plain Flowbite <Table>s that replaced
// react-data-table-component (22 Aug 2026 "remove react-data-table-component
// site-wide" sweep - see DataTable usages this superseded). Flowbite's
// <Table> has no built-in pagination of its own (unlike DataTable, which
// bundled page-size selection, sorting, etc.) - this intentionally only
// covers Prev/Next + a fixed page size, matching the simple pagination each
// of these screens already hand-rolled for their mobile card view. One
// shared component instead of ~20 near-identical copies (desktop + mobile,
// across every converted table).
interface TablePaginationProps {
  page: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({ page, totalItems, pageSize, onPageChange, itemLabel = 'items' }) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 table-pagination">
      <button
        type="button"
        disabled={page === 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" /> Previous
      </button>
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
        Page {page} of {totalPages} <span className="text-gray-300 dark:text-gray-600">|</span> {totalItems} {itemLabel}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-semibold text-gray-700 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
      >
        Next <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
