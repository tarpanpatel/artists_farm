<?php
/**
 * ONE-OFF: pull current PriceLabs prices into Ground Code rate rules.
 *
 * Not wired into anything. Run once, then delete this file.
 *
 *   CLI :  php scratch/pull_pricelabs_once.php <PRICELABS_API_KEY> [--days=365] [--apply]
 *   Web :  /scratch/pull_pricelabs_once.php?key=<PRICELABS_API_KEY>&days=365&apply=1
 *
 * Without --apply / apply=1 it is a DRY RUN - it shows exactly what it would
 * write and changes nothing. Re-running with --apply is safe (it replaces the
 * rows it made last time, marked rule_name = 'PriceLabs').
 *
 * How the mapping works: every PriceLabs listing whose pms is "channex" has an
 * id shaped "<channex_property_uuid>___<channex_room_type_uuid>". We match the
 * room-type half against channex_mappings.channex_room_type_id to find the local
 * property_id / room_id, then write one 1-night room_rate_rules row per date
 * from PriceLabs' `price` field (the value it actually pushes to the channel).
 * The touched properties/rooms are also flipped to pricing_mode = 'variable' so
 * the calendar and rate lookups actually use the rules.
 *
 * This does NOT push anything to Channex - PriceLabs already did that. It only
 * makes Ground Code show the same numbers.
 */

$IS_CLI = (PHP_SAPI === 'cli');

// ---- args -------------------------------------------------------------------
if ($IS_CLI) {
    $apiKey = $argv[1] ?? '';
    $days   = 365;
    $apply  = false;
    foreach (array_slice($argv, 2) as $a) {
        if (preg_match('/^--days=(\d+)$/', $a, $m)) $days = (int)$m[1];
        if ($a === '--apply') $apply = true;
    }
} else {
    $apiKey = $_GET['key'] ?? '';
    $days   = isset($_GET['days']) ? max(1, (int)$_GET['days']) : 365;
    $apply  = !empty($_GET['apply']);
}

require_once __DIR__ . '/../php/config/database.php';   // defines $pdo
header_remove('Content-Type');
header('Content-Type: text/plain; charset=UTF-8');

function out(string $s = ''): void { echo $s . "\n"; }

if ($apiKey === '') {
    http_response_code(400);
    out('Missing PriceLabs API key.');
    out($GLOBALS['IS_CLI']
        ? 'Usage: php scratch/pull_pricelabs_once.php <API_KEY> [--days=365] [--apply]'
        : 'Usage: ?key=<API_KEY>&days=365&apply=1');
    exit;
}

$days = min($days, 730);
$today = new DateTimeImmutable('today');
$horizon = $today->modify("+{$days} days");

out(($apply ? '*** APPLYING CHANGES ***' : '--- DRY RUN (add --apply / &apply=1 to write) ---'));
out("Horizon: {$today->format('Y-m-d')} .. {$horizon->format('Y-m-d')}  ({$days} days)");
out(str_repeat('-', 72));

// ---- PriceLabs: list channex listings -------------------------------------
function pl_get(string $path, string $key): array {
    $ch = curl_init("https://api.pricelabs.co/v1{$path}");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 40,
        CURLOPT_HTTPHEADER => ["X-API-Key: {$key}"],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($body === false) throw new RuntimeException("PriceLabs GET {$path} failed: {$err}");
    if ($code >= 300)    throw new RuntimeException("PriceLabs GET {$path} -> HTTP {$code}: " . substr($body, 0, 300));
    return json_decode($body, true) ?? [];
}
function pl_post(string $path, string $key, array $payload): array {
    $ch = curl_init("https://api.pricelabs.co/v1{$path}");
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ["X-API-Key: {$key}", 'Content-Type: application/json'],
    ]);
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    if ($body === false) throw new RuntimeException("PriceLabs POST {$path} failed: {$err}");
    if ($code >= 300)    throw new RuntimeException("PriceLabs POST {$path} -> HTTP {$code}: " . substr($body, 0, 300));
    return json_decode($body, true) ?? [];
}

try {
    $listingsResp = pl_get('/listings', $apiKey);
} catch (Throwable $e) {
    http_response_code(502);
    out('ERROR: ' . $e->getMessage());
    exit;
}

$listings = $listingsResp['listings'] ?? [];
$channexListings = array_values(array_filter($listings, fn($l) => ($l['pms'] ?? '') === 'channex'));
out('PriceLabs listings total: ' . count($listings) . '   channex: ' . count($channexListings));
if (!$channexListings) { out('Nothing to do.'); exit; }

// ---- map each listing to a local property/room via channex_mappings -------
$mapStmt = $pdo->prepare(
    "SELECT property_id, room_id FROM channex_mappings
     WHERE channex_room_type_id = ? " .
    "   OR (channex_property_id = ? AND (channex_room_type_id IS NULL OR channex_room_type_id = '')) " .
    "LIMIT 1"
);

$plan = [];          // property_id => ['rooms' => [room_id|0 => ['name'=>..,'listing_id'=>..]]]
$unmapped = [];

foreach ($channexListings as $l) {
    $id = $l['id'] ?? '';
    $name = $l['name'] ?? $id;
    [$propUuid, $roomTypeUuid] = array_pad(explode('___', $id, 2), 2, null);

    $mapStmt->execute([$roomTypeUuid, $propUuid]);
    $m = $mapStmt->fetch();
    if (!$m) { $unmapped[] = $name; continue; }

    $pid = (int)$m['property_id'];
    $rid = $m['room_id'] !== null ? (int)$m['room_id'] : 0;
    $plan[$pid]['rooms'][$rid] = ['name' => $name, 'listing_id' => $id];
}

if ($unmapped) {
    out('');
    out('SKIPPED (no channex_mappings row): ' . implode('; ', $unmapped));
}
if (!$plan) { out(''); out('No PriceLabs listing matched a local property. Stop.'); exit; }

// ---- fetch price curves (one batched call) -------------------------------
$wantIds = [];
foreach ($plan as $rooms) {
    foreach ($rooms['rooms'] as $r) $wantIds[$r['listing_id']] = true;
}
$pricesResp = pl_post('/listing_prices', $apiKey, [
    'listings' => array_map(fn($lid) => ['id' => $lid, 'pms' => 'channex'], array_keys($wantIds)),
]);
$byListing = [];
foreach ($pricesResp as $row) {
    $byListing[$row['id'] ?? ''] = $row['data'] ?? [];
}

// ---- build + (optionally) write rate rules -------------------------------
$touchedPropIds = [];
$touchedRoomIds = [];
$totalRows = 0;

if ($apply) $pdo->beginTransaction();

foreach ($plan as $pid => $info) {
    out('');
    out("PROPERTY #{$pid}");
    $touchedPropIds[$pid] = true;

    foreach ($info['rooms'] as $rid => $r) {
        $curve = $byListing[$r['listing_id']] ?? [];
        $rows = [];
        foreach ($curve as $d) {
            $date = $d['date'] ?? null;
            $price = $d['price'] ?? null;
            if (!$date || $price === null || $price <= 0) continue;
            if ($date < $today->format('Y-m-d') || $date > $horizon->format('Y-m-d')) continue;
            $rows[] = [$date, (float)$price];
        }

        $roomLabel = $rid ? "room #{$rid}" : 'whole property';
        $sample = array_slice($rows, 0, 5);
        $sampleStr = implode(', ', array_map(fn($x) => "{$x[0]}=₹" . (int)$x[1], $sample));
        out(sprintf('  %-42s %-16s %4d dates   %s%s',
            substr($r['name'], 0, 42), $roomLabel, count($rows), $sampleStr, count($rows) > 5 ? ' ...' : ''));

        if (!$apply || !$rows) continue;

        if ($rid) $touchedRoomIds[$rid] = true;

        // replace any prior import for this exact scope
        $del = $pdo->prepare(
            "DELETE FROM room_rate_rules
             WHERE property_id = ? AND rule_name = 'PriceLabs'
               AND ((? = 0 AND room_id IS NULL) OR room_id = ?)"
        );
        $del->execute([$pid, $rid, $rid ?: null]);

        $ins = $pdo->prepare(
            "INSERT INTO room_rate_rules
                (property_id, room_id, start_date, end_date, rate_per_night, rule_name)
             VALUES (?, ?, ?, ?, ?, 'PriceLabs')"
        );
        foreach ($rows as [$date, $rate]) {
            $ins->execute([$pid, $rid ?: null, $date, $date, $rate]);
            $totalRows++;
        }
    }
}

if ($apply) {
    // make the rules actually take effect
    $ids = array_map('intval', array_unique(array_merge(array_keys($touchedPropIds), array_keys($touchedRoomIds))));
    if ($ids) {
        $in = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("UPDATE properties SET pricing_mode = 'variable' WHERE id IN ($in)")->execute($ids);
    }
    $pdo->commit();
    out('');
    out(str_repeat('-', 72));
    out("DONE. Wrote {$totalRows} rate rules (rule_name = 'PriceLabs').");
    out('Set pricing_mode = variable on: ' . implode(', ', $ids));
    out('Delete this file now.');
} else {
    out('');
    out(str_repeat('-', 72));
    out('DRY RUN complete. Re-run with --apply (CLI) or &apply=1 (web) to write.');
}
