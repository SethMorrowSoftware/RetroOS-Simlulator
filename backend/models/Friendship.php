<?php
/**
 * Friendship - Friend / block relationships.
 *
 * Status: 'pending', 'accepted', 'blocked'.
 * Rows are directional: (user_id) → (friend_user_id).
 */
class Friendship
{
    public static function getStatus(int $userId, int $friendUserId): ?string
    {
        $row = Database::fetchOne(
            'SELECT status FROM friendships WHERE user_id = ? AND friend_user_id = ?',
            [$userId, $friendUserId]
        );
        return $row ? $row['status'] : null;
    }

    public static function listFriends(int $userId, int $limit = 50, int $offset = 0): array
    {
        return Database::fetchAll(
            'SELECT f.friend_user_id AS user_id, u.uuid AS user_uuid, u.display_name,
                    f.status, f.created_at AS friended_at
             FROM friendships f
             JOIN users u ON u.id = f.friend_user_id
             WHERE f.user_id = ? AND f.status = ?
             ORDER BY u.display_name ASC
             LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset,
            [$userId, 'accepted']
        );
    }

    public static function countFriends(int $userId): int
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM friendships WHERE user_id = ? AND status = ?',
            [$userId, 'accepted']
        );
    }

    public static function listPendingReceived(int $userId): array
    {
        return Database::fetchAll(
            'SELECT f.user_id AS user_id, u.uuid AS user_uuid, u.display_name,
                    f.status, f.created_at AS requested_at
             FROM friendships f
             JOIN users u ON u.id = f.user_id
             WHERE f.friend_user_id = ? AND f.status = ?
             ORDER BY f.created_at DESC',
            [$userId, 'pending']
        );
    }

    public static function countPending(int $userId): int
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM friendships WHERE friend_user_id = ? AND status = ?',
            [$userId, 'pending']
        );
    }

    public static function listBlocked(int $userId): array
    {
        return Database::fetchAll(
            'SELECT f.friend_user_id AS user_id, u.uuid AS user_uuid, u.display_name,
                    f.status, f.created_at AS blocked_at
             FROM friendships f
             JOIN users u ON u.id = f.friend_user_id
             WHERE f.user_id = ? AND f.status = ?
             ORDER BY f.created_at DESC',
            [$userId, 'blocked']
        );
    }

    public static function request(int $userId, int $targetUserId): bool
    {
        try {
            Database::insert(
                'INSERT INTO friendships (user_id, friend_user_id, status, created_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE status = VALUES(status), created_at = NOW()',
                [$userId, $targetUserId, 'pending']
            );
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    /**
     * Accept a pending request from $requesterId to $userId.
     * Inserts/updates BOTH directions so isFriend lookups are symmetric.
     */
    public static function accept(int $userId, int $requesterId): bool
    {
        return Database::transaction(function () use ($userId, $requesterId) {
            Database::execute(
                'UPDATE friendships SET status = ? WHERE user_id = ? AND friend_user_id = ?',
                ['accepted', $requesterId, $userId]
            );
            Database::execute(
                'INSERT INTO friendships (user_id, friend_user_id, status, created_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE status = VALUES(status)',
                [$userId, $requesterId, 'accepted']
            );
            return true;
        });
    }

    public static function block(int $userId, int $targetUserId): bool
    {
        try {
            Database::insert(
                'INSERT INTO friendships (user_id, friend_user_id, status, created_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE status = VALUES(status), created_at = NOW()',
                [$userId, $targetUserId, 'blocked']
            );
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function isBlocked(int $userId, int $targetUserId): bool
    {
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM friendships WHERE user_id = ? AND friend_user_id = ? AND status = ?',
            [$userId, $targetUserId, 'blocked']
        ) > 0;
    }

    /**
     * Remove the friendship (and reciprocal row, if any).
     */
    public static function remove(int $userId, int $targetUserId): bool
    {
        $affected = Database::execute(
            'DELETE FROM friendships WHERE
             (user_id = ? AND friend_user_id = ?) OR
             (user_id = ? AND friend_user_id = ?)',
            [$userId, $targetUserId, $targetUserId, $userId]
        );
        return $affected > 0;
    }
}
