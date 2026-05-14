<?php
/**
 * Leaderboard - Per-game high-score table.
 */
class Leaderboard
{
    public static function record(string $gameId, int $userId, int $score, string $status = 'finished', $sessionId = null): int
    {
        return Database::insert(
            'INSERT INTO leaderboards (game_id, user_id, score, status, session_id, recorded_at)
             VALUES (?, ?, ?, ?, ?, NOW())',
            [$gameId, $userId, $score, $status, $sessionId !== null ? (string) $sessionId : null]
        );
    }

    public static function topScores(string $gameId, int $limit = 25, int $offset = 0, string $period = 'all'): array
    {
        $params = [$gameId];
        $where = 'l.game_id = ?';

        switch ($period) {
            case 'daily':   $where .= ' AND l.recorded_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';   break;
            case 'weekly':  $where .= ' AND l.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';   break;
            case 'monthly': $where .= ' AND l.recorded_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';  break;
        }

        return Database::fetchAll(
            "SELECT l.id, l.user_id, u.display_name, u.uuid AS user_uuid,
                    l.score, l.recorded_at, l.status, l.session_id
             FROM leaderboards l
             JOIN users u ON u.id = l.user_id
             WHERE $where
             ORDER BY l.score DESC, l.recorded_at ASC
             LIMIT " . (int) $limit . ' OFFSET ' . (int) $offset,
            $params
        );
    }

    public static function count(string $gameId): int
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM leaderboards WHERE game_id = ?',
            [$gameId]
        );
    }
}
