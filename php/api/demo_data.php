<?php
/**
 * Demo Data Generator
 * Populates system with realistic sample data for testing and demos
 * Each call refreshes the demo data
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/guest_status.php';
// Guarded (27 Aug 2026, live crash: "Reset Demo Data" fataled with an empty JSON body on
// staging) - same cross-environment __DIR__ collision router.php's own require already guards
// against (see that file's comment): staging requires telegram.php straight from production's
// path to dodge CPGuard, and telegram.php's own require_once of module_manager.php resolves
// via __DIR__ to PRODUCTION's copy - a different absolute path than this file's own require
// below, which resolves to staging's copy. module_manager.php's functions aren't
// function_exists()-guarded internally, so loading both paths in one request fatals with
// "Cannot redeclare isModuleAvailable()". router.php's guard only covered its own require -
// this one needed the same treatment.
if (!function_exists('isModuleAvailable')) {
    require_once __DIR__ . '/../modules/module_manager.php';
}
require_once __DIR__ . '/../finance/ledger.php';

// The router starts the session when this file is require_once'd; a direct hit
// needs its own boot so the auth gate below can see $_SESSION['username'].
// Uses session_set_cookie_params() (27 Aug 2026, "remember me" fix - see
// router.php's fuller comment) rather than a bare session_start() - this file
// requires config/database.php above, so APP_IS_LOCAL_ENV is already defined,
// unlike router.php/authenticate.php which have to compute it inline.
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.gc_maxlifetime', 86400 * 30);
    session_set_cookie_params([
        'lifetime' => 86400 * 30,
        'path' => '/',
        'domain' => '',
        'secure' => !APP_IS_LOCAL_ENV,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
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
        "ALTER TABLE `dish_recipes` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
        // Itemized booking-time "Additional Charges" (Decoration Fees, Extra
        // Housekeeping, Pet Stay Charges) - real table, same shape as
        // guests.php's own ensureGuestExtraChargesSchema(). Duplicated here
        // (not required-in) because this file only requires database.php/
        // guest_status.php/module_manager.php/ledger.php, matching the same
        // is_demo-duplication pattern already used for every other table above.
        "CREATE TABLE IF NOT EXISTS `guest_extra_charges` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `property_id` INT NOT NULL DEFAULT 1,
            `guest_id` INT NOT NULL,
            `category` VARCHAR(100) NOT NULL,
            `amount` DECIMAL(10,2) NOT NULL DEFAULT 0,
            `note` VARCHAR(255) DEFAULT NULL,
            `is_demo` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX `idx_property` (`property_id`),
            INDEX `idx_guest` (`guest_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
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
        // property_licenses is normally created lazily by licenses.php's own
        // schema block, which this file doesn't require - duplicated here
        // (same reasoning as guest_extra_charges above) so demo data can seed
        // the License Management page even on a property that's never opened
        // it for real yet. is_demo included from creation; the separate ALTER
        // below covers a table that already existed (created by licenses.php)
        // before this column existed.
        "CREATE TABLE IF NOT EXISTS `property_licenses` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `property_id` INT NOT NULL,
            `license_type` VARCHAR(100) NOT NULL,
            `license_name` VARCHAR(255),
            `license_number` VARCHAR(100) NOT NULL UNIQUE,
            `issuing_authority` VARCHAR(255),
            `start_date` DATE NOT NULL,
            `end_date` DATE NOT NULL,
            `document_url` TEXT,
            `status` ENUM('active', 'expired', 'expiring_soon', 'renewal_pending') DEFAULT 'active',
            `notes` TEXT,
            `is_demo` TINYINT(1) NOT NULL DEFAULT 0,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_property_expiry` (`property_id`, `end_date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "ALTER TABLE `property_licenses` ADD COLUMN IF NOT EXISTS `is_demo` TINYINT(1) NOT NULL DEFAULT 0",
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

        // 2. Rooms - ensure 5 demo rooms exist with varied default tariffs.
        // "Luxe Stays" tariff band (raised 16 Aug 2026 from a 1800-2500 budget
        // band that, combined with a lean 5-person payroll, was landing net
        // margin around 4-5% - nowhere near what a well-run boutique resort
        // actually books, and a property literally branded "Luxe" undercharging
        // relative to its own name read as more of a data bug than a deliberate
        // budget-tier demo).
        $requiredRooms = [
            ['name' => 'Room 101', 'slug' => 'room-101', 'tariff' => 4800],
            ['name' => 'Room 102', 'slug' => 'room-102', 'tariff' => 5300],
            ['name' => 'Room 103', 'slug' => 'room-103', 'tariff' => 4600],
            ['name' => 'Room 104', 'slug' => 'room-104', 'tariff' => 4000],
            ['name' => 'Room 105', 'slug' => 'room-105', 'tariff' => 5100],
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
        $otaSourceChoices = [
            ['source' => 'airbnb', 'label' => 'Airbnb'],
            ['source' => 'booking_com', 'label' => 'Booking.com'],
        ];

        foreach ($rooms as $roomIdx => $room) {
            $roomId = $room['id'];
            $tariff = $room['default_tariff'] ?? 2000;
            $stayCount = 6 + array_rand(range(0, 3)); // 6-9 stays
            // 75-90% occupancy (raised 16 Aug 2026 alongside the tariff bump
            // above, same margin-realism pass) - matches a property that's
            // genuinely doing well, not just priced well.
            $targetOccupiedDays = (int)($windowDays * (0.75 + (array_rand([0, 5, 10, 15]) / 100))); // 75-90%
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
                $maxOffset = max(0, count($availableDays) - $stayLengths[$idx] - 1);
                // Skewed toward later dates (max of two uniform draws, a
                // standard trick for a right-skewed distribution) so monthly
                // guest count trends upward across the window instead of
                // flat/declining - a property doing better recently than a
                // month ago is what "the business is growing" should look
                // like, not an even scatter with no trend at all.
                $startOffset = max(rand(0, $maxOffset), rand(0, $maxOffset));
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

            // Advance bookings beyond $windowEnd (today +7) - without these
            // the Pace tab's "On-the-Books Revenue by Week (Next 12 Weeks)"
            // chart only ever had one populated bar (this week) and 11 empty
            // ones, since no demo booking's check-in date ever fell further
            // out than +7 days. 4-7 forward bookings per room, skewed toward
            // NEARER weeks (min of two uniform draws - the mirror of the
            // late-skew trick above) since real advance bookings taper off
            // the further out they go, but don't vanish to zero.
            $futureWindowStart = (clone $windowEnd)->modify('+1 day');
            $futureWindowEnd = (clone $today)->modify('+84 days');
            $futureDays = [];
            for ($d = clone $futureWindowStart; $d <= $futureWindowEnd; $d->modify('+1 day')) {
                $futureDays[] = clone $d;
            }
            $futureStayCount = rand(4, 7);
            $futureAttempts = 0;
            $futurePlaced = 0;
            while ($futurePlaced < $futureStayCount && $futureAttempts < 100 && !empty($futureDays)) {
                $futureAttempts++;
                $futureLen = rand(1, 4);
                $maxFutureOffset = max(0, count($futureDays) - $futureLen - 1);
                $futureOffset = min(rand(0, $maxFutureOffset), rand(0, $maxFutureOffset));
                $fStart = $futureDays[$futureOffset];
                $fEnd = (clone $fStart)->modify("+{$futureLen} days");
                $fOverlaps = false;
                foreach ($stayDates as $s) {
                    if ($fStart < $s['end'] && $fEnd > $s['start']) { $fOverlaps = true; break; }
                }
                if (!$fOverlaps) {
                    $stayDates[] = ['start' => $fStart, 'end' => $fEnd, 'length' => $futureLen];
                    $futurePlaced++;
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

                // Status: past stays are checked out, future stays are booked (reservation), current stays are checked in
                if ($stay['end'] <= $today) {
                    $status = GUEST_STATUS_CHECKED_OUT;
                } elseif ($stay['start'] > $today) {
                    $status = GUEST_STATUS_BOOKED;
                } else {
                    $status = GUEST_STATUS_CHECKED_IN;
                }

                // ~20% of bookings originate from a synced OTA calendar,
                // converted into a real booking the same way
                // ConvertOtaBookingModal.tsx does - so "Booking Sources
                // Distribution" has a genuine Online/OTA slice instead of
                // reading 100% Direct (no demo booking ever set ota_source
                // before 16 Aug 2026, and offline bookings never set
                // booking_source at all either, so every source pie was a
                // single slice regardless of how the property actually books).
                $isOtaBooking = rand(1, 100) <= 20;
                $otaChoice = $isOtaBooking ? ($otaSourceChoices[array_rand($otaSourceChoices)]) : null;

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
                    'booking_source' => $isOtaBooking ? '' : 'Offline',
                    'ota_source' => $otaChoice['source'] ?? null,
                    'ota_source_label' => $otaChoice['label'] ?? null,
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
            // Defense-in-depth DB-level guard on top of the in-memory $stayDates
            // overlap check above (which already prevents this generator from
            // ever building an overlapping $allBookings in the first place) -
            // mirrors the hard block added to add_guest in guests.php (20 Aug
            // 2026, "1 room = 1 active booking" was reported broken on the
            // demo site's multi-room calendar). Belt-and-suspenders: if the
            // in-memory logic above ever regresses, this still can't seed a
            // double-booking into the room - it just silently skips that one
            // synthetic stay instead.
            if ($guest['room_id'] !== null) {
                $seedConflictStmt = $pdo->prepare("SELECT id FROM guests WHERE room_id = ? AND property_id = ? AND status IN (?, ?, ?) AND checkin_date < ? AND expected_checkout > ? LIMIT 1");
                $seedConflictStmt->execute([$guest['room_id'], $propertyId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED, $guest['checkout'], $guest['checkin']]);
                if ($seedConflictStmt->fetch()) {
                    continue;
                }
            }

            $receivedBy = $financialHandlerNames[array_rand($financialHandlerNames)];
            $stmt = $pdo->prepare("
                INSERT IGNORE INTO guests (property_id, guest_name, phone_number, checkin_date, expected_checkout, status, no_of_guests, room_id, per_night_charges, total_charge, advance_paid, advance_received_by, booking_source, ota_source, ota_source_label, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $guest['name'], $guest['phone'], $guest['checkin'], $guest['checkout'], $guest['status'], $guest['room_id'], $guest['per_night_charges'], $guest['total_charge'], $guest['advance'], $receivedBy, $guest['booking_source'], $guest['ota_source'], $guest['ota_source_label']]);
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

            // ~25% of bookings add one itemized "Additional Charge" line, same
            // as a real front-desk booking form would (Decoration Fees, Extra
            // Housekeeping, Pet Stay Charges) - gives the Analytics "Additional
            // Charges Breakdown" real category-level numbers instead of an
            // empty state on every demo/reset property.
            if (rand(1, 100) <= 25) {
                $extraChargeOptions = [
                    ['category' => 'Decoration Fees', 'min' => 1500, 'max' => 4000],
                    ['category' => 'Extra Housekeeping', 'min' => 300, 'max' => 800],
                    ['category' => 'Pet Stay Charges', 'min' => 500, 'max' => 1500],
                ];
                $pickedCharge = $extraChargeOptions[array_rand($extraChargeOptions)];
                $chargeStmt = $pdo->prepare("
                    INSERT INTO guest_extra_charges (property_id, guest_id, category, amount, is_demo)
                    VALUES (?, ?, ?, ?, 1)
                ");
                $chargeStmt->execute([$propertyId, $lastGuestId, $pickedCharge['category'], rand($pickedCharge['min'], $pickedCharge['max'])]);
            }

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
                    INSERT IGNORE INTO billing_receipts (id, property_id, guest_name, room_number, checkin_date, checkout_date, room_rate_per_night, nights_count, room_rent, room_total, food_total, kitchen_total, misc_total, discount, grand_total, advance_paid, payment_method, status, paid_at, is_demo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, ?, 'Paid', ?, 1)
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
        // generated them - this was the missing half. Originally placed at a
        // fixed +12/+20 day offset on the assumption that guest bookings only
        // ever reached +7 days out - that stopped being true once the "Advance
        // bookings beyond $windowEnd" block above started generating real
        // stays up to +84 days out, and a fixed offset then had no way to
        // notice a collision (confirmed 18 Aug 2026: Room 102's "Booking.com
        // Calendar (Demo)" block landed directly on top of a real future
        // guest's stay, showing the room as simultaneously booked and
        // OTA-closed). Retry against this room's own bookings the same way
        // the future-booking placement above does, instead of trusting a
        // fixed offset - still tries the original 12/20-day placement first
        // since that's what reads as realistic, only falling back to a
        // search once that specific offset is actually taken.
        // Tracks every OTA-block date range placed below, keyed by room id, so
        // section 6g further down (which seeds its own OTA blocks per room)
        // can avoid landing on top of these too - not just on top of real
        // guest bookings. Without this, both sections independently checked
        // only against $allBookings and stayed blind to each other's inserts,
        // so a room could end up with an Airbnb/Booking.com block from this
        // section directly overlapping another synced block from 6g (found 20
        // Aug 2026 - Room 101 showed two OTA bars stacked on the same dates).
        $otaBlockedRangesByRoom = [];

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

                $blockRoomId = $block['room']['id'];
                $ownBookingRanges = [];
                foreach ($allBookings as $b) {
                    if ((int)$b['room_id'] === (int)$blockRoomId) {
                        $ownBookingRanges[] = ['start' => new DateTime($b['checkin']), 'end' => new DateTime($b['checkout'])];
                    }
                }

                $candidateOffset = $block['start_offset'];
                $placedStart = null;
                $placedEnd = null;
                for ($attempt = 0; $attempt < 30; $attempt++) {
                    $candidateStart = (clone $today)->modify('+' . $candidateOffset . ' days');
                    $candidateEnd = (clone $today)->modify('+' . ($candidateOffset + $block['nights']) . ' days');
                    $overlaps = false;
                    foreach ($ownBookingRanges as $range) {
                        if ($candidateStart < $range['end'] && $candidateEnd > $range['start']) { $overlaps = true; break; }
                    }
                    if (!$overlaps) {
                        $placedStart = $candidateStart;
                        $placedEnd = $candidateEnd;
                        break;
                    }
                    $candidateOffset = rand(7, 80);
                }
                if ($placedStart === null) continue;

                $otaBlockedRangesByRoom[(int)$blockRoomId][] = ['start' => $placedStart, 'end' => $placedEnd];

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

                $eventStart = $placedStart->format('Y-m-d 00:00:00');
                $eventEnd = $placedEnd->format('Y-m-d 00:00:00');
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

        // 4b. Demo Dish Recipes - ingredient-costed BOM for every demo menu item,
        // so the Analytics "Dish Profitability" panel (Kitchen -> Beta Recipe
        // Builder's costPerPortion = sum(quantity * costPerUnit), reused there)
        // has real margins to show instead of the empty state. Nothing seeded
        // this table before 16 Aug 2026 - dish_recipes was never touched by the
        // generator, and because menu_items gets fresh auto-increment ids on
        // every clearDemoData()+generateDemoData() cycle, any recipe written by
        // hand against a previous cycle's ids went orphaned on the next reset
        // anyway. Quantities below are per single serving (one plate/order of
        // that item), matching how the Recipe Builder scales cost by servings.
        $dishRecipePantry = [
            'Basmati Rice' => ['unit' => 'kg', 'cost' => 90],
            'Atta (Wheat Flour)' => ['unit' => 'kg', 'cost' => 45],
            'Maida (Refined Flour)' => ['unit' => 'kg', 'cost' => 42],
            'Besan (Gram Flour)' => ['unit' => 'kg', 'cost' => 95],
            'Refined Oil' => ['unit' => 'ltr', 'cost' => 145],
            'Ghee' => ['unit' => 'kg', 'cost' => 560],
            'Butter' => ['unit' => 'kg', 'cost' => 480],
            'Paneer' => ['unit' => 'kg', 'cost' => 380],
            'Mozzarella Cheese' => ['unit' => 'kg', 'cost' => 420],
            'Chicken (Curry Cut)' => ['unit' => 'kg', 'cost' => 220],
            'Chicken Mince' => ['unit' => 'kg', 'cost' => 260],
            'Mutton' => ['unit' => 'kg', 'cost' => 650],
            'Mutton Mince' => ['unit' => 'kg', 'cost' => 680],
            'Egg' => ['unit' => 'pcs', 'cost' => 7],
            'Milk' => ['unit' => 'ltr', 'cost' => 62],
            'Curd' => ['unit' => 'kg', 'cost' => 75],
            'Fresh Cream' => ['unit' => 'kg', 'cost' => 220],
            'Onion' => ['unit' => 'kg', 'cost' => 35],
            'Tomato' => ['unit' => 'kg', 'cost' => 42],
            'Potato' => ['unit' => 'kg', 'cost' => 28],
            'Mixed Vegetables' => ['unit' => 'kg', 'cost' => 55],
            'Capsicum' => ['unit' => 'kg', 'cost' => 65],
            'Cucumber' => ['unit' => 'kg', 'cost' => 25],
            'Sweet Corn' => ['unit' => 'kg', 'cost' => 90],
            'Ginger-Garlic Paste' => ['unit' => 'kg', 'cost' => 170],
            'Garam Masala Mix' => ['unit' => 'kg', 'cost' => 450],
            'Sugar' => ['unit' => 'kg', 'cost' => 45],
            'Tea Leaves' => ['unit' => 'kg', 'cost' => 420],
            'Coffee Powder' => ['unit' => 'kg', 'cost' => 950],
            'Ice Cream' => ['unit' => 'kg', 'cost' => 260],
            'Chocolate Syrup' => ['unit' => 'ltr', 'cost' => 320],
            'Bread Slice' => ['unit' => 'pcs', 'cost' => 4],
            'Bread Loaf' => ['unit' => 'pcs', 'cost' => 35],
            'Pizza Base' => ['unit' => 'pcs', 'cost' => 28],
            'Pizza Sauce' => ['unit' => 'kg', 'cost' => 150],
            'Noodles (Hakka)' => ['unit' => 'kg', 'cost' => 95],
            'Soy Sauce' => ['unit' => 'ltr', 'cost' => 260],
            'Papad (Raw)' => ['unit' => 'pcs', 'cost' => 4],
            'Puri Shells' => ['unit' => 'kg', 'cost' => 60],
            'Boondi' => ['unit' => 'kg', 'cost' => 210],
            'Peanuts' => ['unit' => 'kg', 'cost' => 135],
            'Kaala Chana (Boiled)' => ['unit' => 'kg', 'cost' => 95],
            'Kabuli Chana (Boiled)' => ['unit' => 'kg', 'cost' => 95],
            'Lemon' => ['unit' => 'pcs', 'cost' => 6],
            'Lentils (Dal)' => ['unit' => 'kg', 'cost' => 110],
            'Jam' => ['unit' => 'kg', 'cost' => 250],
        ];
        $dishRecipeMap = [
            // Beverages
            'Cold Coffee' => [['Milk', 0.15], ['Coffee Powder', 0.008], ['Sugar', 0.02], ['Ice Cream', 0.05]],
            'Hot Chocolate' => [['Milk', 0.2], ['Chocolate Syrup', 0.06], ['Sugar', 0.02]],
            'Masala Tea' => [['Milk', 0.1], ['Tea Leaves', 0.01], ['Sugar', 0.015]],
            'Nimbu Pani' => [['Lemon', 1], ['Sugar', 0.03]],
            'Nimbu Soda' => [['Lemon', 1], ['Sugar', 0.02]],
            'Regular Tea' => [['Milk', 0.08], ['Tea Leaves', 0.008], ['Sugar', 0.012]],
            // Breads & Rice
            'Aloo Paratha' => [['Atta (Wheat Flour)', 0.12], ['Potato', 0.1], ['Ghee', 0.02], ['Butter', 0.01]],
            'Chapati With Butter' => [['Atta (Wheat Flour)', 0.05], ['Butter', 0.015]],
            'Jeera Rice' => [['Basmati Rice', 0.15], ['Ghee', 0.015], ['Garam Masala Mix', 0.003]],
            'Paratha Plain' => [['Atta (Wheat Flour)', 0.06], ['Ghee', 0.015]],
            'Plain Chapati' => [['Atta (Wheat Flour)', 0.04], ['Ghee', 0.005]],
            'Plain Rice' => [['Basmati Rice', 0.15]],
            'Pyaz Paratha' => [['Atta (Wheat Flour)', 0.12], ['Onion', 0.08], ['Ghee', 0.02]],
            'Veg Pulao' => [['Basmati Rice', 0.18], ['Mixed Vegetables', 0.1], ['Ghee', 0.02], ['Garam Masala Mix', 0.005]],
            // Breakfast & Eggs
            'Boiled Eggs' => [['Egg', 3]],
            'Bread Pakoda' => [['Bread Slice', 2], ['Besan (Gram Flour)', 0.05], ['Refined Oil', 0.03], ['Potato', 0.05]],
            'Bread Toast Butter (2)' => [['Bread Slice', 2], ['Butter', 0.015]],
            'Bread Toast Jam (2)' => [['Bread Slice', 2], ['Butter', 0.01], ['Jam', 0.03]],
            'Breakfast Buffet (Per Person)' => [['Egg', 1], ['Bread Slice', 2], ['Potato', 0.1], ['Milk', 0.1], ['Butter', 0.01], ['Mixed Vegetables', 0.05]],
            'Egg Bhurji' => [['Egg', 2], ['Onion', 0.05], ['Tomato', 0.05], ['Refined Oil', 0.02]],
            'French Toast' => [['Bread Slice', 2], ['Egg', 1], ['Milk', 0.05], ['Butter', 0.01], ['Sugar', 0.01]],
            'Omelette' => [['Egg', 2], ['Onion', 0.02], ['Refined Oil', 0.015]],
            'Poha' => [['Basmati Rice', 0.1], ['Onion', 0.03], ['Peanuts', 0.02], ['Refined Oil', 0.015]],
            // Chinese & Snacks
            'Chilly Paneer (8-10pcs)' => [['Paneer', 0.15], ['Capsicum', 0.05], ['Onion', 0.05], ['Soy Sauce', 0.02], ['Refined Oil', 0.03]],
            'Chilly Potatoes (8-10pcs)' => [['Potato', 0.25], ['Capsicum', 0.03], ['Soy Sauce', 0.02], ['Refined Oil', 0.03]],
            'Chinese Pakoda (6-8pcs)' => [['Mixed Vegetables', 0.12], ['Besan (Gram Flour)', 0.06], ['Refined Oil', 0.04], ['Soy Sauce', 0.01]],
            'Chow mein' => [['Noodles (Hakka)', 0.15], ['Mixed Vegetables', 0.08], ['Soy Sauce', 0.02], ['Refined Oil', 0.02]],
            'Maggie Regular' => [['Noodles (Hakka)', 0.1], ['Refined Oil', 0.01]],
            'Masala Maggie' => [['Noodles (Hakka)', 0.1], ['Onion', 0.03], ['Tomato', 0.03], ['Refined Oil', 0.015]],
            'Sweet Corn Chaat' => [['Sweet Corn', 0.15], ['Butter', 0.015], ['Onion', 0.02]],
            'Veg Spring roll (6-8pcs)' => [['Maida (Refined Flour)', 0.06], ['Mixed Vegetables', 0.1], ['Refined Oil', 0.04], ['Soy Sauce', 0.01]],
            // Main Course
            'Chicken Curry (4pcs)' => [['Chicken (Curry Cut)', 0.25], ['Onion', 0.08], ['Tomato', 0.08], ['Refined Oil', 0.03], ['Ginger-Garlic Paste', 0.015], ['Garam Masala Mix', 0.01]],
            'Daal Fry' => [['Lentils (Dal)', 0.12], ['Ghee', 0.015], ['Onion', 0.03], ['Tomato', 0.03]],
            'Daal Tadka' => [['Lentils (Dal)', 0.15], ['Ghee', 0.02], ['Onion', 0.04], ['Tomato', 0.04], ['Garam Masala Mix', 0.005]],
            'Dinner Buffet (Per Person)' => [['Basmati Rice', 0.1], ['Lentils (Dal)', 0.08], ['Mixed Vegetables', 0.1], ['Paneer', 0.05], ['Atta (Wheat Flour)', 0.08], ['Ghee', 0.02]],
            'Gatta Masala' => [['Besan (Gram Flour)', 0.1], ['Curd', 0.08], ['Onion', 0.03], ['Tomato', 0.03], ['Refined Oil', 0.02]],
            'Jeera Aloo' => [['Potato', 0.25], ['Ghee', 0.02], ['Garam Masala Mix', 0.005]],
            'Kadhai Paneer' => [['Paneer', 0.15], ['Capsicum', 0.05], ['Onion', 0.05], ['Tomato', 0.05], ['Refined Oil', 0.02]],
            'Kadhi Pakoda' => [['Besan (Gram Flour)', 0.08], ['Curd', 0.15], ['Refined Oil', 0.02]],
            'Laal Maans' => [['Mutton', 0.3], ['Onion', 0.08], ['Ginger-Garlic Paste', 0.02], ['Garam Masala Mix', 0.015], ['Refined Oil', 0.03]],
            'Mutton Curry (4pcs)' => [['Mutton', 0.25], ['Onion', 0.06], ['Tomato', 0.06], ['Ginger-Garlic Paste', 0.015], ['Garam Masala Mix', 0.01], ['Refined Oil', 0.02]],
            'Paneer Bhurji' => [['Paneer', 0.18], ['Onion', 0.05], ['Tomato', 0.05], ['Refined Oil', 0.02]],
            'Paneer Butter Masala' => [['Paneer', 0.15], ['Butter', 0.03], ['Tomato', 0.1], ['Fresh Cream', 0.05], ['Garam Masala Mix', 0.005]],
            'Sev Tamatar' => [['Tomato', 0.15], ['Besan (Gram Flour)', 0.08], ['Refined Oil', 0.02], ['Onion', 0.04]],
            'Shahi Paneer' => [['Paneer', 0.15], ['Fresh Cream', 0.04], ['Butter', 0.02], ['Onion', 0.05], ['Garam Masala Mix', 0.005]],
            // Pizzas & Sandwiches
            'Cheese Corn Pizza' => [['Pizza Base', 1], ['Mozzarella Cheese', 0.08], ['Sweet Corn', 0.05], ['Pizza Sauce', 0.03]],
            'Cheese Grilled Sandwich' => [['Bread Slice', 4], ['Mozzarella Cheese', 0.05], ['Butter', 0.015]],
            'Cheesy Garlic Bread (6pcs)' => [['Bread Loaf', 1], ['Mozzarella Cheese', 0.03], ['Butter', 0.02], ['Ginger-Garlic Paste', 0.01]],
            'OTC Pizza' => [['Pizza Base', 1], ['Pizza Sauce', 0.03], ['Mixed Vegetables', 0.05], ['Mozzarella Cheese', 0.04]],
            'Paneer Pizza' => [['Pizza Base', 1], ['Mozzarella Cheese', 0.06], ['Paneer', 0.08], ['Pizza Sauce', 0.03]],
            'Veg Grilled Sandwich' => [['Bread Slice', 4], ['Mixed Vegetables', 0.06], ['Butter', 0.015], ['Mozzarella Cheese', 0.02]],
            // Salads & Raita
            'Boondi Raita' => [['Curd', 0.15], ['Boondi', 0.03]],
            'Chaach' => [['Curd', 0.15]],
            'Green Salad' => [['Onion', 0.03], ['Tomato', 0.05], ['Cucumber', 0.08], ['Lemon', 0.5]],
            'Plain Curd' => [['Curd', 0.2]],
            'Veg Raita' => [['Curd', 0.2], ['Mixed Vegetables', 0.05], ['Boondi', 0.02]],
            // Starters
            'Aloo Pakoda (6-8pcs)' => [['Potato', 0.15], ['Besan (Gram Flour)', 0.08], ['Refined Oil', 0.04]],
            'Chicken Seekh Kebab' => [['Chicken Mince', 0.2], ['Ginger-Garlic Paste', 0.015], ['Garam Masala Mix', 0.01], ['Refined Oil', 0.015]],
            'Chicken Tikka' => [['Chicken (Curry Cut)', 0.25], ['Curd', 0.05], ['Ginger-Garlic Paste', 0.02], ['Garam Masala Mix', 0.012], ['Refined Oil', 0.015]],
            'French Fries Peri-Peri' => [['Potato', 0.25], ['Refined Oil', 0.05], ['Garam Masala Mix', 0.008]],
            'French Fries Regular' => [['Potato', 0.25], ['Refined Oil', 0.05]],
            'Fried Papad' => [['Papad (Raw)', 2], ['Refined Oil', 0.02]],
            'Kaala Chana Chaat' => [['Kaala Chana (Boiled)', 0.15], ['Onion', 0.04], ['Tomato', 0.04], ['Lemon', 0.5]],
            'Kabuli Chana Chaat' => [['Kabuli Chana (Boiled)', 0.15], ['Onion', 0.04], ['Tomato', 0.04], ['Lemon', 0.5]],
            'Masala Papad' => [['Papad (Raw)', 2], ['Onion', 0.02], ['Tomato', 0.02]],
            'Mix-Veg Pakoda (12pcs)' => [['Mixed Vegetables', 0.15], ['Besan (Gram Flour)', 0.1], ['Refined Oil', 0.05]],
            'Mutton Seekh Kebab' => [['Mutton Mince', 0.2], ['Ginger-Garlic Paste', 0.015], ['Garam Masala Mix', 0.01], ['Refined Oil', 0.015]],
            'Otc ' => [['Potato', 0.15], ['Besan (Gram Flour)', 0.06], ['Refined Oil', 0.03]],
            'Paneer Pakoda (10pcs)' => [['Paneer', 0.15], ['Besan (Gram Flour)', 0.06], ['Refined Oil', 0.04]],
            'Paneer Tikka (8-10pcs)' => [['Paneer', 0.2], ['Curd', 0.05], ['Garam Masala Mix', 0.01], ['Refined Oil', 0.015]],
            'Pani Puri (8)' => [['Puri Shells', 0.05], ['Kaala Chana (Boiled)', 0.03], ['Lemon', 0.5]],
            'Peanut Masala' => [['Peanuts', 0.1], ['Onion', 0.03], ['Tomato', 0.03], ['Lemon', 0.3]],
            'Pyaz Pakoda (10pcs)' => [['Onion', 0.15], ['Besan (Gram Flour)', 0.08], ['Refined Oil', 0.04]],
            'Roasted Papad' => [['Papad (Raw)', 1.5]],
        ];

        $seededMenuStmt = $pdo->prepare("SELECT id, name FROM menu_items WHERE property_id = ? AND is_demo = 1");
        $seededMenuStmt->execute([$propertyId]);
        $seededMenuItems = $seededMenuStmt->fetchAll(PDO::FETCH_ASSOC);

        $recipeStmt = $pdo->prepare("
            INSERT INTO dish_recipes (property_id, menu_item_id, recipe_name, yield_factor, servings, ingredients, is_demo)
            VALUES (?, ?, ?, 1, 1, ?, 1)
            ON DUPLICATE KEY UPDATE recipe_name = VALUES(recipe_name), ingredients = VALUES(ingredients), is_demo = 1
        ");
        foreach ($seededMenuItems as $mi) {
            if (!isset($dishRecipeMap[$mi['name']])) continue;
            $ingredients = [];
            $idx = 1;
            foreach ($dishRecipeMap[$mi['name']] as $ing) {
                [$pantryKey, $qty] = $ing;
                $pantryItem = $dishRecipePantry[$pantryKey];
                $ingredients[] = [
                    'id' => (string)($idx++),
                    'name' => $pantryKey,
                    'quantity' => $qty,
                    'unit' => $pantryItem['unit'],
                    'costPerUnit' => $pantryItem['cost'],
                ];
            }
            $recipeStmt->execute([$propertyId, $mi['id'], $mi['name'], json_encode($ingredients)]);
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

        // 6. Demo Petty Cash Entries - structured operational spend + bursty daily expenses
        // Realistic hotel monthly expenses: Staff Payroll (~₹95k) + Utility Bills (~₹40k) + Raw Materials & Maintenance (~₹60k)
        $demoExpenses = [];
        
        // 6a. Monthly Staff Payroll Debits (First week of month)
        $salaryPayouts = [
            ['name' => 'Vikram Malhotra', 'role' => 'Admin', 'salary' => 25000],
            ['name' => 'Rajesh Kumar', 'role' => 'Manager', 'salary' => 22000],
            ['name' => 'Sunil Yadav', 'role' => 'Chef', 'salary' => 20000],
            ['name' => 'Neha Gupta', 'role' => 'Receptionist', 'salary' => 18000],
            ['name' => 'Lakshmi Devi', 'role' => 'Housekeeping', 'salary' => 14000],
        ];
        $salaryDate = (clone $today)->modify('-15 days')->format('Y-m-d');
        foreach ($salaryPayouts as $sal) {
            $demoExpenses[] = [
                'date' => $salaryDate,
                'category' => 'Staff Advance',
                'amount' => $sal['salary'],
                'vendor' => $sal['name'],
                'desc' => 'Monthly Salary Payout - ' . $sal['name'] . ' (' . $sal['role'] . ')',
            ];
        }

        // 6b. Recurring Utility & Operating Bills. Category values match the
        // Add Expense form's actual current Cost Category Group options
        // (see PettyCashManagement.tsx - only 'Other'/'Bills'/'Staff
        // Advance'/'Kitchen' exist now, the older 'Utilities'/'Maintenance'
        // used here before 16 Aug 2026 predate that simplification and don't
        // match anything the Bills & Utilities Analytics panel filters for,
        // which is why it always showed empty despite ₹40k+/month of real
        // seeded utility spend).
        $monthlyBills = [
            ['cat' => 'Bills', 'desc' => 'State Commercial Electricity Bill', 'amt' => 22500, 'vendor' => 'State Electricity Board'],
            ['cat' => 'Bills', 'desc' => 'Commercial LPG Gas Cylinders (6 Pcs)', 'amt' => 8400, 'vendor' => 'Coastal Gas Agency'],
            ['cat' => 'Bills', 'desc' => 'High-Speed Fiber Internet & Landline', 'amt' => 3500, 'vendor' => 'Telecom Co'],
            ['cat' => 'Bills', 'desc' => 'Water Tanker Supply (Resort Tanks)', 'amt' => 6500, 'vendor' => 'City Water Supply'],
            ['cat' => 'Other', 'desc' => 'Swimming Pool Cleaning & Chemical Maintenance', 'amt' => 8500, 'vendor' => 'Blue Wave Pool Services'],
            ['cat' => 'Other', 'desc' => 'Linen & Laundry Dry Cleaning Services', 'amt' => 12000, 'vendor' => 'Rapid Laundry Solutions'],
        ];
        $billDate = (clone $today)->modify('-20 days')->format('Y-m-d');
        foreach ($monthlyBills as $bill) {
            $demoExpenses[] = [
                'date' => $billDate,
                'category' => $bill['cat'],
                'amount' => $bill['amt'],
                'vendor' => $bill['vendor'],
                'desc' => $bill['desc'],
            ];
        }

        // 6c. Daily Kitchen Supplies & Operational Expenses (bursty). Same
        // current-taxonomy fix as 6b above - only the first (produce
        // restocking) is genuinely 'Kitchen', the rest fall into 'Other'.
        $categories = ['Kitchen', 'Other', 'Other', 'Other'];
        $vendors = ['Local Produce Market', 'Hardware Store', 'Local Vendor', 'Transport Co'];
        $descs = [
            'Fresh vegetables, fruits, and daily grocery staples',
            'Plumbing repair supplies and electrical fittings',
            'Guest amenity replacements & room cleaning items',
            'Local transport and cargo freight charges',
        ];
        foreach (burstyDayList($windowStart, $today, 45) as $day) {
            $catIdx = array_rand($categories);
            $demoExpenses[] = [
                'date' => $day->format('Y-m-d'),
                'category' => $categories[$catIdx],
                // Trimmed from rand(400, 3500) 16 Aug 2026 - that range's
                // expected total (~₹40k/month) was disproportionate daily
                // top-up spend for a property whose entire structured payroll
                // is ~₹99k, and was the main thing dragging a well-booked
                // "Luxe Stays" property down to a ~5% net margin.
                'amount' => rand(150, 700),
                'vendor' => $vendors[$catIdx],
                'desc' => $descs[$catIdx],
            ];
        }

        foreach ($demoExpenses as $exp) {
            $stmt = $pdo->prepare("
                INSERT INTO farm_utility_expenses (property_id, expense_date, category, description, amount, payment_mode, vendor_name, is_demo)
                VALUES (?, ?, ?, ?, ?, 'Cash', ?, 1)
            ");
            $stmt->execute([$propertyId, $exp['date'], $exp['category'], $exp['desc'], $exp['amount'], $exp['vendor']]);
            $expId = $pdo->lastInsertId();

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

        // 6d. Demo Kitchen Purchases Log - each item is bought on its OWN
        // recurring cadence (found 16 Aug 2026: the old one-random-item-per-
        // active-day approach also used a single FIXED rate per item forever,
        // so unit_cost never varied between purchases of the same item at
        // all - the Analytics "Sales vs Purchases" trend line and the new
        // Fluctuations tab both need repeat purchases of the SAME item with
        // real price movement to show anything). Produce (ginger, tomato,
        // onion...) swings hard and gets bought every few days, like a real
        // kitchen actually restocks; packaged/bulk goods are bought rarely
        // and barely move. A slow uptrend is layered on every item so the
        // whole catalog drifts up over the window, not just wobbles randomly.
        $purchaseItemCatalog = [
            ['name' => 'Ginger', 'unit' => 'Kg', 'rate' => 120, 'freqDays' => 4, 'volatility' => 0.28],
            ['name' => 'Tomato', 'unit' => 'Kg', 'rate' => 40, 'freqDays' => 4, 'volatility' => 0.32],
            ['name' => 'Onion', 'unit' => 'Kg', 'rate' => 35, 'freqDays' => 5, 'volatility' => 0.24],
            ['name' => 'Green Chilli', 'unit' => 'Kg', 'rate' => 90, 'freqDays' => 5, 'volatility' => 0.30],
            ['name' => 'Potato', 'unit' => 'Kg', 'rate' => 28, 'freqDays' => 7, 'volatility' => 0.15],
            ['name' => 'Fresh Vegetables Mix', 'unit' => 'Kg', 'rate' => 45, 'freqDays' => 4, 'volatility' => 0.18],
            ['name' => 'Milk', 'unit' => 'Ltr', 'rate' => 60, 'freqDays' => 3, 'volatility' => 0.06],
            ['name' => 'Paneer (Fresh)', 'unit' => 'Kg', 'rate' => 380, 'freqDays' => 5, 'volatility' => 0.10],
            ['name' => 'Chicken', 'unit' => 'Kg', 'rate' => 220, 'freqDays' => 6, 'volatility' => 0.12],
            ['name' => 'Basmati Rice', 'unit' => 'Kg', 'rate' => 90, 'freqDays' => 12, 'volatility' => 0.05],
            ['name' => 'Cooking Oil (Sunflower)', 'unit' => 'Ltr', 'rate' => 145, 'freqDays' => 10, 'volatility' => 0.08],
            ['name' => 'LPG Gas Cylinder', 'unit' => 'Pc', 'rate' => 1100, 'freqDays' => 20, 'volatility' => 0.03],
        ];
        $purchaseStmt = $pdo->prepare("
            INSERT INTO kitchen_purchases_log (id, property_id, purchase_date, item_name, specification, quantity, unit, total_price, unit_cost, recorded_by, vendor_name, settlement_status, settlement_method, is_demo)
            VALUES (?, ?, ?, ?, 'Standard', ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ");
        foreach ($purchaseItemCatalog as $item) {
            $cursor = (clone $windowStart)->modify('+' . rand(0, 3) . ' days');
            while ($cursor <= $today) {
                $daysElapsed = $windowStart->diff($cursor)->days;
                $inflationFactor = 1 + ($daysElapsed / max(1, $windowDays)) * 0.06;
                $volatilitySwing = 1 + (rand(-1000, 1000) / 1000) * $item['volatility'];
                $rate = round($item['rate'] * $inflationFactor * $volatilitySwing, 2);
                // Trimmed from rand(2, 20)/2 16 Aug 2026 - that quantity range
                // pushed total Kitchen Purchases (raw ingredient cost) up to
                // ~90% of Kitchen Sales, i.e. a kitchen that spends almost
                // everything it earns on restocking - directly contradicting
                // the 70-90% per-dish margins the Dish Profitability panel
                // shows from the same menu. Targets a realistic ~25-30% food
                // cost ratio instead, so Kitchen Sales reliably stays above
                // Kitchen Purchases.
                $qty = round(rand(1, 6) / 2, 1);
                $total = round($qty * $rate, 2);
                $isPaid = rand(1, 100) <= 70;
                $purchaseStmt->execute([
                    'PUR-' . uniqid(), $propertyId, $cursor->format('Y-m-d'), $item['name'],
                    $qty, $item['unit'], $total, $rate, 'Sunil Yadav', 'Local Market',
                    $isPaid ? 'Paid' : 'Unpaid', rand(0, 1) ? 'Farm Cash' : 'Out-of-Pocket',
                ]);
                $cursor->modify('+' . max(1, $item['freqDays'] + rand(-1, 2)) . ' days');
            }
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
        // Matches the main booking window's past edge ($windowStart, -30 days)
        // - was -13 days (17 Aug 2026 fix), leaving less than half a month of
        // attendance history while every other past-facing dataset (bookings,
        // kitchen purchases/orders) already reached back a full 30 days.
        $attendanceWindowStart = (clone $today)->modify('-30 days');
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
        // Past edge squared off to match $windowStart (-30 days, 17 Aug 2026
        // fix) - was -20 days, the one dataset whose "how far back" didn't
        // match everything else's exact one-month reach. Forward edge (+30)
        // is unrelated to the Pace tab's own +84-day forward window and is
        // left as-is - it only governs how far out a synced-but-unconverted
        // OTA calendar block can land, not confirmed bookings.
        $otaWindowStart = (clone $today)->modify('-30 days');
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

            // Seeded from real bookings AND section 3b's already-placed OTA
            // block for this room (see $otaBlockedRangesByRoom above), then
            // built up as this room's own feeds place blocks below - kept
            // OUTSIDE the per-feed loop so Airbnb's blocks are visible when
            // placing Booking.com's for the same room, and vice versa,
            // instead of each feed only ever checking against bookings.
            $placedRanges = array_map(function ($b) {
                return ['start' => new DateTime($b['checkin']), 'end' => new DateTime($b['checkout'])];
            }, $roomOwnBookings);
            foreach (($otaBlockedRangesByRoom[(int)$otaRoomId] ?? []) as $range) {
                $placedRanges[] = $range;
            }

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
                // same room - by this feed, an earlier feed on the same room,
                // or section 3b above - so nothing ever overlaps. $placedRanges
                // is intentionally the same array across every feed/room-level
                // block placed so far (built above, appended to below), not
                // reset per feed.
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

                    $externalId = 'demo-' . uniqid() . '-' . $syncConfigId . $feed['uid_suffix'];
                    $refCode = ($feed['channel'] === 'Airbnb')
                        ? 'HM' . strtoupper(substr(md5(uniqid()), 0, 8))
                        : (string)rand(1000000000, 9999999999);
                    $eventTitle = $feed['channel'] . ' #' . $refCode;
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
                    $placedRanges[] = ['start' => $blockStart, 'end' => $blockEnd];
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

        // 8. Demo KDS Orders - active orders for today + rich historical dining sales across 30 days
        // Get menu items with prices for calculating order revenue
        $menuItemStmt = $pdo->prepare("
            SELECT mi.id, mi.name, mi.price, COALESCE(mc.name, 'Main Course') as category_name
            FROM menu_items mi LEFT JOIN menu_categories mc ON mi.category_id = mc.id
            WHERE mi.property_id = ? AND mi.is_demo = 1
        ");
        $menuItemStmt->execute([$propertyId]);
        $demoMenuWithPrices = $menuItemStmt->fetchAll(PDO::FETCH_ASSOC);
        if (empty($demoMenuWithPrices)) {
            $demoMenuWithPrices = [['id' => 1, 'name' => 'Paneer Butter Masala', 'price' => 320, 'category_name' => 'Main Course']];
        }

        // Per-dish base kitchen prep time (minutes), so "fastest/slowest
        // prepared dishes" in Analytics reflects a real, stable pattern
        // (a tea genuinely doesn't take as long as a curry) instead of pure
        // per-order noise - varied by category, with a fixed per-dish jitter
        // so the same dish lands in roughly the same band every order.
        $prepTimeBandByCategory = [
            'Beverages' => [4, 9],
            'Salads & Raita' => [5, 10],
            'Starters' => [8, 16],
            'Chinese & Snacks' => [10, 20],
            'Breads & Rice' => [10, 18],
            'Breakfast & Eggs' => [9, 17],
            'Pizzas & Sandwiches' => [15, 25],
            'Main Course' => [18, 35],
        ];
        $basePrepMinutesByItemId = [];
        foreach ($demoMenuWithPrices as $mi) {
            $band = $prepTimeBandByCategory[$mi['category_name']] ?? [12, 22];
            $basePrepMinutesByItemId[$mi['id']] = rand($band[0], $band[1]);
        }

        $kdsStatuses = ['Pending', 'Preparing', 'Ready', 'Completed'];
        $kdsOrders = [];
        // Generate ~55-60 dining orders across the 30-day window (82% active-day
        // chance, up from 70% on 16 Aug 2026 - a modest bump alongside larger
        // check sizes below, so Kitchen POS carries more of the total revenue
        // instead of relying on Room Accommodations alone for margin).
        foreach (burstyDayList($windowStart, $today, 82) as $day) {
            $orderTime = $day->format('Y-m-d') . ' ' . sprintf('%02d:%02d:00', rand(8, 21), rand(0, 59));
            $isToday = $day->format('Y-m-d') === $today->format('Y-m-d');
            $status = $isToday ? $kdsStatuses[array_rand([0, 1, 2])] : 'Completed';

            $kdsOrders[] = [
                'property_id' => $propertyId,
                'guest_id' => null,
                'room_number' => 'Room ' . (101 + rand(0, 4)),
                'order_time' => $orderTime,
                'status' => $status,
                'is_demo' => 1,
            ];
        }

        $stmt = $pdo->prepare("
            INSERT IGNORE INTO orders (property_id, guest_id, order_time, status, is_demo)
            VALUES (?, ?, ?, ?, 1)
        ");
        $servedLogStmt = $pdo->prepare("
            INSERT INTO served_logs (property_id, order_id, item_name, quantity, served_by, room_number, served_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $kitchenStaffNames = ['Sunil Yadav', 'Rajesh Kumar'];
        foreach ($kdsOrders as $order) {
            $stmt->execute([$order['property_id'], $order['guest_id'], $order['order_time'], $order['status']]);
            $orderId = $pdo->lastInsertId();
            $orderTimeDt = new DateTime($order['order_time']);

            // 3-5 menu items per order, qty 1-3 (up from 2-4 items/qty 1-2 on 16
            // Aug 2026) for larger dining check sizes (~₹1,800 - ₹3,200) - a
            // family/group dining at a resort restaurant orders more per table
            // than a quick solo meal.
            $itemCount = rand(3, 5);
            $orderTotal = 0;
            for ($j = 0; $j < $itemCount; $j++) {
                $item = $demoMenuWithPrices[array_rand($demoMenuWithPrices)];
                $qty = rand(1, 3);
                $orderTotal += ($item['price'] * $qty);
                $itemStatus = $order['status'] === 'Completed' ? 'Served' : ($order['status'] === 'Ready' ? 'Ready' : 'Pending');

                // Ready/Served items get a real ready_at (order_time + this
                // dish's base prep band +- jitter) so per-dish prep latency
                // (Analytics "Fastest/Slowest Prepared Dishes") reflects an
                // actual, stable pattern instead of the hardcoded "18.5 mins
                // (Standard)" fallback the aggregate stat showed when this
                // was never populated at all.
                $readyAt = null;
                if ($itemStatus === 'Ready' || $itemStatus === 'Served') {
                    $basePrep = $basePrepMinutesByItemId[$item['id']] ?? 15;
                    $prepMinutes = max(2, $basePrep + rand(-2, 3));
                    $readyAt = (clone $orderTimeDt)->modify("+{$prepMinutes} minutes")->format('Y-m-d H:i:s');
                }

                $itemStmt = $pdo->prepare("
                    INSERT INTO order_items (order_id, menu_item_id, quantity, item_status, ready_at, is_demo)
                    VALUES (?, ?, ?, ?, ?, 1)
                ");
                $itemStmt->execute([$orderId, $item['id'], $qty, $itemStatus, $readyAt]);

                if ($itemStatus === 'Served' && $readyAt) {
                    $servedAt = (clone new DateTime($readyAt))->modify('+' . rand(2, 8) . ' minutes')->format('Y-m-d H:i:s');
                    $servedLogStmt->execute([
                        $propertyId, $orderId, $item['name'], $qty,
                        $kitchenStaffNames[array_rand($kitchenStaffNames)],
                        $order['room_number'], $servedAt,
                    ]);
                }
            }

            // Post financial ledger credit for completed food orders
            if ($order['status'] === 'Completed' && $orderTotal > 0) {
                postFinancialLedger($pdo, [
                    'entry_key' => 'kitchen_order:demo:' . $orderId,
                    'direction' => 'credit',
                    'amount' => $orderTotal,
                    'category' => 'Kitchen POS Sales',
                    'payment_method' => 'Cash',
                    'party_type' => 'guest',
                    'party_id' => null,
                    'party_name' => $order['room_number'],
                    'source_type' => 'kitchen_order',
                    'source_id' => $orderId,
                    'description' => 'Dining POS Order - ' . $order['room_number'],
                    'occurred_at' => $order['order_time'],
                ], $propertyId);
            }
        }

        // 8b. Demo Vendors & Third Parties (payee_entities) - real-sounding
        // operational suppliers matching the actual inventory categories
        // seeded above (produce, dairy, gas, pool, laundry), not placeholder
        // names. "Registered Payees" showed 0 vendors on every demo property
        // otherwise, despite Kitchen Purchases logging real vendor-paid entries.
        $demoPayees = [
            ['name' => 'Fresh Farm Vegetables'],
            ['name' => 'Sunrise Dairy Distributors'],
            ['name' => 'Coastal Gas Agency'],
            ['name' => 'Blue Wave Pool Services'],
            ['name' => 'Rapid Laundry Solutions'],
            ['name' => 'State Electricity Board'],
        ];
        foreach ($demoPayees as $payee) {
            $stmt = $pdo->prepare("
                INSERT INTO payee_entities (id, property_id, name, is_demo)
                VALUES (?, ?, ?, 1)
            ");
            $stmt->execute(['PAYEE-' . uniqid(), $propertyId, $payee['name']]);
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

        // 10. Demo Property Licenses - a realistic mix of statuses so the
        // License Management page (empty by default, no seed data before this)
        // actually demonstrates its expiry-alert UI: one comfortably active,
        // one about to trigger the "expiring soon" state, and one already
        // expired needing renewal. license_number carries a UNIQUE constraint
        // across the whole table (not scoped per property), so $propertyId is
        // baked into each number to avoid colliding with another property's
        // demo (or real) licenses.
        $demoLicenses = [
            [
                'type' => 'homestay',
                'name' => 'Homestay Registration Certificate',
                'number' => "HS-{$propertyId}-2026",
                'authority' => 'Department of Tourism',
                'start' => (clone $today)->modify('-300 days')->format('Y-m-d'),
                'end' => (clone $today)->modify('+240 days')->format('Y-m-d'),
                'notes' => 'Annual homestay registration - renew via the tourism department portal.',
            ],
            [
                'type' => 'fssai',
                'name' => 'FSSAI License (Food Safety)',
                'number' => "FSSAI-{$propertyId}-2026",
                'authority' => 'Food Safety and Standards Authority of India',
                'start' => (clone $today)->modify('-355 days')->format('Y-m-d'),
                'end' => (clone $today)->modify('+5 days')->format('Y-m-d'),
                'notes' => 'Covers the in-house kitchen - renewal application already submitted, awaiting approval.',
            ],
            [
                'type' => 'fire_safety',
                'name' => 'Fire Safety Certificate',
                'number' => "FIRE-{$propertyId}-2025",
                'authority' => 'State Fire & Emergency Services',
                'start' => (clone $today)->modify('-380 days')->format('Y-m-d'),
                'end' => (clone $today)->modify('-15 days')->format('Y-m-d'),
                'notes' => 'Expired - inspection needs to be re-scheduled before renewal.',
            ],
            [
                'type' => 'gst',
                'name' => 'GST Registration Certificate',
                'number' => "GST-{$propertyId}-2026",
                'authority' => 'GST Department',
                'start' => (clone $today)->modify('-500 days')->format('Y-m-d'),
                'end' => (clone $today)->modify('+400 days')->format('Y-m-d'),
                'notes' => 'Standard GST registration, printed on tax invoices at checkout.',
            ],
        ];
        foreach ($demoLicenses as $lic) {
            $stmt = $pdo->prepare("
                INSERT INTO property_licenses
                (property_id, license_type, license_name, license_number, issuing_authority, start_date, end_date, notes, is_demo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ");
            $stmt->execute([$propertyId, $lic['type'], $lic['name'], $lic['number'], $lic['authority'], $lic['start'], $lic['end'], $lic['notes']]);
        }

        // FINAL SAFETY NET (26 Aug 2026, explicit user requirement: "make sure everytime i click
        // on reset demo data such issues dont come"). Every placement path above already avoids
        // overlaps on its own (section 3's bookings, 3b's OTA blocks, 6g's multi-channel feeds all
        // share range registries) - but that correctness depends on several invariants staying
        // true across future edits, and it has silently broken before (20 Aug 2026: sections 3b
        // and 6g were blind to each other and stacked two OTA bars on Room 101's same dates).
        // This pass is the guarantee that does NOT depend on any of that: it re-reads what was
        // actually written and removes any real overlap it finds, so a demo reset can never leave
        // a double-booked room behind regardless of which placement path regressed.
        // Deliberately runs INSIDE the transaction, before commit - a demo dataset must never be
        // committed in a state that violates the "1 room = 1 active booking" rule (CLAUDE.md).
        // Comparison is half-open (start < other_end && end > other_start) so same-day turnover -
        // one stay ending the morning the next begins - is correctly NOT treated as an overlap.
        $conflictsRemoved = purgeDemoBookingOverlaps($pdo, $propertyId);

        $pdo->commit();
        $msg = 'Demo data generated successfully';
        if ($conflictsRemoved > 0) {
            // Surfaced rather than silently swallowed - if this ever fires, a placement path above
            // has regressed and needs fixing at the source; the safety net is not meant to be
            // load-bearing in normal operation.
            $msg .= " (safety net removed $conflictsRemoved overlapping demo row(s) - a placement path in generateDemoData() has regressed, please investigate)";
            if (class_exists('TelescopeLogger')) {
                TelescopeLogger::log('sql', 'Demo Overlap Safety Net Fired', "Removed $conflictsRemoved overlapping demo row(s)", "Property ID: $propertyId", [
                    'property_id' => $propertyId,
                    'removed' => $conflictsRemoved,
                ]);
            }
        }
        return ['status' => 'success', 'message' => $msg];

    } catch (Exception $e) {
        $pdo->rollBack();
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}

/**
 * Removes any overlapping DEMO stay from a property's rooms - both real guest bookings and synced
 * OTA calendar blocks - keeping the earliest-starting one in each conflicting pair. Returns how
 * many rows it deleted (0 in normal operation).
 *
 * Scoped strictly to `is_demo = 1` rows: this must never touch a real booking or a real OTA feed,
 * even on a property that has both. Scope covers the property AND its MULTI_KEY_ROOM children,
 * the same way clearDemoData()/ICalSyncManager::getBlockedDates() expand scope - OTA feeds are
 * connected per-room, against each room's own property_id, not the multi-key parent's.
 */
function purgeDemoBookingOverlaps($pdo, $propertyId): int {
    $removed = 0;

    $scopeStmt = $pdo->prepare("SELECT id FROM properties WHERE id = ? OR parent_property_id = ?");
    $scopeStmt->execute([$propertyId, $propertyId]);
    $scopeIds = $scopeStmt->fetchAll(PDO::FETCH_COLUMN);
    if (empty($scopeIds)) return 0;
    $inScope = implode(',', array_fill(0, count($scopeIds), '?'));

    // --- 1. Guest bookings, grouped per room. room_id NULL means "unassigned", which genuinely
    //        can hold several concurrent stays (it isn't one physical room), so it's skipped.
    $stmt = $pdo->prepare("
        SELECT id, room_id, checkin_date AS start_at, expected_checkout AS end_at
        FROM guests
        WHERE property_id = ? AND is_demo = 1 AND room_id IS NOT NULL
          AND status IN (?, ?, ?)
        ORDER BY room_id, checkin_date, id
    ");
    $stmt->execute([$propertyId, GUEST_STATUS_ACTIVE_LEGACY, GUEST_STATUS_CHECKED_IN, GUEST_STATUS_BOOKED]);
    $removed += deleteOverlappingRows($pdo, $stmt->fetchAll(PDO::FETCH_ASSOC), 'room_id', 'guests');

    // --- 2. Synced OTA events, grouped per room (a config belongs to exactly one room, so group
    //        by the config's property_id to catch Airbnb-vs-Booking.com conflicts on one room).
    $stmt = $pdo->prepare("
        SELECT e.id, c.property_id AS room_id, e.event_start AS start_at, e.event_end AS end_at
        FROM ical_synced_events e
        JOIN ical_sync_configs c ON c.id = e.sync_config_id
        WHERE c.property_id IN ($inScope) AND c.is_demo = 1
        ORDER BY c.property_id, e.event_start, e.id
    ");
    $stmt->execute($scopeIds);
    $removed += deleteOverlappingRows($pdo, $stmt->fetchAll(PDO::FETCH_ASSOC), 'room_id', 'ical_synced_events');

    return $removed;
}

/**
 * Shared overlap sweep for purgeDemoBookingOverlaps(). Rows must arrive pre-sorted by group then
 * start_at. Walks each group once keeping a running "furthest end kept so far" watermark - any row
 * starting before that watermark overlaps something already kept, so it's deleted.
 */
function deleteOverlappingRows($pdo, array $rows, string $groupKey, string $table): int {
    $removed = 0;
    $groups = [];
    foreach ($rows as $r) {
        $groups[(int)$r[$groupKey]][] = $r;
    }
    $del = $pdo->prepare("DELETE FROM `$table` WHERE id = ?");
    foreach ($groups as $groupRows) {
        $keptEnd = null;
        foreach ($groupRows as $row) {
            $start = strtotime($row['start_at']);
            $end = strtotime($row['end_at']);
            if ($start === false || $end === false) continue;
            // Half-open: a stay starting exactly when the kept one ends is same-day turnover, not
            // an overlap, so `<` (not `<=`) is deliberate here.
            if ($keptEnd !== null && $start < $keptEnd) {
                $del->execute([$row['id']]);
                $removed += $del->rowCount();
                continue;
            }
            $keptEnd = ($keptEnd === null) ? $end : max($keptEnd, $end);
        }
    }
    return $removed;
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

        // Delete demo guest extra charges
        $stmt = $pdo->prepare("DELETE FROM guest_extra_charges WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo menu items
        $stmt = $pdo->prepare("DELETE FROM menu_items WHERE property_id = ? AND is_demo = 1");
        $stmt->execute([$propertyId]);
        $deletedRows += $stmt->rowCount();

        // Delete demo dish recipes - also sweeps up recipes orphaned by a
        // pre-is_demo-column demo cycle (a recipe whose menu_item_id no
        // longer exists in menu_items, since that gets deleted+recreated
        // with fresh ids on every cycle above) regardless of its is_demo
        // value, so those never accumulate as dead rows going forward.
        $stmt = $pdo->prepare("DELETE FROM dish_recipes WHERE property_id = ? AND (is_demo = 1 OR menu_item_id NOT IN (SELECT id FROM menu_items))");
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

        // Delete demo property licenses
        $stmt = $pdo->prepare("DELETE FROM property_licenses WHERE property_id = ? AND is_demo = 1");
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

        // Delete demo billing receipts (including any historical RCP- prefixed demo receipts)
        $stmt = $pdo->prepare("DELETE FROM billing_receipts WHERE property_id = ? AND (is_demo = 1 OR id LIKE 'RCP-%')");
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
