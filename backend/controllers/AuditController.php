<?php
/**
 * AuditController - Audit log viewer (admin only).
 *
 * Provides a searchable, filterable view of all system actions.
 */
class AuditController
{
    /**
     * GET /audit
     * List audit log entries with filtering.
     *
     * Query params:
     *   limit   - Max results (default 50, max 100)
     *   offset  - Pagination offset
     *   action  - Filter by action prefix (e.g. 'config' matches 'config.save', 'config.reset')
     *   user_id - Filter by user ID
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $limit = min((int) ($_GET['limit'] ?? 50), 100);
        $offset = max((int) ($_GET['offset'] ?? 0), 0);
        $action = $_GET['action'] ?? null;
        $userId = isset($_GET['user_id']) ? (int) $_GET['user_id'] : null;

        $entries = AuditLog::list($limit, $offset, $action, $userId);
        $total = AuditLog::count($action, $userId);

        jsonResponse([
            'entries' => $entries,
            'total'   => $total,
            'limit'   => $limit,
            'offset'  => $offset,
        ]);
    }
}
