<?php
/**
 * Logout Handler - Destroys session and redirects to React app login
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Clear all session data
$_SESSION = [];

// Destroy the session
if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
        session_name(),
        '',
        time() - 42000,
        $params['path'],
        $params['domain'],
        $params['secure'],
        $params['httponly']
    );
}

session_destroy();

// Check if impersonating - redirect back to tenant management
if (isset($_COOKIE['artists_farm_impersonating'])) {
    setcookie('artists_farm_impersonating', '', time() - 42000);
    header('Location: /artists_farm/root_dashboard', true, 302);
    exit;
}

// Redirect to React app home (login page is handled by React)
// Using 302 (temporary) redirect so user doesn't cache the logout redirect
header('Location: /artists_farm/', true, 302);
exit;
