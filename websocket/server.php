<?php
/**
 * IlluminatOS! WebSocket Server (Pure PHP)
 *
 * Standalone PHP process that handles real-time multiplayer communication.
 * Authenticates against the existing PHP API and routes messages between clients.
 * Uses PHP stream_socket_server with the WebSocket protocol (RFC 6455).
 *
 * Usage:
 *   php server.php                                    # Start on default port 8081
 *   PHP_WS_PORT=9000 php server.php                   # Start on custom port
 *   PHP_API=http://localhost:8000 php server.php       # Custom PHP API URL
 */

require_once __DIR__ . '/WebSocketFrame.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/rooms.php';
require_once __DIR__ . '/handlers.php';

// Configuration
$PORT = intval(getenv('PHP_WS_PORT') ?: getenv('PORT') ?: 8081);
$PHP_API = getenv('PHP_API') ?: 'http://localhost:8000';
$HEARTBEAT_INTERVAL = 30; // seconds
$MAX_MESSAGE_SIZE = 64 * 1024; // 64KB
$REVOCATION_POLL_INTERVAL = 5; // seconds — how often to poll /auth/revocations

// Internal-auth secret: read from env at startup so we can call the
// /auth/revocations endpoint to discover revoked / evicted session tokens.
$INTERNAL_SECRET = '';
$envFile = __DIR__ . '/../backend/env.php';
if (file_exists($envFile)) {
    $env = @include $envFile;
    if (is_array($env)) {
        $INTERNAL_SECRET = (string) ($env['app']['internal_secret'] ?? '');
    }
}
if ($INTERNAL_SECRET === '') {
    fwrite(STDERR, "[WS] WARNING: env.app.internal_secret not configured — revocation polling disabled.\n");
}

// State
$connections = [];     // connId -> ['socket' => resource, 'userId' => int, 'userUuid' => string, ...]
$sockets = [];         // connId -> resource (for stream_select)
$userConnections = []; // userId -> [connId => true]
$readBuffers = [];     // connId -> string (partial frame buffer)
$rateLimits = [];      // userId -> ['count' => int, 'windowStart' => float]

$RATE_LIMIT_WINDOW = 1.0; // 1 second
$RATE_LIMIT_MAX = 30;     // 30 messages per second

$auth = new WebSocketAuth($PHP_API);
$roomManager = new RoomManager();
$handlers = new MessageHandlers($auth);

$nextConnId = 1;
$lastHeartbeat = time();
$lastCacheClean = time();
$lastRevocationPoll = time();
$revocationCursor = 0; // last seen event_log id for session.* events
$serverStartedAt = time();

// --- Utility functions ---

function generateId(): string
{
    return base_convert((string)round(microtime(true) * 1000), 10, 36) . bin2hex(random_bytes(4));
}

function nowMs(): float
{
    return round(microtime(true) * 1000);
}

/**
 * Send a JSON message to a specific connection.
 */
function sendToClient(string $connId, array $message): void
{
    global $connections;

    if (!isset($connections[$connId])) return;
    $socket = $connections[$connId]['socket'];

    $data = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $frame = WebSocketFrame::encode($data);

    @fwrite($socket, $frame);
}

/**
 * Broadcast a message to all members in a room, optionally excluding a connection.
 */
function broadcastToRoom(string $roomId, array $message, ?string $excludeConnId = null): void
{
    global $roomManager, $connections;

    $members = $roomManager->getMembers($roomId);
    if (!$members) return;

    $data = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $frame = WebSocketFrame::encode($data);

    foreach (array_keys($members) as $memberConnId) {
        if ($memberConnId === $excludeConnId) continue;
        if (!isset($connections[$memberConnId])) continue;
        @fwrite($connections[$memberConnId]['socket'], $frame);
    }
}

/**
 * Send a message to all connections of a specific user.
 */
function broadcastToUser(int $userId, array $message): void
{
    global $userConnections, $connections;

    if (!isset($userConnections[$userId])) return;

    $data = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $frame = WebSocketFrame::encode($data);

    foreach (array_keys($userConnections[$userId]) as $connId) {
        if (isset($connections[$connId])) {
            @fwrite($connections[$connId]['socket'], $frame);
        }
    }
}

/**
 * Get all connection IDs for a user.
 */
function getUserConnections(int $userId): array
{
    global $userConnections;
    return isset($userConnections[$userId]) ? array_keys($userConnections[$userId]) : [];
}

/**
 * Check rate limit for a user.
 */
function checkRateLimit(int $userId): bool
{
    global $rateLimits, $RATE_LIMIT_WINDOW, $RATE_LIMIT_MAX;

    $now = microtime(true);
    if (!isset($rateLimits[$userId]) || ($now - $rateLimits[$userId]['windowStart']) >= $RATE_LIMIT_WINDOW) {
        $rateLimits[$userId] = ['count' => 0, 'windowStart' => $now];
    }

    $rateLimits[$userId]['count']++;
    return $rateLimits[$userId]['count'] <= $RATE_LIMIT_MAX;
}

/**
 * Poll the v2 API for recently revoked / evicted session tokens and
 * disconnect any sockets currently authenticated with one of them.
 * Updates $revocationCursor to the highest event id observed so the
 * next poll only returns new revocations.
 *
 * Best-effort — failures are logged but never throw.
 */
function pollRevocations(): void
{
    global $PHP_API, $INTERNAL_SECRET, $revocationCursor, $connections, $auth;

    if ($INTERNAL_SECRET === '') return;

    // Keep polling until the server reports no more revocation rows. This
    // prevents revocations from being silently skipped when more than one
    // page (default 200) accumulates between polls.
    $maxPages = 10; // hard cap so a pathological backlog doesn't block the event loop
    for ($page = 0; $page < $maxPages; $page++) {
        $url = rtrim($PHP_API, '/') . '/api/v2/auth/revocations?since=' . $revocationCursor . '&limit=200';
        $context = stream_context_create([
            'http' => [
                'method'        => 'GET',
                'header'        => "X-Internal-Auth: $INTERNAL_SECRET\r\nAccept: application/json\r\n",
                'timeout'       => 3,
                'ignore_errors' => true,
            ],
        ]);

        $response = @file_get_contents($url, false, $context);
        if ($response === false) return;

        $data = @json_decode($response, true);
        if (!is_array($data)) return;

        $revocations = $data['revocations'] ?? [];
        $nextCursor = isset($data['lastEventId']) ? (int) $data['lastEventId'] : $revocationCursor;
        $hasMore = !empty($data['hasMore']);

        if (!empty($revocations)) {
            // Build token -> connIds map for O(1) lookup. Rebuild per page
            // because disconnectClient() mutates $connections.
            $tokenToConns = [];
            foreach ($connections as $cId => $cInfo) {
                if (!($cInfo['handshakeComplete'] ?? false)) continue;
                $token = $cInfo['token'] ?? '';
                if ($token === '') continue;
                $tokenToConns[$token][] = $cId;
            }

            foreach ($revocations as $rev) {
                $token = $rev['token'] ?? '';
                if ($token === '') continue;

                // Always invalidate the auth cache so a reconnect attempt will fail.
                $auth->invalidateAuth($token);

                if (!isset($tokenToConns[$token])) continue;

                foreach ($tokenToConns[$token] as $cId) {
                    $conn = $connections[$cId] ?? null;
                    if (!$conn) continue;
                    $reason = (string) ($rev['reason'] ?? 'revoked');
                    echo "[WS] Disconnecting connection $cId due to {$rev['type']} ({$reason})\n";
                    $closeFrame = WebSocketFrame::encodeClose(4001, 'Session ' . $reason);
                    @fwrite($conn['socket'], $closeFrame);
                    disconnectClient($cId);
                }
            }
        }

        // Advance cursor only after processing this page so a failure
        // above doesn't skip rows. The controller guarantees that
        // lastEventId never exceeds the last delivered row when hasMore
        // is true, so this is safe.
        $revocationCursor = max($revocationCursor, $nextCursor);

        if (!$hasMore) break;
    }
}

/**
 * Disconnect a client and clean up.
 */
function disconnectClient(string $connId): void
{
    global $connections, $sockets, $userConnections, $readBuffers, $roomManager;

    if (!isset($connections[$connId])) return;

    $info = $connections[$connId];
    $userId = $info['userId'] ?? null;

    // Leave all rooms
    $roomManager->leaveAll($connId);

    // Close socket
    @fclose($info['socket']);

    // Clean up connection tracking
    unset($connections[$connId]);
    unset($sockets[$connId]);
    unset($readBuffers[$connId]);

    if ($userId && isset($userConnections[$userId])) {
        unset($userConnections[$userId][$connId]);

        if (empty($userConnections[$userId])) {
            unset($userConnections[$userId]);

            // Broadcast presence leave
            broadcastToRoom('lobby', [
                'type' => 'presence',
                'event' => 'leave',
                'payload' => [
                    'userId' => $info['userId'],
                    'userUuid' => $info['userUuid'] ?? '',
                    'displayName' => $info['displayName'] ?? 'Unknown',
                    'timestamp' => nowMs(),
                ],
            ]);
        }
    }

    $displayName = $info['displayName'] ?? 'Unknown';
    $total = count($connections);
    echo "[WS] User disconnected: $displayName ($userId), total: $total\n";
}

// --- Create the server socket ---

$server = @stream_socket_server("tcp://0.0.0.0:$PORT", $errno, $errstr);
if (!$server) {
    fwrite(STDERR, "Failed to create server socket: $errstr ($errno)\n");
    exit(1);
}

stream_set_blocking($server, false);

echo "[IlluminatOS! WS] WebSocket server running on port $PORT\n";
echo "[IlluminatOS! WS] PHP API: $PHP_API\n";
echo "[IlluminatOS! WS] Health check: http://localhost:$PORT/health\n";
echo "[IlluminatOS! WS] WebSocket endpoint: ws://localhost:$PORT/ws\n";

// Seed the revocation cursor with the current latest event id so we don't
// replay historical revocations on startup.
if ($INTERNAL_SECRET !== '') {
    $seedUrl = rtrim($PHP_API, '/') . '/api/v2/auth/revocations?seed=1';
    $seedCtx = stream_context_create([
        'http' => [
            'method'        => 'GET',
            'header'        => "X-Internal-Auth: $INTERNAL_SECRET\r\nAccept: application/json\r\n",
            'timeout'       => 3,
            'ignore_errors' => true,
        ],
    ]);
    $seedResp = @file_get_contents($seedUrl, false, $seedCtx);
    if ($seedResp !== false) {
        $seedData = @json_decode($seedResp, true);
        if (is_array($seedData) && isset($seedData['lastEventId'])) {
            // Seed cursor at the *current* maximum event_log id so subsequent
            // polls only see new revocations. Use a follow-up request that
            // probes the most recent id (since=0, limit=1 returns oldest;
            // we just trust the API's returned lastEventId for the queried
            // range, which is fine for seeding).
            $revocationCursor = max($revocationCursor, (int) $seedData['lastEventId']);
            echo "[WS] Revocation cursor seeded at event_id=$revocationCursor\n";
        }
    }
}

// --- Main event loop ---

$running = true;

// Handle shutdown signals
if (function_exists('pcntl_signal')) {
    pcntl_signal(SIGTERM, function () use (&$running) {
        echo "[WS] Shutting down...\n";
        $running = false;
    });
    pcntl_signal(SIGINT, function () use (&$running) {
        echo "[WS] Shutting down...\n";
        $running = false;
    });
}

while ($running) {
    if (function_exists('pcntl_signal_dispatch')) {
        pcntl_signal_dispatch();
    }

    // Build the read array
    $read = [$server];
    foreach ($sockets as $connId => $socket) {
        if (is_resource($socket)) {
            $read[] = $socket;
        }
    }

    $write = null;
    $except = null;

    // Wait for activity (250ms timeout for housekeeping)
    $changed = @stream_select($read, $write, $except, 0, 250000);
    if ($changed === false) {
        // stream_select error (e.g., signal interruption)
        continue;
    }

    // Accept new connections
    if (in_array($server, $read)) {
        $newSocket = @stream_socket_accept($server, 0);
        if ($newSocket) {
            stream_set_blocking($newSocket, false);
            stream_set_timeout($newSocket, 5);

            $connId = 'c' . ($nextConnId++);

            // Temporarily store for handshake
            $sockets[$connId] = $newSocket;
            $readBuffers[$connId] = '';
            $connections[$connId] = [
                'socket' => $newSocket,
                'handshakeComplete' => false,
                'httpBuffer' => '',
                'handshakeDeadline' => microtime(true) + 5.0,
            ];
        }
        // Remove server from the read array
        $read = array_filter($read, fn($s) => $s !== $server);
    }

    // Process data from existing connections
    foreach ($read as $socket) {
        // Find the connId for this socket
        $connId = array_search($socket, $sockets, true);
        if ($connId === false) continue;

        $conn = &$connections[$connId];

        // Read data
        $data = @fread($socket, 65536);
        if ($data === false || $data === '') {
            if (feof($socket)) {
                if ($conn['handshakeComplete'] ?? false) {
                    disconnectClient($connId);
                } else {
                    @fclose($socket);
                    unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                }
            }
            continue;
        }

        // --- Handshake phase ---
        if (!($conn['handshakeComplete'] ?? false)) {
            $conn['httpBuffer'] = ($conn['httpBuffer'] ?? '') . $data;

            if (!str_contains($conn['httpBuffer'], "\r\n\r\n")) {
                continue; // Wait for full HTTP headers
            }

            $httpHeader = $conn['httpBuffer'];
            $path = WebSocketFrame::parsePath($httpHeader);

            // Health check endpoint (plain HTTP, not WebSocket)
            if ($path === '/health') {
                $healthBody = json_encode([
                    'status' => 'ok',
                    'connections' => count(array_filter($connections, fn($c) => $c['handshakeComplete'] ?? false)),
                    'rooms' => $roomManager->getRoomCount(),
                    'uptime' => time() - $serverStartedAt,
                ]);
                $healthResponse = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " . strlen($healthBody) . "\r\nConnection: close\r\n\r\n" . $healthBody;
                @fwrite($socket, $healthResponse);
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            // Only accept WebSocket connections on /ws
            if ($path !== '/ws') {
                $notFound = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
                @fwrite($socket, $notFound);
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            // Verify required WebSocket upgrade headers.
            $isUpgrade = preg_match('/Upgrade:\s*websocket\r\n/i', $httpHeader) === 1;
            $isConnectionUpgrade = preg_match('/Connection:\s*[^\r\n]*\bUpgrade\b[^\r\n]*\r\n/i', $httpHeader) === 1;
            $hasWsVersion = preg_match('/Sec-WebSocket-Version:\s*13\r\n/i', $httpHeader) === 1;
            if (!$isUpgrade || !$isConnectionUpgrade || !$hasWsVersion) {
                $badRequest = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n";
                @fwrite($socket, $badRequest);
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            // Check for WebSocket upgrade
            if (!preg_match('/Sec-WebSocket-Key:\s*(.+)\r\n/i', $httpHeader, $matches)) {
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            $key = trim($matches[1]);
            $acceptKey = base64_encode(sha1($key . '258EAFA5-E914-47DA-95CA-5AB5DC65C5B3', true));

            // If the client offered the 'illuminatos' subprotocol, echo it
            // back in the upgrade response. This keeps strict browsers happy
            // when we authenticate via the token.* subprotocol — the server
            // MUST pick a protocol from the offered list, and we want to
            // avoid echoing the token entry (which would put the token in
            // response headers).
            $responseProtocolHeader = '';
            if (preg_match('/Sec-WebSocket-Protocol:\s*([^\r\n]+)/i', $httpHeader, $protoMatches)) {
                $offered = array_map('trim', explode(',', $protoMatches[1]));
                if (in_array('illuminatos', $offered, true)) {
                    $responseProtocolHeader = "Sec-WebSocket-Protocol: illuminatos\r\n";
                }
            }

            $response = "HTTP/1.1 101 Switching Protocols\r\n" .
                "Upgrade: websocket\r\n" .
                "Connection: Upgrade\r\n" .
                "Sec-WebSocket-Accept: $acceptKey\r\n" .
                $responseProtocolHeader .
                "\r\n";

            @fwrite($socket, $response);

            // Token sources, in order of preference:
            //   1. Sec-WebSocket-Protocol: token.<jwt>   (preferred; tokens
            //      stay out of URLs / proxy logs / browser history)
            //   2. Authorization: Bearer <jwt>           (programmatic clients)
            //   3. ?token=<jwt> query param              (legacy; deprecated)
            $token = WebSocketFrame::parseSubprotocolToken($httpHeader);
            if (!$token) {
                $token = WebSocketFrame::parseAuthHeader($httpHeader);
            }
            if (!$token) {
                $params = WebSocketFrame::parseQueryParams($httpHeader);
                $token = $params['token'] ?? '';
            }

            if (!$token) {
                $closeFrame = WebSocketFrame::encodeClose(4001, 'Authentication required');
                @fwrite($socket, $closeFrame);
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            // Authenticate against PHP API
            $user = $auth->authenticate($token);
            if (!$user) {
                $closeFrame = WebSocketFrame::encodeClose(4001, 'Authentication failed');
                @fwrite($socket, $closeFrame);
                @fclose($socket);
                unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                continue;
            }

            // Handshake complete - update connection info
            $connections[$connId] = [
                'socket' => $socket,
                'handshakeComplete' => true,
                'userId' => $user['id'],
                'userUuid' => $user['uuid'] ?? '',
                'displayName' => $user['display_name'] ?? 'User',
                'role' => $user['role'] ?? 'user',
                'token' => $token,
                'connectedAt' => nowMs(),
                'alive' => true,
            ];

            // Track user connections
            if (!isset($userConnections[$user['id']])) {
                $userConnections[$user['id']] = [];
            }
            $userConnections[$user['id']][$connId] = true;

            // Auto-join lobby — token omitted from room member info
            // since rooms only need identity, not credentials.
            $connInfo = [
                'userId' => $user['id'],
                'userUuid' => $user['uuid'] ?? '',
                'displayName' => $user['display_name'] ?? 'User',
                'role' => $user['role'] ?? 'user',
            ];
            $roomManager->join('lobby', $connId, $connInfo);

            $total = count(array_filter($connections, fn($c) => $c['handshakeComplete'] ?? false));
            echo "[WS] User connected: {$user['display_name']} ({$user['id']}), total: $total\n";

            // Send welcome message
            sendToClient($connId, [
                'type' => 'system',
                'event' => 'connected',
                'payload' => [
                    'userId' => $user['id'],
                    'userUuid' => $user['uuid'] ?? '',
                    'displayName' => $user['display_name'] ?? 'User',
                    'serverTime' => nowMs(),
                ],
            ]);

            // Broadcast presence join to lobby
            broadcastToRoom('lobby', [
                'type' => 'presence',
                'event' => 'join',
                'payload' => [
                    'userId' => $user['id'],
                    'userUuid' => $user['uuid'] ?? '',
                    'displayName' => $user['display_name'] ?? 'User',
                    'timestamp' => nowMs(),
                ],
            ], $connId);

            // Send current online users list
            $onlineUsers = [];
            $seen = [];
            foreach ($connections as $cId => $cInfo) {
                if (!($cInfo['handshakeComplete'] ?? false)) continue;
                $uid = $cInfo['userId'] ?? null;
                if ($uid && !isset($seen[$uid])) {
                    $seen[$uid] = true;
                    $onlineUsers[] = [
                        'userId' => $uid,
                        'userUuid' => $cInfo['userUuid'] ?? '',
                        'displayName' => $cInfo['displayName'] ?? 'User',
                    ];
                }
            }
            sendToClient($connId, [
                'type' => 'presence',
                'event' => 'online_list',
                'payload' => ['users' => $onlineUsers],
            ]);

            $readBuffers[$connId] = '';
            continue;
        }

        // --- WebSocket frame phase ---
        $readBuffers[$connId] = ($readBuffers[$connId] ?? '') . $data;

        // Prevent unbounded memory growth for malformed/unfinished frames.
        if (strlen($readBuffers[$connId]) > ($MAX_MESSAGE_SIZE * 2)) {
            @fwrite($conn['socket'], WebSocketFrame::encodeClose(1009, 'Message too large'));
            disconnectClient($connId);
            continue;
        }

        // Process all complete frames in the buffer
        while (strlen($readBuffers[$connId]) >= 2) {
            // Client -> server frames must be masked per RFC 6455.
            $isMasked = (ord($readBuffers[$connId][1]) & 0x80) !== 0;
            if (!$isMasked) {
                @fwrite($conn['socket'], WebSocketFrame::encodeClose(1002, 'Protocol error: unmasked frame'));
                disconnectClient($connId);
                break;
            }

            $frame = WebSocketFrame::decode($readBuffers[$connId]);
            if ($frame === false) {
                break; // Incomplete frame, wait for more data
            }

            // Remove processed bytes from buffer
            $readBuffers[$connId] = substr($readBuffers[$connId], $frame['length']);

            switch ($frame['opcode']) {
                case WebSocketFrame::OPCODE_TEXT:
                    // Rate limit check
                    $userId = $conn['userId'] ?? null;
                    if ($userId && !checkRateLimit($userId)) {
                        sendToClient($connId, [
                            'type' => 'system',
                            'event' => 'error',
                            'payload' => ['message' => 'Rate limit exceeded', 'code' => 'RATE_LIMITED'],
                        ]);
                        break;
                    }

                    // Enforce max message size
                    if (strlen($frame['payload']) > $MAX_MESSAGE_SIZE) {
                        sendToClient($connId, [
                            'type' => 'system',
                            'event' => 'error',
                            'payload' => ['message' => 'Message too large', 'code' => 'MESSAGE_TOO_LARGE'],
                        ]);
                        break;
                    }

                    $message = json_decode($frame['payload'], true);
                    if ($message === null) {
                        sendToClient($connId, [
                            'type' => 'system',
                            'event' => 'error',
                            'payload' => ['message' => 'Invalid JSON', 'code' => 'INVALID_MESSAGE'],
                        ]);
                        break;
                    }

                    if (empty($message['type'])) {
                        sendToClient($connId, [
                            'type' => 'system',
                            'event' => 'error',
                            'payload' => ['message' => 'Missing message type', 'code' => 'INVALID_MESSAGE'],
                        ]);
                        break;
                    }

                    // Stamp with sender info
                    $message['senderId'] = $conn['userId'];
                    $message['senderUuid'] = $conn['userUuid'] ?? '';
                    $message['senderName'] = $conn['displayName'] ?? 'User';
                    $message['timestamp'] = nowMs();
                    $message['messageId'] = $message['messageId'] ?? generateId();

                    // Build context for handlers
                    $connInfo = [
                        'userId' => $conn['userId'],
                        'userUuid' => $conn['userUuid'] ?? '',
                        'displayName' => $conn['displayName'] ?? 'User',
                        'role' => $conn['role'] ?? 'user',
                        'token' => $conn['token'] ?? '',
                    ];

                    $ctx = [
                        'connections' => array_filter($connections, fn($c) => $c['handshakeComplete'] ?? false),
                        'roomManager' => $roomManager,
                        'sendToClient' => 'sendToClient',
                        'broadcastToRoom' => 'broadcastToRoom',
                        'broadcastToUser' => 'broadcastToUser',
                        'getUserConnections' => 'getUserConnections',
                        'PHP_API' => $PHP_API,
                        'connInfo' => $connInfo,
                    ];

                    try {
                        $handlers->handle($connId, $message, $ctx);
                    } catch (\Exception $e) {
                        echo "[WS] Handler error: " . $e->getMessage() . "\n";
                        sendToClient($connId, [
                            'type' => 'system',
                            'event' => 'error',
                            'payload' => ['message' => 'Internal server error', 'code' => 'HANDLER_ERROR'],
                        ]);
                    }
                    break;

                case WebSocketFrame::OPCODE_PING:
                    $pong = WebSocketFrame::encodePong($frame['payload']);
                    @fwrite($conn['socket'], $pong);
                    break;

                case WebSocketFrame::OPCODE_PONG:
                    $conn['alive'] = true;
                    break;

                case WebSocketFrame::OPCODE_CLOSE:
                    // Send close frame back
                    @fwrite($conn['socket'], WebSocketFrame::encodeClose());
                    disconnectClient($connId);
                    break;
            }
        }
    }

    // --- Housekeeping ---
    $now = time();

    // Heartbeat - detect dead connections
    if ($now - $lastHeartbeat >= $HEARTBEAT_INTERVAL) {
        $lastHeartbeat = $now;
        foreach ($connections as $connId => &$conn) {
            if (!($conn['handshakeComplete'] ?? false)) {
                // Check handshake timeout
                if (isset($conn['handshakeDeadline']) && microtime(true) > $conn['handshakeDeadline']) {
                    @fclose($conn['socket']);
                    unset($connections[$connId], $sockets[$connId], $readBuffers[$connId]);
                }
                continue;
            }
            if (!$conn['alive']) {
                echo "[WS] Terminating dead connection: " . ($conn['displayName'] ?? 'Unknown') . "\n";
                disconnectClient($connId);
                continue;
            }
            $conn['alive'] = false;
            $ping = WebSocketFrame::encodePing();
            @fwrite($conn['socket'], $ping);
        }
        unset($conn);
    }

    // Clean auth cache every 5 minutes
    if ($now - $lastCacheClean >= 300) {
        $lastCacheClean = $now;
        $auth->cleanCache();

        // Clean stale rate limits
        $nowf = microtime(true);
        foreach ($rateLimits as $uid => $limit) {
            if ($nowf - $limit['windowStart'] > $RATE_LIMIT_WINDOW * 10) {
                unset($rateLimits[$uid]);
            }
        }
    }

    // Poll the v2 API for revoked / evicted session tokens and disconnect
    // any sockets currently authenticated with one of them.
    if ($now - $lastRevocationPoll >= $REVOCATION_POLL_INTERVAL) {
        $lastRevocationPoll = $now;
        try {
            pollRevocations();
        } catch (\Throwable $e) {
            error_log('[WS] pollRevocations failed: ' . $e->getMessage());
        }
    }
}

// Shutdown
echo "[WS] Server stopped.\n";
foreach ($connections as $connId => $conn) {
    if (($conn['handshakeComplete'] ?? false) && is_resource($conn['socket'])) {
        @fwrite($conn['socket'], WebSocketFrame::encodeClose(1001, 'Server shutting down'));
    }
    @fclose($conn['socket']);
}
@fclose($server);
