<?php
/**
 * Offline Intent Engine test suite for php/ai/offline_intent_engine.php + php/ai/nav_menu_intents.php.
 *
 * runOfflineIntentEngine() is pure logic (no $pdo, no session - see that file's own doc comment),
 * so most cases here call it directly. buildNavMenuIntents() needs a PDO, so its handful of cases
 * use an in-memory SQLite fixture instead of a live MySQL connection - this suite is meant to run
 * anywhere with zero setup: `php php/tests/test_ai_intents.php`.
 *
 * This file previously existed but was never committed (`.gitignore`'s blanket `test_*.php` rule
 * silently dropped it from every commit/auto-commit) - see this repo's `!php/tests/test_ai_intents.php`
 * exception line for the fix. Add one row per new phrasing you teach the engine so it stays covered
 * instead of only being caught by the next live user who tries it (same rule the engine's own doc
 * comments ask for).
 */

require_once __DIR__ . '/../ai/offline_intent_engine.php';
require_once __DIR__ . '/../ai/nav_menu_intents.php';

$pass = 0;
$fail = 0;
$failures = [];

/**
 * @param string $message
 * @param string $role
 * @param array|null $context
 * @param array $extraIntents
 * @param array $expect Optional keys: actionType (string|null, checked if key present),
 *        actionField (['field'=>..,'value'=>..]), replyContains (string), replyNotContains (string)
 */
function check(string $label, string $message, string $role, ?array $context, array $extraIntents, array $expect): void {
    global $pass, $fail, $failures;
    $result = runOfflineIntentEngine($message, $context, $role, $extraIntents);
    $ok = true;
    $reason = '';

    if (array_key_exists('actionType', $expect)) {
        $got = $result['action']['type'] ?? null;
        if ($got !== $expect['actionType']) {
            $ok = false;
            $reason = 'actionType: expected ' . var_export($expect['actionType'], true) . ', got ' . var_export($got, true);
        }
    }
    if ($ok && isset($expect['actionField'])) {
        $field = $expect['actionField']['field'];
        $want = $expect['actionField']['value'];
        $got = $result['action'][$field] ?? null;
        if ($got !== $want) {
            $ok = false;
            $reason = "actionField '$field': expected " . var_export($want, true) . ', got ' . var_export($got, true);
        }
    }
    if ($ok && isset($expect['replyContains']) && !str_contains($result['reply'], $expect['replyContains'])) {
        $ok = false;
        $reason = "reply does not contain '{$expect['replyContains']}' (got: " . substr($result['reply'], 0, 80) . '...)';
    }
    if ($ok && isset($expect['replyEquals']) && $result['reply'] !== $expect['replyEquals']) {
        $ok = false;
        $reason = "reply expected '{$expect['replyEquals']}', got '{$result['reply']}'";
    }
    // Documented since this file's own top comment but never actually implemented until 27 Aug
    // 2026 (found while adding a test that needed it) - any earlier 'replyNotContains' usage
    // would have silently passed without checking anything.
    if ($ok && isset($expect['replyNotContains']) && str_contains($result['reply'], $expect['replyNotContains'])) {
        $ok = false;
        $reason = "reply should NOT contain '{$expect['replyNotContains']}' (got: " . substr($result['reply'], 0, 120) . '...)';
    }
    if ($ok && array_key_exists('matched', $expect) && ($result['matched'] ?? null) !== $expect['matched']) {
        $ok = false;
        $reason = 'matched: expected ' . var_export($expect['matched'], true) . ', got ' . var_export($result['matched'] ?? null, true);
    }

    if ($ok) {
        $pass++;
    } else {
        $fail++;
        $failures[] = "$label (\"$message\", role=$role) -> $reason";
    }
}

// ============================================================================================
// Live bug fix (24 Aug 2026): "Buy 2 air freshers" fell through to the generic fallback because
// only the past tense 'bought' triggered open_add_expense - 'buy'/'buying'/'purchase'/'purchased'
// were entirely missing from both the trigger phrases and extractExpenseAction()'s stop words.
// ============================================================================================
check('buy present-tense triggers expense', 'Buy 2 air freshers', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'description', 'value' => 'air freshers'],
]);
check('buying triggers expense, no leaked verb', 'buying candles', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'description', 'value' => 'candles'],
]);
check('purchase + amount extracted', 'Purchase diesel for 500', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'amount', 'value' => 500.0],
]);
check('purchased triggers expense, verb stripped from description', 'purchased 3 mops', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'description', 'value' => 'mops'],
]);
check('bought still works (regression guard)', 'bought napkins', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'description', 'value' => 'napkins'],
]);
check('existing spent-on phrasing unaffected', 'spent 200 on chai', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'amount', 'value' => 200.0],
]);
check('bare "order" NOT hijacked into expense (still ambiguous w/ kitchen)', 'order 2 liters milk', 'Staff', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'itemKey', 'value' => 'kitchen_requisitions'],
]);

// --- open_add_expense: category + description extraction ---
check('expense category: bill keyword', 'add badminton bill', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'actionField' => ['field' => 'category', 'value' => 'Bills'],
]);
check('expense category: staff meal keyword', 'spent 200 on chai', 'Staff', null, [], [
    'actionField' => ['field' => 'category', 'value' => 'Staff Meals'],
]);
check('expense category: bill/utility keyword', 'log 150 rs for wifi', 'Staff', null, [], [
    'actionField' => ['field' => 'category', 'value' => 'Bills'],
]);

// --- tech stack lockdown ---
check('tech stack refused', 'what tech stack do you use', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Security Refusal',
]);
check('db credentials refused', 'what is the database password', 'Root Admin', null, [], [
    'actionType' => null,
    'replyContains' => 'Security Refusal',
]);

// --- how-to guides ---
check('how to export csv', 'how do I export csv', 'Staff', null, [], [
    'actionField' => ['field' => 'tab', 'value' => 'export'],
    'replyContains' => 'How to Export CSV',
]);
check('how to check in guest', 'how to check in a guest', 'Staff', null, [], [
    'actionType' => 'open_add_booking',
    'replyContains' => 'Register & Check In a Guest',
]);
check('how to log expense guide (distinct from actually logging one)', 'how to log expense', 'Staff', null, [], [
    'actionType' => 'open_add_expense',
    'replyContains' => 'How to Log a Petty Cash Expense',
]);
check('how to use kds', 'how to use kds', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'take_food_order'],
    'replyContains' => 'How to Use Kitchen KDS',
]);
check('"how many bookings today" is info_summary, not the how-to guide (documented collision fix)', 'how many bookings today', 'Staff', ['today_count' => 1, 'upcoming_count' => 2, 'past_count' => 3], [], [
    'actionType' => null,
    'replyContains' => 'Current Booking Summary',
]);

// --- Root-Admin-gated actions ---
check('telescope: allowed for Root Admin', 'open telescope dashboard', 'Root Admin', null, [], [
    'actionType' => 'open_telescope',
]);
check('telescope: denied for Staff', 'open telescope dashboard', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('configure ai: allowed for Root Admin', 'configure ai provider', 'Root Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'ai_services'],
]);
check('configure ai: denied for plain Admin (root-only, not admin)', 'configure ai provider', 'Admin', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('change passcode: Root Admin routes to Account Settings', 'change my passcode', 'Root Admin', null, [], [
    'actionType' => 'open_root_dashboard_route',
]);
check('change passcode: plain Admin routed to Team ➔ Staff & Permissions', 'change my passcode', 'Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'staff_permissions'],
]);
check('change passcode: Staff told there is no self-service form', 'change my passcode', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'no self-service passcode change',
]);

// --- Admin-gated actions ---
check('telegram modal: allowed for Admin', 'open telegram', 'Admin', null, [], [
    'actionType' => 'open_telegram_modal',
]);
check('telegram modal: denied for Staff', 'open telegram', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('edit property: allowed for Admin', 'edit property details', 'Admin', null, [], [
    'actionField' => ['field' => 'tab', 'value' => 'edit_property'],
]);
check('edit property: denied for Staff', 'edit property details', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('edit staff: allowed for Admin, extracts name', 'update staff phone for Kinkar', 'Admin', null, [], [
    'actionField' => ['field' => 'staffName', 'value' => 'Kinkar'],
]);
check('edit staff: denied for Staff', 'update staff phone for Kinkar', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('add staff member: extracts name/phone/salary', 'add new staff member Rajesh phone 9876543210 salary 15000', 'Admin', null, [], [
    'actionField' => ['field' => 'addStaffName', 'value' => 'Rajesh'],
]);
check('add staff member: phone extracted', 'add new staff member Rajesh phone 9876543210 salary 15000', 'Admin', null, [], [
    'actionField' => ['field' => 'addStaffPhone', 'value' => '9876543210'],
]);
check('add staff member: salary extracted', 'add new staff member Rajesh phone 9876543210 salary 15000', 'Admin', null, [], [
    'actionField' => ['field' => 'addStaffSalary', 'value' => 15000.0],
]);
check('add staff member: denied for Staff', 'add new staff member Rajesh phone 9876543210', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('add menu item: extracts name/price/category', 'add menu item Paneer Tikka for 250 in starters', 'Admin', null, [], [
    'actionField' => ['field' => 'newMenuItemName', 'value' => 'Paneer Tikka'],
]);
check('add menu item: price extracted', 'add menu item Paneer Tikka for 250 in starters', 'Admin', null, [], [
    'actionField' => ['field' => 'newMenuItemPrice', 'value' => 250.0],
]);
check('add menu item: category extracted', 'add menu item Paneer Tikka for 250 in starters', 'Admin', null, [], [
    'actionField' => ['field' => 'newMenuItemCategory', 'value' => 'Starters'],
]);
check('license management: allowed for Admin', 'license expiry', 'Admin', null, [], [
    'actionField' => ['field' => 'tab', 'value' => 'licenses'],
]);
check('license management: denied for Staff', 'license expiry', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);

// --- open to all staff: material requests, bookings, staff meals, service requests ---
check('material request: glued unit converts gm to kg', 'Request 100gm besan', 'Staff', null, [], [
    'actionField' => ['field' => 'reqItemName', 'value' => 'besan'],
]);
check('material request: gm->kg conversion value', 'Request 100gm besan', 'Staff', null, [], [
    'actionField' => ['field' => 'reqQty', 'value' => 0.1],
]);
check('material request: liters unit', 'order 2 liters milk', 'Staff', null, [], [
    'actionField' => ['field' => 'reqUnit', 'value' => 'liters'],
]);
check('material request: no-unit stockout phrasing still extracts item', 'we are running low on rice', 'Staff', null, [], [
    'actionField' => ['field' => 'reqItemName', 'value' => 'rice'],
]);
check('add booking: open to any role', 'add booking', 'Staff', null, [], [
    'actionType' => 'open_add_booking',
    'replyContains' => "Add Guest Booking",
]);
check('staff meals: name after "for"', 'add meal for Kinkar', 'Staff', null, [], [
    'actionField' => ['field' => 'staffName', 'value' => 'Kinkar'],
]);
check('staff meals: chai/tea phrasing + name', 'log a chai for Priya', 'Staff', null, [], [
    'actionField' => ['field' => 'staffName', 'value' => 'Priya'],
]);
check('service request: room + item extraction', 'send towels to room 102', 'Staff', null, [], [
    'actionField' => ['field' => 'roomNumber', 'value' => '102'],
]);
check('service request: item extraction', 'send towels to room 102', 'Staff', null, [], [
    'actionField' => ['field' => 'item', 'value' => 'towels'],
]);
check('service request: maintenance complaint phrasing', 'AC not working room 105', 'Staff', null, [], [
    'actionField' => ['field' => 'roomNumber', 'value' => '105'],
]);

// --- navigation-only intents ---
check('kds bare word', 'kds', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'take_food_order'],
]);
check('go to kitchen', 'go to kitchen', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'take_food_order'],
]);
check('show all bookings', 'show all bookings', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'all_bookings'],
]);

// --- info-only (no action) intents ---
check('visitor info: what is ground code', 'what is ground code', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Welcome to Ground Code',
]);
check('info: upcoming bookings, non-zero', 'upcoming bookings', 'Staff', ['upcoming_count' => 3], [], [
    'actionType' => null,
    'replyEquals' => 'You currently have 3 upcoming booking(s) scheduled.',
]);
check('info: upcoming bookings, zero', 'upcoming bookings', 'Staff', ['upcoming_count' => 0], [], [
    'actionType' => null,
    'replyContains' => 'You currently have 0 upcoming bookings',
]);
check('info: active bookings today with guest list', 'active booking today', 'Staff', ['today_count' => 2, 'active_guests' => ['101: Ram']], [], [
    'actionType' => null,
    'replyContains' => '101: Ram',
]);
check('info: receipt/checkout guidance', 'print receipt', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Checkout',
]);
check('info: tariff guidance (room rent phrase avoids "what is" collision)', 'room rent', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Room Management',
]);
check('info: c-form guidance', 'foreign guest c-form', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'C-Form',
]);

// --- fallback: no intent recognized ---
check('gibberish falls back to generic help', 'asdkjqwe iuqweiquwe', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Ground Code helps you manage',
]);
check('unrelated small talk falls back to generic help', 'thanks', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Ground Code helps you manage',
]);

// ============================================================================================
// buildNavMenuIntents() - needs a PDO, so these use an in-memory SQLite fixture instead of a
// live MySQL connection (nav_menu_items only ever gets plain SELECTs from this function).
// ============================================================================================
$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec("CREATE TABLE nav_menu_items (unique_key TEXT, title TEXT, tab_key TEXT, roles_json TEXT, is_visible INTEGER)");
$navFixture = [
    ['cash_drawer', 'Cash Drawer', 'petty_cash', '[]', 1],
    ['purchase_analytics', 'Purchase Analytics', 'analytics', '["Super Admin","Admin"]', 1],
    ['hidden_page', 'Hidden Internal Page', 'internal', '[]', 0],
    ['header_row', 'Financials', '', '[]', 1],
    ['attendance_calendar', 'Attendance Calendar', 'staff', '["Super Admin","Admin","Staff Supervisor"]', 1],
    ['edit_kitchen_stock', 'Edit Kitchen Stock', 'inventory', '[]', 1],
    ['deficit_shortfalls_log', 'Kitchen Wastage', 'inventory', '[]', 1],
    ['finances', 'Finances', 'petty_cash', '[]', 1],
    ['edit_food_menu', 'Edit Food Menu', 'menu_manager', '[]', 1],
];
$stmt = $pdo->prepare("INSERT INTO nav_menu_items (unique_key, title, tab_key, roles_json, is_visible) VALUES (?, ?, ?, ?, ?)");
foreach ($navFixture as $row) {
    $stmt->execute($row);
}
$navIntents = buildNavMenuIntents($pdo);

if (count($navIntents) === 7) {
    $pass++;
} else {
    $fail++;
    $failures[] = 'buildNavMenuIntents: expected 7 intents (hidden row + header row excluded), got ' . count($navIntents);
}

check('nav auto-intent: plain title navigates', 'go to cash drawer', 'Staff', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'cash_drawer'],
]);
check('nav auto-intent: role-restricted page denied for Staff', 'open purchase analytics', 'Staff', null, $navIntents, [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('nav auto-intent: role-restricted page allowed for Admin', 'open purchase analytics', 'Admin', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'purchase_analytics'],
]);
check('nav auto-intent: hand-written intent still wins on overlap', 'add booking', 'Staff', null, $navIntents, [
    'actionType' => 'open_add_booking',
]);

// ============================================================================================
// Live bug fix (27 Aug 2026), graduated from a real trial transcript per AI.md's mining plan:
// "How to mark attendance" scored 0 offline (the auto-generated nav intent only matched the
// literal title "attendance calendar") and, separately, got a confident WRONG denial from Gemini
// ("attendance tracking doesn't exist") before the online known-pages fix earlier tonight. Fixed
// generically via NAV_INTENT_PHRASE_ALIASES rather than a one-off hand-written intent, since the
// real role gate (Super Admin/Admin/Staff Supervisor - NOT a clean "isAdmin" boolean) already
// lives correctly in roles_json and shouldn't be duplicated/guessed at in a hardcoded check.
// ============================================================================================
check('attendance alias reaches the real page for an allowed role', 'how to mark attendance', 'Admin', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'attendance_calendar'],
]);
check('attendance alias respects the real (non-isAdmin) role gate for Staff Supervisor', 'mark attendance', 'Staff Supervisor', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'attendance_calendar'],
]);
check('attendance alias denies a plain Staff role', 'mark attendance', 'Staff', null, $navIntents, [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('kitchen stock alias reaches Edit Kitchen Stock, not KDS', 'How do I add or update kitchen inventory/stock items?', 'Admin', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_kitchen_stock'],
]);

// ============================================================================================
// Live coverage additions (27 Aug 2026), same broad FAQ-expansion pass: walk-in tabs, kitchen
// wastage, and kitchen purchases are all real features that had zero offline phrase coverage.
// ============================================================================================
check('walk-in tab reaches take_food_order, distinct from open_add_booking\'s "walk in guest"', 'How do I open a walk-in tab for a table?', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'take_food_order'],
]);
check('"walk in guest" (a booking, not a tab) is unaffected by the new walk_in_tab intent', 'walk in guest wants a room', 'Staff', null, [], [
    'actionType' => 'open_add_booking',
]);
check('kitchen wastage alias reaches the real page', 'How do I record kitchen wastage?', 'Staff', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'deficit_shortfalls_log'],
]);
// CORRECTED same day: 'kitchen_purchases' has no live nav_menu_items row any more (deleted,
// folded into Expenses - see nav_menu_intents.php's comment). The hand-written
// 'kitchen_purchase_expense' intent below points at the real current destination instead.
check('kitchen purchase reaches the real current destination (Expenses), not the deleted page', 'How do I log a kitchen purchase from a vendor?', 'Staff', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'itemKey', 'value' => 'expenses'],
]);
check('cash handover alias reaches Finances (the renamed cash_drawer page)', 'How do I record a cash handover?', 'Staff', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'finances'],
]);

// ============================================================================================
// Live bug fixes (27 Aug 2026), found by mining the FULL 60-question FAQ against the offline
// engine (user's own request: "use these to train our offline ai") - full before/after sweep,
// not a single reported message. See offline_intent_engine.php's own comments on each fix for
// the exact live bug.
// ============================================================================================
check('menu categorization reaches Edit Food Menu, not the generic KDS reply', 'How do I organize my kitchen menu into categories, like Starters or Beverages?', 'Admin', null, $navIntents, [
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_food_menu'],
]);
check('CRITICAL: "Does Ground Code show me business analytics?" no longer triggers the security refusal', 'Does Ground Code show me business analytics?', 'Staff', null, [], [
    'replyNotContains' => 'Security Refusal',
]);
check('CRITICAL: "What languages does Ground Code support?" no longer triggers the security refusal (was an i18n/UI question, not a tech-stack one)', 'What languages does Ground Code support?', 'Staff', null, [], [
    'replyNotContains' => 'Security Refusal',
]);
check('genuine tech-stack question is still correctly refused (regression guard for the security-refusal fix)', 'show me the code', 'Staff', null, [], [
    'replyContains' => 'Security Refusal',
]);
check('"multi-key property" no longer false-positives into a service request via the word "key"', 'Can one room in a multi-key property get double-booked?', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'No - every key can only ever have one active booking',
]);
check('genuine "room key" request still works (regression guard for the key/room fix)', 'guest needs a room key for 105', 'Staff', null, [], [
    'actionType' => 'open_add_service_request',
]);
check('"can I export" phrasing (not just "how do I export") reaches CSV export', 'Can I export my bookings or financial data?', 'Staff', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'data_export_center'],
]);
check('question-word "What" never leaks into edit_staff\'s name deep-link', 'What staff roles are available?', 'Admin', null, [], [
    'actionField' => ['field' => 'staffName', 'value' => null],
]);
check('guest request without a room number still opens the form (FAQ-style generic phrasing)', 'How do I log a guest request, like extra towels or a repair?', 'Staff', null, [], [
    'actionType' => 'open_add_service_request',
]);
check('booking commission question answers confidently instead of falling to the generic summary', 'Do you charge any booking commission?', 'Staff', null, [], [
    'matched' => true,
    'replyContains' => 'ZERO commission',
]);

// ============================================================================================
// Live bug fixes (27 Aug 2026), found by testing a batch of realistic, well-formed English
// questions (user's own suggestion, rather than continuing to find gaps one broken-English
// message at a time) - see the batch script's real output for the full before/after. Several
// full, natural sentences were losing to how_to_use_kds's loose ['how','kitchen'] AND-group
// (any message containing both "how" and "kitchen" ANYWHERE, even as an incidental aside)
// purely because nothing else scored high enough to compete - fixed by giving the CORRECT
// intents real, on-topic phrases rather than narrowing the KDS intent itself.
// ============================================================================================
check('realistic sentence: connect Telegram does not get hijacked by "kitchen orders" aside', "How do I connect Telegram so I get alerts for new bookings and kitchen orders?", 'Admin', null, [], [
    'actionType' => 'open_telegram_modal',
]);
check('realistic sentence: OTA calendar sync reaches Edit Property (ICalSyncManager lives there)', "How do I sync my Airbnb/Booking.com calendar so rooms don't get double-booked?", 'Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_property'],
]);
check('realistic sentence: UPI/QR setup reaches Edit Property', 'How do I set up my UPI ID so guests can pay by scanning a QR code?', 'Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_property'],
]);
check('realistic sentence: multi-key room add correctly reaches Edit Property (RoomsManagement is embedded there, not a bug)', 'How do I add a new room to my multi-key property?', 'Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_property'],
]);

// ============================================================================================
// Live bug fix (27 Aug 2026): extractAddStaffDetails()'s capitalized-word name scan had no
// question-word stopwords, so "How do I add a new staff member and set what they're allowed to
// access?" - a real, correctly-formed question - extracted 'How' as the new staff member's name.
// ============================================================================================
check('question-word "How" is never extracted as a staff name', "How do I add a new staff member and set what they're allowed to access?", 'Admin', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'addStaffName', 'value' => null],
]);

// ============================================================================================
// Live bug fix (27 Aug 2026): "hi" scored 0 against every real intent and fell through to the
// generic capability-summary fallback - not wrong, but reads as ignoring a greeting. Also covers
// the 'matched' flag fix: info-only intents (action:null) must report matched=true, since
// AIChatWidget.tsx's human-escalation counter would otherwise treat a correctly-answered "what's
// the tariff" the same as the bot genuinely not understanding the message.
// ============================================================================================
check('bare hi gets a greeting, not the capability dump', 'hi', 'Staff', null, [], [
    'actionType' => null,
    'matched' => true,
    'replyContains' => 'Ground Code Assistant',
]);
check('hello variant also greets', 'hello', 'Staff', null, [], [
    'matched' => true,
    'replyContains' => 'Ground Code Assistant',
]);
check('good morning AND-group greets', 'good morning!', 'Staff', null, [], [
    'matched' => true,
    'replyContains' => 'Ground Code Assistant',
]);
check('greeting loses to a real request in the same message', 'hi, add booking', 'Staff', null, [], [
    'actionType' => 'open_add_booking',
]);
check('info-only intent (tariff) still reports matched=true', 'what is the room tariff', 'Staff', null, [], [
    'actionType' => null,
    'matched' => true,
]);
check('genuine gibberish still reports matched=false', 'asdkfjqpwoeiruty', 'Staff', null, [], [
    'actionType' => null,
    'matched' => false,
    'replyContains' => 'Ground Code helps you manage',
]);

// ============================================================================================
// Live bug fix (27 Aug 2026): Gemini confidently told a user "no recipe module exists" - it does
// (KitchenManagement.tsx's beta_recipe_builder tab). The offline engine had the same underlying
// mistake: 'add recipe'/'new recipe' were wired to the plain sellable-item form (add_menu_item),
// never to the real ingredient-level Recipe Builder. Moved to their own intent below.
// ============================================================================================
check('recipe intent navigates to Recipe Builder, not the menu item form', 'add recipe', 'Admin', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'itemKey', 'value' => 'beta_recipe_builder'],
]);
check('bare "recipes" also reaches the Recipe Builder', 'how do I manage recipes', 'Admin', null, [], [
    'actionField' => ['field' => 'itemKey', 'value' => 'beta_recipe_builder'],
]);
check('recipe intent is Admin-gated like add_menu_item', 'add recipe', 'Staff', null, [], [
    'actionType' => null,
    'replyContains' => 'Access Denied',
]);
check('add_menu_item regression: non-recipe dish phrasing still works after the move', 'add new dish', 'Admin', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'itemKey', 'value' => 'edit_food_menu'],
]);

// ============================================================================================
// Live bug fix (27 Aug 2026): "how many team members / what are their names" had nothing to
// answer from - live_context never carried staff data, so the bot could only punt to the Staff
// Directory page. Now answers directly from staffCount/staffNames when the frontend provides them.
// ============================================================================================
check('team roster answers directly when staff context is provided', 'how many team members do I have', 'Staff', [
    'staff_count' => 3,
    'staff_names' => ['Arjun Mehta (Manager)', 'Priya Sharma (Chef)', 'Rahul Verma (Front Desk)'],
], [], [
    'actionType' => null,
    'matched' => true,
    'replyContains' => 'Arjun Mehta (Manager)',
]);
check('team roster count-only phrasing also matches', 'how many staff do we have', 'Staff', [
    'staff_count' => 2,
    'staff_names' => ['A (Chef)', 'B (Manager)'],
], [], [
    'replyContains' => 'You have 2 active team members',
]);
check('team roster falls back gracefully with no staff context at all', 'list staff', 'Staff', null, [], [
    'actionType' => 'navigate',
    'actionField' => ['field' => 'itemKey', 'value' => 'staff_directory_salaries'],
]);

echo "Offline Intent Engine + Nav Menu Intents: $pass/" . ($pass + $fail) . " passed\n";
if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
}

exit($fail > 0 ? 1 : 0);
