<?php
/**
 * MessageController - Manages chat messages and direct messages.
 *
 * Supports:
 * - Room chat messages (get, send)
 * - Direct messages between users (get, send)
 * - Unread counts
 */
class MessageController
{
    /**
     * Gate access to private rooms. Room membership lives in the WebSocket
     * server's memory, so the durable, DB-backed rule is: the host, an
     * admin, or a caller presenting the room password may read/post —
     * everyone else is rejected. Rooms unknown to the DB (ad-hoc WS rooms
     * like 'lobby') and public rooms stay open to any authenticated user.
     */
    private function assertRoomAccess(string $roomId, array $user): void
    {
        $room = Room::findById($roomId);
        if (!$room || empty($room['is_private'])) {
            return;
        }
        if ((int) ($room['host_user_id'] ?? 0) === (int) ($user['id'] ?? 0)) {
            return;
        }
        if (in_array($user['role'] ?? '', ['admin', 'superadmin'], true)) {
            return;
        }

        $password = input('password', '');
        if (!is_string($password) || $password === '') {
            $password = is_string($_GET['password'] ?? null) ? $_GET['password'] : '';
        }
        $hash = $room['password_hash'] ?? null;
        if (is_string($hash) && $hash !== '' && $password !== '' && password_verify($password, $hash)) {
            return;
        }

        jsonError('This room is private', 403);
    }

    /**
     * GET /messages/room/{id}
     * Get chat messages for a specific room.
     */
    public function getMessages(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $roomId = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($roomId)) {
            jsonError('Room ID is required');
        }

        $this->assertRoomAccess($roomId, $user);

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $messages = ChatMessage::history($roomId, $limit, $offset);

        jsonResponse([
            'messages' => $messages,
            'room_id'  => $roomId,
            'limit'    => $limit,
        ]);
    }

    /**
     * POST /messages/room/{id}
     * Send a chat message to a room.
     */
    public function sendMessage(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $roomId = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($roomId)) {
            jsonError('Room ID is required');
        }

        $this->assertRoomAccess($roomId, $user);

        $content = input('content', '');
        $type    = input('type', 'message'); // message, emote, system

        if (empty($content)) {
            jsonError('Message content is required');
        }

        if (mb_strlen($content) > 2000) {
            jsonError('Message content must be 2000 characters or fewer');
        }

        // Only admins/superadmins can send system messages
        if ($type === 'system' && !in_array($user['role'] ?? '', ['admin', 'superadmin'], true)) {
            jsonError('Only admins can send system messages', 403);
        }

        if (!in_array($type, ['message', 'emote', 'system'], true)) {
            jsonError('type must be one of: message, emote, system');
        }

        $message = ChatMessage::create(
            $roomId,
            $user['id'],
            $user['display_name'] ?? 'Unknown',
            $content,
            $type
        );

        jsonResponse(['message' => $message], 201);
    }

    /**
     * GET /messages/unread
     * Get unread DM count for the current user.
     */
    public function getUnread(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $dmUnread = DirectMessage::countAllUnread($user['id']);

        jsonResponse([
            'dm'    => $dmUnread,
            'total' => $dmUnread,
        ]);
    }

    /**
     * GET /messages/dm/{userUuid}
     * Get direct messages between the current user and another user.
     */
    public function getDMs(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $otherUuid = $params['userUuid'] ?? '';
        if (empty($otherUuid)) {
            jsonError('User UUID is required');
        }

        $other = User::findByUuid($otherUuid);
        if (!$other) {
            jsonError('User not found', 404);
        }

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $channelId = DirectMessage::channelId($user['id'], (int) $other['id']);
        $messages = DirectMessage::history($channelId, $limit, $offset);

        // Mark messages as read
        DirectMessage::markRead($channelId, $user['id']);

        jsonResponse([
            'messages'  => $messages,
            'user_uuid' => $otherUuid,
            'limit'     => $limit,
        ]);
    }

    /**
     * POST /messages/dm/{userUuid}
     * Send a direct message to another user.
     */
    public function sendDM(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $otherUuid = $params['userUuid'] ?? '';
        if (empty($otherUuid)) {
            jsonError('User UUID is required');
        }

        $other = User::findByUuid($otherUuid);
        if (!$other) {
            jsonError('User not found', 404);
        }

        if ($other['id'] === $user['id']) {
            jsonError('You cannot send a message to yourself', 400);
        }

        $content = input('content', '');
        if (empty($content)) {
            jsonError('Message content is required');
        }

        if (mb_strlen($content) > 2000) {
            jsonError('Message content must be 2000 characters or fewer');
        }

        // Check if blocked (in either direction)
        if (Friendship::isBlocked($user['id'], (int) $other['id']) ||
            Friendship::isBlocked((int) $other['id'], $user['id'])) {
            jsonError('Cannot send messages to this user', 403);
        }

        $channelId = DirectMessage::channelId($user['id'], (int) $other['id']);
        $message = DirectMessage::send($channelId, $user['id'], $content);

        jsonResponse(['message' => $message], 201);
    }
}
