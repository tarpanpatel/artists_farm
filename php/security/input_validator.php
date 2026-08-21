<?php
/**
 * Input Validation & Sanitization Middleware
 * Prevents XSS, SQL injection, and validates all user inputs
 */

class InputValidator {

    public static function validateEmail($email) {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new Exception("Invalid email format: " . self::sanitize($email));
        }
        return filter_var($email, FILTER_SANITIZE_EMAIL);
    }

    public static function validateString($input, $minLength = 1, $maxLength = 255) {
        if (!is_string($input)) {
            throw new Exception("Input must be a string");
        }

        $sanitized = self::sanitize($input);
        // mb_strlen (character count), not strlen (byte count) - found 21 Aug
        // 2026 while verifying guest PII validation: a 63-character Devanagari
        // name ("अमित कुमार शर्मा ...", a completely normal-length real name)
        // is 169 bytes in UTF-8, so the old strlen() check rejected it as
        // "too long" against a 120-char limit meant for a 120-CHARACTER name,
        // not 120 bytes. Any multi-byte script (Hindi, Chinese, Arabic,
        // accented Latin, emoji, ...) was silently penalized this way - a
        // false-positive rejection of legitimate guest names, not a real
        // length violation. mb_strlen is a strict improvement here: it can
        // only accept strings the old check wrongly rejected, never accept
        // something the old check correctly rejected (char count <= byte
        // count for UTF-8 always), and every DB column this feeds (e.g.
        // guests.guest_name, varchar(255)) sizes itself in characters too, so
        // there's no storage-overflow risk either.
        $length = mb_strlen($sanitized, 'UTF-8');

        if ($length < $minLength || $length > $maxLength) {
            throw new Exception("String length must be between $minLength and $maxLength characters");
        }

        return $sanitized;
    }

    public static function validateInteger($input, $min = null, $max = null) {
        if (!is_numeric($input) || intval($input) != $input) {
            throw new Exception("Input must be an integer");
        }

        $value = intval($input);

        if ($min !== null && $value < $min) {
            throw new Exception("Value must be at least $min");
        }

        if ($max !== null && $value > $max) {
            throw new Exception("Value must be at most $max");
        }

        return $value;
    }

    public static function validateFloat($input, $min = null, $max = null) {
        if (!is_numeric($input)) {
            throw new Exception("Input must be a number");
        }

        $value = floatval($input);

        if ($min !== null && $value < $min) {
            throw new Exception("Value must be at least $min");
        }

        if ($max !== null && $value > $max) {
            throw new Exception("Value must be at most $max");
        }

        return $value;
    }

    public static function validateDate($date, $format = 'Y-m-d') {
        $parsed = DateTime::createFromFormat($format, $date);
        if ($parsed === false || $parsed->format($format) !== $date) {
            throw new Exception("Invalid date format. Expected: $format");
        }
        return $date;
    }

    public static function validateURL($url) {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new Exception("Invalid URL format");
        }
        return filter_var($url, FILTER_SANITIZE_URL);
    }

    public static function validateBoolean($input) {
        if (is_bool($input)) return $input;
        if ($input === 1 || $input === '1' || strtolower($input) === 'true') return true;
        if ($input === 0 || $input === '0' || strtolower($input) === 'false') return false;
        throw new Exception("Invalid boolean value");
    }

    public static function validateSlug($slug) {
        if (!preg_match('/^[a-z0-9-]+$/', $slug)) {
            throw new Exception("Slug must contain only lowercase letters, numbers, and hyphens");
        }
        return $slug;
    }

    public static function sanitize($input) {
        if (is_array($input)) {
            return array_map([self::class, 'sanitize'], $input);
        }

        if (!is_string($input)) {
            return $input;
        }

        // Remove null bytes
        $input = str_replace("\0", "", $input);

        // Trim whitespace
        $input = trim($input);

        // HTML entity encode (but keep as string, don't output yet)
        // This is for storage/processing. Output escaping happens in React
        return $input;
    }

    public static function validateJSON($json) {
        if (!is_string($json)) {
            throw new Exception("Input must be a JSON string");
        }

        $decoded = json_decode($json, true);

        if ($decoded === null && json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("Invalid JSON: " . json_last_error_msg());
        }

        return $decoded;
    }

    public static function validatePropertyId($propertyId, $pdo, $userId = null) {
        $propertyId = self::validateInteger($propertyId);

        $query = "SELECT id FROM properties WHERE id = ?";
        $params = [$propertyId];

        // If userId provided, check user owns this property
        if ($userId !== null) {
            $query = "SELECT p.id FROM properties p
                     INNER JOIN tenant_users tu ON p.tenant_id = tu.tenant_id
                     WHERE p.id = ? AND tu.user_id = ?";
            $params = [$propertyId, $userId];
        }

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        if (!$stmt->fetch()) {
            throw new Exception("Access denied or property not found");
        }

        return $propertyId;
    }

    public static function validateTenantId($tenantId, $pdo, $userId = null) {
        $tenantId = self::validateInteger($tenantId);

        $query = "SELECT id FROM tenants WHERE id = ?";
        $params = [$tenantId];

        if ($userId !== null) {
            $query = "SELECT t.id FROM tenants t
                     INNER JOIN tenant_users tu ON t.id = tu.tenant_id
                     WHERE t.id = ? AND tu.user_id = ?";
            $params = [$tenantId, $userId];
        }

        $stmt = $pdo->prepare($query);
        $stmt->execute($params);

        if (!$stmt->fetch()) {
            throw new Exception("Access denied or tenant not found");
        }

        return $tenantId;
    }
}
