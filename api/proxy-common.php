<?php
/**
 * api/proxy-common.php
 *
 * Shared fetch/stream core for the legacy CORS proxies (dosbox-proxy.php,
 * c64-proxy.php). Reuses WebhookDispatcher's SSRF guard (private/loopback/
 * link-local IP rejection + CURLOPT_RESOLVE pinning against DNS rebinding)
 * and — unlike the original implementations — applies the host allowlist
 * and IP check to EVERY redirect hop, not just the initial URL. A redirect
 * from an allowlisted CDN can therefore no longer steer the proxy at
 * internal addresses (cloud metadata, localhost services, ...).
 */

declare(strict_types=1);

require_once __DIR__ . '/../backend/services/WebhookDispatcher.php';

function proxy_fail(int $code, string $message): void
{
    http_response_code($code);
    header('Content-Type: text/plain');
    echo $message;
    exit;
}

/**
 * Resolve a Location header against the URL that produced it.
 * Returns null for unusable values.
 */
function proxy_resolve_location(string $base, string $location): ?string
{
    $location = trim($location);
    if ($location === '') return null;
    if (preg_match('#^https?://#i', $location)) return $location;

    $b = parse_url($base);
    if ($b === false || empty($b['scheme']) || empty($b['host'])) return null;

    $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
    if (str_starts_with($location, '//')) return $b['scheme'] . ':' . $location;
    if (str_starts_with($location, '/')) return $origin . $location;

    $path = $b['path'] ?? '/';
    $slash = strrpos($path, '/');
    $dir = $slash === false ? '/' : substr($path, 0, $slash + 1);
    return $origin . $dir . $location;
}

/**
 * Stream an upstream URL to the client with redirect-hop validation.
 *
 * @param string   $url         Requested upstream URL
 * @param callable $hostAllowed fn(string $lowercaseHost): bool allowlist predicate
 * @param string   $method      'GET' or 'HEAD'
 * @param int      $maxBytes    Response body cap
 * @param string   $userAgent   Upstream User-Agent
 */
function proxy_stream_validated(string $url, callable $hostAllowed, string $method, int $maxBytes, string $userAgent): void
{
    if (!function_exists('curl_init')) {
        proxy_fail(500, 'php-curl extension is required for this proxy');
    }

    $maxRedirects = 5;
    $currentUrl = $url;
    $curlErr = null;
    $state = null;

    for ($hop = 0; ; $hop++) {
        $parsed = parse_url($currentUrl);
        if ($parsed === false || empty($parsed['scheme']) || empty($parsed['host'])) {
            proxy_fail($hop === 0 ? 400 : 502, 'Invalid URL');
        }

        $scheme = strtolower($parsed['scheme']);
        if ($scheme !== 'http' && $scheme !== 'https') {
            proxy_fail($hop === 0 ? 400 : 502, 'Only http/https schemes allowed');
        }

        $host = strtolower($parsed['host']);
        if (!$hostAllowed($host)) {
            proxy_fail($hop === 0 ? 400 : 502, 'Host not in allowlist: ' . htmlspecialchars($host, ENT_QUOTES, 'UTF-8'));
        }

        $ip = WebhookDispatcher::resolveSafe($host);
        if ($ip === null) {
            proxy_fail($hop === 0 ? 400 : 502, 'Host does not resolve to a public address');
        }

        $port = isset($parsed['port']) ? (int) $parsed['port'] : ($scheme === 'https' ? 443 : 80);

        $state = (object) [
            'bytesSent'     => 0,
            'discarded'     => 0,
            'headersSent'   => false,
            'status'        => 0,
            'contentType'   => null,
            'contentLength' => null,
            'location'      => null,
            'aborted'       => false,
        ];

        $ch = curl_init($currentUrl);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false); // hops are followed manually, re-validated each time
        curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_RESOLVE, [sprintf('%s:%d:%s', $host, $port, $ip)]);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15);
        curl_setopt($ch, CURLOPT_TIMEOUT, 300);
        curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        curl_setopt($ch, CURLOPT_NOBODY, $method === 'HEAD');
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: */*']);

        curl_setopt($ch, CURLOPT_HEADERFUNCTION, function ($_ch, $headerLine) use ($state) {
            $len = strlen($headerLine);
            $trimmed = trim($headerLine);

            if (preg_match('#^HTTP/[\d.]+ (\d+)#', $trimmed, $m)) {
                $state->status = (int) $m[1];
                $state->contentType = null;
                $state->contentLength = null;
                $state->location = null;
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
                } elseif ($name === 'location') {
                    $state->location = $value;
                }
            }
            return $len;
        });

        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($_ch, $data) use ($state, $maxBytes) {
            if ($state->aborted) return 0;

            // Redirect bodies are consumed and discarded (bounded) — the
            // client only ever sees the final, validated hop.
            if ($state->status >= 300 && $state->status < 400) {
                $state->discarded += strlen($data);
                if ($state->discarded > 65536) {
                    $state->aborted = true;
                    return 0;
                }
                return strlen($data);
            }

            if (!$state->headersSent) {
                $code = $state->status;
                if ($code >= 200 && $code < 300) {
                    http_response_code(200);
                    header('Content-Type: ' . ($state->contentType ?? 'application/octet-stream'));
                    if ($state->contentLength !== null) {
                        header('Content-Length: ' . $state->contentLength);
                    }
                    // Upstream artifacts are immutable — long browser cache is fine.
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

        curl_exec($ch);
        $curlErr = curl_errno($ch) ? curl_error($ch) : null;
        curl_close($ch);

        $isRedirect = $state->status >= 300 && $state->status < 400 && $state->location !== null;
        if ($isRedirect && !$state->headersSent) {
            if ($hop >= $maxRedirects) {
                proxy_fail(502, 'Too many upstream redirects');
            }
            $next = proxy_resolve_location($currentUrl, $state->location);
            if ($next === null) {
                proxy_fail(502, 'Unusable redirect from upstream');
            }
            $currentUrl = $next;
            continue;
        }

        break;
    }

    if (!$state->headersSent) {
        if ($method === 'HEAD' && $state->status >= 200 && $state->status < 300) {
            // HEAD has no body, so the write callback never ran.
            http_response_code(200);
            header('Content-Type: ' . ($state->contentType ?? 'application/octet-stream'));
            if ($state->contentLength !== null) {
                header('Content-Length: ' . $state->contentLength);
            }
            return;
        }
        if ($state->status > 0) {
            http_response_code($state->status >= 400 ? $state->status : 502);
            header('Content-Type: text/plain');
            echo 'Upstream returned status ' . $state->status;
            return;
        }
        http_response_code(502);
        header('Content-Type: text/plain');
        if ($curlErr !== null) {
            echo 'Upstream fetch failed: ' . htmlspecialchars($curlErr, ENT_QUOTES, 'UTF-8');
        } else {
            echo 'Upstream fetch failed (no response)';
        }
    }
}
