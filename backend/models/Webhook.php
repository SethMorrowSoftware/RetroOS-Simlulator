<?php
/**
 * Webhook - Outbound event subscription configuration.
 *
 * Webhooks subscribe to event types. When an event of that type is dispatched,
 * WebhookDispatcher POSTs the payload to the configured URL.
 */
class Webhook
{
    public static function list(): array
    {
        $rows = Database::fetchAll(
            'SELECT * FROM webhooks ORDER BY created_at DESC'
        );
        foreach ($rows as &$row) {
            $row = self::hydrate($row);
        }
        return $rows;
    }

    public static function findById(int $id): ?array
    {
        $row = Database::fetchOne('SELECT * FROM webhooks WHERE id = ?', [$id]);
        return $row ? self::hydrate($row) : null;
    }

    /**
     * List webhooks subscribed to a specific event type.
     */
    public static function findForEventType(string $eventType): array
    {
        $rows = Database::fetchAll(
            'SELECT * FROM webhooks WHERE active = 1 ORDER BY id ASC'
        );

        $matching = [];
        foreach ($rows as $row) {
            $row = self::hydrate($row);
            if (self::eventMatches($row['events'], $eventType)) {
                $matching[] = $row;
            }
        }
        return $matching;
    }

    public static function create(array $data): int
    {
        return Database::insert(
            'INSERT INTO webhooks (url, secret, events, active, description, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [
                $data['url'],
                $data['secret'] ?? '',
                json_encode($data['events'] ?? []),
                isset($data['active']) ? ((bool) $data['active'] ? 1 : 0) : 1,
                $data['description'] ?? '',
                $data['created_by'] ?? null,
            ]
        );
    }

    public static function update(int $id, array $data): bool
    {
        $allowed = ['url', 'secret', 'active', 'description'];
        $sets = [];
        $params = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $value = $data[$key];
                if ($key === 'active') $value = (bool) $value ? 1 : 0;
                $sets[] = "$key = ?";
                $params[] = $value;
            }
        }

        if (array_key_exists('events', $data) && is_array($data['events'])) {
            $sets[] = 'events = ?';
            $params[] = json_encode($data['events']);
        }

        if (empty($sets)) return false;
        $params[] = $id;

        return Database::execute(
            'UPDATE webhooks SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    public static function delete(int $id): bool
    {
        return Database::execute('DELETE FROM webhooks WHERE id = ?', [$id]) > 0;
    }

    /**
     * List delivery attempts for a webhook.
     */
    public static function listDeliveries(int $webhookId, int $limit = 50, int $offset = 0): array
    {
        $rows = Database::fetchAll(
            'SELECT id, event_type, status_code, attempt, success, error, created_at
             FROM webhook_deliveries
             WHERE webhook_id = ?
             ORDER BY id DESC
             LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset,
            [$webhookId]
        );
        foreach ($rows as &$row) {
            $row['success'] = (bool) $row['success'];
        }
        return $rows;
    }

    /**
     * Record a delivery attempt.
     */
    public static function recordDelivery(int $webhookId, string $eventType, ?int $statusCode, int $attempt, bool $success, ?string $error = null): int
    {
        return Database::insert(
            'INSERT INTO webhook_deliveries (webhook_id, event_type, status_code, attempt, success, error, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())',
            [$webhookId, $eventType, $statusCode, $attempt, $success ? 1 : 0, $error]
        );
    }

    /**
     * Does the webhook's event filter match the given event type?
     *
     * Event filters support exact match and wildcard suffixes:
     *   "user.*"  matches "user.created", "user.upgraded", etc.
     *   "*"       matches everything.
     */
    private static function eventMatches(array $filters, string $eventType): bool
    {
        foreach ($filters as $filter) {
            if (!is_string($filter)) continue;
            if ($filter === '*' || $filter === $eventType) return true;
            if (str_ends_with($filter, '.*')) {
                $prefix = substr($filter, 0, -2);
                if (str_starts_with($eventType, $prefix . '.')) return true;
            }
        }
        return false;
    }

    /**
     * Convert raw row to canonical shape.
     */
    private static function hydrate(array $row): array
    {
        $events = $row['events'] ?? '[]';
        if (is_string($events)) {
            $decoded = json_decode($events, true);
            $events = is_array($decoded) ? $decoded : [];
        }
        return [
            'id'           => (int) $row['id'],
            'url'          => $row['url'],
            'secret'       => $row['secret'] ?? '',
            'events'       => $events,
            'active'       => (bool) ($row['active'] ?? false),
            'description'  => $row['description'] ?? '',
            'created_by'   => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'created_at'   => $row['created_at'] ?? null,
        ];
    }
}
