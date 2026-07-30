<?php
if (session_status() === PHP_SESSION_NONE) session_start();

// Check if impersonating
if (isset($_SESSION['is_platform_admin_impersonating'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: /artists_farm/platform_property_management.php#tenants');
    exit;
}

$_SESSION = [];
session_destroy();
header('Location: /artists_farm/login.php');
exit;
