<?php
/**
 * IlluminatOS! Auth API
 *
 * POST /api/auth.php
 * Actions: login, logout, check, change-password
 *
 * Uses PHP sessions for authentication.
 */

// Harden session cookie parameters before starting the session
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
ini_set('session.use_strict_mode', '1');
ini_set('session.sid_length', '48');
ini_set('session.sid_bits_per_character', '6');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', '1');
}

session_start();
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// Enforce max session age (8 hours) for admin sessions
$maxSessionAge = 28800; // 8 hours in seconds
if (isset($_SESSION['admin_login_time']) && (time() - $_SESSION['admin_login_time'] > $maxSessionAge)) {
    unset($_SESSION['admin_authenticated']);
    unset($_SESSION['admin_login_time']);
    unset($_SESSION['csrf_token']);
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$action = $input['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin($input);
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check':
        handleCheck();
        break;
    case 'change-password':
        handleChangePassword($input);
        break;
    case 'admin-identity':
        handleAdminIdentity();
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
}

function getCredentials(): array {
    $credFile = __DIR__ . '/../config/admin-credentials.php';
    if (!file_exists($credFile)) {
        // Fail closed: never authenticate without a real credentials file.
        // Recovery flow lives in admin/migrate.php (one-shot setup-token.txt).
        http_response_code(500);
        echo json_encode(['error' => 'Admin credentials not configured. Run setup.php to provision the admin account.']);
        exit;
    }
    return require $credFile;
}

/**
 * IP-based rate limiting helpers (file-backed, survives session resets)
 */
function getRateLimitDir(): string {
    $dir = __DIR__ . '/../data/rate_limits';
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
            error_log('[auth.php] Failed to create rate limit directory: ' . $dir);
            // Fall back to system temp directory
            $dir = sys_get_temp_dir() . '/illuminatos_rate_limits';
            if (!is_dir($dir)) {
                @mkdir($dir, 0700, true);
            }
        }
    }
    if (!is_writable($dir)) {
        error_log('[auth.php] Rate limit directory is not writable: ' . $dir);
    }
    return $dir;
}

function getIpRateLimitData(string $ip): ?array {
    $file = getRateLimitDir() . '/' . md5($ip) . '.json';
    if (!file_exists($file)) return null;
    $data = json_decode(file_get_contents($file), true);
    if (!is_array($data)) return null;
    return $data;
}

function setIpRateLimitData(string $ip, array $data): bool {
    $file = getRateLimitDir() . '/' . md5($ip) . '.json';
    $result = @file_put_contents($file, json_encode($data), LOCK_EX);
    if ($result === false) {
        error_log('[auth.php] Failed to write rate-limit data for IP hash ' . md5($ip));
        return false;
    }
    return true;
}

function clearIpRateLimitData(string $ip): void {
    $file = getRateLimitDir() . '/' . md5($ip) . '.json';
    if (file_exists($file)) {
        unlink($file);
    }
}

function handleLogin(array $input): void {
    $password = $input['password'] ?? '';
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // IP-based rate limiting (survives session resets)
    $ipData = getIpRateLimitData($ip);
    if ($ipData) {
        // Reset after 15 minutes of inactivity
        if (time() - ($ipData['last_attempt'] ?? 0) > 900) {
            clearIpRateLimitData($ip);
            $ipData = null;
        } elseif (($ipData['attempts'] ?? 0) >= 10) {
            $retryAfter = 900 - (time() - $ipData['last_attempt']);
            http_response_code(429);
            echo json_encode(['error' => 'Too many login attempts. Try again later.', 'retryAfter' => max(0, $retryAfter)]);
            return;
        }
    }

    // Session-based rate limiting (secondary layer)
    $attempts = $_SESSION['login_attempts'] ?? 0;
    $lastAttempt = $_SESSION['last_attempt_time'] ?? 0;

    if (time() - $lastAttempt > 900) {
        $attempts = 0;
    }

    if ($attempts >= 10) {
        $retryAfter = 900 - (time() - $lastAttempt);
        http_response_code(429);
        echo json_encode(['error' => 'Too many login attempts. Try again later.', 'retryAfter' => max(0, $retryAfter)]);
        return;
    }

    $credentials = getCredentials();

    if (password_verify($password, $credentials['password_hash'])) {
        // Regenerate session ID to prevent session fixation
        session_regenerate_id(true);

        // Reset attempt counters on success
        unset($_SESSION['login_attempts']);
        unset($_SESSION['last_attempt_time']);
        clearIpRateLimitData($ip);

        $_SESSION['admin_authenticated'] = true;
        $_SESSION['admin_login_time'] = time();

        // Generate CSRF token (always fresh after session regeneration)
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

        echo json_encode([
            'success' => true,
            'forcePasswordChange' => $credentials['force_change'] ?? false,
            'csrfToken' => $_SESSION['csrf_token']
        ]);
    } else {
        // Track failed attempt in session
        $_SESSION['login_attempts'] = $attempts + 1;
        $_SESSION['last_attempt_time'] = time();

        // Track failed attempt by IP
        $currentIpAttempts = $ipData['attempts'] ?? 0;
        if (!setIpRateLimitData($ip, [
            'attempts' => $currentIpAttempts + 1,
            'last_attempt' => time()
        ])) {
            // Fail-safe: if we cannot persist rate-limit state, deny with a
            // generic error to prevent untracked brute-force attempts.
            http_response_code(503);
            echo json_encode(['error' => 'Service temporarily unavailable. Try again later.']);
            return;
        }

        http_response_code(401);
        echo json_encode(['error' => 'Invalid credentials']);
    }
}

function handleLogout(): void {
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params['path'], $params['domain'],
            $params['secure'], $params['httponly']);
    }

    session_destroy();
    echo json_encode(['success' => true]);
}

function handleCheck(): void {
    $authenticated = $_SESSION['admin_authenticated'] ?? false;
    echo json_encode([
        'authenticated' => $authenticated,
        'csrfToken' => $_SESSION['csrf_token'] ?? null
    ]);
}

function handleChangePassword(array $input): void {
    if (!($_SESSION['admin_authenticated'] ?? false)) {
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated']);
        return;
    }

    // Verify CSRF token (constant-time comparison)
    $csrfToken = $input['csrfToken'] ?? '';
    $sessionToken = $_SESSION['csrf_token'] ?? '';
    if (!$sessionToken || !hash_equals($sessionToken, $csrfToken)) {
        http_response_code(403);
        echo json_encode(['error' => 'Invalid CSRF token']);
        return;
    }

    $currentPassword = $input['currentPassword'] ?? '';
    $newPassword = $input['newPassword'] ?? '';

    if (strlen($newPassword) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 8 characters']);
        return;
    }

    // Require mixed case and at least one digit for stronger passwords
    if (!preg_match('/[a-z]/', $newPassword) || !preg_match('/[A-Z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword)) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must contain at least one lowercase letter, one uppercase letter, and one number']);
        return;
    }

    $credentials = getCredentials();

    if (!password_verify($currentPassword, $credentials['password_hash'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Current password is incorrect']);
        return;
    }

    // Write new credentials (cost=12 for adequate brute-force resistance)
    $newHash = password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]);
    $credFile = __DIR__ . '/../config/admin-credentials.php';
    $content = "<?php\nreturn [\n    'password_hash' => '$newHash',\n    'force_change' => false\n];\n";

    if (file_put_contents($credFile, $content, LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save credentials']);
        return;
    }

    // Harden file permissions to owner-only read/write
    if (!@chmod($credFile, 0600)) {
        error_log('[auth.php] Warning: failed to set permissions on credentials file');
    }

    // Rotate CSRF token after privileged operation
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    echo json_encode(['success' => true, 'csrfToken' => $_SESSION['csrf_token']]);
}

/**
 * Return the superadmin's display_name so the admin panel JS can
 * log in to the v2 API without hardcoding a username.
 * Requires an active admin session.
 */
function handleAdminIdentity(): void {
    if (!($_SESSION['admin_authenticated'] ?? false)) {
        http_response_code(401);
        echo json_encode(['error' => 'Not authenticated']);
        return;
    }

    $envFile = __DIR__ . '/../backend/env.php';
    if (!file_exists($envFile)) {
        echo json_encode(['displayName' => 'admin']);
        return;
    }

    try {
        $env = require $envFile;
        $db = $env['database'] ?? $env['db']; // canonical key first, legacy fallback
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $db['host'], $db['port'], $db['database'], $db['charset']);
        $pdo = new PDO($dsn, $db['username'], $db['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        ]);
        $stmt = $pdo->prepare('SELECT display_name FROM users WHERE role = ? LIMIT 1');
        $stmt->execute(['superadmin']);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['displayName' => $row['display_name'] ?? 'admin']);
    } catch (Exception $e) {
        echo json_encode(['displayName' => 'admin']);
    }
}
