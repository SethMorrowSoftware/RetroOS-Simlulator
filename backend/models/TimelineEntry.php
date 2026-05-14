<?php
/**
 * TimelineEntry - A scheduled or recorded narrative event on a campaign timeline.
 *
 * Timeline entries can be:
 *   - "scheduled": fire at scheduled_at (worker/cron picks them up)
 *   - "manual":    fired on demand from the admin UI
 *   - "fired":     already dispatched (history record)
 *
 * Each entry maps to an event_type + payload that flows through EventService::dispatch().
 */
class TimelineEntry
{
    public const STATE_SCHEDULED = 'scheduled';
    public const STATE_FIRED     = 'fired';
    public const STATE_CANCELLED = 'cancelled';

    public static function list(?int $campaignId = null, ?string $state = null, int $limit = 100, int $offset = 0): array
    {
        $sql = 'SELECT t.*, c.name AS campaign_name, c.slug AS campaign_slug
                FROM timeline_entries t
                LEFT JOIN campaigns c ON c.id = t.campaign_id';
        $params = [];
        $conds = [];

        if ($campaignId !== null) {
            $conds[] = 't.campaign_id = ?';
            $params[] = $campaignId;
        }
        if ($state !== null && $state !== '') {
            $conds[] = 't.state = ?';
            $params[] = $state;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }
        $sql .= ' ORDER BY t.scheduled_at IS NULL, t.scheduled_at ASC, t.id DESC';
        $sql .= ' LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        return array_map([self::class, 'hydrate'], Database::fetchAll($sql, $params));
    }

    public static function count(?int $campaignId = null, ?string $state = null): int
    {
        $sql = 'SELECT COUNT(*) FROM timeline_entries';
        $params = [];
        $conds = [];

        if ($campaignId !== null) {
            $conds[] = 'campaign_id = ?';
            $params[] = $campaignId;
        }
        if ($state !== null && $state !== '') {
            $conds[] = 'state = ?';
            $params[] = $state;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }

        return (int) Database::fetchColumn($sql, $params);
    }

    public static function findById(int $id): ?array
    {
        $row = Database::fetchOne(
            'SELECT t.*, c.name AS campaign_name, c.slug AS campaign_slug
             FROM timeline_entries t
             LEFT JOIN campaigns c ON c.id = t.campaign_id
             WHERE t.id = ?',
            [$id]
        );
        return $row ? self::hydrate($row) : null;
    }

    /**
     * Get entries that are due to fire (state='scheduled' AND scheduled_at <= NOW()).
     */
    public static function due(int $limit = 50): array
    {
        $rows = Database::fetchAll(
            'SELECT * FROM timeline_entries
             WHERE state = ? AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()
             ORDER BY scheduled_at ASC
             LIMIT ' . (int) $limit,
            [self::STATE_SCHEDULED]
        );
        return array_map([self::class, 'hydrate'], $rows);
    }

    public static function create(array $data): int
    {
        return Database::insert(
            'INSERT INTO timeline_entries (campaign_id, label, event_type, payload, scheduled_at, state, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                $data['campaign_id'] !== null ? (int) $data['campaign_id'] : null,
                $data['label'] ?? '',
                $data['event_type'],
                json_encode($data['payload'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                $data['scheduled_at'] ?? null,
                $data['state'] ?? self::STATE_SCHEDULED,
                $data['created_by'] ?? null,
            ]
        );
    }

    public static function update(int $id, array $data): bool
    {
        $allowed = ['label', 'event_type', 'scheduled_at', 'state', 'campaign_id'];
        $sets = [];
        $params = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $sets[] = "$key = ?";
                $params[] = $data[$key];
            }
        }

        if (array_key_exists('payload', $data)) {
            $sets[] = 'payload = ?';
            $params[] = json_encode($data['payload'], JSON_UNESCAPED_UNICODE);
        }

        if (empty($sets)) return false;
        $params[] = $id;

        return Database::execute(
            'UPDATE timeline_entries SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function markFired(int $id, ?int $eventId = null): bool
    {
        return Database::execute(
            'UPDATE timeline_entries SET state = ?, fired_at = NOW(), event_id = ? WHERE id = ?',
            [self::STATE_FIRED, $eventId, $id]
        ) > 0;
    }

    public static function delete(int $id): bool
    {
        return Database::execute('DELETE FROM timeline_entries WHERE id = ?', [$id]) > 0;
    }

    private static function hydrate(array $row): array
    {
        $payload = $row['payload'] ?? '{}';
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        }
        return [
            'id'             => (int) $row['id'],
            'campaign_id'    => $row['campaign_id'] !== null ? (int) $row['campaign_id'] : null,
            'campaign_name'  => $row['campaign_name'] ?? null,
            'campaign_slug'  => $row['campaign_slug'] ?? null,
            'label'          => $row['label'] ?? '',
            'event_type'     => $row['event_type'],
            'payload'        => $payload,
            'scheduled_at'   => $row['scheduled_at'] ?? null,
            'fired_at'       => $row['fired_at'] ?? null,
            'state'          => $row['state'] ?? self::STATE_SCHEDULED,
            'event_id'       => $row['event_id'] !== null ? (int) $row['event_id'] : null,
            'created_by'     => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'created_at'     => $row['created_at'] ?? null,
        ];
    }
}
