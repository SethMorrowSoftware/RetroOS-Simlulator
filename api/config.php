<?php
/**
 * IlluminatOS! Config API
 *
 * GET /api/config.php
 * Returns the merged config (defaults + overrides) as JSON.
 *
 * The frontend fetches this once at boot to configure the OS.
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache, must-revalidate');
header('X-Content-Type-Options: nosniff');

// Only allow GET requests
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$configDir = __DIR__ . '/../config';
$defaultsFile = $configDir . '/defaults.json';
$overridesFile = $configDir . '/overrides.json';

// Load defaults (required)
if (!file_exists($defaultsFile)) {
    http_response_code(500);
    echo json_encode(['error' => 'defaults.json not found']);
    exit;
}

$defaults = json_decode(file_get_contents($defaultsFile), true);
if ($defaults === null) {
    http_response_code(500);
    echo json_encode(['error' => 'Invalid defaults.json']);
    exit;
}

// Load overrides (optional)
$overrides = [];
if (file_exists($overridesFile)) {
    $overridesData = json_decode(file_get_contents($overridesFile), true);
    if ($overridesData !== null) {
        $overrides = $overridesData;
    }
}

// Deep merge overrides on top of defaults
$merged = deepMerge($defaults, $overrides);

echo json_encode($merged, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

/**
 * Deep merge two associative arrays.
 * Values from $override replace values in $base.
 * Arrays are merged recursively if both values are associative arrays.
 * Sequential arrays (like desktopIcons) are replaced entirely.
 */
function deepMerge(array $base, array $override): array {
    $result = $base;

    foreach ($override as $key => $value) {
        if (
            isset($result[$key])
            && is_array($result[$key])
            && is_array($value)
            && isAssoc($result[$key])
            && isAssoc($value)
        ) {
            // Both are associative arrays — recurse
            $result[$key] = deepMerge($result[$key], $value);
        } else {
            // Replace (including sequential arrays)
            $result[$key] = $value;
        }
    }

    return $result;
}

/**
 * Check if an array is associative (has string keys)
 */
function isAssoc(array $arr): bool {
    if (empty($arr)) return false;
    return array_keys($arr) !== range(0, count($arr) - 1);
}
