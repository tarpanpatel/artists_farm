import type { TableStyles } from 'react-data-table-component';

/**
 * Unified Flowbite-React Table theme specification for react-data-table-component.
 * Conforms to Flowbite Table theme (node_modules/flowbite-react/dist/components/Table/theme.js & https://flowbite.com/application-ui/demo/pages/datatables/):
 *  - Header: bg-gray-50 dark:bg-gray-700, text-xs uppercase text-gray-700 dark:text-gray-400, px-4/px-6 py-3
 *  - Body: text-sm text-gray-500 dark:text-gray-400, px-4/px-6 py-3.5
 *  - Row hover: hover:bg-gray-50 dark:hover:bg-gray-700
 */
export const flowbiteTableCustomStyles: TableStyles = {
  table: {
    style: {
      backgroundColor: 'transparent',
    },
  },
  tableWrapper: {
    style: {
      backgroundColor: 'transparent',
    },
  },
  header: {
    style: {
      backgroundColor: 'transparent',
      minHeight: 0,
      padding: 0,
    },
  },
  subHeader: {
    style: {
      padding: 0,
      minHeight: 0,
      backgroundColor: 'transparent',
    },
  },
  head: {
    style: {
      backgroundColor: 'var(--table-head-bg, #f9fafb)',
    },
  },
  headRow: {
    style: {
      backgroundColor: 'var(--table-head-bg, #f9fafb)',
      borderBottomWidth: '1px',
      borderBottomStyle: 'solid',
      borderBottomColor: 'var(--table-border-color, #e5e7eb)',
      minHeight: '44px',
    },
  },
  headCells: {
    style: {
      backgroundColor: 'var(--table-head-bg, #f9fafb)',
      fontSize: '0.75rem',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      color: 'var(--table-head-color, #374151)',
      paddingLeft: '14px',
      paddingRight: '14px',
      paddingTop: '12px',
      paddingBottom: '12px',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      lineHeight: '1.3',
    },
  },
  rows: {
    style: {
      minHeight: '52px',
      backgroundColor: 'var(--table-row-bg, #ffffff)',
      borderBottomWidth: '1px',
      borderBottomStyle: 'solid',
      borderBottomColor: 'var(--table-border-color, #e5e7eb)',
    },
    highlightOnHoverStyle: {
      backgroundColor: 'var(--table-row-hover, #f9fafb)',
      borderBottomColor: 'var(--table-border-color, #e5e7eb)',
      outline: 'none',
    },
  },
  cells: {
    style: {
      fontSize: '0.875rem',
      color: 'var(--table-body-color, #6b7280)',
      paddingLeft: '16px',
      paddingRight: '16px',
      paddingTop: '14px',
      paddingBottom: '14px',
    },
  },
  pagination: {
    style: {
      fontSize: '0.75rem',
      color: 'var(--table-body-color, #6b7280)',
      backgroundColor: 'var(--table-row-bg, #ffffff)',
      borderTopWidth: '1px',
      borderTopStyle: 'solid',
      borderTopColor: 'var(--table-border-color, #e5e7eb)',
      minHeight: '48px',
    },
    pageButtonsStyle: {
      borderRadius: '6px',
      height: '32px',
      width: '32px',
      padding: '6px',
      margin: '0 2px',
      cursor: 'pointer',
      transition: '0.15s ease',
      fill: 'var(--table-head-color, #374151)',
    },
  },
};


