import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { recordTelescopeLog } from './utils/telescopeLogger';

// Global error handlers to log JS errors to Telescope (cache buster v2)
window.addEventListener('error', (event) => {
  recordTelescopeLog({
    portal: 'client',
    severity: 'ERROR',
    msg: `Uncaught Error: ${event.message}`,
    origin: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'Global Context',
    details: { stack: event.error?.stack, message: event.message }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  recordTelescopeLog({
    portal: 'client',
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
