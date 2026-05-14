<?php
/**
 * IlluminatOS! — First-Run Setup Wizard
 *
 * A browser-based installer for shared cPanel hosting.
 * Requirements: PHP 7.4+, a fresh MySQL database.
 *
 * Visit https://yourdomain.com/setup.php after uploading files.
 *
 * This wizard will:
 *   1. Check server requirements (PHP version, extensions, permissions)
 *   2. Configure the MySQL database connection (creates backend/env.php)
 *   3. Run all database migrations (creates tables)
 *   4. Create the superadmin account
 *   5. Set up admin credentials file and lock itself
 *
 * SECURITY: Delete this file after setup is complete.
 */

// ---------------------------------------------------------------------------
// Guard: if setup is already complete, block access
// ---------------------------------------------------------------------------
$envFile   = __DIR__ . '/backend/env.php';
$credFile  = __DIR__ . '/config/admin-credentials.php';
$lockFile  = __DIR__ . '/config/.setup-complete';
$isLocked  = file_exists($lockFile);

if ($isLocked) {
    http_response_code(403);
    echo '<!DOCTYPE html><html><head><title>Setup Locked</title>';
    echo '<style>body{font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}';
    echo '.box{background:#16213e;border:1px solid #2a3a5c;border-radius:8px;padding:40px;text-align:center;max-width:500px}';
    echo 'h1{margin:0 0 12px}p{color:#8899aa;font-size:14px}a{color:#4a90d9}code{background:#0d1321;padding:2px 6px;border-radius:3px;font-size:12px}</style></head>';
    echo '<body><div class="box"><h1>Setup Already Complete</h1>';
    echo '<p>IlluminatOS! has already been configured.</p>';
    echo '<p>Log in at <a href="admin/">admin/</a> to manage your installation.</p>';
    echo '<p style="margin-top:20px;color:#e74c3c"><strong>Security reminder:</strong> Delete <code>setup.php</code> from your server.</p>';
    echo '</div></body></html>';
    exit;
}

// Security: if env.php already exists but the lock file is missing, block re-configuration
// unless the user proves they have server filesystem access by providing the existing DB password
if (!$isLocked && file_exists($envFile)) {
    $existingEnv = @include $envFile;
    if (is_array($existingEnv) && !empty($existingEnv['db']['password'])) {
        $reconfirmKey = $_POST['reconfirm_key'] ?? $_GET['reconfirm_key'] ?? '';
        if (!hash_equals($existingEnv['db']['password'], $reconfirmKey)) {
            http_response_code(403);
            echo '<!DOCTYPE html><html><head><title>Re-Configuration Blocked</title>';
            echo '<style>body{font-family:sans-serif;background:#1a1a2e;color:#e0e0e0;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0}';
            echo '.box{background:#16213e;border:1px solid #2a3a5c;border-radius:8px;padding:40px;text-align:center;max-width:500px}';
            echo 'h1{margin:0 0 12px}p{color:#8899aa;font-size:14px}code{background:#0d1321;padding:2px 6px;border-radius:3px;font-size:12px}</style></head>';
            echo '<body><div class="box"><h1>Re-Configuration Blocked</h1>';
            echo '<p>An existing configuration was detected but the setup lock file is missing.</p>';
            echo '<p>To re-run setup, provide the current database password as <code>?reconfirm_key=YOUR_DB_PASSWORD</code> or restore the lock file at <code>config/.setup-complete</code>.</p>';
            echo '</div></body></html>';
            exit;
        }
    }
}

// ---------------------------------------------------------------------------
// Determine current step
// ---------------------------------------------------------------------------
session_start();

$step = $_POST['step'] ?? $_GET['step'] ?? ($_SESSION['setup_step'] ?? '1');
$step = max(1, min(5, intval($step)));

// Allow going back but not forward past completion
if (!isset($_POST['step']) && !isset($_GET['step'])) {
    $step = intval($_SESSION['setup_step'] ?? 1);
}

$errors   = [];
$warnings = [];
$passed   = [];

// ---------------------------------------------------------------------------
// Step handlers
// ---------------------------------------------------------------------------

// STEP 1: Requirements check
function checkRequirements(): array
{
    $errors   = [];
    $warnings = [];
    $passed   = [];

    // PHP version
    $phpMin = '7.4.0';
    if (version_compare(PHP_VERSION, $phpMin, '>=')) {
        $passed[] = "PHP " . PHP_VERSION . " (requires >= $phpMin)";
    } else {
        $errors[] = "PHP " . PHP_VERSION . " is too old. Requires >= $phpMin";
    }

    // Required extensions
    $required = [
        'pdo'       => 'PDO (database abstraction)',
        'pdo_mysql' => 'PDO MySQL driver',
        'json'      => 'JSON support',
        'session'   => 'Session support',
        'mbstring'  => 'Multibyte string support',
    ];

    foreach ($required as $ext => $label) {
        if (extension_loaded($ext)) {
            $passed[] = "Extension: $label";
        } else {
            $errors[] = "Missing extension: $label — enable <code>$ext</code> in cPanel &gt; Select PHP Version";
        }
    }

    // Optional extensions
    if (extension_loaded('openssl')) {
        $passed[] = "Extension: OpenSSL (for webhooks)";
    } else {
        $warnings[] = "OpenSSL not available — webhook HMAC signing will be limited";
    }

    // Writable directories
    $dirs = [
        __DIR__ . '/config'           => 'config/',
        __DIR__ . '/data'             => 'data/',
        __DIR__ . '/data/uploads'     => 'data/uploads/',
        __DIR__ . '/data/rate_limits' => 'data/rate_limits/',
        __DIR__ . '/backend'          => 'backend/',
    ];

    foreach ($dirs as $dir => $label) {
        if (!is_dir($dir)) {
            if (@mkdir($dir, 0755, true)) {
                $passed[] = "Created directory: $label";
            } else {
                $errors[] = "Cannot create directory: $label — create it via cPanel File Manager and set permissions to 755";
            }
        } elseif (!is_writable($dir)) {
            $errors[] = "Directory not writable: $label — set permissions to 755 via cPanel File Manager";
        } else {
            $passed[] = "Directory writable: $label";
        }
    }

    // .htaccess files
    $htFiles = [
        __DIR__ . '/.htaccess'        => 'Root .htaccess',
        __DIR__ . '/api/.htaccess'    => 'API .htaccess',
        __DIR__ . '/config/.htaccess' => 'Config .htaccess',
        __DIR__ . '/data/.htaccess'   => 'Data .htaccess',
    ];

    foreach ($htFiles as $file => $label) {
        if (file_exists($file)) {
            $passed[] = "$label present";
        } else {
            $warnings[] = "$label missing — security may be reduced";
        }
    }

    // defaults.json
    $defaultsFile = __DIR__ . '/config/defaults.json';
    if (file_exists($defaultsFile)) {
        $json = json_decode(file_get_contents($defaultsFile), true);
        if ($json !== null) {
            $passed[] = "config/defaults.json is valid";
        } else {
            $errors[] = "config/defaults.json contains invalid JSON";
        }
    } else {
        $errors[] = "config/defaults.json is missing — the OS will not boot";
    }

    // Session test
    if (session_status() === PHP_SESSION_ACTIVE || @session_start()) {
        $passed[] = "PHP sessions working";
    } else {
        $errors[] = "Cannot start PHP session. Check session.save_path in cPanel PHP settings.";
    }

    return ['errors' => $errors, 'warnings' => $warnings, 'passed' => $passed];
}

// STEP 2: Database configuration
function handleDatabaseConfig(): array
{
    $errors = [];
    $envFile = __DIR__ . '/backend/env.php';

    $host     = trim($_POST['db_host'] ?? '127.0.0.1');
    $port     = intval($_POST['db_port'] ?? 3306);
    $database = trim($_POST['db_name'] ?? '');
    $username = trim($_POST['db_user'] ?? '');
    $password = $_POST['db_pass'] ?? '';
    $timezone = trim($_POST['timezone'] ?? 'UTC');

    // Validate timezone against PHP timezone list
    if (!in_array($timezone, DateTimeZone::listIdentifiers(), true)) {
        $timezone = 'UTC';
    }

    if (empty($database)) {
        $errors[] = 'Database name is required.';
    }
    if (empty($username)) {
        $errors[] = 'Database username is required.';
    }
    if ($port < 1 || $port > 65535) {
        $errors[] = 'Port must be between 1 and 65535.';
    }

    if (!empty($errors)) {
        return ['errors' => $errors, 'values' => $_POST];
    }

    // Test the connection
    try {
        $dsn = sprintf('mysql:host=%s;port=%d;charset=utf8mb4', $host, $port);
        $pdo = new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 5,
        ]);

        // Test that the database exists
        $pdo->exec("USE `" . str_replace('`', '``', $database) . "`");

    } catch (PDOException $e) {
        $msg = $e->getMessage();
        if (strpos($msg, 'Access denied') !== false) {
            $errors[] = "Access denied: check your username and password.";
        } elseif (strpos($msg, 'Unknown database') !== false) {
            $errors[] = "Database <strong>" . htmlspecialchars($database) . "</strong> does not exist. Create it first in cPanel &gt; MySQL Databases.";
        } elseif (strpos($msg, 'Connection refused') !== false || strpos($msg, 'No such file') !== false) {
            $errors[] = "Cannot connect to MySQL at <strong>" . htmlspecialchars($host) . ":" . $port . "</strong>. Check the hostname.";
        } else {
            $errors[] = "Database connection failed: " . htmlspecialchars($msg);
        }

        return ['errors' => $errors, 'values' => $_POST];
    }

    $migrationSecret = bin2hex(random_bytes(20));
    $internalSecret = bin2hex(random_bytes(32));

    // Write env.php
    $envContent = "<?php\n";
    $envContent .= "/**\n * IlluminatOS! Backend Environment Configuration\n * Generated by setup wizard on " . date('Y-m-d H:i:s') . "\n */\n";
    $envContent .= "return [\n";
    $envContent .= "    'db' => [\n";
    $envContent .= "        'host'     => " . var_export($host, true) . ",\n";
    $envContent .= "        'port'     => " . $port . ",\n";
    $envContent .= "        'database' => " . var_export($database, true) . ",\n";
    $envContent .= "        'username' => " . var_export($username, true) . ",\n";
    $envContent .= "        'password' => " . var_export($password, true) . ",\n";
    $envContent .= "        'charset'  => 'utf8mb4',\n";
    $envContent .= "    ],\n\n";
    $envContent .= "    'app' => [\n";
    $envContent .= "        'debug'           => false,\n";
    $envContent .= "        'session_lifetime' => 86400,\n";
    $envContent .= "        'timezone'        => " . var_export($timezone, true) . ",\n";
    $envContent .= "        'internal_secret' => " . var_export($internalSecret, true) . ",\n";
    $envContent .= "    ],\n\n";
    $envContent .= "    'webhooks' => [\n";
    $envContent .= "        'max_retries'     => 3,\n";
    $envContent .= "        'timeout_seconds' => 10,\n";
    $envContent .= "        'max_per_user'    => 20,\n";
    $envContent .= "    ],\n\n";
    $envContent .= "    'sse' => [\n";
    $envContent .= "        'poll_interval'   => 1,\n";
    $envContent .= "        'max_lifetime'    => 300,\n";
    $envContent .= "    ],\n";
    $envContent .= "\n";
    $envContent .= "    'uploads' => [\n";
    $envContent .= "        'max_file_size'    => 10 * 1024 * 1024,\n";
    $envContent .= "        'default_quota'    => 50 * 1024 * 1024,\n";
    $envContent .= "        'allowed_types'    => [\n";
    $envContent .= "            'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',\n";
    $envContent .= "            'application/pdf',\n";
    $envContent .= "            'text/plain', 'text/html', 'text/css', 'text/csv',\n";
    $envContent .= "            'application/json',\n";
    $envContent .= "            'audio/mpeg', 'audio/wav', 'audio/ogg',\n";
    $envContent .= "            'video/mp4', 'video/webm',\n";
    $envContent .= "            'application/zip', 'application/x-tar', 'application/gzip',\n";
    $envContent .= "        ],\n";
    $envContent .= "        'upload_dir'       => __DIR__ . '/../data/uploads',\n";
    $envContent .= "    ],\n";
    $envContent .= "\n";
    $envContent .= "    'migrations' => [\n";
    $envContent .= "        'secret' => " . var_export($migrationSecret, true) . ",\n";
    $envContent .= "    ],\n";
    $envContent .= "];\n";

    if (file_put_contents($envFile, $envContent, LOCK_EX) === false) {
        $errors[] = "Failed to write <code>backend/env.php</code>. Check that the <code>backend/</code> directory is writable (755).";
        return ['errors' => $errors, 'values' => $_POST];
    }

    @chmod($envFile, 0640);

    return ['errors' => [], 'values' => $_POST];
}

// STEP 3: Run migrations
function isIgnorableMigrationError(PDOException $e): bool
{
    $sqlState = (string) ($e->errorInfo[0] ?? '');
    $driverCode = (int) ($e->errorInfo[1] ?? 0);

    return in_array($driverCode, [1050, 1060, 1061], true)
        || in_array($sqlState, ['42S01', '42S21'], true);
}

function runMigrations(): array
{
    $errors = [];
    $results = [];

    $envFile = __DIR__ . '/backend/env.php';
    if (!file_exists($envFile)) {
        $errors[] = "backend/env.php not found. Go back to Step 2.";
        return ['errors' => $errors, 'results' => $results];
    }

    try {
        $env = require $envFile;
        $db = $env['db'];

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'], $db['port'], $db['database'], $db['charset']
        );

        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        // Create migrations tracking table
        $pdo->exec('
            CREATE TABLE IF NOT EXISTS _migrations (
                id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                filename    VARCHAR(255) NOT NULL UNIQUE,
                executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ');

        // Get already-executed migrations
        $executed = $pdo->query('SELECT filename FROM _migrations')
            ->fetchAll(PDO::FETCH_COLUMN);

        // Get migration files
        $migrationDir = __DIR__ . '/backend/migrations';
        $files = glob($migrationDir . '/*.sql');
        sort($files);

        if (empty($files)) {
            $errors[] = "No migration files found in backend/migrations/";
            return ['errors' => $errors, 'results' => $results];
        }

        $pending = 0;
        foreach ($files as $file) {
            $filename = basename($file);

            if (in_array($filename, $executed, true)) {
                $results[] = ['file' => $filename, 'status' => 'skip', 'msg' => 'Already applied'];
                continue;
            }

            $sql = file_get_contents($file);
            if (empty(trim($sql))) {
                $results[] = ['file' => $filename, 'status' => 'skip', 'msg' => 'Empty file'];
                continue;
            }

            try {
                // No transaction wrapping — MySQL implicitly commits on
                // DDL statements (CREATE TABLE, ALTER TABLE, etc.), which
                // would end the transaction and cause "no active transaction"
                // errors on shared hosts.
                $pdo->exec($sql);
                $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
                $stmt->execute([$filename]);

                $results[] = ['file' => $filename, 'status' => 'ok', 'msg' => 'Applied'];
                $pending++;
            } catch (PDOException $e) {
                if (isIgnorableMigrationError($e)) {
                    $stmt = $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)');
                    $stmt->execute([$filename]);
                    $results[] = ['file' => $filename, 'status' => 'ok', 'msg' => 'Schema already present'];
                    continue;
                }

                $results[] = ['file' => $filename, 'status' => 'fail', 'msg' => $e->getMessage()];
                $errors[] = "Migration <strong>$filename</strong> failed: " . htmlspecialchars($e->getMessage());
                break; // Stop on first failure
            }
        }

        if (empty($errors) && $pending === 0) {
            $results[] = ['file' => '(all)', 'status' => 'ok', 'msg' => 'All migrations already up to date'];
        }

    } catch (PDOException $e) {
        $errors[] = "Database error: " . htmlspecialchars($e->getMessage());
    }

    return ['errors' => $errors, 'results' => $results];
}

// STEP 4: Create admin account
function handleAdminCreation(): array
{
    $errors = [];

    $displayName = trim($_POST['admin_name'] ?? 'admin');
    $password    = $_POST['admin_pass'] ?? '';
    $password2   = $_POST['admin_pass2'] ?? '';

    if (empty($displayName)) {
        $displayName = 'admin';
    }
    if (strlen($displayName) > 64) {
        $errors[] = 'Display name must be 64 characters or fewer.';
    }
    if (strlen($password) < 8) {
        $errors[] = 'Password must be at least 8 characters.';
    }
    if ($password !== $password2) {
        $errors[] = 'Passwords do not match.';
    }

    if (!empty($errors)) {
        return ['errors' => $errors];
    }

    $envFile = __DIR__ . '/backend/env.php';
    if (!file_exists($envFile)) {
        $errors[] = "backend/env.php not found. Go back to Step 2.";
        return ['errors' => $errors];
    }

    try {
        $env = require $envFile;
        $db = $env['db'];

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'], $db['port'], $db['database'], $db['charset']
        );

        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        // Check if superadmin already exists
        $stmt = $pdo->prepare('SELECT id, display_name FROM users WHERE role = ?');
        $stmt->execute(['superadmin']);
        $existing = $stmt->fetch();

        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        if ($existing) {
            // Update existing superadmin password
            $stmt = $pdo->prepare('UPDATE users SET display_name = ?, password_hash = ? WHERE id = ?');
            $stmt->execute([$displayName, $hash, $existing['id']]);
        } else {
            // Create new superadmin
            $uuid = setupGenerateUuid();
            $stmt = $pdo->prepare(
                'INSERT INTO users (uuid, display_name, password_hash, role, is_anonymous)
                 VALUES (?, ?, ?, ?, ?)'
            );
            $stmt->execute([$uuid, $displayName, $hash, 'superadmin', 0]);
        }

        // Also write admin-credentials.php for the file-based auth in admin/
        $credFile  = __DIR__ . '/config/admin-credentials.php';
        $credContent = "<?php\nreturn [\n    'password_hash' => " . var_export($hash, true) . ",\n    'force_change' => false\n];\n";

        if (file_put_contents($credFile, $credContent, LOCK_EX) !== false) {
            @chmod($credFile, 0640);
        } else {
            $errors[] = "Admin user created in database, but failed to write config/admin-credentials.php. The admin panel file-based login may not work.";
        }

        // Mint a one-shot recovery token (consumed on first use by
        // admin/migrate.php) so a future operator can recover from a lost
        // admin-credentials.php without resorting to hardcoded passwords.
        $tokenDir = __DIR__ . '/data';
        if (!is_dir($tokenDir)) {
            @mkdir($tokenDir, 0755, true);
        }
        $tokenFile = $tokenDir . '/setup-token.txt';
        $token = bin2hex(random_bytes(24));
        if (@file_put_contents($tokenFile, $token, LOCK_EX) !== false) {
            @chmod($tokenFile, 0600);
        }

        // Write the lock file
        $lockFile = __DIR__ . '/config/.setup-complete';
        file_put_contents($lockFile, date('Y-m-d H:i:s') . "\n", LOCK_EX);

    } catch (PDOException $e) {
        $errors[] = "Database error: " . htmlspecialchars($e->getMessage());
    }

    return ['errors' => $errors];
}

/**
 * Generate a UUID v4 (setup-local copy to avoid loading bootstrap).
 */
function setupGenerateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

// ---------------------------------------------------------------------------
// Process POST submissions
// ---------------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    switch ($action) {
        case 'check-requirements':
            $result = checkRequirements();
            if (empty($result['errors'])) {
                $step = 2;
            } else {
                $step = 1;
                $errors = $result['errors'];
            }
            $warnings = $result['warnings'] ?? [];
            $passed = $result['passed'] ?? [];
            break;

        case 'configure-database':
            $result = handleDatabaseConfig();
            if (empty($result['errors'])) {
                $step = 3;
            } else {
                $step = 2;
                $errors = $result['errors'];
            }
            break;

        case 'run-migrations':
            $result = runMigrations();
            if (empty($result['errors'])) {
                $step = 4;
                $_SESSION['migration_results'] = $result['results'];
            } else {
                $step = 3;
                $errors = $result['errors'];
            }
            break;

        case 'create-admin':
            $result = handleAdminCreation();
            if (empty($result['errors'])) {
                $step = 5;
            } else {
                $step = 4;
                $errors = $result['errors'];
            }
            break;
    }
}

// If we're on step 1 and haven't submitted yet, auto-run checks
if ($step === 1 && $_SERVER['REQUEST_METHOD'] === 'GET') {
    $result = checkRequirements();
    $errors   = $result['errors'];
    $warnings = $result['warnings'];
    $passed   = $result['passed'];
}

$_SESSION['setup_step'] = $step;

// Pre-populate DB fields from existing env.php if present
$dbDefaults = [
    'db_host' => '127.0.0.1',
    'db_port' => '3306',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'timezone' => 'UTC',
];

if (file_exists($envFile)) {
    $existingEnv = require $envFile;
    if (isset($existingEnv['db'])) {
        $dbDefaults['db_host'] = $existingEnv['db']['host'] ?? '127.0.0.1';
        $dbDefaults['db_port'] = (string)($existingEnv['db']['port'] ?? 3306);
        $dbDefaults['db_name'] = $existingEnv['db']['database'] ?? '';
        $dbDefaults['db_user'] = $existingEnv['db']['username'] ?? '';
        $dbDefaults['db_pass'] = $existingEnv['db']['password'] ?? '';
    }
    if (isset($existingEnv['app']['timezone'])) {
        $dbDefaults['timezone'] = $existingEnv['app']['timezone'];
    }
}

// Merge POST values for re-display on error
if (isset($result['values'])) {
    foreach ($result['values'] as $k => $v) {
        if (isset($dbDefaults[$k])) {
            $dbDefaults[$k] = $v;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IlluminatOS! Setup Wizard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e; color: #e0e0e0; min-height: 100vh;
            display: flex; justify-content: center; padding: 40px 20px;
        }
        .container { max-width: 720px; width: 100%; }

        /* Header */
        .header { text-align: center; margin-bottom: 32px; }
        .header h1 { font-size: 28px; margin-bottom: 6px; }
        .header p { color: #8899aa; font-size: 14px; }

        /* Progress bar */
        .progress { display: flex; gap: 4px; margin-bottom: 32px; }
        .progress-step {
            flex: 1; text-align: center; padding: 10px 4px; font-size: 12px;
            background: #16213e; border: 1px solid #2a3a5c; border-radius: 4px;
            color: #556677; transition: all 0.3s;
        }
        .progress-step.active { background: #1a3a6e; border-color: #4a90d9; color: #e0e0e0; }
        .progress-step.done { background: #1a3e2e; border-color: #4caf50; color: #4caf50; }
        .progress-step .num {
            display: inline-block; width: 22px; height: 22px; line-height: 22px;
            border-radius: 50%; background: #2a3a5c; color: #8899aa;
            font-weight: 700; font-size: 11px; margin-bottom: 4px;
        }
        .progress-step.active .num { background: #4a90d9; color: #fff; }
        .progress-step.done .num { background: #4caf50; color: #fff; }
        .progress-step .label { display: block; }

        /* Cards */
        .card {
            background: #16213e; border: 1px solid #2a3a5c; border-radius: 8px;
            padding: 24px; margin-bottom: 20px;
        }
        .card h2 { font-size: 18px; margin-bottom: 16px; }
        .card h3 { font-size: 14px; color: #8899aa; margin-bottom: 12px; font-weight: 500; }

        /* Check items */
        .check-item { padding: 5px 0; font-size: 13px; display: flex; align-items: flex-start; gap: 8px; }
        .check-item.pass::before { content: '\2705'; flex-shrink: 0; }
        .check-item.fail::before { content: '\274C'; flex-shrink: 0; }
        .check-item.warn::before { content: '\26A0\FE0F'; flex-shrink: 0; }
        .check-item.ok::before   { content: '\2705'; flex-shrink: 0; }
        .check-item.skip::before { content: '\23ED\FE0F'; flex-shrink: 0; }

        /* Forms */
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; color: #8899aa; margin-bottom: 4px; }
        .form-group input, .form-group select {
            width: 100%; padding: 10px 12px; background: #0d1321;
            border: 1px solid #2a3a5c; border-radius: 4px; color: #e0e0e0;
            font-size: 14px; font-family: inherit;
        }
        .form-group input:focus, .form-group select:focus { outline: none; border-color: #4a90d9; }
        .form-group .hint { font-size: 11px; color: #556677; margin-top: 3px; }
        .form-row { display: flex; gap: 16px; }
        .form-row .form-group { flex: 1; }

        /* Buttons */
        .btn {
            display: inline-block; padding: 10px 24px; border: none;
            border-radius: 4px; font-size: 14px; font-family: inherit;
            cursor: pointer; text-decoration: none; transition: background 0.2s;
        }
        .btn-primary { background: #4a90d9; color: #fff; }
        .btn-primary:hover { background: #5ba0e9; }
        .btn-primary:disabled { background: #2a3a5c; color: #556677; cursor: not-allowed; }
        .btn-success { background: #4caf50; color: #fff; }
        .btn-success:hover { background: #5cbf60; }
        .btn-secondary { background: #2a3a5c; color: #8899aa; }
        .btn-secondary:hover { background: #3a4a6c; }
        .btn-group { display: flex; gap: 12px; margin-top: 20px; }

        /* Alerts */
        .alert { padding: 12px 16px; border-radius: 6px; font-size: 13px; margin-bottom: 16px; }
        .alert-error { background: rgba(231,76,60,0.15); border: 1px solid #e74c3c; color: #e74c3c; }
        .alert-success { background: rgba(76,175,80,0.15); border: 1px solid #4caf50; color: #4caf50; }
        .alert-warning { background: rgba(243,156,18,0.15); border: 1px solid #f39c12; color: #f39c12; }
        .alert-info { background: rgba(74,144,217,0.15); border: 1px solid #4a90d9; color: #8899aa; }

        /* Migration results table */
        .migration-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .migration-table th, .migration-table td {
            padding: 8px 12px; text-align: left; border-bottom: 1px solid #2a3a5c;
        }
        .migration-table th { color: #8899aa; font-weight: 500; }
        .status-ok { color: #4caf50; }
        .status-skip { color: #8899aa; }
        .status-fail { color: #e74c3c; }

        /* Success page */
        .success-icon { font-size: 48px; text-align: center; margin-bottom: 16px; }
        .success-links { list-style: none; margin: 16px 0; }
        .success-links li { padding: 8px 0; font-size: 14px; }
        .success-links a { color: #4a90d9; text-decoration: none; }
        .success-links a:hover { text-decoration: underline; }

        code { background: #0d1321; padding: 2px 6px; border-radius: 3px; font-size: 12px; }

        /* Loading spinner */
        .spinner {
            display: inline-block; width: 16px; height: 16px;
            border: 2px solid #2a3a5c; border-top-color: #4a90d9;
            border-radius: 50%; animation: spin 0.8s linear infinite;
            vertical-align: middle; margin-right: 8px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        @media (max-width: 600px) {
            .form-row { flex-direction: column; gap: 0; }
            .progress-step .label { font-size: 10px; }
        }
    </style>
</head>
<body>
<div class="container">
    <div class="header">
        <h1>IlluminatOS! Setup</h1>
        <p>Installation wizard for shared hosting</p>
    </div>

    <!-- Progress Bar -->
    <div class="progress">
        <?php
        $steps = ['Requirements', 'Database', 'Migrations', 'Admin Account', 'Complete'];
        foreach ($steps as $i => $label):
            $num = $i + 1;
            $cls = '';
            if ($num < $step) $cls = 'done';
            elseif ($num === $step) $cls = 'active';
        ?>
        <div class="progress-step <?= $cls ?>">
            <span class="num"><?= $num ?></span>
            <span class="label"><?= $label ?></span>
        </div>
        <?php endforeach; ?>
    </div>

    <!-- ================================================================== -->
    <!-- STEP 1: Requirements Check                                          -->
    <!-- ================================================================== -->
    <?php if ($step === 1): ?>
    <div class="card">
        <h2>Server Requirements</h2>
        <p style="font-size:13px;color:#8899aa;margin-bottom:16px;">
            Checking that your hosting environment meets the requirements.
        </p>

        <?php foreach ($passed as $msg): ?>
            <div class="check-item pass"><?= $msg ?></div>
        <?php endforeach; ?>
        <?php foreach ($warnings as $msg): ?>
            <div class="check-item warn"><?= $msg ?></div>
        <?php endforeach; ?>
        <?php foreach ($errors as $msg): ?>
            <div class="check-item fail"><?= $msg ?></div>
        <?php endforeach; ?>

        <div class="btn-group">
            <?php if (empty($errors)): ?>
                <form method="POST">
                    <input type="hidden" name="action" value="check-requirements">
                    <button type="submit" class="btn btn-primary">Continue to Database Setup</button>
                </form>
            <?php else: ?>
                <a href="setup.php" class="btn btn-secondary">Re-check</a>
            <?php endif; ?>
        </div>
    </div>

    <?php if (!empty($warnings)): ?>
    <div class="alert alert-warning">
        Warnings won't block setup but should be addressed for the best experience.
    </div>
    <?php endif; ?>

    <!-- ================================================================== -->
    <!-- STEP 2: Database Configuration                                      -->
    <!-- ================================================================== -->
    <?php elseif ($step === 2): ?>
    <div class="card">
        <h2>Database Configuration</h2>
        <p style="font-size:13px;color:#8899aa;margin-bottom:16px;">
            Enter your MySQL database credentials. Create a new database in
            <strong>cPanel &gt; MySQL Databases</strong> first, then enter the details below.
        </p>

        <?php if (!empty($errors)): ?>
            <div class="alert alert-error">
                <?php foreach ($errors as $e): ?>
                    <div><?= $e ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <form method="POST">
            <input type="hidden" name="action" value="configure-database">

            <div class="form-row">
                <div class="form-group">
                    <label for="db_host">Database Host</label>
                    <input type="text" id="db_host" name="db_host" value="<?= htmlspecialchars($dbDefaults['db_host']) ?>" placeholder="127.0.0.1">
                    <div class="hint">Usually <code>localhost</code> or <code>127.0.0.1</code> on cPanel</div>
                </div>
                <div class="form-group" style="max-width:120px;">
                    <label for="db_port">Port</label>
                    <input type="number" id="db_port" name="db_port" value="<?= htmlspecialchars($dbDefaults['db_port']) ?>" placeholder="3306">
                </div>
            </div>

            <div class="form-group">
                <label for="db_name">Database Name</label>
                <input type="text" id="db_name" name="db_name" value="<?= htmlspecialchars($dbDefaults['db_name']) ?>" placeholder="username_illuminatos" required>
                <div class="hint">On cPanel this is usually <code>cpanelusername_dbname</code></div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="db_user">Database Username</label>
                    <input type="text" id="db_user" name="db_user" value="<?= htmlspecialchars($dbDefaults['db_user']) ?>" placeholder="username_dbuser" required>
                    <div class="hint">Must have full privileges on the database above</div>
                </div>
                <div class="form-group">
                    <label for="db_pass">Database Password</label>
                    <input type="password" id="db_pass" name="db_pass" value="" placeholder="<?= !empty($dbDefaults['db_pass']) ? '(previously configured)' : '' ?>">
                </div>
            </div>

            <div class="form-group">
                <label for="timezone">Timezone</label>
                <select id="timezone" name="timezone">
                    <?php
                    $zones = ['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Anchorage','Pacific/Honolulu','Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','Asia/Dubai','Australia/Sydney','Pacific/Auckland'];
                    foreach ($zones as $tz):
                    ?>
                    <option value="<?= $tz ?>" <?= $dbDefaults['timezone'] === $tz ? 'selected' : '' ?>><?= $tz ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="btn-group">
                <a href="setup.php?step=1" class="btn btn-secondary">Back</a>
                <button type="submit" class="btn btn-primary">Test Connection &amp; Save</button>
            </div>
        </form>
    </div>

    <div class="alert alert-info">
        <strong>cPanel users:</strong> Go to <strong>MySQL Databases</strong> to create a database, then
        <strong>MySQL Users</strong> to create a user and assign it <strong>ALL PRIVILEGES</strong> on the database.
    </div>

    <!-- ================================================================== -->
    <!-- STEP 3: Run Migrations                                              -->
    <!-- ================================================================== -->
    <?php elseif ($step === 3): ?>
    <div class="card">
        <h2>Database Tables</h2>
        <p style="font-size:13px;color:#8899aa;margin-bottom:16px;">
            This will create all required tables in your database.
        </p>

        <?php if (!empty($errors)): ?>
            <div class="alert alert-error">
                <?php foreach ($errors as $e): ?>
                    <div><?= $e ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <?php
        // Show expected migrations
        $migrationDir = __DIR__ . '/backend/migrations';
        $files = glob($migrationDir . '/*.sql');
        sort($files);
        ?>

        <h3>Migrations to run</h3>
        <table class="migration-table">
            <thead><tr><th>File</th><th>Description</th></tr></thead>
            <tbody>
            <?php foreach ($files as $f):
                $fname = basename($f);
                // Extract description from first line comment
                $fh = fopen($f, 'r');
                $firstLine = trim(fgets($fh));
                fclose($fh);
                $desc = preg_replace('/^--\s*Migration\s*\d+:\s*/', '', $firstLine);
            ?>
                <tr><td><code><?= htmlspecialchars($fname) ?></code></td><td><?= htmlspecialchars($desc) ?></td></tr>
            <?php endforeach; ?>
            </tbody>
        </table>

        <form method="POST">
            <input type="hidden" name="action" value="run-migrations">
            <div class="btn-group">
                <a href="setup.php?step=2" class="btn btn-secondary">Back</a>
                <button type="submit" class="btn btn-primary" onclick="this.disabled=true;this.innerHTML='<span class=spinner></span> Running migrations...';this.form.submit();">
                    Run Migrations
                </button>
            </div>
        </form>
    </div>

    <!-- ================================================================== -->
    <!-- STEP 4: Create Admin Account                                        -->
    <!-- ================================================================== -->
    <?php elseif ($step === 4): ?>
    <div class="card">
        <h2>Create Admin Account</h2>
        <p style="font-size:13px;color:#8899aa;margin-bottom:16px;">
            Set up the superadmin account that will manage IlluminatOS!
        </p>

        <?php if (!empty($errors)): ?>
            <div class="alert alert-error">
                <?php foreach ($errors as $e): ?>
                    <div><?= $e ?></div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <?php
        // Show migration results if we just came from step 3
        if (!empty($_SESSION['migration_results'])):
        ?>
        <div class="alert alert-success" style="margin-bottom:20px;">
            Database tables created successfully.
        </div>
        <details style="margin-bottom:20px;font-size:13px;">
            <summary style="cursor:pointer;color:#8899aa;">View migration details</summary>
            <table class="migration-table" style="margin-top:8px;">
                <thead><tr><th>Migration</th><th>Status</th><th>Details</th></tr></thead>
                <tbody>
                <?php foreach ($_SESSION['migration_results'] as $r): ?>
                <tr>
                    <td><code><?= htmlspecialchars($r['file']) ?></code></td>
                    <td class="status-<?= $r['status'] ?>"><?= strtoupper($r['status']) ?></td>
                    <td><?= htmlspecialchars($r['msg']) ?></td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </details>
        <?php unset($_SESSION['migration_results']); endif; ?>

        <form method="POST">
            <input type="hidden" name="action" value="create-admin">

            <div class="form-group">
                <label for="admin_name">Display Name</label>
                <input type="text" id="admin_name" name="admin_name" value="admin" maxlength="64" placeholder="admin">
                <div class="hint">Shown in the admin panel and audit logs</div>
            </div>

            <div class="form-group">
                <label for="admin_pass">Password</label>
                <input type="password" id="admin_pass" name="admin_pass" required minlength="8" autofocus>
                <div class="hint">Minimum 8 characters. Used for both the admin panel and API.</div>
            </div>

            <div class="form-group">
                <label for="admin_pass2">Confirm Password</label>
                <input type="password" id="admin_pass2" name="admin_pass2" required minlength="8">
            </div>

            <div class="btn-group">
                <a href="setup.php?step=3" class="btn btn-secondary">Back</a>
                <button type="submit" class="btn btn-success">Create Account &amp; Finish Setup</button>
            </div>
        </form>
    </div>

    <!-- ================================================================== -->
    <!-- STEP 5: Complete!                                                   -->
    <!-- ================================================================== -->
    <?php elseif ($step === 5): ?>
    <div class="card" style="text-align:center;">
        <div class="success-icon">&#9989;</div>
        <h2>Setup Complete!</h2>
        <p style="font-size:14px;color:#8899aa;margin-top:8px;">
            IlluminatOS! is installed and ready to use.
        </p>

        <ul class="success-links">
            <li><a href="./">Launch IlluminatOS!</a> &mdash; the main desktop experience</li>
            <li><a href="admin/">Admin Panel</a> &mdash; manage configuration, users, and themes</li>
            <li><a href="api/v2/system/health">API Health Check</a> &mdash; verify the backend is working</li>
        </ul>
    </div>

    <div class="alert alert-error" style="text-align:center;">
        <strong>IMPORTANT:</strong> Delete <code>setup.php</code> from your server now.<br>
        Leaving it accessible is a security risk.
    </div>

    <div class="card">
        <h2>What's Next?</h2>
        <ul style="font-size:13px;color:#8899aa;list-style:disc;margin-left:20px;line-height:2;">
            <li>Log in to the <a href="admin/" style="color:#4a90d9;">Admin Panel</a> to customize branding, desktop icons, start menu, and more</li>
            <li>Delete <code>setup.php</code> from your server via cPanel File Manager</li>
            <li>Optionally delete <code>backend/env.example.php</code> and <code>config/admin-credentials.example.php</code></li>
            <li>If you need to re-run setup, delete <code>config/.setup-complete</code> and revisit this page</li>
        </ul>
    </div>

    <?php endif; ?>

</div>
</body>
</html>
