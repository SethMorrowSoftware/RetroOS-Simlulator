<?php
/**
 * AuthController - Handles authentication for the v2 API.
 *
 * Supports:
 * - Anonymous session creation (auto-create user on first visit)
 * - Account upgrade (anonymous → registered with displayName + password)
 * - Login with displayName + password
 * - Session management (check, logout)
 */
class AuthController
{
    /**
     * POST /auth/session
     * Create an anonymous user and session, or resume existing session.
     */
    public function createSession(array $params): void
    {
        Middleware::rateLimit(30, 60)($params); // 30 session creations per minute per IP

        // Check if a valid token was provided (resume existing session)
        $existingToken = $this->extractToken();
        if ($existingToken) {
            $session = Session::findByToken($existingToken);
            if ($session) {
                // Extend the session
                Session::extend($existingToken, $this->sessionLifetime());

                $user = User::findById((int) $session['user_id']);
                jsonResponse([
                    'token' => $existingToken,
                    'user'  => User::toPublic($user),
                    'resumed' => true,
                ]);
                return;
            }
        }

        // Create new anonymous user + session
        $user = User::createAnonymous();
        $session = Session::create((int) $user['id'], $this->sessionLifetime());

        AuditLog::log('user.created', (int) $user['id'], 'user', $user['uuid'], [
            'type' => 'anonymous',
        ]);

        jsonResponse([
            'token' => $session['token'],
            'user'  => User::toPublic($user),
            'resumed' => false,
        ], 201);
    }

    /**
     * POST /auth/register
     * Upgrade an anonymous account to a registered one.
     */
    public function register(array $params): void
    {
        Middleware::rateLimit(5, 900)($params); // 5 registrations per 15 minutes per IP

        // Authenticate first
        Middleware::auth(true)($params);

        $user = currentUser();
        if (!$user || !$user['is_anonymous']) {
            jsonError('Only anonymous accounts can be upgraded', 400);
        }

        $displayName = input('displayName', '');
        $password = input('password', '');

        // Validate
        if (empty($displayName) || strlen($displayName) < 2 || strlen($displayName) > 64) {
            jsonError('Display name must be between 2 and 64 characters');
        }

        if (strlen($password) < 8) {
            jsonError('Password must be at least 8 characters');
        }

        // Require at least one lowercase, one uppercase, and one digit
        if (!preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password) || !preg_match('/[0-9]/', $password)) {
            jsonError('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }

        // Check for duplicate display name
        if (User::findByDisplayName($displayName)) {
            jsonError('Display name is already taken', 409);
        }

        // Sanitize display name (alphanumeric, spaces, hyphens, underscores)
        if (!preg_match('/^[a-zA-Z0-9 _-]+$/', $displayName)) {
            jsonError('Display name can only contain letters, numbers, spaces, hyphens, and underscores');
        }

        $success = User::upgrade($user['id'], $displayName, $password);
        if (!$success) {
            jsonError('Failed to upgrade account', 500);
        }

        $updatedUser = User::findById($user['id']);

        AuditLog::log('user.upgraded', $user['id'], 'user', $user['uuid'], [
            'display_name' => $displayName,
        ]);

        // Dispatch event for webhooks/SSE
        EventService::dispatch('user.upgraded', [
            'uuid'         => $user['uuid'],
            'display_name' => $displayName,
        ], $user['id']);

        jsonResponse([
            'success' => true,
            'user'    => User::toPublic($updatedUser),
        ]);
    }

    /**
     * POST /auth/login
     * Login with display name and password.
     */
    public function login(array $params): void
    {
        Middleware::rateLimit(10, 900)($params); // 10 attempts per 15 minutes

        $displayName = input('displayName', '');
        $password = input('password', '');

        if (empty($displayName) || empty($password)) {
            jsonError('Display name and password are required');
        }

        $user = User::findByDisplayName($displayName);
        if (!$user || !password_verify($password, $user['password_hash'])) {
            jsonError('Invalid credentials', 401);
        }

        $session = Session::create((int) $user['id'], $this->sessionLifetime());

        AuditLog::log('user.login', (int) $user['id'], 'user', $user['uuid']);

        EventService::dispatch('user.login', [
            'uuid'         => $user['uuid'],
            'display_name' => $user['display_name'],
        ], (int) $user['id']);

        jsonResponse([
            'token' => $session['token'],
            'user'  => User::toPublic($user),
        ]);
    }

    /**
     * POST /auth/logout
     * Invalidate the current session.
     */
    public function logout(array $params): void
    {
        $token = $this->extractToken();
        if ($token) {
            Session::invalidate($token);
        }

        jsonResponse(['success' => true]);
    }

    /**
     * GET /auth/me
     * Get current user info.
     */
    public function me(array $params): void
    {
        Middleware::auth(true)($params);
        $user = User::findById(currentUser()['id']);

        if (!$user) {
            jsonError('User not found', 404);
        }

        jsonResponse(['user' => User::toPublic($user)]);
    }

    /**
     * PUT /auth/me
     * Update current user's profile (display_name, preferences).
     */
    public function updateMe(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $updates = [];

        $displayName = input('displayName');
        if ($displayName !== null) {
            if (strlen($displayName) < 2 || strlen($displayName) > 64) {
                jsonError('Display name must be between 2 and 64 characters');
            }
            if (!preg_match('/^[a-zA-Z0-9 _-]+$/', $displayName)) {
                jsonError('Display name contains invalid characters');
            }
            // Check uniqueness (exclude self)
            $existing = User::findByDisplayName($displayName);
            if ($existing && (int) $existing['id'] !== $user['id']) {
                jsonError('Display name is already taken', 409);
            }
            $updates['display_name'] = $displayName;
        }

        $preferences = input('preferences');
        if ($preferences !== null) {
            if (!is_array($preferences)) {
                jsonError('Preferences must be an object');
            }
            $updates['preferences'] = $preferences;
        }

        if (empty($updates)) {
            jsonError('No fields to update');
        }

        User::update($user['id'], $updates);
        $updatedUser = User::findById($user['id']);

        jsonResponse([
            'success' => true,
            'user'    => User::toPublic($updatedUser),
        ]);
    }

    /**
     * GET /auth/revocations
     * Returns recently revoked / evicted session tokens for realtime
     * subscribers (WebSocket server) so they can drop matching sockets
     * without waiting for the auth cache to expire.
     *
     * Query params:
     *   ?since=<event_id>  Return only events with id > since (default: 0)
     *   ?limit=<n>         Cap the number of returned rows (default: 200, max: 500)
     *
     * Response: { lastEventId, revocations: [{ token, user_id, reason, type, event_id }] }
     *
     * Auth: requires the shared websocket-auth secret in the
     * X-Internal-Auth header (configured via env.app.internal_secret).
     * This endpoint never reveals the underlying session payloads;
     * callers receive only opaque tokens that they already manage.
     */
    public function revocations(array $params): void
    {
        // Internal-only endpoint — protect with shared secret instead of
        // user auth so the WS server doesn't need to mint a session.
        $env = require __DIR__ . '/../env.php';
        $expected = (string) ($env['app']['internal_secret'] ?? '');
        $provided = (string) ($_SERVER['HTTP_X_INTERNAL_AUTH'] ?? '');

        if ($expected === '' || !hash_equals($expected, $provided)) {
            jsonError('Forbidden', 403);
        }

        $since = max(0, (int) ($_GET['since'] ?? 0));
        $limit = max(1, min(500, (int) ($_GET['limit'] ?? 200)));
        $seedOnly = !empty($_GET['seed']);

        // Seed mode: callers just want the current watermark so they can
        // advance their cursor past historical events on startup. We can
        // safely anchor to MAX(id) here because we're not delivering any
        // rows yet (the caller hasn't started polling).
        if ($seedOnly) {
            $currentMax = (int) (Database::fetchColumn('SELECT IFNULL(MAX(id), 0) FROM event_log') ?? 0);
            jsonResponse([
                'lastEventId' => $currentMax,
                'revocations' => [],
            ]);
        }

        $rows = Database::fetchAll(
            'SELECT id, event_type, payload
             FROM event_log
             WHERE id > ? AND event_type IN (?, ?)
             ORDER BY id ASC
             LIMIT ' . ($limit + 1),
            [$since, 'session.revoked', 'session.evicted']
        );

        // Detect whether more revocation rows exist beyond this page. When
        // they do, the caller MUST NOT advance its cursor past the last
        // delivered row — otherwise undelivered revocations would be
        // silently skipped and affected sockets would stay connected.
        $hasMore = count($rows) > $limit;
        if ($hasMore) {
            $rows = array_slice($rows, 0, $limit);
        }

        $out = [];
        $maxDeliveredId = $since;
        foreach ($rows as $row) {
            $payload = json_decode($row['payload'] ?? '[]', true) ?: [];
            $token = (string) ($payload['token'] ?? '');
            $rowId = (int) $row['id'];
            if ($token === '') continue;
            $out[] = [
                'event_id' => $rowId,
                'type'     => $row['event_type'],
                'token'    => $token,
                'user_id'  => (int) ($payload['user_id'] ?? 0),
                'reason'   => (string) ($payload['reason'] ?? ''),
            ];
            if ($rowId > $maxDeliveredId) $maxDeliveredId = $rowId;
        }

        // When the page was capped, advance only to the last delivered
        // revocation's id. When the page was NOT capped, advance to the
        // current event_log MAX(id) so the cursor moves past unrelated
        // events too (cheap, bounded, avoids unnecessary repolls).
        if ($hasMore) {
            $lastEventId = $maxDeliveredId;
        } else {
            $currentMax = (int) (Database::fetchColumn('SELECT IFNULL(MAX(id), 0) FROM event_log') ?? 0);
            $lastEventId = max($maxDeliveredId, $currentMax);
        }

        jsonResponse([
            'lastEventId' => $lastEventId,
            'revocations' => $out,
            'hasMore'     => $hasMore,
        ]);
    }

    /**
     * GET /auth/check
     * Check if the current session is valid (lightweight).
     */
    public function check(array $params): void
    {
        Middleware::auth(false)($params);
        $user = currentUser();

        jsonResponse([
            'authenticated' => $user !== null,
            'user'          => $user ? User::toPublic(User::findById($user['id'])) : null,
        ]);
    }

    /**
     * Get the configured session lifetime in seconds.
     */
    private function sessionLifetime(): int
    {
        static $lifetime = null;
        if ($lifetime === null) {
            $env = require __DIR__ . '/../env.php';
            $lifetime = $env['app']['session_lifetime'] ?? 86400;
        }
        return $lifetime;
    }

    /**
     * Extract Bearer token from the request.
     * Delegates to the canonical implementation in Middleware.
     */
    private function extractToken(): ?string
    {
        return Middleware::extractBearerToken();
    }
}
