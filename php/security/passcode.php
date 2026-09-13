<?php
/**
 * Single source of truth for storing, verifying and resetting login passcodes
 * (13 Sep 2026).
 *
 * BEFORE THIS FILE, passcodes were stored in plaintext in `users.passcode` and
 * `staff_users.passcode`, and five separate flows read them back out: the
 * "Forgot Password?" email, Root Admin's tenant-credentials view, the public
 * demo auto-login, the tenant welcome email, and the Team & Access staff list
 * (which shipped every staff member's live passcode to the browser on every
 * page load). Anyone who reached the database, a backup, or a single
 * root-admin session read every credential on the platform in the clear - and
 * people reuse 6-digit PINs.
 *
 * THE MODEL NOW:
 *   - `password`  holds a bcrypt hash and is the real credential.
 *   - `passcode`  is the LEGACY plaintext column. It is still read (so nobody
 *                 is locked out mid-migration) but never written for a normal
 *                 account, and it is nulled the moment an account migrates.
 *   - Migration is lazy: the first successful login with a plaintext passcode
 *     hashes it and clears the plaintext. No forced reset, no support wave.
 *
 * WHY A REVEAL FLOW CANNOT SURVIVE THIS: a hash is one-way by construction, so
 * "show me their passcode" stops being answerable. Every one of the five flows
 * above therefore becomes "reset it and hand over the new one" - see each call
 * site. That is a deliberate product change, not an oversight.
 *
 * THE ONE EXEMPTION IS THE PUBLIC DEMO. Its credentials are published on
 * purpose so a prospect can click straight in, so a demo tenant's account
 * keeps its plaintext passcode and is skipped by the lazy migration - see
 * isExemptFromPasscodeHashing(). Exempting it is safe precisely because that
 * passcode is not a secret; hashing it would break the auto-login for no gain.
 */

if (!function_exists('hashPasscode')) {

    /** The two tables that carry login credentials. Anything else is a bug. */
    function passcodeTableIsSupported(string $table): bool {
        return $table === 'users' || $table === 'staff_users';
    }

    function hashPasscode(string $passcode): string {
        return password_hash($passcode, PASSWORD_DEFAULT);
    }

    /**
     * Verify a submitted passcode against a row's stored credentials.
     *
     * Hash first, plaintext second. `hash_equals` on the plaintext branch is
     * not theatre: `===` on strings short-circuits at the first differing
     * byte, which is a timing signal on a 6-digit secret with only a million
     * possibilities.
     */
    function verifyPasscodeAgainst(string $submitted, ?string $storedPlaintext, ?string $storedHash): bool {
        if ($submitted === '') {
            return false;
        }
        if (!empty($storedHash)) {
            // A legacy row can have a PLAINTEXT value sitting in the `password`
            // column (that column predates hashing and was written directly by
            // older code), so a non-hash value there still has to be comparable.
            if (password_verify($submitted, $storedHash)) {
                return true;
            }
            if (strncmp($storedHash, '$2y$', 4) !== 0 && hash_equals($storedHash, $submitted)) {
                return true;
            }
        }
        if (!empty($storedPlaintext) && hash_equals($storedPlaintext, $submitted)) {
            return true;
        }
        return false;
    }

    /**
     * Is this account one whose passcode is deliberately public?
     *
     * Only the public demo qualifies: `get_demo_login_credentials` hands its
     * username+passcode to any anonymous visitor by design, so hashing it
     * would break the demo auto-login to protect a value that was never
     * secret. Fails CLOSED - if the check itself errors we treat the account
     * as normal and hash it, because wrongly hashing a demo login is a broken
     * demo, while wrongly skipping a real one is a live plaintext credential.
     */
    function isExemptFromPasscodeHashing(PDO $pdo, string $table, $id): bool {
        try {
            if ($table === 'users') {
                $stmt = $pdo->prepare("
                    SELECT 1 FROM users u
                    JOIN properties p ON p.tenant_id = u.default_tenant_id
                    WHERE u.id = ? AND p.is_public_demo = 1 AND p.is_deleted = 0
                    LIMIT 1
                ");
            } else {
                $stmt = $pdo->prepare("
                    SELECT 1 FROM staff_users s
                    JOIN properties p ON p.id = s.property_id
                    WHERE s.id = ? AND p.is_public_demo = 1 AND p.is_deleted = 0
                    LIMIT 1
                ");
            }
            $stmt->execute([$id]);
            return (bool)$stmt->fetchColumn();
        } catch (Throwable $e) {
            // is_public_demo may not exist on an older environment.
            return false;
        }
    }

    /**
     * Write a passcode as a hash and clear any plaintext left on the row.
     * THE ONLY supported way to set a passcode - every create/change/reset
     * path goes through here, so no future call site can reintroduce a
     * plaintext write by forgetting.
     */
    function setPasscodeForAccount(PDO $pdo, string $table, $id, string $newPasscode): bool {
        if (!passcodeTableIsSupported($table)) {
            return false;
        }
        ensurePasscodeSchema($pdo);
        $hash = hashPasscode($newPasscode);
        // `passcode` is set to NULL, not ''. unified_login.php treats a blank
        // stored passcode as "this account cannot be logged into" rather than
        // as the well-known default, so NULL is the value that means absence.
        $sql = "UPDATE `{$table}` SET `password` = ?, `passcode` = NULL WHERE id = ?";
        $pdo->prepare($sql)->execute([$hash, $id]);
        return true;
    }

    /**
     * Lazy migration: called after a SUCCESSFUL login that matched plaintext.
     * Hashes what the user just proved they know, then clears the plaintext.
     * Best-effort - a failure here must never turn a valid login into a
     * failed one, so it swallows and logs.
     */
    function migratePasscodeToHashOnLogin(PDO $pdo, string $table, $id, string $provenPasscode): void {
        try {
            if (!passcodeTableIsSupported($table)) {
                return;
            }
            if (isExemptFromPasscodeHashing($pdo, $table, $id)) {
                return;
            }
            setPasscodeForAccount($pdo, $table, $id, $provenPasscode);
        } catch (Throwable $e) {
            error_log('Passcode hash migration failed for ' . $table . ' #' . $id . ': ' . $e->getMessage());
        }
    }

    /**
     * Self-healing schema: the `password` column on staff_users (which had NO
     * hash column at all - staff auth was plaintext-only) and the reset-token
     * table backing the "Forgot Password?" flow.
     */
    function ensurePasscodeSchema(PDO $pdo): void {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        try {
            require_once __DIR__ . '/../config/schema_cache.php';
            if (function_exists('isSchemaVerified') && isSchemaVerified('schema_passcode_hashing_v1')) {
                return;
            }

            try { $pdo->exec("ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) DEFAULT NULL"); } catch (Throwable $e) {}
            try { $pdo->exec("ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `password` VARCHAR(255) DEFAULT NULL"); } catch (Throwable $e) {}

            // The plaintext columns carried DEFAULT '123456', so every future
            // row was born knowing the well-known PIN even when no passcode was
            // ever chosen for it. Now that `passcode` is legacy-only, drop the
            // default so a new row starts as NULL - which unified_login.php
            // reads as "cannot be logged into", the correct meaning of absence.
            try { $pdo->exec("ALTER TABLE `staff_users` ALTER COLUMN `passcode` DROP DEFAULT"); } catch (Throwable $e) {}
            try { $pdo->exec("ALTER TABLE `users` ALTER COLUMN `passcode` DROP DEFAULT"); } catch (Throwable $e) {}

            // Reset tokens for "Forgot Password?". Only the SHA-256 of the
            // token is stored: the emailed value is the secret, and a stolen
            // database must not yield working reset links.
            try {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS `passcode_reset_tokens` (
                        `id` INT AUTO_INCREMENT PRIMARY KEY,
                        `user_id` INT NOT NULL,
                        `token_hash` CHAR(64) NOT NULL,
                        `expires_at` DATETIME NOT NULL,
                        `used_at` DATETIME DEFAULT NULL,
                        `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE KEY `token_hash` (`token_hash`),
                        KEY `user_id` (`user_id`)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
                ");
            } catch (Throwable $e) {}

            if (function_exists('markSchemaVerified')) {
                markSchemaVerified('schema_passcode_hashing_v1');
            }
        } catch (Throwable $e) {
            error_log('ensurePasscodeSchema failed: ' . $e->getMessage());
        }
    }

    /**
     * Mint a single-use reset token for a `users` row. Returns the RAW token
     * (emailed to the account holder); only its hash is persisted.
     *
     * Any of this user's older unused tokens are burned first, so a second
     * "Forgot Password?" request invalidates the first email rather than
     * leaving several live reset links in an inbox.
     */
    function createPasscodeResetToken(PDO $pdo, int $userId, int $ttlMinutes = 60): string {
        ensurePasscodeSchema($pdo);
        $pdo->prepare("UPDATE `passcode_reset_tokens` SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL")
            ->execute([$userId]);
        $token = bin2hex(random_bytes(32));
        $pdo->prepare("INSERT INTO `passcode_reset_tokens` (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))")
            ->execute([$userId, hash('sha256', $token), $ttlMinutes]);
        return $token;
    }

    /**
     * Redeem a reset token and set the new passcode, atomically.
     *
     * The UPDATE ... WHERE used_at IS NULL is what makes the token single-use:
     * two concurrent redemptions race on that row and exactly one sees
     * rowCount() === 1, so the loser cannot also set a passcode.
     *
     * @return array{ok:bool, message:string}
     */
    function consumePasscodeResetToken(PDO $pdo, string $rawToken, string $newPasscode): array {
        ensurePasscodeSchema($pdo);
        $generic = ['ok' => false, 'message' => 'This reset link is invalid or has expired. Please request a new one.'];

        if (!preg_match('/^\d{6}$/', $newPasscode)) {
            return ['ok' => false, 'message' => 'New passcode must be exactly 6 digits'];
        }
        if ($rawToken === '') {
            return $generic;
        }

        $stmt = $pdo->prepare("SELECT id, user_id FROM `passcode_reset_tokens` WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1");
        $stmt->execute([hash('sha256', $rawToken)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return $generic;
        }

        $claim = $pdo->prepare("UPDATE `passcode_reset_tokens` SET used_at = NOW() WHERE id = ? AND used_at IS NULL");
        $claim->execute([$row['id']]);
        if ($claim->rowCount() !== 1) {
            return $generic;
        }

        setPasscodeForAccount($pdo, 'users', $row['user_id'], $newPasscode);
        $pdo->prepare("UPDATE `users` SET must_change_passcode = 0 WHERE id = ?")->execute([$row['user_id']]);

        return ['ok' => true, 'message' => 'Your passcode has been updated. You can now log in.'];
    }

    /**
     * Absolute base URL for a link in an outbound email.
     *
     * HTTP_HOST is a request header and attacker-controllable, so it is checked
     * against the hosts this app actually runs on - otherwise a forged Host
     * turns a password-reset email into a credential-harvesting link pointed at
     * someone else's domain. Same validation as configuration.php's welcome
     * email; see CLAUDE.md's WhatsApp/action-link rule for the full reasoning.
     */
    function buildAppBaseUrl(): string {
        $host = strtolower(explode(':', (string)($_SERVER['HTTP_HOST'] ?? ''))[0]);
        $isLocal = in_array($host, ['localhost', '127.0.0.1'], true) || strpos($host, '192.168.') === 0;
        if (!in_array($host, ['ground-code.com', 'www.ground-code.com', 'staging.ground-code.com'], true) && !$isLocal) {
            $host = 'ground-code.com';
            $isLocal = false;
        }
        $scheme = $isLocal && (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') ? 'http' : 'https';
        $port = ($isLocal && strpos((string)($_SERVER['HTTP_HOST'] ?? ''), ':') !== false)
            ? ':' . explode(':', (string)$_SERVER['HTTP_HOST'])[1]
            : '';
        return "{$scheme}://{$host}{$port}";
    }
}
