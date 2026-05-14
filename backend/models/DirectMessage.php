<?php
/**
 * DirectMessage - Private 1:1 messages.
 *
 * A DM "channel" is identified by a deterministic ID derived from the two
 * participant user IDs (sorted ascending and joined by ':').
 */
class DirectMessage
{
    public static function channelId(int $a, int $b): string
    {
        $sorted = [$a, $b];
        sort($sorted);
        return 'dm:' . $sorted[0] . ':' . $sorted[1];
    }

    public static function send(string $channelId, int $fromUserId, string $content): array
    {
        $id = Database::insert(
            'INSERT INTO direct_messages (channel_id, from_user_id, content, created_at)
             VALUES (?, ?, ?, NOW())',
            [$channelId, $fromUserId, $content]
        );

        return [
            'id'           => $id,
            'channel_id'   => $channelId,
            'from_user_id' => $fromUserId,
            'content'      => $content,
            'created_at'   => date('c'),
            'read_at'      => null,
        ];
    }

    public static function history(string $channelId, int $limit = 50, int $offset = 0): array
    {
        return Database::fetchAll(
            'SELECT dm.id, dm.channel_id, dm.from_user_id, dm.content, dm.created_at, dm.read_at,
                    u.uuid AS user_uuid, u.display_name
             FROM direct_messages dm
             JOIN users u ON u.id = dm.from_user_id
             WHERE dm.channel_id = ?
             ORDER BY dm.id DESC
             LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset,
            [$channelId]
        );
    }

    /**
     * Mark all DMs in $channelId NOT sent by $userId as read.
     */
    public static function markRead(string $channelId, int $userId): int
    {
        return Database::execute(
            'UPDATE direct_messages SET read_at = NOW()
             WHERE channel_id = ? AND from_user_id != ? AND read_at IS NULL',
            [$channelId, $userId]
        );
    }

    /**
     * Count unread DMs across all channels for a user.
     */
    public static function countAllUnread(int $userId): int
    {
        $prefix1 = 'dm:%:' . $userId;
        $prefix2 = 'dm:' . $userId . ':%';

        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM direct_messages
             WHERE (channel_id LIKE ? OR channel_id LIKE ?)
             AND from_user_id != ?
             AND read_at IS NULL',
            [$prefix1, $prefix2, $userId]
        );
    }
}
