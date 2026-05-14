<?php
/**
 * Room - Multiplayer / chat room metadata.
 */
class Room
{
    public static function findById(string $id): ?array
    {
        $row = Database::fetchOne('SELECT * FROM multiplayer_rooms WHERE id = ?', [$id]);
        return $row ? self::hydrate($row) : null;
    }

    public static function list(int $limit = 50, int $offset = 0, ?string $roomType = null, bool $publicOnly = false): array
    {
        $sql = 'SELECT * FROM multiplayer_rooms';
        $params = [];
        $conds = [];

        if ($roomType !== null && $roomType !== '') {
            $conds[] = 'room_type = ?';
            $params[] = $roomType;
        }
        if ($publicOnly) {
            $conds[] = 'is_private = 0';
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        $rows = Database::fetchAll($sql, $params);
        return array_map([self::class, 'hydrate'], $rows);
    }

    public static function count(?string $roomType = null): int
    {
        if ($roomType === null) {
            return (int) Database::fetchColumn('SELECT COUNT(*) FROM multiplayer_rooms');
        }
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM multiplayer_rooms WHERE room_type = ?',
            [$roomType]
        );
    }

    public static function create(string $id, string $roomType, int $hostUserId, array $opts = []): ?array
    {
        $maxPlayers = (int) ($opts['max_players'] ?? 0);
        $isPrivate = (bool) ($opts['is_private'] ?? false);
        $isPersistent = (bool) ($opts['is_persistent'] ?? false);
        $passwordHash = null;
        if (!empty($opts['password'])) {
            $passwordHash = password_hash($opts['password'], PASSWORD_BCRYPT, ['cost' => 10]);
        }
        $metadata = json_encode($opts['metadata'] ?? new \stdClass());

        try {
            Database::insert(
                'INSERT INTO multiplayer_rooms (id, room_type, host_user_id, max_players, is_private, is_persistent, password_hash, metadata, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [$id, $roomType, $hostUserId, $maxPlayers, $isPrivate ? 1 : 0, $isPersistent ? 1 : 0, $passwordHash, $metadata]
            );
        } catch (\Throwable $e) {
            return null;
        }
        return self::findById($id);
    }

    public static function delete(string $id): bool
    {
        return Database::execute('DELETE FROM multiplayer_rooms WHERE id = ?', [$id]) > 0;
    }

    public static function toPublic(array $room): array
    {
        $metadata = $room['metadata'] ?? '{}';
        if (is_string($metadata)) {
            $decoded = json_decode($metadata, true);
            $metadata = is_array($decoded) ? $decoded : [];
        }
        return [
            'id'             => $room['id'],
            'room_type'      => $room['room_type'],
            'host_user_id'   => (int) $room['host_user_id'],
            'max_players'    => (int) ($room['max_players'] ?? 0),
            'is_private'     => (bool) ($room['is_private'] ?? false),
            'is_persistent'  => (bool) ($room['is_persistent'] ?? false),
            'metadata'       => $metadata,
            'created_at'     => $room['created_at'] ?? null,
        ];
    }

    private static function hydrate(array $row): array
    {
        $row['is_private'] = (bool) ($row['is_private'] ?? 0);
        $row['is_persistent'] = (bool) ($row['is_persistent'] ?? 0);
        return $row;
    }
}
