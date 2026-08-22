<?php
/**
 * Minimal, dependency-free Web Push sender (RFC 8291 message encryption +
 * RFC 8292 VAPID), hand-implemented rather than pulled in via Composer.
 *
 * Why not the standard library (minishlink/web-push): this project has zero
 * package-manager footprint today (no composer.json/vendor/) and its deploy
 * pipeline (deploy.ps1/deploy-staging.ps1) only ever does `git pull` on the
 * server - no `composer install` step. The current major version of that
 * library requires ~10 transitive packages (a full JOSE/JWT suite, an
 * HTTP-client discovery layer, PSR interfaces) to vendor in for a project
 * whose entire backend is otherwise plain PHP. The Web Push protocol itself
 * is a fixed, stable spec (not a moving target), and everything it needs -
 * EC P-256 keygen/ECDH via openssl_pkey_*, HKDF via hash_hmac, AES-128-GCM
 * via openssl_encrypt - is already provided by the openssl/curl/mbstring
 * extensions this server already has (confirmed present 22 Aug 2026; no
 * gmp needed - ECDH here uses openssl_pkey_derive, not gmp/bcmath).
 *
 * Zero database dependency on purpose, matching logger.php's own design
 * ("Works without database or MySQL server dependency") - subscriptions
 * live in push_subscriptions.json, not a DB table, specifically so a
 * SQL Error (one of the very things this is meant to alert on) can never
 * also take out the alerting channel itself.
 */

if (!function_exists('wp_base64url_encode')) {

    /**
     * Windows/XAMPP local dev often has no openssl.cnf at OpenSSL's own
     * compiled-in default path ("C:\Program Files\Common Files\SSL\
     * openssl.cnf" simply doesn't exist there) - without it, openssl_pkey_new()
     * for an EC key fails outright ("error:80000003:system library::No such
     * process"), confirmed 22 Aug 2026 on this exact machine. Real hosting
     * (cPanel/Linux) ships a correctly resolvable system default and has
     * never shown this, so this override applies ONLY on local Windows dev -
     * production needs no help finding its own openssl.cnf.
     */
    function wp_openssl_config_path(): ?string {
        static $resolved = null;
        static $checked = false;
        if ($checked) {
            return $resolved;
        }
        $checked = true;
        if (stripos(PHP_OS, 'WIN') === 0) {
            foreach (['C:\\xampp\\php\\extras\\openssl\\openssl.cnf', 'C:\\xampp\\apache\\conf\\openssl.cnf'] as $candidate) {
                if (file_exists($candidate)) {
                    $resolved = $candidate;
                    break;
                }
            }
        }
        return $resolved;
    }

    function wp_ec_keygen_options(): array {
        $opts = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
        $cfg = wp_openssl_config_path();
        if ($cfg) {
            $opts['config'] = $cfg;
        }
        return $opts;
    }

    /**
     * The missing-openssl.cnf problem above isn't limited to openssl_pkey_new()
     * - openssl_pkey_get_private()/get_public() (neither of which accepts a
     * config array in this PHP build - checked via Reflection) hit the exact
     * same "system library::No such process" the moment they touch an EC key,
     * because libcrypto itself (not PHP) resolves its EC curve OID database
     * from the OPENSSL_CONF env var / compiled-in default at the C level,
     * independent of which PHP wrapper function triggered it. Setting the env
     * var once, before any openssl_* call, fixes every one of them at once.
     */
    function wp_ensure_openssl_config(): void {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;
        if (getenv('OPENSSL_CONF')) {
            return; // already set (e.g. by the real hosting environment) - don't override
        }
        $cfg = wp_openssl_config_path();
        if ($cfg) {
            putenv('OPENSSL_CONF=' . $cfg);
        }
    }
    wp_ensure_openssl_config();

    function wp_base64url_encode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    function wp_base64url_decode(string $data): string {
        $data = strtr($data, '-_', '+/');
        $pad = strlen($data) % 4;
        if ($pad) {
            $data .= str_repeat('=', 4 - $pad);
        }
        $decoded = base64_decode($data, true);
        return $decoded === false ? '' : $decoded;
    }

    // ---- VAPID key management (self-healing: auto-generated on first use,
    // matching this project's general "self-heal, don't require a manual
    // migration step" philosophy - see CLAUDE.md's Self-Healing DB Schema
    // section for the same idea applied to table columns instead of keys). ----

    function wp_generate_vapid_keypair(): array {
        $res = openssl_pkey_new(wp_ec_keygen_options());
        if ($res === false) {
            throw new \RuntimeException('Failed to generate VAPID EC key: ' . openssl_error_string());
        }
        openssl_pkey_export($res, $privatePem);
        $details = openssl_pkey_get_details($res);
        $rawPublic = "\x04"
            . str_pad((string) $details['ec']['x'], 32, "\x00", STR_PAD_LEFT)
            . str_pad((string) $details['ec']['y'], 32, "\x00", STR_PAD_LEFT);

        return [
            'private_pem' => $privatePem,
            'public_raw_b64url' => wp_base64url_encode($rawPublic),
        ];
    }

    function getVapidKeys(): array {
        $path = __DIR__ . '/vapid_keys.json';
        if (file_exists($path)) {
            $data = json_decode((string) file_get_contents($path), true);
            if (is_array($data) && !empty($data['private_pem']) && !empty($data['public_raw_b64url'])) {
                return $data;
            }
        }
        $keys = wp_generate_vapid_keypair();
        @file_put_contents($path, json_encode($keys, JSON_PRETTY_PRINT), LOCK_EX);
        @chmod($path, 0600);
        return $keys;
    }

    // ---- ECDSA DER -> raw r||s (JWT ES256 needs the raw concatenated form,
    // openssl_sign on an EC key only ever produces DER). ----

    function wp_der_to_raw_signature(string $der, int $componentLen = 32): string {
        $offset = 0;
        if (ord($der[$offset]) !== 0x30) {
            throw new \RuntimeException('Invalid DER signature: expected SEQUENCE');
        }
        $offset++;
        $seqLen = ord($der[$offset]);
        $offset++;
        if ($seqLen & 0x80) {
            $offset += $seqLen & 0x7f; // long-form length bytes, value itself unneeded here
        }

        if (ord($der[$offset]) !== 0x02) {
            throw new \RuntimeException('Invalid DER signature: expected INTEGER (r)');
        }
        $offset++;
        $rLen = ord($der[$offset]);
        $offset++;
        $r = substr($der, $offset, $rLen);
        $offset += $rLen;

        if (ord($der[$offset]) !== 0x02) {
            throw new \RuntimeException('Invalid DER signature: expected INTEGER (s)');
        }
        $offset++;
        $sLen = ord($der[$offset]);
        $offset++;
        $s = substr($der, $offset, $sLen);

        // DER prepends a single 0x00 sign-guard byte when the integer's top
        // bit is set - strip it (at most one can validly appear) then
        // re-pad to a fixed 32-byte big-endian width.
        $r = ltrim($r, "\x00");
        $s = ltrim($s, "\x00");

        return str_pad($r, $componentLen, "\x00", STR_PAD_LEFT)
             . str_pad($s, $componentLen, "\x00", STR_PAD_LEFT);
    }

    function wp_build_vapid_jwt(string $audience, string $subject, array $vapidKeys, int $ttlSeconds = 43200): string {
        $header = wp_base64url_encode((string) json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $payload = wp_base64url_encode((string) json_encode([
            'aud' => $audience,
            'exp' => time() + $ttlSeconds,
            'sub' => $subject,
        ]));
        $signingInput = "$header.$payload";

        $pkey = openssl_pkey_get_private($vapidKeys['private_pem']);
        if ($pkey === false) {
            throw new \RuntimeException('Invalid VAPID private key: ' . openssl_error_string());
        }
        $ok = openssl_sign($signingInput, $derSignature, $pkey, OPENSSL_ALGO_SHA256);
        if (!$ok) {
            throw new \RuntimeException('Failed to sign VAPID JWT: ' . openssl_error_string());
        }
        $rawSignature = wp_der_to_raw_signature($derSignature, 32);

        return $signingInput . '.' . wp_base64url_encode($rawSignature);
    }

    // ---- Import a raw 65-byte uncompressed EC point (what pushManager.
    // subscribe()'s p256dh key and this file's own VAPID public key both
    // are) into an OpenSSL public-key handle, by wrapping it in the fixed,
    // standard SubjectPublicKeyInfo DER header for prime256v1. ----

    function wp_import_raw_ec_public_key(string $rawPoint) {
        if (strlen($rawPoint) !== 65 || ord($rawPoint[0]) !== 0x04) {
            throw new \RuntimeException('Expected a 65-byte uncompressed EC point');
        }
        // SEQUENCE { SEQUENCE { OID id-ecPublicKey, OID prime256v1 } BIT STRING }
        // header, fixed for every prime256v1 uncompressed-point key.
        $prefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        $der = $prefix . $rawPoint;
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $pkey = openssl_pkey_get_public($pem);
        if ($pkey === false) {
            throw new \RuntimeException('Failed to import EC public key: ' . openssl_error_string());
        }
        return $pkey;
    }

    function wp_generate_ephemeral_ec_keypair(): array {
        $res = openssl_pkey_new(wp_ec_keygen_options());
        if ($res === false) {
            throw new \RuntimeException('Failed to generate ephemeral EC key: ' . openssl_error_string());
        }
        openssl_pkey_export($res, $privPem);
        $details = openssl_pkey_get_details($res);
        $raw = "\x04"
            . str_pad((string) $details['ec']['x'], 32, "\x00", STR_PAD_LEFT)
            . str_pad((string) $details['ec']['y'], 32, "\x00", STR_PAD_LEFT);
        return ['private_pem' => $privPem, 'public_raw' => $raw];
    }

    function wp_hkdf_extract(string $salt, string $ikm): string {
        return hash_hmac('sha256', $ikm, $salt, true);
    }

    function wp_hkdf_expand(string $prk, string $info, int $length): string {
        $t = '';
        $okm = '';
        $counter = 1;
        while (strlen($okm) < $length) {
            $t = hash_hmac('sha256', $t . $info . chr($counter), $prk, true);
            $okm .= $t;
            $counter++;
        }
        return substr($okm, 0, $length);
    }

    /**
     * RFC 8291 message encryption. $p256dhB64Url/$authB64Url come straight
     * off the browser's PushSubscription.toJSON().keys.
     */
    function wp_encrypt_payload(string $plaintext, string $p256dhB64Url, string $authB64Url): string {
        $clientPublicRaw = wp_base64url_decode($p256dhB64Url);
        $authSecret = wp_base64url_decode($authB64Url);

        $ephemeral = wp_generate_ephemeral_ec_keypair();

        $remotePub = wp_import_raw_ec_public_key($clientPublicRaw);
        $localPriv = openssl_pkey_get_private($ephemeral['private_pem']);
        $sharedSecret = openssl_pkey_derive($remotePub, $localPriv, 32);
        if ($sharedSecret === false) {
            throw new \RuntimeException('ECDH derive failed: ' . openssl_error_string());
        }

        // PRK_key = HMAC-SHA256(auth_secret, ecdh_secret); IKM = HKDF-Expand
        // keyed on the ua/as public keys ("WebPush: info").
        $prkKey = wp_hkdf_extract($authSecret, $sharedSecret);
        $keyInfo = "WebPush: info\x00" . $clientPublicRaw . $ephemeral['public_raw'];
        $ikm = wp_hkdf_expand($prkKey, $keyInfo, 32);

        $salt = random_bytes(16);
        $prk = wp_hkdf_extract($salt, $ikm);

        $cek = wp_hkdf_expand($prk, "Content-Encoding: aes128gcm\x00", 16);
        $nonce = wp_hkdf_expand($prk, "Content-Encoding: nonce\x00", 12);

        // Single-record message: delimiter octet 0x02 marks it as the last
        // (and only) record, per RFC 8188.
        $paddedPlaintext = $plaintext . "\x02";

        $tag = '';
        $ciphertext = openssl_encrypt($paddedPlaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
        if ($ciphertext === false) {
            throw new \RuntimeException('AES-128-GCM encryption failed: ' . openssl_error_string());
        }

        $recordSize = pack('N', 4096);
        $keyIdLen = chr(strlen($ephemeral['public_raw']));
        $header = $salt . $recordSize . $keyIdLen . $ephemeral['public_raw'];

        return $header . $ciphertext . $tag;
    }

    /**
     * Sends one push message to one subscription. Returns ['ok', 'status',
     * 'error'] rather than throwing on an HTTP-level failure (a dead/expired
     * subscription returning 404/410 is an expected, routine outcome the
     * caller is expected to handle by pruning it - not a bug).
     */
    function sendWebPush(array $subscription, array $payload, int $ttl = 2419200): array {
        $endpoint = $subscription['endpoint'] ?? '';
        $p256dh = $subscription['keys']['p256dh'] ?? '';
        $auth = $subscription['keys']['auth'] ?? '';
        if (!$endpoint || !$p256dh || !$auth) {
            return ['ok' => false, 'status' => 0, 'error' => 'Incomplete subscription'];
        }

        try {
            $vapidKeys = getVapidKeys();
            $urlParts = parse_url($endpoint);
            if (empty($urlParts['scheme']) || empty($urlParts['host'])) {
                return ['ok' => false, 'status' => 0, 'error' => 'Invalid endpoint URL'];
            }
            $audience = $urlParts['scheme'] . '://' . $urlParts['host'];
            $jwt = wp_build_vapid_jwt($audience, 'mailto:root-admin@artistic-sthan.com', $vapidKeys);
            $body = wp_encrypt_payload((string) json_encode($payload), $p256dh, $auth);
        } catch (\Throwable $e) {
            return ['ok' => false, 'status' => 0, 'error' => $e->getMessage()];
        }

        $headers = [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: ' . $ttl,
            'Authorization: vapid t=' . $jwt . ', k=' . $vapidKeys['public_raw_b64url'],
            'Urgency: high',
        ];

        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            // This runs synchronously inline with whatever real request
            // triggered the alert-worthy log entry (there is no background
            // queue) - a slow/unreachable push service must never be able to
            // meaningfully delay an unrelated user-facing request on top of
            // whatever already made it fail. 3s matches the same trade-off
            // the old Telegram admin-alert (now removed) already used.
            CURLOPT_CONNECTTIMEOUT => 2,
            CURLOPT_TIMEOUT => 3,
        ]);
        $response = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        return ['ok' => $status >= 200 && $status < 300, 'status' => $status, 'error' => $error, 'response' => $response];
    }

    // ---- File-backed subscription store (push_subscriptions.json) -
    // deliberately not MySQL, see file-level comment above. ----

    function wp_load_subscriptions(): array {
        $path = __DIR__ . '/push_subscriptions.json';
        if (!file_exists($path)) {
            return [];
        }
        $data = json_decode((string) @file_get_contents($path), true);
        return is_array($data) ? $data : [];
    }

    function wp_save_subscriptions(array $subs): void {
        @file_put_contents(__DIR__ . '/push_subscriptions.json', json_encode(array_values($subs), JSON_PRETTY_PRINT), LOCK_EX);
    }

    function wp_add_subscription(array $subscription): void {
        $subs = wp_load_subscriptions();
        // De-dupe by endpoint - re-subscribing (e.g. after a reload) must
        // update, not duplicate, the existing entry.
        $subs = array_values(array_filter($subs, fn($s) => ($s['endpoint'] ?? '') !== ($subscription['endpoint'] ?? '')));
        $subs[] = array_merge($subscription, ['added_at' => date('Y-m-d H:i:s')]);
        wp_save_subscriptions($subs);
    }

    function wp_remove_subscription(string $endpoint): void {
        $subs = wp_load_subscriptions();
        $subs = array_values(array_filter($subs, fn($s) => ($s['endpoint'] ?? '') !== $endpoint));
        wp_save_subscriptions($subs);
    }

    /**
     * Sends one push payload to every stored subscription, silently
     * pruning any that the push service reports as gone (404/410 - the
     * normal way a browser tells you it has permanently dropped a
     * subscription, e.g. the user cleared site data). One bad/expired
     * subscription must never stop the others from receiving the alert.
     * Returns each attempt's outcome so callers that need to show real
     * pass/fail feedback (the "Send Test" button) don't have to guess.
     */
    function broadcastWebPush(array $payload): array {
        $subs = wp_load_subscriptions();
        $results = [];
        foreach ($subs as $sub) {
            try {
                $result = sendWebPush($sub, $payload);
                if (in_array($result['status'], [404, 410], true)) {
                    wp_remove_subscription($sub['endpoint'] ?? '');
                }
                $results[] = $result;
            } catch (\Throwable $e) {
                // Never let one bad subscription/crypto error break logging
                // or the rest of the broadcast.
                $results[] = ['ok' => false, 'status' => 0, 'error' => $e->getMessage()];
            }
        }
        return $results;
    }
}
