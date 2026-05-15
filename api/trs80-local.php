<?php
/**
 * api/trs80-local.php
 *
 * Lists Tandy/Radio Shack TRS-80 programs that the host/admin has
 * dropped into `assets/trs80/local/`. Returns JSON the TRS-80 app
 * fetches at startup to populate a "Local Library" section in the
 * dropdown.
 *
 * Drop files (`.cmd`, `.bas`, `.cas`, `.dsk`, `.jv1`, `.jv3`, `.dmk`)
 * into `assets/trs80/local/` and they show up automatically — no
 * rebuild, no code changes.
 *
 * Optional metadata sidecar: alongside `mygame.dsk`, drop a
 * `mygame.json` with `{ "name", "year", "desc", "icon", "category" }`.
 * Missing fields fall back to a derivation from the filename.
 *
 * Same security shape as api/c64-local.php (project-root realpath
 * check, strict extension allowlist, no path parameters,
 * sidecars decoded with json_decode only).
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: public, max-age=30');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD');
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$projectRoot = realpath(__DIR__ . '/..');
$localDir = $projectRoot ? realpath($projectRoot . '/assets/trs80/local') : false;

if ($localDir === false || !is_dir($localDir)) {
    echo json_encode(['ok' => true, 'entries' => []]);
    exit;
}

if ($projectRoot && strpos($localDir, $projectRoot) !== 0) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Local ROM directory escapes project root']);
    exit;
}

// Kept in sync with the formats apps/TRS80.js can actually decode. `.wav`
// (raw cassette audio) and `.zip` are intentionally absent — the emulator
// decodes raw images, it neither demodulates audio nor unpacks archives.
$ALLOWED_EXTS = ['cmd', 'bas', 'cas', 'dsk', 'jv1', 'jv3', 'dmk'];

$entries = [];
$dh = @opendir($localDir);
if ($dh === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Cannot read local ROM directory']);
    exit;
}

while (($name = readdir($dh)) !== false) {
    if ($name === '.' || $name === '..') continue;
    if ($name[0] === '.') continue;
    $full = $localDir . DIRECTORY_SEPARATOR . $name;
    if (!is_file($full)) continue;

    $dotPos = strrpos($name, '.');
    if ($dotPos === false) continue;
    $ext = strtolower(substr($name, $dotPos + 1));
    if (!in_array($ext, $ALLOWED_EXTS, true)) continue;

    $base = substr($name, 0, $dotPos);
    $size = @filesize($full);
    if ($size === false) $size = 0;

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

    $derivedName = $base;
    $derivedYear = 0;
    if (preg_match('/[ _\-(](\d{4})\)?$/', $derivedName, $m)) {
        $y = (int)$m[1];
        if ($y >= 1977 && $y <= 2100) {
            $derivedYear = $y;
            $derivedName = trim(preg_replace('/[ _\-(]\d{4}\)?$/', '', $derivedName));
        }
    }
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
        'url'      => 'assets/trs80/local/' . rawurlencode($name),
        'size'     => $size,
    ];

    $entries[] = $entry;
}
closedir($dh);

usort($entries, function ($a, $b) {
    return strcasecmp($a['name'], $b['name']);
});

echo json_encode([
    'ok'      => true,
    'entries' => $entries,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
