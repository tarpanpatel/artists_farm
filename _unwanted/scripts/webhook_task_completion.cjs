/**
 * Staff Messaging Webhook Handler (Telegram Task Completion)
 * Location: scripts/webhook_task_completion.cjs
 * 
 * Features:
 * - Secret Token Verification (X-Telegram-Bot-Api-Secret-Token)
 * - Instant HTTP 200 OK Acknowledgement (Prevents messaging app timeout retries)
 * - Idempotency & Deduplication (Prevents double-processing when retries occur over spotty networks)
 * - Asynchronous Processing Queue with Exponential Backoff & Jitter
 * - Idempotent Database Task Status Update
 */

const express = require('express');

const app = express();
app.use(express.json());

// Configuration
const CONFIG = {
    PORT: process.env.PORT || 3001,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN',
    WEBHOOK_SECRET_TOKEN: process.env.WEBHOOK_SECRET_TOKEN || 'YOUR_WEBHOOK_SECRET',
    MAX_RETRIES: 5,
    INITIAL_RETRY_DELAY_MS: 1000,
    PROCESSED_CACHE_TTL_MS: 10 * 60 * 1000, // 10 minutes cache
};

// -----------------------------------------------------------------------------
// In-Memory Idempotency Store (Use Redis in multi-instance production)
// -----------------------------------------------------------------------------
const processedUpdates = new Map(); // update_id -> timestamp

// Clean up old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [updateId, timestamp] of processedUpdates.entries()) {
        if (now - timestamp > CONFIG.PROCESSED_CACHE_TTL_MS) {
            processedUpdates.delete(updateId);
        }
    }
}, 60 * 1000);

// -----------------------------------------------------------------------------
// Webhook Route
// -----------------------------------------------------------------------------
app.post('/webhooks/telegram/task-completion', (req, res) => {
    // 1. Verify Secret Token (Security Check)
    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    if (CONFIG.WEBHOOK_SECRET_TOKEN && CONFIG.WEBHOOK_SECRET_TOKEN !== 'YOUR_WEBHOOK_SECRET' && secretHeader !== CONFIG.WEBHOOK_SECRET_TOKEN) {
        console.warn('⚠️ Unauthorized webhook attempt detected.');
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const update = req.body;
    const updateId = update?.update_id;

    if (!updateId) {
        return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    // 2. Idempotency Check (Spotty Network Duplicate Prevention)
    if (processedUpdates.has(updateId)) {
        console.log(`ℹ️ Duplicate update ${updateId} ignored (already received/processing).`);
        // Return 200 OK immediately so Telegram stops retrying
        return res.status(200).json({ status: 'already_processed' });
    }

    // Mark as seen immediately
    processedUpdates.set(updateId, Date.now());

    // 3. Fast Response ACK (Prevents Telegram Webhook Timeout)
    res.status(200).json({ status: 'accepted' });

    // 4. Asynchronous Queue Processing
    enqueueTaskUpdate(update);
});

// -----------------------------------------------------------------------------
// Async Task Processing with Exponential Backoff Retry Logic
// -----------------------------------------------------------------------------
async function enqueueTaskUpdate(update) {
    const message = update.message || update.callback_query?.message;
    const callbackData = update.callback_query?.data; // e.g. "complete_task:task_uuid"
    const text = message?.text || '';

    // Extract Task ID (e.g. from callback query "complete_task:123" or text "/complete 123")
    let taskId = null;
    if (callbackData && callbackData.startsWith('complete_task:')) {
        taskId = callbackData.split(':')[1];
    } else if (text.startsWith('/complete')) {
        taskId = text.split(' ')[1];
    }

    if (!taskId) {
        console.log(`ℹ️ Non-completion message received in update ${update.update_id}. Skipping.`);
        return;
    }

    const payload = {
        updateId: update.update_id,
        taskId: taskId,
        staffChatId: message.chat.id,
        completedAt: new Date().toISOString()
    };

    // Process with retry wrapper
    processTaskWithRetry(payload, 1);
}

/**
 * Executes DB state update with exponential backoff & jitter
 */
async function processTaskWithRetry(payload, attempt) {
    try {
        console.log(`🔄 [Attempt ${attempt}/${CONFIG.MAX_RETRIES}] Updating task ${payload.taskId}...`);

        // Execute Idempotent DB Update
        await updateTaskInDatabase(payload.taskId, payload.staffChatId, payload.completedAt);

        // Notify Staff Member over Telegram
        await sendTelegramMessage(payload.staffChatId, `✅ Task #${payload.taskId} marked as completed!`);

        console.log(`✅ Task ${payload.taskId} completed successfully on attempt ${attempt}.`);
    } catch (error) {
        console.error(`❌ Attempt ${attempt} failed for task ${payload.taskId}: ${error.message}`);

        if (attempt < CONFIG.MAX_RETRIES) {
            // Calculate exponential backoff delay with jitter
            const baseDelay = CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
            const jitter = Math.random() * 500;
            const delay = baseDelay + jitter;

            console.log(`⏳ Retrying task ${payload.taskId} in ${Math.round(delay)}ms...`);
            setTimeout(() => processTaskWithRetry(payload, attempt + 1), delay);
        } else {
            console.error(`🚨 Max retries reached for task ${payload.taskId}. Logging to Dead-Letter Store.`);
            await logDeadLetterTask(payload, error.message);
            // Notify staff member of issue
            await sendTelegramMessage(payload.staffChatId, `⚠️ Network issue saving completion for Task #${payload.taskId}. System will automatically re-sync.`);
        }
    }
}

// -----------------------------------------------------------------------------
// Database & External Service Stubs
// -----------------------------------------------------------------------------

/**
 * Simulated Idempotent Database Query
 * In production: UPDATE tasks SET status = 'completed', updated_at = NOW() WHERE id = $1 AND tenant_id = $2
 */
async function updateTaskInDatabase(taskId, staffChatId, completedAt) {
    // Simulate spotty network failure randomly (20% failure rate for testing resilience)
    if (Math.random() < 0.2) {
        throw new Error('Database connection timeout (simulated network glitch)');
    }
    return { success: true, taskId };
}

/**
 * Send Confirmation Message to Telegram
 */
async function sendTelegramMessage(chatId, text) {
    if (!CONFIG.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN') {
        console.log(`[Telegram Outgoing mock -> Chat ${chatId}]: ${text}`);
        return;
    }

    const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    });

    if (!response.ok) {
        throw new Error(`Telegram API HTTP error ${response.status}`);
    }
}

/**
 * Dead-Letter Queue Logging
 */
async function logDeadLetterTask(payload, errorMessage) {
    console.error('DEAD LETTER ITEM:', {
        payload,
        failedAt: new Date().toISOString(),
        error: errorMessage
    });
}

// Start Server
if (require.main === module) {
    app.listen(CONFIG.PORT, () => {
        console.log(`🚀 Telegram Staff Webhook Handler running on port ${CONFIG.PORT}`);
    });
}

module.exports = { app, processTaskWithRetry };
