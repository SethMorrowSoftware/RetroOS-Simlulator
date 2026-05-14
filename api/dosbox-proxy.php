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

$host = strtolower($parsed['host']);
if (!in_array($host, $allowed_hosts, true)) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'Host not in allowlist: ' . htmlspecialchars($host, ENT_QUOTES, 'UTF-8');
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: text/plain');
    echo 'php-curl extension is required for the DOSBox CORS proxy';
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
curl_setopt($ch, CURLOPT_TIMEOUT, 300);
curl_setopt($ch, CURLOPT_USERAGENT, 'IlluminatOS-DOSBox-Proxy/1.0');
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_NOBODY, $method === 'HEAD');

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
            // Bundles are immutable artifacts — long browser cache is fine.
            header('Cache-Control: public, max-age=86400, immutable');
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
