<?php
/**
 * IlluminatOS! Web Migration Runner
 *
 * Browser-based database migration tool for cPanel / shared hosting.
 * Protected by the same admin password as the admin panel.
 *
 * Usage: Navigate to /admin/migrate.php in your browser.
 */
// Harden session cookie params before session_start.
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.use_strict_mode', '1');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', '1');
}
session_start();

// ── Auth (reuse admin panel auth) ──────────────────────────
$maxSessionAge = 8 * 3600;
$authenticated = $_SESSION['admin_authenticated'] ?? false;
if ($authenticated && isset($_SESSION['admin_login_time'])) {
    if (time() - $_SESSION['admin_login_time'] > $maxSessionAge) {
        session_destroy();
        session_start();
        $authenticated = false;
    }
}

// One-shot setup-token recovery flow (used when admin-credentials.php is
// absent/lost). setup.php and the CLI seed.php script write a one-time token
// to data/setup-token.txt (mode 0600). Submitting it here grants a single
// authenticated session and immediately consumes the token.
$setupTokenFile = __DIR__ . '/../data/setup-token.txt';

// Issue a fresh CSRF token for this session if one doesn't exist
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Handle login POST
$loginError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['password']) && !isset($_POST['action'])) {
    $credFile = __DIR__ . '/../config/admin-credentials.php';
    if (file_exists($credFile)) {
        $creds = require $credFile;
        if (password_verify($_POST['password'], $creds['password_hash'] ?? '')) {
            session_regenerate_id(true);
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            $_SESSION['admin_authenticated'] = true;
            $_SESSION['admin_login_time'] = time();
            $authenticated = true;
        } else {
            $loginError = 'Invalid password';
        }
    } elseif (file_exists($setupTokenFile)) {
        // Constant-time comparison against the one-time recovery token
        $expected = trim((string) @file_get_contents($setupTokenFile));
        if ($expected !== '' && hash_equals($expected, trim($_POST['password']))) {
            // Token consumed — delete immediately so it cannot be replayed
            @unlink($setupTokenFile);
            session_regenerate_id(true);
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
            $_SESSION['admin_authenticated'] = true;
            $_SESSION['admin_login_time'] = time();
            $authenticated = true;
        } else {
            $loginError = 'Invalid setup token';
        }
    } else {
        $loginError = 'No admin credentials configured. Run setup.php (which writes data/setup-token.txt for one-time recovery), or restore config/admin-credentials.php.';
    }
}

// ── Bootstrap backend (only when authenticated) ────────────
$dbReady = false;
$envExists = file_exists(__DIR__ . '/../backend/env.php');

if ($authenticated && $envExists) {
    try {
        require_once __DIR__ . '/../backend/bootstrap.php';
        Database::getInstance(); // test connection
        $dbReady = true;
    } catch (\Throwable $e) {
        $dbError = $e->getMessage();
    }
}

// ── Migration logic ────────────────────────────────────────
$output = [];
$action = $_POST['action'] ?? '';

if ($authenticated && $dbReady && $action) {
    // CSRF check: action must include the synchronizer token issued
    // alongside the authenticated session.
    $providedCsrf = $_POST['csrf_token'] ?? '';
    $sessionCsrf = $_SESSION['csrf_token'] ?? '';
    if ($sessionCsrf === '' || !hash_equals($sessionCsrf, (string) $providedCsrf)) {
        http_response_code(403);
        echo '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;padding:40px">';
        echo '<h1>CSRF Validation Failed</h1>';
        echo '<p>The migration request did not include a valid CSRF token. <a href="migrate.php" style="color:#4a90d9">Reload</a> and try again.</p>';
        echo '</body></html>';
        exit;
    }

    $pdo = Database::getInstance();

    // Ensure _migrations tracking table exists
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS _migrations (
            id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            filename    VARCHAR(255) NOT NULL UNIQUE,
            executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    if ($action === 'migrate') {
        $migrationDir = __DIR__ . '/../backend/migrations';
        $files = glob($migrationDir . '/*.sql');
        sort($files);

        $executed = $pdo->query('SELECT filename FROM _migrations')
            ->fetchAll(PDO::FETCH_COLUMN);

        $ran = 0;
        foreach ($files as $file) {
            $filename = basename($file);
            if (in_array($filename, $executed, true)) {
                continue;
            }

            $sql = file_get_contents($file);
            if (empty(trim($sql))) {
                $output[] = ['file' => $filename, 'status' => 'skip', 'msg' => 'Empty file'];
                continue;
            }

            try {
                $pdo->exec($sql);
                $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
                $stmt->execute([$filename]);
                $output[] = ['file' => $filename, 'status' => 'ok', 'msg' => 'Applied'];
                $ran++;
            } catch (PDOException $e) {
                $sqlState = (string) ($e->errorInfo[0] ?? '');
                $driverCode = (int) ($e->errorInfo[1] ?? 0);
                $ignorable = in_array($driverCode, [1050, 1060, 1061], true)
                    || in_array($sqlState, ['42S01', '42S21'], true);

                if ($ignorable) {
                    $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
                    $stmt->execute([$filename]);
                    $output[] = ['file' => $filename, 'status' => 'ok', 'msg' => 'Already present'];
                } else {
                    $output[] = ['file' => $filename, 'status' => 'error', 'msg' => $e->getMessage()];
                }
            }
        }

        if ($ran === 0 && empty($output)) {
            $output[] = ['file' => '—', 'status' => 'ok', 'msg' => 'All migrations are up to date'];
        }
    }
}

// ── Get status ─────────────────────────────────────────────
$statusRows = [];
if ($authenticated && $dbReady) {
    try {
        $pdo = Database::getInstance();

        $pdo->exec('
            CREATE TABLE IF NOT EXISTS _migrations (
                id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                filename    VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');

        $migrationDir = __DIR__ . '/../backend/migrations';
        $files = glob($migrationDir . '/*.sql');
        sort($files);

        $executed = $pdo->query('SELECT filename, executed_at FROM _migrations ORDER BY id')
            ->fetchAll(PDO::FETCH_KEY_PAIR);

        foreach ($files as $file) {
            $filename = basename($file);
            $statusRows[] = [
                'file'     => $filename,
                'done'     => isset($executed[$filename]),
                'executed' => $executed[$filename] ?? null,
            ];
        }
    } catch (\Throwable $e) {
        // Can't read status
    }
}

$pendingCount = count(array_filter($statusRows, function ($r) { return !$r['done']; }));
$doneCount = count(array_filter($statusRows, function ($r) { return $r['done']; }));
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IlluminatOS! — Database Migrations</title>
    <style>
        :root {
            --bg: #1a1a2e;
            --surface: #16213e;
            --border: #2a3a5c;
            --text: #e0e0e0;
            --text-muted: #8899aa;
            --primary: #4a90d9;
            --success: #4caf50;
            --danger: #e74c3c;
            --warning: #f39c12;
            --input-bg: #0d1321;
            --radius: 6px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 32px;
            max-width: 720px;
            width: 90%;
        }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .subtitle { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
        input[type="password"] {
            width: 100%;
            padding: 10px 12px;
            background: var(--input-bg);
            border: 1px solid var(--border);
            border-radius: 4px;
            color: var(--text);
            font-size: 14px;
        }
        input:focus { outline: none; border-color: var(--primary); }
        .btn {
            display: inline-block;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            color: white;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.85; }
        .btn-primary { background: var(--primary); }
        .btn-success { background: var(--success); }
        .btn-back { background: var(--border); color: var(--text-muted); font-size: 12px; padding: 6px 14px; }
        .error { color: var(--danger); font-size: 13px; margin-top: 8px; }
        .warning-box {
            background: rgba(243, 156, 18, 0.1);
            border: 1px solid var(--warning);
            border-radius: var(--radius);
            padding: 12px 16px;
            margin-bottom: 20px;
            font-size: 13px;
            color: var(--warning);
        }

        /* Stats bar */
        .stats-bar {
            display: flex;
            gap: 16px;
            margin-bottom: 20px;
        }
        .stat {
            flex: 1;
            text-align: center;
            padding: 12px;
            background: var(--bg);
            border-radius: var(--radius);
        }
        .stat-val { font-size: 22px; font-weight: 700; }
        .stat-val.green { color: var(--success); }
        .stat-val.yellow { color: var(--warning); }
        .stat-lbl { font-size: 11px; color: var(--text-muted); text-transform: uppercase; }

        /* Migration table */
        .mtable { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 20px; }
        .mtable th {
            text-align: left;
            padding: 8px 10px;
            border-bottom: 2px solid var(--border);
            color: var(--text-muted);
            font-size: 11px;
            text-transform: uppercase;
        }
        .mtable td { padding: 7px 10px; border-bottom: 1px solid rgba(42, 58, 92, 0.4); }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
            font-weight: 600;
        }
        .badge-done { background: rgba(76, 175, 80, 0.2); color: var(--success); }
        .badge-pending { background: rgba(243, 156, 18, 0.2); color: var(--warning); }
        .badge-error { background: rgba(231, 76, 60, 0.2); color: var(--danger); }
        .badge-ok { background: rgba(76, 175, 80, 0.2); color: var(--success); }
        .badge-skip { background: rgba(136, 153, 170, 0.2); color: var(--text-muted); }

        /* Output */
        .output-card {
            background: var(--bg);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px;
            margin-bottom: 20px;
        }
        .output-card h3 { font-size: 14px; margin-bottom: 10px; }
        .output-row { display: flex; gap: 10px; align-items: center; padding: 4px 0; font-size: 13px; }
        .output-file { flex: 1; font-family: monospace; }
        .output-msg { color: var(--text-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; }

        .actions { display: flex; gap: 10px; align-items: center; }
        .db-error { color: var(--danger); font-size: 13px; margin-bottom: 16px; }
    </style>
</head>
<body>
<div class="container">

<?php if (!$authenticated): ?>
    <!-- Login -->
    <h1>IlluminatOS! Migrations</h1>
    <p class="subtitle">Enter admin password to continue</p>
    <form method="POST">
        <div class="form-group">
            <label for="password">Admin Password</label>
            <input type="password" id="password" name="password" placeholder="Enter password" autofocus>
        </div>
        <button type="submit" class="btn btn-primary">Login</button>
        <?php if ($loginError): ?>
            <div class="error"><?= htmlspecialchars($loginError) ?></div>
        <?php endif; ?>
    </form>

<?php elseif (!$envExists): ?>
    <h1>IlluminatOS! Migrations</h1>
    <div class="warning-box">
        <strong>backend/env.php not found.</strong><br>
        Copy <code>backend/env.example.php</code> to <code>backend/env.php</code> and configure your MySQL credentials first.
    </div>
    <a href="." class="btn btn-back">&larr; Admin Panel</a>

<?php elseif (!$dbReady): ?>
    <h1>IlluminatOS! Migrations</h1>
    <div class="db-error">
        <strong>Database connection failed:</strong><br>
        <?= htmlspecialchars($dbError ?? 'Unknown error') ?>
    </div>
    <p class="subtitle">Check your credentials in <code>backend/env.php</code></p>
    <a href="." class="btn btn-back">&larr; Admin Panel</a>

<?php else: ?>
    <!-- Migration dashboard -->
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <h1>IlluminatOS! Migrations</h1>
        <a href="." class="btn btn-back">&larr; Admin Panel</a>
    </div>
    <p class="subtitle">Database schema management</p>

    <!-- Stats -->
    <div class="stats-bar">
        <div class="stat">
            <div class="stat-val"><?= count($statusRows) ?></div>
            <div class="stat-lbl">Total</div>
        </div>
        <div class="stat">
            <div class="stat-val green"><?= $doneCount ?></div>
            <div class="stat-lbl">Applied</div>
        </div>
        <div class="stat">
            <div class="stat-val yellow"><?= $pendingCount ?></div>
            <div class="stat-lbl">Pending</div>
        </div>
    </div>

    <!-- Run output (if any) -->
    <?php if (!empty($output)): ?>
        <div class="output-card">
            <h3>Migration Results</h3>
            <?php foreach ($output as $row): ?>
                <div class="output-row">
                    <span class="output-file"><?= htmlspecialchars($row['file']) ?></span>
                    <span class="badge badge-<?= $row['status'] ?>"><?= strtoupper($row['status']) ?></span>
                    <span class="output-msg"><?= htmlspecialchars($row['msg']) ?></span>
                </div>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>

    <!-- Action buttons -->
    <div class="actions" style="margin-bottom:20px;">
        <?php if ($pendingCount > 0): ?>
            <form method="POST" style="display:inline;">
                <input type="hidden" name="action" value="migrate">
                <input type="hidden" name="csrf_token" value="<?= htmlspecialchars($_SESSION['csrf_token'] ?? '') ?>">
                <button type="submit" class="btn btn-success">
                    Run <?= $pendingCount ?> Pending Migration<?= $pendingCount > 1 ? 's' : '' ?>
                </button>
            </form>
        <?php else: ?>
            <span style="color:var(--success); font-size:14px;">&#10004; All migrations applied</span>
        <?php endif; ?>
    </div>

    <!-- Status table -->
    <table class="mtable">
        <thead>
            <tr>
                <th>Migration</th>
                <th>Status</th>
                <th>Executed</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($statusRows as $row): ?>
                <tr>
                    <td style="font-family:monospace; font-size:12px;"><?= htmlspecialchars($row['file']) ?></td>
                    <td>
                        <?php if ($row['done']): ?>
                            <span class="badge badge-done">DONE</span>
                        <?php else: ?>
                            <span class="badge badge-pending">PENDING</span>
                        <?php endif; ?>
                    </td>
                    <td style="color:var(--text-muted); font-size:12px;">
                        <?= $row['executed'] ? htmlspecialchars($row['executed']) : '—' ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>

<?php endif; ?>

</div>
</body>
</html>
