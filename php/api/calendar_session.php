<?php
/**
 * Internal session authorization bridge for the calendar WebSocket service.
 * It is called server-to-server with the browser's existing HttpOnly session
 * cookie forwarded by the gateway; it never exposes a session identifier.
 */
// session_set_cookie_params() (27 Aug 2026, "remember me" fix - see router.php's fuller
// comment) computed inline - this file never requires config/database.php, so
// APP_IS_LOCAL_ENV is never defined here.
$__session_host = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
$__session_is_local = $__session_host === 'localhost' || $__session_host === '127.0.0.1' || str_contains($__session_host, '192.168.') || $__session_host === 'dev.ground-code.com';
ini_set('session.gc_maxlifetime', 86400 * 30);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path' => '/',
    'domain' => '',
    'secure' => !$__session_is_local,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_name('artists_farm_session');
session_start();
// Unconditionally suppresses PHP's own implicit Set-Cookie (session_start()
// queues one on every request that touches $_SESSION, new session or a refresh
// of an existing one) - see router.php's full explanation next to its own copy
// of this fix (session-fixation race between concurrent logged-out requests and
// a real login, found 27 Aug 2026, where even "just reload" didn't self-correct
// once a bad cookie had already won). appSetSessionCookie() explicitly
// (re-)issues the cookie on an actual successful login, so this is safe.
header_remove('Set-Cookie');

header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['authorized' => false]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$propertyId = filter_var($input['propertyId'] ?? null, FILTER_VALIDATE_INT);
if (!$propertyId || empty($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['authorized' => false]);
    exit;
}

if (!empty($_SESSION['is_platform_admin'])) {
    echo json_encode(['authorized' => true]);
    exit;
}

$assignedPropertyId = filter_var($_SESSION['property_id'] ?? null, FILTER_VALIDATE_INT);
if (!$assignedPropertyId) {
    http_response_code(403);
    echo json_encode(['authorized' => false]);
    exit;
}

require_once __DIR__ . '/../config/database.php';

// A property user can join its property and its direct multi-key parent/child
// context, but cannot subscribe to another tenant's property.
$stmt = $pdo->prepare(
    'SELECT id FROM properties
     WHERE id = :target
       AND (
         id = :assigned
         OR parent_property_id = :assigned
         OR id = (SELECT parent_property_id FROM properties WHERE id = :assigned LIMIT 1)
       )
     LIMIT 1'
);
$stmt->execute([':target' => $propertyId, ':assigned' => $assignedPropertyId]);
$authorized = (bool)$stmt->fetch();

if (!$authorized) http_response_code(403);
echo json_encode(['authorized' => $authorized]);
