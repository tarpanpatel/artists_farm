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

    public function recordAttempt($identifier, $endpoint) {
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO rate_limit_attempts (identifier, endpoint, attempts)
                VALUES (?, ?, 1)
                ON DUPLICATE KEY UPDATE
                attempts = attempts + 1,
                last_attempt = NOW(),
                blocked_until = IF(
                    attempts >= ?,
                    DATE_ADD(NOW(), INTERVAL ? MINUTE),
                    blocked_until
                )
            ");

            $stmt->execute([
                $identifier,
                $endpoint,
                $this->maxAttempts,
                intval($this->windowSeconds / 60)
            ]);

            // Get current attempt count
            $checkStmt = $this->pdo->prepare("
                SELECT attempts FROM rate_limit_attempts
                WHERE identifier = ? AND endpoint = ?
            ");
            $checkStmt->execute([$identifier, $endpoint]);
            $row = $checkStmt->fetch();
            return $row ? $row['attempts'] : 1;

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
