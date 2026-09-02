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

        while ($attempt < $this->maxRetries) {
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

            // Exponential backoff retry on 429 Too Many Requests or 5xx server errors
            if ($httpCode === 429 || ($httpCode >= 500 && $httpCode <= 599)) {
                $backoffMicroseconds = (int)(pow(2, $attempt - 1) * 1000000); // 1s, 2s, 4s
                usleep($backoffMicroseconds);
                continue;
            }

            // Client errors (400, 401, 403, 404, 422) return immediately without retry
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
}
