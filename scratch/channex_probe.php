<?php
/**
 * Live Channex sandbox probe. Answers the one question the written evaluation
 * asserted but never tested: does a whole-property SINGLE unit map cleanly, or
 * is it forced into a fake "1 room type" shape?
 *
 * Read-only unless --create is passed. Never prints the API key.
 */
$cfg = json_decode(file_get_contents(__DIR__ . '/../php/config/channex_config.json'), true);
$KEY = $cfg['api_key'] ?? '';
$BASE = rtrim($cfg['base_url'] ?? '', '/');
if (!$KEY) { exit("No API key in php/config/channex_config.json\n"); }
echo "base_url: $BASE\nkey: " . substr($KEY, 0, 4) . "..." . substr($KEY, -4) . " (len " . strlen($KEY) . ")\n\n";

function call(string $method, string $url, string $key, ?array $body = null): array {
    $ch = curl_init($url);
    $headers = ['user-api-key: ' . $key, 'Content-Type: application/json', 'Accept: application/json'];
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err  = curl_error($ch);
    curl_close($ch);
    return ['code' => $code, 'body' => $resp, 'err' => $err];
}

// --- 1. Auth + connectivity ---
echo "=== 1. GET /properties (auth check) ===\n";
$r = call('GET', "$BASE/properties", $KEY);
echo "HTTP {$r['code']}" . ($r['err'] ? " curl_err={$r['err']}" : '') . "\n";
$snippet = substr((string)$r['body'], 0, 400);
echo "body: $snippet\n\n";

if ($r['code'] === 0) {
    echo "Could not reach the host at all - check base_url.\n";
    exit;
}
if ($r['code'] === 401 || $r['code'] === 403) {
    echo "Auth rejected. Either the header name isn't 'user-api-key' or the key/base_url is wrong.\n";
    exit;
}

// --- 2. What does the room_type schema actually require? ---
// This is the real question: can a whole-property unit be expressed natively,
// or does it need a synthetic room type?
echo "=== 2. GET /room_types (existing shapes) ===\n";
$rt = call('GET', "$BASE/room_types", $KEY);
echo "HTTP {$rt['code']}\nbody: " . substr((string)$rt['body'], 0, 600) . "\n\n";

echo "=== 3. GET /rate_plans ===\n";
$rp = call('GET', "$BASE/rate_plans", $KEY);
echo "HTTP {$rp['code']}\nbody: " . substr((string)$rp['body'], 0, 400) . "\n";
