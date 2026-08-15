<?php
/**
 * Demo Data Generator
 * Populates system with realistic sample data for testing and demos
 * Each call refreshes the demo data
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
require_once __DIR__ . '/../modules/module_manager.php';
require_once __DIR__ . '/../finance/ledger.php';

// The router starts the session when this file is require_once'd; a direct hit
// needs its own boot so the auth gate below can see $_SESSION['username'].
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    session_name('artists_farm_session');
    session_start();
}

// Ensure the is_demo flag exists on every table the generator writes to and
// clearDemoData() filters deletes by. Split out so both generateDemoData()
// and clearDemoData() can call it first - clearDemoData() is also reachable
// standalone (the modal's "Exit Test Mode" action), and on a property whose
// tables never had a demo cycle run against them yet, its is_demo = 1 WHERE
// clauses would otherwise fail with "Unknown column 'is_demo'" before the
// ALTER ever got a chance to run.
function ensureDemoSchema($pdo) {
    $alterCols = [
        "ALTER TABLE `staff_users` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `guests` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `menu_items` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `req_catalog` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `petty_cash` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `audit_logs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `service_requests` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `orders` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `order_items` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `staff_meal_logs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `kitchen_wastage_logs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `kitchen_purchases_log` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `cash_drawer_entries` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `billing_receipts` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `payee_entities` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `staff_attendance` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `ical_sync_configs` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        "ALTER TABLE `ical_sync_configs` ADD COLUMN IF NOT EXISTS `sync_interval` INT NOT NULL DEFAULT 0",
        "ALTER TABLE `farm_utility_expenses` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        // Real fix (14 Aug 2026), not demo-only: staff_users.id is a
        // non-numeric string (e.g. "DEMO-abc123", "usr-1723..."), but
        // staff_attendance.user_id was declared int(11) - inserting any
        // non-numeric id into it silently coerces to 0 (or fails under
        // strict SQL modes), so the LEFT JOIN back to staff_users in
        // get_attendance (staff.php) could never actually resolve a name,
        // and multiple staff marking attendance would collide on the same
        // coerced 0. Widened to match staff_users.id's actual type - fixes
        // this for real (non-demo) attendance too, not just seeded data.
        "ALTER TABLE `staff_attendance` MODIFY COLUMN `user_id` VARCHAR(50) NULL",
    ];
    foreach ($alterCols as $sql) {
        try { $pdo->exec($sql); } catch (PDOException $e) {}
    }
}

// Real day-to-day activity (expenses, wastage, purchases, ...) doesn't land
// one-per-day - some days have nothing logged, most have one or two, a few
// busy days have several. Returns a flat list of DateTime objects (one entry
// per event, days repeated for multi-event days) so callers can just
// foreach() over it. $activeChance is the % chance any given day has any
// activity at all.
function burstyDayList($windowStart, $windowEnd, $activeChance = 55) {
    $days = [];
    for ($d = clone $windowStart; $d <= $windowEnd; $d->modify('+1 day')) {
        if (rand(1, 100) > $activeChance) continue;
        $roll = rand(1, 100);
        $count = $roll <= 65 ? 1 : ($roll <= 88 ? 2 : rand(3, 4));
        for ($c = 0; $c < $count; $c++) {
            $days[] = clone $d;
        }
    }
    return $days;
}

function generateDemoData($pdo, $propertyId) {
    // Demo data is a sales/testing aid - never seed it on live production,
    // regardless of which entry point (router.php or a direct/scripted call)
    // reached this function. See APP_DEMO_DATA_ENABLED in config/database.php.
    if (!APP_DEMO_DATA_ENABLED) {
        return ['status' => 'error', 'success' => false, 'message' => 'Demo data features are disabled on production.'];
    }

    // Check if dummy history mode is enabled
    try {
        $stmt = $pdo->prepare("SELECT dummy_history_enabled FROM properties WHERE id = ?");
        $stmt->execute([$propertyId]);
        $dummyHistoryEnabled = (bool)($stmt->fetchColumn() ?: 0);
        if ($dummyHistoryEnabled) {
            return ['status' => 'success', 'message' => 'Dummy history mode active - data is fixed'];
        }
    } catch (PDOException $e) {}

    ensureDemoSchema($pdo);

    // Always start from a clean slate.
    clearDemoData($pdo, $propertyId);

    try {
        $pdo->beginTransaction();

        // 1. Demo Users (Staff with different roles)
        // A property mid-onboarding (empty address) reads as a fresh, half-set-up
        // account, not a site that's supposedly been running for a month - fill it
        // in, but only if it's genuinely empty so this never overwrites a real
        // property's real address if the generator is ever pointed at one.
        $addrStmt = $pdo->prepare("SELECT address FROM properties WHERE id = ?");
        $addrStmt->execute([$propertyId]);
        if (empty($addrStmt->fetchColumn())) {
            $pdo->prepare("UPDATE properties SET address = ?, google_maps_link = ? WHERE id = ?")
                ->execute(['221 Ocean Drive, Candolim, North Goa, Goa 403515', 'https://maps.app.goo.gl/8xQz3vN2kP9r7T4A6', $propertyId]);
        }

        // is_financial_handler=1 on Manager/Reception - real cash/advance-taking
        // roles - so the "Advance/Pending Received By" dropdowns (both filter to
        // staff.isFinancialHandler, see BookingDetailsModal.tsx) actually have
        // someone to select instead of showing "No matches" against 4 real staff
        // that all default to is_financial_handler=0.
        // demo_admin (Admin) exists so the Public Demo Mode auto-login (see
        // router.php's is_public_demo block) has an admin-tier account to
        // pick - without it, the ORDER BY falls back to Manager, which is
        // what demo visitors used to be logged in as instead of a fuller
        // admin view.
        // NOT role 'Super Admin' (13 Aug 2026): that role is reserved
        // exclusively for the tenant's own synced identity, exactly one per
        // property, auto-maintained by syncTenantSuperAdminRow() in
        // router.php - a demo-data placeholder holding it was exactly the
        // kind of stale/duplicate "Super Admin" that invariant exists to
        // prevent. 'Admin' is the highest role left in get_demo_login_credentials's
        // priority order, so this still gets demo visitors the best available
        // account.
        $demoUsers = [
            ['username' => 'demo_admin', 'name' => 'Vikram Malhotra', 'phone' => '9876543214', 'role' => 'Admin', 'status' => 'Active', 'is_financial_handler' => 1],
            ['username' => 'demo_manager', 'name' => 'Rajesh Kumar', 'phone' => '9876543210', 'role' => 'Manager', 'status' => 'Active', 'is_financial_handler' => 1],
            ['username' => 'demo_chef', 'name' => 'Sunil Yadav', 'phone' => '9876543211', 'role' => 'Chef/Cook', 'status' => 'Active', 'is_financial_handler' => 0],
            ['username' => 'demo_house', 'name' => 'Lakshmi Devi', 'phone' => '9876543212', 'role' => 'Housekeeping', 'status' => 'Active', 'is_financial_handler' => 0],
            ['username' => 'demo_reception', 'name' => 'Neha Gupta', 'phone' => '9876543213', 'role' => 'Manager/Reception', 'status' => 'Active', 'is_financial_handler' => 1],
        ];

        // Keyed by full_name so the attendance-seeding section below (6f) can
        // mark attendance against the exact staff_users.id each of these
        // rows actually got, without a re-query.
        $demoUserIdsByName = [];
        foreach ($demoUsers as $user) {
            $userId = 'DEMO-' . uniqid();
            $demoUserIdsByName[$user['name']] = $userId;
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO staff_users (id, property_id, username, full_name, phone, role, status, is_financial_handler, is_demo, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
            ");
            $stmt->execute([$userId, $propertyId, $user['username'], $user['name'], $user['phone'], $user['role'], $user['status'], $user['is_financial_handler']]);
        }

        // 2. Rooms - ensure 5 demo rooms exist with varied default tariffs
        $requiredRooms = [
            ['name' => 'Room 101', 'slug' => 'room-101', 'tariff' => 2200],
            ['name' => 'Room 102', 'slug' => 'room-102', 'tariff' => 2500],
            ['name' => 'Room 103', 'slug' => 'room-103', 'tariff' => 2000],
            ['name' => 'Room 104', 'slug' => 'room-104', 'tariff' => 1800],
            ['name' => 'Room 105', 'slug' => 'room-105', 'tariff' => 2400],
        ];

        $roomIds = [];
        foreach ($requiredRooms as $requiredRoom) {
            $checkStmt = $pdo->prepare("SELECT id FROM properties WHERE parent_property_id = ? AND name = ? AND is_deleted = 0");
            $checkStmt->execute([$propertyId, $requiredRoom['name']]);
            $existing = $checkStmt->fetchColumn();

            if (!$existing) {
                // properties.slug is globally unique, not scoped per-property, so the
                // plain 'room-101' etc. slug only survives the very first property this
                // generator ever ran against - every property after that collides with
                // the same slug already taken. Suffix with the parent property id.
                $roomSlug = $requiredRoom['slug'] . '-' . $propertyId;
                $createStmt = $pdo->prepare("
                    INSERT INTO properties (parent_property_id, name, slug, property_type, is_active, default_tariff, created_at)
                    VALUES (?, ?, ?, 'MULTI_KEY_ROOM', 1, ?, NOW())
                ");
                $createStmt->execute([$propertyId, $requiredRoom['name'], $roomSlug, $requiredRoom['tariff']]);
            } else {
                $updateStmt = $pdo->prepare("UPDATE properties SET default_tariff = ? WHERE id = ?");
                $updateStmt->execute([$requiredRoom['tariff'], $existing]);
            }
        }

        // Re-fetch all room IDs with their tariffs
        $roomStmt = $pdo->prepare("
            SELECT id, name, default_tariff FROM properties
            WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0
            ORDER BY name ASC
        ");
        $roomStmt->execute([$propertyId]);
        $rooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);
        $roomIds = array_column($rooms, 'id');
        $roomTariffs = [];
        foreach ($rooms as $r) {
            $roomTariffs[(int)$r['id']] = (float)$r['default_tariff'];
        }

        if (empty($roomIds)) {
            $roomIds = [null];
            $rooms = [['id' => null, 'name' => 'N/A', 'default_tariff' => 2000]];
        }

        // 3. Demo Guests - realistic bookings across 37-day window (-30 to +7)
        $today = new DateTime('today');
        $windowStart = (clone $today)->modify('-30 days');
        $windowEnd = (clone $today)->modify('+7 days');
        $windowDays = 37;

        // Generate bookings per room: ~70% occupancy, 6-9 stays, 2-5 nights each
        // BUG (found 14 Aug 2026): only 15 names, cycled with % across up to 45
        // total bookings (5 rooms x up to 9 stays each) - the same name (and
        // since a room's nightly rate is fixed, often the same displayed
        // price too) necessarily repeated multiple times across the
        // property's calendar. Made it genuinely hard to tell two completely
        // different stays apart at a glance, which read as a bug even when
        // the underlying dates/status were correct. Expanded well past the
        // realistic max (60 names for a 45-booking ceiling) and shuffled once
        // per generate so every booking on the property gets its own unique
        // name, with a different shuffle order each reset.
        $guestNames = [
            'Arjun Mehta', 'Priya Sharma', 'Rahul Verma', 'Sneha Kapoor', 'Vikram Singh',
            'Ananya Iyer', 'Karthik Reddy', 'Divya Nair', 'Rohan Joshi', 'Meera Pillai',
            'Siddharth Rao', 'Kavya Menon', 'Aditya Varma', 'Pooja Bhatt', 'Varun Malhotra',
            'Rajesh Nair', 'Sunita Rao', 'Manoj Pillai', 'Deepika Iyer', 'Vivek Menon',
            'Anjali Reddy', 'Suresh Kumar', 'Neha Malhotra', 'Amit Sharma', 'Ritu Verma',
            'Sanjay Kapoor', 'Pallavi Singh', 'Nikhil Joshi', 'Shreya Varma', 'Rohit Bhatt',
            'Kiran Rao', 'Tanvi Mehta', 'Gaurav Nair', 'Isha Pillai', 'Abhishek Menon',
            'Nandini Reddy', 'Pranav Kumar', 'Swati Malhotra', 'Harsh Sharma', 'Divya Verma',
            'Yash Kapoor', 'Ritika Singh', 'Manish Joshi', 'Preeti Varma', 'Sameer Bhatt',
            'Anushka Rao', 'Deepak Mehta', 'Kavita Nair', 'Rakesh Pillai', 'Simran Menon',
            'Ajay Reddy', 'Meenal Kumar', 'Vikas Malhotra', 'Radhika Sharma', 'Naveen Verma',
            'Sonal Kapoor', 'Tarun Singh', 'Payal Joshi', 'Karan Varma', 'Ishita Bhatt',
        ];
        shuffle($guestNames);

        $allBookings = [];
        $nameIndex = 0;

        foreach ($rooms as $roomIdx => $room) {
            $roomId = $room['id'];
            $tariff = $room['default_tariff'] ?? 2000;
            $stayCount = 6 + array_rand(range(0, 3)); // 6-9 stays
            $targetOccupiedDays = (int)($windowDays * (0.65 + (array_rand([0, 5, 10, 15]) / 100))); // 65-75%
            $stayLengths = [];
            $totalNights = 0;
            for ($i = 0; $i < $stayCount; $i++) {
                $len = rand(2, 5);
                $stayLengths[] = $len;
                $totalNights += $len;
            }
            // Scale stay lengths to match target occupancy
            if ($totalNights > 0 && $targetOccupiedDays > 0) {
                $scale = min(1.0, $targetOccupiedDays / $totalNights);
                $stayLengths = array_map(function($len) use ($scale) {
                    return max(2, (int)round($len * $scale));
                }, $stayLengths);
                $totalNights = array_sum($stayLengths);
            }

            // Generate stay dates scattered across the window. $d must start as a
            // clone, not a reference to $windowStart itself - DateTime is mutable,
            // so $d->modify() below was advancing the shared $windowStart in place
            // on every call. First room in the property got a real date window;
            // every room after it saw $windowStart already past $windowEnd, so
            // $availableDays came back empty and the loop below crashed trying to
            // clone a non-existent $availableDays[0].
            $stayDates = [];
            $availableDays = [];
            for ($d = clone $windowStart; $d <= $windowEnd; $d->modify('+1 day')) {
                $availableDays[] = clone $d;
            }

            $idx = 0;
            $attempts = 0;
            while ($idx < count($stayLengths) && $attempts < 100) {
                $attempts++;
                $startOffset = rand(0, max(0, count($availableDays) - $stayLengths[$idx] - 1));
                $start = $availableDays[$startOffset];
                $end = (clone $start)->modify('+' . $stayLengths[$idx] . ' days');

                // Check overlap with existing stays
                $overlaps = false;
                foreach ($stayDates as $s) {
                    if ($start < $s['end'] && $end > $s['start']) {
                        $overlaps = true;
                        break;
                    }
                }
                if (!$overlaps) {
                    $stayDates[] = ['start' => $start, 'end' => $end, 'length' => $stayLengths[$idx]];
                    $idx++;
                }
            }

            // Sort stays by start date
            usort($stayDates, function($a, $b) { return $a['start'] <=> $b['start']; });

            foreach ($stayDates as $stay) {
                $guestName = $guestNames[$nameIndex % count($guestNames)];
                $nameIndex++;
                $phone = '9988776' . str_pad((string)(($roomIdx * 100 + $nameIndex) % 1000), 3, '0', STR_PAD_LEFT);

                $checkin = $stay['start']->format('Y-m-d');
                $checkout = $stay['end']->format('Y-m-d');
                $nights = $stay['length'];
                $totalCharge = $tariff * $nights;
                $advance = (int)($totalCharge * 0.3);

                // Status: past stays are checked out, current/future are checked in
                $status = GUEST_STATUS_CHECKED_IN;
                if ($stay['end'] <= $today) {
                    $status = GUEST_STATUS_CHECKED_OUT;
                }

                $allBookings[] = [
                    'name' => $guestName,
                    'phone' => $phone,
                    'checkin' => $checkin,
                    'checkout' => $checkout,
                    'status' => $status,
                    'room_id' => $roomId,
                    'per_night_charges' => $tariff,
                    'total_charge' => $totalCharge,
                    'advance' => $advance,
                ];
            }
        }

        // Every booking here carries a real advance (advance = 30% of total,
        // always > 0) - someone on staff has to have actually taken that
        // payment, same as pending_received_by would for whoever settles the
        // balance. Picked from the two financial-handler roles only (Manager,
        // Reception), matching who the "Advance Received By" dropdown itself
        // is scoped to.
        $financialHandlerNames = ['Rajesh Kumar', 'Neha Gupta'];

        // Insert all bookings
        $roomNameById = array_column($rooms, 'name', 'id');
        foreach ($allBookings as $guest) {
            $receivedBy = $financialHandlerNames[array_rand($financialHandlerNames)];
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO guests (property_id, guest_name, phone_number, checkin_date, expected_checkout, status, no_of_guests, room_id, per_night_charges, total_charge, advance_paid, advance_received_by, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $guest['name'], $guest['phone'], $guest['checkin'], $guest['checkout'], $guest['status'], $guest['room_id'], $guest['per_night_charges'], $guest['total_charge'], $guest['advance'], $receivedBy]);
            $lastGuestId = $pdo->lastInsertId();

            // Every real booking posts its advance to the ledger (see add_guest
            // in guests.php) - P&L/Balance Sheet/Cash Flow read from
            // financial_ledger, not the operational tables directly, so without
            // this those reports stay empty no matter how much real activity
            // exists in guests/petty_cash/etc.
            postFinancialLedger($pdo, [
                'entry_key' => 'guest_advance:demo:' . $lastGuestId,
                'direction' => 'credit',
                'amount' => $guest['advance'],
                'category' => 'Guest Registration Advance',
                'payment_method' => 'Cash',
                'party_type' => 'guest',
                'party_id' => $lastGuestId,
                'party_name' => $guest['name'],
                'source_type' => 'guest_registration',
                'source_id' => $lastGuestId,
                'description' => 'Advance collected at guest registration',
                'occurred_at' => $guest['checkin'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59)),
            ], $propertyId);

            // Checked-out bookings get a real settled receipt, same as an actual
            // checkout produces - otherwise Past Receipts stays empty despite a
            // month of "completed" stays, which is exactly the kind of gap that
            // makes seeded data read as thin rather than a real running site.
            if ($guest['status'] === GUEST_STATUS_CHECKED_OUT) {
                $checkinDt = new DateTime($guest['checkin']);
                $checkoutDt = new DateTime($guest['checkout']);
                $nights = max(1, $checkinDt->diff($checkoutDt)->days);
                $roomTotal = $guest['total_charge'];
                $foodTotal = rand(0, $nights * 300);
                $miscTotal = rand(1, 100) <= 30 ? rand(50, 400) : 0;
                $grandTotal = $roomTotal + $foodTotal + $miscTotal;
                $paymentMethods = ['Cash', 'Online/UPI', 'Card'];
                $receiptId = 'RCP-' . uniqid();
                $checkoutTime = $guest['checkout'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59));
                $stmt = $pdo->prepare("
                    INSERT IGNORE INTO billing_receipts (id, property_id, guest_name, room_number, checkin_date, checkout_date, room_rate_per_night, nights_count, room_rent, room_total, food_total, kitchen_total, misc_total, discount, grand_total, advance_paid, payment_method, status, paid_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 'Paid', ?)
                ");
                $stmt->execute([
                    $receiptId, $propertyId, $guest['name'], $roomNameById[$guest['room_id']] ?? '',
                    $guest['checkin'], $guest['checkout'], $guest['per_night_charges'], $nights,
                    $roomTotal, $roomTotal, $foodTotal, $miscTotal, $grandTotal, $guest['advance'],
                    $paymentMethods[array_rand($paymentMethods)],
                    $checkoutTime,
                ]);

                // Settlement at checkout is the balance actually collected THEN
                // (grand total minus the advance already ledgered above), same
                // as handleCheckout in receipts.php.
                $settlement = $grandTotal - $guest['advance'];
                if ($settlement > 0) {
                    postFinancialLedger($pdo, [
                        'entry_key' => 'checkout_settlement:demo:' . $receiptId,
                        'direction' => 'credit',
                        'amount' => $settlement,
                        'category' => 'Guest Checkout Settlement',
                        'payment_method' => $paymentMethods[array_rand($paymentMethods)],
                        'party_type' => 'guest',
                        'party_id' => $lastGuestId,
                        'party_name' => $guest['name'],
                        'source_type' => 'billing_receipt',
                        'source_id' => $receiptId,
                        'description' => 'Balance collected on checkout',
                        'occurred_at' => $checkoutTime,
                    ], $propertyId);
                }
            }
        }

        // 3b. Demo OTA (iCal) Blocks - unconverted Airbnb/Booking.com reservations
        // for the new "Convert to Booking" feature to act on. clearDemoData()
        // below has always known how to clean these up (scoped per-room, same
        // as ICalSyncManager::getBlockedDates()) but nothing ever actually
        // generated them - this was the missing half. Placed well past the
        // guest-booking window (+7 days max above) so there's no risk of
        // colliding with a real generated stay on the same room; real OTA
        // blocks are also typically booked further ahead than confirmed
        // walk-ins anyway, so this reads as realistic, not just conveniently
        // empty.
        if (count($rooms) >= 2) {
            $otaDemoBlocks = [
                [
                    'room' => $rooms[0],
                    'service_type' => 'ical',
                    'service_name' => 'Airbnb Calendar (Demo)',
                    'external_event_id' => 'demo-ota-' . $rooms[0]['id'] . '-1@airbnb.com',
                    'event_title' => 'Reserved',
                    'start_offset' => 12,
                    'nights' => 3,
                ],
                [
                    'room' => $rooms[1],
                    'service_type' => 'ical',
                    'service_name' => 'Booking.com Calendar (Demo)',
                    'external_event_id' => 'demo-ota-' . $rooms[1]['id'] . '-1@booking.com',
                    'event_title' => 'CLOSED - Not available',
                    'start_offset' => 20,
                    'nights' => 4,
                ],
            ];

            foreach ($otaDemoBlocks as $block) {
                if (empty($block['room']['id'])) continue;
                $configStmt = $pdo->prepare("
                    INSERT INTO ical_sync_configs (property_id, service_type, service_name, ical_url, sync_enabled, sync_direction, is_demo, last_sync)
                    VALUES (?, ?, ?, ?, 1, 'bidirectional', 1, NOW())
                ");
                $configStmt->execute([
                    $block['room']['id'],
                    $block['service_type'],
                    $block['service_name'],
                    'https://example.com/demo-ical-feed-' . $block['room']['id'] . '.ics',
                ]);
                $configId = $pdo->lastInsertId();

                $eventStart = (clone $today)->modify('+' . $block['start_offset'] . ' days')->format('Y-m-d 00:00:00');
                $eventEnd = (clone $today)->modify('+' . ($block['start_offset'] + $block['nights']) . ' days')->format('Y-m-d 00:00:00');
                $eventData = json_encode(['source' => 'ical', 'source_label' => $block['service_name']]);

                $eventStmt = $pdo->prepare("
                    INSERT INTO ical_synced_events (sync_config_id, external_event_id, event_title, event_start, event_end, event_data, sync_status)
                    VALUES (?, ?, ?, ?, ?, ?, 'synced')
                ");
                $eventStmt->execute([$configId, $block['external_event_id'], $block['event_title'], $eventStart, $eventEnd, $eventData]);
            }
        }

        // 4. Demo Food Menu Items - copied from the reference property (Artists
        // Farm Jaipur, id 1)'s real ~70-item categorized menu instead of a small
        // hardcoded placeholder list, with a category-representative image
        // assigned (individually sourcing ~70 unique images isn't practical, but
        // every item gets a real, thematically-correct photo this way). Falls
        // back to a small built-in list if property 1's menu is ever empty.
        $menuCategoryImages = [
            'Starters' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Pakora.jpg',
            'Chinese & Snacks' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Chow_mein.jpg',
            'Pizzas & Sandwiches' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Pizza.jpg',
            'Main Course' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Paneer_Butter_Masala.jpg',
            'Breads & Rice' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Naan.jpg',
            'Breakfast & Eggs' => 'https://placehold.co/800x600/png?text=Breakfast+%26+Eggs',
            'Salads & Raita' => 'https://placehold.co/800x600/png?text=Salads+%26+Raita',
            'Beverages' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Masala_chai.jpg',
        ];

        // Per-item Unsplash images (auto-generated by fetch_unsplash_images.php).
        // 66 of 74 items resolved; 8 unmatched items fall back to category images below.
        // Attribution mapping: item => photographer name + Unsplash profile link.
        // See end of this file for full $menuItemAttribution array.
        $menuItemImages = [
    'Cold Coffee' => 'https://images.unsplash.com/photo-1629688825560-917b9727c15b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q29sZCUyMENvZmZlZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTM2NXww&ixlib=rb-4.1.0&q=80&w=1080',
    'Hot Chocolate' => 'https://images.unsplash.com/photo-1517578239113-b03992dcdd25?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8SG90JTIwQ2hvY29sYXRlJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5MzcwfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Masala Tea' => 'https://images.unsplash.com/photo-1683533699004-7f6b9e5a073f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFzYWxhJTIwVGVhJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5Mzc1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Nimbu Pani' => 'https://images.unsplash.com/photo-1694849789325-914b71ab4075?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TmltYnUlMjBQYW5pJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5MzgxfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Nimbu Soda' => 'https://images.unsplash.com/photo-1613292443284-8d10ef9383fe?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QmV2ZXJhZ2VzJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5Mzg3fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Regular Tea' => 'https://images.unsplash.com/photo-1521012012373-6a85bade18da?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UmVndWxhciUyMFRlYSUyMEJldmVyYWdlcyUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTM5Mnww&ixlib=rb-4.1.0&q=80&w=1080',
    'Aloo Paratha' => 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWRzJTIwJTI2JTIwUmljZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTM5OHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Chapati With Butter' => 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hhcGF0aSUyMFdpdGglMjBCdXR0ZXIlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0MDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Jeera Rice' => 'https://images.unsplash.com/photo-1586201375761-83865001e31c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8SmVlcmElMjBSaWNlJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NDA4fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Paratha Plain' => 'https://images.unsplash.com/photo-1683533743190-89c9b19f9ea6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UGFyYXRoYSUyMFBsYWluJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NDEzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Plain Chapati' => 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWRzJTIwJTI2JTIwUmljZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTM5OHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Plain Rice' => 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UGxhaW4lMjBSaWNlJTIwQnJlYWRzJTIwJTI2JTIwUmljZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQyNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Pyaz Paratha' => 'https://images.unsplash.com/photo-1680359873864-43e89bf248ac?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UHlheiUyMFBhcmF0aGElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0Mjl8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Veg Pulao' => 'https://images.unsplash.com/photo-1630409346824-4f0e7b080087?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8VmVnJTIwUHVsYW8lMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0MzR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Boiled Eggs' => 'https://images.unsplash.com/photo-1606636661147-51df1c246ccf?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Qm9pbGVkJTIwRWdncyUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQzOXww&ixlib=rb-4.1.0&q=80&w=1080',
    'Bread Pakoda' => 'https://images.unsplash.com/photo-1624374053855-39a5a1a41402?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWQlMjBQYWtvZGElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0NDR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Bread Toast Butter (2)' => 'https://images.unsplash.com/photo-1612827788868-c8632040ab64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWQlMjBUb2FzdCUyMEJ1dHRlciUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQ1MHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Bread Toast Jam (2)' => 'https://images.unsplash.com/photo-1612827788868-c8632040ab64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWQlMjBUb2FzdCUyMEphbSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQ1OHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Breakfast Buffet (Per Person)' => 'https://images.unsplash.com/photo-1722477936580-84aa10762b0b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWtmYXN0JTIwQnVmZmV0JTIwJTI4UGVyJTIwUGVyc29uJTI5JTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NDY3fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Egg Bhurji' => 'https://images.unsplash.com/photo-1542367592-8849eb950fd8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWtmYXN0JTIwJTI2JTIwRWdncyUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQ3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    'French Toast' => 'https://images.unsplash.com/photo-1612827788868-c8632040ab64?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8RnJlbmNoJTIwVG9hc3QlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0Nzl8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Omelette' => 'https://images.unsplash.com/photo-1668283653825-37b80f055b05?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8T21lbGV0dGUlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk0ODR8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Poha' => 'https://images.unsplash.com/photo-1542367592-8849eb950fd8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8QnJlYWtmYXN0JTIwJTI2JTIwRWdncyUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTQ3M3ww&ixlib=rb-4.1.0&q=80&w=1080',
    'Chilly Paneer (8-10pcs)' => null, // NO MATCH
    'Chilly Potatoes (8-10pcs)' => null, // NO MATCH
    'Chinese Pakoda (6-8pcs)' => null, // NO MATCH
    'Chow mein' => null, // NO MATCH
    'Maggie Regular' => null, // NO MATCH
    'Masala Maggie' => null, // NO MATCH
    'Sweet Corn Chaat' => null, // NO MATCH
    'Veg Spring roll (6-8pcs)' => null, // NO MATCH
    'Chicken Curry (4pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Daal Fry' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Daal Tadka' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Dinner Buffet (Per Person)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Gatta Masala' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Jeera Aloo' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Kadhai Paneer' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Kadhi Pakoda' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Laal Maans' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Mutton Curry (4pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Paneer Bhurji' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Paneer Butter Masala' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Sev Tamatar' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Shahi Paneer' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFpbiUyMENvdXJzZSUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYwNHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Cheese Corn Pizza' => 'https://images.unsplash.com/photo-1642099716203-634d41ded699?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hlZXNlJTIwQ29ybiUyMFBpenphJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NjEwfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Cheese Grilled Sandwich' => 'https://images.unsplash.com/photo-1775717427684-75b886ebbfc9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hlZXNlJTIwR3JpbGxlZCUyMFNhbmR3aWNoJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NjE1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Cheesy Garlic Bread (6pcs)' => 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hlZXN5JTIwR2FybGljJTIwQnJlYWQlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2MjF8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'OTC Pizza' => 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UGl6emFzJTIwJTI2JTIwU2FuZHdpY2hlcyUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTYyOHww&ixlib=rb-4.1.0&q=80&w=1080',
    'Paneer Pizza' => 'https://images.unsplash.com/photo-1559978137-8c560d91e9e1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8UGFuZWVyJTIwUGl6emElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2MzN8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Veg Grilled Sandwich' => 'https://images.unsplash.com/photo-1727018877043-2b0372f64d20?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8VmVnJTIwR3JpbGxlZCUyMFNhbmR3aWNoJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NjM4fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Boondi Raita' => 'https://images.unsplash.com/photo-1752673508949-f4aeeaef75f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U2FsYWRzJTIwJTI2JTIwUmFpdGElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Chaach' => 'https://images.unsplash.com/photo-1682862279256-b2a9e4f3d22c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hhYWNoJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NjUwfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Green Salad' => 'https://images.unsplash.com/photo-1757596057470-19d36962705d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8R3JlZW4lMjBTYWxhZCUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTY1NXww&ixlib=rb-4.1.0&q=80&w=1080',
    'Plain Curd' => 'https://images.unsplash.com/photo-1752673508949-f4aeeaef75f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U2FsYWRzJTIwJTI2JTIwUmFpdGElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Veg Raita' => 'https://images.unsplash.com/photo-1752673508949-f4aeeaef75f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U2FsYWRzJTIwJTI2JTIwUmFpdGElMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NDV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Aloo Pakoda (6-8pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Chicken Seekh Kebab' => 'https://images.unsplash.com/photo-1599307767316-776533bb941c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hpY2tlbiUyMFNlZWtoJTIwS2ViYWIlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2ODB8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Chicken Tikka' => 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8Q2hpY2tlbiUyMFRpa2thJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5Njg1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'French Fries Peri-Peri' => 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8RnJlbmNoJTIwRnJpZXMlMjBQZXJpLVBlcmklMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2OTF8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'French Fries Regular' => 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8RnJlbmNoJTIwRnJpZXMlMjBSZWd1bGFyJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5Njk2fDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Fried Papad' => 'https://images.unsplash.com/photo-1605719161691-5d9771fc144f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8RnJpZWQlMjBQYXBhZCUyMFN0YXJ0ZXJzJTIwaW5kaWFuJTIwZm9vZHxlbnwwfDB8fHwxNzg2NDQ5NzAzfDA&ixlib=rb-4.1.0&q=80&w=1080',
    'Kaala Chana Chaat' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Kabuli Chana Chaat' => 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8S2FidWxpJTIwQ2hhbmElMjBDaGFhdCUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTcxNnww&ixlib=rb-4.1.0&q=80&w=1080',
    'Masala Papad' => 'https://images.unsplash.com/photo-1567337710282-00832b415979?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TWFzYWxhJTIwUGFwYWQlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk3MjF8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Mix-Veg Pakoda (12pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Mutton Seekh Kebab' => 'https://images.unsplash.com/photo-1599307767316-776533bb941c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8TXV0dG9uJTIwU2Vla2glMjBLZWJhYiUyMGluZGlhbiUyMGZvb2R8ZW58MHwwfHx8MTc4NjQ0OTczMnww&ixlib=rb-4.1.0&q=80&w=1080',
    'Otc ' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Paneer Pakoda (10pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Paneer Tikka (8-10pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Pani Puri (8)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Peanut Masala' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Pyaz Pakoda (10pcs)' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
    'Roasted Papad' => 'https://images.unsplash.com/photo-1601050690597-df0568f70950?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3wxMDI1MjY1fDB8MXxzZWFyY2h8MXx8U3RhcnRlcnMlMjBpbmRpYW4lMjBmb29kfGVufDB8MHx8fDE3ODY0NDk2NzV8MA&ixlib=rb-4.1.0&q=80&w=1080',
];
        $refMenuStmt = $pdo->prepare("
            SELECT mi.name, mi.price, COALESCE(mc.name, 'Main Course') as category_name
            FROM menu_items mi
            LEFT JOIN menu_categories mc ON mi.category_id = mc.id
            WHERE mi.property_id = 1 AND mi.is_demo = 0 AND mi.is_hidden = 0
        ");
        $refMenuStmt->execute();
        $demoMenuItems = $refMenuStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($demoMenuItems)) {
            $demoMenuItems = [
                ['category_name' => 'Breakfast & Eggs', 'name' => 'Scrambled Eggs & Toast', 'price' => 250],
                ['category_name' => 'Main Course', 'name' => 'Grilled Chicken Breast', 'price' => 450],
                ['category_name' => 'Main Course', 'name' => 'Vegetable Stir Fry', 'price' => 350],
                ['category_name' => 'Beverages', 'name' => 'Fresh Orange Juice', 'price' => 100],
                ['category_name' => 'Starters', 'name' => 'Samosas (4 pcs)', 'price' => 120],
            ];
        }

        foreach ($demoMenuItems as $item) {
            $catName = $item['category_name'];
            // menu_categories was previously looked up/created by name only, with
            // no property_id filter - meaning every property's demo run either
            // reused whatever property happened to own that category name first,
            // or (since the INSERT never set property_id either) silently
            // mis-attributed new categories to property_id's column default (1,
            // i.e. Jaipur). Scoped properly here.
            $catStmt = $pdo->prepare("SELECT id FROM menu_categories WHERE name = ? AND property_id = ? LIMIT 1");
            $catStmt->execute([$catName, $propertyId]);
            $catId = $catStmt->fetchColumn();

            if (!$catId) {
                $stmt = $pdo->prepare("INSERT INTO menu_categories (property_id, name) VALUES (?, ?)");
                $stmt->execute([$propertyId, $catName]);
                $catId = $pdo->lastInsertId();
            }

            $imageUrl = $menuItemImages[$item['name']] ?? $menuCategoryImages[$catName] ?? 'https://placehold.co/800x600/png?text=' . urlencode($catName);
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO menu_items (property_id, category_id, name, price, is_hidden, image_path, is_demo)
                VALUES (?, ?, ?, ?, 0, ?, 1)
            ");
            $stmt->execute([$propertyId, $catId, $item['name'], $item['price'], $imageUrl]);
        }

        // 5. Demo Inventory Items - same idea, copied from the reference
        // property's real ~190-item catalog instead of 7 generic placeholders.
        // Stock levels are randomized (the reference property's real
        // current_stock reflects today's actual pantry, not something meaningful
        // to copy verbatim) and images are assigned per broad material bucket -
        // 190 individually-sourced images isn't practical, but grouping the ~20
        // real categories into a handful of visual buckets keeps every item
        // genuinely illustrated rather than blank.
        $inventoryBucketImages = [
            'Vegetables' => 'https://placehold.co/800x600/png?text=Vegetables+%26+Produce',
            'Grocery' => 'https://placehold.co/800x600/png?text=Grocery+%26+Spices',
            'Dairy' => 'https://placehold.co/800x600/png?text=Dairy+%26+Bakery',
            'NonVeg' => 'https://placehold.co/800x600/png?text=Non-Veg+%26+Frozen',
            'Beverages' => 'https://commons.wikimedia.org/wiki/Special:FilePath/Masala_chai.jpg',
            'Housekeeping' => 'https://placehold.co/800x600/png?text=Housekeeping',
            'Crockery' => 'https://placehold.co/800x600/png?text=Crockery+%26+Disposables',
        ];
        $inventoryCategoryBuckets = [
            'Vegetables & Fresh Produce' => 'Vegetables', 'Vegetables' => 'Vegetables', 'Fruits & Desserts' => 'Vegetables',
            'Kitchen & Grocery' => 'Grocery', 'Spices & Seasonings' => 'Grocery', 'Flours & Grains' => 'Grocery', 'Lentils & Pulses' => 'Grocery',
            'Dairy & Fresh Produce' => 'Dairy', 'Oils & Dairy Staples' => 'Dairy', 'Dairy' => 'Dairy', 'Bakery' => 'Dairy',
            'Non Veg' => 'NonVeg', 'Frozen / Cold' => 'NonVeg', 'Chinese & Continental Sauces' => 'NonVeg', 'Sauce' => 'NonVeg',
            'Beverages & Breakfast' => 'Beverages',
            'Pool & Maintenance' => 'Housekeeping', 'Housekeeping' => 'Housekeeping', 'Housekeeping & Disposables' => 'Housekeeping', 'Kitchen Appliance Repairs' => 'Housekeeping',
            'Crockery & Cutlery' => 'Crockery', 'Disposables' => 'Crockery',
        ];

        $refInvStmt = $pdo->prepare("
            SELECT rc.item_name, rc.unit_label, COALESCE(mcat.name, 'Kitchen & Grocery') as category_name
            FROM req_catalog rc
            LEFT JOIN material_categories mcat ON rc.category_id = mcat.id
            WHERE rc.property_id = 1 AND rc.is_demo = 0
        ");
        $refInvStmt->execute();
        $demoInventory = $refInvStmt->fetchAll(PDO::FETCH_ASSOC);

        if (empty($demoInventory)) {
            $demoInventory = [
                ['item_name' => 'Chicken Breast', 'unit_label' => 'Kg', 'category_name' => 'Non Veg'],
                ['item_name' => 'Basmati Rice', 'unit_label' => 'Kg', 'category_name' => 'Kitchen & Grocery'],
                ['item_name' => 'Eggs', 'unit_label' => 'Pcs', 'category_name' => 'Dairy'],
                ['item_name' => 'Milk', 'unit_label' => 'Ltr', 'category_name' => 'Dairy'],
                ['item_name' => 'Mixed Vegetables', 'unit_label' => 'Kg', 'category_name' => 'Vegetables'],
                ['item_name' => 'Dish Wash Liquid', 'unit_label' => 'Ltr', 'category_name' => 'Housekeeping'],
            ];
        }

        foreach ($demoInventory as $item) {
            $catName = $item['category_name'];
            // Same property-scoping bug as menu_categories above, fixed the same way.
            $catStmt = $pdo->prepare("SELECT id FROM material_categories WHERE name = ? AND property_id = ? LIMIT 1");
            $catStmt->execute([$catName, $propertyId]);
            $catId = $catStmt->fetchColumn();
            if (!$catId) {
                $stmt = $pdo->prepare("INSERT INTO material_categories (property_id, name) VALUES (?, ?)");
                $stmt->execute([$propertyId, $catName]);
                $catId = $pdo->lastInsertId();
            }

            $bucket = $inventoryCategoryBuckets[$catName] ?? 'Grocery';
            $imageUrl = $inventoryBucketImages[$bucket];
            // Rough, plausible stock by unit - not trying to model real par
            // levels, just avoiding every item showing an identical number.
            $unit = strtolower($item['unit_label']);
            $stock = (strpos($unit, 'kg') !== false || strpos($unit, 'ltr') !== false || strpos($unit, 'liter') !== false)
                ? rand(2, 40) : rand(10, 150);
            // ~12% of items land in a deliberately low/out-of-stock band so the
            // Stock Alerts feature has something real to flag.
            if (rand(1, 100) <= 12) { $stock = rand(0, 3); }

            $stmt = $pdo->prepare("
                INSERT IGNORE INTO req_catalog (property_id, item_name, current_stock, unit_label, category_id, image_path, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $item['item_name'], $stock, $item['unit_label'], $catId, $imageUrl]);
        }

        // 6. Demo Petty Cash Entries - bursty across the -30..0 window (expenses
        // are logged as they happen, not future-dated), matching how a real
        // property actually spends: quiet days, ordinary days, and the
        // occasional big-shopping-run day.
        $demoExpenses = [];
        $categories = ['Kitchen Purchase', 'Maintenance', 'Staff Advance', 'Miscellaneous', 'Utilities', 'Transport'];
        $vendors = ['Local Market', 'Hardware Store', 'Cash Advance', 'Utilities', 'Transport Co', 'Online'];
        $descs = [
            'Fresh vegetables and groceries',
            'Repair supplies',
            'Advance to staff member',
            'Phone bill recharge',
            'Local transport',
            'Cleaning supplies',
        ];
        foreach (burstyDayList($windowStart, $today, 45) as $day) {
            $catIdx = array_rand($categories);
            $demoExpenses[] = [
                'date' => $day->format('Y-m-d'),
                'category' => $categories[$catIdx],
                'amount' => rand(200, 5000),
                'vendor' => $vendors[$catIdx],
                'desc' => $descs[$catIdx],
            ];
        }

        foreach ($demoExpenses as $exp) {
            // BUG (found 14 Aug 2026): the real Expenses page (get_petty_cash/
            // add_petty_cash in this same file) reads and writes
            // `farm_utility_expenses`, not `petty_cash` - the latter appears to
            // be a dead/legacy table nothing else in the app actually uses
            // (get_petty_cash only ever falls back to it if the
            // farm_utility_expenses query itself throws, which it doesn't).
            // So every demo property's Expenses page showed empty regardless
            // of how much "petty cash" activity this seeded, since it was all
            // landing in a table the page never reads. Seed the real table.
            $stmt = $pdo->prepare("
                INSERT INTO farm_utility_expenses (property_id, expense_date, category, description, amount, payment_mode, vendor_name, is_demo)
                VALUES (?, ?, ?, ?, ?, 'Cash', ?, 1)
            ");
            $stmt->execute([$propertyId, $exp['date'], $exp['category'], $exp['desc'], $exp['amount'], $exp['vendor']]);
            $expId = $pdo->lastInsertId();

            // Every real expense is also an accounting debit (see add_petty_cash
            // in petty_cash.php) - without this the P&L/Cash Flow never see a
            // month of real petty-cash spend, same gap as the guest side had.
            postFinancialLedger($pdo, [
                'entry_key' => 'expense:demo:' . $expId,
                'direction' => 'debit',
                'amount' => $exp['amount'],
                'category' => $exp['category'],
                'payment_method' => 'Cash',
                'party_type' => 'payee',
                'party_name' => $exp['vendor'],
                'source_type' => 'expense',
                'source_id' => $expId,
                'description' => $exp['desc'],
                'occurred_at' => $exp['date'] . ' ' . sprintf('%02d:%02d:00', rand(9, 19), rand(0, 59)),
            ], $propertyId);
        }

        // 6b. Demo Staff Meal Logs - bursty across the past 30 days (logs are
        // historical records only, no future dates). Meals get logged 2-3x on a
        // normal day (breakfast/lunch/dinner) and sometimes get missed entirely.
        $mealDescs = ['Dal, rice, sabzi, roti', 'Chicken curry, rice', 'Leftover breakfast buffet', 'Veg thali', 'Fish curry, rice', 'Roti, sabzi, curd'];
        $mealStaffGroups = ['Rajesh Kumar, Sunil Yadav', 'Lakshmi Devi, Neha Gupta', 'Sunil Yadav', 'All Staff'];
        $mealHours = [8, 13, 20];
        foreach (burstyDayList($windowStart, $today, 60) as $day) {
            $loggedAt = $day->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', $mealHours[array_rand($mealHours)], rand(0, 59));
            $stmt = $pdo->prepare("
                INSERT INTO staff_meal_logs (property_id, staff_names, food_description, is_leftover_buffer, logged_at, is_demo)
                VALUES (?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $mealStaffGroups[array_rand($mealStaffGroups)], $mealDescs[array_rand($mealDescs)], rand(0, 4) === 0 ? 1 : 0, $loggedAt]);
        }

        // 6c. Demo Kitchen Wastage Logs - bursty across the past 30 days
        $wastageItems = ['Tomato', 'Onion', 'Paneer', 'Bread', 'Milk', 'Green Salad', 'Rice', 'Chicken'];
        $wastageReasons = ['Spoiled/Expired', 'Overcooked', 'Guest Return', 'Prep Wastage', 'Contaminated'];
        foreach (burstyDayList($windowStart, $today, 35) as $day) {
            $stmt = $pdo->prepare("
                INSERT INTO kitchen_wastage_logs (id, property_id, date, item_name, wasted_qty, unit, reason, reported_by, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([
                'WST-' . uniqid(), $propertyId, $day->format('Y-m-d'),
                $wastageItems[array_rand($wastageItems)], rand(1, 8) / 2, 'Kg',
                $wastageReasons[array_rand($wastageReasons)], 'Sunil Yadav',
            ]);
        }

        // 6d. Demo Kitchen Purchases Log - bursty across the past 30 days,
        // split between paid and unpaid / Farm Cash and Out-of-Pocket like a
        // real property's actual purchase settlement mix.
        $purchaseItems = [
            ['name' => 'Basmati Rice', 'unit' => 'Kg', 'rate' => 65],
            ['name' => 'Cooking Oil (Sunflower)', 'unit' => 'Ltr', 'rate' => 140],
            ['name' => 'Chicken', 'unit' => 'Kg', 'rate' => 220],
            ['name' => 'Fresh Vegetables Mix', 'unit' => 'Kg', 'rate' => 45],
            ['name' => 'Paneer (Fresh)', 'unit' => 'Kg', 'rate' => 320],
            ['name' => 'LPG Gas Cylinder', 'unit' => 'Pc', 'rate' => 1100],
        ];
        foreach (burstyDayList($windowStart, $today, 40) as $day) {
            $item = $purchaseItems[array_rand($purchaseItems)];
            $qty = round(rand(2, 20) / 2, 1);
            $total = round($qty * $item['rate'], 2);
            $isPaid = rand(1, 100) <= 70;
            $stmt = $pdo->prepare("
                INSERT INTO kitchen_purchases_log (id, property_id, purchase_date, item_name, specification, quantity, unit, total_price, unit_cost, recorded_by, vendor_name, settlement_status, settlement_method, is_demo)
                VALUES (?, ?, ?, ?, 'Standard', ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([
                'PUR-' . uniqid(), $propertyId, $day->format('Y-m-d'), $item['name'],
                $qty, $item['unit'], $total, $item['rate'], 'Sunil Yadav', 'Local Market',
                $isPaid ? 'Paid' : 'Unpaid', rand(0, 1) ? 'Farm Cash' : 'Out-of-Pocket',
            ]);
        }

        // 6e. Demo Cash Drawer Entries - a handover every few days plus the
        // occasional manual adjustment
        foreach (burstyDayList($windowStart, $today, 25) as $day) {
            $type = rand(1, 100) <= 80 ? 'handover' : 'manual_adjustment';
            $staffPick = $demoUsers[array_rand($demoUsers)];
            $drawerAmount = rand(500, 8000);
            // BUG (found 14 Aug 2026): this used to be a throwaway
            // 'DEMO-CASH-'.uniqid() with no relation to any real staff_users
            // row, so get_cash_drawer_summary's per-staff handover total
            // (WHERE staff_id = <the real staff_users.id>, see
            // petty_cash.php) could never match any of these rows - "Total
            // Handed Over" silently showed ₹0 regardless of how much demo
            // handover activity existed. Use the real id this staff member
            // actually got from section 1 above instead.
            $drawerStaffId = $demoUserIdsByName[$staffPick['name']] ?? ('DEMO-CASH-' . uniqid());
            $drawerNotes = $type === 'handover' ? 'End of shift handover' : 'Petty cash top-up';
            $drawerAt = $day->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', rand(18, 22), rand(0, 59));
            $stmt = $pdo->prepare("
                INSERT INTO cash_drawer_entries (property_id, staff_id, staff_name, type, amount, handed_to, notes, created_at, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([
                $propertyId, $drawerStaffId, $staffPick['name'], $type,
                $drawerAmount, $type === 'handover' ? 'Rajesh Kumar' : null,
                $drawerNotes, $drawerAt,
            ]);
            $drawerEntryId = $pdo->lastInsertId();

            // Same debit/credit split as add_cash_drawer_entry in petty_cash.php
            // - a handover moves cash out of the drawer (debit), a manual
            // adjustment (drawer top-up) brings cash in (credit).
            postFinancialLedger($pdo, [
                'entry_key' => 'cash_drawer:demo:' . $drawerEntryId,
                'direction' => $type === 'manual_adjustment' ? 'credit' : 'debit',
                'amount' => $drawerAmount,
                'category' => 'Cash Drawer ' . $type,
                'payment_method' => 'Cash',
                'party_type' => 'staff',
                'party_id' => $drawerStaffId,
                'party_name' => $staffPick['name'],
                'source_type' => 'cash_drawer',
                'source_id' => $drawerEntryId,
                'description' => $drawerNotes,
                'occurred_at' => $drawerAt,
            ], $propertyId);
        }

        // 6f. Demo Staff Attendance - every demo staff member gets a mark for
        // (almost) every day over the past 14 days (today + prior 13), matching
        // how attendance is actually kept in practice (marked daily, not bursty
        // like purchase logs). Mostly Present, with a realistic scattering of
        // Half Day/Paid Leave/Absent - statuses match the StaffManagement.tsx
        // attendance grid exactly; "Unpaid Leave" was previously seeded but the
        // UI doesn't render it (showed as an unmarked dash), so it's dropped.
        // Rajesh Kumar (Manager) marks everyone, including himself, same as a
        // real property's shift lead would.
        $attendanceStatusWeights = [
            ['status' => 'Present', 'weight' => 80],
            ['status' => 'Half Day', 'weight' => 8],
            ['status' => 'Paid Leave', 'weight' => 7],
            ['status' => 'Absent', 'weight' => 5],
        ];
        $pickAttendanceStatus = function () use ($attendanceStatusWeights) {
            $roll = rand(1, 100);
            $cumulative = 0;
            foreach ($attendanceStatusWeights as $w) {
                $cumulative += $w['weight'];
                if ($roll <= $cumulative) return $w['status'];
            }
            return 'Present';
        };
        $attStmt = $pdo->prepare("
            INSERT IGNORE INTO staff_attendance (property_id, attendance_date, user_id, staff_name, status, marked_by, is_demo)
            VALUES (?, ?, ?, ?, ?, 'Rajesh Kumar', 1)
        ");
        $attendanceWindowStart = (clone $today)->modify('-13 days');
        for ($d = clone $attendanceWindowStart; $d <= $today; $d->modify('+1 day')) {
            // A day off here and there for the whole property (skeleton
            // crew / quiet day) - not literally every single staff member
            // marked every single day, which would look too mechanically
            // perfect to read as real.
            if (rand(1, 100) > 92) continue;
            foreach ($demoUsers as $user) {
                $userId = $demoUserIdsByName[$user['name']] ?? null;
                if (!$userId) continue;
                $attStmt->execute([$propertyId, $d->format('Y-m-d'), $userId, $user['name'], $pickAttendanceStatus()]);
            }
        }

        // 6g. Demo iCal/OTA Sync Feeds - Airbnb + Booking.com connected on a
        // couple of the rooms (not every room - not every listing is
        // multi-channel in real life either), each with a few synced
        // blocked-date ranges that land in gaps between that room's own
        // already-seeded direct bookings above, so a room's timeline reads
        // as "some direct bookings, some OTA-only blocks" like a real
        // multi-channel property - never overlapping/double-booking the
        // same dates.
        $otaRooms = array_slice($rooms, 0, min(2, count($rooms)));
        $otaWindowStart = (clone $today)->modify('-20 days');
        $otaWindowEnd = (clone $today)->modify('+30 days');

        $guestNames = ['John Doe', 'Jane Smith', 'Priya Sharma', 'Carlos Mendez', 'Aisha Patel', 'Liam O\'Brien'];

        foreach ($otaRooms as $otaRoom) {
            $otaRoomId = $otaRoom['id'];
            if (!$otaRoomId) continue;

            // This room's own direct bookings (from section 3 above) - OTA
            // blocks must never land on top of one of these.
            $roomOwnBookings = array_values(array_filter($allBookings, function ($b) use ($otaRoomId) {
                return (int)$b['room_id'] === (int)$otaRoomId;
            }));

            $feeds = [
                [
                    'service_type' => 'airbnb',
                    'channel' => 'Airbnb',
                    'sync_interval' => 15,
                    'service_name' => 'Airbnb - ' . $otaRoom['name'],
                    'ical_url' => 'https://www.airbnb.com/calendar/ical/' . rand(10000000, 99999999) . '.ics?s=' . substr(md5('airbnb' . $otaRoomId), 0, 32),
                    'uid_suffix' => '@airbnb.com',
                ],
                [
                    // enum('google','airbnb','ical','other') has no distinct
                    // 'booking' value - service_name is what actually drives
                    // the label everywhere this is displayed (see
                    // getBlockedDates()'s source/source_label resolution in
                    // ical_sync.php), so 'ical' here still reads correctly
                    // as "Booking.com" throughout the UI.
                    'service_type' => 'ical',
                    'channel' => 'Booking.com',
                    'sync_interval' => 30,
                    'service_name' => 'Booking.com - ' . $otaRoom['name'],
                    'ical_url' => 'https://ical.booking.com/v1/export?t=' . substr(md5('booking' . $otaRoomId), 0, 8) . '-' . substr(md5('booking2' . $otaRoomId), 0, 4) . '-' . substr(md5('booking3' . $otaRoomId), 0, 4) . '-' . substr(md5('booking4' . $otaRoomId), 0, 12),
                    'uid_suffix' => '@booking.com',
                ],
            ];

            foreach ($feeds as $feed) {
                $lastSyncAt = (clone $today)->modify('-' . rand(0, 6) . ' hours')->format('Y-m-d H:i:s');
                $syncCount = rand(15, 60);
                $configStmt = $pdo->prepare("
                    INSERT INTO ical_sync_configs (property_id, service_type, service_name, ical_url, sync_interval, sync_enabled, sync_direction, last_sync, sync_count, is_demo)
                    VALUES (?, ?, ?, ?, ?, 1, 'import', ?, ?, 1)
                ");
                $configStmt->execute([$otaRoomId, $feed['service_type'], $feed['service_name'], $feed['ical_url'], $feed['sync_interval'], $lastSyncAt, $syncCount]);
                $syncConfigId = $pdo->lastInsertId();

                // 2-3 blocked ranges, each checked against every existing
                // direct booking AND every OTA block already placed on this
                // same room/feed before it, so nothing ever overlaps.
                $placedRanges = array_map(function ($b) {
                    return ['start' => new DateTime($b['checkin']), 'end' => new DateTime($b['checkout'])];
                }, $roomOwnBookings);

                $blockCount = rand(2, 3);
                $attempts = 0;
                $placed = 0;
                while ($placed < $blockCount && $attempts < 40) {
                    $attempts++;
                    $spanDays = $otaWindowStart->diff($otaWindowEnd)->days;
                    $startOffset = rand(0, max(0, $spanDays - 5));
                    $blockStart = (clone $otaWindowStart)->modify("+$startOffset days");
                    $blockLen = rand(2, 4);
                    $blockEnd = (clone $blockStart)->modify("+$blockLen days");

                    $overlaps = false;
                    foreach ($placedRanges as $range) {
                        if ($blockStart < $range['end'] && $blockEnd > $range['start']) {
                            $overlaps = true;
                            break;
                        }
                    }
                    if ($overlaps) continue;

                    $placedRanges[] = ['start' => $blockStart, 'end' => $blockEnd];
                    $externalId = 'demo-' . uniqid() . '-' . $syncConfigId . $feed['uid_suffix'];
                    $eventTitle = $feed['channel'] . ' Reservation - ' . $guestNames[array_rand($guestNames)];
                    $eventData = json_encode(['source' => $feed['service_type'], 'source_label' => $feed['service_name']]);
                    $eventStmt = $pdo->prepare("
                        INSERT INTO ical_synced_events (sync_config_id, external_event_id, event_title, event_start, event_end, event_data, sync_status)
                        VALUES (?, ?, ?, ?, ?, ?, 'synced')
                    ");
                    $eventStmt->execute([
                        $syncConfigId, $externalId, $eventTitle,
                        $blockStart->format('Y-m-d 00:00:00'), $blockEnd->format('Y-m-d 00:00:00'),
                        $eventData,
                    ]);
                    $placed++;
                }
            }
        }

        // 7. Demo Service Requests - real varied guests (not one generic "Demo
        // Guest" for every request), correct status vocabulary, and a genuine
        // pending/fulfilled mix. The real app uses 'Pending'/'Fulfilled'
        // (confirmed via `SELECT DISTINCT status FROM service_requests` against
        // live data) - this previously wrote lowercase 'open'/'resolved', which
        // wouldn't have matched whatever status-based filtering/styling the UI
        // does, though fulfilled_at/fulfilled_by were also never populated at
        // all so a "closed" demo request wouldn't show who closed it or when.
        $serviceRequestTypes = [
            'ac_heating_issue', 'hot_water_geyser', 'fresh_towels', 'extra_bedding',
            'tea_coffee_replenish', 'late_checkout_request', 'wifi_connectivity'
        ];

        $serviceRequests = [];
        foreach ($serviceRequestTypes as $typeId) {
            foreach (burstyDayList($windowStart, $today, 30) as $day) {
                if (rand(1, 100) > 40) continue; // not every active day generates every request type
                $reqDate = $day->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', rand(7, 22), rand(0, 59));
                $isRecent = $day >= (clone $today)->modify('-2 days');
                // Recent requests are more likely to still be pending, matching how
                // a real property clears its backlog over time rather than
                // instantly.
                $isPending = $isRecent ? (rand(1, 100) <= 70) : (rand(1, 100) <= 15);
                $guestName = $guestNames[array_rand($guestNames)];
                $roomId = $roomIds[array_rand($roomIds)];

                $req = [
                    'property_id' => $propertyId,
                    'room_id' => $roomId,
                    'request_type' => $typeId,
                    'description' => ucwords(str_replace('_', ' ', $typeId)) . ' - requested by guest',
                    'requested_by' => $guestName,
                    'status' => $isPending ? 'Pending' : 'Fulfilled',
                    'scheduled_at' => $reqDate,
                    'created_at' => $reqDate,
                    'is_demo' => 1,
                ];
                if (!$isPending) {
                    $fulfilledDelay = rand(15, 240); // 15min - 4hr turnaround
                    $req['fulfilled_at'] = (new DateTime($reqDate))->modify("+$fulfilledDelay minutes")->format('Y-m-d H:i:s');
                    $req['fulfilled_by'] = 'Rajesh Kumar';
                }
                $serviceRequests[] = $req;
            }
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO service_requests (property_id, room_id, request_type, description, requested_by, status, scheduled_at, created_at, fulfilled_at, fulfilled_by, is_demo)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        foreach ($serviceRequests as $req) {
            $stmt->execute([
                $req['property_id'],
                $req['room_id'],
                $req['request_type'],
                $req['description'],
                $req['requested_by'],
                $req['status'],
                $req['scheduled_at'],
                $req['created_at'],
                $req['fulfilled_at'] ?? null,
                $req['fulfilled_by'] ?? null,
                $req['is_demo']
            ]);
        }

        // 8. Demo KDS Orders - today's live orders + historical completed ones
        // Get menu item IDs for ordering
        $menuItemStmt = $pdo->prepare("SELECT id FROM menu_items WHERE property_id = ? AND is_demo = 1 LIMIT 10");
        $menuItemStmt->execute([$propertyId]);
        $menuItemIds = $menuItemStmt->fetchAll(PDO::FETCH_COLUMN);
        if (empty($menuItemIds)) {
            $menuItemIds = [1];
        }

        $kdsStatuses = ['Pending', 'Preparing', 'Ready', 'Completed'];
        $kdsOrders = [];
        for ($i = 0; $i < 15; $i++) {
            $daysOffset = rand(-25, 0);
            $orderTime = (clone $today)->modify("$daysOffset days")->format('Y-m-d H:i:s');
            $status = $kdsStatuses[array_rand($kdsStatuses)];

            // Prefer today's orders to be Pending/Preparing/Ready
            if ($daysOffset >= -1) {
                $status = $kdsStatuses[array_rand([0, 1, 2])]; // Pending, Preparing, or Ready
            }

            $kdsOrders[] = [
                'property_id' => $propertyId,
                'guest_id' => null,
                'room_number' => 'Room ' . (101 + $i % 5),
                'order_time' => $orderTime,
                'status' => $status,
                'is_demo' => 1,
            ];
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO orders (property_id, guest_id, order_time, status, is_demo)
            VALUES (?, ?, ?, ?, 1)
        ");
        foreach ($kdsOrders as $order) {
            $stmt->execute([$order['property_id'], $order['guest_id'], $order['order_time'], $order['status']]);
            $orderId = $pdo->lastInsertId();

            // Add 1-3 items per order
            $itemCount = rand(1, 3);
            for ($j = 0; $j < $itemCount; $j++) {
                $menuItemId = $menuItemIds[array_rand($menuItemIds)];
                $qty = rand(1, 3);
                $itemStatus = $order['status'] === 'Completed' ? 'Served' : ($order['status'] === 'Ready' ? 'Ready' : 'Pending');
                $itemStmt = $pdo->prepare("
                    INSERT INTO order_items (order_id, menu_item_id, quantity, item_status, is_demo)
                    VALUES (?, ?, ?, ?, 1)
                ");
                $itemStmt->execute([$orderId, $menuItemId, $qty, $itemStatus]);
            }
        }

        // 8b. Demo Vendors & Third Parties (payee_entities) - real-sounding
        // operational suppliers matching the actual inventory categories
        // seeded above (produce, dairy, gas, pool, laundry), not placeholder
        // names. "Registered Payees" showed 0 vendors on every demo property
        // otherwise, despite Kitchen Purchases logging real vendor-paid entries.
        $demoPayees = [
            ['name' => 'Fresh Farm Vegetables', 'type' => 'Vendor'],
            ['name' => 'Sunrise Dairy Distributors', 'type' => 'Vendor'],
            ['name' => 'Coastal Gas Agency', 'type' => 'Vendor'],
            ['name' => 'Blue Wave Pool Services', 'type' => 'Vendor'],
            ['name' => 'Rapid Laundry Solutions', 'type' => 'Vendor'],
            ['name' => 'State Electricity Board', 'type' => 'Third Party'],
        ];
        foreach ($demoPayees as $payee) {
            $stmt = $pdo->prepare("
                INSERT INTO payee_entities (id, property_id, name, type, is_demo)
                VALUES (?, ?, ?, ?, 1)
            ");
            $stmt->execute(['PAYEE-' . uniqid(), $propertyId, $payee['name'], $payee['type']]);
        }

        // 9. Demo Audit Logs - spread across the same 30-day window as everything
        // else, not all stamped 'now'. A property that's supposedly been running
        // for a month with an activity trail that's entirely one instant old reads
        // as obviously fake. Correlate with the real bookings/orders already
        // generated above where possible instead of inventing disconnected events.
        $demoLogs = [];
        foreach ($allBookings as $booking) {
            $demoLogs[] = ['action' => 'Guest Checked In - ' . $booking['name'], 'module' => 'guests', 'ts' => $booking['checkin'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59))];
            if ($booking['status'] === GUEST_STATUS_CHECKED_OUT) {
                $demoLogs[] = ['action' => 'Guest Checked Out - ' . $booking['name'], 'module' => 'guests', 'ts' => $booking['checkout'] . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59))];
            }
        }
        foreach ($kdsOrders as $order) {
            $demoLogs[] = ['action' => 'Food Order Created - ' . $order['room_number'], 'module' => 'kitchen', 'ts' => $order['order_time']];
        }
        $genericLogTemplates = [
            ['action' => 'Inventory Updated - Chicken Breast', 'module' => 'inventory'],
            ['action' => 'Petty Cash Entry - Kitchen Purchase', 'module' => 'finance'],
            ['action' => 'Staff Attendance Marked - Rajesh Kumar', 'module' => 'staff'],
            ['action' => 'Service Request Created - AC Issue', 'module' => 'service_requests'],
            ['action' => 'Stock Requisition Fulfilled', 'module' => 'inventory'],
            ['action' => 'Menu Item Price Updated', 'module' => 'kitchen'],
            ['action' => 'Cash Drawer Handover', 'module' => 'finance'],
            ['action' => 'Staff Attendance Marked - Sunil Yadav', 'module' => 'staff'],
        ];
        foreach ($genericLogTemplates as $tpl) {
            $daysOffset = rand(-30, 0);
            $ts = (clone $today)->modify("$daysOffset days")->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', rand(8, 20), rand(0, 59));
            $demoLogs[] = ['action' => $tpl['action'], 'module' => $tpl['module'], 'ts' => $ts];
        }
        $demoLogs[] = ['action' => 'Demo Data Generated', 'module' => 'system', 'ts' => date('Y-m-d H:i:s')];

        foreach ($demoLogs as $log) {
            $stmt = $pdo->prepare("
                INSERT INTO audit_logs (property_id, timestamp, user, action, status, module, is_demo)
                VALUES (?, ?, 'System', ?, 'Success', ?, 1)
            ");
            $stmt->execute([$propertyId, $log['ts'], $log['action'], $log['module']]);
        }

        $pdo->commit();
        return ['status' => 'success', 'message' => 'Demo data generated successfully'];

    } catch (Exception $e) {
        $pdo->rollBack();
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

function clearDemoData($pdo, $propertyId) {
    // Same production gate as generateDemoData() above - clearDemoData() is
    // also independently reachable (the standalone entry point, and the old
    // "Exit Test Mode" action), so it needs its own check rather than relying
    // on generateDemoData()'s.
    if (!APP_DEMO_DATA_ENABLED) {
        return ['status' => 'error', 'success' => false, 'message' => 'Demo data features are disabled on production.'];
    }

    ensureDemoSchema($pdo);
    ensureFinancialLedger($pdo);

    try {
        $pdo->beginTransaction();

        $deletedRows = 0;

        // Delete demo staff users
        $stmt = $pdo->prepare("DELETE FROM staff_users WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo guests
        $stmt = $pdo->prepare("DELETE FROM guests WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo menu items
        $stmt = $pdo->prepare("DELETE FROM menu_items WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo inventory items
        $stmt = $pdo->prepare("DELETE FROM req_catalog WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo petty cash entries - legacy table, nothing writes here
        // anymore (see the 14 Aug 2026 note in generateDemoData), kept only
        // to clean up any rows a pre-fix run left behind.
        $stmt = $pdo->prepare("DELETE FROM petty_cash WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo expenses (the real table the Expenses page actually reads)
        $stmt = $pdo->prepare("DELETE FROM farm_utility_expenses WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo staff meal logs
        $stmt = $pdo->prepare("DELETE FROM staff_meal_logs WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo service requests
        $stmt = $pdo->prepare("DELETE FROM service_requests WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo KDS orders and their items
        $stmt = $pdo->prepare("SELECT id FROM orders WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $demoOrderIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (!empty($demoOrderIds)) {
            $in = implode(',', array_fill(0, count($demoOrderIds), '?'));
            $stmt = $pdo->prepare("DELETE FROM order_items WHERE order_id IN ($in)");
            $stmt->execute($demoOrderIds);
            $deletedRows += $stmt->rowCount();

            $stmt = $pdo->prepare("DELETE FROM orders WHERE property_id = ? AND is_demo = 1");
            $stmt->execute([$propertyId]);
            $deletedRows += $stmt->rowCount();
        }

        // Delete demo audit logs
        $stmt = $pdo->prepare("DELETE FROM audit_logs WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo kitchen wastage logs
        $stmt = $pdo->prepare("DELETE FROM kitchen_wastage_logs WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo kitchen purchases log
        $stmt = $pdo->prepare("DELETE FROM kitchen_purchases_log WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo cash drawer entries
        $stmt = $pdo->prepare("DELETE FROM cash_drawer_entries WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo billing receipts
        $stmt = $pdo->prepare("DELETE FROM billing_receipts WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo payees
        $stmt = $pdo->prepare("DELETE FROM payee_entities WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo staff attendance
        $stmt = $pdo->prepare("DELETE FROM staff_attendance WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo iCal sync feeds + their synced events - configs were
        // seeded against each ROOM's own property_id (rooms are their own
        // rows in `properties`, see section 2 in generateDemoData), not the
        // parent's, matching how a real per-room OTA integration is actually
        // connected. Expand scope to the parent + its rooms the same way
        // ICalSyncManager::getBlockedDates() does, or a parent-level clear
        // would leave every room's demo feed (and its synced events) behind.
        $scopeStmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? OR parent_property_id = ?");
        $scopeStmt->execute([$propertyId, $propertyId]);
        $scopeIds = $scopeStmt->fetchAll(PDO::FETCH_COLUMN);
        if (!empty($scopeIds)) {
            $inPlaceholders = implode(',', array_fill(0, count($scopeIds), '?'));
            $configIdStmt = $pdo->prepare("SELECT id FROM ical_sync_configs WHERE property_id IN ($inPlaceholders) AND is_demo = 1");
            $configIdStmt->execute($scopeIds);
            $demoConfigIds = $configIdStmt->fetchAll(PDO::FETCH_COLUMN);
            if (!empty($demoConfigIds)) {
                $configPlaceholders = implode(',', array_fill(0, count($demoConfigIds), '?'));
                $stmt = $pdo->prepare("DELETE FROM ical_synced_events WHERE sync_config_id IN ($configPlaceholders)");
                $stmt->execute($demoConfigIds);
                $deletedRows += $stmt->rowCount();
            }
            $stmt = $pdo->prepare("DELETE FROM ical_sync_configs WHERE property_id IN ($inPlaceholders) AND is_demo = 1");
            $stmt->execute($scopeIds);
            $deletedRows += $stmt->rowCount();
        }

        // Delete demo financial ledger entries - generateDemoData() posts these
        // (guest_advance/checkout_settlement/expense/cash_drawer, each keyed
        // 'type:demo:id') alongside the operational rows above. Without this
        // they'd survive every clear, so a regenerate would double (or
        // n-tuple) every ledger total against fresh operational rows that no
        // longer match the old source_id's.
        $stmt = $pdo->prepare("DELETE FROM financial_ledger WHERE property_id = ? AND entry_key LIKE '%:demo:%'");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        $pdo->commit();
        error_log("[demo_data.php] Total rows deleted: " . $deletedRows);
        return ['status' => 'success', 'message' => "Demo data cleared successfully ($deletedRows records removed)"];

    } catch (Exception $e) {
        $pdo->rollBack();
        error_log("[demo_data.php] Error clearing demo data: " . $e->getMessage());
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

// Handle API calls. The standalone entry point only runs when this file is hit
// directly - when router.php require_once's it, the router dispatches
// generate_demo_data/clear_demo_data itself (with the session/API-key gate and
// resolved-property scoping applied). Leaving this block unguarded made it run
// for BOTH entry points and let anyone wipe/poison any property's data.
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // Guard the direct endpoint too: require a valid session or API key.
        $api_key = getenv('API_KEY');
        $provided_key = $_SERVER['HTTP_X_API_KEY'] ?? $_GET['api_key'] ?? '';
        $is_authenticated_user = isset($_SESSION['username']);
        $authorized = $is_authenticated_user || (!empty($api_key) && $provided_key === $api_key);
        if (!$authorized) {
            http_response_code(401);
            echo json_encode(['status' => 'error', 'message' => 'Unauthorized. Valid API key or login session required.']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true);
        $action = $input['action'] ?? '';
        $propertyId = $input['property_id'] ?? null;

        if (!$propertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'property_id required']);
            exit;
        }

        // Pin the target to the property resolved from the request context unless
        // the caller is a platform admin (mirrors the router.php behavior).
        $resolvedPropertyId = getCurrentPropertyId($pdo);
        $targetPropertyId = $resolvedPropertyId;
        if ($propertyId && ($_SESSION['is_platform_admin'] ?? false)) {
            $targetPropertyId = $propertyId;
        }
        if (!$targetPropertyId) {
            http_response_code(400);
            echo json_encode(['status' => 'error', 'message' => 'No property context for demo data']);
            exit;
        }

        if ($action === 'generate') {
            $result = generateDemoData($pdo, $targetPropertyId);
        } elseif ($action === 'clear') {
            $result = clearDemoData($pdo, $targetPropertyId);
        } else {
            http_response_code(400);
            $result = ['status' => 'error', 'message' => 'Invalid action'];
        }

        echo json_encode($result);
    }
}
