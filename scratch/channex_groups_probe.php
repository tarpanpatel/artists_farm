<?php
/** Read-only: what group does the sandbox account/property belong to, and can this key see groups at all? */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function get(string $url, string $key): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $r = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    return ['code' => $c, 'raw' => (string)$r, 'json' => json_decode((string)$r, true)];
}

foreach (['groups', 'users/me', 'billing/subscriptions'] as $ep) {
    $r = get("$BASE/$ep", $KEY);
    echo "=== GET /$ep -> HTTP {$r['code']} ===\n" . substr($r['raw'], 0, 500) . "\n\n";
}

// Does the property itself carry a group_id we should be passing?
$p = get("$BASE/properties", $KEY);
foreach (($p['json']['data'] ?? []) as $prop) {
    if (str_contains((string)($prop['attributes']['title'] ?? ''), 'CLAUDE TEST')) {
        echo "=== test property attributes (group-related keys) ===\n";
        foreach (($prop['attributes'] ?? []) as $k => $v) {
            if (preg_match('/group|owner|account|org/i', $k)) {
                echo "  $k = " . var_export($v, true) . "\n";
            }
        }
        echo "  (relationships): " . json_encode($prop['relationships'] ?? []) . "\n";
    }
}
