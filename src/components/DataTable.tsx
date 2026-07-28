import React, { useEffect, useRef } from 'react';
import { DataTable } from 'simple-datatables';
import 'simple-datatables/dist/style.css';

interface DataTableProps {
  children: React.ReactNode;
  options?: Record<string, any>;
  className?: string;
}

export const DataTableWrapper: React.FC<DataTableProps> = ({ 
  children, 
  options = {},
  className = '' 
}) => {
  const tableRef = useRef<HTMLTableElement>(null);
  const dtRef = useRef<DataTable | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!tableRef.current) return;
    
    const timeoutId = setTimeout(() => {
      if (tableRef.current && !dtRef.current) {
        try {
          dtRef.current = new DataTable(tableRef.current, {
            searchable: true,
            sortable: true,
            paging: true,
            perPage: 10,
            perPageSelect: [5, 10, 15, 20, 25],
            searchMethod: (query, cell) => {
              const cellText = String(cell?.text || cell?.data || '').toLowerCase();
              return query.some((q: string) => cellText.includes(q.toLowerCase()));
            },
            labels: {
              placeholder: 'Search...',
              searchTitle: 'Search within table',
              perPage: 'entries per page',
              noRows: 'No entries found',
              noResults: 'No results match your search query',
              info: 'Showing {start} to {end} of {rows} entries',
            },
            ...optionsRef.current,
          });
        } catch (error) {
          console.error('Failed to initialize DataTable:', error);
        }
      }
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (dtRef.current) {
        try {
          dtRef.current.destroy();
        } catch (error) {
          // Ignore destroy errors
        }
        dtRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`datatable-container ${className}`}>
      <table ref={tableRef} className={className}>
        {children}
      </table>
    </div>
  );
};
