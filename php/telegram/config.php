<?php
/**
 * telegram/config.php
 * Telegram Bot Tokens & Channel Mappings (from environment variables only)
 * CRITICAL: All secrets must come from .env file, never hardcoded
 */

// Bot token from environment variable only - no fallback, no hardcoding
if (!defined('TELEGRAM_BOT_TOKEN')) {
    define('TELEGRAM_BOT_TOKEN', getenv('TELEGRAM_BOT_TOKEN') ?: null);
}

// Chat IDs from environment variables - supports local/prod separation via env
if (!defined('TELEGRAM_KITCHEN_CHAT_ID')) {
    define('TELEGRAM_KITCHEN_CHAT_ID', getenv('TELEGRAM_KITCHEN_CHAT_ID') ?: null);
}
if (!defined('TELEGRAM_ADMIN_CHAT_ID')) {
    define('TELEGRAM_ADMIN_CHAT_ID', getenv('TELEGRAM_ADMIN_CHAT_ID') ?: null);
}
if (!defined('TELEGRAM_FINANCE_CHAT_ID')) {
    define('TELEGRAM_FINANCE_CHAT_ID', getenv('TELEGRAM_FINANCE_CHAT_ID') ?: null);
}
