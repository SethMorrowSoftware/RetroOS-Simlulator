<?php
/**
 * Session - Auth session record. One row per active token.
 */
class Session
{
    public static function findByToken(string $token): ?array
    {
        return Database::fetchOne(
            'SELECT * FROM sessions WHERE token = ? AND (expires_at IS NULL OR expires_at > NOW())',
            [$token]
        );
    }

    /**
     * Create a session for a user. Returns ['token' => ..., ...].
     */
    public static function create(int $userId, int $lifetimeSeconds = 86400): array
    {
        $token = generateToken(64);
        $expiresAt = date('Y-m-d H:i:s', time() + $lifetimeSeconds);

        Database::insert(
            'INSERT INTO sessions (token, user_id, created_at, expires_at)
             VALUES (?, ?, NOW(), ?)',
            [$token, $userId, $expiresAt]
        );

        return [
            'token'      => $token,
            'user_id'    => $userId,
            'created_at' => date('c'),
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * Extend a session's expiration. Useful for sliding sessions.
     */
    public static function extend(string $token, int $lifetimeSeconds = 86400): bool
    {
        $expiresAt = date('Y-m-d H:i:s', time() + $lifetimeSeconds);
        return Database::execute(
            'UPDATE sessions SET expires_at = ? WHERE token = ?',
            [$expiresAt, $token]
        ) > 0;
    }

    /**
     * Invalidate a single session (logout).
     *
     * The full payload (including `token`) is recorded in event_log so the
     * internal /auth/revocations endpoint can drive the WebSocket server's
     * graceful disconnect. The `token` field is stripped from outgoing SSE
     * and webhook deliveries by EventService::sanitizeForExternal so it is
     * never visible to clients or webhook receivers; `token_fingerprint`
     * is what they get instead.
     */
    public static function invalidate(string $token): bool
    {
        $row = Database::fetchOne('SELECT user_id FROM sessions WHERE token = ?', [$token]);
        $userId = $row ? (int) $row['user_id'] : 0;

        $affected = Database::execute('DELETE FROM sessions WHERE token = ?', [$token]) > 0;

        if ($affected) {
            try {
                EventService::dispatch('session.revoked', [
                    'token'             => $token,
                    'token_fingerprint' => self::fingerprint($token),
                    'user_id'           => $userId,
                    'reason'            => 'logout',
                ], $userId);
            } catch (\Throwable $e) {
                // Non-fatal
            }
        }

        return $affected;
    }

    /**
     * Invalidate all sessions for a user (admin force-logout).
     */
    public static function invalidateAllForUser(int $userId, string $reason = 'admin_evict'): int
    {
        $tokens = Database::fetchAll(
            'SELECT token FROM sessions WHERE user_id = ?',
            [$userId]
        );

        $count = Database::execute('DELETE FROM sessions WHERE user_id = ?', [$userId]);

        foreach ($tokens as $row) {
            try {
                EventService::dispatch('session.evicted', [
                    'token'             => $row['token'],
                    'token_fingerprint' => self::fingerprint((string) $row['token']),
                    'user_id'           => $userId,
                    'reason'            => $reason,
                ], $userId);
            } catch (\Throwable $e) {
                // Non-fatal
            }
        }

        return $count;
    }

    /**
     * Short non-reversible fingerprint for correlating revocation events with
     * live sockets without leaking the token itself. Truncated SHA-256 hex.
     */
    private static function fingerprint(string $token): string
    {
        return substr(hash('sha256', $token), 0, 12);
    }

    /**
     * Purge expired sessions. Called probabilistically by the API entry point.
     */
    public static function purgeExpired(): int
    {
        return Database::execute(
            'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= NOW()'
        );
    }
}
