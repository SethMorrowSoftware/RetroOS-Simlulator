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
$MAX_CONNECTIONS = intval(getenv('PHP_WS_MAX_CONNECTIONS') ?: 500);
$MAX_CONNECTIONS_PER_IP = intval(getenv('PHP_WS_MAX_CONN_PER_IP') ?: 20);
$MAX_WRITE_BUFFER = 1024 * 1024; // 1MB of pending outbound bytes before a slow client is dropped
$REVALIDATE_INTERVAL = 600; // seconds — re-check each connection's token against the API
$REVALIDATE_BATCH = 10;     // max token revalidation API calls per sweep

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
$socketConnIds = [];   // (int) socket resource id -> connId (reverse lookup)
$userConnections = []; // userId -> [connId => true]
$readBuffers = [];     // connId -> string (partial frame buffer)
$writeBuffers = [];    // connId -> string (pending outbound bytes for slow sockets)
$pendingHandshakes = []; // connId -> deadline (float) for connections still in HTTP handshake
$ipConnCounts = [];    // ip -> open connection count
$rateLimits = [];      // userId -> ['count' => int, 'windowStart' => float, 'notified' => bool]

$RATE_LIMIT_WINDOW = 1.0; // 1 second
$RATE_LIMIT_MAX = 30;     // 30 messages per second

$auth = new WebSocketAuth($PHP_API);
$roomManager = new RoomManager();
$handlers = new MessageHandlers($auth);

$nextConnId = 1;
$lastHeartbeat = time();
$lastCacheClean = time();
$lastRevocationPoll = time();
$lastRevalidateSweep = time();
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
 * Queue raw bytes for a connection, writing immediately when the socket
 * accepts them. Sockets are non-blocking, so fwrite may take only part of
 * the payload (or none); the remainder is buffered and flushed when
 * stream_select reports the socket writable. A connection whose buffer
 * exceeds $MAX_WRITE_BUFFER is dropped — unbounded buffering for a slow
 * consumer would otherwise let one client exhaust server memory.
 */
function queueWrite(string $connId, string $bytes): void
{
    global $connections, $writeBuffers, $MAX_WRITE_BUFFER;

    if (!isset($connections[$connId])) return;

    $buffered = $writeBuffers[$connId] ?? '';
    if ($buffered === '') {
        $written = @fwrite($connections[$connId]['socket'], $bytes);
        if ($written === false) $written = 0;
        if ($written >= strlen($bytes)) return;
        $buffered = substr($bytes, $written);
    } else {
        $buffered .= $bytes;
    }

    if (strlen($buffered) > $MAX_WRITE_BUFFER) {
        echo "[WS] Dropping slow consumer $connId (write buffer overflow)\n";
        disconnectClient($connId);
        return;
    }

    $writeBuffers[$connId] = $buffered;
}

/**
 * Flush as much of a connection's pending write buffer as the socket accepts.
 */
function flushWriteBuffer(string $connId): void
{
    global $connections, $writeBuffers;

    if (!isset($connections[$connId]) || !isset($writeBuffers[$connId])) return;

    $buf = $writeBuffers[$connId];
    if ($buf === '') {
        unset($writeBuffers[$connId]);
        return;
    }

    $written = @fwrite($connections[$connId]['socket'], $buf);
    if ($written === false || $written === 0) return;

    if ($written >= strlen($buf)) {
        unset($writeBuffers[$connId]);
    } else {
        $writeBuffers[$connId] = substr($buf, $written);
    }
}

/**
 * Send a JSON message to a specific connection.
 */
function sendToClient(string $connId, array $message): void
{
    global $connections;

    if (!isset($connections[$connId])) return;

    $data = json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $frame = WebSocketFrame::encode($data);

    queueWrite($connId, $frame);
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
        queueWrite($memberConnId, $frame);
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
            queueWrite($connId, $frame);
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
 * Check rate limit for a user. Returns true when the frame is within budget.
 * The 'notified' flag lets callers send at most one RATE_LIMITED error per
 * window instead of amplifying a flood with one error frame per violation.
 */
function checkRateLimit(int $userId): bool
{
    global $rateLimits, $RATE_LIMIT_WINDOW, $RATE_LIMIT_MAX;

    $now = microtime(true);
    if (!isset($rateLimits[$userId]) || ($now - $rateLimits[$userId]['windowStart']) >= $RATE_LIMIT_WINDOW) {
        $rateLimits[$userId] = ['count' => 0, 'windowStart' => $now, 'notified' => false];
    }

    $rateLimits[$userId]['count']++;
    return $rateLimits[$userId]['count'] <= $RATE_LIMIT_MAX;
}

/**
 * True once per rate-limit window: whether to send the RATE_LIMITED notice.
 */
function shouldNotifyRateLimit(int $userId): bool
{
    global $rateLimits;
    if (!isset($rateLimits[$userId]) || $rateLimits[$userId]['notified']) return false;
    $rateLimits[$userId]['notified'] = true;
    return true;
}

/**
 * Parse the client IP out of a stream peer name ("ip:port" / "[v6]:port").
 */
function peerIp($socket): string
{
    $peer = @stream_socket_get_name($socket, true);
    if (!is_string($peer) || $peer === '') return 'unknown';
    $pos = strrpos($peer, ':');
    $ip = $pos === false ? $peer : substr($peer, 0, $pos);
    return trim($ip, '[]');
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

        if (!empty($revocations) && is_array($revocations)) {
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
                if (!is_array($rev)) continue;
                $token = $rev['token'] ?? '';
                if (!is_string($token) || $token === '') continue;

                // Always invalidate the auth cache so a reconnect attempt will fail.
                $auth->invalidateAuth($token);

                if (!isset($tokenToConns[$token])) continue;

                foreach ($tokenToConns[$token] as $cId) {
                    $conn = $connections[$cId] ?? null;
                    if (!$conn) continue;
                    $reason = (string) ($rev['reason'] ?? 'revoked');
                    $type = (string) ($rev['type'] ?? 'session.revoked');
                    echo "[WS] Disconnecting connection $cId due to {$type} ({$reason})\n";
                    sendCloseAndDisconnect($cId, 4001, 'Session ' . $reason);
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
 * Re-validate a bounded batch of long-lived connections' tokens against the
 * API. Session *revocations* arrive via pollRevocations(), but plain token
 * expiry produces no revocation event — without this sweep an expired
 * session would keep its socket forever. Only a definitive 401/403 from the
 * API disconnects; transport failures leave the connection alone (the
 * revocation poller remains the authority for forced logout).
 */
function revalidateConnections(): void
{
    global $connections, $auth, $REVALIDATE_INTERVAL, $REVALIDATE_BATCH;

    $now = microtime(true);
    $checked = [];   // token -> ?bool result (dedupe API calls across conns)
    $apiCalls = 0;

    foreach ($connections as $connId => $conn) {
        if (!($conn['handshakeComplete'] ?? false)) continue;
        if (($now - ($conn['lastValidatedAt'] ?? 0)) < $REVALIDATE_INTERVAL) continue;

        $token = $conn['token'] ?? '';
        if ($token === '') continue;

        if (!array_key_exists($token, $checked)) {
            if ($apiCalls >= $REVALIDATE_BATCH) break;
            $apiCalls++;
            $checked[$token] = $auth->revalidate($token);
        }

        $result = $checked[$token];
        if ($result === false) {
            echo "[WS] Disconnecting connection $connId (session expired)\n";
            sendCloseAndDisconnect($connId, 4001, 'Session expired');
        } elseif ($result === true) {
            $connections[$connId]['lastValidatedAt'] = $now;
        } else {
            // Indeterminate (API unreachable) — retry on a shorter fuse
            // instead of hammering a down API for every connection.
            $connections[$connId]['lastValidatedAt'] = $now - $REVALIDATE_INTERVAL + 60;
        }
    }
}

/**
 * Drop a connection that never completed its handshake (no rooms/presence
 * to unwind, no broadcast). Used for health checks, bad requests, and
 * handshake timeouts.
 */
function dropRawConnection(string $connId): void
{
    global $connections, $sockets, $socketConnIds, $readBuffers, $writeBuffers, $pendingHandshakes, $ipConnCounts;

    $info = $connections[$connId] ?? null;
    if ($info) {
        releaseIpSlot($info['ip'] ?? null);
        if (isset($info['socket'])) {
            unset($socketConnIds[(int) $info['socket']]);
            @fclose($info['socket']);
        }
    }
    unset($connections[$connId], $sockets[$connId], $readBuffers[$connId], $writeBuffers[$connId], $pendingHandshakes[$connId]);
}

function releaseIpSlot(?string $ip): void
{
    global $ipConnCounts;
    if ($ip === null || $ip === '') return;
    if (isset($ipConnCounts[$ip])) {
        $ipConnCounts[$ip]--;
        if ($ipConnCounts[$ip] <= 0) unset($ipConnCounts[$ip]);
    }
}

/**
 * Best-effort close frame then full disconnect. The close frame is written
 * directly (after flushing any pending buffer) because the socket is closed
 * immediately afterwards — queueWrite would never get a flush cycle.
 */
function sendCloseAndDisconnect(string $connId, int $code = 1000, string $reason = ''): void
{
    global $connections, $writeBuffers;

    $conn = $connections[$connId] ?? null;
    if ($conn) {
        if (!empty($writeBuffers[$connId])) {
            @fwrite($conn['socket'], $writeBuffers[$connId]);
        }
        @fwrite($conn['socket'], WebSocketFrame::encodeClose($code, $reason));
    }
    disconnectClient($connId);
}

/**
 * Disconnect a client and clean up.
 */
function disconnectClient(string $connId): void
{
    global $connections, $sockets, $socketConnIds, $userConnections, $readBuffers, $writeBuffers, $pendingHandshakes, $roomManager;

    if (!isset($connections[$connId])) return;

    $info = $connections[$connId];
    $userId = $info['userId'] ?? null;

    // Leave all rooms
    $roomManager->leaveAll($connId);

    // Close socket
    releaseIpSlot($info['ip'] ?? null);
    if (isset($info['socket'])) {
        unset($socketConnIds[(int) $info['socket']]);
        @fclose($info['socket']);
    }

    // Clean up connection tracking
    unset($connections[$connId]);
    unset($sockets[$connId]);
    unset($readBuffers[$connId]);
    unset($writeBuffers[$connId]);
    unset($pendingHandshakes[$connId]);

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

/**
 * Process buffered HTTP handshake data for a connection.
 */
function processHandshake(string $connId): void
{
    global $connections, $sockets, $socketConnIds, $readBuffers, $userConnections, $pendingHandshakes,
           $roomManager, $auth, $serverStartedAt;

    $conn = &$connections[$connId];
    $socket = $conn['socket'];

    if (!str_contains($conn['httpBuffer'], "\r\n\r\n")) {
        // Cap header size while waiting for the full request — a client
        // streaming endless header bytes should not grow memory.
        if (strlen($conn['httpBuffer']) > 16384) {
            dropRawConnection($connId);
        }
        return; // Wait for full HTTP headers
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
        dropRawConnection($connId);
        return;
    }

    // Only accept WebSocket connections on /ws
    if ($path !== '/ws') {
        $notFound = "HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n";
        @fwrite($socket, $notFound);
        dropRawConnection($connId);
        return;
    }

    // Verify required WebSocket upgrade headers.
    $isUpgrade = preg_match('/Upgrade:\s*websocket\r\n/i', $httpHeader) === 1;
    $isConnectionUpgrade = preg_match('/Connection:\s*[^\r\n]*\bUpgrade\b[^\r\n]*\r\n/i', $httpHeader) === 1;
    $hasWsVersion = preg_match('/Sec-WebSocket-Version:\s*13\r\n/i', $httpHeader) === 1;
    if (!$isUpgrade || !$isConnectionUpgrade || !$hasWsVersion) {
        $badRequest = "HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n";
        @fwrite($socket, $badRequest);
        dropRawConnection($connId);
        return;
    }

    // Check for WebSocket upgrade
    if (!preg_match('/Sec-WebSocket-Key:\s*(.+)\r\n/i', $httpHeader, $matches)) {
        dropRawConnection($connId);
        return;
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

    // W4.3 — Subprotocol auth is the only supported method.
    //
    // The legacy `Authorization: Bearer` header and `?token=` query
    // param were accepted for backward compatibility with pre-PR-1
    // clients. Both leaked tokens into proxy logs / browser history /
    // server access logs; both have been removed.
    //
    // External clients (the React Native app, integrations) must
    // pass the token via `Sec-WebSocket-Protocol: token.<jwt>`. See
    // `core/MultiplayerClient.js` for the canonical client-side form.
    $token = WebSocketFrame::parseSubprotocolToken($httpHeader);

    if (!$token) {
        // Complete the upgrade before closing so the client sees a clean
        // WebSocket close (4001) instead of an opaque handshake failure.
        @fwrite($socket, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: $acceptKey\r\n" . $responseProtocolHeader . "\r\n");
        @fwrite($socket, WebSocketFrame::encodeClose(4001, 'Authentication required'));
        dropRawConnection($connId);
        return;
    }

    // Authenticate against PHP API
    $user = $auth->authenticate($token);
    if (!$user) {
        @fwrite($socket, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: $acceptKey\r\n" . $responseProtocolHeader . "\r\n");
        @fwrite($socket, WebSocketFrame::encodeClose(4001, 'Authentication failed'));
        dropRawConnection($connId);
        return;
    }

    $response = "HTTP/1.1 101 Switching Protocols\r\n" .
        "Upgrade: websocket\r\n" .
        "Connection: Upgrade\r\n" .
        "Sec-WebSocket-Accept: $acceptKey\r\n" .
        $responseProtocolHeader .
        "\r\n";

    // Handshake complete - update connection info
    $ip = $conn['ip'] ?? 'unknown';
    $connections[$connId] = [
        'socket' => $socket,
        'handshakeComplete' => true,
        'userId' => $user['id'],
        'userUuid' => $user['uuid'] ?? '',
        'displayName' => $user['display_name'] ?? 'User',
        'role' => $user['role'] ?? 'user',
        'token' => $token,
        'ip' => $ip,
        'connectedAt' => nowMs(),
        'lastValidatedAt' => microtime(true),
        'alive' => true,
        'fragOpcode' => null,
        'fragBuffer' => '',
    ];
    unset($pendingHandshakes[$connId]);
    $readBuffers[$connId] = '';

    queueWrite($connId, $response);

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
}

/**
 * Handle one complete, validated text message (after fragment reassembly).
 */
function processTextMessage(string $connId, string $payload): void
{
    global $connections, $handlers, $roomManager, $PHP_API, $MAX_MESSAGE_SIZE;

    $conn = $connections[$connId] ?? null;
    if (!$conn) return;

    // Enforce max message size
    if (strlen($payload) > $MAX_MESSAGE_SIZE) {
        sendToClient($connId, [
            'type' => 'system',
            'event' => 'error',
            'payload' => ['message' => 'Message too large', 'code' => 'MESSAGE_TOO_LARGE'],
        ]);
        return;
    }

    // RFC 6455 §8.1: text frames must contain valid UTF-8.
    if (!mb_check_encoding($payload, 'UTF-8')) {
        sendCloseAndDisconnect($connId, 1007, 'Invalid UTF-8');
        return;
    }

    $message = json_decode($payload, true);
    if (!is_array($message)) {
        sendToClient($connId, [
            'type' => 'system',
            'event' => 'error',
            'payload' => ['message' => 'Invalid JSON', 'code' => 'INVALID_MESSAGE'],
        ]);
        return;
    }

    if (empty($message['type']) || !is_string($message['type'])) {
        sendToClient($connId, [
            'type' => 'system',
            'event' => 'error',
            'payload' => ['message' => 'Missing message type', 'code' => 'INVALID_MESSAGE'],
        ]);
        return;
    }

    // Normalise payload to an array so handlers never see scalars where
    // they expect structures (a scalar payload would otherwise reach
    // type-hinted code and fatal).
    if (!is_array($message['payload'] ?? null)) {
        $message['payload'] = [];
    }

    // Stamp with sender info (never trust client-supplied identity)
    $message['senderId'] = $conn['userId'];
    $message['senderUuid'] = $conn['userUuid'] ?? '';
    $message['senderName'] = $conn['displayName'] ?? 'User';
    $message['timestamp'] = nowMs();
    $mid = $message['messageId'] ?? null;
    $message['messageId'] = (is_string($mid) && $mid !== '' && strlen($mid) <= 64) ? $mid : generateId();

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

    global $handlers;
    try {
        $handlers->handle($connId, $message, $ctx);
    } catch (\Throwable $e) {
        // \Throwable, not \Exception: a TypeError from a malformed payload
        // must never escape and kill the server loop.
        echo "[WS] Handler error: " . $e->getMessage() . "\n";
        sendToClient($connId, [
            'type' => 'system',
            'event' => 'error',
            'payload' => ['message' => 'Internal server error', 'code' => 'HANDLER_ERROR'],
        ]);
    }
}

/**
 * Decode and dispatch every complete frame buffered for a connection.
 * Handles RFC 6455 fragmentation (continuation frames), control-frame
 * rules, and per-frame rate limiting.
 */
function processFrames(string $connId): void
{
    global $connections, $readBuffers, $MAX_MESSAGE_SIZE;

    while (isset($connections[$connId], $readBuffers[$connId]) && strlen($readBuffers[$connId]) >= 2) {
        // Client -> server frames must be masked per RFC 6455.
        $isMasked = (ord($readBuffers[$connId][1]) & 0x80) !== 0;
        if (!$isMasked) {
            sendCloseAndDisconnect($connId, 1002, 'Protocol error: unmasked frame');
            return;
        }

        $frame = WebSocketFrame::decode($readBuffers[$connId]);
        if ($frame === false) {
            return; // Incomplete frame, wait for more data
        }

        // Remove processed bytes from buffer
        $readBuffers[$connId] = substr($readBuffers[$connId], $frame['length']);

        $opcode = $frame['opcode'];
        $isControl = ($opcode & 0x8) !== 0;

        // RFC 6455 §5.5: control frames must not be fragmented and their
        // payload must be 125 bytes or fewer.
        if ($isControl && (!$frame['fin'] || strlen($frame['payload']) > 125)) {
            sendCloseAndDisconnect($connId, 1002, 'Protocol error: bad control frame');
            return;
        }

        // Rate-limit every frame (not just text): a ping/pong flood is as
        // cheap to send as a message flood. Close frames always process.
        if ($opcode !== WebSocketFrame::OPCODE_CLOSE) {
            $userId = $connections[$connId]['userId'] ?? null;
            if ($userId && !checkRateLimit($userId)) {
                if ($opcode === WebSocketFrame::OPCODE_TEXT && shouldNotifyRateLimit($userId)) {
                    sendToClient($connId, [
                        'type' => 'system',
                        'event' => 'error',
                        'payload' => ['message' => 'Rate limit exceeded', 'code' => 'RATE_LIMITED'],
                    ]);
                }
                continue; // drop the frame
            }
        }

        switch ($opcode) {
            case WebSocketFrame::OPCODE_TEXT:
            case WebSocketFrame::OPCODE_BINARY:
                if ($connections[$connId]['fragOpcode'] !== null) {
                    // New data frame while a fragmented message is in
                    // progress — protocol violation.
                    sendCloseAndDisconnect($connId, 1002, 'Protocol error: interleaved data frame');
                    return;
                }
                if ($opcode === WebSocketFrame::OPCODE_BINARY) {
                    sendCloseAndDisconnect($connId, 1003, 'Binary frames not supported');
                    return;
                }
                if (!$frame['fin']) {
                    // Start of a fragmented text message
                    if (strlen($frame['payload']) > $MAX_MESSAGE_SIZE) {
                        sendCloseAndDisconnect($connId, 1009, 'Message too large');
                        return;
                    }
                    $connections[$connId]['fragOpcode'] = $opcode;
                    $connections[$connId]['fragBuffer'] = $frame['payload'];
                    break;
                }
                processTextMessage($connId, $frame['payload']);
                break;

            case WebSocketFrame::OPCODE_CONTINUATION:
                if ($connections[$connId]['fragOpcode'] === null) {
                    sendCloseAndDisconnect($connId, 1002, 'Protocol error: unexpected continuation');
                    return;
                }
                $connections[$connId]['fragBuffer'] .= $frame['payload'];
                if (strlen($connections[$connId]['fragBuffer']) > $MAX_MESSAGE_SIZE) {
                    sendCloseAndDisconnect($connId, 1009, 'Message too large');
                    return;
                }
                if ($frame['fin']) {
                    $assembled = $connections[$connId]['fragBuffer'];
                    $connections[$connId]['fragOpcode'] = null;
                    $connections[$connId]['fragBuffer'] = '';
                    processTextMessage($connId, $assembled);
                }
                break;

            case WebSocketFrame::OPCODE_PING:
                queueWrite($connId, WebSocketFrame::encodePong($frame['payload']));
                break;

            case WebSocketFrame::OPCODE_PONG:
                $connections[$connId]['alive'] = true;
                break;

            case WebSocketFrame::OPCODE_CLOSE:
                // Echo the client's close code when it supplied a valid one.
                $code = 1000;
                if (strlen($frame['payload']) >= 2) {
                    $received = unpack('n', substr($frame['payload'], 0, 2))[1];
                    if ($received >= 1000 && $received <= 4999 && !in_array($received, [1004, 1005, 1006, 1015], true)) {
                        $code = $received;
                    }
                }
                sendCloseAndDisconnect($connId, $code);
                return;

            default:
                // Unknown / reserved opcode
                sendCloseAndDisconnect($connId, 1002, 'Protocol error: unknown opcode');
                return;
        }
    }
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
            // polls only see new revocations.
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

    // Sockets with pending outbound bytes need writability notifications.
    $write = [];
    foreach ($writeBuffers as $connId => $buf) {
        if ($buf !== '' && isset($sockets[$connId]) && is_resource($sockets[$connId])) {
            $write[] = $sockets[$connId];
        }
    }
    if ($write === []) $write = null;

    $except = null;

    // Wait for activity (250ms timeout for housekeeping)
    $changed = @stream_select($read, $write, $except, 0, 250000);
    if ($changed === false) {
        // stream_select error (e.g., signal interruption)
        continue;
    }

    // Flush pending writes for sockets that became writable
    if (is_array($write)) {
        foreach ($write as $socket) {
            $connId = $socketConnIds[(int) $socket] ?? null;
            if ($connId !== null) {
                flushWriteBuffer($connId);
            }
        }
    }

    // Accept new connections
    if (in_array($server, $read, true)) {
        $newSocket = @stream_socket_accept($server, 0);
        if ($newSocket) {
            $ip = peerIp($newSocket);
            $activeCount = count($connections);

            if ($activeCount >= $MAX_CONNECTIONS || ($ipConnCounts[$ip] ?? 0) >= $MAX_CONNECTIONS_PER_IP) {
                @fwrite($newSocket, "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
                @fclose($newSocket);
            } else {
                stream_set_blocking($newSocket, false);

                $connId = 'c' . ($nextConnId++);
                $deadline = microtime(true) + 5.0;

                // Temporarily store for handshake
                $sockets[$connId] = $newSocket;
                $socketConnIds[(int) $newSocket] = $connId;
                $readBuffers[$connId] = '';
                $pendingHandshakes[$connId] = $deadline;
                $ipConnCounts[$ip] = ($ipConnCounts[$ip] ?? 0) + 1;
                $connections[$connId] = [
                    'socket' => $newSocket,
                    'handshakeComplete' => false,
                    'httpBuffer' => '',
                    'ip' => $ip,
                    'handshakeDeadline' => $deadline,
                ];
            }
        }
        // Remove server from the read array
        $read = array_filter($read, fn($s) => $s !== $server);
    }

    // Process data from existing connections. Each connection is isolated
    // in a \Throwable guard: a bug triggered by one client must never take
    // down the loop (and every other client) with it.
    foreach ($read as $socket) {
        $connId = $socketConnIds[(int) $socket] ?? null;
        if ($connId === null || !isset($connections[$connId])) continue;

        try {
            // Read data
            $data = @fread($socket, 65536);
            if ($data === false || $data === '') {
                if (feof($socket)) {
                    if ($connections[$connId]['handshakeComplete'] ?? false) {
                        disconnectClient($connId);
                    } else {
                        dropRawConnection($connId);
                    }
                }
                continue;
            }

            // --- Handshake phase ---
            if (!($connections[$connId]['handshakeComplete'] ?? false)) {
                $connections[$connId]['httpBuffer'] = ($connections[$connId]['httpBuffer'] ?? '') . $data;
                processHandshake($connId);
                continue;
            }

            // --- WebSocket frame phase ---
            $readBuffers[$connId] = ($readBuffers[$connId] ?? '') . $data;

            // Prevent unbounded memory growth for malformed/unfinished frames.
            if (strlen($readBuffers[$connId]) > ($MAX_MESSAGE_SIZE * 2)) {
                sendCloseAndDisconnect($connId, 1009, 'Message too large');
                continue;
            }

            processFrames($connId);
        } catch (\Throwable $e) {
            echo "[WS] Connection error ($connId): " . $e->getMessage() . "\n";
            disconnectClient($connId);
        }
    }

    // --- Housekeeping ---
    $now = time();

    // Handshake timeouts are swept every loop iteration (250ms), not on the
    // 30s heartbeat — otherwise idle pre-handshake sockets hold file
    // descriptors for up to 30s (slow-loris).
    if (!empty($pendingHandshakes)) {
        $nowf = microtime(true);
        foreach ($pendingHandshakes as $connId => $deadline) {
            if ($nowf > $deadline) {
                dropRawConnection($connId);
            }
        }
    }

    // Heartbeat - detect dead connections
    if ($now - $lastHeartbeat >= $HEARTBEAT_INTERVAL) {
        $lastHeartbeat = $now;
        foreach ($connections as $connId => $conn) {
            if (!($conn['handshakeComplete'] ?? false)) continue;
            if (!$conn['alive']) {
                echo "[WS] Terminating dead connection: " . ($conn['displayName'] ?? 'Unknown') . "\n";
                disconnectClient($connId);
                continue;
            }
            $connections[$connId]['alive'] = false;
            queueWrite($connId, WebSocketFrame::encodePing());
        }
    }

    // Clean auth cache every 5 minutes; re-validate long-lived sessions.
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

    if ($now - $lastRevalidateSweep >= 60) {
        $lastRevalidateSweep = $now;
        try {
            revalidateConnections();
        } catch (\Throwable $e) {
            error_log('[WS] revalidateConnections failed: ' . $e->getMessage());
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
