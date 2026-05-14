<?php
/**
 * IlluminatOS! Backend Bootstrap
 *
 * Initializes the application: loads environment config, sets up
 * autoloading, establishes the database connection, and configures
 * error handling.
 *
 * Required by all API v2 entry points.
 */

// Prevent direct access
if (php_sapi_name() !== 'cli' && !defined('ILLUMINATOS_API')) {
    define('ILLUMINATOS_API', true);
}

// Load environment config
$envFile = __DIR__ . '/env.php';
if (!file_exists($envFile)) {
    if (php_sapi_name() !== 'cli') {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Backend not configured. Copy backend/env.example.php to backend/env.php and update settings.']);
        exit;
    }
    fwrite(STDERR, "Error: backend/env.php not found. Copy env.example.php to env.php and configure it.\n");
    exit(1);
}

$env = require $envFile;

// Timezone
date_default_timezone_set($env['app']['timezone'] ?? 'UTC');

// Error handling
if ($env['app']['debug'] ?? false) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
    ini_set('display_errors', '0');
}

// Simple class autoloader — loads from backend/ directory
spl_autoload_register(function (string $class): void {
    // Map class name to file paths to search
    $paths = [
        __DIR__ . '/' . $class . '.php',
        __DIR__ . '/controllers/' . $class . '.php',
        __DIR__ . '/models/' . $class . '.php',
        __DIR__ . '/services/' . $class . '.php',
    ];

    foreach ($paths as $path) {
        if (file_exists($path)) {
            require_once $path;
            return;
        }
    }
});

// Initialize database connection (lazy — connects on first query)
// The Database class handles this via getInstance()

/**
 * Harden PHP session cookie parameters before any session_start() in this
 * request. Subsequent session_start() calls in legacy endpoints (api/auth.php,
 * api/save.php, admin/migrate.php, admin/index.php, setup.php) inherit these
 * defaults, ensuring every cookie-based admin session uses SameSite=Strict,
 * HttpOnly, and Secure (when HTTPS is detected).
 *
 * Set via session_set_cookie_params() so it applies regardless of whether
 * the calling script also calls ini_set() (idempotent + safe).
 */
if (session_status() === PHP_SESSION_NONE) {
    $cookieSecure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    @session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'domain'   => '',
        'secure'   => $cookieSecure,
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    @ini_set('session.use_strict_mode', '1');
    @ini_set('session.sid_length', '48');
    @ini_set('session.sid_bits_per_character', '6');
    @ini_set('session.cookie_httponly', '1');
    @ini_set('session.cookie_samesite', 'Strict');
    if ($cookieSecure) {
        @ini_set('session.cookie_secure', '1');
    }
}

// Global variables set by middleware
$requestBody = [];
$currentUser = null;
$currentSession = null;

/**
 * Helper: Send a JSON response and exit.
 */
function jsonResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Helper: Send a JSON error response and exit.
 */
function jsonError(string $message, int $statusCode = 400): void
{
    jsonResponse(['error' => $message], $statusCode);
}

/**
 * Helper: Get a value from the request body.
 */
function input(string $key, $default = null)
{
    global $requestBody;
    return $requestBody[$key] ?? $default;
}

/**
 * Helper: Get the current authenticated user.
 */
function currentUser(): ?array
{
    global $currentUser;
    return $currentUser;
}

/**
 * Helper: Generate a cryptographically secure random token.
 */
function generateToken(int $length = 64): string
{
    return bin2hex(random_bytes($length / 2));
}

/**
 * Helper: Generate a UUID v4.
 */
function generateUuid(): string
{
    $data = random_bytes(16);
    $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // Version 4
    $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // Variant RFC 4122
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}
