<?php
/**
 * The channel was created attached only to the group, with no property link -
 * which is why it does not appear under the property in the dashboard, and why
 * filter[property_id] correctly returned nothing.
 *
 * Tries the plausible ways to associate it with the property.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function call(string $m, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $c, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

$CH   = '3bde9156-1373-438b-ae47-c863d5f219f9';
$PROP = '4286428a-5561-4508-bd28-1f9ae55d8795';

$attempts = [
    'properties array of ids'   => ['channel' => ['properties' => [$PROP]]],
    'property_ids array'        => ['channel' => ['property_ids' => [$PROP]]],
    'property_id scalar'        => ['channel' => ['property_id' => $PROP]],
    'relationships.properties'  => ['channel' => ['relationships' => ['properties' => ['data' => [['id' => $PROP, 'type' => 'property']]]]]],
    'settings.property_id'      => ['channel' => ['settings' => ['property_id' => $PROP, 'hotel_code' => 'CERT-TEST-001']]],
];

foreach ($attempts as $label => $body) {
    $r = call('PUT', "$BASE/channels/$CH", $KEY, $body);
    $linked = 'n/a';
    if ($r['code'] < 300) {
        $check = call('GET', "$BASE/channels/$CH", $KEY);
        $props = $check['json']['data']['relationships']['properties']['data'] ?? [];
        $linked = count($props) > 0 ? 'LINKED (' . count($props) . ')' : 'still empty';
    }
    printf("%-28s HTTP %-4d %s  %s\n", $label, $r['code'], $linked,
        $r['code'] >= 300 ? substr($r['raw'], 0, 140) : '');
    if ($linked !== 'still empty' && $linked !== 'n/a') { echo "\n>>> WORKED: $label\n"; break; }
}

echo "\n=== final channel state ===\n";
$f = call('GET', "$BASE/channels/$CH", $KEY);
$d = $f['json']['data'] ?? [];
echo 'title      : ' . ($d['attributes']['title'] ?? '?') . "\n";
echo 'is_active  : ' . var_export($d['attributes']['is_active'] ?? null, true) . "\n";
echo 'properties : ' . json_encode($d['relationships']['properties']['data'] ?? []) . "\n";
