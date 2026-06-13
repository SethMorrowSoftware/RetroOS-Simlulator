<?php
/**
 * api/dosbox-proxy.php
 *
 * CORS proxy for .jsdos bundle downloads consumed by the IlluminatOS DOSBox
 * app (apps/DOSBox.js).
 *
 * cdn.dos.zone and br.cdn.dos.zone do not send `Access-Control-Allow-Origin`
 * to arbitrary third-party origins, so when js-dos is embedded outside of
 * v8.js-dos.com / dos.zone the browser's fetch() is blocked by CORS. This
 * endpoint streams a requested bundle from a whitelisted upstream back to
 * the browser with permissive CORS headers so the embed works anywhere.
 *
 * Security hardening:
 *  - Allowlist of upstream hosts (SSRF guard).
 *  - Only http(s) URLs.
 *  - 200 MB response size cap.
 *  - 5-minute upstream timeout.
 *  - No request cookies / auth forwarded upstream.
 *  - Streams the response so the proxy never holds the full bundle in RAM.
 *
 * URL format: GET /api/dosbox-proxy.php?url=<urlencoded-bundle-url>
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

// SSRF allowlist — these are the CDNs that host .jsdos bundles. Adding
// other hosts here lets the proxy fetch them too; keep the list tight.
$allowed_hosts = [
    'v8.js-dos.com',
    'cdn.dos.zone',
    'br.cdn.dos.zone',
    'dos.zone',
];

require_once __DIR__ . '/proxy-common.php';

// Every hop (initial URL and each redirect) is validated against the
// allowlist and resolved to a public, pinned IP in proxy_stream_validated.
proxy_stream_validated(
    $url,
    fn(string $host): bool => in_array($host, $allowed_hosts, true),
    $method,
    200 * 1024 * 1024, // 200 MB hard cap
    'IlluminatOS-DOSBox-Proxy/1.0'
);
