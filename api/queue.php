<?php
/**
 * Remote Play Queue API
 *
 * Provides a server-authoritative queue/turn state with file locking,
 * automatic timeout purging, and deterministic promotion of next player.
 *
 * Endpoints:
 *   GET  /api/queue.php?action=status
 *   POST /api/queue.php action=join userId=... [name=...]
 *   POST /api/queue.php action=heartbeat userId=...
 *   POST /api/queue.php action=leave userId=...
 *   POST /api/queue.php action=complete userId=...
 *
 * Designed for small deployments (e.g. Raspberry Pi) and moderate concurrency.
 */

header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');

$action = $_REQUEST['action'] ?? 'status';

$stateFile = __DIR__ . '/../config/queue-state.json';
$stateDir = dirname($stateFile);
if (!is_dir($stateDir)) {
    mkdir($stateDir, 0775, true);
}

$now = time();

$defaults = [
    'version' => 1,
    'revision' => 0,
    'updatedAt' => $now,
    'queue' => [],
    'currentTurn' => null,
    'settings' => [
        // How long someone can stay queued without any heartbeat.
        'queuePresenceTimeoutSec' => 120,
        // Maximum turn duration before forced purge/promote.
        'turnTimeoutSec' => 30,
        // Hard queue cap to defend Pi memory/abuse.
        'maxQueueLength' => 100
    ]
];

$lockFp = fopen($stateFile, 'c+');
if (!$lockFp) {
    http_response_code(500);
    echo json_encode(['error' => 'Unable to open queue state file']);
    exit;
}

if (!flock($lockFp, LOCK_EX)) {
    fclose($lockFp);
    http_response_code(500);
    echo json_encode(['error' => 'Unable to lock queue state file']);
    exit;
}

try {
    $state = readState($lockFp, $defaults);

    // Always enforce timeout/purge rules before handling action.
    enforceQueueRules($state, $now);

    switch ($action) {
        case 'status':
            break;

        case 'join':
            ensurePost();
            $userId = normalizedUserId($_POST['userId'] ?? null);
            $name = trim((string)($_POST['name'] ?? ''));
            if ($name === '') {
                $name = $userId;
            }

            // Refresh if already active.
            if (isset($state['currentTurn']['userId']) && $state['currentTurn']['userId'] === $userId) {
                $state['currentTurn']['lastSeenAt'] = $now;
                $state['currentTurn']['expiresAt'] = $now + (int)$state['settings']['turnTimeoutSec'];
                bumpRevision($state, $now);
                break;
            }

            // Refresh if already queued.
            $found = false;
            foreach ($state['queue'] as &$entry) {
                if ($entry['userId'] === $userId) {
                    $entry['name'] = $name;
                    $entry['lastSeenAt'] = $now;
                    $found = true;
                    break;
                }
            }
            unset($entry);

            if (!$found) {
                if (count($state['queue']) >= (int)$state['settings']['maxQueueLength']) {
                    throw new RuntimeException('Queue is full');
                }

                $state['queue'][] = [
                    'userId' => $userId,
                    'name' => $name,
                    'joinedAt' => $now,
                    'lastSeenAt' => $now
                ];
            }

            promoteNextIfNeeded($state, $now);
            bumpRevision($state, $now);
            break;

        case 'heartbeat':
            ensurePost();
            $userId = normalizedUserId($_POST['userId'] ?? null);
            $updated = false;

            if (isset($state['currentTurn']['userId']) && $state['currentTurn']['userId'] === $userId) {
                $state['currentTurn']['lastSeenAt'] = $now;
                $state['currentTurn']['expiresAt'] = $now + (int)$state['settings']['turnTimeoutSec'];
                $updated = true;
            }

            foreach ($state['queue'] as &$entry) {
                if ($entry['userId'] === $userId) {
                    $entry['lastSeenAt'] = $now;
                    $updated = true;
                    break;
                }
            }
            unset($entry);

            if (!$updated) {
                throw new RuntimeException('User is not in queue or active turn');
            }

            bumpRevision($state, $now);
            break;

        case 'leave':
            ensurePost();
            $userId = normalizedUserId($_POST['userId'] ?? null);

            if (isset($state['currentTurn']['userId']) && $state['currentTurn']['userId'] === $userId) {
                $state['currentTurn'] = null;
            }

            $state['queue'] = array_values(array_filter(
                $state['queue'],
                fn($entry) => $entry['userId'] !== $userId
            ));

            promoteNextIfNeeded($state, $now);
            bumpRevision($state, $now);
            break;

        case 'complete':
            ensurePost();
            $userId = normalizedUserId($_POST['userId'] ?? null);

            if (!isset($state['currentTurn']['userId']) || $state['currentTurn']['userId'] !== $userId) {
                throw new RuntimeException('Only active player can complete turn');
            }

            $state['currentTurn'] = null;
            promoteNextIfNeeded($state, $now);
            bumpRevision($state, $now);
            break;

        default:
            throw new RuntimeException('Unknown action');
    }

    // Re-apply rules in case action changed state.
    enforceQueueRules($state, $now);

    writeState($lockFp, $state);
    echo json_encode([
        'ok' => true,
        'serverTime' => $now,
        'state' => publicState($state)
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode([
        'ok' => false,
        'error' => $e->getMessage(),
        'serverTime' => $now
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} finally {
    flock($lockFp, LOCK_UN);
    fclose($lockFp);
}

function readState($fp, $defaults) {
    rewind($fp);
    $raw = stream_get_contents($fp);
    if ($raw === false || trim($raw) === '') {
        return $defaults;
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $defaults;
    }

    return array_replace_recursive($defaults, $decoded);
}

function writeState($fp, $state) {
    rewind($fp);
    ftruncate($fp, 0);
    fwrite($fp, json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
}

function enforceQueueRules(&$state, $now) {
    $presenceTimeout = (int)$state['settings']['queuePresenceTimeoutSec'];
    $turnTimeout = (int)$state['settings']['turnTimeoutSec'];

    // Purge stale queued users.
    $state['queue'] = array_values(array_filter($state['queue'], function($entry) use ($now, $presenceTimeout) {
        $lastSeen = (int)($entry['lastSeenAt'] ?? $entry['joinedAt'] ?? 0);
        return ($now - $lastSeen) <= $presenceTimeout;
    }));

    // Drop expired active turn.
    if (isset($state['currentTurn']) && is_array($state['currentTurn'])) {
        $expiresAt = (int)($state['currentTurn']['expiresAt'] ?? 0);
        $lastSeenAt = (int)($state['currentTurn']['lastSeenAt'] ?? 0);

        $isExpired = ($expiresAt > 0 && $now > $expiresAt) ||
            ($lastSeenAt > 0 && ($now - $lastSeenAt) > $turnTimeout);

        if ($isExpired) {
            $state['currentTurn'] = null;
        }
    }

    promoteNextIfNeeded($state, $now);
}

function promoteNextIfNeeded(&$state, $now) {
    if (!empty($state['currentTurn'])) {
        return;
    }

    if (empty($state['queue'])) {
        return;
    }

    $next = array_shift($state['queue']);
    $turnTimeout = (int)$state['settings']['turnTimeoutSec'];
    $token = hash('sha256', $next['userId'] . '|' . $next['joinedAt'] . '|' . bin2hex(random_bytes(16)));

    $state['currentTurn'] = [
        'userId' => $next['userId'],
        'name' => $next['name'],
        'startedAt' => $now,
        'lastSeenAt' => $now,
        'expiresAt' => $now + $turnTimeout,
        'token' => substr($token, 0, 24)
    ];
}

function bumpRevision(&$state, $now) {
    $state['revision'] = ((int)($state['revision'] ?? 0)) + 1;
    $state['updatedAt'] = $now;
}

function normalizedUserId($value) {
    $userId = trim((string)$value);
    if ($userId === '') {
        throw new RuntimeException('userId is required');
    }
    if (!preg_match('/^[a-zA-Z0-9._:@-]{2,64}$/', $userId)) {
        throw new RuntimeException('Invalid userId format');
    }
    return $userId;
}

function ensurePost() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new RuntimeException('This action requires POST');
    }
}

function publicState($state) {
    return [
        'revision' => (int)$state['revision'],
        'updatedAt' => (int)$state['updatedAt'],
        'queue' => array_values(array_map(function($entry) {
            return [
                'userId' => $entry['userId'],
                'name' => $entry['name'],
                'joinedAt' => (int)$entry['joinedAt'],
                'lastSeenAt' => (int)$entry['lastSeenAt']
            ];
        }, $state['queue'])),
        'currentTurn' => $state['currentTurn'] ? [
            'userId' => $state['currentTurn']['userId'],
            'name' => $state['currentTurn']['name'],
            'startedAt' => (int)$state['currentTurn']['startedAt'],
            'lastSeenAt' => (int)$state['currentTurn']['lastSeenAt'],
            'expiresAt' => (int)$state['currentTurn']['expiresAt'],
            'token' => $state['currentTurn']['token']
        ] : null,
        'settings' => [
            'queuePresenceTimeoutSec' => (int)$state['settings']['queuePresenceTimeoutSec'],
            'turnTimeoutSec' => (int)$state['settings']['turnTimeoutSec'],
            'maxQueueLength' => (int)$state['settings']['maxQueueLength']
        ]
    ];
}
