<?php
/**
 * ChatMessage - Room chat history.
 */
class ChatMessage
{
    public static function create(string $roomId, int $userId, string $displayName, string $content, string $type = 'message'): array
    {
        $id = Database::insert(
            'INSERT INTO chat_messages (room_id, user_id, display_name, content, type, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())',
            [$roomId, $userId, $displayName, $content, $type]
        );

        return [
            'id'           => $id,
            'room_id'      => $roomId,
            'user_id'      => $userId,
            'display_name' => $displayName,
            'content'      => $content,
            'type'         => $type,
            'created_at'   => date('c'),
        ];
    }

    public static function history(string $roomId, int $limit = 50, int $offset = 0): array
    {
        return Database::fetchAll(
            'SELECT id, room_id, user_id, display_name, content, type, created_at
             FROM chat_messages
             WHERE room_id = ?
             ORDER BY id DESC
             LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset,
            [$roomId]
        );
    }
}
