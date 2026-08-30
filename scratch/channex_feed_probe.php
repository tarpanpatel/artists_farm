<?php
/**
 * Verifies the booking-revisions feed and ACK path are reachable, so scenarios
 * 7-8 can be run via manual dashboard bookings (Channex's Option A) without an
 * activated OTA channel. Read-only apart from ACKing revisions we deliberately
 * created - and there are none yet, so this run is purely read-only.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';

function call(string $m, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $c, 'raw' => (string)$r, 'json' => json_decode((string)$r, true)];
}

echo "=== booking revisions feed ===\n";
foreach ([
    "booking_revisions/feed?filter[property_id]=$PROP",
    'booking_revisions/feed',
    "bookings?filter[property_id]=$PROP",
    'bookings',
] as $ep) {
    $r = call('GET', "$BASE/$ep", $KEY);
    $n = isset($r['json']['data']) ? count($r['json']['data']) : null;
    printf("%-52s HTTP %-4d %s\n", $ep, $r['code'],
        $n !== null ? "count=$n" : substr($r['raw'], 0, 90));
}

echo "\n=== webhooks registered? ===\n";
$w = call('GET', "$BASE/webhooks", $KEY);
echo "HTTP {$w['code']}  count=" . count($w['json']['data'] ?? []) . "\n";
foreach (($w['json']['data'] ?? []) as $x) {
    $a = $x['attributes'] ?? [];
    echo '  ' . ($a['callback_url'] ?? '?') . '  events=' . ($a['event_mask'] ?? '?')
       . '  active=' . var_export($a['is_active'] ?? null, true) . "\n";
}

echo "\n=== does our webhook receiver exist on the channel-manager branch? ===\n";
$recv = 'php/channex/webhook_receiver.php';
echo $recv . ': ' . (is_file($recv) ? 'present in working tree' : 'NOT in this branch/working tree') . "\n";
echo "(staging currently serves origin/multi-tenant, which does NOT include php/channex/)\n";
