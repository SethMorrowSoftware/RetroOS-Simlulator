<?php
/**
 * IlluminatOS! — Security Test Suite
 *
 * Tests authorization enforcement, role-based access control, rate limiting,
 * body-size limits, and malformed-request handling across the v2 API.
 *
 * Run from CLI:   php test-security.php [base-url]
 * Default URL:    http://localhost:8000
 *
 * These tests do NOT require a valid admin session — they verify that
 * unauthenticated and under-privileged requests are properly rejected.
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo 'Forbidden: this test suite can only be run from the command line.';
    exit(1);
}

if (!function_exists('curl_init')) {
    echo "ERROR: curl extension is required.\n";
    exit(1);
}

$baseUrl = rtrim($argv[1] ?? 'http://localhost:8000', '/');
$v2 = "$baseUrl/api/v2";

echo "IlluminatOS! Security Test Suite\n";
echo "Base URL: $baseUrl\n";
echo str_repeat('=', 60) . "\n\n";

$passed = 0;
$failed = 0;
$skipped = 0;

// ── Helpers ─────────────────────────────────────────────────────────────

function http(string $method, string $url, $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $defaultHeaders = ['Accept: application/json'];

    // Always send the CSRF sentinel header on mutating requests so the
    // request reaches the auth layer. Tests that specifically verify CSRF
    // enforcement should call httpNoCsrf() instead.
    if (in_array(strtoupper($method), ['POST', 'PUT', 'DELETE', 'PATCH'], true)) {
        $defaultHeaders[] = 'X-Requested-With: XMLHttpRequest';
    }

    if ($body !== null && is_array($body)) {
        $body = json_encode($body);
        $defaultHeaders[] = 'Content-Type: application/json';
        $defaultHeaders[] = 'Content-Length: ' . strlen($body);
    } elseif ($body !== null && is_string($body)) {
        $defaultHeaders[] = 'Content-Type: application/json';
        $defaultHeaders[] = 'Content-Length: ' . strlen($body);
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => array_merge($defaultHeaders, $headers),
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $responseBody = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    return [
        'code'  => $code,
        'body'  => $responseBody,
        'error' => $error,
        'json'  => @json_decode($responseBody, true),
    ];
}

/**
 * Send a request without the CSRF sentinel header. Used to verify that the
 * v2 API blocks state-changing requests that lack X-Requested-With.
 */
function httpNoCsrf(string $method, string $url, $body = null, array $headers = []): array {
    $ch = curl_init($url);
    $defaultHeaders = ['Accept: application/json'];

    if ($body !== null && is_array($body)) {
        $body = json_encode($body);
        $defaultHeaders[] = 'Content-Type: application/json';
        $defaultHeaders[] = 'Content-Length: ' . strlen($body);
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => array_merge($defaultHeaders, $headers),
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $responseBody = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return [
        'code'  => $code,
        'body'  => $responseBody,
        'json'  => @json_decode($responseBody, true),
    ];
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

function skip(string $name, string $reason): void {
    global $skipped;
    $skipped++;
    echo "  SKIP  $name — $reason\n";
}

// Quick connectivity check
$probe = http('GET', "$v2/system/health");
$v2Available = ($probe['code'] >= 200 && $probe['code'] < 500);

if (!$v2Available) {
    echo "WARNING: v2 API is not reachable (HTTP {$probe['code']}). URL rewriting may not\n";
    echo "be configured for local dev. Tests will run but may show false failures.\n\n";
}

// =========================================================================
// SECTION 1: Unauthenticated access denial on protected endpoints
// =========================================================================
echo "1. Unauthenticated access denial (expect 401)\n";
echo str_repeat('-', 50) . "\n";

$protectedGets = [
    '/users'                         => 'User list (admin)',
    '/webhooks'                      => 'Webhook list (admin)',
    '/audit'                         => 'Audit log (admin)',
    '/files'                         => 'File list',
    '/files/quota'                   => 'File quota',
    '/user-state'                    => 'User state',
    '/multiplayer/rooms'             => 'Multiplayer rooms',
    '/multiplayer/presence'          => 'Presence',
    '/games/sessions'                => 'Game sessions',
    '/games/leaderboards'            => 'Leaderboard',
    '/messages/unread'               => 'Unread messages',
    '/social/friends'                => 'Friends list',
    '/system/stats'                  => 'System stats (admin)',
];

foreach ($protectedGets as $path => $label) {
    $r = http('GET', "$v2$path");
    test("GET $path ($label) requires auth", $r['code'] === 401, "Got {$r['code']}");
}

$protectedPosts = [
    '/webhooks'                      => 'Create webhook (admin)',
    '/files/upload'                  => 'File upload',
    '/multiplayer/rooms'             => 'Create room',
    '/games/sessions'                => 'Create game session',
    '/events'                        => 'Dispatch event (admin)',
    '/announcements'                 => 'Create announcement (admin)',
    '/social/friends/request'        => 'Send friend request',
    '/social/friends/accept'         => 'Accept friend request',
    '/social/friends/block'          => 'Block user',
];

foreach ($protectedPosts as $path => $label) {
    $r = http('POST', "$v2$path", []);
    test("POST $path ($label) requires auth", $r['code'] === 401, "Got {$r['code']}");
}

$protectedPuts = [
    '/users/1'                       => 'Update user (admin)',
    '/webhooks/1'                    => 'Update webhook (admin)',
    '/config/branding'               => 'Update system config (admin)',
    '/user-state'                    => 'Update user state',
    '/system/default-filesystem'     => 'Update default FS (admin)',
];

foreach ($protectedPuts as $path => $label) {
    $r = http('PUT', "$v2$path", []);
    test("PUT $path ($label) requires auth", $r['code'] === 401, "Got {$r['code']}");
}

$protectedDeletes = [
    '/users/1'                       => 'Delete user (admin)',
    '/webhooks/1'                    => 'Delete webhook (admin)',
    '/config/branding'               => 'Reset config (admin)',
];

foreach ($protectedDeletes as $path => $label) {
    $r = http('DELETE', "$v2$path");
    test("DELETE $path ($label) requires auth", $r['code'] === 401, "Got {$r['code']}");
}

echo "\n";

// =========================================================================
// SECTION 2: Invalid/expired token rejection
// =========================================================================
echo "2. Invalid Bearer token rejection (expect 401)\n";
echo str_repeat('-', 50) . "\n";

$fakeToken = 'Authorization: Bearer totally-invalid-token-12345';

$r = http('GET', "$v2/users", null, [$fakeToken]);
test('GET /users with fake token', $r['code'] === 401, "Got {$r['code']}");

$r = http('GET', "$v2/audit", null, [$fakeToken]);
test('GET /audit with fake token', $r['code'] === 401, "Got {$r['code']}");

$r = http('PUT', "$v2/config/branding", ['osName' => 'Hacked'], [$fakeToken]);
test('PUT /config/branding with fake token', $r['code'] === 401, "Got {$r['code']}");

$r = http('POST', "$v2/events", ['type' => 'test'], [$fakeToken]);
test('POST /events with fake token', $r['code'] === 401, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 3: Malformed request body handling
// =========================================================================
echo "3. Malformed JSON body handling\n";
echo str_repeat('-', 50) . "\n";

$r = http('POST', "$v2/auth/login", 'this is not json{{{');
test('Malformed JSON returns 400', $r['code'] === 400, "Got {$r['code']}");
test('Error message present', !empty($r['json']['error']), '');

$r = http('POST', "$v2/auth/session", '');
// Empty body should not crash — either 200 (anonymous session) or 400
test('Empty body does not crash', $r['code'] >= 200 && $r['code'] < 500, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 4: Body size limit enforcement
// =========================================================================
echo "4. Body size limit (512 KB max)\n";
echo str_repeat('-', 50) . "\n";

$oversized = str_repeat('A', 600 * 1024); // 600 KB
$r = http('POST', "$v2/auth/login", $oversized);
test('Oversized body returns 413', $r['code'] === 413, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 5: Unknown routes return 404
// =========================================================================
echo "5. Unknown routes return 404\n";
echo str_repeat('-', 50) . "\n";

$r = http('GET', "$v2/does-not-exist");
test('GET unknown route returns 404', $r['code'] === 404, "Got {$r['code']}");

$r = http('POST', "$v2/does-not-exist", []);
test('POST unknown route returns 404', $r['code'] === 404, "Got {$r['code']}");

$r = http('DELETE', "$v2/does-not-exist");
test('DELETE unknown route returns 404', $r['code'] === 404, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 6: Public endpoints remain accessible
// =========================================================================
echo "6. Public endpoints remain accessible without auth\n";
echo str_repeat('-', 50) . "\n";

$r = http('GET', "$v2/system/health");
test('GET /system/health is public', in_array($r['code'], [200, 500]), "Got {$r['code']}");

$r = http('GET', "$v2/config");
test('GET /config is public', in_array($r['code'], [200, 500]), "Got {$r['code']}");

$r = http('GET', "$v2/themes");
test('GET /themes is public', in_array($r['code'], [200, 500]), "Got {$r['code']}");

$r = http('GET', "$v2/auth/check");
test('GET /auth/check is public', in_array($r['code'], [200, 500]), "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 7: SSE token query param restricted to SSE endpoints
// =========================================================================
echo "7. Token query param restricted to SSE endpoints\n";
echo str_repeat('-', 50) . "\n";

// Token via query param should NOT work on non-SSE endpoints
$r = http('GET', "$v2/users?token=fake-token-abc");
test('GET /users with query-param token still 401', $r['code'] === 401, "Got {$r['code']}");

$r = http('GET', "$v2/audit?token=fake-token-abc");
test('GET /audit with query-param token still 401', $r['code'] === 401, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 8: Legacy API security
// =========================================================================
echo "8. Legacy API security checks\n";
echo str_repeat('-', 50) . "\n";

$r = http('GET', "$baseUrl/api/auth.php");
test('Legacy auth rejects GET', $r['code'] === 405, "Got {$r['code']}");

$r = http('POST', "$baseUrl/api/save.php", [
    'action' => 'save-section',
    'section' => 'branding',
    'data' => ['osName' => 'Hacked'],
    'csrfToken' => 'fake',
]);
test('Legacy save rejects without session', $r['code'] === 401, "Got {$r['code']}");

echo "\n";

// =========================================================================
// SECTION 8b: ConfigController public-section allowlist
// =========================================================================
echo "8b. Anonymous /config returns only public sections\n";
echo str_repeat('-', 50) . "\n";

if ($v2Available) {
    $r = http('GET', "$v2/config");
    test('Anonymous GET /config returns 200', $r['code'] === 200, "Got {$r['code']}");
    if (is_array($r['json'])) {
        test('Anonymous /config strips filesystem section', !array_key_exists('filesystem', $r['json']), 'filesystem leaked');
        test('Anonymous /config strips plugins section', !array_key_exists('plugins', $r['json']), 'plugins leaked');
        test('Anonymous /config still includes branding', array_key_exists('branding', $r['json']), '');
        test('Anonymous /config still includes desktopIcons', array_key_exists('desktopIcons', $r['json']), '');
    }

    $r = http('GET', "$v2/config/filesystem");
    test('Anonymous GET /config/filesystem returns 401', $r['code'] === 401, "Got {$r['code']}");

    $r = http('GET', "$v2/config/plugins");
    test('Anonymous GET /config/plugins returns 401', $r['code'] === 401, "Got {$r['code']}");

    $r = http('GET', "$v2/config/branding");
    test('Anonymous GET /config/branding still public', in_array($r['code'], [200, 500]), "Got {$r['code']}");
} else {
    skip('Public-section allowlist tests', 'v2 API not reachable');
}

echo "\n";

// =========================================================================
// SECTION 8c: FileController cross-user authorization
// =========================================================================
echo "8c. FileController rejects unauth + invalid IDs\n";
echo str_repeat('-', 50) . "\n";

if ($v2Available) {
    // GET /files/:id with no auth must 401 BEFORE leaking ownership info
    $r = http('GET', "$v2/files/1");
    test('GET /files/1 unauthenticated returns 401', $r['code'] === 401, "Got {$r['code']}");

    // PUT /files/:id with no auth must 401
    $r = http('PUT', "$v2/files/1", ['virtual_path' => 'C:/Users/attacker/x.txt']);
    test('PUT /files/1 unauthenticated returns 401', $r['code'] === 401, "Got {$r['code']}");

    // DELETE /files/:id with no auth must 401
    $r = http('DELETE', "$v2/files/1");
    test('DELETE /files/1 unauthenticated returns 401', $r['code'] === 401, "Got {$r['code']}");

    // The findOwnedFile helper returns the same 404 whether the file
    // doesn't exist OR exists but belongs to a different user — verifying
    // that requires a logged-in second user, which this suite skips.
    skip('Cross-user file access (requires two registered accounts)', 'manual test or seed-driven test');
} else {
    skip('FileController auth tests', 'v2 API not reachable');
}

echo "\n";

// =========================================================================
// SECTION 8d: /auth/revocations gated by internal secret
// =========================================================================
echo "8d. /auth/revocations rejects requests without internal secret\n";
echo str_repeat('-', 50) . "\n";

if ($v2Available) {
    $r = http('GET', "$v2/auth/revocations");
    test('GET /auth/revocations without secret returns 403', $r['code'] === 403, "Got {$r['code']}");

    $r = http('GET', "$v2/auth/revocations", null, ['X-Internal-Auth: wrong-secret']);
    test('GET /auth/revocations with wrong secret returns 403', $r['code'] === 403, "Got {$r['code']}");
} else {
    skip('Revocation endpoint auth tests', 'v2 API not reachable');
}

echo "\n";

// =========================================================================
// SECTION 9: CSRF protection on v2 API
// =========================================================================
echo "9. CSRF protection (v2 API rejects mutating requests without X-Requested-With)\n";
echo str_repeat('-', 50) . "\n";

if ($v2Available) {
    $r = httpNoCsrf('POST', "$v2/auth/login", ['displayName' => 'a', 'password' => 'b']);
    test('POST without X-Requested-With returns 403', $r['code'] === 403, "Got {$r['code']}");

    $r = httpNoCsrf('PUT', "$v2/config/branding", ['data' => ['osName' => 'CSRF']]);
    test('PUT without X-Requested-With returns 403', $r['code'] === 403, "Got {$r['code']}");

    $r = httpNoCsrf('DELETE', "$v2/config/branding");
    test('DELETE without X-Requested-With returns 403', $r['code'] === 403, "Got {$r['code']}");

    // GET should NOT be CSRF-gated
    $r = httpNoCsrf('GET', "$v2/system/health");
    test('GET without X-Requested-With still allowed', in_array($r['code'], [200, 500]), "Got {$r['code']}");

    // Confirm X-CSRF-Token also satisfies the check
    $r = httpNoCsrf('POST', "$v2/auth/login", ['displayName' => 'a', 'password' => 'b'], ['X-CSRF-Token: any-value']);
    test('POST with X-CSRF-Token bypasses CSRF gate (reaches auth/login)', $r['code'] !== 403 || ($r['json']['error'] ?? '') !== 'CSRF protection: missing X-Requested-With or X-CSRF-Token header', "Got {$r['code']}");
} else {
    skip('v2 CSRF tests', 'v2 API not reachable');
}

echo "\n";

// =========================================================================
// SECTION 10: Admin auth backdoors removed
// =========================================================================
echo "10. Admin auth backdoors removed\n";
echo str_repeat('-', 50) . "\n";

// admin/migrate.php must NOT accept "admin" password even with ILLUMINATOS_SETUP=1.
// We can't set the env var on the remote server, but we can verify the file-based
// ILLUMINATOS_SETUP+'admin' fallback no longer exists in the source code.
$migrateSrc = @file_get_contents(__DIR__ . '/admin/migrate.php');
test(
    'admin/migrate.php no longer hardcodes ILLUMINATOS_SETUP + "admin" fallback',
    $migrateSrc !== false && strpos($migrateSrc, "=== 'admin'") === false,
    'Backdoor string still present in admin/migrate.php'
);
test(
    'admin/migrate.php no longer references ILLUMINATOS_SETUP env var',
    $migrateSrc !== false && stripos($migrateSrc, 'ILLUMINATOS_SETUP') === false,
    'ILLUMINATOS_SETUP env var still referenced'
);

$authSrc = @file_get_contents(__DIR__ . '/api/auth.php');
test(
    'api/auth.php no longer references ILLUMINATOS_DEV backdoor',
    $authSrc !== false && stripos($authSrc, 'ILLUMINATOS_DEV') === false,
    'ILLUMINATOS_DEV env var still referenced'
);
test(
    'api/auth.php no longer ships hardcoded bcrypt hash for "admin"',
    $authSrc !== false && strpos($authSrc, '$2y$12$5SwhxLazB5TD89J6GS9Gvu9aLVRIJxnD0BYeQKVGJfnPE9.4WXDIO') === false,
    'Hardcoded bcrypt hash still present in api/auth.php'
);

echo "\n";

// =========================================================================
// Summary
// =========================================================================
echo str_repeat('=', 60) . "\n";
$total = $passed + $failed;
echo "Results: $passed/$total passed";
if ($failed > 0) echo " ($failed failed)";
if ($skipped > 0) echo " ($skipped skipped)";
echo "\n";

if ($failed === 0) {
    echo "\nAll security tests passed.\n";
} else {
    echo "\nSome tests failed. Review the output above.\n";
}

exit($failed > 0 ? 1 : 0);
