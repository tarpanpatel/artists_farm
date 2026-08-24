<?php
/**
 * Offline Intent Engine test suite.
 *
 * Runs entirely against an in-memory SQLite database (not the real MySQL
 * schema) so it can execute anywhere with `php php/tests/test_ai_intents.php`
 * without needing a live server - it only exercises ai_match_offline_intent(),
 * which only ever runs plain SELECTs against expense_item_prices /
 * nav_menu_items.
 *
 * Usage: php php/tests/test_ai_intents.php
 */

require_once __DIR__ . '/../ai/offline_intent_engine.php';
require_once __DIR__ . '/../ai/nav_menu_intents.php';

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

$pdo->exec("CREATE TABLE expense_item_prices (item_name TEXT PRIMARY KEY, last_price REAL)");
$seedPrices = [
    'Air Freshener' => 45,
    'Diesel' => 92,
    'Candles' => 20,
    'Napkins' => 60,
];
$stmt = $pdo->prepare("INSERT INTO expense_item_prices (item_name, last_price) VALUES (?, ?)");
foreach ($seedPrices as $name => $price) {
    $stmt->execute([$name, $price]);
}

$pdo->exec("CREATE TABLE nav_menu_items (title TEXT, tab_key TEXT, unique_key TEXT, is_visible INTEGER)");
$seedNav = [
    ['Dashboard', 'dashboard', 'dashboard'],
    ['Guest Registration', 'guests', 'guest_registration'],
    ['Billing & Checkout', 'guests', 'billing_checkout'],
    ['Kitchen Orders', 'kitchen', 'kitchen_orders'],
    ['Expenses', 'petty_cash', 'expenses'],
    ['Cash Drawer', 'petty_cash', 'cash_drawer'],
    ['Attendance Calendar', 'staff', 'attendance_calendar'],
    ['Stock Requests', 'inventory', 'stock_requests'],
    ['Dashboard Analytics', 'analytics', 'dashboard_analytics'],
];
$stmt = $pdo->prepare("INSERT INTO nav_menu_items (title, tab_key, unique_key, is_visible) VALUES (?, ?, ?, 1)");
foreach ($seedNav as $row) {
    $stmt->execute($row);
}

$navIntents = ai_build_nav_intents($pdo);

/**
 * @var array<int, array{
 *   message: string,
 *   expectIntent: ?string,
 *   expectItem?: string,
 *   expectQty?: float,
 *   expectAmount?: float,
 *   expectUnitPrice?: float,
 *   expectLabel?: string,
 *   pending?: array,
 * }>
 */
$cases = [];

// --- log_expense: verb + quantity + item, price resolved from history ---
$cases[] = ['message' => 'Buy 2 air freshers', 'expectIntent' => 'log_expense', 'expectItem' => 'air freshener', 'expectQty' => 2, 'expectUnitPrice' => 45, 'expectAmount' => 90];
$cases[] = ['message' => 'buy 2 air fresheners', 'expectIntent' => 'log_expense', 'expectItem' => 'air fresheners', 'expectQty' => 2];
$cases[] = ['message' => 'Buy 1 air fresher', 'expectIntent' => 'log_expense', 'expectItem' => 'air freshener', 'expectQty' => 1, 'expectUnitPrice' => 45];
$cases[] = ['message' => 'Bought 3 diesel', 'expectIntent' => 'log_expense', 'expectItem' => 'diesel', 'expectQty' => 3, 'expectUnitPrice' => 92, 'expectAmount' => 276];
$cases[] = ['message' => 'Purchase diesel', 'expectIntent' => 'log_expense', 'expectItem' => 'diesel', 'expectQty' => 1, 'expectUnitPrice' => 92];
$cases[] = ['message' => 'purchased 5 candles', 'expectIntent' => 'log_expense', 'expectItem' => 'candles', 'expectQty' => 5, 'expectUnitPrice' => 20, 'expectAmount' => 100];
$cases[] = ['message' => 'Order 2 napkins', 'expectIntent' => 'log_expense', 'expectItem' => 'napkins', 'expectQty' => 2, 'expectUnitPrice' => 60];
$cases[] = ['message' => 'ordered 10 matchboxes', 'expectIntent' => 'log_expense', 'expectItem' => 'matchbox', 'expectQty' => 10];
$cases[] = ['message' => 'Get 4 bulbs', 'expectIntent' => 'log_expense', 'expectItem' => 'bulbs', 'expectQty' => 4];
$cases[] = ['message' => 'got 6 spoons', 'expectIntent' => 'log_expense', 'expectItem' => 'spoons', 'expectQty' => 6];
$cases[] = ['message' => 'please buy 2 mops', 'expectIntent' => 'log_expense', 'expectItem' => 'mops', 'expectQty' => 2];

// --- log_expense: explicit price given inline (keyword or currency symbol) ---
$cases[] = ['message' => 'Buy 2 air freshers for 100', 'expectIntent' => 'log_expense', 'expectItem' => 'air freshener', 'expectQty' => 2, 'expectAmount' => 100, 'expectUnitPrice' => 50];
$cases[] = ['message' => 'Buy 3 candles at 15', 'expectIntent' => 'log_expense', 'expectItem' => 'candles', 'expectQty' => 3, 'expectAmount' => 15, 'expectUnitPrice' => 5];
$cases[] = ['message' => 'Buy candles worth 200', 'expectIntent' => 'log_expense', 'expectItem' => 'candles', 'expectQty' => 1, 'expectAmount' => 200];
$cases[] = ['message' => 'Purchase diesel for ₹500', 'expectIntent' => 'log_expense', 'expectItem' => 'diesel', 'expectQty' => 1, 'expectAmount' => 500];
$cases[] = ['message' => 'buy napkins at ₹80', 'expectIntent' => 'log_expense', 'expectItem' => 'napkins', 'expectQty' => 1, 'expectAmount' => 80];
$cases[] = ['message' => 'Buy 2 packets of tea for rs 90', 'expectIntent' => 'log_expense', 'expectItem' => 'packets of tea', 'expectQty' => 2, 'expectAmount' => 90];
$cases[] = ['message' => 'get 5kg rice for 400', 'expectIntent' => 'log_expense', 'expectItem' => '5kg rice', 'expectQty' => 1, 'expectAmount' => 400];
$cases[] = ['message' => 'Buy soap 60', 'expectIntent' => 'log_expense', 'expectItem' => 'soap', 'expectQty' => 1, 'expectAmount' => 60];
$cases[] = ['message' => 'Buy 4 buckets 320', 'expectIntent' => 'log_expense', 'expectItem' => 'buckets', 'expectQty' => 4, 'expectAmount' => 320, 'expectUnitPrice' => 80];

// --- log_expense: "log/record/add expense" phrasing ---
$cases[] = ['message' => 'log expense for candles 300', 'expectIntent' => 'log_expense', 'expectItem' => 'candles', 'expectQty' => 1, 'expectAmount' => 300];
$cases[] = ['message' => 'log an expense for diesel: 450', 'expectIntent' => 'log_expense', 'expectItem' => 'diesel', 'expectAmount' => 450];
$cases[] = ['message' => 'record expense for plumber visit at 500', 'expectIntent' => 'log_expense', 'expectItem' => 'plumber visit', 'expectAmount' => 500];
$cases[] = ['message' => 'add expense: generator fuel 250', 'expectIntent' => 'log_expense', 'expectItem' => 'generator fuel', 'expectAmount' => 250];

// --- log_expense: pending follow-up turn (bot asked for a price, user replies a number) ---
$cases[] = ['message' => '80', 'pending' => ['intent' => 'log_expense', 'params' => ['item' => 'incense sticks', 'quantity' => 2]], 'expectIntent' => 'log_expense', 'expectItem' => 'incense sticks', 'expectQty' => 2, 'expectUnitPrice' => 80, 'expectAmount' => 160];
$cases[] = ['message' => 'rs 30', 'pending' => ['intent' => 'log_expense', 'params' => ['item' => 'matchbox', 'quantity' => 5]], 'expectIntent' => 'log_expense', 'expectQty' => 5, 'expectUnitPrice' => 30];
$cases[] = ['message' => '₹15 each', 'pending' => ['intent' => 'log_expense', 'params' => ['item' => 'candles', 'quantity' => 10]], 'expectIntent' => 'log_expense', 'expectUnitPrice' => 15];

$cases[] = ['message' => 'Buy 2 gas cylinders for 1800', 'expectIntent' => 'log_expense', 'expectItem' => 'gas cylinders', 'expectQty' => 2, 'expectAmount' => 1800, 'expectUnitPrice' => 900];
$cases[] = ['message' => 'record expense for taxi fare 250', 'expectIntent' => 'log_expense', 'expectItem' => 'taxi fare', 'expectAmount' => 250];
$cases[] = ['message' => 'Log Expense: paint 700', 'expectIntent' => 'log_expense', 'expectItem' => 'paint', 'expectAmount' => 700];

// --- add_booking ---
$cases[] = ['message' => 'add a new booking', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'create a booking for tomorrow', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'new guest checkin', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'make a reservation', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'start a new guest registration', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'book a villa for the weekend', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'book a room for 2 nights', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'I want to check in a new guest', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'add booking', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'create new reservation for Villa 3', 'expectIntent' => 'add_booking'];
$cases[] = ['message' => 'ADD BOOKING FOR VILLA 5', 'expectIntent' => 'add_booking'];

// --- checkout ---
$cases[] = ['message' => 'checkout guest in villa 2', 'expectIntent' => 'checkout'];
$cases[] = ['message' => 'check out room 5', 'expectIntent' => 'checkout'];
$cases[] = ['message' => 'I need to check-out the Jain group', 'expectIntent' => 'checkout'];
$cases[] = ['message' => 'checkout', 'expectIntent' => 'checkout'];
$cases[] = ['message' => 'process checkout for villa 101', 'expectIntent' => 'checkout'];

// --- kitchen / KDS ---
$cases[] = ['message' => 'open KDS', 'expectIntent' => 'navigate', 'expectLabel' => 'Kitchen Orders'];
$cases[] = ['message' => 'show kitchen orders', 'expectIntent' => 'navigate', 'expectLabel' => 'Kitchen Orders'];
$cases[] = ['message' => 'kds', 'expectIntent' => 'navigate', 'expectLabel' => 'Kitchen Orders'];
$cases[] = ['message' => 'go to kitchen order screen', 'expectIntent' => 'navigate', 'expectLabel' => 'Kitchen Orders'];
$cases[] = ['message' => 'kitchen display', 'expectIntent' => 'navigate', 'expectLabel' => 'Kitchen Orders'];

// --- status / summary ---
$cases[] = ['message' => 'how many bookings today', 'expectIntent' => 'status'];
$cases[] = ['message' => 'booking summary', 'expectIntent' => 'status'];
$cases[] = ["message" => "what's today's bookings", 'expectIntent' => 'status'];
$cases[] = ['message' => 'give me a booking overview', 'expectIntent' => 'status'];
$cases[] = ['message' => 'booking status', 'expectIntent' => 'status'];

// --- navigate: dynamic nav-menu-driven ---
$cases[] = ['message' => 'go to expenses', 'expectIntent' => 'navigate', 'expectLabel' => 'Expenses'];
$cases[] = ['message' => 'open dashboard', 'expectIntent' => 'navigate', 'expectLabel' => 'Dashboard'];
$cases[] = ['message' => 'show me the cash drawer', 'expectIntent' => 'navigate', 'expectLabel' => 'Cash Drawer'];
$cases[] = ['message' => 'take me to attendance calendar', 'expectIntent' => 'navigate', 'expectLabel' => 'Attendance Calendar'];
$cases[] = ['message' => 'navigate to guest registration', 'expectIntent' => 'navigate', 'expectLabel' => 'Guest Registration'];
$cases[] = ['message' => 'open stock requests', 'expectIntent' => 'navigate', 'expectLabel' => 'Stock Requests'];
$cases[] = ['message' => 'go to dashboard analytics', 'expectIntent' => 'navigate', 'expectLabel' => 'Dashboard Analytics'];
$cases[] = ['message' => 'open billing and checkout', 'expectIntent' => 'navigate', 'expectLabel' => 'Billing & Checkout'];
$cases[] = ['message' => 'Go To Expenses', 'expectIntent' => 'navigate', 'expectLabel' => 'Expenses'];
$cases[] = ['message' => 'open cash drawer', 'expectIntent' => 'navigate', 'expectLabel' => 'Cash Drawer'];
$cases[] = ['message' => 'go to guest registration screen', 'expectIntent' => 'navigate', 'expectLabel' => 'Guest Registration'];

// --- greeting ---
$cases[] = ['message' => 'hi', 'expectIntent' => 'greeting'];
$cases[] = ['message' => 'hello there', 'expectIntent' => 'greeting'];
$cases[] = ['message' => 'hey', 'expectIntent' => 'greeting'];
$cases[] = ['message' => 'good morning', 'expectIntent' => 'greeting'];
$cases[] = ['message' => 'Good Evening', 'expectIntent' => 'greeting'];

// --- help ---
$cases[] = ['message' => 'help', 'expectIntent' => 'help'];
$cases[] = ['message' => 'what can you do', 'expectIntent' => 'help'];
$cases[] = ['message' => 'show me options', 'expectIntent' => 'help'];
$cases[] = ['message' => 'list commands', 'expectIntent' => 'help'];
$cases[] = ['message' => 'What can you help me with?', 'expectIntent' => 'help'];

// --- unmatched: offline engine should not force a false-positive match ---
$cases[] = ['message' => "what's the weather today", 'expectIntent' => null];
$cases[] = ['message' => 'tell me a joke', 'expectIntent' => null];
$cases[] = ['message' => 'asdkjqwe iuqweiquwe', 'expectIntent' => null];
$cases[] = ['message' => 'why is the sky blue', 'expectIntent' => null];
$cases[] = ['message' => '', 'expectIntent' => null];
$cases[] = ['message' => 'thanks!', 'expectIntent' => null];
$cases[] = ['message' => 'yo', 'expectIntent' => null];
$cases[] = ['message' => 'thank you so much', 'expectIntent' => null];

$pass = 0;
$fail = 0;
$failures = [];

foreach ($cases as $i => $case) {
    $result = ai_match_offline_intent($case['message'], $navIntents, $pdo, $case['pending'] ?? null);
    $ok = true;
    $reason = '';

    $gotIntent = $result['intent'] ?? null;
    if ($gotIntent !== $case['expectIntent']) {
        $ok = false;
        $reason = "intent: expected " . var_export($case['expectIntent'], true) . ", got " . var_export($gotIntent, true);
    }

    if ($ok && isset($case['expectItem']) && ($result['params']['item'] ?? null) !== $case['expectItem']) {
        $ok = false;
        $reason = "item: expected '{$case['expectItem']}', got '" . ($result['params']['item'] ?? 'null') . "'";
    }
    if ($ok && isset($case['expectQty']) && (float) ($result['params']['quantity'] ?? null) !== (float) $case['expectQty']) {
        $ok = false;
        $reason = "quantity: expected {$case['expectQty']}, got " . ($result['params']['quantity'] ?? 'null');
    }
    if ($ok && isset($case['expectAmount']) && (float) ($result['params']['amount'] ?? null) !== (float) $case['expectAmount']) {
        $ok = false;
        $reason = "amount: expected {$case['expectAmount']}, got " . ($result['params']['amount'] ?? 'null');
    }
    if ($ok && isset($case['expectUnitPrice']) && (float) ($result['params']['unitPrice'] ?? null) !== (float) $case['expectUnitPrice']) {
        $ok = false;
        $reason = "unitPrice: expected {$case['expectUnitPrice']}, got " . ($result['params']['unitPrice'] ?? 'null');
    }
    if ($ok && isset($case['expectLabel']) && ($result['label'] ?? null) !== $case['expectLabel']) {
        $ok = false;
        $reason = "label: expected '{$case['expectLabel']}', got '" . ($result['label'] ?? 'null') . "'";
    }

    if ($ok) {
        $pass++;
    } else {
        $fail++;
        $failures[] = sprintf("#%d \"%s\" -> %s", $i + 1, $case['message'], $reason);
    }
}

echo "Offline Intent Engine: $pass/" . count($cases) . " passed\n";
if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
}

exit($fail > 0 ? 1 : 0);
