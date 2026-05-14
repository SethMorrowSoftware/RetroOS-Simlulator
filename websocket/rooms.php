<?php
/**
 * Room Manager - Server-side room management for multiplayer
 *
 * Handles room creation, joining, leaving, and member tracking.
 * Room types: lobby, game:*, app:*, campaign:*, dm:*, custom:*
 */

class RoomManager
{
    /**
     * @var array<string, array{members: array, options: array, createdAt: float, hostId: string|null}>
     * roomId -> room data. members is keyed by connection ID.
     */
    private array $rooms = [];

    /**
     * @var array<string, array<string, true>>
     * connectionId -> set of roomIds (reverse lookup for fast cleanup)
     */
    private array $memberRooms = [];

    public function __construct()
    {
        // Create permanent lobby
        $this->rooms['lobby'] = [
            'members' => [],
            'options' => ['maxPlayers' => 0, 'isPrivate' => false, 'persistent' => true, 'password' => null, 'metadata' => []],
            'createdAt' => microtime(true) * 1000,
            'hostId' => null,
        ];
    }

    /**
     * Create a new room.
     */
    public function create(string $roomId, array $options = [], ?string $hostConnId = null): bool
    {
        if (isset($this->rooms[$roomId])) {
            return false;
        }

        $this->rooms[$roomId] = [
            'members' => [],
            'options' => [
                'maxPlayers' => $options['maxPlayers'] ?? 0,
                'isPrivate' => $options['isPrivate'] ?? false,
                'password' => $options['password'] ?? null,
                'persistent' => $options['persistent'] ?? false,
                'metadata' => $options['metadata'] ?? [],
            ],
            'createdAt' => microtime(true) * 1000,
            'hostId' => $hostConnId,
        ];

        return true;
    }

    /**
     * Join a room.
     *
     * @return array{success: bool, error?: string}
     */
    public function join(string $roomId, string $connId, array $connInfo, ?string $password = null): array
    {
        if (!isset($this->rooms[$roomId])) {
            // Auto-create for certain prefixes
            if (str_starts_with($roomId, 'dm:') || str_starts_with($roomId, 'game:') ||
                str_starts_with($roomId, 'app:') || str_starts_with($roomId, 'campaign:')) {
                $this->create($roomId, [], $connId);
            } else {
                return ['success' => false, 'error' => 'Room not found'];
            }
        }

        $room = &$this->rooms[$roomId];

        // Check max players
        if ($room['options']['maxPlayers'] > 0 && count($room['members']) >= $room['options']['maxPlayers']) {
            return ['success' => false, 'error' => 'Room is full'];
        }

        // Check password
        if ($room['options']['password'] && $room['options']['password'] !== $password) {
            return ['success' => false, 'error' => 'Invalid password'];
        }

        // Already in room
        if (isset($room['members'][$connId])) {
            return ['success' => true];
        }

        // Add to room
        $room['members'][$connId] = $connInfo;

        // Track reverse mapping
        if (!isset($this->memberRooms[$connId])) {
            $this->memberRooms[$connId] = [];
        }
        $this->memberRooms[$connId][$roomId] = true;

        return ['success' => true];
    }

    /**
     * Leave a room.
     */
    public function leave(string $roomId, string $connId): bool
    {
        if (!isset($this->rooms[$roomId])) return false;

        $room = &$this->rooms[$roomId];
        $wasInRoom = isset($room['members'][$connId]);
        unset($room['members'][$connId]);

        // Update reverse mapping
        if (isset($this->memberRooms[$connId])) {
            unset($this->memberRooms[$connId][$roomId]);
        }

        // Migrate host
        if ($room['hostId'] === $connId && !empty($room['members'])) {
            $room['hostId'] = array_key_first($room['members']);
        }

        // Clean up empty non-persistent rooms
        if (empty($room['members']) && !$room['options']['persistent'] && $roomId !== 'lobby') {
            unset($this->rooms[$roomId]);
        }

        return $wasInRoom;
    }

    /**
     * Leave all rooms (on disconnect).
     *
     * @return string[] Room IDs the connection was in
     */
    public function leaveAll(string $connId): array
    {
        if (!isset($this->memberRooms[$connId])) return [];

        $leftRooms = array_keys($this->memberRooms[$connId]);
        foreach ($leftRooms as $roomId) {
            $this->leave($roomId, $connId);
        }
        unset($this->memberRooms[$connId]);
        return $leftRooms;
    }

    /**
     * Get all members of a room.
     *
     * @return array<string, array>|null connId -> connInfo
     */
    public function getMembers(string $roomId): ?array
    {
        return isset($this->rooms[$roomId]) ? $this->rooms[$roomId]['members'] : null;
    }

    /**
     * Get member count of a room.
     */
    public function getMemberCount(string $roomId): int
    {
        return isset($this->rooms[$roomId]) ? count($this->rooms[$roomId]['members']) : 0;
    }

    /**
     * Get room info (safe for sending to clients).
     */
    public function getRoomInfo(string $roomId): ?array
    {
        if (!isset($this->rooms[$roomId])) return null;

        $room = $this->rooms[$roomId];
        $members = [];
        foreach ($room['members'] as $connId => $info) {
            $members[] = [
                'userId' => $info['userId'],
                'userUuid' => $info['userUuid'],
                'displayName' => $info['displayName'],
            ];
        }

        $hostInfo = null;
        if ($room['hostId'] && isset($room['members'][$room['hostId']])) {
            $hostInfo = $room['members'][$room['hostId']];
        }

        return [
            'roomId' => $roomId,
            'memberCount' => count($room['members']),
            'members' => $members,
            'hostId' => $hostInfo ? $hostInfo['userId'] : null,
            'options' => [
                'maxPlayers' => $room['options']['maxPlayers'],
                'isPrivate' => $room['options']['isPrivate'],
                'hasPassword' => !empty($room['options']['password']),
                'persistent' => $room['options']['persistent'],
                'metadata' => $room['options']['metadata'],
            ],
            'createdAt' => $room['createdAt'],
        ];
    }

    /**
     * List all public rooms.
     */
    public function listRooms(?string $filter = null): array
    {
        $result = [];
        foreach ($this->rooms as $roomId => $room) {
            if ($filter !== null && !str_starts_with($roomId, $filter)) continue;
            if ($room['options']['isPrivate']) continue;
            $result[] = $this->getRoomInfo($roomId);
        }
        return $result;
    }

    /**
     * Get rooms a specific connection is in.
     *
     * @return string[]
     */
    public function getRoomsForClient(string $connId): array
    {
        return isset($this->memberRooms[$connId]) ? array_keys($this->memberRooms[$connId]) : [];
    }

    /**
     * Check if a connection is in a room.
     */
    public function isInRoom(string $roomId, string $connId): bool
    {
        return isset($this->rooms[$roomId]['members'][$connId]);
    }

    /**
     * Check if a connection is the host of a room.
     */
    public function isHost(string $roomId, string $connId): bool
    {
        return isset($this->rooms[$roomId]) && $this->rooms[$roomId]['hostId'] === $connId;
    }

    /**
     * Get total number of rooms.
     */
    public function getRoomCount(): int
    {
        return count($this->rooms);
    }

    /**
     * Update room metadata.
     */
    public function updateMetadata(string $roomId, array $metadata): void
    {
        if (isset($this->rooms[$roomId])) {
            $this->rooms[$roomId]['options']['metadata'] = array_merge(
                $this->rooms[$roomId]['options']['metadata'],
                $metadata
            );
        }
    }
}
