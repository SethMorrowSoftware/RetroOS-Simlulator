<?php
/**
 * IlluminatOS! All-in-One Setup & Migration Runner
 *
 * Fully self-bootstrapping setup page. Handles everything:
 *   1. Auto-patches backend/env.php with missing config sections
 *   2. Creates required directories (uploads, rate_limits)
 *   3. Runs pending database migrations
 *   4. Validates PHP extensions and upload limits
 *
 * First visit:  https://yoursite/api/v2/migrate.php
 *   → Generates a one-time setup token, patches env.php, shows link
 *
 * Subsequent:   https://yoursite/api/v2/migrate.php?key=YOUR_SECRET
 *   → Dashboard with "Run All Setup" button
 *
 * Security: After first-time auto-patch, protected by the generated secret.
 *           Delete this file from production after setup is complete.
 */

define('ILLUMINATOS_API', true);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$envFile       = __DIR__ . '/../../backend/env.php';
$bootstrapFile = __DIR__ . '/../../backend/bootstrap.php';

// ─── Step 0: env.php must exist (your live site already has this) ───
if (!file_exists($envFile)) {
    renderPage('Setup Required', '<p class="error"><code>backend/env.php</code> not found. Your site needs an existing env.php with database credentials before this tool can run.</p>');
    exit;
}

// ─── Step 1: Auto-patch env.php if missing uploads/migrations config ─
$env = require $envFile;
$patched = false;
$generatedSecret = null;

$needsUploads    = !isset($env['uploads']) || !is_array($env['uploads']);
$needsMigrations = !isset($env['migrations']['secret']) || $env['migrations']['secret'] === 'change_this_to_a_random_string';

if ($needsUploads || $needsMigrations) {
    // No key required for the patch step — this is first-time setup
    $patchResult = patchEnvFile($envFile, $needsUploads, $needsMigrations);

    if ($patchResult['success']) {
        $patched = true;
        $generatedSecret = $patchResult['secret'] ?? null;
        // Re-read the patched file safely (without eval)
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($envFile, true);
        }
        $freshEnv = (static function (string $path) {
            return require $path;
        })($envFile);
        if (is_array($freshEnv)) {
            $env = $freshEnv;
        }
    } else {
        renderPage('Auto-Patch Failed', '<p class="error">' . htmlspecialchars($patchResult['error']) . '</p><p style="margin-top:0.5rem;">You may need to manually add the missing config sections. See <code>backend/env.example.php</code> for reference.</p>');
        exit;
    }
}

// ─── Step 2: If we just patched, show the generated key ─────────────
$secret = $env['migrations']['secret'] ?? null;

if ($patched && $generatedSecret) {
    $link = 'migrate.php?key=' . urlencode($generatedSecret);
    renderPage('Configuration Updated',
        '<p class="success">Your <code>backend/env.php</code> has been automatically updated with the required config sections.</p>'
        . '<div class="card" style="margin-top:1rem;">'
        . '<h3>Your Setup Key</h3>'
        . '<p style="margin:0.5rem 0;font-size:0.85rem;">Save this key — you\'ll need it to access this page in the future:</p>'
        . '<p><code style="font-size:1rem;padding:4px 10px;">' . htmlspecialchars($generatedSecret) . '</code></p>'
        . '<p style="margin-top:1rem;"><a href="' . htmlspecialchars($link) . '" class="btn btn-primary">Continue to Setup →</a></p>'
        . '</div>'
    );
    exit;
}

// ─── Step 3: Require key (or active admin session) for subsequent access ─
$providedKey = (string) ($_GET['key'] ?? '');
$hasAdminSession = !empty($_SESSION['admin_authenticated']);

if (!$secret) {
    renderPage('Configuration Error', '<p class="error">No <code>migrations.secret</code> found in env.php.</p>');
    exit;
}

$keyIsValid = $providedKey !== '' && hash_equals($secret, $providedKey);
if (!$keyIsValid && !$hasAdminSession) {
    http_response_code(403);
    renderPage(
        'Access Denied',
        '<p class="error">Invalid or missing key. Append <code>?key=YOUR_SECRET</code> to the URL.</p>'
        . '<p style="margin-top:0.75rem;">Recovery options:</p>'
        . '<ul style="margin:0.25rem 0 0 1.2rem;line-height:1.5;">'
        . '<li>Log into <code>/admin/</code> first, then refresh this page (admin sessions are allowed).</li>'
        . '<li>Or open <code>backend/env.php</code> and copy <code>migrations.secret</code>.</li>'
        . '</ul>'
    );
    exit;
}

// ─── Bootstrap the app (now that env.php is guaranteed complete) ─────
require_once $bootstrapFile;

// ─── Preflight Checks ──────────────────────────────────────────────
$checks = runPreflightChecks($env);
$allChecksPassed = empty(array_filter($checks, fn($c) => $c['status'] === 'fail'));

// ─── Main Logic ─────────────────────────────────────────────────────
$action = $_GET['action'] ?? 'status';
$setupResults = [];
$migrationResults = [];

if ($action === 'run') {
    // Step A: Create directories & protective files
    $setupResults = runSetupTasks($env);

    // Step B: Run database migrations
    try {
        $pdo = Database::getInstance();
        ensureMigrationsTable($pdo);
        $migrationResults = runPendingMigrations($pdo);
    } catch (PDOException $e) {
        $migrationResults = [['filename' => 'Database connection', 'status' => 'FAILED', 'error' => $e->getMessage()]];
    }

    // Re-run checks after setup
    $checks = runPreflightChecks($env);
    $allChecksPassed = empty(array_filter($checks, fn($c) => $c['status'] === 'fail'));
}

// Get migration status
$migrationStatus = [];
try {
    $pdo = Database::getInstance();
    ensureMigrationsTable($pdo);
    $migrationStatus = getMigrationStatus($pdo);
} catch (PDOException $e) {
    // Database not reachable — checks will show this
}

$pendingCount = count(array_filter($migrationStatus, fn($m) => $m['status'] === 'PENDING'));
$setupNeeded = !$allChecksPassed || $pendingCount > 0;

if ($action === 'run') {
    $failedSetup = count(array_filter($setupResults, fn($r) => $r['status'] === 'FAILED'));
    $failedMigrations = count(array_filter($migrationResults, fn($r) => $r['status'] === 'FAILED'));
    if ($failedSetup === 0 && $failedMigrations === 0 && !empty(array_merge($setupResults, $migrationResults))) {
        $message = '<p class="success">All setup tasks completed successfully!</p>';
    } elseif ($failedSetup > 0 || $failedMigrations > 0) {
        $message = '<p class="error">Some tasks failed. See details below.</p>';
    } else {
        $message = '<p class="success">Everything is already up to date.</p>';
    }
} else {
    if ($setupNeeded) {
        $message = '<p>Setup tasks are pending. Click <strong>Run All Setup</strong> to apply everything.</p>';
    } else {
        $message = '<p class="success">Everything is up to date. No action needed.</p>';
    }
}

renderPage(
    $action === 'run' ? 'Setup Results' : 'Setup Dashboard',
    $message,
    $migrationStatus,
    $migrationResults,
    $keyIsValid ? $providedKey : '',
    $checks,
    $setupResults,
    $setupNeeded,
    $keyIsValid || $hasAdminSession
);

// ═══════════════════════════════════════════════════════════════════
// AUTO-PATCH ENV.PHP
// ═══════════════════════════════════════════════════════════════════

/**
 * Intelligently patch env.php to add missing config sections.
 * Reads the file, finds the final "];" closing, and inserts new sections before it.
 */
function patchEnvFile(string $envFile, bool $addUploads, bool $addMigrations): array
{
    $content = file_get_contents($envFile);
    if ($content === false) {
        return ['success' => false, 'error' => 'Could not read backend/env.php'];
    }

    // Generate a secure random secret
    $secret = bin2hex(random_bytes(20));

    // If migrations.secret exists but is the placeholder, replace it in-place
    if ($addMigrations && str_contains($content, "'change_this_to_a_random_string'")) {
        $content = str_replace("'change_this_to_a_random_string'", "'{$secret}'", $content);
        $addMigrations = false; // Don't append a new section
    }

    // Build any new sections to insert
    $newSections = '';

    if ($addUploads) {
        $newSections .= <<<'PHP'

    'uploads' => [
        'max_file_size'    => 10 * 1024 * 1024,   // 10 MB per file
        'default_quota'    => 50 * 1024 * 1024,    // 50 MB per user
        'allowed_types'    => [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
            'application/pdf',
            'text/plain', 'text/html', 'text/css', 'text/csv',
            'application/json',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'video/mp4', 'video/webm',
            'application/zip', 'application/x-tar', 'application/gzip',
        ],
        'upload_dir'       => __DIR__ . '/../data/uploads',
    ],

PHP;
    }

    if ($addMigrations) {
        $newSections .= <<<PHP

    'migrations' => [
        'secret' => '{$secret}',
    ],

PHP;
    }

    // If we have new sections to append, insert them before the final "];
    if ($newSections !== '') {
        $lastClose = strrpos($content, '];');
        if ($lastClose === false) {
            return ['success' => false, 'error' => 'Could not find closing <code>];</code> in env.php — file may have unexpected format'];
        }
        $content = substr($content, 0, $lastClose) . $newSections . substr($content, $lastClose);
    }

    $patched = $content;

    // Backup original
    $backupFile = $envFile . '.backup.' . date('Ymd_His');
    if (!@copy($envFile, $backupFile)) {
        return ['success' => false, 'error' => 'Could not create backup of env.php — check file permissions'];
    }

    // Write patched version
    if (file_put_contents($envFile, $patched, LOCK_EX) === false) {
        // Restore backup
        @copy($backupFile, $envFile);
        return ['success' => false, 'error' => 'Could not write patched env.php — check file permissions'];
    }

    // Verify the patched file is valid PHP by trying to parse it
    // (exec/shell may be disabled on shared hosting, so use token_get_all)
    try {
        $testContent = file_get_contents($envFile);
        $tokens = @token_get_all($testContent);
        if ($tokens === false) {
            throw new \RuntimeException('Tokenization failed');
        }
        // Quick sanity: ensure the file still returns an array (without eval)
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate($envFile, true);
        }
        $testResult = (static function (string $path) {
            return require $path;
        })($envFile);
        if (!is_array($testResult)) {
            throw new \RuntimeException('env.php no longer returns an array');
        }
    } catch (\Throwable $e) {
        // Restore backup — our patch broke the syntax
        @copy($backupFile, $envFile);
        @unlink($backupFile);
        return ['success' => false, 'error' => 'Patched env.php failed validation (' . $e->getMessage() . ') — restored backup. Add config manually.'];
    }

    return ['success' => true, 'secret' => $secret, 'backup' => $backupFile];
}

// ═══════════════════════════════════════════════════════════════════
// PREFLIGHT CHECKS
// ═══════════════════════════════════════════════════════════════════

function runPreflightChecks(array $env): array
{
    $checks = [];

    // PHP version
    $phpOk = version_compare(PHP_VERSION, '8.0.0', '>=');
    $checks[] = ['label' => 'PHP ' . PHP_VERSION, 'status' => $phpOk ? 'ok' : 'fail', 'detail' => $phpOk ? '' : 'PHP 8.0+ required'];

    // Required extensions
    foreach (['pdo', 'pdo_mysql', 'fileinfo', 'json', 'mbstring'] as $ext) {
        $loaded = extension_loaded($ext);
        $checks[] = ['label' => "ext-{$ext}", 'status' => $loaded ? 'ok' : ($ext === 'fileinfo' ? 'warn' : 'fail'), 'detail' => $loaded ? '' : "PHP extension <code>{$ext}</code> is not loaded"];
    }

    // Database connection
    try {
        $pdo = Database::getInstance();
        $pdo->query('SELECT 1');
        $checks[] = ['label' => 'Database connection', 'status' => 'ok', 'detail' => ''];
    } catch (\Throwable $e) {
        $checks[] = ['label' => 'Database connection', 'status' => 'fail', 'detail' => htmlspecialchars($e->getMessage())];
    }

    // env.php config sections
    $hasUploads = isset($env['uploads']) && is_array($env['uploads']);
    $checks[] = ['label' => 'env.php → uploads config', 'status' => $hasUploads ? 'ok' : 'fail', 'detail' => $hasUploads ? '' : 'Missing — will be auto-added on next run'];

    $hasMigrations = isset($env['migrations']['secret']);
    $checks[] = ['label' => 'env.php → migrations.secret', 'status' => $hasMigrations ? 'ok' : 'fail', 'detail' => ''];

    // Upload directory
    $uploadDir = $env['uploads']['upload_dir'] ?? __DIR__ . '/../../data/uploads';
    $dirExists = is_dir($uploadDir);
    $dirWritable = $dirExists && is_writable($uploadDir);
    if ($dirExists && $dirWritable) {
        $checks[] = ['label' => 'Upload directory', 'status' => 'ok', 'detail' => '<code>' . basename(dirname($uploadDir)) . '/' . basename($uploadDir) . '</code>'];
    } elseif ($dirExists) {
        $checks[] = ['label' => 'Upload directory', 'status' => 'fail', 'detail' => 'Exists but not writable'];
    } else {
        $checks[] = ['label' => 'Upload directory', 'status' => 'warn', 'detail' => 'Will be created during setup'];
    }

    // .htaccess protection
    $htaccess = $uploadDir . '/.htaccess';
    if (file_exists($htaccess)) {
        $checks[] = ['label' => 'Upload .htaccess protection', 'status' => 'ok', 'detail' => ''];
    } else {
        $checks[] = ['label' => 'Upload .htaccess protection', 'status' => 'warn', 'detail' => 'Will be created during setup'];
    }

    // Upload size limits
    $maxUpload = min(
        returnBytes(ini_get('upload_max_filesize') ?: '2M'),
        returnBytes(ini_get('post_max_size') ?: '8M')
    );
    $configMax = $env['uploads']['max_file_size'] ?? 10485760;
    $effectiveMax = min($maxUpload, $configMax);
    $phpLimitOk = $maxUpload >= $configMax;
    $checks[] = [
        'label' => 'PHP upload limit',
        'status' => $phpLimitOk ? 'ok' : 'warn',
        'detail' => 'upload_max_filesize=' . (ini_get('upload_max_filesize') ?: '2M') . ', post_max_size=' . (ini_get('post_max_size') ?: '8M')
            . ($phpLimitOk ? '' : '. Effective max: ' . formatBytes($effectiveMax) . ' (lower than configured ' . formatBytes($configMax) . ')')
    ];

    return $checks;
}

// ═══════════════════════════════════════════════════════════════════
// SETUP TASKS
// ═══════════════════════════════════════════════════════════════════

function runSetupTasks(array $env): array
{
    $results = [];

    // 1. Create upload directory
    $uploadDir = $env['uploads']['upload_dir'] ?? __DIR__ . '/../../data/uploads';
    if (!is_dir($uploadDir)) {
        if (@mkdir($uploadDir, 0750, true)) {
            $results[] = ['filename' => 'Create upload directory', 'status' => 'OK'];
        } else {
            $results[] = ['filename' => 'Create upload directory', 'status' => 'FAILED', 'error' => 'Could not create directory — check parent permissions'];
        }
    } else {
        $results[] = ['filename' => 'Create upload directory', 'status' => 'OK', 'note' => 'Already exists'];
    }

    // 2. Create .htaccess to block direct HTTP access
    $htaccess = $uploadDir . '/.htaccess';
    if (!file_exists($htaccess)) {
        $content = "# Deny all direct HTTP access to uploaded files\n# Files are served through the authenticated PHP download endpoint\nDeny from all\n";
        if (@file_put_contents($htaccess, $content)) {
            $results[] = ['filename' => 'Create uploads/.htaccess', 'status' => 'OK'];
        } else {
            $results[] = ['filename' => 'Create uploads/.htaccess', 'status' => 'FAILED', 'error' => 'Could not write .htaccess'];
        }
    } else {
        $results[] = ['filename' => 'Create uploads/.htaccess', 'status' => 'OK', 'note' => 'Already exists'];
    }

    // 3. Create rate_limits directory (used by Middleware)
    $rateLimitDir = __DIR__ . '/../../data/rate_limits';
    if (!is_dir($rateLimitDir)) {
        if (@mkdir($rateLimitDir, 0750, true)) {
            $results[] = ['filename' => 'Create rate_limits directory', 'status' => 'OK'];
        } else {
            $results[] = ['filename' => 'Create rate_limits directory', 'status' => 'FAILED', 'error' => 'Could not create directory'];
        }
    }

    // 4. Verify writable
    if (is_dir($uploadDir) && !is_writable($uploadDir)) {
        if (@chmod($uploadDir, 0750)) {
            $results[] = ['filename' => 'Fix upload directory permissions', 'status' => 'OK'];
        } else {
            $results[] = ['filename' => 'Fix upload directory permissions', 'status' => 'FAILED', 'error' => 'Not writable — fix via cPanel File Manager'];
        }
    }

    return $results;
}

// ═══════════════════════════════════════════════════════════════════
// MIGRATION HELPERS
// ═══════════════════════════════════════════════════════════════════

function ensureMigrationsTable(PDO $pdo): void
{
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS _migrations (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            filename    VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');
}

function getMigrationStatus(PDO $pdo): array
{
    $migrationDir = __DIR__ . '/../../backend/migrations';
    $files = glob($migrationDir . '/*.sql');
    sort($files);

    $executed = $pdo->query('SELECT filename, executed_at FROM _migrations ORDER BY id')
        ->fetchAll(PDO::FETCH_KEY_PAIR);

    $status = [];
    foreach ($files as $file) {
        $filename = basename($file);
        $status[] = [
            'filename'    => $filename,
            'status'      => isset($executed[$filename]) ? 'DONE' : 'PENDING',
            'executed_at' => $executed[$filename] ?? null,
        ];
    }
    return $status;
}

function isIgnorableMigrationError(PDOException $e): bool
{
    $sqlState = (string) ($e->errorInfo[0] ?? '');
    $driverCode = (int) ($e->errorInfo[1] ?? 0);

    return in_array($driverCode, [1050, 1060, 1061], true)
        || in_array($sqlState, ['42S01', '42S21'], true);
}

function runPendingMigrations(PDO $pdo): array
{
    $migrationDir = __DIR__ . '/../../backend/migrations';
    $files = glob($migrationDir . '/*.sql');
    sort($files);

    $executed = $pdo->query('SELECT filename FROM _migrations')
        ->fetchAll(PDO::FETCH_COLUMN);

    $results = [];
    foreach ($files as $file) {
        $filename = basename($file);
        if (in_array($filename, $executed, true)) {
            continue;
        }

        $sql = file_get_contents($file);
        if (empty(trim($sql))) {
            continue;
        }

        try {
            // Avoid explicit transactions around DDL migrations.
            // MySQL auto-commits CREATE/ALTER statements and can throw
            // "There is no active transaction" on shared hosting.
            $pdo->exec($sql);
            $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
            $stmt->execute([$filename]);
            $results[] = ['filename' => $filename, 'status' => 'OK'];
        } catch (PDOException $e) {
            if (isIgnorableMigrationError($e)) {
                $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
                $stmt->execute([$filename]);
                $results[] = ['filename' => $filename, 'status' => 'OK', 'note' => 'Schema already present'];
                continue;
            }

            $results[] = ['filename' => $filename, 'status' => 'FAILED', 'error' => $e->getMessage()];
            break;
        }
    }
    return $results;
}

function returnBytes(string $val): int
{
    $val = trim($val);
    if (strlen($val) === 0) return 0;
    $last = strtolower($val[strlen($val) - 1]);
    $num = (int) $val;
    return match ($last) {
        'g' => $num * 1073741824,
        'm' => $num * 1048576,
        'k' => $num * 1024,
        default => $num,
    };
}

function formatBytes(int $bytes): string
{
    if ($bytes >= 1048576) return round($bytes / 1048576, 1) . ' MB';
    if ($bytes >= 1024) return round($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}

// ═══════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════

function renderPage(string $title, string $message, array $status = [], array $migrationResults = [], string $key = '', array $checks = [], array $setupResults = [], bool $setupNeeded = false, bool $canRunActions = false): void
{
    $baseQuery = [];
    if ($key !== '') {
        $baseQuery['key'] = $key;
    }

    $runQuery = $baseQuery;
    $runQuery['action'] = 'run';

    $runUrl = htmlspecialchars('migrate.php?' . http_build_query($runQuery));
    $statusUrl = htmlspecialchars('migrate.php' . (!empty($baseQuery) ? '?' . http_build_query($baseQuery) : ''));

    echo <<<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
HTML;
    echo "    <title>IlluminatOS! Setup</title>";
    echo <<<'HTML'
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #1a1a2e; color: #e0e0e0;
            min-height: 100vh; display: flex; justify-content: center; padding: 2rem;
        }
        .container { max-width: 760px; width: 100%; }
        h1 { color: #00d4ff; margin-bottom: 0.25rem; font-size: 1.6rem; }
        h2 { color: #888; font-size: 0.9rem; font-weight: normal; margin-bottom: 1.5rem; }
        h3 { color: #00d4ff; margin-bottom: 0.5rem; font-size: 1rem; }
        .card {
            background: #16213e; border: 1px solid #0f3460;
            border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;
        }
        table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
        th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #0f3460; font-size: 0.82rem; }
        th { color: #00d4ff; font-weight: 600; }
        .badge {
            display: inline-block; padding: 2px 8px; border-radius: 4px;
            font-size: 0.72rem; font-weight: 600; letter-spacing: 0.3px;
        }
        .badge-done, .badge-ok { background: #0a3d2a; color: #4ade80; }
        .badge-pending, .badge-warn { background: #3d2a0a; color: #fbbf24; }
        .badge-failed, .badge-fail { background: #3d0a0a; color: #f87171; }
        .success { color: #4ade80; } .error { color: #f87171; } .warn { color: #fbbf24; }
        .detail { color: #888; font-size: 0.78rem; }
        .actions { margin-top: 1.25rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn {
            display: inline-block; padding: 0.6rem 1.4rem; border-radius: 6px;
            text-decoration: none; font-weight: 600; font-size: 0.85rem;
            cursor: pointer; border: none; transition: background 0.15s;
        }
        .btn-primary { background: #00d4ff; color: #1a1a2e; }
        .btn-primary:hover { background: #00b8e6; }
        .btn-secondary { background: #0f3460; color: #e0e0e0; }
        .btn-secondary:hover { background: #1a4a8a; }
        code { background: #0f3460; padding: 1px 5px; border-radius: 3px; font-size: 0.78rem; }
        .check-row td:first-child { width: 40%; }
        .warning-box {
            background: #3d2a0a; border: 1px solid #92400e; border-radius: 6px;
            padding: 0.75rem 1rem; margin-top: 1rem; font-size: 0.82rem; color: #fbbf24;
        }
    </style>
</head>
<body>
    <div class="container">
HTML;

    echo "<h1>IlluminatOS! Setup</h1>";
    echo "<h2>{$title}</h2>";

    if ($message) {
        echo "<div class=\"card\">{$message}</div>";
    }

    // ─── Preflight Checks ───────────────────────────────
    if (!empty($checks)) {
        echo '<div class="card"><h3>Environment Checks</h3><table class="check-row">';
        echo '<tr><th>Check</th><th>Status</th><th>Details</th></tr>';
        foreach ($checks as $c) {
            $badgeClass = match($c['status']) {
                'ok' => 'badge-ok', 'warn' => 'badge-warn', 'fail' => 'badge-fail',
                default => 'badge-pending',
            };
            $label = strtoupper($c['status']);
            $detail = $c['detail'] ?: '—';
            echo "<tr><td>" . htmlspecialchars($c['label']) . "</td>";
            echo "<td><span class=\"badge {$badgeClass}\">{$label}</span></td>";
            echo "<td class=\"detail\">{$detail}</td></tr>";
        }
        echo '</table></div>';
    }

    // ─── Setup Results ──────────────────────────────────
    if (!empty($setupResults)) {
        echo '<div class="card"><h3>Setup Tasks</h3><table>';
        echo '<tr><th>Task</th><th>Result</th><th>Notes</th></tr>';
        foreach ($setupResults as $r) {
            $badge = $r['status'] === 'OK' ? 'badge-ok' : 'badge-fail';
            $note = $r['error'] ?? $r['note'] ?? '—';
            $noteClass = isset($r['error']) ? 'error' : 'detail';
            echo "<tr><td>" . htmlspecialchars($r['filename']) . "</td>";
            echo "<td><span class=\"badge {$badge}\">" . htmlspecialchars($r['status']) . "</span></td>";
            echo "<td class=\"{$noteClass}\">" . htmlspecialchars($note) . "</td></tr>";
        }
        echo '</table></div>';
    }

    // ─── Migration Results ──────────────────────────────
    if (!empty($migrationResults)) {
        echo '<div class="card"><h3>Migration Results</h3><table>';
        echo '<tr><th>Migration</th><th>Result</th></tr>';
        foreach ($migrationResults as $r) {
            $badge = $r['status'] === 'OK' ? 'badge-ok' : 'badge-fail';
            $extra = isset($r['error'])
                ? '<br><small class="error">' . htmlspecialchars($r['error']) . '</small>'
                : (isset($r['note']) ? '<br><small class="detail">' . htmlspecialchars($r['note']) . '</small>' : '');
            echo "<tr><td>" . htmlspecialchars($r['filename']) . $extra . "</td>";
            echo "<td><span class=\"badge {$badge}\">" . htmlspecialchars($r['status']) . "</span></td></tr>";
        }
        echo '</table></div>';
    }

    // ─── All Migrations Status ──────────────────────────
    if (!empty($status)) {
        echo '<div class="card"><h3>All Migrations</h3><table>';
        echo '<tr><th>Migration</th><th>Status</th><th>Executed At</th></tr>';
        foreach ($status as $m) {
            $badge = $m['status'] === 'DONE' ? 'badge-done' : 'badge-pending';
            $date = $m['executed_at'] ? htmlspecialchars($m['executed_at']) : '—';
            echo "<tr><td>" . htmlspecialchars($m['filename']) . "</td>";
            echo "<td><span class=\"badge {$badge}\">" . htmlspecialchars($m['status']) . "</span></td>";
            echo "<td class=\"detail\">{$date}</td></tr>";
        }
        echo '</table></div>';
    }

    // ─── Action Buttons ─────────────────────────────────
    if ($canRunActions) {
        echo '<div class="actions">';
        if ($setupNeeded) {
            echo "<a href=\"{$runUrl}\" class=\"btn btn-primary\" onclick=\"return confirm('This will create directories and run pending database migrations. Continue?')\">Run All Setup</a>";
        }
        echo "<a href=\"{$statusUrl}\" class=\"btn btn-secondary\">Refresh Status</a>";
        echo '</div>';

        echo '<div class="warning-box">For security, delete or rename this file after setup is complete.</div>';
    }

    echo '</div></body></html>';
}
