import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import 'simple-datatables/dist/style.css';
import { DataTable } from 'simple-datatables';
import { recordTelescopeLog } from './utils/telescopeLogger';

// Global DataTable initialization for all tables with class 'datatable'
const datatableInstances: any[] = [];
const initializedTables = new WeakSet<HTMLTableElement>();

function initDataTable(table: HTMLTableElement) {
  if (initializedTables.has(table)) return;
  try {
    const dt = new DataTable(table, {
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
    });
    initializedTables.add(table);
    datatableInstances.push(dt);
  } catch (error) {
    console.error('Failed to initialize DataTable:', error);
  }
}

function initAllDataTables() {
  const tables = document.querySelectorAll('table.datatable');
  tables.forEach((table) => {
    const htmlTable = table as HTMLTableElement;
    const hasRows = htmlTable.querySelectorAll('tbody tr').length > 0;
    if (hasRows) {
      initDataTable(htmlTable);
    }
  });
}

// Wait for the browser to paint before initializing tables
const rafId = requestAnimationFrame(() => {
  initAllDataTables();
});

// Expose a manual trigger for components that render tables later
(window as any).initDataTables = initAllDataTables;

// Global error handlers to log JS errors to Telescope
window.addEventListener('error', (event) => {
  recordTelescopeLog({
    portal: 'js',
    severity: 'ERROR',
    msg: `Uncaught Error: ${event.message}`,
    origin: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'Global Context',
    details: { stack: event.error?.stack, message: event.message }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  recordTelescopeLog({
    portal: 'js',
    severity: 'ERROR',
    msg: `Unhandled Promise Rejection: ${String(event.reason)}`,
    origin: 'Global Context',
    details: { reason: String(event.reason) }
  });
});

// Site-wide listener: clicking anywhere inside a date/datetime input opens the calendar picker
window.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (target && target.tagName === 'INPUT') {
    const input = target as HTMLInputElement;
    if (['date', 'datetime-local', 'month', 'time'].includes(input.type)) {
      try {
        if (typeof input.showPicker === 'function') {
          input.showPicker();
        }
      } catch (err) {
        // Picker already open or not supported
      }
    }
  }
}, true);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
