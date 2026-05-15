<?php
/**
 * api/c64-local.php
 *
 * Lists Commodore 64 ROMs that the host/admin has dropped into
 * `assets/c64/local/`. Returns JSON the C64 app fetches at startup to
 * populate a "Local Library" section in the dropdown alongside the
 * bundled retrobrews homebrew.
 *
 * Drop files (`.d64`, `.prg`, `.crt`, `.t64`, `.tap`, `.g64`, `.nib`,
 * `.m3u`, `.zip`, `.7z`) into `assets/c64/local/` and they show up
 * automatically — no rebuild, no code changes.
 *
 * Optional metadata sidecar: alongside `mygame.d64`, drop a
 * `mygame.json` with `{ "name", "year", "desc", "icon", "category" }`.
 * Missing fields fall back to a sane derivation from the filename.
 *
 * Response shape:
 *   {
 *     "ok": true,
 *     "entries": [
 *       {
 *         "name":    "My Custom Game",
 *         "icon":    "💾",
 *         "category":"Local Library",
 *         "year":    1986,
 *         "desc":    "Hand-crafted by the host",
 *         "url":     "assets/c64/local/mygame.d64",
 *         "size":    174848
 *       }, ...
 *     ]
 *   }
 *
 * Security:
 *  - Reads from a single fixed directory under the project root.
 *  - Strict extension allowlist (no executable / arbitrary-file leak).
 *  - No path parameters; the directory listing is implicit.
 *  - Sidecars are read with `json_decode` only (no eval / include).
 *  - Same-origin response — no CORS headers needed (the C64 app is
 *    same-origin on this deployment).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
// Short browser cache so dropped files appear within a minute even
// if the page is reloaded a few times back-to-back.
header('Cache-Control: public, max-age=30');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$projectRoot = realpath(__DIR__ . '/..');
$localDir = $projectRoot ? realpath($projectRoot . '/assets/c64/local') : false;

if ($localDir === false || !is_dir($localDir)) {
    // Directory doesn't exist yet — return an empty list so the frontend
    // can degrade gracefully without an error overlay.
    echo json_encode(['ok' => true, 'entries' => []]);
    exit;
}

// Defence in depth — make sure realpath of the local dir really is
// inside the project root. Prevents weird symlink shenanigans.
if ($projectRoot && strpos($localDir, $projectRoot) !== 0) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Local ROM directory escapes project root']);
    exit;
}

$ALLOWED_EXTS = ['d64', 'g64', 'nib', 'crt', 'prg', 't64', 'tap', 'm3u', 'zip', '7z'];

$entries = [];
$dh = @opendir($localDir);
if ($dh === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot read local ROM directory']);
    exit;
}

while (($name = readdir($dh)) !== false) {
    if ($name === '.' || $name === '..') continue;
    if ($name[0] === '.') continue;          // hidden files (.gitkeep, .DS_Store, etc.)
    $full = $localDir . DIRECTORY_SEPARATOR . $name;
    if (!is_file($full)) continue;            // skip subdirectories

    $dotPos = strrpos($name, '.');
    if ($dotPos === false) continue;
    $ext = strtolower(substr($name, $dotPos + 1));
    if (!in_array($ext, $ALLOWED_EXTS, true)) continue;

    $base = substr($name, 0, $dotPos);
    $size = @filesize($full);
    if ($size === false) $size = 0;

    // Look for an optional <base>.json sidecar.
    $sidecar = [];
    $sidecarPath = $localDir . DIRECTORY_SEPARATOR . $base . '.json';
    if (is_file($sidecarPath)) {
        $sidecarRaw = @file_get_contents($sidecarPath);
        if (is_string($sidecarRaw) && $sidecarRaw !== '') {
            $decoded = json_decode($sidecarRaw, true);
            if (is_array($decoded)) {
                $sidecar = $decoded;
            }
        }
    }

    // Derive a friendly display name from the filename if not in sidecar.
    $derivedName = $base;
    $derivedYear = 0;
    // Match a trailing 4-digit year in (..._YYYY) or "...YYYY" or "...(YYYY)".
    if (preg_match('/[ _\-(](\d{4})\)?$/', $derivedName, $m)) {
        $y = (int)$m[1];
        if ($y >= 1977 && $y <= 2100) {
            $derivedYear = $y;
            $derivedName = trim(preg_replace('/[ _\-(]\d{4}\)?$/', '', $derivedName));
        }
    }
    // Underscores / hyphens → spaces, then collapse runs of whitespace.
    $derivedName = trim(preg_replace('/\s+/', ' ',
        str_replace(['_', '-'], ' ', $derivedName)));
    if ($derivedName === '') $derivedName = $base;

    $entry = [
        'name'     => isset($sidecar['name']) && is_string($sidecar['name']) ? $sidecar['name'] : $derivedName,
        'icon'     => isset($sidecar['icon']) && is_string($sidecar['icon']) ? $sidecar['icon'] : '💾',
        'category' => isset($sidecar['category']) && is_string($sidecar['category']) ? $sidecar['category'] : 'Local Library',
        'year'     => isset($sidecar['year']) && is_int($sidecar['year']) ? $sidecar['year']
                      : (isset($sidecar['year']) && is_string($sidecar['year']) && ctype_digit($sidecar['year']) ? (int)$sidecar['year']
                      : $derivedYear),
        'desc'     => isset($sidecar['desc']) && is_string($sidecar['desc']) ? $sidecar['desc'] : '',
        'url'      => 'assets/c64/local/' . rawurlencode($name),
        'size'     => $size,
    ];

    $entries[] = $entry;
}
closedir($dh);

// Sort by display name for stable dropdown order.
usort($entries, function ($a, $b) {
    return strcasecmp($a['name'], $b['name']);
});

echo json_encode([
    'ok'      => true,
    'entries' => $entries,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
