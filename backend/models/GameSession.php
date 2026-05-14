<?php
/**
 * GameSession - Game lobby / playing session.
 */
class GameSession
{
    public static function findById(string $idOrSessionId): ?array
    {
        // Accept either numeric primary key or string session_id
        if (ctype_digit((string) $idOrSessionId)) {
            $row = Database::fetchOne(
                'SELECT * FROM game_sessions WHERE id = ? OR session_id = ?',
                [(int) $idOrSessionId, $idOrSessionId]
            );
        } else {
            $row = Database::fetchOne(
                'SELECT * FROM game_sessions WHERE session_id = ?',
                [$idOrSessionId]
            );
        }
        return $row ? self::hydrate($row) : null;
    }

    public static function list(int $limit = 50, int $offset = 0, ?string $gameId = null, ?string $status = null): array
    {
        $sql = 'SELECT * FROM game_sessions';
        $params = [];
        $conds = [];

        if ($gameId !== null && $gameId !== '') {
            $conds[] = 'game_id = ?';
            $params[] = $gameId;
        }
        if ($status !== null && $status !== '') {
            $conds[] = 'status = ?';
            $params[] = $status;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        $rows = Database::fetchAll($sql, $params);
        return array_map([self::class, 'hydrate'], $rows);
    }

    public static function count(?string $gameId = null, ?string $status = null): int
    {
        $sql = 'SELECT COUNT(*) FROM game_sessions';
        $params = [];
        $conds = [];

        if ($gameId !== null && $gameId !== '') {
            $conds[] = 'game_id = ?';
            $params[] = $gameId;
        }
        if ($status !== null && $status !== '') {
            $conds[] = 'status = ?';
            $params[] = $status;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }

        return (int) Database::fetchColumn($sql, $params);
    }

    public static function create(string $sessionId, string $gameId, int $hostUserId, array $opts = []): array
    {
        $settings = json_encode($opts['settings'] ?? new \stdClass());
        $maxPlayers = (int) ($opts['max_players'] ?? 0);
        $isPrivate = (bool) ($opts['is_private'] ?? false);
        $passwordHash = null;
        if (!empty($opts['password'])) {
            $passwordHash = password_hash($opts['password'], PASSWORD_BCRYPT, ['cost' => 10]);
        }

        $id = Database::insert(
            'INSERT INTO game_sessions (session_id, game_id, host_user_id, status, settings, max_players, is_private, password_hash, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [$sessionId, $gameId, $hostUserId, 'waiting', $settings, $maxPlayers, $isPrivate ? 1 : 0, $passwordHash]
        );

        return self::findById((string) $id);
    }

    public static function updateStatus($id, string $status): bool
    {
        // $id can be int (primary) or string (session_id) — find first
        $session = self::findById((string) $id);
        if (!$session) return false;

        $sets = ['status = ?'];
        $params = [$status];
        if ($status === 'playing' || $status === 'active') {
            $sets[] = 'started_at = NOW()';
        } elseif ($status === 'finished') {
            $sets[] = 'ended_at = NOW()';
        }
        $params[] = $session['id'];

        return Database::execute(
            'UPDATE game_sessions SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function verifyPassword($id, string $password): bool
    {
        $row = Database::fetchOne(
            'SELECT password_hash FROM game_sessions WHERE id = ? OR session_id = ?',
            [$id, $id]
        );
        if (!$row || empty($row['password_hash'])) return false;
        return password_verify($password, $row['password_hash']);
    }

    private static function hydrate(array $row): array
    {
        $settings = $row['settings'] ?? '{}';
        if (is_string($settings)) {
            $decoded = json_decode($settings, true);
            $settings = is_array($decoded) ? $decoded : [];
        }
        $row['settings'] = $settings;
        $row['is_private'] = (bool) ($row['is_private'] ?? 0);
        return $row;
    }
}
