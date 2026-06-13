<?php
/**
 * api/c64-proxy.php
 *
 * CORS proxy for the IlluminatOS C64 app (apps/C64.js).
 *
 * Mirrors the same shape as api/dosbox-proxy.php. The C64 app's library
 * references Internet Archive items by ID; the app uses the IA metadata
 * API (https://archive.org/metadata/<itemId>) to discover the actual
 * .d64/.prg/.crt filename and then downloads the file. IA's CORS posture
 * has been historically inconsistent for third-party browser embeds, so
 * we route the request through this proxy to make the integration
 * deterministic regardless of upstream header changes.
 *
 * The endpoint is also the natural extension point if/when we add other
 * C64 ROM sources (CSDb, raw.githubusercontent.com, etc.) — just add the
 * host to the allowlist.
 *
 * Security hardening (same posture as dosbox-proxy.php):
 *  - Strict upstream host allowlist (SSRF guard).
 *  - http/https only.
 *  - 200 MB response size cap.
 *  - 5-minute upstream timeout.
 *  - No request cookies / auth forwarded upstream.
 *  - Streams the response so the proxy never holds the full payload in RAM.
 *
 * URL format: GET /api/c64-proxy.php?url=<urlencoded-upstream-url>
 */

declare(strict_types=1);

// Disable PHP's own output buffering so curl writes stream straight out.
@ini_set('output_buffering', '0');
@ini_set('zlib.output_compression', '0');
while (ob_get_level() > 0) {
    @ob_end_flush();
}

// Permissive CORS — that's the entire point of this endpoint.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Range, If-Range, If-None-Match, If-Modified-Since');
header('Access-Control-Max-Age: 3600');
header('Vary: Origin');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($method !== 'GET' && $method !== 'HEAD') {
    http_response_code(405);
    header('Allow: GET, HEAD, OPTIONS');
    header('Content-Type: text/plain');
    echo 'Method not allowed';
    exit;
}

$url = $_GET['url'] ?? '';
if (!is_string($url) || $url === '') {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Missing required ?url= parameter';
    exit;
}

$parsed = parse_url($url);
if ($parsed === false || empty($parsed['scheme']) || empty($parsed['host'])) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Invalid URL';
    exit;
}

$scheme = strtolower($parsed['scheme']);
if ($scheme !== 'http' && $scheme !== 'https') {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Only http/https schemes allowed';
    exit;
}

// SSRF allowlist — hosts that legitimately serve C64 software / metadata.
// Keep this tight. Add a host here only after verifying it's a public
// archive that hosts redistributable / preservation content.
$allowed_hosts = [
    'archive.org',
    'ia801007.us.archive.org',         // IA file-serving subdomain
    'ia801500.us.archive.org',         // ditto
    'ia601500.us.archive.org',         // ditto
    'ia801707.us.archive.org',         // ditto
    'ia902504.us.archive.org',         // ditto
    'csdb.dk',
    'cdn.csdb.dk',
    'raw.githubusercontent.com',
];

require_once __DIR__ . '/proxy-common.php';

// IA serves files from numbered ia######.us.archive.org subdomains that
// vary per item (and redirects between them). Accept any subdomain that
// follows the `ia<digits>.us.archive.org` pattern in addition to the
// fixed allowlist. Every hop (initial URL and each redirect) is validated
// and resolved to a public, pinned IP in proxy_stream_validated.
proxy_stream_validated(
    $url,
    fn(string $host): bool => in_array($host, $allowed_hosts, true)
        || preg_match('/^ia\d+\.us\.archive\.org$/', $host) === 1,
    $method,
    200 * 1024 * 1024, // 200 MB hard cap
    'IlluminatOS-C64-Proxy/1.0'
);
