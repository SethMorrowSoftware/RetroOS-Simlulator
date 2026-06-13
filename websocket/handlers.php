<?php
/**
 * WebSocket Message Handlers
 *
 * Routes incoming messages to appropriate handlers based on message type.
 * Each handler receives the message and a context object with server utilities.
 *
 * All payload fields are client-controlled: every handler validates types
 * before passing values into typed functions. PHP TypeErrors are \Error,
 * not \Exception — without these checks a crafted payload would throw past
 * a too-narrow catch and could take down the server loop.
 */

class MessageHandlers
{
    private WebSocketAuth $auth;

    public function __construct(WebSocketAuth $auth)
    {
        $this->auth = $auth;
    }

    /**
     * A usable room identifier: non-empty string, bounded length, no
     * control characters. Returns null when invalid.
     */
    private static function roomId($value): ?string
    {
        if (!is_string($value) || $value === '' || strlen($value) > 128) return null;
        if (preg_match('/[\x00-\x1F\x7F]/', $value)) return null;
        return $value;
    }

    /**
     * Coerce a payload field to a bounded string, or null when it isn't one.
     */
    private static function str($value, int $maxLen = 256): ?string
    {
        if (!is_string($value)) return null;
        if (strlen($value) > $maxLen) return null;
        return $value;
    }

    /**
     * Identifier restricted to a safe charset (game ids, session ids).
     */
    private static function ident($value, int $maxLen = 64): ?string
    {
        if (!is_string($value) || $value === '' || strlen($value) > $maxLen) return null;
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $value)) return null;
        return $value;
    }

    /**
     * Sanitise client-supplied room options. Clients may not create
     * persistent rooms (those are never reclaimed) and metadata is bounded.
     */
    private static function roomOptions($options): array
    {
        if (!is_array($options)) return [];

        $clean = [];
        $clean['maxPlayers'] = max(0, min(256, (int) ($options['maxPlayers'] ?? 0)));
        $clean['isPrivate'] = !empty($options['isPrivate']);
        $password = $options['password'] ?? null;
        $clean['password'] = (is_string($password) && $password !== '' && strlen($password) <= 256) ? $password : null;
        $metadata = $options['metadata'] ?? [];
        $clean['metadata'] = is_array($metadata) ? $metadata : [];
        // 'persistent' is deliberately not honoured from clients.
        return $clean;
    }

    /**
     * Handle an incoming WebSocket message.
     *
     * @param string $connId Connection identifier
     * @param array $message Parsed message
     * @param array $ctx Context with server utilities
     */
    public function handle(string $connId, array $message, array $ctx): void
    {
        switch ($message['type'] ?? '') {
            case 'room':
                $this->handleRoom($connId, $message, $ctx);
                break;
            case 'event':
                $this->handleEvent($connId, $message, $ctx);
                break;
            case 'presence':
                $this->handlePresence($connId, $message, $ctx);
                break;
            case 'state_sync':
                $this->handleStateSync($connId, $message, $ctx);
                break;
            case 'rpc':
                $this->handleRpc($connId, $message, $ctx);
                break;
            case 'chat':
                $this->handleChat($connId, $message, $ctx);
                break;
            case 'dm':
                $this->handleDm($connId, $message, $ctx);
                break;
            case 'game':
                $this->handleGame($connId, $message, $ctx);
                break;
            case 'ping':
                $ctx['sendToClient']($connId, [
                    'type' => 'pong',
                    'timestamp' => round(microtime(true) * 1000),
                    'clientTimestamp' => is_scalar($message['timestamp'] ?? null) ? $message['timestamp'] : null,
                ]);
                break;
            default:
                $type = is_string($message['type'] ?? null) ? substr($message['type'], 0, 64) : '';
                $ctx['sendToClient']($connId, [
                    'type' => 'system',
                    'event' => 'error',
                    'payload' => ['message' => 'Unknown message type: ' . $type, 'code' => 'UNKNOWN_TYPE'],
                ]);
        }
    }

    private function handleRoom(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $action = self::str($payload['action'] ?? '', 32) ?? '';
        $roomId = self::roomId($payload['roomId'] ?? '');
        $options = self::roomOptions($payload['options'] ?? []);
        $password = self::str($payload['password'] ?? null);

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];
        $connInfo = $ctx['connInfo'];

        switch ($action) {
            case 'create':
                if (!$roomId) {
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => 'roomId required']]);
                    return;
                }
                $created = $rm->create($roomId, $options, $connId);
                if ($created) {
                    $rm->join($roomId, $connId, $connInfo);
                    $ctx['sendToClient']($connId, [
                        'type' => 'room',
                        'event' => 'created',
                        'payload' => array_merge(['roomId' => $roomId], $rm->getRoomInfo($roomId) ?? []),
                    ]);
                } else {
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => 'Unable to create room (already exists or room limit reached)']]);
                }
                break;

            case 'join':
                if (!$roomId) {
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => 'roomId required']]);
                    return;
                }
                $result = $rm->join($roomId, $connId, $connInfo, $password);
                if ($result['success']) {
                    $ctx['sendToClient']($connId, [
                        'type' => 'room',
                        'event' => 'joined',
                        'payload' => array_merge(['roomId' => $roomId], $rm->getRoomInfo($roomId) ?? []),
                    ]);
                    $ctx['broadcastToRoom']($roomId, [
                        'type' => 'room',
                        'event' => 'member_joined',
                        'payload' => [
                            'roomId' => $roomId,
                            'userId' => $connInfo['userId'],
                            'userUuid' => $connInfo['userUuid'],
                            'displayName' => $connInfo['displayName'],
                            'timestamp' => round(microtime(true) * 1000),
                        ],
                    ], $connId);
                } else {
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => $result['error']]]);
                }
                break;

            case 'leave':
                if (!$roomId) return;
                $wasIn = $rm->leave($roomId, $connId);
                if ($wasIn) {
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'left', 'payload' => ['roomId' => $roomId]]);
                    $ctx['broadcastToRoom']($roomId, [
                        'type' => 'room',
                        'event' => 'member_left',
                        'payload' => [
                            'roomId' => $roomId,
                            'userId' => $connInfo['userId'],
                            'displayName' => $connInfo['displayName'],
                            'timestamp' => round(microtime(true) * 1000),
                        ],
                    ]);
                }
                break;

            case 'list':
                $filter = self::str($payload['filter'] ?? null, 128);
                $rooms = $rm->listRooms($filter);
                $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'list', 'payload' => ['rooms' => $rooms]]);
                break;

            case 'info':
                if (!$roomId) return;
                $info = $rm->getRoomInfo($roomId);
                $ctx['sendToClient']($connId, [
                    'type' => 'room',
                    'event' => 'info',
                    'payload' => $info ?? ['error' => 'Room not found'],
                ]);
                break;

            default:
                $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => "Unknown room action: $action"]]);
        }
    }

    private function handleEvent(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $channel = self::roomId($payload['channel'] ?? '');
        $event = self::str($payload['event'] ?? $payload['eventName'] ?? '', 128) ?? '';
        $data = $payload['data'] ?? [];
        $broadcast = !empty($payload['broadcast']);
        $connInfo = $ctx['connInfo'];

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];

        if ($broadcast) {
            if (!in_array($connInfo['role'] ?? '', ['admin', 'showrunner'])) {
                $ctx['sendToClient']($connId, [
                    'type' => 'system',
                    'event' => 'error',
                    'payload' => ['message' => 'Broadcast requires admin or showrunner role', 'code' => 'UNAUTHORIZED'],
                ]);
                return;
            }
            $ctx['broadcastToRoom']('lobby', [
                'type' => 'event',
                'event' => $event !== '' ? $event : 'broadcast',
                'channel' => 'lobby',
                'payload' => $data,
                'senderId' => $connInfo['userId'],
                'senderUuid' => $connInfo['userUuid'],
                'senderName' => $connInfo['displayName'],
                'timestamp' => round(microtime(true) * 1000),
                'messageId' => $message['messageId'] ?? null,
            ], $connId);
            return;
        }

        if (!$channel) {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Event requires channel']]);
            return;
        }

        if (!$rm->isInRoom($channel, $connId)) {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Not in channel']]);
            return;
        }

        $ctx['broadcastToRoom']($channel, [
            'type' => 'event',
            'event' => $event,
            'channel' => $channel,
            'payload' => $data,
            'senderId' => $connInfo['userId'],
            'senderUuid' => $connInfo['userUuid'],
            'senderName' => $connInfo['displayName'],
            'timestamp' => round(microtime(true) * 1000),
            'messageId' => $message['messageId'] ?? null,
        ], $connId);
    }

    private function handlePresence(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $action = self::str($payload['action'] ?? '', 32) ?? '';
        $connInfo = $ctx['connInfo'];

        switch ($action) {
            case 'update_status':
                $status = self::str($payload['status'] ?? 'online', 64) ?? 'online';
                $activity = self::str($payload['activity'] ?? null, 128);
                $ctx['broadcastToRoom']('lobby', [
                    'type' => 'presence',
                    'event' => 'status_update',
                    'payload' => [
                        'userId' => $connInfo['userId'],
                        'userUuid' => $connInfo['userUuid'],
                        'displayName' => $connInfo['displayName'],
                        'status' => $status,
                        'activity' => $activity,
                        'timestamp' => round(microtime(true) * 1000),
                    ],
                ], $connId);
                break;

            case 'typing':
                $roomId = self::roomId($payload['roomId'] ?? '');
                if (!$roomId || !$ctx['roomManager']->isInRoom($roomId, $connId)) return;
                $ctx['broadcastToRoom']($roomId, [
                    'type' => 'presence',
                    'event' => 'typing',
                    'payload' => [
                        'userId' => $connInfo['userId'],
                        'displayName' => $connInfo['displayName'],
                        'roomId' => $roomId,
                        'timestamp' => round(microtime(true) * 1000),
                    ],
                ], $connId);
                break;

            case 'get_online':
                $onlineUsers = [];
                $seen = [];
                foreach ($ctx['connections'] as $cId => $info) {
                    $uid = $info['userId'] ?? null;
                    if ($uid !== null && !isset($seen[$uid])) {
                        $seen[$uid] = true;
                        $onlineUsers[] = [
                            'userId' => $uid,
                            'userUuid' => $info['userUuid'] ?? '',
                            'displayName' => $info['displayName'] ?? 'User',
                        ];
                    }
                }
                $ctx['sendToClient']($connId, [
                    'type' => 'presence',
                    'event' => 'online_list',
                    'payload' => ['users' => $onlineUsers],
                ]);
                break;
        }
    }

    private function handleStateSync(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $channel = self::roomId($payload['channel'] ?? '');
        $connInfo = $ctx['connInfo'];

        if (!$channel || !$ctx['roomManager']->isInRoom($channel, $connId)) {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Not in channel for state sync']]);
            return;
        }

        $ctx['broadcastToRoom']($channel, [
            'type' => 'state_sync',
            'channel' => $channel,
            'payload' => ['state' => $payload['state'] ?? null, 'delta' => $payload['delta'] ?? null],
            'senderId' => $connInfo['userId'],
            'senderName' => $connInfo['displayName'],
            'timestamp' => round(microtime(true) * 1000),
            'messageId' => $message['messageId'] ?? null,
        ], $connId);
    }

    private function handleChat(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $roomId = self::roomId($payload['roomId'] ?? '');
        $text = $payload['text'] ?? '';
        $messageType = self::str($payload['messageType'] ?? 'message', 32) ?? 'message';
        $connInfo = $ctx['connInfo'];

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];

        if (!$roomId || !is_string($text) || $text === '') {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'roomId and text required']]);
            return;
        }

        if (!$rm->isInRoom($roomId, $connId)) {
            $result = $rm->join($roomId, $connId, $connInfo);
            if (!$result['success']) {
                $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Cannot join room']]);
                return;
            }
        }

        // Sanitize text
        $sanitizedText = htmlspecialchars(mb_substr($text, 0, 2000), ENT_QUOTES, 'UTF-8');

        $chatMessage = [
            'type' => 'chat',
            'event' => 'message',
            'payload' => [
                'roomId' => $roomId,
                'userId' => $connInfo['userId'],
                'userUuid' => $connInfo['userUuid'],
                'displayName' => $connInfo['displayName'],
                'text' => $sanitizedText,
                'messageType' => $messageType,
                'timestamp' => round(microtime(true) * 1000),
                'messageId' => $message['messageId'] ?? null,
            ],
        ];

        // Broadcast to ALL members (including sender for confirmation)
        $members = $rm->getMembers($roomId);
        if ($members) {
            foreach (array_keys($members) as $memberConnId) {
                $ctx['sendToClient']($memberConnId, $chatMessage);
            }
        }
    }

    private function handleDm(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $targetUserId = $payload['targetUserId'] ?? null;
        $text = $payload['text'] ?? '';
        $connInfo = $ctx['connInfo'];

        if (!$targetUserId || !is_string($text) || $text === '') {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'targetUserId and text required']]);
            return;
        }

        $parsedTargetId = is_scalar($targetUserId) ? intval($targetUserId) : 0;
        if ($parsedTargetId <= 0) {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Invalid targetUserId', 'code' => 'INVALID_PARAM']]);
            return;
        }

        // Check block status
        $targetConnIds = $ctx['getUserConnections']($parsedTargetId);
        if (!empty($targetConnIds)) {
            $firstTargetConnId = $targetConnIds[0];
            $targetInfo = $ctx['connections'][$firstTargetConnId] ?? null;
            if ($targetInfo && !empty($targetInfo['userUuid']) && !empty($connInfo['token'])) {
                try {
                    $allowed = $this->auth->canMessage($connInfo['token'], $targetInfo['userUuid']);
                    if (!$allowed) {
                        $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Cannot send messages to this user', 'code' => 'BLOCKED']]);
                        return;
                    }
                } catch (\Throwable $e) {
                    // Fail closed — if block check errors, reject the message
                    error_log("[WS] Block check failed: " . $e->getMessage());
                    $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'Unable to verify messaging permissions', 'code' => 'CHECK_FAILED']]);
                    return;
                }
            }
        }

        // Sanitize
        $sanitizedText = htmlspecialchars(mb_substr($text, 0, 2000), ENT_QUOTES, 'UTF-8');

        // Create canonical DM channel ID
        $ids = [$connInfo['userId'], $parsedTargetId];
        sort($ids);
        $channelId = 'dm:' . $ids[0] . ':' . $ids[1];

        $dmMessage = [
            'type' => 'dm',
            'event' => 'message',
            'payload' => [
                'channelId' => $channelId,
                'senderId' => $connInfo['userId'],
                'senderUuid' => $connInfo['userUuid'],
                'senderName' => $connInfo['displayName'],
                'targetUserId' => $parsedTargetId,
                'text' => $sanitizedText,
                'timestamp' => round(microtime(true) * 1000),
                'messageId' => $message['messageId'] ?? null,
            ],
        ];

        // Send to target user
        $ctx['broadcastToUser']($parsedTargetId, $dmMessage);

        // Send confirmation back to sender
        $ctx['sendToClient']($connId, $dmMessage);
    }

    private function handleGame(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $action = self::str($payload['action'] ?? '', 32) ?? '';
        $sessionId = self::ident($payload['sessionId'] ?? '');
        $gameId = self::ident($payload['gameId'] ?? '');
        $data = $payload['data'] ?? [];
        $connInfo = $ctx['connInfo'];

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];

        // Every action below addresses a session room derived from the two ids.
        if ($action !== 'list_sessions' && (!$sessionId || !$gameId)) {
            $ctx['sendToClient']($connId, ['type' => 'game', 'event' => 'error', 'payload' => ['message' => 'Valid gameId and sessionId required']]);
            return;
        }

        switch ($action) {
            case 'create_session':
                $roomId = "game:$gameId:$sessionId";
                $maxPlayers = max(2, min(64, (int) ($payload['maxPlayers'] ?? 2)));
                $settings = is_array($payload['settings'] ?? null) ? $payload['settings'] : [];
                $created = $rm->create($roomId, [
                    'maxPlayers' => $maxPlayers,
                    'metadata' => [
                        'gameId' => $gameId,
                        'sessionId' => $sessionId,
                        'hostId' => $connInfo['userId'],
                        'status' => 'lobby',
                        'settings' => $settings,
                    ],
                ], $connId);

                if (!$created) {
                    // Either the session id collides or the room cap is hit;
                    // claiming success here would leave two "hosts".
                    $ctx['sendToClient']($connId, ['type' => 'game', 'event' => 'error', 'payload' => ['message' => 'Session already exists or room limit reached', 'code' => 'SESSION_EXISTS']]);
                    return;
                }

                $rm->join($roomId, $connId, $connInfo);

                $ctx['sendToClient']($connId, [
                    'type' => 'game',
                    'event' => 'session_created',
                    'payload' => [
                        'sessionId' => $sessionId,
                        'roomId' => $roomId,
                        'gameId' => $gameId,
                        'hostId' => $connInfo['userId'],
                    ],
                ]);

                $ctx['broadcastToRoom']('lobby', [
                    'type' => 'game',
                    'event' => 'session_available',
                    'payload' => [
                        'sessionId' => $sessionId,
                        'roomId' => $roomId,
                        'gameId' => $gameId,
                        'hostName' => $connInfo['displayName'],
                        'maxPlayers' => $maxPlayers,
                    ],
                ]);
                break;

            case 'join_session':
                $roomId = "game:$gameId:$sessionId";
                $result = $rm->join($roomId, $connId, $connInfo);
                if ($result['success']) {
                    $ctx['sendToClient']($connId, [
                        'type' => 'game',
                        'event' => 'session_joined',
                        'payload' => array_merge(['sessionId' => $sessionId, 'roomId' => $roomId], $rm->getRoomInfo($roomId) ?? []),
                    ]);
                    $ctx['broadcastToRoom']($roomId, [
                        'type' => 'game',
                        'event' => 'player_joined',
                        'payload' => [
                            'sessionId' => $sessionId,
                            'userId' => $connInfo['userId'],
                            'displayName' => $connInfo['displayName'],
                            'timestamp' => round(microtime(true) * 1000),
                        ],
                    ], $connId);
                } else {
                    $ctx['sendToClient']($connId, ['type' => 'game', 'event' => 'error', 'payload' => ['message' => $result['error']]]);
                }
                break;

            case 'leave_session':
                $roomId = "game:$gameId:$sessionId";
                $rm->leave($roomId, $connId);
                $ctx['broadcastToRoom']($roomId, [
                    'type' => 'game',
                    'event' => 'player_left',
                    'payload' => [
                        'sessionId' => $sessionId,
                        'userId' => $connInfo['userId'],
                        'displayName' => $connInfo['displayName'],
                        'timestamp' => round(microtime(true) * 1000),
                    ],
                ]);
                break;

            case 'start':
            case 'action':
            case 'state':
            case 'turn':
            case 'end':
                $roomId = "game:$gameId:$sessionId";
                if (!$rm->isInRoom($roomId, $connId)) {
                    $ctx['sendToClient']($connId, ['type' => 'game', 'event' => 'error', 'payload' => ['message' => 'Not in game session']]);
                    return;
                }
                $ctx['broadcastToRoom']($roomId, [
                    'type' => 'game',
                    'event' => $action,
                    'payload' => [
                        'sessionId' => $sessionId,
                        'gameId' => $gameId,
                        'userId' => $connInfo['userId'],
                        'displayName' => $connInfo['displayName'],
                        'data' => $data,
                        'timestamp' => round(microtime(true) * 1000),
                    ],
                ], $connId);
                break;

            case 'list_sessions':
                $rooms = $rm->listRooms('game:');
                $ctx['sendToClient']($connId, [
                    'type' => 'game',
                    'event' => 'session_list',
                    'payload' => ['sessions' => $rooms],
                ]);
                break;

            default:
                $ctx['sendToClient']($connId, ['type' => 'game', 'event' => 'error', 'payload' => ['message' => "Unknown game action: $action"]]);
        }
    }

    private function handleRpc(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $method = self::str($payload['method'] ?? '', 64) ?? '';
        $requestId = is_scalar($payload['requestId'] ?? null) ? $payload['requestId'] : null;

        switch ($method) {
            case 'getOnlineCount':
                // Count unique users, not connections (one user may have
                // several tabs open).
                $seen = [];
                foreach ($ctx['connections'] as $info) {
                    $uid = $info['userId'] ?? null;
                    if ($uid !== null) $seen[$uid] = true;
                }
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'result' => ['count' => count($seen)]],
                ]);
                break;

            case 'getRooms':
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'result' => ['rooms' => $ctx['roomManager']->listRooms(self::str($payload['filter'] ?? null, 128))]],
                ]);
                break;

            case 'getMyRooms':
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'result' => ['rooms' => $ctx['roomManager']->getRoomsForClient($connId)]],
                ]);
                break;

            default:
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'error' => "Unknown RPC method: $method"],
                ]);
        }
    }
}
