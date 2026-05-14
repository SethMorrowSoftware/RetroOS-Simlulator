<?php
/**
 * Event - System event log. Backs SSE streaming and webhook dispatch.
 */
class Event
{
    /**
     * Record an event. Returns the new event ID.
     */
    public static function record(string $eventType, array $payload, ?int $userId = null): int
    {
        $id = Database::insert(
            'INSERT INTO event_log (event_type, payload, user_id, created_at)
             VALUES (?, ?, ?, NOW())',
            [
                $eventType,
                json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                $userId,
            ]
        );
        return $id;
    }

    /**
     * Fetch events newer than $sinceId, up to $limit.
     */
    public static function since(int $sinceId, int $limit = 50): array
    {
        $rows = Database::fetchAll(
            'SELECT id, event_type, payload, user_id, created_at
             FROM event_log
             WHERE id > ?
             ORDER BY id ASC
             LIMIT ' . (int) $limit,
            [$sinceId]
        );

        foreach ($rows as &$row) {
            if (isset($row['payload']) && is_string($row['payload'])) {
                $decoded = json_decode($row['payload'], true);
                $row['payload'] = is_array($decoded) ? $decoded : [];
            }
        }
        return $rows;
    }

    /**
     * Get the highest event ID currently in the log.
     */
    public static function getLatestId(): int
    {
        $val = Database::fetchColumn('SELECT IFNULL(MAX(id), 0) FROM event_log');
        return (int) ($val ?? 0);
    }

    /**
     * Count events of a given type (or all if $type === '*') within the last N minutes.
     */
    public static function countRecent(string $type, int $minutes): int
    {
        $cutoff = date('Y-m-d H:i:s', time() - $minutes * 60);
        if ($type === '*') {
            return (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM event_log WHERE created_at >= ?',
                [$cutoff]
            );
        }
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM event_log WHERE event_type = ? AND created_at >= ?',
            [$type, $cutoff]
        );
    }

    /**
     * Purge events older than $days.
     */
    public static function purge(int $days = 30): int
    {
        return Database::execute(
            'DELETE FROM event_log WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
            [$days]
        );
    }
}
