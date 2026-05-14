<?php
/**
 * WebSocket Message Handlers
 *
 * Routes incoming messages to appropriate handlers based on message type.
 * Each handler receives the message and a context object with server utilities.
 */

class MessageHandlers
{
    private WebSocketAuth $auth;

    public function __construct(WebSocketAuth $auth)
    {
        $this->auth = $auth;
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
                    'clientTimestamp' => $message['timestamp'] ?? null,
                ]);
                break;
            default:
                $ctx['sendToClient']($connId, [
                    'type' => 'system',
                    'event' => 'error',
                    'payload' => ['message' => 'Unknown message type: ' . ($message['type'] ?? ''), 'code' => 'UNKNOWN_TYPE'],
                ]);
        }
    }

    private function handleRoom(string $connId, array $message, array $ctx): void
    {
        $payload = $message['payload'] ?? [];
        $action = $payload['action'] ?? '';
        $roomId = $payload['roomId'] ?? '';
        $options = $payload['options'] ?? [];
        $password = $payload['password'] ?? null;

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
                    $ctx['sendToClient']($connId, ['type' => 'room', 'event' => 'error', 'payload' => ['message' => 'Room already exists']]);
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
                $filter = $payload['filter'] ?? null;
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
        $channel = $payload['channel'] ?? '';
        $event = $payload['event'] ?? $payload['eventName'] ?? '';
        $data = $payload['data'] ?? [];
        $broadcast = $payload['broadcast'] ?? false;
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
                'event' => $event ?: 'broadcast',
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
        $action = $payload['action'] ?? '';
        $connInfo = $ctx['connInfo'];

        switch ($action) {
            case 'update_status':
                $ctx['broadcastToRoom']('lobby', [
                    'type' => 'presence',
                    'event' => 'status_update',
                    'payload' => [
                        'userId' => $connInfo['userId'],
                        'userUuid' => $connInfo['userUuid'],
                        'displayName' => $connInfo['displayName'],
                        'status' => $payload['status'] ?? 'online',
                        'activity' => $payload['activity'] ?? null,
                        'timestamp' => round(microtime(true) * 1000),
                    ],
                ], $connId);
                break;

            case 'typing':
                $roomId = $payload['roomId'] ?? '';
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
                    if (!isset($seen[$info['userId']])) {
                        $seen[$info['userId']] = true;
                        $onlineUsers[] = [
                            'userId' => $info['userId'],
                            'userUuid' => $info['userUuid'],
                            'displayName' => $info['displayName'],
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
        $channel = $payload['channel'] ?? '';
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
        $roomId = $payload['roomId'] ?? '';
        $text = $payload['text'] ?? '';
        $messageType = $payload['messageType'] ?? 'message';
        $connInfo = $ctx['connInfo'];

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];

        if (!$roomId || !$text) {
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

        if (!$targetUserId || !$text) {
            $ctx['sendToClient']($connId, ['type' => 'system', 'event' => 'error', 'payload' => ['message' => 'targetUserId and text required']]);
            return;
        }

        $parsedTargetId = intval($targetUserId);
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
                } catch (\Exception $e) {
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
        $action = $payload['action'] ?? '';
        $sessionId = $payload['sessionId'] ?? '';
        $gameId = $payload['gameId'] ?? '';
        $data = $payload['data'] ?? [];
        $connInfo = $ctx['connInfo'];

        /** @var RoomManager $rm */
        $rm = $ctx['roomManager'];

        switch ($action) {
            case 'create_session':
                $roomId = "game:$gameId:$sessionId";
                $rm->create($roomId, [
                    'maxPlayers' => $payload['maxPlayers'] ?? 2,
                    'metadata' => [
                        'gameId' => $gameId,
                        'sessionId' => $sessionId,
                        'hostId' => $connInfo['userId'],
                        'status' => 'lobby',
                        'settings' => $payload['settings'] ?? [],
                    ],
                ], $connId);
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
                        'maxPlayers' => $payload['maxPlayers'] ?? 2,
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
        $method = $payload['method'] ?? '';
        $requestId = $payload['requestId'] ?? null;

        switch ($method) {
            case 'getOnlineCount':
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'result' => ['count' => count($ctx['connections'])]],
                ]);
                break;

            case 'getRooms':
                $ctx['sendToClient']($connId, [
                    'type' => 'rpc',
                    'event' => 'response',
                    'payload' => ['requestId' => $requestId, 'result' => ['rooms' => $ctx['roomManager']->listRooms($payload['filter'] ?? null)]],
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
