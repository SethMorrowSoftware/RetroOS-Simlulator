<?php
/**
 * WebSocket Authentication
 *
 * Validates session tokens against the existing PHP API.
 * Caches valid sessions briefly to avoid hammering the PHP backend.
 */

class WebSocketAuth
{
    /** @var array<string, array{user: array, timestamp: float}> */
    private array $cache = [];

    // Aggressive cache TTL: revocations propagate via the explicit
    // /auth/revocations poller within ~5s, but if that ever lags this
    // bound caps the worst-case window at 10s.
    private float $cacheTTL = 10.0; // 10 seconds

    private string $apiBase;

    public function __construct(string $apiBase)
    {
        $this->apiBase = rtrim($apiBase, '/');
    }

    /**
     * Extract numeric HTTP status code from a status line.
     *
     * Parses the standard "HTTP/x.x NNN Reason" format and returns
     * the integer status code, or 0 if the line cannot be parsed.
     */
    private static function extractHttpStatus(string $statusLine): int
    {
        // Match "HTTP/<version> <3-digit-code>"
        if (preg_match('/^HTTP\/[\d.]+ (\d{3})/', $statusLine, $m)) {
            return (int) $m[1];
        }
        return 0;
    }

    /**
     * Authenticate a session token against the PHP API.
     *
     * @param string $token Session token
     * @return array|null User object or null on failure
     */
    public function authenticate(string $token): ?array
    {
        // Check cache
        if (isset($this->cache[$token])) {
            $entry = $this->cache[$token];
            if ((microtime(true) - $entry['timestamp']) < $this->cacheTTL) {
                return $entry['user'];
            }
            unset($this->cache[$token]);
        }

        $url = $this->apiBase . '/api/v2/auth/me';

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Authorization: Bearer $token\r\nAccept: application/json\r\n",
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            return null;
        }

        // Verify HTTP 200 using strict numeric status extraction
        $statusLine = $http_response_header[0] ?? '';
        if (self::extractHttpStatus($statusLine) !== 200) {
            return null;
        }

        // /auth/me responds with { user: {...} }; accept a flat user object
        // too so an older backend keeps working.
        $body = json_decode($response, true);
        $user = is_array($body) ? ($body['user'] ?? $body) : null;
        if (!is_array($user) || !isset($user['id'])) {
            return null;
        }

        // Cache the result
        $this->cache[$token] = [
            'user' => $user,
            'timestamp' => microtime(true),
        ];

        return $user;
    }

    /**
     * Re-check a token against the API, distinguishing "definitively
     * invalid" from "couldn't tell". Used by the server's periodic sweep
     * that disconnects sessions whose tokens have *expired* (expiry emits
     * no revocation event, so the revocation poller never sees it).
     *
     * @return bool|null true = still valid, false = invalid/expired (401/403),
     *                   null = indeterminate (API unreachable / unexpected status)
     */
    public function revalidate(string $token): ?bool
    {
        $url = $this->apiBase . '/api/v2/auth/me';

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Authorization: Bearer $token\r\nAccept: application/json\r\n",
                'timeout' => 3,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            return null;
        }

        $status = self::extractHttpStatus($http_response_header[0] ?? '');
        if ($status === 200) {
            return true;
        }
        if ($status === 401 || $status === 403) {
            unset($this->cache[$token]);
            return false;
        }
        return null;
    }

    /**
     * Check if a user can message another user (not blocked).
     *
     * Fails CLOSED: if the backend is unreachable or returns an invalid
     * response, messaging is denied. This prevents block/permission
     * bypass during outages or transient API failures.
     *
     * @param string $token Sender's session token
     * @param string $targetUuid Target user's UUID
     * @return bool
     */
    public function canMessage(string $token, string $targetUuid): bool
    {
        $url = $this->apiBase . '/api/v2/social/can-message/' . urlencode($targetUuid);

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Authorization: Bearer $token\r\nAccept: application/json\r\n",
                'timeout' => 3,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) {
            // Fail closed: deny messaging when the backend is unreachable
            error_log('[WebSocketAuth] canMessage: backend unreachable for target ' . $targetUuid);
            return false;
        }

        // Verify HTTP 200 using strict numeric status extraction
        $statusLine = $http_response_header[0] ?? '';
        if (self::extractHttpStatus($statusLine) !== 200) {
            error_log('[WebSocketAuth] canMessage: non-200 status for target ' . $targetUuid);
            return false;
        }

        $result = json_decode($response, true);
        if (!is_array($result) || !isset($result['can_message'])) {
            // Fail closed: deny on invalid/missing response structure
            error_log('[WebSocketAuth] canMessage: invalid response for target ' . $targetUuid);
            return false;
        }

        return $result['can_message'] !== false;
    }

    /**
     * Invalidate cached auth for a token.
     */
    public function invalidateAuth(string $token): void
    {
        unset($this->cache[$token]);
    }

    /**
     * Clean up expired cache entries.
     */
    public function cleanCache(): void
    {
        $now = microtime(true);
        foreach ($this->cache as $token => $entry) {
            if (($now - $entry['timestamp']) > $this->cacheTTL) {
                unset($this->cache[$token]);
            }
        }
    }
}
