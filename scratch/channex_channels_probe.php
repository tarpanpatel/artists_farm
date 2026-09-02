<?php
/**
 * Read-only probe: what channels does the Channex SANDBOX actually expose, and
 * is Airbnb among them? Answers whether a real Airbnb account can/should be
 * connected here at all. Makes no changes.
 */
chdir('c:/xampp/htdocs/artists_farm');
$cfg  = json_decode(file_get_contents('php/config/channex_config.json'), true);
$KEY  = $cfg['api_key'];
$BASE = rtrim($cfg['base_url'], '/');

function get(string $url, string $key): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['user-api-key: ' . $key, 'Accept: application/json']);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    $r = curl_exec($ch);
    $c = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $c, 'raw' => (string)$r, 'json' => json_decode((string)$r, true)];
}

foreach (['channels', 'applications', 'properties'] as $ep) {
    echo "=== GET /$ep ===\n";
    $r = get("$BASE/$ep", $KEY);
    echo "HTTP {$r['code']}\n";
    if ($r['code'] === 200 && isset($r['json']['data'])) {
        $rows = $r['json']['data'];
        echo "count: " . count($rows) . "\n";
        foreach (array_slice($rows, 0, 15) as $row) {
            $a = $row['attributes'] ?? [];
            echo '  - ' . ($a['title'] ?? $a['name'] ?? $row['id'] ?? '?')
               . (isset($a['channel']) ? "  [channel: {$a['channel']}]" : '')
               . (isset($a['is_active']) ? '  active=' . var_export($a['is_active'], true) : '')
               . "\n";
        }
    } else {
        echo substr($r['raw'], 0, 300) . "\n";
    }
    echo "\n";
}
