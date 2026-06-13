<?php
/**
 * PresenceController - Manages user online presence and status.
 *
 * Supports:
 * - Listing online users
 * - Getting a specific user's presence
 * - Updating current user's status
 *
 * Uses the multiplayer_presence table directly via the Database class.
 */
class PresenceController
{
    /**
     * GET /presence/online
     * Get a list of currently online users.
     */
    public function getOnline(array $params): void
    {
        Middleware::auth(true)($params);

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        // Consider users "online" if their last heartbeat was within 5 minutes
        $threshold = date('Y-m-d H:i:s', time() - 300);

        try {
            $users = Database::fetchAll(
                'SELECT p.user_id, p.status, p.current_room, p.last_heartbeat,
                        u.uuid AS user_uuid, u.display_name
                 FROM multiplayer_presence p
                 JOIN users u ON u.id = p.user_id
                 WHERE p.last_heartbeat >= ?
                 ORDER BY p.last_heartbeat DESC
                 LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset,
                [$threshold]
            );

            $total = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM multiplayer_presence WHERE last_heartbeat >= ?',
                [$threshold]
            );
        } catch (\Throwable $e) {
            // Table may not exist if migration 012 hasn't been run
            $users = [];
            $total = 0;
        }

        jsonResponse([
            'users'  => $users,
            'total'  => $total,
            'limit'  => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * GET /presence/user/{uuid}
     * Get a specific user's presence information.
     */
    public function getUserPresence(array $params): void
    {
        Middleware::auth(true)($params);

        $userUuid = $params['uuid'] ?? '';
        if (empty($userUuid)) {
            jsonError('User UUID is required');
        }

        $target = User::findByUuid($userUuid);
        if (!$target) {
            jsonError('User not found', 404);
        }

        $threshold = date('Y-m-d H:i:s', time() - 300);

        try {
            $presence = Database::fetchOne(
                'SELECT p.user_id, p.status, p.current_room, p.last_heartbeat,
                        u.uuid AS user_uuid, u.display_name
                 FROM multiplayer_presence p
                 JOIN users u ON u.id = p.user_id
                 WHERE p.user_id = ?',
                [$target['id']]
            );
        } catch (\Throwable $e) {
            $presence = null;
        }

        $isOnline = $presence && $presence['last_heartbeat'] >= $threshold;

        jsonResponse([
            'presence' => $presence,
            'online'   => $isOnline,
        ]);
    }

    /**
     * POST /presence/status
     * Update the current user's presence status (heartbeat + status update).
     */
    public function updateStatus(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $status       = input('status', 'online');      // online, away, busy, in_game
        $currentRoom  = input('current_room', input('current_room_uuid')); // backward compatible alias

        if (!in_array($status, ['online', 'away', 'busy', 'in_game'], true)) {
            jsonError('status must be one of: online, away, busy, in_game');
        }

        // current_room is echoed back to every client via getOnline —
        // reject junk rather than storing it.
        if ($currentRoom !== null) {
            if (!is_string($currentRoom) || strlen($currentRoom) > 128
                || preg_match('/[\x00-\x1F\x7F]/', $currentRoom)) {
                jsonError('current_room must be a string of at most 128 printable characters');
            }
        }

        $now = date('Y-m-d H:i:s');

        // Upsert: update if exists, insert if not
        try {
            $existing = Database::fetchOne(
                'SELECT user_id FROM multiplayer_presence WHERE user_id = ?',
                [$user['id']]
            );

            if ($existing) {
                Database::execute(
                    'UPDATE multiplayer_presence
                     SET status = ?, current_room = ?, last_heartbeat = ?
                     WHERE user_id = ?',
                    [$status, $currentRoom, $now, $user['id']]
                );
            } else {
                Database::insert(
                    'INSERT INTO multiplayer_presence (user_id, status, current_room, last_heartbeat)
                     VALUES (?, ?, ?, ?)',
                    [$user['id'], $status, $currentRoom, $now]
                );
            }
        } catch (\Throwable $e) {
            error_log('[PresenceController] update failed: ' . $e->getMessage());
            jsonError('Presence update failed', 500);
        }

        jsonResponse([
            'success' => true,
            'status'  => $status,
            'last_heartbeat' => $now,
        ]);
    }
}
