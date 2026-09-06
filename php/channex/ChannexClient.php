<?php
/**
 * Channex.io API Client
 *
 * Implements low-level HTTP communication with Channex v1 REST API.
 * Includes user-api-key header handling, JSON:API payload parsing,
 * exponential backoff retry on 429/5xx, and rate ceiling guard.
 */

class ChannexClient {
    private string $baseUrl;
    private string $apiKey;
    private int $maxRetries = 3;

    // Proactive rate ceiling (Channex certification Test 12: "make sure you
    // have a queue or limiter to not spam our API endpoints" - 20 ARI
    // calls/minute). The exponential backoff below only reacts AFTER a 429;
    // this stops a single processBatch() drain of many pending rows from
    // ever bursting past the limit in the first place. Static (per-process),
    // not cross-request - the actual burst risk is one drain call firing
    // many requests in a tight loop, not many separate low-traffic requests
    // days apart, so this doesn't need Redis/DB-backed shared state.
    private static array $callTimestamps = [];
    private const RATE_LIMIT_CALLS = 20;
    private const RATE_LIMIT_WINDOW_SECONDS = 60;

    private static function waitForRateLimit(): void {
        $now = microtime(true);
        self::$callTimestamps = array_values(array_filter(
            self::$callTimestamps,
            fn($t) => ($now - $t) < self::RATE_LIMIT_WINDOW_SECONDS
        ));

        if (count(self::$callTimestamps) >= self::RATE_LIMIT_CALLS) {
            $oldest = self::$callTimestamps[0];
            $waitSeconds = self::RATE_LIMIT_WINDOW_SECONDS - ($now - $oldest);
            if ($waitSeconds > 0) {
                usleep((int)($waitSeconds * 1000000));
            }
            $now = microtime(true);
            self::$callTimestamps = array_values(array_filter(
                self::$callTimestamps,
                fn($t) => ($now - $t) < self::RATE_LIMIT_WINDOW_SECONDS
            ));
        }

        self::$callTimestamps[] = microtime(true);
    }

    public function __construct(?string $apiKey = null, ?string $baseUrl = null) {
        if ($apiKey && $baseUrl) {
            $this->apiKey = $apiKey;
            $this->baseUrl = rtrim($baseUrl, '/');
            return;
        }

        $configFile = __DIR__ . '/../config/channex_config.json';
        if (file_exists($configFile)) {
            $config = json_decode(file_get_contents($configFile), true) ?: [];
            $this->apiKey = $apiKey ?? ($config['api_key'] ?? '');
            $this->baseUrl = rtrim($baseUrl ?? ($config['base_url'] ?? 'https://staging.channex.io/api/v1'), '/');
        } else {
            $this->apiKey = $apiKey ?? '';
            $this->baseUrl = rtrim($baseUrl ?? 'https://staging.channex.io/api/v1', '/');
        }
    }

    public function get(string $endpoint, array $params = []): array {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        if (!empty($params)) {
            $url .= '?' . http_build_query($params);
        }
        return $this->request('GET', $url);
    }

    public function post(string $endpoint, array $body = []): array {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        return $this->request('POST', $url, $body);
    }

    public function put(string $endpoint, array $body = []): array {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        return $this->request('PUT', $url, $body);
    }

    public function delete(string $endpoint): array {
        $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
        return $this->request('DELETE', $url);
    }

    protected function request(string $method, string $url, ?array $body = null): array {
        $attempt = 0;
        $lastException = null;
        // Only retry idempotent methods (found 3 Sep 2026, code review,
        // alongside the CURLOPT_TIMEOUT reduction below making a timeout more
        // likely to fire mid-request). A POST that Channex actually received
        // and processed - but whose response we simply never got back in
        // time - used to get retried exactly like a GET, which for
        // content_sync.php's non-idempotent property/room_type/rate_plan
        // creation POSTs risks creating a duplicate record on Channex's side
        // rather than just re-reading the same state. PUT is safe to retry
        // (applying the same update twice is the same end state); DELETE too
        // (a second attempt on an already-deleted resource is a 404, which
        // this method already returns without retrying, further down).
        $isIdempotentMethod = in_array($method, ['GET', 'PUT', 'DELETE'], true);
        $maxAttempts = $isIdempotentMethod ? $this->maxRetries : 1;

        while ($attempt < $maxAttempts) {
            $attempt++;
            self::waitForRateLimit();
            $ch = curl_init($url);

            $headers = [
                'user-api-key: ' . $this->apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ];

            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 12);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

            if ($body !== null && in_array($method, ['POST', 'PUT', 'PATCH'], true)) {
                curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_SLASHES));
            }

            $rawResponse = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($rawResponse === false) {
                $lastException = new RuntimeException("Channex cURL error: " . $curlError);
                usleep((int)(pow(2, $attempt - 1) * 500000));
                continue;
            }

            $decoded = json_decode($rawResponse, true);

            // Success (200, 201, 204)
            if ($httpCode >= 200 && $httpCode < 300) {
                return [
                    'success' => true,
                    'http_code' => $httpCode,
                    'data' => $decoded['data'] ?? ($decoded ?: []),
                    'raw' => $decoded,
                ];
            }

            // Exponential backoff retry on 429 Too Many Requests or 5xx server
            // errors - idempotent methods only (see $isIdempotentMethod's own
            // comment above). A non-idempotent POST/PATCH falls through to the
            // same "return the real response" path immediately below instead
            // of looping (previously: it would still sleep then exit the loop
            // anyway once maxAttempts=1 was reached, losing the real
            // http_code/error to the generic "Max retry attempts exceeded"
            // fallback at the bottom of this method).
            if (($httpCode === 429 || ($httpCode >= 500 && $httpCode <= 599)) && $isIdempotentMethod && $attempt < $maxAttempts) {
                $backoffMicroseconds = (int)(pow(2, $attempt - 1) * 1000000); // 1s, 2s, 4s
                usleep($backoffMicroseconds);
                continue;
            }

            // Client errors (400, 401, 403, 404, 422) return immediately without
            // retry - as does a 429/5xx that reached here because the method
            // wasn't idempotent or attempts were already exhausted (see above).
            return [
                'success' => false,
                'http_code' => $httpCode,
                'error' => $decoded['errors'] ?? ($decoded['message'] ?? 'Channex API error'),
                'raw' => $decoded,
            ];
        }

        return [
            'success' => false,
            'http_code' => 0,
            'error' => $lastException ? $lastException->getMessage() : 'Max retry attempts exceeded',
        ];
    }

    /**
     * Fires several GET requests concurrently via curl_multi (7 Sep 2026 -
     * added for ChannexChannelClient::getMultipleListingDetails(), see its own
     * comment for why: a multi-room property was paying for one sequential
     * getListingDetails() round trip PER ROOM, so opening "Import from
     * Airbnb" on a 7-room property took as long as all 7 calls added
     * together. Wall time here is roughly the SLOWEST single call, not
     * their sum.
     *
     * $endpoints: full relative paths (with querystring), same shape get()
     * builds internally. $keys: parallel array of caller-chosen keys the
     * results are indexed by (so a caller can look a result up by, e.g.,
     * listing id instead of array position).
     *
     * Deliberately no retry-on-429/5xx here, unlike request()'s single-call
     * path - this only ever backs a best-effort, read-only dry-run proposal
     * (proposeAirbnbRoomConfig() already treats one room's details being
     * unavailable as "skip those fields for that room", not a hard error),
     * so trading a little retry-robustness for a large speed win is the
     * right call. A transient failure here just means that one room's
     * proposal is thinner than usual, not a broken import.
     */
    public function getConcurrent(array $endpoints, array $keys): array {
        $count = count($endpoints);
        if ($count === 0) return [];

        // One rate-ceiling check for the whole batch, then record all N calls
        // up front - waitForRateLimit() itself only guards the FIRST of them
        // since the rest fire without going back through it individually.
        self::waitForRateLimit();
        for ($i = 1; $i < $count; $i++) {
            self::$callTimestamps[] = microtime(true);
        }

        $mh = curl_multi_init();
        $handles = [];
        foreach (array_values($endpoints) as $i => $endpoint) {
            $url = $this->baseUrl . '/' . ltrim($endpoint, '/');
            $ch = curl_init($url);
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'user-api-key: ' . $this->apiKey,
                'Content-Type: application/json',
                'Accept: application/json',
            ]);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 12);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_multi_add_handle($mh, $ch);
            $handles[$i] = $ch;
        }

        $running = null;
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running > 0) {
                curl_multi_select($mh);
            }
        } while ($running > 0 && $status === CURLM_OK);

        $keysList = array_values($keys);
        $results = [];
        foreach ($handles as $i => $ch) {
            $rawResponse = curl_multi_getcontent($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);

            $decoded = ($rawResponse !== false && $rawResponse !== null) ? json_decode($rawResponse, true) : null;
            $key = $keysList[$i] ?? $i;

            if ($rawResponse !== false && $httpCode >= 200 && $httpCode < 300) {
                $results[$key] = [
                    'success' => true,
                    'http_code' => $httpCode,
                    'data' => $decoded['data'] ?? ($decoded ?: []),
                    'raw' => $decoded,
                ];
            } else {
                $results[$key] = [
                    'success' => false,
                    'http_code' => $httpCode,
                    'error' => $decoded['errors'] ?? ($decoded['message'] ?? ($curlError ?: 'Channex API error')),
                    'raw' => $decoded,
                ];
            }
        }
        curl_multi_close($mh);
        return $results;
    }
}
