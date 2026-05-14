<?php
/**
 * MultiplayerController - Manages multiplayer rooms metadata in API v2.
 */
class MultiplayerController
{
    /**
     * GET /multiplayer/rooms
     * List rooms with optional type filter.
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);

        $roomType = $_GET['room_type'] ?? null;
        $publicOnly = filter_var($_GET['public_only'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $limit  = max(1, min(100, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $rooms = array_map([Room::class, 'toPublic'], Room::list($limit, $offset, $roomType, $publicOnly));
        $total = Room::count($roomType);

        jsonResponse([
            'rooms'  => $rooms,
            'total'  => $total,
            'limit'  => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * POST /multiplayer/rooms
     * Create a room.
     */
    public function create(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = trim((string) input('id', ''));
        if ($id === '') {
            $id = 'room:' . strtolower(bin2hex(random_bytes(6)));
        }

        if (!preg_match('/^[a-zA-Z0-9:_-]{3,100}$/', $id)) {
            jsonError('id must be 3-100 chars and contain only letters, numbers, :, _, -');
        }

        $roomType = (string) input('room_type', 'custom');
        $maxPlayers = max(0, min(256, (int) input('max_players', 0)));
        $isPrivate = (bool) input('is_private', false);
        $isPersistent = (bool) input('is_persistent', false);
        $password = input('password');
        $metadata = input('metadata', []);

        if (!is_array($metadata)) {
            jsonError('metadata must be an object');
        }

        $room = Room::create($id, $roomType, (int) $user['id'], [
            'max_players' => $maxPlayers,
            'is_private' => $isPrivate,
            'is_persistent' => $isPersistent,
            'password' => $password,
            'metadata' => $metadata,
        ]);

        if (!$room) {
            jsonError('Failed to create room', 500);
        }

        jsonResponse(['room' => Room::toPublic($room)], 201);
    }

    /**
     * GET /multiplayer/rooms/{id}
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);

        $id = $params['id'] ?? '';
        if (empty($id)) {
            jsonError('Room ID is required');
        }

        $room = Room::findById($id);
        if (!$room) {
            jsonError('Room not found', 404);
        }

        jsonResponse(['room' => Room::toPublic($room)]);
    }

    /**
     * DELETE /multiplayer/rooms/{id}
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = $params['id'] ?? '';
        if (empty($id)) {
            jsonError('Room ID is required');
        }

        $room = Room::findById($id);
        if (!$room) {
            jsonError('Room not found', 404);
        }

        if ((int) ($room['host_user_id'] ?? 0) !== (int) $user['id']) {
            jsonError('Only the host can delete this room', 403);
        }

        Room::delete($id);
        jsonResponse(['success' => true]);
    }
}
