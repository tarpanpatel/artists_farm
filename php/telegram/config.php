<?php
/**
 * telegram/config.php
 * Central Telegram Bot Tokens & Channel Mappings
 */

if (!defined('TELEGRAM_BOT_TOKEN')) {
    define('TELEGRAM_BOT_TOKEN', '8999394059:AAHGKM4gFvH6IIQtOEiuiKEL7ewflHSa6DU'); 
}

$is_local = (isset($_SERVER['HTTP_HOST']) && in_array($_SERVER['HTTP_HOST'], ['localhost', '127.0.0.1', '::1']));

if ($is_local) {
    if (!defined('TELEGRAM_KITCHEN_CHAT_ID')) define('TELEGRAM_KITCHEN_CHAT_ID', '-5511705268'); 
    if (!defined('TELEGRAM_ADMIN_CHAT_ID'))   define('TELEGRAM_ADMIN_CHAT_ID', '-5362212071'); 
    if (!defined('TELEGRAM_FINANCE_CHAT_ID')) define('TELEGRAM_FINANCE_CHAT_ID', '-5511705268');
} else {
    if (!defined('TELEGRAM_KITCHEN_CHAT_ID')) define('TELEGRAM_KITCHEN_CHAT_ID', '-5456387701'); 
    if (!defined('TELEGRAM_ADMIN_CHAT_ID'))   define('TELEGRAM_ADMIN_CHAT_ID', '-5415746187'); 
    if (!defined('TELEGRAM_FINANCE_CHAT_ID')) define('TELEGRAM_FINANCE_CHAT_ID', '-5303969309');
}
