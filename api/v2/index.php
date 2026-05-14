<?php
/**
 * IlluminatOS! API v2 Entry Point
 *
 * Single entry point for all /api/v2/* requests.
 * Routes are dispatched to controllers via the Router.
 *
 * URL Rewriting (Apache):
 *   All requests to /api/v2/* are rewritten to this file.
 *   The original path is preserved in REQUEST_URI.
 */

define('ILLUMINATOS_API', true);
require_once __DIR__ . '/../../backend/bootstrap.php';

// Set common headers
Middleware::setJsonHeaders();

// Probabilistic cleanup of expired sessions and old events (1% of requests)
if (mt_rand(1, 100) === 1) {
    try {
        Session::purgeExpired();
        Event::purge(30); // purge events older than 30 days
    } catch (\Throwable $e) {
        // Non-critical — silently ignore cleanup failures
    }
}

// Extract the path relative to /api/v2
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);

// Strip the base path up to and including /api/v2
$apiBase = '/api/v2';
$pos = strpos($path, $apiBase);
if ($pos !== false) {
    $path = substr($path, $pos + strlen($apiBase));
}
if (empty($path)) {
    $path = '/';
}

// Build the router
$router = new Router();

// Global middleware
$router->use(Middleware::parseJsonBody());
// CSRF protection: requires X-Requested-With (or X-CSRF-Token) header on
// every mutating request (POST/PUT/DELETE). GET/HEAD/OPTIONS are exempt.
$router->use(Middleware::requireCsrf());

// ─── Auth Routes ────────────────────────────────────────────
$router->post('/auth/session',      [AuthController::class, 'createSession']);
$router->post('/auth/register',     [AuthController::class, 'register']);
$router->post('/auth/login',        [AuthController::class, 'login']);
$router->post('/auth/logout',       [AuthController::class, 'logout']);
$router->get('/auth/me',            [AuthController::class, 'me']);
$router->put('/auth/me',            [AuthController::class, 'updateMe']);
$router->get('/auth/check',         [AuthController::class, 'check']);
// Internal: WebSocket server polls this for revoked/evicted tokens
$router->get('/auth/revocations',   [AuthController::class, 'revocations']);

// ─── Config Routes ──────────────────────────────────────────
$router->get('/config',             [ConfigController::class, 'getMerged']);
$router->get('/config/user',        [ConfigController::class, 'getUserConfig']);
$router->put('/config/user/:section', [ConfigController::class, 'updateUserSection']);
$router->get('/config/:section',    [ConfigController::class, 'getSection']);
// NOTE: /config/:section must come AFTER /config/user/:section to avoid shadowing
$router->put('/config/:section',    [ConfigController::class, 'updateSection']);
$router->delete('/config/:section', [ConfigController::class, 'resetSection']);

// ─── User Management Routes (Admin) ────────────────────────
$router->get('/users',              [UserController::class, 'list']);
$router->get('/users/:id',         [UserController::class, 'get']);
$router->put('/users/:id',         [UserController::class, 'update']);
$router->delete('/users/:id',      [UserController::class, 'delete']);

// ─── Webhook Routes (Admin) ────────────────────────────────
$router->get('/webhooks',           [WebhookController::class, 'list']);
$router->post('/webhooks',          [WebhookController::class, 'create']);
$router->get('/webhooks/:id',      [WebhookController::class, 'get']);
$router->put('/webhooks/:id',      [WebhookController::class, 'update']);
$router->delete('/webhooks/:id',   [WebhookController::class, 'delete']);
$router->post('/webhooks/:id/test', [WebhookController::class, 'test']);
$router->get('/webhooks/:id/deliveries', [WebhookController::class, 'deliveries']);

// ─── Theme Routes ───────────────────────────────────────────
$router->get('/themes',             [ThemeController::class, 'list']);
$router->post('/themes',            [ThemeController::class, 'create']);
$router->get('/themes/:id',        [ThemeController::class, 'get']);
$router->put('/themes/:id',        [ThemeController::class, 'update']);
$router->delete('/themes/:id',     [ThemeController::class, 'delete']);

// ─── Campaign Routes (Admin) ────────────────────────────────
// Note: /campaigns/active must come BEFORE /campaigns/:id so the literal
// path isn't captured by the :id wildcard.
$router->get('/campaigns/active',           [CampaignController::class, 'active']);
$router->get('/campaigns',                  [CampaignController::class, 'list']);
$router->post('/campaigns',                 [CampaignController::class, 'create']);
$router->get('/campaigns/:id',              [CampaignController::class, 'get']);
$router->put('/campaigns/:id',              [CampaignController::class, 'update']);
$router->delete('/campaigns/:id',           [CampaignController::class, 'delete']);
$router->post('/campaigns/:id/activate',    [CampaignController::class, 'activate']);
$router->post('/campaigns/:id/deactivate',  [CampaignController::class, 'deactivate']);
$router->post('/campaigns/:id/publish',     [CampaignController::class, 'publish']);

// ─── Timeline Routes (Admin) ────────────────────────────────
// Same ordering rule: literal sub-paths before :id.
$router->post('/timeline/run-due',          [TimelineController::class, 'runDue']);
$router->get('/timeline',                   [TimelineController::class, 'list']);
$router->post('/timeline',                  [TimelineController::class, 'create']);
$router->get('/timeline/:id',               [TimelineController::class, 'get']);
$router->put('/timeline/:id',               [TimelineController::class, 'update']);
$router->delete('/timeline/:id',            [TimelineController::class, 'delete']);
$router->post('/timeline/:id/fire',         [TimelineController::class, 'fire']);

// ─── Event / SSE Routes ────────────────────────────────────
$router->get('/events/stream',      [EventController::class, 'stream']);
$router->post('/events',            [EventController::class, 'dispatch']);

// ─── Announcement Routes (Admin) ───────────────────────────
$router->get('/announcements',      [SystemController::class, 'listAnnouncements']);
$router->post('/announcements',     [SystemController::class, 'createAnnouncement']);
$router->put('/announcements/:id', [SystemController::class, 'updateAnnouncement']);
$router->delete('/announcements/:id', [SystemController::class, 'deleteAnnouncement']);

// ─── Audit Log Routes (Admin) ──────────────────────────────
$router->get('/audit',              [AuditController::class, 'list']);

// ─── File Upload Routes ─────────────────────────────────────
$router->post('/files/upload',       [FileController::class, 'upload']);
$router->get('/files',               [FileController::class, 'list']);
$router->get('/files/quota',         [FileController::class, 'quota']);
$router->get('/files/:id',           [FileController::class, 'get']);
$router->get('/files/:id/download',  [FileController::class, 'download']);
$router->put('/files/:id',           [FileController::class, 'update']);
$router->delete('/files/:id',        [FileController::class, 'delete']);

// ─── User State Snapshot Routes ─────────────────────────
$router->get('/user-state',            [UserStateController::class, 'get']);
$router->put('/user-state',            [UserStateController::class, 'update']);

// ─── Multiplayer / Game Routes ─────────────────────────────
$router->get('/multiplayer/rooms',              [MultiplayerController::class, 'list']);
$router->post('/multiplayer/rooms',             [MultiplayerController::class, 'create']);
$router->get('/multiplayer/rooms/:id',          [MultiplayerController::class, 'get']);
$router->delete('/multiplayer/rooms/:id',       [MultiplayerController::class, 'delete']);
$router->get('/multiplayer/presence',           [PresenceController::class, 'getOnline']);
$router->put('/multiplayer/presence/status',    [PresenceController::class, 'updateStatus']);
$router->get('/multiplayer/presence/user/:uuid', [PresenceController::class, 'getUserPresence']);

$router->get('/games/sessions',                 [GameController::class, 'listSessions']);
$router->post('/games/sessions',                [GameController::class, 'createSession']);
$router->get('/games/sessions/:id',             [GameController::class, 'getSession']);
$router->post('/games/sessions/:id/join',       [GameController::class, 'joinSession']);
$router->post('/games/sessions/:id/leave',      [GameController::class, 'leaveSession']);
$router->post('/games/sessions/:id/start',      [GameController::class, 'startSession']);
$router->post('/games/sessions/:id/end',        [GameController::class, 'endSession']);
$router->get('/games/leaderboards',             [GameController::class, 'getLeaderboard']);

// ─── Messaging Routes ──────────────────────────────────────
$router->get('/messages/room/:id',              [MessageController::class, 'getMessages']);
$router->post('/messages/room/:id',             [MessageController::class, 'sendMessage']);
$router->get('/messages/unread',                [MessageController::class, 'getUnread']);
$router->get('/messages/dm/:userUuid',          [MessageController::class, 'getDMs']);
$router->post('/messages/dm/:userUuid',         [MessageController::class, 'sendDM']);

$router->get('/social/friends',                 [SocialController::class, 'listFriends']);
$router->post('/social/friends/request',        [SocialController::class, 'sendRequest']);
$router->post('/social/friends/accept',         [SocialController::class, 'acceptRequest']);
$router->post('/social/friends/block',          [SocialController::class, 'blockUser']);
$router->delete('/social/friends/:uuid',        [SocialController::class, 'removeFriend']);
$router->get('/social/can-message/:uuid',      [SocialController::class, 'canMessage']);

// ─── System Routes ─────────────────────────────────────────
$router->get('/system/health',      [SystemController::class, 'health']);
$router->get('/system/stats',       [SystemController::class, 'stats']);
$router->get('/system/app-catalog', [SystemController::class, 'appCatalog']);
$router->get('/system/analytics',   [SystemController::class, 'analytics']);
$router->get('/system/event-stream', [SystemController::class, 'eventStream']);
$router->post('/system/actions/launch-app', [SystemController::class, 'launchApp']);
$router->post('/system/actions/filesystem', [SystemController::class, 'filesystemCommand']);
$router->get('/system/default-filesystem', [SystemController::class, 'getDefaultFilesystem']);
$router->put('/system/default-filesystem', [SystemController::class, 'updateDefaultFilesystem']);

// ─── Autoexec Editor Routes ────────────────────────────────
$router->get('/system/autoexec',                    [SystemController::class, 'getAutoexec']);
$router->put('/system/autoexec',                    [SystemController::class, 'updateAutoexec']);
$router->get('/system/autoexec/backup/:filename',   [SystemController::class, 'getAutoexecBackup']);

// Handle CORS preflight requests that bypass .htaccess
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Allow method override via header/query/body for hosts that block PUT/DELETE.
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'POST') {
    $override = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']
        ?? $_GET['_method']
        ?? null;

    if ($override === null) {
        $rawBody = file_get_contents('php://input');
        // Cache request body so downstream middleware/controllers can reuse it.
        // This avoids relying on php://input rewind behavior across environments.
        $GLOBALS['RAW_REQUEST_BODY_V2'] = $rawBody;
        if (is_string($rawBody) && $rawBody !== '') {
            $decoded = json_decode($rawBody, true);
            if (is_array($decoded) && isset($decoded['_method'])) {
                $override = $decoded['_method'];
            }
        }
    }

    if (is_string($override)) {
        $candidate = strtoupper(trim($override));
        if (in_array($candidate, ['PUT', 'DELETE', 'PATCH'], true)) {
            $method = $candidate;
        }
    }
}

// Dispatch the request
try {
    $router->dispatch($method, $path);
} catch (\Throwable $e) {
    error_log('[api/v2] Unhandled exception: ' . $e->getMessage());

    $env = require __DIR__ . '/../../backend/env.php';
    $debug = (bool) ($env['app']['debug'] ?? false);

    jsonResponse([
        'error' => 'Internal server error',
        'details' => $debug ? $e->getMessage() : null,
    ], 500);
}
