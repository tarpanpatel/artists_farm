<?php
/**
 * Tenant Closure Requests
 *
 * Ground Code bills offline only (UPI/NEFT, Root Admin sets status/expiry by
 * hand - see PRODUCT_STRATEGY.md), so there is no automated cancel/delete flow
 * anywhere in this app. This is the tenant-facing REQUEST side of that: a
 * property owner can ask to cancel (don't renew, keep everything until expiry)
 * or close (remove account + data) their own account, and it's ALWAYS just a
 * request - nothing here ever mutates a tenant's subscription_status or calls
 * delete_tenant (php/api/router.php's existing root-admin-only hard cascade
 * delete). A human Root Admin sees it and acts on it manually.
 */

require_once __DIR__ . '/../config/schema_cache.php';

function ensureTenantClosureRequestsSchema(PDO $pdo): void {
    if ($pdo->inTransaction()) {
        // DDL implicitly commits any open transaction - same reasoning as
        // every other self-heal block in this codebase (see outbox.php's
        // ensureChannexOutboxSchema() for the original writeup).
        return;
    }

    if (!isSchemaVerified('schema_tenant_closure_requests')) {
        try {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `tenant_closure_requests` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `tenant_id` INT NOT NULL,
                    `requested_by` INT NULL,
                    `requested_by_name` VARCHAR(150) NULL,
                    `request_type` ENUM('cancel','delete') NOT NULL,
                    `reason` TEXT NULL,
                    `status` ENUM('pending','acknowledged','completed','declined') NOT NULL DEFAULT 'pending',
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    `resolved_at` TIMESTAMP NULL DEFAULT NULL,
                    `resolved_by` VARCHAR(150) NULL,
                    `admin_note` TEXT NULL,
                    KEY `idx_tenant_closure_tenant` (`tenant_id`, `status`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            ");
            markSchemaVerified('schema_tenant_closure_requests');
        } catch (PDOException $e) {}
    }
}

/**
 * One open (pending) request per tenant at a time - not a DB constraint
 * (status transitions mean a tenant legitimately accumulates many resolved
 * rows over its lifetime), just a check before insert.
 */
function getOpenTenantClosureRequest(PDO $pdo, int $tenantId): ?array {
    $stmt = $pdo->prepare("SELECT * FROM tenant_closure_requests WHERE tenant_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1");
    $stmt->execute([$tenantId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/**
 * Dual-channel notification to ROOT ADMIN (the platform operator), not the
 * tenant - copies php/licenses/licenses.php's sendLicenseExpiryNotification()
 * shape exactly: each channel independently try/caught, one failing must
 * never block the other or the request itself (the DB row is already
 * committed by the time this runs).
 */
function notifyRootAdminOfClosureRequest(PDO $pdo, array $request, array $tenant): void {
    $typeLabel = $request['request_type'] === 'delete' ? 'CLOSE ACCOUNT' : 'CANCEL SUBSCRIPTION';
    $emoji = $request['request_type'] === 'delete' ? '🗑️' : '⚠️';
    $reasonText = trim((string)($request['reason'] ?? '')) ?: '(no reason given)';

    $message = "$emoji *New Tenant Request: $typeLabel*\n\n";
    $message .= "*Tenant:* " . ($tenant['name'] ?? "Tenant #{$request['tenant_id']}") . "\n";
    $message .= "*Requested by:* " . ($request['requested_by_name'] ?? 'Unknown') . "\n";
    $message .= "*Reason:* $reasonText\n\n";
    $message .= "Review and act on this from Platform Property Management.";

    try {
        if (file_exists(__DIR__ . '/../telegram/sender.php')) {
            require_once __DIR__ . '/../telegram/sender.php';
        }
        if (function_exists('sendAdminTelegramMessage')) {
            // Non-property-scoped platform admin send (sibling to
            // sendFinanceTelegramMessage) - NOT sendPropertyTelegramMessage,
            // which targets one property's own staff, the wrong audience for
            // a platform-level request like this.
            sendAdminTelegramMessage($message);
        }
    } catch (Throwable $eTg) {
        error_log("Tenant closure request Telegram notification failed for tenant {$request['tenant_id']}: " . $eTg->getMessage());
    }

    try {
        require_once __DIR__ . '/../utils/mailer.php';
        require_once __DIR__ . '/../api/configuration.php';
        $supportEmail = null;
        try {
            $cfgStmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'saas_support_contact' LIMIT 1");
            $cfgStmt->execute();
            $raw = $cfgStmt->fetchColumn();
            $decoded = $raw ? json_decode($raw, true) : null;
            $supportEmail = $decoded['support_email'] ?? null;
        } catch (Throwable $eCfg) {}
        // Same default getSaasPlatformConfig() itself falls back to, so this
        // notification still reaches somewhere even on a fresh install where
        // nobody has ever saved the support-contact config yet.
        $supportEmail = $supportEmail ?: 'support@ground-code.com';

        $subject = "$emoji New Tenant Request: $typeLabel - " . ($tenant['name'] ?? "Tenant #{$request['tenant_id']}");
        $body = "<p>$emoji <b>New Tenant Request: $typeLabel</b></p>"
            . "<p><b>Tenant:</b> " . htmlspecialchars($tenant['name'] ?? "Tenant #{$request['tenant_id']}") . "<br>"
            . "<b>Requested by:</b> " . htmlspecialchars($request['requested_by_name'] ?? 'Unknown') . "<br>"
            . "<b>Reason:</b> " . nl2br(htmlspecialchars($reasonText)) . "</p>"
            . "<p>Review and act on this from Platform Property Management.</p>";
        $emailResult = sendSmtpEmail($pdo, $supportEmail, $subject, $body);
        if (!($emailResult['success'] ?? false)) {
            error_log("Tenant closure request email notification failed for tenant {$request['tenant_id']}: " . ($emailResult['error'] ?? 'unknown error'));
        }
    } catch (Throwable $eMail) {
        error_log("Tenant closure request email notification exception for tenant {$request['tenant_id']}: " . $eMail->getMessage());
    }
}
