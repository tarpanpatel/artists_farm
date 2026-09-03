<?php
/**
 * Public, no-login "Shareable Availability & Rates" page.
 *
 * Displays live room availability and calculated rates per night for a given property.
 *
 * Privacy & Security Guard:
 * Structurally NEVER queries or exposes guest names, phone numbers, payment details,
 * or notes. Only returns boolean availability (available / booked / hold) and price.
 *
 * Property resolution mirrors food_menu.php via getCurrentPropertyId($pdo).
 */

require_once __DIR__ . '/php/config/database.php';
require_once __DIR__ . '/php/config/schema_cache.php';
global $pdo;

header('Content-Type: text/html; charset=UTF-8');

try {
    if (!isSchemaVerified('schema_room_rate_rules')) {
        $pdo->exec("ALTER TABLE properties ADD COLUMN IF NOT EXISTS `pricing_mode` VARCHAR(20) DEFAULT 'flat'");
        $pdo->exec("ALTER TABLE properties ADD COLUMN IF NOT EXISTS `default_tariff` DECIMAL(10,2) DEFAULT NULL");
    }
} catch (Exception $e) {}

$propertyId = getCurrentPropertyId($pdo);
$currentProperty = $propertyId > 0 ? getCurrentProperty($pdo, $propertyId) : [];

$propertyName = $currentProperty['name'] ?? 'Artists Farm';
$propertyType = $currentProperty['property_type'] ?? 'SINGLE';
$pricingMode = $currentProperty['pricing_mode'] ?? 'flat';
$baseTariff = (float)($currentProperty['default_tariff'] ?? 0);

// Month selection (defaults to current month)
$selectedYear = isset($_GET['year']) && is_numeric($_GET['year']) ? (int)$_GET['year'] : (int)date('Y');
$selectedMonth = isset($_GET['month']) && is_numeric($_GET['month']) ? (int)$_GET['month'] : (int)date('n');

// Clamp year and month safely
if ($selectedMonth < 1) { $selectedMonth = 12; $selectedYear--; }
if ($selectedMonth > 12) { $selectedMonth = 1; $selectedYear++; }
if ($selectedYear < 2020) $selectedYear = 2020;
if ($selectedYear > 2040) $selectedYear = 2040;

$firstDayTimestamp = mktime(0, 0, 0, $selectedMonth, 1, $selectedYear);
$daysInMonth = (int)date('t', $firstDayTimestamp);
$monthName = date('F Y', $firstDayTimestamp);
$firstDayOfWeek = (int)date('w', $firstDayTimestamp); // 0 = Sunday, 6 = Saturday

$prevMonth = $selectedMonth - 1;
$prevYear = $selectedYear;
if ($prevMonth < 1) { $prevMonth = 12; $prevYear--; }

$nextMonth = $selectedMonth + 1;
$nextYear = $selectedYear;
if ($nextMonth > 12) { $nextMonth = 1; $nextYear++; }

$monthStartStr = sprintf('%04d-%02d-01', $selectedYear, $selectedMonth);
$monthEndStr = sprintf('%04d-%02d-%02d', $selectedYear, $selectedMonth, $daysInMonth);
$todayStr = date('Y-m-d');

// 1. Fetch Rooms if MULTI_KEY
$rooms = [];
$scopeIds = [$propertyId];
if ($propertyId > 0 && $propertyType === 'MULTI_KEY') {
    try {
        $rStmt = $pdo->prepare("SELECT id, name, default_tariff FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_active = 1 ORDER BY room_order ASC, name ASC");
        $rStmt->execute([$propertyId]);
        $rooms = $rStmt->fetchAll();
        foreach ($rooms as $r) {
            $scopeIds[] = (int)$r['id'];
        }
    } catch (Exception $e) {
        $rooms = [];
    }
}
if (empty($rooms)) {
    $rooms = [['id' => $propertyId, 'name' => $propertyName, 'default_tariff' => $baseTariff]];
}

// 2. Fetch Bookings (Privacy-Safe: id, dates, room_id only - NO PII)
$bookedDaysPerRoom = [];
if ($propertyId > 0 && !empty($scopeIds)) {
    try {
        $placeholders = implode(',', array_fill(0, count($scopeIds), '?'));
        $bStmt = $pdo->prepare("
            SELECT id, property_id, room_id, DATE(checkin_date) as c_in, DATE(expected_checkout) as c_out
            FROM guests
            WHERE (property_id IN ($placeholders) OR room_id IN ($placeholders))
            AND status NOT IN ('Cancelled', 'CheckedOut')
            AND checkin_date <= ? AND expected_checkout >= ?
        ");
        $params = array_merge($scopeIds, $scopeIds, [$monthEndStr . ' 23:59:59', $monthStartStr . ' 00:00:00']);
        $bStmt->execute($params);
        $bookings = $bStmt->fetchAll();

        foreach ($bookings as $b) {
            $rId = (int)($b['room_id'] ?: $b['property_id']);
            $cur = strtotime($b['c_in']);
            $end = strtotime($b['c_out']);
            while ($cur < $end) {
                $dStr = date('Y-m-d', $cur);
                $bookedDaysPerRoom[$rId][$dStr] = true;
                $cur = strtotime('+1 day', $cur);
            }
        }
    } catch (Exception $e) {}

    // 3. Fetch Synced iCal OTA Blocks
    try {
        $oStmt = $pdo->prepare("
            SELECT e.event_start, e.event_end, c.property_id as room_id
            FROM ical_synced_events e
            JOIN ical_sync_configs c ON e.sync_config_id = c.id
            WHERE c.property_id IN ($placeholders)
            AND e.sync_status = 'synced'
            AND e.event_start <= ? AND e.event_end >= ?
        ");
        $oParams = array_merge($scopeIds, [$monthEndStr . ' 23:59:59', $monthStartStr . ' 00:00:00']);
        $oStmt->execute($oParams);
        $otaBlocks = $oStmt->fetchAll();

        foreach ($otaBlocks as $ob) {
            $rId = (int)$ob['room_id'];
            $cur = strtotime(substr($ob['event_start'], 0, 10));
            $end = strtotime(substr($ob['event_end'], 0, 10));
            while ($cur < $end) {
                $dStr = date('Y-m-d', $cur);
                $bookedDaysPerRoom[$rId][$dStr] = true;
                $cur = strtotime('+1 day', $cur);
            }
        }
    } catch (Exception $e) {}
}

// 4. Fetch Rate Rules for this period
$rateRulesPerRoom = [];
$stopSellPerRoom = [];
if ($propertyId > 0 && !empty($scopeIds)) {
    try {
        if (!isSchemaVerified('schema_room_rate_rules')) {
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `room_rate_rules` (
                    `id` INT AUTO_INCREMENT PRIMARY KEY,
                    `property_id` INT NOT NULL,
                    `room_id` INT NULL,
                    `start_date` DATE NOT NULL,
                    `end_date` DATE NOT NULL,
                    `rate_per_night` DECIMAL(10,2) NOT NULL,
                    `rule_name` VARCHAR(100) NULL,
                    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_rate_rule_prop_room_dates` (`property_id`, `room_id`, `start_date`, `end_date`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            ");
            markSchemaVerified('schema_room_rate_rules');
        }

        // stop_sell (and the min/max-stay and closed-to-arrival/departure
        // restrictions alongside it) is selected here (30 Aug 2026): a night
        // the owner has closed for sale must not be advertised as bookable on
        // this public page. Without this the page would happily invite an
        // enquiry for a date the property has deliberately shut - worse than
        // showing nothing, because the guest has already formed an
        // expectation. This whole block is wrapped in the try/catch below, so
        // an install where room_rate_rules doesn't yet have these columns
        // (added by rate_rules.php's own self-heal, not this file's) just
        // falls back to no restrictions shown rather than erroring the page.
        $stmt = $pdo->prepare("
            SELECT room_id, start_date, end_date, rate_per_night, stop_sell,
                   min_stay_arrival, min_stay_through, max_stay, closed_to_arrival, closed_to_departure
            FROM room_rate_rules
            WHERE (property_id IN ($placeholders) OR room_id IN ($placeholders))
            AND start_date <= ? AND end_date >= ?
            ORDER BY room_id DESC, created_at DESC
        ");
        $stmt->execute(array_merge($scopeIds, $scopeIds, [$monthEndStr, $monthStartStr]));
        $rateRules = $stmt->fetchAll();

        $restrictionsPerRoom = [];
        foreach ($rateRules as $rr) {
            $rId = $rr['room_id'] !== null ? (int)$rr['room_id'] : 0;
            $cur = strtotime($rr['start_date']);
            $end = strtotime($rr['end_date']);
            $isStopSell = !empty($rr['stop_sell']);
            while ($cur <= $end) {
                $dStr = date('Y-m-d', $cur);
                // A rate rule may now carry only restrictions and no rate at
                // all, so guard the null rather than casting it to 0.00 and
                // publishing a free night.
                if (!isset($rateRulesPerRoom[$rId][$dStr]) && $rr['rate_per_night'] !== null) {
                    $rateRulesPerRoom[$rId][$dStr] = (float)$rr['rate_per_night'];
                }
                if (!isset($restrictionsPerRoom[$rId][$dStr])) {
                    $restrictionsPerRoom[$rId][$dStr] = [
                        'min_stay_arrival' => $rr['min_stay_arrival'] ? (int)$rr['min_stay_arrival'] : null,
                        'min_stay_through' => $rr['min_stay_through'] ? (int)$rr['min_stay_through'] : null,
                        'max_stay' => $rr['max_stay'] ? (int)$rr['max_stay'] : null,
                        'closed_to_arrival' => !empty($rr['closed_to_arrival']),
                        'closed_to_departure' => !empty($rr['closed_to_departure']),
                    ];
                }
                if ($isStopSell) {
                    // Recorded both ways: $stopSellPerRoom feeds isStopSell()
                    // below (its own [0]-index fallback already covers a
                    // property-wide rule for every room), and fanning the
                    // same property-wide rule out across $bookedDaysPerRoom
                    // here too means callers that only ever check
                    // $bookedDaysPerRoom directly (skipping isStopSell()) see
                    // the same correct result either way.
                    $stopSellPerRoom[$rId][$dStr] = true;
                    if ($rId === 0) {
                        foreach ($scopeIds as $sId) {
                            $bookedDaysPerRoom[$sId][$dStr] = true;
                        }
                    } else {
                        $bookedDaysPerRoom[$rId][$dStr] = true;
                    }
                }
                $cur = strtotime('+1 day', $cur);
            }
        }
    } catch (Exception $e) {}
}

// A night the owner has closed for sale must never be advertised as bookable
// here (30 Aug 2026). Room-specific rules win over a property-wide rule, same
// precedence getDailyRate() already uses.
if (!function_exists('isStopSell')) {
    function isStopSell($roomId, $dateStr, $stopSellPerRoom) {
        return !empty($stopSellPerRoom[$roomId][$dateStr]) || !empty($stopSellPerRoom[0][$dateStr]);
    }
}

// Helper to compute live rate for a room on a given day
if (!function_exists('getDailyRate')) {
    function getDailyRate($roomId, $dateStr, $defaultTariff, $pricingMode, $rateRulesPerRoom, $baseTariff) {
        if ($pricingMode === 'variable') {
            if (isset($rateRulesPerRoom[$roomId][$dateStr])) {
                return $rateRulesPerRoom[$roomId][$dateStr];
            }
            if (isset($rateRulesPerRoom[0][$dateStr])) {
                return $rateRulesPerRoom[0][$dateStr];
            }
        }
        return $defaultTariff > 0 ? $defaultTariff : ($baseTariff > 0 ? $baseTariff : 0);
    }
}

// Helper to get active stay restrictions for a room on a given day
if (!function_exists('getDailyRestrictions')) {
    function getDailyRestrictions($roomId, $dateStr, $restrictionsPerRoom) {
        if (isset($restrictionsPerRoom[$roomId][$dateStr])) {
            return $restrictionsPerRoom[$roomId][$dateStr];
        }
        if (isset($restrictionsPerRoom[0][$dateStr])) {
            return $restrictionsPerRoom[0][$dateStr];
        }
        return [
            'min_stay_arrival' => null,
            'min_stay_through' => null,
            'max_stay' => null,
            'closed_to_arrival' => false,
            'closed_to_departure' => false,
        ];
    }
}

$currencyCode = strtoupper($currentProperty['currency'] ?? 'INR');
$currencySymbols = ['INR' => '₹', 'USD' => '$', 'EUR' => '€', 'GBP' => '£', 'AED' => 'AED '];
$currencySym = $currencySymbols[$currencyCode] ?? ($currencyCode . ' ');
$slugParam = isset($_GET['property_slug']) ? '&property_slug=' . urlencode($_GET['property_slug']) : '';
?>
<!DOCTYPE html>
<html lang="en" class="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Availability & Rates - <?= htmlspecialchars($propertyName) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-page: #f8fafc;
            --bg-card: #ffffff;
            --text-main: #0f172a;
            --text-muted: #64748b;
            --border-color: #e2e8f0;
            --primary: #0284c7;
            --primary-dark: #0369a1;
            --available-bg: #f0fdf4;
            --available-border: #bbf7d0;
            --available-text: #15803d;
            --booked-bg: #fef2f2;
            --booked-border: #fecaca;
            --booked-text: #b91c1c;
            --past-bg: #f1f5f9;
            --past-text: #94a3b8;
            --font-heading: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
            --font-body: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-page: #0f172a;
                --bg-card: #1e293b;
                --text-main: #f8fafc;
                --text-muted: #94a3b8;
                --border-color: #334155;
                --available-bg: rgba(22, 101, 52, 0.2);
                --available-border: #166534;
                --available-text: #4ade80;
                --booked-bg: rgba(153, 27, 27, 0.2);
                --booked-border: #991b1b;
                --booked-text: #f87171;
                --past-bg: #1e293b;
                --past-text: #475569;
            }
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background-color: var(--bg-page);
            color: var(--text-main);
            font-family: var(--font-body);
            min-height: 100vh;
            padding: 1.5rem 1rem 3rem 1rem;
            line-height: 1.5;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 2rem; }
        h1 { font-family: var(--font-heading); font-size: 1.75rem; font-weight: 800; color: var(--text-main); margin-bottom: 0.25rem; }
        .subtitle { font-size: 0.875rem; color: var(--text-muted); font-weight: 500; }

        .nav-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            padding: 0.75rem 1.25rem;
            border-radius: 0.75rem;
            margin-bottom: 1.5rem;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .nav-title { font-family: var(--font-heading); font-size: 1.125rem; font-weight: 700; }
        .nav-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            background: var(--bg-page);
            border: 1px solid var(--border-color);
            color: var(--text-main);
            padding: 0.5rem 0.875rem;
            border-radius: 0.5rem;
            font-size: 0.8125rem;
            font-weight: 600;
            text-decoration: none;
            cursor: pointer;
            transition: all 0.15s ease;
        }
        .nav-btn:hover { background: var(--primary); color: #fff; border-color: var(--primary); }

        .legend {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 1.5rem;
            margin-bottom: 1.5rem;
            font-size: 0.75rem;
            font-weight: 600;
        }
        .legend-item { display: flex; align-items: center; gap: 0.375rem; }
        .legend-dot { width: 0.75rem; height: 0.75rem; border-radius: 0.25rem; }

        /* Calendar Grid */
        .calendar-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 0.875rem;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            margin-bottom: 2rem;
        }
        .calendar-header {
            padding: 1rem 1.25rem;
            border-bottom: 1px solid var(--border-color);
            font-weight: 700;
            font-size: 0.9375rem;
        }

        .single-grid {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            gap: 1px;
            background: var(--border-color);
        }
        .day-label {
            background: var(--bg-card);
            text-align: center;
            font-size: 0.6875rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 0.625rem 0.25rem;
            color: var(--text-muted);
        }
        .day-cell {
            background: var(--bg-card);
            min-height: 5.5rem;
            padding: 0.5rem;
            display: flex;
            flex-col;
            flex-direction: column;
            justify-content: space-between;
        }
        .day-num { font-size: 0.75rem; font-weight: 700; }
        .day-status-pill {
            display: block;
            border-radius: 0.375rem;
            padding: 0.25rem 0.375rem;
            font-size: 0.6875rem;
            font-weight: 700;
            text-align: center;
            border: 1px solid transparent;
            margin-top: 0.25rem;
        }
        .day-status-pill.available { background: var(--available-bg); border-color: var(--available-border); color: var(--available-text); }
        .day-status-pill.booked { background: var(--booked-bg); border-color: var(--booked-border); color: var(--booked-text); }
        .day-status-pill.past { background: var(--past-bg); color: var(--past-text); }

        .price-tag { font-size: 0.6875rem; font-weight: 700; color: var(--text-main); margin-top: auto; }

        .restriction-badge {
            display: inline-block;
            font-size: 0.5625rem;
            font-weight: 700;
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            margin-top: 0.125rem;
            line-height: 1.1;
            text-align: center;
        }
        .restriction-badge.cta { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
        .restriction-badge.ctd { background: #ffedd5; color: #9a3412; border: 1px solid #fed7aa; }
        .restriction-badge.min-stay { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

        /* Multicalendar Grid */
        .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .multical-table { width: 100%; border-collapse: collapse; min-width: 850px; }
        .multical-table th, .multical-table td {
            border: 1px solid var(--border-color);
            padding: 0.5rem 0.375rem;
            text-align: center;
            font-size: 0.6875rem;
        }
        .multical-table th { background: var(--bg-page); color: var(--text-muted); font-weight: 700; }
        .multical-room-name {
            text-align: left !important;
            font-weight: 700;
            padding-left: 1rem !important;
            min-width: 140px;
            background: var(--bg-card);
            color: var(--text-main);
            font-size: 0.8125rem !important;
            position: sticky;
            left: 0;
            z-index: 2;
            box-shadow: 2px 0 4px rgba(0,0,0,0.02);
        }
        .multical-cell { min-width: 32px; height: 48px; }
        .multical-cell.available { background: var(--available-bg); color: var(--available-text); font-weight: 700; }
        .multical-cell.booked { background: var(--booked-bg); color: var(--booked-text); font-weight: 600; }
        .multical-cell.past { background: var(--past-bg); color: var(--past-text); }

        footer { text-align: center; margin-top: 3rem; font-size: 0.75rem; color: var(--text-muted); }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><?= htmlspecialchars($propertyName) ?></h1>
            <p class="subtitle">Live Room Availability & Nightly Rates</p>
        </header>

        <div class="nav-bar">
            <a href="?month=<?= $prevMonth ?>&year=<?= $prevYear ?><?= $slugParam ?>" class="nav-btn">‹ Previous</a>
            <span class="nav-title"><?= htmlspecialchars($monthName) ?></span>
            <a href="?month=<?= $nextMonth ?>&year=<?= $nextYear ?><?= $slugParam ?>" class="nav-btn">Next ›</a>
        </div>

        <div class="legend">
            <div class="legend-item">
                <span class="legend-dot" style="background: #22c55e;"></span>
                <span>Available</span>
            </div>
            <div class="legend-item">
                <span class="legend-dot" style="background: #ef4444;"></span>
                <span>Booked / Closed</span>
            </div>
            <div class="legend-item">
                <span class="legend-dot" style="background: #94a3b8;"></span>
                <span>Past Date</span>
            </div>
        </div>

        <?php if ($propertyType === 'MULTI_KEY' && count($rooms) > 1): ?>
            <!-- Multi-Room Multicalendar View -->
            <div class="calendar-card">
                <div class="table-responsive">
                    <table class="multical-table">
                        <thead>
                            <tr>
                                <th class="multical-room-name">Room</th>
                                <?php for ($d = 1; $d <= $daysInMonth; $d++): ?>
                                    <?php
                                    $dStr = sprintf('%04d-%02d-%02d', $selectedYear, $selectedMonth, $d);
                                    $dayName = date('D', strtotime($dStr));
                                    $isToday = $dStr === $todayStr;
                                    ?>
                                    <th style="<?= $isToday ? 'background: rgba(2, 132, 199, 0.15); color: #0284c7;' : '' ?>">
                                        <div><?= $dayName[0] ?></div>
                                        <div style="font-weight: 800; font-size: 0.75rem;"><?= $d ?></div>
                                    </th>
                                <?php endfor; ?>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($rooms as $room): ?>
                                <?php $rId = (int)$room['id']; $rTariff = (float)($room['default_tariff'] ?? 0); ?>
                                <tr>
                                    <td class="multical-room-name">
                                        <div><?= htmlspecialchars($room['name']) ?></div>
                                        <?php if ($rTariff > 0): ?>
                                            <div style="font-size: 0.6875rem; color: var(--text-muted); font-weight: normal;">Base: <?= $currencySym ?><?= number_format($rTariff) ?></div>
                                        <?php endif; ?>
                                    </td>
                                    <?php for ($d = 1; $d <= $daysInMonth; $d++): ?>
                                        <?php
                                        $dStr = sprintf('%04d-%02d-%02d', $selectedYear, $selectedMonth, $d);
                                        $isPast = $dStr < $todayStr;
                                        // A stop-sell night is presented exactly like a booked one:
                                        // unavailable, no rate shown. Deliberately NOT a distinct
                                        // "closed" state - this is a public page, and why a night
                                        // is unavailable is the owner's business, not the guest's.
                                        $isBooked = !empty($bookedDaysPerRoom[$rId][$dStr]) || isStopSell($rId, $dStr, $stopSellPerRoom);
                                        $rate = getDailyRate($rId, $dStr, $rTariff, $pricingMode, $rateRulesPerRoom, $baseTariff);
                                        $restrictions = getDailyRestrictions($rId, $dStr, $restrictionsPerRoom);
                                        $cellClass = $isPast ? 'past' : ($isBooked ? 'booked' : 'available');
                                        ?>
                                        <td class="multical-cell <?= $cellClass ?>">
                                            <?php if ($isPast): ?>
                                                <span style="opacity: 0.6;">-</span>
                                            <?php elseif ($isBooked): ?>
                                                <span>✕</span>
                                            <?php else: ?>
                                                <div>✓</div>
                                                <?php if ($rate > 0): ?>
                                                    <div style="font-size: 0.5625rem; opacity: 0.9;"><?= $currencySym ?><?= round($rate) ?></div>
                                                <?php endif; ?>
                                                <?php if (!empty($restrictions['closed_to_arrival'])): ?>
                                                    <div class="restriction-badge cta" title="Closed to Arrival">CTA</div>
                                                <?php elseif (!empty($restrictions['min_stay_arrival']) && $restrictions['min_stay_arrival'] > 1): ?>
                                                    <div class="restriction-badge min-stay" title="Minimum <?= $restrictions['min_stay_arrival'] ?> Nights"><?= $restrictions['min_stay_arrival'] ?>N</div>
                                                <?php endif; ?>
                                            <?php endif; ?>
                                        </td>
                                    <?php endfor; ?>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        <?php else: ?>
            <!-- Single Property / Room Calendar Grid View -->
            <?php foreach ($rooms as $room): ?>
                <?php $rId = (int)$room['id']; $rTariff = (float)($room['default_tariff'] ?? 0); ?>
                <div class="calendar-card">
                    <?php if (count($rooms) > 1): ?>
                        <div class="calendar-header"><?= htmlspecialchars($room['name']) ?></div>
                    <?php endif; ?>
                    <div class="single-grid">
                        <div class="day-label">Sun</div>
                        <div class="day-label">Mon</div>
                        <div class="day-label">Tue</div>
                        <div class="day-label">Wed</div>
                        <div class="day-label">Thu</div>
                        <div class="day-label">Fri</div>
                        <div class="day-label">Sat</div>

                        <?php for ($p = 0; $p < $firstDayOfWeek; $p++): ?>
                            <div class="day-cell" style="background: var(--bg-page); opacity: 0.4;"></div>
                        <?php endfor; ?>

                        <?php for ($d = 1; $d <= $daysInMonth; $d++): ?>
                            <?php
                            $dStr = sprintf('%04d-%02d-%02d', $selectedYear, $selectedMonth, $d);
                            $isPast = $dStr < $todayStr;
                            // See the multicalendar branch above: a stop-sell night reads
                            // as unavailable here too, with no rate advertised.
                            $isBooked = !empty($bookedDaysPerRoom[$rId][$dStr]) || isStopSell($rId, $dStr, $stopSellPerRoom);
                            $rate = getDailyRate($rId, $dStr, $rTariff, $pricingMode, $rateRulesPerRoom, $baseTariff);
                            $restrictions = getDailyRestrictions($rId, $dStr, $restrictionsPerRoom);
                            ?>
                            <div class="day-cell">
                                <span class="day-num" style="<?= $dStr === $todayStr ? 'color: var(--primary); font-weight: 800;' : '' ?>"><?= $d ?></span>
                                <?php if ($isPast): ?>
                                    <span class="day-status-pill past">Past</span>
                                <?php elseif ($isBooked): ?>
                                    <span class="day-status-pill booked">Booked</span>
                                <?php else: ?>
                                    <span class="day-status-pill available">Available</span>
                                    <?php if ($rate > 0): ?>
                                        <span class="price-tag"><?= $currencySym ?><?= number_format($rate) ?></span>
                                    <?php endif; ?>
                                    <?php if (!empty($restrictions['closed_to_arrival'])): ?>
                                        <span class="restriction-badge cta" title="Closed to arrival (no check-in)">No Check-in</span>
                                    <?php endif; ?>
                                    <?php if (!empty($restrictions['closed_to_departure'])): ?>
                                        <span class="restriction-badge ctd" title="Closed to departure (no check-out)">No Check-out</span>
                                    <?php endif; ?>
                                    <?php if (!empty($restrictions['min_stay_arrival']) && $restrictions['min_stay_arrival'] > 1): ?>
                                        <span class="restriction-badge min-stay" title="Minimum stay <?= $restrictions['min_stay_arrival'] ?> nights">Min <?= $restrictions['min_stay_arrival'] ?> Nights</span>
                                    <?php elseif (!empty($restrictions['min_stay_through']) && $restrictions['min_stay_through'] > 1): ?>
                                        <span class="restriction-badge min-stay" title="Minimum stay <?= $restrictions['min_stay_through'] ?> nights">Min <?= $restrictions['min_stay_through'] ?> Nights</span>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </div>
                        <?php endfor; ?>
                    </div>
                </div>
            <?php endforeach; ?>
        <?php endif; ?>

        <footer>
            <p>Direct bookings & inquiries: Contact Front Desk</p>
            <p style="margin-top: 0.25rem;">Powered by Artists Farm Hospitality SaaS</p>
        </footer>
    </div>
</body>
</html>
