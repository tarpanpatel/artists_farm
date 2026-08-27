<?php
/**
 * 30-Day Trial Lifecycle & Subscription Renewal Cadence - Scheduled Task
 *
 * Runs daily via cron dispatcher:
 *   0 8 * * * /usr/bin/php /path/to/artists_farm/php/cron/trial_lifecycle_cadence.php
 *
 * Automated Follow-up Cadence for 30-Day Free Trials:
 *   - Day 1:  Welcome & Quick Setup Checklist
 *   - Day 3:  Operations Discovery (Staff, Petty Cash, Food POS)
 *   - Day 7:  One-Week Progress & Support Check-in
 *   - Day 14: Halfway Value Recap & Calendar Sync Tips
 *   - Day 21: Upcoming Renewal & Plan Selection Notice (9 days left)
 *   - Day 23: 7-Day Expiry & Invoice Readiness Notice (7 days left)
 *   - Day 28: 2-Day Urgent Renewal Notice (2 days left)
 *   - Day 30+: Trial Expiry & Transition Automation
 *
 * Deduplicated via `tenant_trial_cadence_logs` so each stage is sent exactly once.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../telegram/sender.php';
require_once __DIR__ . '/../telegram/templates.php';
require_once __DIR__ . '/../utils/mailer.php';

$logFile = __DIR__ . '/trial_lifecycle_cadence.log';
$timestamp = date('Y-m-d H:i:s');

function cadenceLog(string $file, string $message): void {
    file_put_contents($file, "$message\n", FILE_APPEND);
}

cadenceLog($logFile, "$timestamp - 30-Day Trial Lifecycle Cadence started");

function ensureTrialLifecycleCadenceSchema(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_trial_cadence_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenant_id INT NOT NULL,
        cadence_stage VARCHAR(64) NOT NULL,
        day_number INT NOT NULL,
        channel VARCHAR(50) NOT NULL DEFAULT 'all',
        recipient VARCHAR(255) DEFAULT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'sent',
        message TEXT DEFAULT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tenant_cadence_stage (tenant_id, cadence_stage),
        KEY idx_tenant_id (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    ensureTrialLifecycleCadenceSchema($pdo);

    // Load custom cadence settings and support info from system_settings
    $settingsStmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('saas_trial_cadence_config', 'saas_support_contact')");
    $settingsMap = $settingsStmt->fetchAll(PDO::FETCH_KEY_PAIR);

    $customCadence = !empty($settingsMap['saas_trial_cadence_config']) ? json_decode($settingsMap['saas_trial_cadence_config'], true) : [];
    $supportConfig = !empty($settingsMap['saas_support_contact']) ? json_decode($settingsMap['saas_support_contact'], true) : [];
    $supportPhone = $supportConfig['support_phone'] ?? '+91 95712 63474';

    // Fetch all active/trial tenants (skip demo/sales accounts)
    $stmt = $pdo->query("
        SELECT id, name, slug, email, phone, subscription_plan, subscription_status,
               plan_type, subscription_expires_at, is_demo, is_active, created_at
        FROM tenants
        WHERE (is_demo = 0 OR is_demo IS NULL)
          AND (is_active = 1 OR is_active IS NULL)
        ORDER BY id ASC
    ");
    $tenants = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($tenants)) {
        cadenceLog($logFile, "$timestamp - No active tenants found for lifecycle review");
        exit(0);
    }

    $now = time();
    $processedCount = 0;
    $actionsTaken = 0;

    foreach ($tenants as $tenant) {
        $tenantId = (int)$tenant['id'];
        $tenantName = $tenant['name'] ?: $tenant['slug'];
        $tenantEmail = trim($tenant['email'] ?? '');
        $status = strtolower($tenant['subscription_status'] ?? 'trial');
        $planType = $tenant['plan_type'] ?: 'Growth';
        
        $createdAtTs = !empty($tenant['created_at']) ? strtotime($tenant['created_at']) : $now;
        $dayAge = (int)floor(($now - $createdAtTs) / 86400);

        // Expiry calculation
        $expiresAt = $tenant['subscription_expires_at'];
        $daysUntilExpiry = null;
        if (!empty($expiresAt)) {
            $expiresAtTs = strtotime($expiresAt . ' 23:59:59');
            $daysUntilExpiry = (int)ceil(($expiresAtTs - $now) / 86400);
        }

        // Get tenant's primary property for Telegram dispatch and login URL
        $propStmt = $pdo->prepare("SELECT id, name, slug FROM properties WHERE tenant_id = ? ORDER BY id ASC LIMIT 1");
        $propStmt->execute([$tenantId]);
        $primaryProperty = $propStmt->fetch(PDO::FETCH_ASSOC);
        $primaryPropertyId = $primaryProperty ? (int)$primaryProperty['id'] : null;
        $propertyName = $primaryProperty ? $primaryProperty['name'] : $tenantName;
        $propertySlug = $primaryProperty ? $primaryProperty['slug'] : $tenant['slug'];
        $loginUrl = "https://staging.ground-code.com/{$propertySlug}";

        // Template interpolation map
        $vars = [
            'tenant_name' => $tenantName,
            'property_name' => $propertyName,
            'plan_type' => $planType,
            'expires_at' => $expiresAt ?: 'End of 30-Day Period',
            'days_left' => $daysUntilExpiry !== null ? $daysUntilExpiry : max(0, 30 - $dayAge),
            'login_url' => $loginUrl,
            'support_phone' => $supportPhone,
            'username' => $tenant['phone'] ?? '',
        ];

        $interpolate = function(string $text) use ($vars): string {
            foreach ($vars as $k => $v) {
                $text = str_replace('{' . $k . '}', (string)$v, $text);
            }
            return $text;
        };

        // Check which cadence stages have already been sent for this tenant
        $sentStagesStmt = $pdo->prepare("SELECT cadence_stage FROM tenant_trial_cadence_logs WHERE tenant_id = ?");
        $sentStagesStmt->execute([$tenantId]);
        $sentStages = $sentStagesStmt->fetchAll(PDO::FETCH_COLUMN);
        $sentSet = array_flip($sentStages);

        // Determine applicable cadence stage
        $applicableStages = [];

        // Helper to check if stage is enabled in custom cadence or default enabled
        $isStageEnabled = function(string $stageKey) use ($customCadence): bool {
            if (isset($customCadence[$stageKey]['enabled'])) {
                return (bool)$customCadence[$stageKey]['enabled'];
            }
            return true;
        };

        // Day 1 Welcome (1 day after creation)
        if ($dayAge >= 1 && !isset($sentSet['day_1_welcome']) && $status === 'trial' && $isStageEnabled('day_1_welcome')) {
            $conf = $customCadence['day_1_welcome'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_1_welcome',
                'day' => 1,
                'title' => $interpolate($conf['title'] ?? "Welcome to Ground Code — Day 1 Checklist"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "Welcome to Ground Code, {tenant_name}! Day 1 Setup Checklist"),
                'summary' => "Welcome to your 30-day free trial! Add your team and set up your room rates to get started.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nWelcome to Ground Code! Your 30-day full-access trial for {property_name} is live.\n\nHere is your Day 1 Quickstart:\n1. Open your property dashboard ({login_url})\n2. Add your team in Staff Management\n3. Connect Telegram for real-time alerts\n\nNeed help getting started? Contact support ({support_phone}) or reply to this email."),
                'telegram' => $interpolate($conf['telegram_message'] ?? "🏢 <b>GROUND CODE TRIAL STARTED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🎉 Welcome! Your 30-day full-access trial is active.\n👉 Finish your setup: Add staff, set room rates, and connect payment QR."),
            ];
        }

        // Day 3 Feature Discovery
        if ($dayAge >= 3 && !isset($sentSet['day_3_features']) && $status === 'trial' && $isStageEnabled('day_3_features')) {
            $conf = $customCadence['day_3_features'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_3_features',
                'day' => 3,
                'title' => $interpolate($conf['title'] ?? "Ground Code Tip: Cash Drawer & Petty Cash"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "Day 3 on Ground Code: Stop Petty Cash & Cash Leakage"),
                'summary' => "Track cash collections, staff emergency advances, and kitchen purchases with receipt photos.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nAre you tracking your daily property expenses on Ground Code yet?\n\nKey features for your first week:\n• Petty Cash Drawer: Log cash-in and cash-out with photo proof\n• Kitchen & Food POS: Instantly add meals and drinks to guest bills\n• Service Requests: Assign room cleaning and maintenance to staff\n\nLog in to explore: {login_url}"),
                'telegram' => $interpolate($conf['telegram_message'] ?? "💰 <b>GROUND CODE TIP: CASH CONTROL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📌 Track petty cash expenses and front-desk drawer balances with receipt photos.\n👉 Tap Petty Cash & Cash Drawer in your dashboard."),
            ];
        }

        // Day 7 One-Week Milestone
        if ($dayAge >= 7 && !isset($sentSet['day_7_milestone']) && $status === 'trial' && $isStageEnabled('day_7_milestone')) {
            $conf = $customCadence['day_7_milestone'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_7_milestone',
                'day' => 7,
                'title' => $interpolate($conf['title'] ?? "1 Week on Ground Code — How is it going?"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "1 Week on Ground Code — Your Operations Summary"),
                'summary' => "You have completed your first week on Ground Code! Check your analytics and revenue summary.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nCongratulations on completing your first week on Ground Code!\n\nCheck your Analytics Dashboard to see live metrics on occupancy, direct vs OTA revenue, and expense summaries.\n\nIf you have any questions or want a quick walkthrough for your team, we're here to help."),
                'telegram' => $interpolate($conf['telegram_message'] ?? "📊 <b>1-WEEK MILESTONE REACHED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n✨ You've completed 1 week on Ground Code! Check your live revenue analytics."),
            ];
        }

        // Day 14 Halfway Check-in
        if ($dayAge >= 14 && !isset($sentSet['day_14_halfway']) && $status === 'trial' && $isStageEnabled('day_14_halfway')) {
            $conf = $customCadence['day_14_halfway'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_14_halfway',
                'day' => 14,
                'title' => $interpolate($conf['title'] ?? "14 Days Remaining in Your Trial"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "Halfway through your Ground Code Trial — 14 Days Remaining"),
                'summary' => "Your 30-day trial is halfway through. Ensure your OTA calendars (Airbnb, Booking.com) are connected.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nYou are halfway through your 30-day trial of Ground Code for {property_name}.\n\nMake sure to connect your Airbnb and Booking.com iCal feeds in Settings → Calendar Sync to avoid double-bookings automatically.\n\nYour trial remains active until {expires_at}."),
                'telegram' => $interpolate($conf['telegram_message'] ?? "⏳ <b>HALFWAY TRIAL CHECK-IN</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n📅 14 days remaining in your trial (Expires: {expires_at}).\n💡 Tip: Sync your Airbnb / OTA calendars in Settings."),
            ];
        }

        // Day 21 (Upcoming Renewal Notice - 9 Days left)
        if ($dayAge >= 21 && !isset($sentSet['day_21_renewal_plan']) && ($daysUntilExpiry === null || $daysUntilExpiry <= 9) && $status === 'trial' && $isStageEnabled('day_21_renewal_plan')) {
            $conf = $customCadence['day_21_renewal_plan'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_21_renewal_plan',
                'day' => 21,
                'title' => $interpolate($conf['title'] ?? "9 Days Left in Your Free Trial — Plan Your Subscription"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "Ground Code Trial: 9 Days Left on {tenant_name}"),
                'summary' => "Your free trial expires in 9 days. Choose your plan to keep your property running smoothly without interruption.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nYour 30-day trial on Ground Code is entering its final week (ending on {expires_at}).\n\nTo ensure uninterrupted access for your staff, kitchen, and booking systems, please review your subscription options:\n• Plan: {plan_type}\n• Expiry Date: {expires_at}\n\nContact support ({support_phone}) to activate regular billing."),
                'telegram' => $interpolate($conf['telegram_message'] ?? "📋 <b>UPCOMING TRIAL RENEWAL</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 9 days left on your free trial (Expires: {expires_at}).\n👉 Contact your account manager to activate subscription."),
            ];
        }

        // Day 23 / 7-Day Expiry Notice
        if ($daysUntilExpiry !== null && $daysUntilExpiry <= 7 && $daysUntilExpiry > 2 && !isset($sentSet['day_23_7d_notice']) && $isStageEnabled('day_23_7d_notice')) {
            $conf = $customCadence['day_23_7d_notice'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_23_7d_notice',
                'day' => 23,
                'title' => $interpolate($conf['title'] ?? "⚠️ 7-Day Subscription Expiry Notice"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "URGENT: Your Ground Code Subscription Expires in 7 Days ({tenant_name})"),
                'summary' => "Your Ground Code subscription expires in {$daysUntilExpiry} days on {$expiresAt}.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nThis is a courtesy reminder that your Ground Code subscription for {tenant_name} will expire in {$daysUntilExpiry} days on {expires_at}.\n\nRenew now to avoid service interruption for your front-desk and staff.\n\nPlan: {plan_type}\nExpiry: {expires_at}"),
                'telegram' => $interpolate($conf['telegram_message'] ?? "⚠️ <b>7-DAY EXPIRATION NOTICE</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n🚨 Your subscription expires in 7 days on {expires_at}.\n👉 Renew to maintain uninterrupted operations."),
            ];
        }

        // Day 28 / 2-Day Final Notice
        if ($daysUntilExpiry !== null && $daysUntilExpiry <= 2 && $daysUntilExpiry >= 0 && !isset($sentSet['day_28_2d_notice']) && $isStageEnabled('day_28_2d_notice')) {
            $conf = $customCadence['day_28_2d_notice'] ?? [];
            $applicableStages[] = [
                'stage' => 'day_28_2d_notice',
                'day' => 28,
                'title' => $interpolate($conf['title'] ?? "🚨 Final Notice: 48 Hours Until Subscription Expiry"),
                'email_subject' => $interpolate($conf['email_subject'] ?? "FINAL NOTICE: 48 Hours Left on Ground Code ({tenant_name})"),
                'summary' => "Your subscription expires in {$daysUntilExpiry} day(s). Action required immediately.",
                'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nYour Ground Code subscription expires in {$daysUntilExpiry} day(s) on {expires_at}.\n\nPlease renew immediately to prevent staff logout and booking synchronization pauses.\n\nContact support ({support_phone}) to complete renewal."),
                'telegram' => $interpolate($conf['telegram_message'] ?? "🚨 <b>URGENT: 48 HOURS LEFT</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⏳ 2 days remaining until subscription expires ({expires_at}).\n👉 Action required immediately."),
            ];
        }

        // Day 30+ / Expired Transition & Notice
        if ($daysUntilExpiry !== null && $daysUntilExpiry < 0 && !isset($sentSet['day_30_expired'])) {
            // Auto-transition trial status to expired in database
            if ($status === 'trial' || $status === 'active') {
                $updStmt = $pdo->prepare("UPDATE tenants SET subscription_status = 'expired' WHERE id = ?");
                $updStmt->execute([$tenantId]);

                // Record in subscription history
                $histStmt = $pdo->prepare("
                    INSERT INTO tenant_subscription_history (tenant_id, old_plan_type, new_plan_type, old_expires_at, new_expires_at, note, recorded_by)
                    VALUES (?, ?, ?, ?, ?, 'Automated trial expiry by cron cadence worker', 'System Cron')
                ");
                $histStmt->execute([$tenantId, $planType, $planType, $expiresAt, $expiresAt]);
            }

            if ($isStageEnabled('day_30_expired')) {
                $conf = $customCadence['day_30_expired'] ?? [];
                $applicableStages[] = [
                    'stage' => 'day_30_expired',
                    'day' => 30,
                    'title' => $interpolate($conf['title'] ?? "Subscription Expired — Reactivate Ground Code"),
                    'email_subject' => $interpolate($conf['email_subject'] ?? "Your Ground Code Subscription for {tenant_name} Has Expired"),
                    'summary' => "Your subscription expired on {$expiresAt}. Reactivate your account to restore full access.",
                    'body' => $interpolate($conf['email_body'] ?? "Hello {tenant_name},\n\nYour Ground Code subscription for {tenant_name} expired on {expires_at}.\n\nYour property data, bookings, and guest records are safely stored. To reactivate full access for your team, please contact support ({support_phone}) to renew your subscription.\n\nThank you for using Ground Code!"),
                    'telegram' => $interpolate($conf['telegram_message'] ?? "🔒 <b>SUBSCRIPTION EXPIRED</b>\n━━━━━━━━━━━━━━━━━━\n🏷️ <b>Property:</b> {property_name}\n⚠️ Trial/Subscription expired on {expires_at}.\n👉 Contact support ({support_phone}) to reactivate account."),
                ];
            }
        }

        // Execute dispatches for all due stages for this tenant
        foreach ($applicableStages as $stageInfo) {
            $stageKey = $stageInfo['stage'];
            $dayNum = $stageInfo['day'];
            $msgTitle = $stageInfo['title'];
            $msgBody = $stageInfo['body'];
            $emailSubject = $stageInfo['email_subject'];

            $telegramSent = false;
            $emailSent = false;

            // 1. Telegram Dispatch (if property Telegram is connected)
            if ($primaryPropertyId) {
                try {
                    $tgMessage = !empty($stageInfo['telegram']) ? $stageInfo['telegram'] : (
                        "🏢 <b>GROUND CODE SUBSCRIPTION UPDATE</b>\n━━━━━━━━━━━━━━━━━━\n"
                        . "🏷️ <b>Property:</b> {$tenantName}\n"
                        . "📅 <b>Status:</b> " . ucfirst($status) . " (Plan: {$planType})\n"
                        . "📌 <b>{$msgTitle}</b>\n\n"
                        . "{$stageInfo['summary']}\n━━━━━━━━━━━━━━━━━━"
                    );

                    $tgResult = sendPropertyTelegramMessage($pdo, $primaryPropertyId, 'admin', $tgMessage, null, 'subscription_cadence_nudge');
                    if (is_array($tgResult) && empty($tgResult['skipped'])) {
                        $telegramSent = true;
                    }
                } catch (Exception $tgEx) {
                    cadenceLog($logFile, "$timestamp - Telegram error for tenant #{$tenantId}: " . $tgEx->getMessage());
                }
            }

            // 2. Email Dispatch (if tenant email is set)
            if (!empty($tenantEmail) && filter_var($tenantEmail, FILTER_VALIDATE_EMAIL)) {
                try {
                    $htmlEmail = "
                        <div style='font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;'>
                            <div style='border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;'>
                                <h2 style='margin: 0; color: #1e293b; font-size: 20px; font-weight: 700;'>Ground Code</h2>
                                <p style='margin: 4px 0 0 0; color: #64748b; font-size: 13px;'>Hotel & Resort Management SaaS</p>
                            </div>
                            <h3 style='color: #0f172a; font-size: 16px; margin-top: 0;'>{$msgTitle}</h3>
                            <div style='color: #334155; font-size: 14px; line-height: 1.6; white-space: pre-line;'>{$msgBody}</div>
                            <div style='margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;'>
                                Ground Code • Ground Reality Hotel Management<br>
                                Need assistance? WhatsApp/Call: {$supportPhone}
                            </div>
                        </div>
                    ";

                    $emailRes = sendSmtpEmail($pdo, $tenantEmail, $emailSubject, $htmlEmail);
                    if (!empty($emailRes['success'])) {
                        $emailSent = true;
                    }
                } catch (Exception $emEx) {
                    cadenceLog($logFile, "$timestamp - Email error for tenant #{$tenantId}: " . $emEx->getMessage());
                }
            }

            // 3. Record in `tenant_trial_cadence_logs`
            $insStmt = $pdo->prepare("
                INSERT INTO tenant_trial_cadence_logs (tenant_id, cadence_stage, day_number, channel, recipient, status, message)
                VALUES (?, ?, ?, ?, ?, 'sent', ?)
                ON DUPLICATE KEY UPDATE status = 'sent', sent_at = CURRENT_TIMESTAMP
            ");
            $channelsUsed = ($telegramSent ? 'telegram,' : '') . ($emailSent ? 'email' : 'logged');
            $insStmt->execute([
                $tenantId,
                $stageKey,
                $dayNum,
                $channelsUsed,
                $tenantEmail ?: 'N/A',
                $stageInfo['summary'],
            ]);

            cadenceLog($logFile, "$timestamp - Nudge sent: Tenant #{$tenantId} ({$tenantName}) -> Stage '{$stageKey}' (Channels: {$channelsUsed})");
            $actionsTaken++;
        }

        $processedCount++;
    }

    cadenceLog($logFile, "$timestamp - Cadence run completed: {$processedCount} tenant(s) checked, {$actionsTaken} action(s) executed");

} catch (Exception $e) {
    cadenceLog($logFile, "$timestamp - FATAL ERROR: " . $e->getMessage());
}
