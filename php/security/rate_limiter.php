<?php
/**
 * Rate Limiter
 * Prevents brute force attacks on login and API endpoints
 */

require_once __DIR__ . '/../config/schema_cache.php';

class RateLimiter {

    private $pdo;
    private $maxAttempts = 5;
    private $windowSeconds = 300; // 5 minutes

    public function __construct($pdo) {
        $this->pdo = $pdo;
        $this->ensureTableExists();
    }

    private function ensureTableExists() {
        if (isSchemaVerified('schema_rate_limiter')) return;
        try {
            $this->pdo->exec("CREATE TABLE IF NOT EXISTS `rate_limit_attempts` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `identifier` VARCHAR(255) NOT NULL,
                `endpoint` VARCHAR(255) NOT NULL,
                `attempts` INT DEFAULT 1,
                `first_attempt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                `last_attempt` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                `blocked_until` TIMESTAMP NULL,
                UNIQUE KEY `unique_identifier_endpoint` (identifier, endpoint),
                INDEX `idx_blocked_until` (blocked_until)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        } catch (PDOException $e) {
            error_log("Rate limiter table error: " . $e->getMessage());
        }
        markSchemaVerified('schema_rate_limiter');
    }

    public function isBlocked($identifier, $endpoint) {
        try {
            $stmt = $this->pdo->prepare("
                SELECT blocked_until FROM rate_limit_attempts
                WHERE identifier = ? AND endpoint = ?
                AND blocked_until IS NOT NULL AND blocked_until > NOW()
            ");
            $stmt->execute([$identifier, $endpoint]);
            return $stmt->fetch() !== false;
        } catch (PDOException $e) {
            error_log("Rate limiter check error: " . $e->getMessage());
            return false;
        }
    }

    // BUG FIX (25 Aug 2026, found live): `attempts` used to only ever increment
    // (`ON DUPLICATE KEY UPDATE attempts = attempts + 1`), with no time decay at all. Once an
    // identifier/endpoint pair crossed maxAttempts ONCE in its lifetime, `attempts >= maxAttempts`
    // was permanently true forever after, so checkAndBlock()'s own "just crossed threshold" branch
    // re-armed a brand-new blocked_until on every single subsequent attempt - no matter how long
    // the gap since the last one - turning a "N attempts per window" limiter into a one-way
    // permanent lock outside of a manual DB reset. Confirmed live on ai_config_save: a legitimate
    // string of AI-provider-config saves over several hours tripped this once, and every attempt
    // after that (even minutes apart, well past the block's own expiry) immediately re-blocked for
    // another full window. Fixed by treating a `last_attempt` older than the window as a fresh
    // window - reset to 1 instead of incrementing - matching the "N attempts per window" behavior
    // this was always supposed to have. This class is shared by other endpoints (e.g. login) that
    // have the identical flaw, not just this one caught live.
    public function recordAttempt($identifier, $endpoint) {
        try {
            $stmt = $this->pdo->prepare("
                SELECT attempts, last_attempt FROM rate_limit_attempts
                WHERE identifier = ? AND endpoint = ?
            ");
            $stmt->execute([$identifier, $endpoint]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$row) {
                $this->pdo->prepare("
                    INSERT INTO rate_limit_attempts (identifier, endpoint, attempts)
                    VALUES (?, ?, 1)
                ")->execute([$identifier, $endpoint]);
                return 1;
            }

            $windowStale = strtotime($row['last_attempt']) < (time() - $this->windowSeconds);

            if ($windowStale) {
                // Fresh window: reset the counter and clear any (already-expired, since
                // checkAndBlock()'s isBlocked() check above would have short-circuited otherwise)
                // stale block, rather than compounding onto a lifetime total.
                $this->pdo->prepare("
                    UPDATE rate_limit_attempts
                    SET attempts = 1, first_attempt = NOW(), last_attempt = NOW(), blocked_until = NULL
                    WHERE identifier = ? AND endpoint = ?
                ")->execute([$identifier, $endpoint]);
                return 1;
            }

            $newAttempts = (int)$row['attempts'] + 1;
            if ($newAttempts >= $this->maxAttempts) {
                $this->pdo->prepare("
                    UPDATE rate_limit_attempts
                    SET attempts = ?, last_attempt = NOW(), blocked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
                    WHERE identifier = ? AND endpoint = ?
                ")->execute([$newAttempts, intval($this->windowSeconds / 60), $identifier, $endpoint]);
            } else {
                $this->pdo->prepare("
                    UPDATE rate_limit_attempts
                    SET attempts = ?, last_attempt = NOW()
                    WHERE identifier = ? AND endpoint = ?
                ")->execute([$newAttempts, $identifier, $endpoint]);
            }
            return $newAttempts;

        } catch (PDOException $e) {
            error_log("Rate limiter record error: " . $e->getMessage());
            return 0;
        }
    }

    public function resetAttempts($identifier, $endpoint) {
        try {
            $stmt = $this->pdo->prepare("
                DELETE FROM rate_limit_attempts
                WHERE identifier = ? AND endpoint = ?
            ");
            $stmt->execute([$identifier, $endpoint]);
        } catch (PDOException $e) {
            error_log("Rate limiter reset error: " . $e->getMessage());
        }
    }

    public function setMaxAttempts($max) {
        $this->maxAttempts = intval($max);
        return $this;
    }

    public function setWindowSeconds($seconds) {
        $this->windowSeconds = intval($seconds);
        return $this;
    }

    public function checkAndBlock($identifier, $endpoint) {
        // Check if already blocked
        if ($this->isBlocked($identifier, $endpoint)) {
            http_response_code(429); // Too Many Requests
            echo json_encode([
                'error' => 'Too many attempts. Please try again later.',
                'code' => 'RATE_LIMIT_EXCEEDED'
            ]);
            exit();
        }

        // Record this attempt
        $attempts = $this->recordAttempt($identifier, $endpoint);

        // Check if just crossed threshold
        if ($attempts > $this->maxAttempts) {
            http_response_code(429);
            echo json_encode([
                'error' => 'Too many attempts. Account temporarily locked.',
                'code' => 'RATE_LIMIT_EXCEEDED',
                'retry_after' => $this->windowSeconds
            ]);
            exit();
        }

        return true;
    }

    public static function getClientIdentifier() {
        // Use combination of IP and User-Agent for more accurate tracking
        $ip = self::getClientIP();
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'unknown';
        return hash('sha256', $ip . ':' . $userAgent);
    }

    public static function getClientIP() {
        // Check for IP from shared internet
        if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
            return $_SERVER['HTTP_CLIENT_IP'];
        }
        // Check for IP passed from proxy
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            return trim($ips[0]);
        }
        // Fall back to remote address
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}
