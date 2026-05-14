<?php
/**
 * Middleware - Request middleware for the v2 API.
 *
 * Provides:
 *   - parseJsonBody()       : populate $GLOBALS['requestBody']
 *   - requireCsrf()         : require X-Requested-With on mutating requests
 *   - auth(bool $required)  : set currentUser from Bearer token
 *   - requireRole(...$roles): ensure current user has one of the roles
 *   - rateLimit($n, $window): sliding-window per-IP rate limit
 *   - setJsonHeaders()      : set common JSON response headers
 *
 * Middleware here are returned as callables so they can be queued in the Router.
 */
class Middleware
{
    /** Always emit JSON + security headers. */
    public static function setJsonHeaders(): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: same-origin');
        header('Cache-Control: no-store');
    }

    /**
     * Parse the JSON request body into $GLOBALS['requestBody'].
     * Reuses the body cached by the API entry point (if present).
     */
    public static function parseJsonBody(): callable
    {
        return function (array $params): void {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
                return;
            }

            $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
            // Skip multipart — handled by $_FILES / $_POST.
            if (str_starts_with($contentType, 'multipart/form-data')) {
                $GLOBALS['requestBody'] = $_POST;
                return;
            }

            $raw = $GLOBALS['RAW_REQUEST_BODY_V2'] ?? null;
            if ($raw === null) {
                $raw = file_get_contents('php://input');
            }

            if (!is_string($raw) || $raw === '') {
                $GLOBALS['requestBody'] = [];
                return;
            }

            // Cap body size at 512 KB to prevent abuse
            if (strlen($raw) > 524288) {
                jsonError('Request body too large (max 512KB)', 413);
            }

            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                $GLOBALS['requestBody'] = [];
                return;
            }

            $GLOBALS['requestBody'] = $decoded;
        };
    }

    /**
     * Require the X-Requested-With header on mutating requests.
     * This is a same-origin sentinel: cross-origin requests cannot set
     * custom headers without triggering a CORS preflight, so the header's
     * presence proves the request originated from same-origin code.
     */
    public static function requireCsrf(): callable
    {
        return function (array $params): void {
            $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
            if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
                return;
            }

            $xrw = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? '';
            $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
            if ($xrw === '' && $csrf === '') {
                jsonError('Missing CSRF sentinel header', 403);
            }
        };
    }

    /**
     * Authenticate via Bearer token. Populates $GLOBALS['currentUser'] and
     * $GLOBALS['currentSession']. When $required is true, fails with 401
     * if no valid token is present.
     */
    public static function auth(bool $required): callable
    {
        return function (array $params) use ($required): void {
            $token = self::extractBearerToken();

            if ($token === null) {
                if ($required) {
                    jsonError('Authentication required', 401);
                }
                $GLOBALS['currentUser'] = null;
                $GLOBALS['currentSession'] = null;
                return;
            }

            $session = Session::findByToken($token);
            if (!$session) {
                if ($required) {
                    jsonError('Invalid or expired session', 401);
                }
                $GLOBALS['currentUser'] = null;
                $GLOBALS['currentSession'] = null;
                return;
            }

            $user = User::findById((int) $session['user_id']);
            if (!$user) {
                if ($required) {
                    jsonError('Session user not found', 401);
                }
                return;
            }

            $GLOBALS['currentUser']    = $user;
            $GLOBALS['currentSession'] = $session;
        };
    }

    /**
     * Require the current user to have one of the given roles.
     */
    public static function requireRole(string ...$roles): callable
    {
        return function (array $params) use ($roles): void {
            $user = currentUser();
            if (!$user) {
                jsonError('Authentication required', 401);
            }
            $userRole = $user['role'] ?? 'user';
            if (!in_array($userRole, $roles, true)) {
                jsonError('Insufficient permissions', 403);
            }
        };
    }

    /**
     * Sliding-window rate limit, keyed by IP + endpoint.
     * Uses file-based storage with flock() to avoid race conditions.
     *
     * @param int $limit    Max requests in the window
     * @param int $window   Window size in seconds
     */
    public static function rateLimit(int $limit, int $window): callable
    {
        return function (array $params) use ($limit, $window): void {
            $env = $GLOBALS['_env_cache'] ?? null;
            if ($env === null) {
                $env = require __DIR__ . '/env.php';
                $GLOBALS['_env_cache'] = $env;
            }

            if (empty($env['rate_limit']['enabled'])) {
                return;
            }

            $storageDir = $env['rate_limit']['storage_path']
                ?? __DIR__ . '/../data/rate_limits';

            if (!is_dir($storageDir)) {
                @mkdir($storageDir, 0700, true);
            }

            $ip = self::clientIp();
            $route = $_SERVER['REQUEST_URI'] ?? '/';
            // Bucket by IP + first 2 path segments to share limits across
            // similar endpoints without leaking across resources.
            $key = sha1($ip . '|' . parse_url($route, PHP_URL_PATH));
            $file = $storageDir . '/' . substr($key, 0, 16) . '.json';

            $fp = @fopen($file, 'c+');
            if (!$fp) {
                // If we can't open the rate-limit file, fail open to avoid
                // breaking the API. Operators see the error in logs.
                error_log('[rate_limit] Cannot open file: ' . $file);
                return;
            }

            try {
                if (!flock($fp, LOCK_EX)) {
                    return;
                }

                $now = time();
                $cutoff = $now - $window;

                $raw = stream_get_contents($fp);
                $hits = $raw ? json_decode($raw, true) : [];
                if (!is_array($hits)) $hits = [];

                // Drop hits outside the window
                $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $cutoff));

                if (count($hits) >= $limit) {
                    header('Retry-After: ' . max(1, $window - ($now - min($hits))));
                    jsonError('Rate limit exceeded', 429);
                }

                $hits[] = $now;

                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, json_encode($hits));
            } finally {
                @flock($fp, LOCK_UN);
                @fclose($fp);
            }
        };
    }

    /**
     * Extract the Bearer token from the Authorization header.
     */
    public static function extractBearerToken(): ?string
    {
        // Some PHP SAPIs strip Authorization — try multiple sources
        $auth = $_SERVER['HTTP_AUTHORIZATION']
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? '';

        if ($auth === '' && function_exists('getallheaders')) {
            $headers = getallheaders();
            if (is_array($headers)) {
                $auth = $headers['Authorization'] ?? $headers['authorization'] ?? '';
            }
        }

        if (is_string($auth) && preg_match('/^Bearer\s+(.+)$/i', trim($auth), $m)) {
            return trim($m[1]);
        }

        return null;
    }

    /**
     * Best-effort client IP, respecting trusted proxy headers.
     */
    public static function clientIp(): string
    {
        // Only trust X-Forwarded-For if explicitly enabled in env
        $env = $GLOBALS['_env_cache'] ?? require __DIR__ . '/env.php';
        $trustProxy = !empty($env['app']['trust_proxy']);

        if ($trustProxy && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
            $ip = trim($parts[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
    }
}
