<?php
/**
 * GamePlayer - Players in a game session.
 */
class GamePlayer
{
    public static function join(int $sessionId, int $userId, string $role = 'player'): void
    {
        try {
            Database::insert(
                'INSERT INTO game_players (session_id, user_id, role, score, joined_at)
                 VALUES (?, ?, ?, 0, NOW())',
                [$sessionId, $userId, $role]
            );
        } catch (\Throwable $e) {
            // Possible duplicate — ignore
        }
    }

    public static function leave(int $sessionId, int $userId): bool
    {
        return Database::execute(
            'DELETE FROM game_players WHERE session_id = ? AND user_id = ?',
            [$sessionId, $userId]
        ) > 0;
    }

    public static function isInSession(int $sessionId, int $userId): bool
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM game_players WHERE session_id = ? AND user_id = ?',
            [$sessionId, $userId]
        ) > 0;
    }

    public static function count(int $sessionId): int
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM game_players WHERE session_id = ?',
            [$sessionId]
        );
    }

    public static function listBySession(int $sessionId): array
    {
        return Database::fetchAll(
            'SELECT gp.user_id, gp.role, gp.score, gp.joined_at,
                    u.uuid AS user_uuid, u.display_name
             FROM game_players gp
             JOIN users u ON u.id = gp.user_id
             WHERE gp.session_id = ?
             ORDER BY gp.joined_at ASC',
            [$sessionId]
        );
    }

    public static function updateScore(int $sessionId, int $userId, int $score): bool
    {
        return Database::execute(
            'UPDATE game_players SET score = ? WHERE session_id = ? AND user_id = ?',
            [$score, $sessionId, $userId]
        ) > 0;
    }
}
