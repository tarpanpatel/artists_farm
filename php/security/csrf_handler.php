<?php
/**
 * CSRF Token Handler
 * Prevents Cross-Site Request Forgery attacks on state-changing requests
 */

class CSRFHandler {

    const TOKEN_KEY = 'artists_farm_csrf_token';
    const TOKEN_LIFETIME = 3600; // 1 hour

    public static function generateToken() {
        // Generate a cryptographically secure random token
        $token = bin2hex(random_bytes(32));

        // Store in session
        $_SESSION[self::TOKEN_KEY] = [
            'token' => $token,
            'created_at' => time(),
        ];

        return $token;
    }

    public static function getToken() {
        // Ensure session is started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        // Check if token exists and is not expired
        if (isset($_SESSION[self::TOKEN_KEY])) {
            $data = $_SESSION[self::TOKEN_KEY];
            $age = time() - $data['created_at'];

            if ($age < self::TOKEN_LIFETIME) {
                return $data['token'];
            }
        }

        // Generate new token if missing or expired
        return self::generateToken();
    }

    public static function validateToken($token) {
        // Ensure session is started
        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }

        if (!isset($_SESSION[self::TOKEN_KEY])) {
            return false;
        }

        $data = $_SESSION[self::TOKEN_KEY];
        $age = time() - $data['created_at'];

        // Check token matches and hasn't expired
        if ($data['token'] !== $token || $age > self::TOKEN_LIFETIME) {
            return false;
        }

        // Token is valid
        return true;
    }

    public static function validateRequest() {
        global $request_method;

        // Only validate state-changing requests
        if (!in_array($request_method, ['POST', 'PUT', 'DELETE', 'PATCH'])) {
            return true;
        }

        // Get token from request header or body
        $token = null;

        // Check header first (preferred method)
        if (isset($_SERVER['HTTP_X_CSRF_TOKEN'])) {
            $token = $_SERVER['HTTP_X_CSRF_TOKEN'];
        } elseif (isset($_SERVER['HTTP_CSRF_TOKEN'])) {
            $token = $_SERVER['HTTP_CSRF_TOKEN'];
        } else {
            // Check POST body (fallback)
            $input = json_decode(file_get_contents('php://input'), true);
            if (isset($input['csrf_token'])) {
                $token = $input['csrf_token'];
            }
        }

        if (!$token) {
            http_response_code(400);
            echo json_encode(['error' => 'CSRF token missing']);
            exit();
        }

        if (!self::validateToken($token)) {
            http_response_code(403);
            echo json_encode(['error' => 'CSRF token invalid or expired']);
            exit();
        }

        // Token valid
        return true;
    }

    public static function injectMetaTag() {
        $token = self::getToken();
        echo '<meta name="csrf-token" content="' . htmlspecialchars($token, ENT_QUOTES, 'UTF-8') . '">';
    }
}
