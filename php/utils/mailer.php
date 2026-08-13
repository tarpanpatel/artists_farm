<?php
/**
 * utils/mailer.php
 * Minimal SMTP mail sender - speaks the SMTP protocol directly over a raw
 * socket (EHLO/STARTTLS/AUTH LOGIN/MAIL FROM/RCPT TO/DATA) rather than
 * pulling in PHPMailer, since this project has no Composer/vendor setup.
 *
 * Credentials live in `system_settings` (see php/api/configuration.php),
 * the same root-admin-only key/value store already used for other
 * platform-wide config, under the `smtp_*` keys. Nothing is hardcoded -
 * sending silently no-ops with a clear error until an admin fills in real
 * credentials via the Root Admin dashboard.
 */

require_once __DIR__ . '/../errors/logger.php';

if (!function_exists('getSmtpSettings')) {
    function getSmtpSettings(PDO $pdo): array {
        try {
            $stmt = $pdo->query("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'smtp\\_%'");
            $rows = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
            return [
                'host'       => $rows['smtp_host'] ?? '',
                'port'       => (int)($rows['smtp_port'] ?? 587),
                'username'   => $rows['smtp_username'] ?? '',
                'password'   => $rows['smtp_password'] ?? '',
                'from_email' => $rows['smtp_from_email'] ?? '',
                'from_name'  => $rows['smtp_from_name'] ?? 'Ground Code',
                // 'tls' (STARTTLS, typically port 587), 'ssl' (implicit TLS, typically port 465), or 'none'
                'encryption' => $rows['smtp_encryption'] ?? 'tls',
            ];
        } catch (PDOException $e) {
            return ['host' => '', 'port' => 587, 'username' => '', 'password' => '', 'from_email' => '', 'from_name' => 'Ground Code', 'encryption' => 'tls'];
        }
    }
}

/**
 * Read one line of an SMTP multi-line response and return its numeric code.
 */
if (!function_exists('smtpReadResponse')) {
    function smtpReadResponse($socket): array {
        $response = '';
        $code = 0;
        while (($line = fgets($socket, 515)) !== false) {
            $response .= $line;
            $code = (int)substr($line, 0, 3);
            // A space (not a dash) after the code marks the last line of a multi-line reply
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return ['code' => $code, 'response' => $response];
    }
}

if (!function_exists('smtpSendCommand')) {
    function smtpSendCommand($socket, string $command): array {
        fwrite($socket, $command . "\r\n");
        return smtpReadResponse($socket);
    }
}

/**
 * Send one email via raw SMTP. Returns ['success' => bool, 'error' => string|null].
 *
 * $overrideSettings lets the "Send Test Email" flow in the Root Admin
 * dashboard try connection details before they've been saved.
 */
if (!function_exists('sendSmtpEmail')) {
    function sendSmtpEmail(PDO $pdo, string $to, string $subject, string $htmlBody, ?array $overrideSettings = null): array {
        $settings = $overrideSettings ?? getSmtpSettings($pdo);

        if (empty($settings['host']) || empty($settings['username']) || empty($settings['password']) || empty($settings['from_email'])) {
            return ['success' => false, 'error' => 'SMTP is not configured yet. Set it up in Root Admin > Email Settings.'];
        }

        $host = $settings['host'];
        $port = (int)$settings['port'];
        $encryption = $settings['encryption'] ?: 'tls';
        $transport = ($encryption === 'ssl') ? 'ssl://' . $host : $host;

        $socket = @stream_socket_client(
            "{$transport}:{$port}",
            $errno,
            $errstr,
            15,
            STREAM_CLIENT_CONNECT
        );

        if (!$socket) {
            $err = "Could not connect to SMTP server {$host}:{$port} - {$errstr} ({$errno})";
            TelescopeLogger::log('email', 'ERROR', $err, 'SMTP Mailer', ['to' => $to]);
            return ['success' => false, 'error' => $err];
        }

        try {
            $greeting = smtpReadResponse($socket);
            if ($greeting['code'] !== 220) {
                return ['success' => false, 'error' => 'SMTP server did not greet: ' . trim($greeting['response'])];
            }

            $localDomain = $_SERVER['SERVER_NAME'] ?? 'localhost';
            $ehlo = smtpSendCommand($socket, "EHLO {$localDomain}");
            if ($ehlo['code'] !== 250) {
                return ['success' => false, 'error' => 'EHLO failed: ' . trim($ehlo['response'])];
            }

            if ($encryption === 'tls') {
                $starttls = smtpSendCommand($socket, 'STARTTLS');
                if ($starttls['code'] !== 220) {
                    return ['success' => false, 'error' => 'STARTTLS failed: ' . trim($starttls['response'])];
                }
                if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    return ['success' => false, 'error' => 'TLS handshake failed'];
                }
                // Servers require a second EHLO after STARTTLS
                $ehlo2 = smtpSendCommand($socket, "EHLO {$localDomain}");
                if ($ehlo2['code'] !== 250) {
                    return ['success' => false, 'error' => 'Post-STARTTLS EHLO failed: ' . trim($ehlo2['response'])];
                }
            }

            $authStart = smtpSendCommand($socket, 'AUTH LOGIN');
            if ($authStart['code'] !== 334) {
                return ['success' => false, 'error' => 'AUTH LOGIN not accepted: ' . trim($authStart['response'])];
            }
            $authUser = smtpSendCommand($socket, base64_encode($settings['username']));
            if ($authUser['code'] !== 334) {
                return ['success' => false, 'error' => 'SMTP username rejected: ' . trim($authUser['response'])];
            }
            $authPass = smtpSendCommand($socket, base64_encode($settings['password']));
            if ($authPass['code'] !== 235) {
                return ['success' => false, 'error' => 'SMTP authentication failed - check username/password: ' . trim($authPass['response'])];
            }

            $mailFrom = smtpSendCommand($socket, "MAIL FROM:<{$settings['from_email']}>");
            if ($mailFrom['code'] !== 250) {
                return ['success' => false, 'error' => 'MAIL FROM rejected: ' . trim($mailFrom['response'])];
            }
            $rcptTo = smtpSendCommand($socket, "RCPT TO:<{$to}>");
            if ($rcptTo['code'] !== 250 && $rcptTo['code'] !== 251) {
                return ['success' => false, 'error' => 'Recipient rejected: ' . trim($rcptTo['response'])];
            }

            $data = smtpSendCommand($socket, 'DATA');
            if ($data['code'] !== 354) {
                return ['success' => false, 'error' => 'DATA command rejected: ' . trim($data['response'])];
            }

            $fromHeader = $settings['from_name']
                ? "{$settings['from_name']} <{$settings['from_email']}>"
                : $settings['from_email'];

            // Escape lines that start with a lone "." per SMTP dot-stuffing rules
            $escapedBody = preg_replace('/^\./m', '..', $htmlBody);

            $message = "From: {$fromHeader}\r\n"
                . "To: {$to}\r\n"
                . "Subject: {$subject}\r\n"
                . "MIME-Version: 1.0\r\n"
                . "Content-Type: text/html; charset=UTF-8\r\n"
                . "\r\n"
                . $escapedBody
                . "\r\n.";

            $sent = smtpSendCommand($socket, $message);
            if ($sent['code'] !== 250) {
                return ['success' => false, 'error' => 'Message rejected by server: ' . trim($sent['response'])];
            }

            smtpSendCommand($socket, 'QUIT');
            return ['success' => true, 'error' => null];
        } catch (Throwable $e) {
            TelescopeLogger::log('email', 'ERROR', 'SMTP send exception: ' . $e->getMessage(), 'SMTP Mailer', ['to' => $to]);
            return ['success' => false, 'error' => $e->getMessage()];
        } finally {
            fclose($socket);
        }
    }
}

