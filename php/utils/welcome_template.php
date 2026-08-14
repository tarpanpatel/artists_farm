<?php
/**
 * utils/welcome_template.php
 * Tenant welcome message: one shared default template + substitution logic,
 * used for both the login-credentials email and the "Share via WhatsApp"
 * button in the Root Admin's Add Tenant flow - same "root admin may
 * customize, sensible default if they don't" shape as the WhatsApp booking
 * voucher template (src/utils/whatsappVoucherTemplate.ts) and the Telegram
 * templates. Stored under the `tenant_welcome_template` system_settings key.
 */

if (!defined('DEFAULT_TENANT_WELCOME_TEMPLATE')) {
    define('DEFAULT_TENANT_WELCOME_TEMPLATE',
        "🎉 Welcome to Ground Code, {tenant_name}!\n\n" .
        "Your property management account is ready.\n\n" .
        "🔗 Login: {login_url}\n" .
        "📱 Username (your phone number): {username}\n" .
        "🔑 Temporary Passcode: {temp_passcode}\n\n" .
        "You'll be asked to set a new 6-digit passcode the first time you log in.\n\n" .
        "Need help? Just reply to this message."
    );
}

if (!function_exists('renderTenantWelcomeTemplate')) {
    function renderTenantWelcomeTemplate(string $template, array $values): string {
        $result = $template;
        foreach ($values as $key => $val) {
            $result = str_replace('{' . $key . '}', (string)($val ?? ''), $result);
        }
        return $result;
    }
}

if (!function_exists('getTenantWelcomeTemplate')) {
    function getTenantWelcomeTemplate(PDO $pdo): string {
        try {
            $stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'tenant_welcome_template' LIMIT 1");
            $stmt->execute();
            $val = $stmt->fetchColumn();
            return $val ?: DEFAULT_TENANT_WELCOME_TEMPLATE;
        } catch (PDOException $e) {
            return DEFAULT_TENANT_WELCOME_TEMPLATE;
        }
    }
}

