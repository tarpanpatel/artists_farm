<?php
/** Find which `channel` codes Channex staging accepts, now that group_id resolves the permission error. */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function call(string $m, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $m);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $c, 'json' => json_decode((string)$r, true), 'raw' => (string)$r];
}

$PROP  = '4286428a-5561-4508-bd28-1f9ae55d8795';
$GROUP = 'df43207a-cc42-497d-8813-6590744c748c';

// Channex documents channels by short code (e.g. GMT for MakeMyTrip/Goibibo).
$codes = ['Open', 'OpenChannel', 'BookingCom', 'Booking', 'AirBNB', 'Airbnb',
          'Expedia', 'AgodaHomes', 'Agoda', 'HostelWorld', 'GMT', 'Simulator', 'TestChannel'];

$accepted = [];
foreach ($codes as $code) {
    $r = call('POST', "$BASE/channels", $KEY, ['channel' => [
        'title'      => "Probe $code",
        'property_id'=> $PROP,
        'group_id'   => $GROUP,
        'channel'    => $code,
        'is_active'  => false,
        'settings'   => [],
    ]]);
    $detail = '';
    if (isset($r['json']['errors']['details'])) {
        $d = $r['json']['errors']['details'];
        $detail = is_array($d) ? json_encode($d) : (string)$d;
    }
    // "is invalid" = wrong enum value. Anything else = the code was recognised
    // and it is now complaining about something real (e.g. missing settings).
    $recognised = !str_contains($detail, '"channel":["is invalid"]');
    printf("%-14s HTTP %-4d %s%s\n", $code, $r['code'], $recognised ? 'RECOGNISED  ' : '', substr($detail, 0, 150));
    if ($r['code'] < 300) {
        $accepted[] = [$code, $r['json']['data']['id'] ?? null];
    }
}

echo "\n=== created ===\n";
foreach ($accepted as [$code, $id]) { echo "  $code -> $id\n"; }
if (!$accepted) echo "  none\n";
