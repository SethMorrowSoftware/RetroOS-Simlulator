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

$host = strtolower($parsed['host']);
$hostAllowed = in_array($host, $allowed_hosts, true);
// IA serves files from numbered ia######.us.archive.org subdomains that
// vary per item. Accept any *.us.archive.org subdomain that follows the
// `ia<digits>.us.archive.org` pattern.
if (!$hostAllowed && preg_match('/^ia\d+\.us\.archive\.org$/', $host)) {
    $hostAllowed = true;
}
if (!$hostAllowed) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Host not in allowlist: ' . htmlspecialchars($host, ENT_QUOTES, 'UTF-8');
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo 'php-curl extension is required for the C64 CORS proxy';
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);
curl_setopt($ch, CURLOPT_USERAGENT, 'IlluminatOS-C64-Proxy/1.0');
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_NOBODY, $method === 'HEAD');
// Ask for JSON when fetching metadata; the IA metadata endpoint serves
// JSON regardless, but a few hosts behave better with this header set.
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Accept: */*',
]);

$maxBytes = 200 * 1024 * 1024; // 200 MB hard cap
$state = (object)[
    'bytesSent'         => 0,
    'headersSent'       => false,
    'status'            => 0,
    'contentType'       => null,
    'contentLength'     => null,
    'aborted'           => false,
];

curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($_ch, $headerLine) use ($state) {
    $len = strlen($headerLine);
    $trimmed = trim($headerLine);

    if (preg_match('#^HTTP/[\d.]+ (\d+)#', $trimmed, $m)) {
        // A redirect chain can produce multiple status lines; the last one wins.
        $state->status = (int)$m[1];
        $state->contentType = null;
        $state->contentLength = null;
        return $len;
    }

    $parts = explode(':', $trimmed, 2);
    if (count($parts) === 2) {
        $name = strtolower(trim($parts[0]));
        $value = trim($parts[1]);
        if ($name === 'content-type') {
            $state->contentType = $value;
        } elseif ($name === 'content-length') {
            $state->contentLength = $value;
        }
    }
    return $len;
});

curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($_ch, $data) use ($state, $maxBytes) {
    if ($state->aborted) return 0;

    if (!$state->headersSent) {
        $code = $state->status;
        if ($code >= 200 && $code < 300) {
            http_response_code(200);
            header('Content-Type: ' . ($state->contentType ?? 'application/octet-stream'));
            if ($state->contentLength !== null) {
                header('Content-Length: ' . $state->contentLength);
            }
            // Preservation artifacts are effectively immutable — long
            // browser cache is fine. The metadata response is JSON and
            // safely cacheable for a short window; we keep one TTL here
            // for simplicity since metadata changes rarely.
            header('Cache-Control: public, max-age=86400');
        } else {
            http_response_code($code > 0 ? $code : 502);
            header('Content-Type: text/plain');
        }
        $state->headersSent = true;
    }

    $len = strlen($data);
    if ($state->bytesSent + $len > $maxBytes) {
        $state->aborted = true;
        return 0;
    }
    $state->bytesSent += $len;
    echo $data;
    @flush();
    return $len;
});

$ok = curl_exec($ch);
$curlErr = curl_errno($ch) ? curl_error($ch) : null;
curl_close($ch);

if (!$state->headersSent) {
    // Upstream connect failed or returned no body at all.
    http_response_code(502);
    header('Content-Type: text/plain');
    if ($curlErr !== null) {
        echo 'Upstream fetch failed: ' . htmlspecialchars($curlErr, ENT_QUOTES, 'UTF-8');
    } else {
        echo 'Upstream fetch failed (no response)';
    }
}
