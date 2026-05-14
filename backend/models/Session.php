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
     */
    public static function invalidate(string $token): bool
    {
        // Capture the user_id before deleting so the event-log payload is intact
        $row = Database::fetchOne('SELECT user_id FROM sessions WHERE token = ?', [$token]);
        $userId = $row ? (int) $row['user_id'] : 0;

        $affected = Database::execute('DELETE FROM sessions WHERE token = ?', [$token]) > 0;

        if ($affected) {
            // Log the revocation so the WebSocket server can drop matching sockets
            try {
                EventService::dispatch('session.revoked', [
                    'token'   => $token,
                    'user_id' => $userId,
                    'reason'  => 'logout',
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
                    'token'   => $row['token'],
                    'user_id' => $userId,
                    'reason'  => $reason,
                ], $userId);
            } catch (\Throwable $e) {
                // Non-fatal
            }
        }

        return $count;
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
