<?php
/**
 * SystemController - System health, stats, and announcements.
 *
 * Provides system monitoring endpoints and announcement management.
 */
class SystemController
{
    private const DEFAULT_CONFIG_PATH = __DIR__ . '/../../config/defaults.json';

    /**
     * Known app definitions - complete list of apps from the AppRegistry.
     * Organised by category for the admin UI dropdown.
     */
    private const APP_CATALOG = [
        'accessories' => [
            ['id' => 'calculator',   'name' => 'Calculator',   'icon' => '🧮'],
            ['id' => 'notepad',      'name' => 'Notepad',      'icon' => '📝'],
            ['id' => 'paint',        'name' => 'Paint',        'icon' => '🎨'],
            ['id' => 'calendar',     'name' => 'Calendar',     'icon' => '📅'],
            ['id' => 'clock',        'name' => 'Clock',        'icon' => '🕐'],
            ['id' => 'hypercard',    'name' => 'HyperCard',    'icon' => '🃏'],
        ],
        'system_tools' => [
            ['id' => 'terminal',             'name' => 'Terminal',             'icon' => '📟'],
            ['id' => 'defrag',               'name' => 'Defrag',               'icon' => '🔧'],
            ['id' => 'taskmanager',          'name' => 'Task Manager',         'icon' => '📊'],
            ['id' => 'scriptrunner',         'name' => 'Script Runner',        'icon' => '📜'],
            ['id' => 'campaign-studio',      'name' => 'Campaign Studio',      'icon' => '🎬'],
            ['id' => 'timeline-editor',      'name' => 'Timeline Editor',      'icon' => '⏱'],
            ['id' => 'showrunner-console',   'name' => 'Showrunner Console',   'icon' => '🎛'],
            ['id' => 'analytics-dashboard',  'name' => 'Analytics Dashboard',  'icon' => '📊'],
            ['id' => 'mycomputer',           'name' => 'My Computer',          'icon' => '💻'],
            ['id' => 'recyclebin',           'name' => 'Recycle Bin',          'icon' => '🗑️'],
            ['id' => 'findfiles',            'name' => 'Find Files',           'icon' => '🔍'],
            ['id' => 'helpsystem',           'name' => 'Help System',          'icon' => '❓'],
        ],
        'games' => [
            ['id' => 'minesweeper', 'name' => 'Minesweeper', 'icon' => '💣'],
            ['id' => 'snake',       'name' => 'Snake',       'icon' => '🐍'],
            ['id' => 'asteroids',   'name' => 'Asteroids',   'icon' => '🚀'],
            ['id' => 'doom',        'name' => 'DOOM',        'icon' => '👹'],
            ['id' => 'solitaire',   'name' => 'Solitaire',   'icon' => '🃏'],
            ['id' => 'freecell',    'name' => 'FreeCell',    'icon' => '♠️'],
            ['id' => 'skifree',     'name' => 'SkiFree',     'icon' => '⛷️'],
            ['id' => 'zork',        'name' => 'Zork',        'icon' => '🗡️'],
            ['id' => 'tetris',      'name' => 'Tetris',      'icon' => '🧱'],
        ],
        'multimedia' => [
            ['id' => 'mediaplayer', 'name' => 'Media Player', 'icon' => '🎬'],
        ],
        'internet' => [
            ['id' => 'browser',          'name' => 'Browser',           'icon' => '🌐'],
            ['id' => 'chatroom',         'name' => 'Chat Room',         'icon' => '💬'],
            ['id' => 'phone',            'name' => 'Phone',             'icon' => '📞'],
            ['id' => 'instantmessenger', 'name' => 'Instant Messenger', 'icon' => '💌'],
            ['id' => 'inbox',            'name' => 'Inbox',             'icon' => '📧'],
            ['id' => 'gamelobby',        'name' => 'Game Lobby',        'icon' => '🎮'],
        ],
        'settings' => [
            ['id' => 'controlpanel',       'name' => 'Control Panel',      'icon' => '⚙️'],
            ['id' => 'displayproperties',  'name' => 'Display Properties', 'icon' => '🖥️'],
            ['id' => 'soundsettings',      'name' => 'Sound Settings',     'icon' => '🔊'],
            ['id' => 'featuressettings',   'name' => 'Features Settings',  'icon' => '🔌'],
        ],
    ];

    /**
     * Known event types that can be dispatched.
     */
    private const EVENT_CATALOG = [
        'system' => [
            ['type' => 'system.app.launch',                 'label' => 'Launch App on Clients',        'desc' => 'Opens an application on all connected clients'],
            ['type' => 'system.filesystem.command',         'label' => 'Filesystem Command',           'desc' => 'Executes a filesystem operation on clients'],
            ['type' => 'system.default_filesystem.updated', 'label' => 'Default Filesystem Updated',   'desc' => 'Notifies clients the default filesystem changed'],
            ['type' => 'system.message',                    'label' => 'System Message',               'desc' => 'Sends a custom message to all clients'],
            ['type' => 'system.dialog',                     'label' => 'Show Dialog',                  'desc' => 'Displays an alert/confirm/prompt dialog on all clients'],
            ['type' => 'system.notification',               'label' => 'Show Notification',            'desc' => 'Displays a toast notification on all clients'],
            ['type' => 'system.sound',                      'label' => 'Play Sound',                   'desc' => 'Plays a system sound effect on all clients'],
            ['type' => 'system.effect',                     'label' => 'Visual Effect',                'desc' => 'Triggers a visual effect (shake, flash, CRT, etc.) on all clients'],
        ],
        'config' => [
            ['type' => 'config.changed', 'label' => 'Config Changed', 'desc' => 'Notifies clients of a configuration change'],
        ],
        'announcements' => [
            ['type' => 'announcement.created', 'label' => 'Announcement Created', 'desc' => 'Broadcasts a new announcement'],
            ['type' => 'announcement.updated', 'label' => 'Announcement Updated', 'desc' => 'Broadcasts an announcement update'],
            ['type' => 'announcement.deleted', 'label' => 'Announcement Deleted', 'desc' => 'Broadcasts an announcement removal'],
        ],
        'narrative' => [
            ['type' => 'narrative.story.advance',    'label' => 'Advance Story',       'desc' => 'Progress the narrative to the next chapter'],
            ['type' => 'narrative.story.branch',     'label' => 'Branch Story',        'desc' => 'Create a narrative branch point with choices'],
            ['type' => 'narrative.story.reveal',     'label' => 'Reveal Secret',       'desc' => 'Unlock hidden content or lore'],
            ['type' => 'narrative.story.flashback',  'label' => 'Trigger Flashback',   'desc' => 'Show a flashback sequence'],
            ['type' => 'narrative.mood.shift',       'label' => 'Shift Mood',          'desc' => 'Change the ambient mood/atmosphere'],
            ['type' => 'narrative.mood.glitch',      'label' => 'Trigger Glitch',      'desc' => 'Create a visual/audio glitch effect'],
            ['type' => 'narrative.mood.dream',       'label' => 'Enter Dream State',   'desc' => 'Transition to a dream sequence'],
            ['type' => 'narrative.character.appear',  'label' => 'Character Appears',   'desc' => 'Introduce or show a character'],
            ['type' => 'narrative.character.speak',   'label' => 'Character Speaks',    'desc' => 'Have a character say something'],
            ['type' => 'narrative.character.leave',   'label' => 'Character Leaves',    'desc' => 'Dismiss a character from the scene'],
            ['type' => 'narrative.world.unlock',     'label' => 'Unlock Area',         'desc' => 'Make new content accessible'],
            ['type' => 'narrative.world.change',     'label' => 'World State Change',  'desc' => 'Alter the virtual world state'],
            ['type' => 'narrative.world.timer',      'label' => 'Start Timer',         'desc' => 'Begin a countdown or timed event'],
            ['type' => 'narrative.puzzle.hint',      'label' => 'Give Hint',           'desc' => 'Provide a hint for the current puzzle'],
            ['type' => 'narrative.puzzle.solve',     'label' => 'Auto-Solve',          'desc' => 'Automatically solve the current puzzle'],
            ['type' => 'narrative.puzzle.new',       'label' => 'New Puzzle',           'desc' => 'Present a new puzzle or challenge'],
            ['type' => 'narrative.custom',           'label' => 'Custom Narrative',     'desc' => 'Send a custom narrative event'],
        ],
        'users' => [
            ['type' => 'user.updated', 'label' => 'User Updated', 'desc' => 'Notifies of a user profile change'],
        ],
        'themes' => [
            ['type' => 'theme.created', 'label' => 'Theme Created', 'desc' => 'Broadcasts a new theme'],
            ['type' => 'theme.deleted', 'label' => 'Theme Deleted', 'desc' => 'Broadcasts a theme removal'],
        ],
    ];

    /**
     * GET /system/app-catalog
     * Returns the known app list and event types for admin UI dropdowns.
     */
    public function appCatalog(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        jsonResponse([
            'apps'   => self::APP_CATALOG,
            'events' => self::EVENT_CATALOG,
        ]);
    }

    /**
     * GET /system/health
     * Basic health check endpoint.
     */
    public function health(array $params): void
    {
        $dbOk = false;
        try {
            Database::fetchColumn('SELECT 1');
            $dbOk = true;
        } catch (\Throwable $e) {
            // DB connection failed
        }

        $status = $dbOk ? 'healthy' : 'degraded';
        $code = $dbOk ? 200 : 503;

        http_response_code($code);
        echo json_encode([
            'status'    => $status,
            'database'  => $dbOk ? 'connected' : 'disconnected',
            'timestamp' => date('c'),
            'version'   => '2.0.0',
        ]);
    }

    /**
     * GET /system/stats
     * System statistics (admin only).
     */
    public function stats(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $stats = [
            'users' => [
                'total'           => User::count(),
                'registered'      => User::count('user') + User::count('admin') + User::count('superadmin'),
                'anonymous'       => User::count('visitor'),
                'active_15min'    => User::countActive(15),
                'active_1hour'    => User::countActive(60),
            ],
            'events' => [
                'total_1hour'     => Event::countRecent('*', 60),
                'latest_id'       => Event::getLatestId(),
            ],
            'audit' => [
                'total_entries'   => AuditLog::count(),
            ],
            'webhooks' => [
                'total'           => count(Webhook::list()),
            ],
            'server' => [
                'php_version'     => PHP_VERSION,
                'timestamp'       => date('c'),
                'uptime'          => $this->getUptime(),
            ],
        ];

        jsonResponse($stats);
    }

    /**
     * POST /system/actions/launch-app
     * Broadcast a remote app launch request to connected clients.
     */
    public function launchApp(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $appId = trim((string) input('app_id', ''));
        $launchParams = input('params', []);

        if ($appId === '') {
            jsonError('app_id is required');
        }

        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $appId)) {
            jsonError('Invalid app_id format');
        }

        if (!is_array($launchParams)) {
            jsonError('params must be an object');
        }

        $user = currentUser();
        $eventId = EventService::dispatch('system.app.launch', [
            'app_id' => $appId,
            'params' => $launchParams,
            'requested_by' => $user['display_name'] ?? null,
        ], $user['id']);

        AuditLog::log('system.action.launch_app', $user['id'], 'system', $appId, [
            'params' => $launchParams,
            'event_id' => $eventId,
        ]);

        jsonResponse([
            'success' => true,
            'event_id' => $eventId,
        ], 201);
    }

    /**
     * POST /system/actions/filesystem
     * Broadcast filesystem commands to connected clients.
     */
    public function filesystemCommand(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $operation = trim((string) input('operation', ''));
        $path = trim((string) input('path', ''));
        $content = input('content');
        $recursive = (bool) input('recursive', false);

        if (!in_array($operation, ['write_file', 'delete_file', 'create_directory', 'delete_directory'], true)) {
            jsonError('operation must be one of: write_file, delete_file, create_directory, delete_directory');
        }

        if ($path === '') {
            jsonError('path is required');
        }

        // Prevent path traversal attacks
        if (preg_match('/\.\.[\\/]/', $path) || strpos($path, '..') !== false) {
            jsonError('Path must not contain directory traversal sequences');
        }

        if ($operation === 'write_file' && !is_string($content)) {
            jsonError('content is required for write_file');
        }

        // Enforce max content size (1 MB) to prevent abuse
        if ($operation === 'write_file' && strlen($content) > 1048576) {
            jsonError('Content too large (max 1 MB)');
        }

        $payload = [
            'operation' => $operation,
            'path' => $path,
            'recursive' => $recursive,
        ];

        if ($operation === 'write_file') {
            $payload['content'] = $content;
        }

        $user = currentUser();
        $eventId = EventService::dispatch('system.filesystem.command', $payload, $user['id']);

        AuditLog::log('system.action.filesystem', $user['id'], 'system', $path, [
            'operation' => $operation,
            'recursive' => $recursive,
            'event_id' => $eventId,
        ]);

        jsonResponse([
            'success' => true,
            'event_id' => $eventId,
        ], 201);
    }

    /**
     * GET /system/default-filesystem
     * Read the default virtual filesystem configuration.
     */
    public function getDefaultFilesystem(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $config = $this->readDefaultsConfig();
        jsonResponse([
            'filesystem' => $config['filesystem'] ?? new stdClass(),
        ]);
    }

    /**
     * PUT /system/default-filesystem
     * Replace the default virtual filesystem configuration.
     */
    public function updateDefaultFilesystem(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $filesystem = input('filesystem');

        if (!is_array($filesystem)) {
            jsonError('filesystem must be an object');
        }

        $this->validateFilesystemConfig($filesystem);

        $config = $this->readDefaultsConfig();
        $config['filesystem'] = $filesystem;
        $this->writeDefaultsConfig($config);

        $user = currentUser();
        AuditLog::log('system.default_filesystem.updated', $user['id'], 'config', 'filesystem', [
            'keys' => array_keys($filesystem),
        ]);

        EventService::dispatch('system.default_filesystem.updated', [
            'updated_by' => $user['display_name'] ?? null,
            'keys' => array_keys($filesystem),
        ], $user['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * GET /announcements
     * List announcements. Active ones for all users; all for admins.
     */
    public function listAnnouncements(array $params): void
    {
        Middleware::auth(false)($params);
        $user = currentUser();
        $isAdmin = $user && in_array($user['role'], ['admin', 'superadmin'], true);

        if ($isAdmin) {
            $announcements = Database::fetchAll(
                'SELECT a.*, u.display_name AS author_name
                 FROM announcements a
                 LEFT JOIN users u ON u.id = a.created_by
                 ORDER BY a.created_at DESC
                 LIMIT 100'
            );
        } else {
            $announcements = Database::fetchAll(
                'SELECT a.id, a.title, a.message, a.type, a.created_at
                 FROM announcements a
                 WHERE a.active = TRUE
                 AND (a.expires_at IS NULL OR a.expires_at > NOW())
                 ORDER BY a.created_at DESC
                 LIMIT 20'
            );
        }

        jsonResponse(['announcements' => $announcements]);
    }

    /**
     * POST /announcements
     * Create a new announcement (admin only).
     */
    public function createAnnouncement(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $title = input('title', '');
        $message = input('message', '');
        $type = input('type', 'info');
        $expiresAt = input('expires_at');

        if (empty($title) || strlen($title) > 255) {
            jsonError('Title is required (max 255 characters)');
        }
        if ($title !== strip_tags($title)) {
            jsonError('Title must not contain HTML');
        }
        if (empty($message) || strlen($message) > 10000) {
            jsonError('Message is required (max 10,000 characters)');
        }
        if ($message !== strip_tags($message)) {
            jsonError('Message must not contain HTML');
        }
        if (!in_array($type, ['info', 'warning', 'critical'], true)) {
            jsonError('Type must be info, warning, or critical');
        }

        $user = currentUser();

        $id = Database::insert(
            'INSERT INTO announcements (title, message, type, created_by, expires_at) VALUES (?, ?, ?, ?, ?)',
            [$title, $message, $type, $user['id'], $expiresAt]
        );

        AuditLog::log('announcement.created', $user['id'], 'announcement', (string) $id, [
            'title' => $title,
            'type'  => $type,
        ]);

        // Broadcast via SSE to all connected clients
        EventService::dispatch('announcement.created', [
            'id'      => (int) $id,
            'title'   => $title,
            'message' => $message,
            'type'    => $type,
        ], $user['id']);

        jsonResponse(['success' => true, 'id' => (int) $id], 201);
    }

    /**
     * PUT /announcements/:id
     * Update an announcement (admin only).
     */
    public function updateAnnouncement(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $id = (int) $params['id'];
        $existing = Database::fetchOne('SELECT * FROM announcements WHERE id = ?', [$id]);
        if (!$existing) {
            jsonError('Announcement not found', 404);
        }

        $sets = [];
        $values = [];

        $allowed = ['title', 'message', 'type', 'active', 'expires_at'];
        $changes = [];

        foreach ($allowed as $field) {
            $val = input($field);
            if ($val !== null) {
                if ($field === 'title') {
                    if (strlen($val) === 0 || strlen($val) > 255) {
                        jsonError('Title is required (max 255 characters)');
                    }
                    if ($val !== strip_tags($val)) {
                        jsonError('Title must not contain HTML');
                    }
                }
                if ($field === 'message') {
                    if (strlen($val) === 0) {
                        jsonError('Message is required');
                    }
                    if ($val !== strip_tags($val)) {
                        jsonError('Message must not contain HTML');
                    }
                }
                if ($field === 'type' && !in_array($val, ['info', 'warning', 'critical'], true)) {
                    jsonError('Type must be info, warning, or critical');
                }
                if ($field === 'active') {
                    $val = (bool) $val ? 1 : 0;
                }
                $sets[] = "$field = ?";
                $values[] = $val;
                $changes[$field] = $val;
            }
        }

        if (empty($sets)) {
            jsonError('No fields to update');
        }

        $values[] = $id;
        Database::execute(
            'UPDATE announcements SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $values
        );

        $user = currentUser();
        AuditLog::log('announcement.updated', $user['id'], 'announcement', (string) $id, $changes);

        EventService::dispatch('announcement.updated', [
            'id'      => $id,
            'changes' => $changes,
        ], $user['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * DELETE /announcements/:id
     * Delete an announcement (admin only).
     */
    public function deleteAnnouncement(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $id = (int) $params['id'];
        $existing = Database::fetchOne('SELECT * FROM announcements WHERE id = ?', [$id]);
        if (!$existing) {
            jsonError('Announcement not found', 404);
        }

        Database::execute('DELETE FROM announcements WHERE id = ?', [$id]);

        $user = currentUser();
        AuditLog::log('announcement.deleted', $user['id'], 'announcement', (string) $id);

        EventService::dispatch('announcement.deleted', [
            'id' => $id,
        ], $user['id']);

        jsonResponse(['success' => true]);
    }

    // ─── Analytics Endpoints ──────────────────────────────────────

    /**
     * GET /system/analytics?range=<minutes>
     * Aggregated analytics data for the admin dashboard.
     */
    public function analytics(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $rangeMinutes = max(1, min(43200, (int) ($_GET['range'] ?? 1440)));

        // Each section wrapped in try/catch so a single query failure
        // doesn't bring down the entire analytics endpoint.

        $totalEvents = 0;
        $appLaunches = 0;
        $errorCount  = 0;
        $peakUsers   = 0;
        $avgSession  = null;
        $volumeBuckets = [];
        $eventTypes    = [];
        $topApps       = [];
        $regTimeline   = [];

        // Total events in range
        try {
            $totalEvents = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM event_log WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                [$rangeMinutes]
            );
        } catch (\Throwable $e) { /* ignore */ }

        // App launches in range
        try {
            $appLaunches = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM event_log WHERE event_type = ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                ['system.app.launch', $rangeMinutes]
            );
        } catch (\Throwable $e) { /* ignore */ }

        // Error count (events containing 'error' in the type)
        try {
            $errorCount = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM event_log WHERE event_type LIKE ? AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                ['%.error%', $rangeMinutes]
            );
        } catch (\Throwable $e) { /* ignore */ }

        // Peak concurrent users (from presence data)
        try {
            $peakUsers = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM multiplayer_presence WHERE last_heartbeat > DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                [$rangeMinutes]
            );
        } catch (\Throwable $e) { /* ignore */ }

        // Average session length (from sessions table)
        try {
            $raw = Database::fetchColumn(
                'SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, COALESCE(expires_at, NOW())))
                 FROM sessions WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                [$rangeMinutes]
            );
            $avgSession = $raw !== null && $raw !== false ? round((float) $raw, 1) : null;
        } catch (\Throwable $e) { /* ignore */ }

        // Event volume buckets (split the range into ~24 buckets)
        try {
            $bucketCount = min(24, max(6, (int) ($rangeMinutes / 60)));
            $bucketMinutes = max(1, (int) ($rangeMinutes / $bucketCount));

            for ($i = $bucketCount - 1; $i >= 0; $i--) {
                $fromMin = $i * $bucketMinutes;

                $cnt = (int) Database::fetchColumn(
                    'SELECT COUNT(*) FROM event_log
                     WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                     AND created_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)',
                    [$fromMin + $bucketMinutes, $fromMin]
                );

                if ($rangeMinutes <= 60) {
                    $label = ($bucketCount - $i) * $bucketMinutes . 'm';
                } elseif ($rangeMinutes <= 1440) {
                    $label = round($fromMin / 60, 1) . 'h';
                } else {
                    $label = round($fromMin / 1440, 1) . 'd';
                }

                $volumeBuckets[] = ['label' => $label, 'count' => $cnt];
            }
        } catch (\Throwable $e) { /* ignore */ }

        // Top event types
        try {
            $eventTypes = Database::fetchAll(
                'SELECT event_type AS type, COUNT(*) AS cnt
                 FROM event_log
                 WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                 GROUP BY event_type
                 ORDER BY cnt DESC
                 LIMIT 15',
                [$rangeMinutes]
            );
            $eventTypes = array_map(function ($row) {
                return ['type' => $row['type'], 'count' => (int) $row['cnt']];
            }, $eventTypes);
        } catch (\Throwable $e) { /* ignore */ }

        // Top apps by launch count
        try {
            $rows = Database::fetchAll(
                "SELECT JSON_UNQUOTE(JSON_EXTRACT(payload, '$.app_id')) AS app_id, COUNT(*) AS cnt
                 FROM event_log
                 WHERE event_type = 'system.app.launch'
                 AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                 AND payload IS NOT NULL
                 GROUP BY app_id
                 ORDER BY cnt DESC
                 LIMIT 15",
                [$rangeMinutes]
            );
            $topApps = array_map(function ($row) {
                return ['app_id' => $row['app_id'], 'count' => (int) $row['cnt']];
            }, $rows);
        } catch (\Throwable $e) {
            // JSON_EXTRACT may not be available on older MySQL
        }

        // User registration timeline
        try {
            if ($rangeMinutes <= 1440) {
                $rows = Database::fetchAll(
                    "SELECT DATE_FORMAT(created_at, '%H:00') AS label, COUNT(*) AS cnt
                     FROM users
                     WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                     GROUP BY label
                     ORDER BY MIN(created_at)",
                    [$rangeMinutes]
                );
            } else {
                $rows = Database::fetchAll(
                    "SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS label, COUNT(*) AS cnt
                     FROM users
                     WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
                     GROUP BY label
                     ORDER BY MIN(created_at)",
                    [$rangeMinutes]
                );
            }
            $regTimeline = array_map(function ($row) {
                return ['label' => $row['label'], 'count' => (int) $row['cnt']];
            }, $rows ?? []);
        } catch (\Throwable $e) { /* ignore */ }

        jsonResponse([
            'total_events'          => $totalEvents,
            'app_launches'          => $appLaunches,
            'error_count'           => $errorCount,
            'peak_users'            => $peakUsers,
            'avg_session_minutes'   => $avgSession,
            'volume_buckets'        => $volumeBuckets,
            'event_types'           => $eventTypes,
            'top_apps'              => $topApps,
            'registration_timeline' => $regTimeline,
            'range_minutes'         => $rangeMinutes,
        ]);
    }

    /**
     * GET /system/event-stream?after=<id>&limit=<n>
     * Fetch recent events for the live event stream viewer.
     */
    public function eventStream(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $afterId = max(0, (int) ($_GET['after'] ?? 0));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 20)));

        $events = Event::since($afterId, $limit);

        jsonResponse([
            'events'    => $events,
            'latest_id' => count($events) > 0 ? (int) end($events)['id'] : $afterId,
        ]);
    }

    // ─── Autoexec Editor Endpoints ─────────────────────────────

    private const AUTOEXEC_PATH = __DIR__ . '/../../autoexec.retro';
    private const AUTOEXEC_BACKUP_DIR = __DIR__ . '/../../backups/autoexec';

    /**
     * GET /system/autoexec
     * Read the autoexec.retro file content and list backups.
     */
    public function getAutoexec(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $content = '';
        if (file_exists(self::AUTOEXEC_PATH)) {
            $content = file_get_contents(self::AUTOEXEC_PATH);
            if ($content === false) {
                jsonError('Unable to read autoexec.retro', 500);
            }
        }

        $backups = $this->listAutoexecBackups();

        jsonResponse([
            'content'  => $content,
            'path'     => 'autoexec.retro',
            'size'     => strlen($content),
            'lines'    => substr_count($content, "\n") + 1,
            'backups'  => $backups,
            'modified' => file_exists(self::AUTOEXEC_PATH) ? date('c', filemtime(self::AUTOEXEC_PATH)) : null,
        ]);
    }

    /**
     * PUT /system/autoexec
     * Update the autoexec.retro file. Creates a backup first.
     */
    public function updateAutoexec(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $content = input('content');
        if (!is_string($content)) {
            jsonError('content must be a string');
        }

        // Limit file size to 512KB
        if (strlen($content) > 524288) {
            jsonError('Content too large (max 512KB)');
        }

        // Create backup before overwriting
        $this->createAutoexecBackup();

        // Write the new content
        $result = @file_put_contents(self::AUTOEXEC_PATH, $content);
        if ($result === false) {
            jsonError('Failed to write autoexec.retro', 500);
        }

        $user = currentUser();
        AuditLog::log('system.autoexec.updated', $user['id'], 'system', 'autoexec.retro', [
            'size'  => strlen($content),
            'lines' => substr_count($content, "\n") + 1,
        ]);

        jsonResponse([
            'success'  => true,
            'size'     => strlen($content),
            'lines'    => substr_count($content, "\n") + 1,
            'modified' => date('c'),
        ]);
    }

    /**
     * GET /system/autoexec/backup/:filename
     * Retrieve the content of a specific backup.
     */
    public function getAutoexecBackup(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $filename = basename($params['filename'] ?? '');
        if (empty($filename)) {
            jsonError('Filename is required');
        }

        // Sanitize: only allow expected format
        if (!preg_match('/^autoexec_\d{8}_\d{6}\.retro$/', $filename)) {
            jsonError('Invalid backup filename');
        }

        $backupPath = self::AUTOEXEC_BACKUP_DIR . '/' . $filename;
        if (!file_exists($backupPath)) {
            jsonError('Backup not found', 404);
        }

        $content = file_get_contents($backupPath);
        if ($content === false) {
            jsonError('Unable to read backup', 500);
        }

        jsonResponse([
            'content'  => $content,
            'filename' => $filename,
            'size'     => strlen($content),
        ]);
    }

    private function createAutoexecBackup(): void
    {
        if (!file_exists(self::AUTOEXEC_PATH)) return;

        $backupDir = self::AUTOEXEC_BACKUP_DIR;
        if (!is_dir($backupDir)) {
            @mkdir($backupDir, 0700, true);
        }

        $timestamp = date('Ymd_His');
        $backupFile = $backupDir . '/autoexec_' . $timestamp . '.retro';
        @copy(self::AUTOEXEC_PATH, $backupFile);

        // Keep only the last 20 backups
        $backups = glob($backupDir . '/autoexec_*.retro');
        if ($backups && count($backups) > 20) {
            sort($backups);
            $toDelete = array_slice($backups, 0, count($backups) - 20);
            foreach ($toDelete as $old) {
                @unlink($old);
            }
        }
    }

    private function listAutoexecBackups(): array
    {
        $backupDir = self::AUTOEXEC_BACKUP_DIR;
        if (!is_dir($backupDir)) return [];

        $files = glob($backupDir . '/autoexec_*.retro');
        if (!$files) return [];

        rsort($files); // newest first

        return array_map(function ($path) {
            $filename = basename($path);
            // Parse timestamp from filename
            preg_match('/autoexec_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/', $filename, $m);
            $dateStr = count($m) === 7 ? "{$m[1]}-{$m[2]}-{$m[3]}T{$m[4]}:{$m[5]}:{$m[6]}" : null;

            return [
                'filename'   => $filename,
                'id'         => $filename,
                'size'       => $this->formatFileSize(filesize($path)),
                'created_at' => $dateStr ?? date('c', filemtime($path)),
            ];
        }, array_slice($files, 0, 20));
    }

    private function formatFileSize(int $bytes): string
    {
        if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' MB';
        if ($bytes >= 1024) return round($bytes / 1024, 1) . ' KB';
        return $bytes . ' B';
    }

    /**
     * Get server uptime (Linux only).
     */
    private function getUptime(): ?string
    {
        if (file_exists('/proc/uptime')) {
            $uptime = (float) file_get_contents('/proc/uptime');
            $days = floor($uptime / 86400);
            $hours = floor(($uptime % 86400) / 3600);
            $minutes = floor(($uptime % 3600) / 60);
            return "{$days}d {$hours}h {$minutes}m";
        }
        return null;
    }

    private function readDefaultsConfig(): array
    {
        $raw = @file_get_contents(self::DEFAULT_CONFIG_PATH);
        if ($raw === false) {
            jsonError('Unable to read config/defaults.json', 500);
        }

        $config = json_decode($raw, true);
        if (!is_array($config)) {
            jsonError('config/defaults.json is invalid JSON', 500);
        }

        return $config;
    }

    private function writeDefaultsConfig(array $config): void
    {
        $encoded = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            jsonError('Failed to encode defaults.json payload', 500);
        }

        $result = @file_put_contents(self::DEFAULT_CONFIG_PATH, $encoded . PHP_EOL);
        if ($result === false) {
            jsonError('Failed to write config/defaults.json', 500);
        }
    }

    private function validateFilesystemConfig(array $filesystem): void
    {
        $validateFile = function (array $file, string $label): void {
            if (!isset($file['path']) || !is_array($file['path']) || count($file['path']) < 2) {
                jsonError("$label entry must contain a path array with at least 2 parts");
            }
            if (!array_key_exists('content', $file) || !is_string($file['content'])) {
                jsonError("$label entry must contain string content");
            }
        };

        if (isset($filesystem['welcomeFile'])) {
            if (!is_array($filesystem['welcomeFile'])) {
                jsonError('welcomeFile must be an object');
            }
            $validateFile($filesystem['welcomeFile'], 'welcomeFile');
        }

        foreach (['documentFiles', 'secretFiles', 'projectFiles'] as $listKey) {
            if (!isset($filesystem[$listKey])) {
                continue;
            }
            if (!is_array($filesystem[$listKey])) {
                jsonError("$listKey must be an array");
            }
            foreach ($filesystem[$listKey] as $idx => $file) {
                if (!is_array($file)) {
                    jsonError("$listKey[$idx] must be an object");
                }
                $validateFile($file, "$listKey[$idx]");
            }
        }
    }
}
