<?php
/**
 * AuditLog - Records mutating admin actions for compliance.
 */
class AuditLog
{
    /**
     * Append an audit entry. Non-fatal — failures only log to error_log.
     *
     * @param string $action      Dotted action name (e.g. 'config.save')
     * @param int    $userId      Acting user
     * @param string $resourceType Type of resource affected (e.g. 'config', 'user')
     * @param string $resourceId  Identifier of the resource
     * @param array  $metadata    Optional structured details
     */
    public static function log(string $action, int $userId, string $resourceType = '', string $resourceId = '', array $metadata = []): void
    {
        try {
            $ip = Middleware::clientIp();
            $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
            // Truncate UA at 500 chars
            $userAgent = substr($userAgent, 0, 500);

            Database::insert(
                'INSERT INTO audit_log (action, user_id, resource_type, resource_id, metadata, ip_address, user_agent, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
                [
                    $action,
                    $userId,
                    $resourceType,
                    $resourceId,
                    json_encode($metadata, JSON_UNESCAPED_UNICODE),
                    $ip,
                    $userAgent,
                ]
            );
        } catch (\Throwable $e) {
            error_log('[AuditLog] Failed to insert entry: ' . $e->getMessage());
        }
    }

    /**
     * List entries with optional filtering.
     */
    public static function list(int $limit = 50, int $offset = 0, ?string $action = null, ?int $userId = null): array
    {
        $sql = 'SELECT a.*, u.display_name AS user_name, u.uuid AS user_uuid
                FROM audit_log a
                LEFT JOIN users u ON u.id = a.user_id';
        $params = [];
        $conds = [];

        if ($action !== null && $action !== '') {
            $conds[] = 'a.action LIKE ?';
            $params[] = $action . '%';
        }
        if ($userId !== null && $userId > 0) {
            $conds[] = 'a.user_id = ?';
            $params[] = $userId;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }
        $sql .= ' ORDER BY a.created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        $rows = Database::fetchAll($sql, $params);

        // Decode metadata JSON for the client
        foreach ($rows as &$row) {
            if (isset($row['metadata']) && is_string($row['metadata'])) {
                $decoded = json_decode($row['metadata'], true);
                $row['metadata'] = is_array($decoded) ? $decoded : [];
            }
        }
        return $rows;
    }

    /**
     * Count entries matching the same filter.
     */
    public static function count(?string $action = null, ?int $userId = null): int
    {
        $sql = 'SELECT COUNT(*) FROM audit_log';
        $params = [];
        $conds = [];

        if ($action !== null && $action !== '') {
            $conds[] = 'action LIKE ?';
            $params[] = $action . '%';
        }
        if ($userId !== null && $userId > 0) {
            $conds[] = 'user_id = ?';
            $params[] = $userId;
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }

        return (int) Database::fetchColumn($sql, $params);
    }
}
