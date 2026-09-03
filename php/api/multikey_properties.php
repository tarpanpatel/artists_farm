<?php
/**
 * Multi Key Properties API
 * Handles all MultiKey property operations (create, add rooms, manage, etc)
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';

// Load default expenses seed data
$seedFile = __DIR__ . '/../seed/default_expenses.php';
if (file_exists($seedFile)) {
    require_once $seedFile;
}

/**
 * Route MultiKey property actions
 */
function handleMultiKeyPropertyRequests($pdo, $request_method, $action, $propertyId = 0, $currentProperty = []) {
    switch ($action) {
        case 'create_multikey_property':
            createMultiKeyProperty($pdo);
            break;

        case 'add_multikey_room':
            addMultiKeyRoom($pdo);
            break;

        case 'get_multikey_property':
            getMultiKeyProperty($pdo, $propertyId, $currentProperty);
            break;

        case 'get_multikey_overview':
            getMultiKeyOverview($pdo, $propertyId, $currentProperty);
            break;

        case 'delete_multikey_room':
            deleteMultiKeyRoom($pdo, $propertyId, $currentProperty);
            break;

        case 'update_room_order':
            updateRoomOrder($pdo, $propertyId, $currentProperty);
            break;

        case 'update_room_name':
            updateRoomName($pdo, $propertyId, $currentProperty);
            break;

        case 'update_room_tariff':
            updateRoomTariff($pdo, $propertyId, $currentProperty);
            break;

        case 'restore_multikey_room':
            restoreMultiKeyRoom($pdo, $propertyId, $currentProperty);
            break;

        case 'get_room_grouped_active_bookings':
            getRoomGroupedActiveBookings($pdo, $propertyId, $currentProperty);
            break;

        case 'populate_default_expenses':
            populateDefaultExpensesForProperty($pdo);
            break;

        case 'sync_all_default_expenses':
            syncAllDefaultExpenses($pdo);
            break;

        case 'add_tenant_user_to_property':
            addTenantUserToProperty($pdo);
            break;

        case 'backfill_tenant_users':
            backfillTenantUsers($pdo);
            break;

        default:
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Unknown MultiKey action']);
    }
}

/**
 * Resolve the MultiKey scope the current request is allowed to touch.
 *
 * The resolved property context (from the URL slugs) can be a MULTI_KEY parent,
 * one of its MULTI_KEY_ROOM children, or anything else. Whichever it is, the
 * only property ids a legitimate caller may act on are the scope root (the
 * MULTI_KEY parent) plus its rooms. Returns null when there is no usable
 * property context at all, in which case all MultiKey access is denied.
 */
function resolveMultiKeyScope(PDO $pdo, $currentProperty): ?array {
    if (empty($currentProperty) || empty($currentProperty['id'])) {
        return null;
    }
    $rootId = (int)$currentProperty['id'];
    if (!empty($currentProperty['parent_property_id'])) {
        $rootId = (int)$currentProperty['parent_property_id'];
    }
    $stmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? AND is_active = 1");
    $stmt->execute([$rootId]);
    if (!$stmt->fetch()) {
        return null;
    }
    $ids = [$rootId];
    $stmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
    $stmt->execute([$rootId]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $ids[] = (int)$r['id'];
    }
    return ['root' => $rootId, 'ids' => $ids];
}

/**
 * True when $propertyId belongs to the current request's MultiKey scope.
 */
function isPropertyInMultiKeyScope(PDO $pdo, $currentProperty, $propertyId): bool {
    $scope = resolveMultiKeyScope($pdo, $currentProperty);
    if (!$scope) {
        return false;
    }
    return in_array((int)$propertyId, $scope['ids'], true);
}

/**
 * True when $roomId is a MULTI_KEY_ROOM child of the current request's scope root.
 */
function isRoomInMultiKeyScope(PDO $pdo, $currentProperty, $roomId): bool {
    $scope = resolveMultiKeyScope($pdo, $currentProperty);
    if (!$scope) {
        return false;
    }
    $stmt = $pdo->prepare("SELECT parent_property_id FROM properties WHERE id = ? AND property_type = 'MULTI_KEY_ROOM'");
    $stmt->execute([$roomId]);
    $row = $stmt->fetch();
    if (!$row) {
        return false;
    }
    return (int)$row['parent_property_id'] === $scope['root'];
}

/**
 * Reject with 403 unless $propertyId is inside the current request's scope.
 */
function denyIfNotInMultiKeyScope(PDO $pdo, $currentProperty, $propertyId) {
    if (!isPropertyInMultiKeyScope($pdo, $currentProperty, $propertyId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: property is not part of the current property context']);
        exit;
    }
}

/**
 * Reject with 403 unless $roomId is a room of the current request's scope root.
 */
function denyIfRoomNotInMultiKeyScope(PDO $pdo, $currentProperty, $roomId) {
    if (!isRoomInMultiKeyScope($pdo, $currentProperty, $roomId)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'message' => 'Access denied: room is not part of the current property context']);
        exit;
    }
}

/**
 * Backfill tenant users for all existing MultiKey properties
 */
function backfillTenantUsers($pdo) {
    try {
        // Get all MultiKey properties that don't have their tenant user
        $stmt = $pdo->prepare("
            SELECT p.id, p.slug, p.tenant_id, t.slug as tenant_username, t.name as tenant_name
            FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE p.property_type = 'MULTI_KEY'
            AND p.is_active = 1
            AND NOT EXISTS (
                SELECT 1 FROM staff_users su
                WHERE su.property_id = p.id
                AND su.username = t.slug
            )
        ");
        $stmt->execute();
        $properties = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($properties)) {
            echo json_encode([
                'success' => true,
                'message' => 'No MultiKey properties need tenant user backfill',
                'count' => 0
            ]);
            exit;
        }

        $count = 0;
        $results = [];

        foreach ($properties as $prop) {
            $insert = $pdo->prepare("
                INSERT INTO staff_users (property_id, username, full_name, role, status)
                VALUES (?, ?, ?, 'Admin', 'Active')
            ");

            try {
                $insert->execute([
                    $prop['id'],
                    $prop['tenant_username'],
                    $prop['tenant_name']
                ]);
                $count++;
                $results[] = [
                    'status' => 'success',
                    'property' => $prop['slug'],
                    'username' => $prop['tenant_username']
                ];
            } catch (Exception $e) {
                $results[] = [
                    'status' => 'error',
                    'property' => $prop['slug'],
                    'error' => $e->getMessage()
                ];
            }
        }

        echo json_encode([
            'success' => true,
            'message' => "Backfill complete! Added $count tenant users.",
            'count' => $count,
            'results' => $results
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Add tenant user to an existing MultiKey property (for backfill)
 */
function addTenantUserToProperty($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $property_id = $input['property_id'] ?? '';

    if (!$property_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'property_id required']);
        exit;
    }

    try {
        // Get property and tenant info
        $stmt = $pdo->prepare("
            SELECT p.id, p.tenant_id, t.slug as tenant_username, t.name as tenant_name
            FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE p.id = ? AND p.property_type = 'MULTI_KEY'
        ");
        $stmt->execute([$property_id]);
        $property = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$property) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'MultiKey property not found']);
            exit;
        }

        // Check if tenant user already exists
        $check = $pdo->prepare("
            SELECT id FROM staff_users
            WHERE property_id = ? AND username = ?
        ");
        $check->execute([$property_id, $property['tenant_username']]);

        if ($check->fetch()) {
            echo json_encode(['success' => true, 'message' => 'Tenant user already exists', 'username' => $property['tenant_username']]);
            exit;
        }

        // Create tenant user
        $insert = $pdo->prepare("
            INSERT INTO staff_users (property_id, username, full_name, role, status)
            VALUES (?, ?, ?, 'Admin', 'Active')
        ");
        $insert->execute([$property_id, $property['tenant_username'], $property['tenant_name']]);

        echo json_encode([
            'success' => true,
            'message' => 'Tenant user created successfully',
            'username' => $property['tenant_username'],
            'role' => 'Admin'
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Create a new MultiKey property
 * POST /api/router.php?action=create_multikey_property
 */
/**
 * Core MultiKey property creation - no I/O (no php://input, no echo, no
 * exit), so it's safely callable from any other server-side flow that needs
 * to create a real, fully-scaffolded MultiKey property (shared_data,
 * default modules, tenant-username staff login, Super Admin carry-forward,
 * default expenses) without duplicating this logic. Throws Exception on any
 * failure (tenant not found, slug conflict) - caller decides the HTTP
 * response shape. THIS is now the single source of truth for what a real
 * MultiKey property looks like - createMultiKeyProperty() below (the HTTP
 * handler) and registerTenantTrial() (php/api/configuration.php, the
 * self-service trial signup) both call this rather than each having their
 * own partial copy (found live 3 Sep 2026: the trial-signup path had drifted
 * into a much thinner inline version missing shared_data/modules/default
 * expenses entirely).
 */
function createMultiKeyPropertyCore(PDO $pdo, int $tenant_id, string $name, string $slug, string $address = '', string $currency = 'INR', string $timezone = 'Asia/Kolkata'): int {
    if (!$tenant_id || !$name || !$slug) {
        throw new Exception('tenant_id, name, and slug required');
    }

    // Verify tenant exists
    $stmt = $pdo->prepare("SELECT id FROM tenants WHERE id = ?");
    $stmt->execute([$tenant_id]);
    if (!$stmt->fetch()) {
        throw new Exception('Tenant not found');
    }

    // Check slug uniqueness within tenant
    $stmt = $pdo->prepare("SELECT id FROM properties WHERE tenant_id = ? AND slug = ?");
    $stmt->execute([$tenant_id, $slug]);
    if ($stmt->fetch()) {
        throw new Exception('Property slug already exists in this tenant');
    }

    // Create MultiKey property
    $stmt = $pdo->prepare("
        INSERT INTO properties (tenant_id, name, slug, property_type, address, currency, timezone, is_active)
        VALUES (?, ?, ?, 'MULTI_KEY', ?, ?, ?, 1)
    ");
    $stmt->execute([$tenant_id, $name, $slug, $address, $currency, $timezone]);
    $property_id = (int)$pdo->lastInsertId();

    // Create shared data record for this MultiKey property.
    // BUG FIX (26 Aug 2026, reported live: "SQLSTATE[23000]: Integrity constraint violation:
    // 4025 CONSTRAINT `property_shared_data.kitchen_details` failed" on every attempt to add a
    // Multi Key property): the STAFF row used to pass '' (empty string) for kitchen_details.
    // That column is JSON, and MariaDB auto-attaches an implicit
    // CHECK (json_valid(kitchen_details)) constraint named after the column itself - which is
    // exactly the constraint name in that error. An empty string is not valid JSON, so the
    // whole INSERT was rejected and no Multi Key property could be created at all. NULL is the
    // correct "no kitchen config on this row" value (the column is already DEFAULT NULL, and
    // the EXPENSES row on the very next line was already doing this correctly) - never ''.
    $stmt = $pdo->prepare("
        INSERT INTO property_shared_data (property_id, data_type, staff_json, kitchen_details)
        VALUES (?, 'STAFF', ?, NULL), (?, 'EXPENSES', NULL, NULL), (?, 'KITCHEN', NULL, ?)
    ");
    $stmt->execute([
        $property_id, json_encode([]),
        $property_id,
        $property_id, json_encode([])
    ]);

    // Enable default modules
    $default_modules = ['guests', 'billing', 'staff', 'reports'];
    $stmt = $pdo->prepare("INSERT INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, ?, 1)");
    foreach ($default_modules as $module) {
        $stmt->execute([$property_id, $module]);
    }

    // Get tenant username
    $stmt = $pdo->prepare("SELECT slug, name FROM tenants WHERE id = ?");
    $stmt->execute([$tenant_id]);
    $tenant = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($tenant) {
        // Auto-create staff user with tenant username
        $tenant_username = $tenant['slug'];
        $tenant_name = $tenant['name'];

        // Check if tenant user already exists in new property
        $check_stmt = $pdo->prepare("SELECT id FROM staff_users WHERE property_id = ? AND username = ?");
        $check_stmt->execute([$property_id, $tenant_username]);
        if (!$check_stmt->fetch()) {
            $tenant_stmt = $pdo->prepare("
                INSERT INTO staff_users (property_id, username, full_name, role, status)
                VALUES (?, ?, ?, 'Admin', 'Active')
            ");
            $tenant_stmt->execute([$property_id, $tenant_username, $tenant_name]);
        }
    }

    // Carry forward Super Admin user from tenant - a no-op the first time a
    // tenant creates ANY property (nothing to carry forward yet), meaningful
    // when this is an additional property for a tenant that already has one.
    $stmt = $pdo->prepare("
        SELECT su.id, su.username, su.full_name, su.phone, su.monthly_salary, su.is_financial_handler, su.passcode, su.qr_code_url, su.upi_id
        FROM staff_users su
        JOIN properties p ON su.property_id = p.id
        WHERE p.tenant_id = ? AND su.role = 'Super Admin'
        LIMIT 1
    ");
    $stmt->execute([$tenant_id]);
    $superadmin = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($superadmin) {
        // Check if Super Admin already exists in new property
        $check_stmt = $pdo->prepare("SELECT id FROM staff_users WHERE property_id = ? AND role = 'Super Admin'");
        $check_stmt->execute([$property_id]);
        if (!$check_stmt->fetch()) {
            // Create Super Admin in new property
            $sa_stmt = $pdo->prepare("
                INSERT INTO staff_users (id, property_id, username, full_name, role, phone, monthly_salary, status, is_financial_handler, passcode, qr_code_url, upi_id)
                VALUES (?, ?, ?, ?, 'Super Admin', ?, ?, 'Active', ?, ?, ?, ?)
            ");
            $sa_stmt->execute([
                'superadmin_' . $property_id,
                $property_id,
                $superadmin['username'],
                $superadmin['full_name'],
                $superadmin['phone'],
                $superadmin['monthly_salary'],
                $superadmin['is_financial_handler'],
                $superadmin['passcode'],
                $superadmin['qr_code_url'],
                $superadmin['upi_id']
            ]);
        }
    }

    // Populate default expense categories for MultiKey property
    populateDefaultExpenses($pdo, $property_id);

    return $property_id;
}

function createMultiKeyProperty($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $tenant_id = $input['tenant_id'] ?? '';
    $name = $input['name'] ?? '';
    $slug = $input['slug'] ?? '';
    $address = $input['address'] ?? '';
    $currency = $input['currency'] ?? 'INR';
    $timezone = $input['timezone'] ?? 'Asia/Kolkata';

    // Validate required fields
    if (!$tenant_id || !$name || !$slug) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'tenant_id, name, and slug required']);
        exit;
    }

    try {
        $property_id = createMultiKeyPropertyCore($pdo, (int)$tenant_id, $name, $slug, $address, $currency, $timezone);
        echo json_encode([
            'success' => true,
            'message' => 'Multi Key property created successfully',
            'property_id' => $property_id,
            'property_type' => 'MULTI_KEY',
            'slug' => $slug
        ]);
    } catch (Exception $e) {
        $msg = $e->getMessage();
        http_response_code($msg === 'Tenant not found' ? 404 : ($msg === 'tenant_id, name, and slug required' ? 400 : ($msg === 'Property slug already exists in this tenant' ? 400 : 500)));
        echo json_encode(['success' => false, 'message' => $msg]);
    }
    exit;
}

/**
 * Add a room to an existing MultiKey property
 * POST /api/router.php?action=add_multikey_room
 */
/**
 * Core "add a room to a MultiKey property" logic - no I/O, safely callable
 * from other server-side flows (see createMultiKeyPropertyCore()'s comment
 * for why this split exists). Throws Exception on any failure. Returns
 * ['room_id' => int, 'room_order' => int].
 */
function addMultiKeyRoomCore(PDO $pdo, int $parent_property_id, string $room_name, string $room_slug, ?float $default_tariff = null): array {
    if (!$parent_property_id || !$room_name || !$room_slug) {
        throw new Exception('parent_property_id, room_name, and room_slug required');
    }

    // Verify parent property exists and is MULTI_KEY type
    $stmt = $pdo->prepare("SELECT id, tenant_id, slug FROM properties WHERE id = ? AND property_type = 'MULTI_KEY'");
    $stmt->execute([$parent_property_id]);
    $parent = $stmt->fetch();
    if (!$parent) {
        throw new Exception('Parent property not found or is not a MultiKey property');
    }

    // Count existing rooms (non-deleted)
    $stmt = $pdo->prepare("
        SELECT COUNT(*) as room_count FROM properties
        WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
    ");
    $stmt->execute([$parent_property_id]);
    $result = $stmt->fetch();
    if ($result['room_count'] >= 10) {
        throw new Exception('Maximum 10 rooms allowed per MultiKey property');
    }

    // Check room slug uniqueness within parent property
    $stmt = $pdo->prepare("
        SELECT id FROM properties
        WHERE parent_property_id = ? AND slug = ? AND is_deleted = 0
    ");
    $stmt->execute([$parent_property_id, $room_slug]);
    if ($stmt->fetch()) {
        throw new Exception('Room slug already exists in this property');
    }

    // Get next room order
    $stmt = $pdo->prepare("
        SELECT MAX(room_order) as max_order FROM properties
        WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'
    ");
    $stmt->execute([$parent_property_id]);
    $result = $stmt->fetch();
    $next_order = ($result['max_order'] ?? 0) + 1;

    // Create room as MULTI_KEY_ROOM
    $stmt = $pdo->prepare("
        INSERT INTO properties (tenant_id, parent_property_id, name, slug, property_type, room_order, is_active, default_tariff)
        VALUES (?, ?, ?, ?, 'MULTI_KEY_ROOM', ?, 1, ?)
    ");
    $stmt->execute([$parent['tenant_id'], $parent_property_id, $room_name, $room_slug, $next_order, $default_tariff]);
    $room_id = (int)$pdo->lastInsertId();

    // Enable same modules as parent
    $stmt = $pdo->prepare("SELECT module_slug FROM property_modules WHERE property_id = ? AND is_enabled = 1");
    $stmt->execute([$parent_property_id]);
    $modules = $stmt->fetchAll();

    $insert_stmt = $pdo->prepare("INSERT INTO property_modules (property_id, module_slug, is_enabled) VALUES (?, ?, 1)");
    foreach ($modules as $module) {
        $insert_stmt->execute([$room_id, $module['module_slug']]);
    }

    return ['room_id' => $room_id, 'room_order' => $next_order];
}

function addMultiKeyRoom($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $parent_property_id = $input['parent_property_id'] ?? '';
    $room_name = $input['room_name'] ?? '';
    $room_slug = $input['room_slug'] ?? '';
    // Optional - a room can be added without a rate and priced later via
    // update_room_tariff. Blank/non-numeric input is treated as "not set" (NULL),
    // not as a coerced 0, so the Add Booking form correctly falls back to manual
    // entry rather than pre-filling ₹0.
    $default_tariff = (isset($input['default_tariff']) && $input['default_tariff'] !== '' && is_numeric($input['default_tariff']))
        ? (float)$input['default_tariff']
        : null;

    if (!$parent_property_id || !$room_name || !$room_slug) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'parent_property_id, room_name, and room_slug required']);
        exit;
    }

    try {
        $result = addMultiKeyRoomCore($pdo, (int)$parent_property_id, $room_name, $room_slug, $default_tariff);
        echo json_encode([
            'success' => true,
            'message' => 'Room added successfully',
            'room_id' => $result['room_id'],
            'room_slug' => $room_slug,
            'room_name' => $room_name,
            'room_order' => $result['room_order']
        ]);
    } catch (Exception $e) {
        $msg = $e->getMessage();
        $notFound = $msg === 'Parent property not found or is not a MultiKey property';
        $badRequest = in_array($msg, ['parent_property_id, room_name, and room_slug required', 'Maximum 10 rooms allowed per MultiKey property', 'Room slug already exists in this property'], true);
        http_response_code($notFound ? 404 : ($badRequest ? 400 : 500));
        echo json_encode(['success' => false, 'message' => $msg]);
    }
    exit;
}

/**
 * Get MultiKey property with all its rooms
 * GET /api/router.php?action=get_multikey_property&property_id=5
 */
function getMultiKeyProperty($pdo, $propertyId = 0, $currentProperty = []) {
    $property_id = $_GET['property_id'] ?? '';

    if (!$property_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'property_id required']);
        exit;
    }

    // Only allow reading a property that belongs to the current URL context.
    denyIfNotInMultiKeyScope($pdo, $currentProperty, $property_id);

    try {
        // Get parent MultiKey property
        $stmt = $pdo->prepare("
            SELECT id, tenant_id, name, slug, property_type, address, currency, timezone, is_active, created_at,
                   email, phone, google_maps_link, whatsapp_voucher_template, gstin, upi_id, upi_qr_code_url, instructions,
                   telegram_template_customization_enabled, walk_in_table_count, is_public_demo
            FROM properties
            WHERE id = ? AND property_type = 'MULTI_KEY'
        ");
        $stmt->execute([$property_id]);
        $property = $stmt->fetch();

        if (!$property) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'MultiKey property not found']);
            exit;
        }

        // Get all rooms (non-deleted). checkin_time/checkout_time included so a
        // room's own Edit Property form can show/save them per-room (each room
        // row already carries its own values - see properties.checkin_time/
        // checkout_time - just never surfaced here before).
        $stmt = $pdo->prepare("
            SELECT id, name, slug, room_order, is_active, created_at, default_tariff, checkin_time, checkout_time
            FROM properties
            WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
            ORDER BY room_order ASC
        ");
        $stmt->execute([$property_id]);
        $rooms = $stmt->fetchAll();
        foreach ($rooms as &$room) {
            $room['default_tariff'] = $room['default_tariff'] !== null ? (float)$room['default_tariff'] : null;
        }
        unset($room);

        // Get shared data
        $stmt = $pdo->prepare("
            SELECT data_type, staff_json, kitchen_details
            FROM property_shared_data
            WHERE property_id = ?
        ");
        $stmt->execute([$property_id]);
        $shared_data_rows = $stmt->fetchAll();

        $shared_data = [];
        foreach ($shared_data_rows as $row) {
            if ($row['data_type'] === 'STAFF' && $row['staff_json']) {
                $shared_data['staff'] = json_decode($row['staff_json'], true) ?? [];
            } elseif ($row['data_type'] === 'KITCHEN' && $row['kitchen_details']) {
                $shared_data['kitchen'] = json_decode($row['kitchen_details'], true) ?? [];
            }
        }

        echo json_encode([
            'success' => true,
            'data' => [
                'id' => (int)$property['id'],
                'tenant_id' => (int)$property['tenant_id'],
                'name' => $property['name'],
                'slug' => $property['slug'],
                'property_type' => $property['property_type'],
                'email' => $property['email'] ?? null,
                'phone' => $property['phone'] ?? null,
                'gstin' => $property['gstin'] ?? null,
                'upi_id' => $property['upi_id'] ?? null,
                'upi_qr_code_url' => $property['upi_qr_code_url'] ?? null,
                'walk_in_table_count' => (int)($property['walk_in_table_count'] ?? 10),
                'whatsapp_voucher_template' => $property['whatsapp_voucher_template'] ?? null,
                'telegram_template_customization_enabled' => (bool)($property['telegram_template_customization_enabled'] ?? false),
                'address' => $property['address'],
                'google_maps_link' => $property['google_maps_link'],
                'instructions' => $property['instructions'],
                'currency' => $property['currency'],
                'timezone' => $property['timezone'],
                'is_active' => (bool)$property['is_active'],
                'created_at' => $property['created_at'],
                // Added 28 Aug 2026 - see getTenantIsDemo()'s own comment in property_resolver.php
                // for why both of these were silently missing from this endpoint's response.
                'is_public_demo' => (bool)($property['is_public_demo'] ?? false),
                'tenant_is_demo' => getTenantIsDemo($pdo, (int)$property['tenant_id']),
                'room_count' => count($rooms),
                'rooms' => $rooms,
                'shared_data' => $shared_data
            ]
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Get overview/dashboard data for MultiKey property
 * GET /api/router.php?action=get_multikey_overview&property_id=5
 */
function getMultiKeyOverview($pdo, $propertyId = 0, $currentProperty = []) {
    $property_id = $_GET['property_id'] ?? '';

    if (!$property_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'property_id required']);
        exit;
    }

    // Only allow reading a property that belongs to the current URL context.
    denyIfNotInMultiKeyScope($pdo, $currentProperty, $property_id);

    try {
        // Get parent property
        $stmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? AND property_type = 'MULTI_KEY'");
        $stmt->execute([$property_id]);
        $property = $stmt->fetch();

        if (!$property) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'MultiKey property not found']);
            exit;
        }

        // Get all rooms with their booking status and revenue
        $stmt = $pdo->prepare("
            SELECT
                p.id,
                p.name,
                p.slug,
                p.room_order,
                COUNT(DISTINCT g.id) as guest_count,
                SUM(CASE WHEN g.status = 'Active Resident' THEN 1 ELSE 0 END) as occupied,
                SUM(COALESCE(br.grand_total, 0)) as total_revenue
            FROM properties p
            LEFT JOIN guests g ON g.property_id = p.id
            LEFT JOIN billing_receipts br ON br.property_id = p.id
            WHERE p.parent_property_id = ? AND p.property_type = 'MULTI_KEY_ROOM' AND p.is_deleted = 0
            GROUP BY p.id
            ORDER BY p.room_order ASC
        ");
        $stmt->execute([$property_id]);
        $rooms = $stmt->fetchAll();

        // Calculate totals and cast values
        $total_rooms = count($rooms);
        $total_occupied = 0;
        $total_revenue = 0;

        foreach ($rooms as &$room) {
            $room['guest_count'] = (int)$room['guest_count'];
            $room['occupied'] = (int)$room['occupied'];
            $room['total_revenue'] = (float)$room['total_revenue'];

            if ($room['occupied'] > 0) {
                $total_occupied += $room['occupied'];
            }
            $total_revenue += $room['total_revenue'];
        }

        $occupancy_rate = $total_rooms > 0 ? round(($total_occupied / $total_rooms) * 100, 2) : 0;

        echo json_encode([
            'success' => true,
            'data' => [
                'property_id' => (int)$property_id,
                'property_name' => $property['name'],
                'total_rooms' => $total_rooms,
                'total_occupied' => $total_occupied,
                'occupancy_rate' => $occupancy_rate,
                'total_revenue' => (float)$total_revenue,
                'rooms' => $rooms
            ]
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Delete a room (soft delete)
 * DELETE /api/router.php?action=delete_multikey_room
 */
function deleteMultiKeyRoom($pdo, $propertyId = 0, $currentProperty = []) {
    $input = json_decode(file_get_contents('php://input'), true);
    $room_id = $input['room_id'] ?? '';

    if (!$room_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'room_id required']);
        exit;
    }

    // The room must be part of the current request's property tree - without
    // this, any authenticated user could guess a global room id and delete
    // another tenant's room (and its active guest bookings).
    denyIfRoomNotInMultiKeyScope($pdo, $currentProperty, $room_id);

    try {
        // Verify room exists and is MULTI_KEY_ROOM
        $stmt = $pdo->prepare("SELECT id, name FROM properties WHERE id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $stmt->execute([$room_id]);
        $room = $stmt->fetch();

        if (!$room) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Room not found']);
            exit;
        }

        // Soft delete: set is_deleted = 1
        $stmt = $pdo->prepare("UPDATE properties SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$room_id]);

        // Clean up: delete present and future (active) bookings associated with this deleted room
        $stmt = $pdo->prepare("DELETE FROM guests WHERE room_id = ? AND status IN (?, ?)");
        $stmt->execute([$room_id, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN]);

        echo json_encode([
            'success' => true,
            'message' => 'Room deleted successfully. Booking history preserved.',
            'room_id' => (int)$room_id,
            'room_name' => $room['name']
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Update room display order within a MultiKey property
 * PUT /api/router.php?action=update_room_order
 */
function updateRoomOrder($pdo, $propertyId = 0, $currentProperty = []) {
    $input = json_decode(file_get_contents('php://input'), true);
    $rooms = $input['rooms'] ?? [];

    if (!is_array($rooms) || empty($rooms)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'rooms array required']);
        exit;
    }

    // Every room in the reorder list must belong to the current request's scope.
    foreach ($rooms as $room) {
        $room_id = $room['id'] ?? '';
        if ($room_id !== '' && !isRoomInMultiKeyScope($pdo, $currentProperty, $room_id)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'message' => 'Access denied: room is not part of the current property context']);
            exit;
        }
    }

    try {
        $stmt = $pdo->prepare("UPDATE properties SET room_order = ? WHERE id = ?");

        foreach ($rooms as $room) {
            $room_id = $room['id'] ?? '';
            $order = $room['order'] ?? 0;

            if (!$room_id) continue;

            $stmt->execute([$order, $room_id]);
        }

        echo json_encode([
            'success' => true,
            'message' => 'Room order updated successfully'
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Rename a room within a MultiKey property
 * POST /api/router.php?action=update_room_name
 */
function updateRoomName($pdo, $propertyId = 0, $currentProperty = []) {
    $input = json_decode(file_get_contents('php://input'), true);
    $room_id = $input['room_id'] ?? '';
    $new_name = trim($input['new_name'] ?? '');

    if (!$room_id || $new_name === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'room_id and new_name are required']);
        exit;
    }

    denyIfRoomNotInMultiKeyScope($pdo, $currentProperty, $room_id);

    try {
        // Verify room exists and is MULTI_KEY_ROOM
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $stmt->execute([$room_id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Room not found']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE properties SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$new_name, $room_id]);

        echo json_encode([
            'success' => true,
            'message' => 'Room renamed successfully',
            'room_id' => (int)$room_id,
            'new_name' => $new_name
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Update a room's default per-night tariff - lets Add Booking auto-populate a
 * starting price for that room instead of every booking starting blank.
 * POST /api/router.php?action=update_room_tariff
 */
function updateRoomTariff($pdo, $propertyId = 0, $currentProperty = []) {
    $input = json_decode(file_get_contents('php://input'), true);
    $room_id = $input['room_id'] ?? '';
    $hasTariff = array_key_exists('default_tariff', (array)$input);
    $raw_tariff = $input['default_tariff'] ?? null;

    if (!$room_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'room_id is required']);
        exit;
    }
    // Explicitly allow clearing the tariff back to "not set" (null/empty string),
    // but reject a present, non-empty value that isn't actually a number.
    if ($hasTariff && $raw_tariff !== null && $raw_tariff !== '' && !is_numeric($raw_tariff)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'default_tariff must be a number']);
        exit;
    }
    $new_tariff = ($hasTariff && $raw_tariff !== null && $raw_tariff !== '') ? (float)$raw_tariff : null;

    denyIfRoomNotInMultiKeyScope($pdo, $currentProperty, $room_id);

    try {
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? AND property_type = 'MULTI_KEY_ROOM'");
        $stmt->execute([$room_id]);
        if (!$stmt->fetch()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Room not found']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE properties SET default_tariff = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$new_tariff, $room_id]);

        echo json_encode([
            'success' => true,
            'message' => 'Room tariff updated successfully',
            'room_id' => (int)$room_id,
            'default_tariff' => $new_tariff
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Restore a soft-deleted room
 * PUT /api/router.php?action=restore_multikey_room
 */
function restoreMultiKeyRoom($pdo, $propertyId = 0, $currentProperty = []) {
    $input = json_decode(file_get_contents('php://input'), true);
    $room_id = $input['room_id'] ?? '';

    if (!$room_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'room_id required']);
        exit;
    }

    denyIfRoomNotInMultiKeyScope($pdo, $currentProperty, $room_id);

    try {
        // Verify room exists and is deleted
        $stmt = $pdo->prepare("SELECT id, name FROM properties WHERE id = ? AND is_deleted = 1");
        $stmt->execute([$room_id]);
        $room = $stmt->fetch();

        if (!$room) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Deleted room not found']);
            exit;
        }

        // Restore: set is_deleted = 0
        $stmt = $pdo->prepare("UPDATE properties SET is_deleted = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
        $stmt->execute([$room_id]);

        echo json_encode([
            'success' => true,
            'message' => 'Room restored successfully',
            'room_id' => (int)$room_id,
            'room_name' => $room['name']
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Get room-grouped active bookings for MultiKey properties
 * Fetches all active guests grouped by their room for billing
 * GET /api/router.php?action=get_room_grouped_active_bookings&property_id=X
 */
function getRoomGroupedActiveBookings($pdo, $propertyId = 0, $currentProperty = []) {
    $property_id = $_GET['property_id'] ?? '';

    if (!$property_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'property_id required']);
        exit;
    }

    // Only allow reading a property that belongs to the current URL context.
    denyIfNotInMultiKeyScope($pdo, $currentProperty, $property_id);

    try {
        // Get the property and verify it's MultiKey
        $stmt = $pdo->prepare("SELECT id, property_type FROM properties WHERE id = ?");
        $stmt->execute([$property_id]);
        $property = $stmt->fetch();

        if (!$property || $property['property_type'] !== 'MULTI_KEY') {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Property not found or is not a MultiKey property']);
            exit;
        }

        // Fetch rooms for this property
        $stmt = $pdo->prepare("
            SELECT id, name, slug, room_order
            FROM properties
            WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
            ORDER BY room_order ASC
        ");
        $stmt->execute([$property_id]);
        $rooms = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch active bookings
        $stmt = $pdo->prepare("
            SELECT *
            FROM guests
            WHERE property_id = ? AND status IN (?, ?)
            ORDER BY room_number ASC, checkin_date ASC
        ");
        $stmt->execute([$property_id, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN]);
        $bookings = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Group bookings by room
        $grouped = [];
        foreach ($rooms as $room) {
            $room_bookings = array_filter($bookings, function($booking) use ($room) {
                return $booking['room_number'] === $room['name'] || $booking['room_number'] === $room['slug'];
            });

            if (!empty($room_bookings)) {
                $grouped[] = [
                    'room_id' => (int)$room['id'],
                    'room_name' => $room['name'],
                    'room_slug' => $room['slug'],
                    'guest_count' => count($room_bookings),
                    'bookings' => array_values($room_bookings),
                    'room_total_revenue' => array_reduce($room_bookings, function($sum, $booking) {
                        $room_rate = floatval($booking['base_room_rent'] ?? $booking['total_charge'] ?? 0);
                        $advance = floatval($booking['advance_paid'] ?? 0);
                        return $sum + ($room_rate - $advance);
                    }, 0)
                ];
            }
        }

        // Calculate summary
        $total_active = count($bookings);
        $total_revenue = array_reduce($bookings, function($sum, $booking) {
            $room_rate = floatval($booking['base_room_rent'] ?? $booking['total_charge'] ?? 0);
            $advance = floatval($booking['advance_paid'] ?? 0);
            return $sum + ($room_rate - $advance);
        }, 0);

        echo json_encode([
            'success' => true,
            'status' => 'success',
            'data' => [
                'property_id' => (int)$property_id,
                'total_active_bookings' => $total_active,
                'total_rooms_occupied' => count($grouped),
                'total_revenue_pending' => $total_revenue,
                'grouped_rooms' => $grouped
            ]
        ]);

    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Populate default expenses for an existing MultiKey property
 * POST /api/router.php?action=populate_default_expenses
 */
function populateDefaultExpensesForProperty($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $property_id = $input['property_id'] ?? '';

    if (!$property_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'property_id required']);
        exit;
    }

    try {
        // Verify property exists and is MULTI_KEY type
        $stmt = $pdo->prepare("SELECT id, property_type FROM properties WHERE id = ?");
        $stmt->execute([$property_id]);
        $property = $stmt->fetch();

        if (!$property) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Property not found']);
            exit;
        }

        if ($property['property_type'] !== 'MULTI_KEY') {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'This feature is only for MultiKey properties']);
            exit;
        }

        // Populate defaults (will skip if they already exist)
        if (function_exists('populateDefaultExpenses')) {
            $result = populateDefaultExpenses($pdo, $property_id, true);
            echo json_encode([
                'success' => true,
                'message' => 'Default expense categories populated successfully',
                'details' => $result
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Expense system not initialized']);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

/**
 * Sync default expenses for ALL MultiKey properties
 * POST /api/router.php?action=sync_all_default_expenses
 */
function syncAllDefaultExpenses($pdo) {
    try {
        // Get all MultiKey properties
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE property_type = 'MULTI_KEY' AND is_active = 1");
        $stmt->execute();
        $properties = $stmt->fetchAll(PDO::FETCH_ASSOC);

        if (function_exists('populateDefaultExpenses')) {
            $synced = 0;
            $errors = [];

            foreach ($properties as $property) {
                try {
                    $result = populateDefaultExpenses($pdo, $property['id'], true);
                    if ($result['status'] === 'success') {
                        $synced++;
                    }
                } catch (Exception $e) {
                    $errors[] = "Property {$property['id']}: " . $e->getMessage();
                }
            }

            echo json_encode([
                'success' => true,
                'message' => "Default expenses synced for {$synced} MultiKey properties",
                'synced_count' => $synced,
                'total_properties' => count($properties),
                'errors' => $errors
            ]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'Expense system not initialized']);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}
