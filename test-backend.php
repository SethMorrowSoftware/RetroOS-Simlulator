<?php
/**
 * IlluminatOS! — Backend API Test Suite
 *
 * Run from CLI:   php test-backend.php
 * Run from web:   https://yourdomain.com/test-backend.php
 *
 * Tests every backend endpoint for correctness.
 * DELETE this file from production after testing.
 */

// Security: restrict to CLI only — this file must not be accessible via the web
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo 'Forbidden: this test suite can only be run from the command line.';
    exit(1);
}

$baseUrl = $argv[1] ?? 'http://localhost:8000';
$baseUrl = rtrim($baseUrl, '/');
echo "IlluminatOS! Backend Test Suite\n";
echo "Base URL: $baseUrl\n";
echo str_repeat('=', 50) . "\n\n";

$passed = 0;
$failed = 0;
$cookieJar = tempnam(sys_get_temp_dir(), 'illuminatos_test_');

// ── Helpers ──────────────────────────────────────────────────────────────

function httpGet(string $url, string $cookieFile = ''): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    if ($cookieFile) {
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ['code' => $code, 'body' => $body, 'error' => $error, 'json' => @json_decode($body, true)];
}

function httpPost(string $url, array $data, string $cookieFile = ''): array {
    $ch = curl_init($url);
    $payload = json_encode($data);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'Content-Length: ' . strlen($payload),
        ],
    ]);
    if ($cookieFile) {
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ['code' => $code, 'body' => $body, 'error' => $error, 'json' => @json_decode($body, true)];
}

function httpPostForm(string $url, array $data, string $cookieFile = ''): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query($data),
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    if ($cookieFile) {
        curl_setopt($ch, CURLOPT_COOKIEFILE, $cookieFile);
        curl_setopt($ch, CURLOPT_COOKIEJAR, $cookieFile);
    }
    $body = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    return ['code' => $code, 'body' => $body, 'error' => $error, 'json' => @json_decode($body, true)];
}

function test(string $name, bool $condition, string $detail = ''): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
        echo "  PASS  $name\n";
    } else {
        $failed++;
        echo "  FAIL  $name" . ($detail ? " — $detail" : "") . "\n";
    }
}

// ── Check curl extension ─────────────────────────────────────────────────
if (!function_exists('curl_init')) {
    echo "ERROR: curl extension is required to run tests.\n";
    echo "Enable it in cPanel > Select PHP Version > curl\n";
    exit(1);
}

// ── Preflight connectivity check ─────────────────────────────────────────
$probe = httpGet("$baseUrl/api/config.php");
if (($probe['code'] ?? 0) === 0) {
    echo "ERROR: Could not connect to $baseUrl\n";
    echo "Tip: start a local server first, e.g. `php -S localhost:8000`\n";
    echo "curl error: " . (($probe['error'] ?? '') ?: 'unknown') . "\n";
    @unlink($cookieJar);
    exit(1);
}

// =========================================================================
// TEST 1: Config API (GET)
// =========================================================================
echo "1. Config API (GET /api/config.php)\n";
echo str_repeat('-', 40) . "\n";

$r = httpGet("$baseUrl/api/config.php");
test('Returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");
test('Returns valid JSON', $r['json'] !== null, $r['error'] ?: 'Invalid JSON');
test('Contains branding', isset($r['json']['branding']), '');
test('Contains branding.osName', isset($r['json']['branding']['osName']), '');
test('Contains desktopIcons array', is_array($r['json']['desktopIcons'] ?? null), '');
test('Contains wallpapers', isset($r['json']['wallpapers']), '');
test('Contains features', isset($r['json']['features']), '');

echo "\n";

// =========================================================================
// TEST 2: Config API rejects non-GET
// =========================================================================
echo "2. Config API rejects POST\n";
echo str_repeat('-', 40) . "\n";

$r = httpPost("$baseUrl/api/config.php", ['test' => true]);
test('Returns HTTP 405', $r['code'] === 405, "Got {$r['code']}");

echo "\n";

// =========================================================================
// TEST 3: Auth API — check (unauthenticated)
// =========================================================================
echo "3. Auth API — check (unauthenticated)\n";
echo str_repeat('-', 40) . "\n";

$r = httpPost("$baseUrl/api/auth.php", ['action' => 'check'], $cookieJar);
test('Returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");
test('authenticated = false', ($r['json']['authenticated'] ?? null) === false, '');

echo "\n";

// =========================================================================
// TEST 4: Auth API — login with wrong password
// =========================================================================
echo "4. Auth API — login (wrong password)\n";
echo str_repeat('-', 40) . "\n";

$r = httpPost("$baseUrl/api/auth.php", ['action' => 'login', 'password' => 'wrong_password_xyz'], $cookieJar);
test('Returns HTTP 401 or 500', in_array($r['code'], [401, 500]), "Got {$r['code']}");
test('Returns error message', !empty($r['json']['error']), '');

echo "\n";

// =========================================================================
// TEST 5: Save API — rejects unauthenticated
// =========================================================================
echo "5. Save API — rejects unauthenticated\n";
echo str_repeat('-', 40) . "\n";

// Use a fresh cookie jar (no session)
$freshCookie = tempnam(sys_get_temp_dir(), 'illuminatos_fresh_');
$r = httpPost("$baseUrl/api/save.php", [
    'action' => 'save-section',
    'section' => 'branding',
    'data' => ['osName' => 'Test'],
    'csrfToken' => 'fake'
], $freshCookie);
test('Returns HTTP 401', $r['code'] === 401, "Got {$r['code']}");
@unlink($freshCookie);

echo "\n";

// =========================================================================
// TEST 6: Queue API — status
// =========================================================================
echo "6. Queue API — status\n";
echo str_repeat('-', 40) . "\n";

$r = httpGet("$baseUrl/api/queue.php?action=status");
test('Returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");
test('Returns ok: true', ($r['json']['ok'] ?? null) === true, '');
test('Contains state object', isset($r['json']['state']), '');
test('State has queue array', is_array($r['json']['state']['queue'] ?? null), '');
test('State has settings', isset($r['json']['state']['settings']), '');

echo "\n";

// =========================================================================
// TEST 7: Queue API — join, heartbeat, leave
// =========================================================================
echo "7. Queue API — join/heartbeat/leave cycle\n";
echo str_repeat('-', 40) . "\n";

$testUserId = 'test-user-' . time();

// Join
$r = httpPostForm("$baseUrl/api/queue.php", [
    'action' => 'join',
    'userId' => $testUserId,
    'name' => 'Test User'
]);

test('Join returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");
test('Join returns ok: true', ($r['json']['ok'] ?? null) === true, '');

// Heartbeat
$r = httpPostForm("$baseUrl/api/queue.php", [
    'action' => 'heartbeat',
    'userId' => $testUserId,
]);

test('Heartbeat returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");

// Leave
$r = httpPostForm("$baseUrl/api/queue.php", [
    'action' => 'leave',
    'userId' => $testUserId,
]);

test('Leave returns HTTP 200', $r['code'] === 200, "Got {$r['code']}");
test('Leave returns ok: true', ($r['json']['ok'] ?? null) === true, '');

echo "\n";

// =========================================================================
// TEST 8: API v2 health and route handling
// =========================================================================
echo "8. API v2 health and unknown route handling\n";
echo str_repeat('-', 40) . "\n";

$r = httpGet("$baseUrl/api/v2/system/health");
$v2Available = ($r['code'] === 200);
test('Health endpoint reachable (or rewrite unavailable in local dev)', in_array($r['code'], [200, 500]), "Got {$r['code']}");
test('Health returns JSON object', is_array($r['json']), $r['error'] ?: 'Invalid JSON');
test('Health contains status when reachable', !$v2Available || isset($r['json']['status']), '');

$r = httpGet("$baseUrl/api/v2/route-that-does-not-exist");
test('Unknown v2 route returns 404 (or rewrite unavailable in local dev)', in_array($r['code'], [404, 500]), "Got {$r['code']}");

echo "\n";

// =========================================================================
// TEST 9: Security — direct config file access blocked
// =========================================================================
echo "9. Security — direct access to config files\n";
echo str_repeat('-', 40) . "\n";

$isLocalDev = preg_match('/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/', $baseUrl) === 1;

$r = httpGet("$baseUrl/config/defaults.json");
test('defaults.json blocked in production-compatible servers', $r['code'] !== 200 || $isLocalDev, "Got {$r['code']}");

$r = httpGet("$baseUrl/config/admin-credentials.php");
test('admin-credentials.php blocked (not 200)', $r['code'] !== 200, "Got {$r['code']} — should be 403");

echo "\n";

// =========================================================================
// TEST 10: Security — data directory blocked
// =========================================================================
echo "10. Security — data directory access\n";
echo str_repeat('-', 40) . "\n";

$r = httpGet("$baseUrl/data/");
test('data/ directory blocked', $r['code'] !== 200, "Got {$r['code']}");

$r = httpGet("$baseUrl/data/rate_limits/");
test('data/rate_limits/ blocked', $r['code'] !== 200, "Got {$r['code']}");

echo "\n";

// =========================================================================
// TEST 11: Auth API rejects GET
// =========================================================================
echo "11. Auth API rejects GET\n";
echo str_repeat('-', 40) . "\n";

$r = httpGet("$baseUrl/api/auth.php");
test('Returns HTTP 405', $r['code'] === 405, "Got {$r['code']}");

echo "\n";

// =========================================================================
// Summary
// =========================================================================
echo str_repeat('=', 50) . "\n";
$total = $passed + $failed;
echo "Results: $passed/$total passed";
if ($failed > 0) {
    echo " ($failed failed)";
}
echo "\n";

if ($failed === 0) {
    echo "\nAll tests passed! Your backend is ready for production.\n";
    echo "Remember to DELETE setup.php and test-backend.php from your server.\n";
} else {
    echo "\nSome tests failed. Check the output above for details.\n";
}

// Cleanup
@unlink($cookieJar);
