/**
 * Browser Monitor Service
 * Connects to Chrome via DevTools Protocol and logs all console/network activity
 *
 * Usage: node browser-monitor.js
 *
 * Chrome must be running with: --remote-debugging-port=9222
 */

import CDP from 'chrome-remote-interface';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOG_DIR = path.join(__dirname, 'browser-logs');
const CONSOLE_LOG = path.join(LOG_DIR, 'console.log');
const NETWORK_LOG = path.join(LOG_DIR, 'network.log');
const ERRORS_LOG = path.join(LOG_DIR, 'errors.log');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Clear old logs
[CONSOLE_LOG, NETWORK_LOG, ERRORS_LOG].forEach(log => {
    if (fs.existsSync(log)) {
        fs.unlinkSync(log);
    }
});

function log(type, message) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;

    console.log(`[${type}] ${message}`);

    switch(type) {
        case 'CONSOLE':
            fs.appendFileSync(CONSOLE_LOG, logLine);
            break;
        case 'NETWORK':
            fs.appendFileSync(NETWORK_LOG, logLine);
            break;
        case 'ERROR':
            fs.appendFileSync(ERRORS_LOG, logLine);
            break;
    }
}

async function startMonitoring() {
    try {
        log('INFO', '🔍 Connecting to Chrome DevTools Protocol on port 9222...');

        const client = await CDP({ port: 9222 });
        log('INFO', '✅ Connected to Chrome');

        const { Console, Network, Debugger, Runtime } = client;

        // Enable console events
        await Console.enable();
        log('INFO', 'Console monitoring enabled');

        // Enable network events
        await Network.enable();
        log('INFO', 'Network monitoring enabled');

        // Enable debugger to catch exceptions
        await Debugger.enable();
        log('INFO', 'Debugger enabled');

        // Listen to console messages
        Console.messageAdded(({ message }) => {
            const { level, text, url, lineNumber } = message;
            const source = url ? `${path.basename(url)}:${lineNumber}` : 'unknown';
            log('CONSOLE', `[${level.toUpperCase()}] ${text} (${source})`);
        });

        // Listen to console exceptions
        Runtime.exceptionThrown(({ exceptionDetails }) => {
            const { text, scriptId, lineNumber, columnNumber } = exceptionDetails;
            log('ERROR', `Exception: ${text} at line ${lineNumber}:${columnNumber}`);
        });

        // Listen to network requests
        let requestCounter = 0;
        const activeRequests = new Map();

        Network.requestWillBeSent(({ request, requestId, timestamp }) => {
            requestCounter++;
            activeRequests.set(requestId, { request, startTime: timestamp });
            log('NETWORK', `[${requestCounter}] ${request.method} ${request.url}`);
        });

        Network.responseReceived(({ response, requestId }) => {
            const req = activeRequests.get(requestId);
            if (req) {
                const status = response.status;
                const statusText = response.statusText;
                log('NETWORK', `    ↳ Response: ${status} ${statusText}`);
            }
        });

        Network.loadingFailed(({ requestId, errorText }) => {
            log('ERROR', `Network Failed: ${errorText}`);
            activeRequests.delete(requestId);
        });

        log('INFO', '📡 Monitoring browser. Press Ctrl+C to stop.');
        log('INFO', `Logs saved to: ${LOG_DIR}`);

    } catch (err) {
        log('ERROR', `Failed to connect: ${err.message}`);
        log('ERROR', 'Make sure Chrome is running with: --remote-debugging-port=9222');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('INFO', '🛑 Monitoring stopped');
    process.exit(0);
});

startMonitoring();
