<?php
/**
 * WebhookDispatcher - Delivers events to outbound HTTP endpoints.
 *
 * Uses cURL with a short timeout. Each delivery is recorded in
 * webhook_deliveries. Signature is HMAC-SHA256 of the body with the
 * webhook's `secret` (if configured), sent in the X-Webhook-Signature header.
 *
 * SSRF defense: every delivery resolves the destination host, rejects any
 * private/loopback/link-local IP, and pins the resolution via CURLOPT_RESOLVE
 * so a malicious DNS server can't return a public IP at validation time
 * and a private IP at delivery time (DNS rebinding).
 *
 * For high-volume production deployments a background worker should drain a
 * queue table; this synchronous version is sufficient for the typical OS
 * event volume and keeps the dependency graph small (just PHP + cURL).
 */
class WebhookDispatcher
{
    public static function deliver(array $webhook, string $eventType, array $payload, ?int $eventId = null): void
    {
        $env = $GLOBALS['_env_cache'] ?? require __DIR__ . '/../env.php';
        $timeout = (int) ($env['webhooks']['request_timeout'] ?? 5);

        $parsed = parse_url($webhook['url'] ?? '');
        $host = $parsed['host'] ?? '';
        $scheme = strtolower($parsed['scheme'] ?? '');
        $port = isset($parsed['port']) ? (int) $parsed['port'] : ($scheme === 'https' ? 443 : 80);

        if ($host === '' || !in_array($scheme, ['http', 'https'], true)) {
            self::recordFailure($webhook, $eventType, 'Invalid webhook URL');
            return;
        }

        $resolution = self::resolveSafe($host);
        if ($resolution === null) {
            self::recordFailure($webhook, $eventType, 'Refusing to deliver: host resolved to a blocked address range');
            return;
        }

        $body = [
            'event_type' => $eventType,
            'payload'    => $payload,
            'event_id'   => $eventId,
            'timestamp'  => date('c'),
        ];

        $json = json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $headers = [
            'Content-Type: application/json',
            'X-Webhook-Event: ' . $eventType,
            'X-Webhook-Event-Id: ' . ($eventId ?? ''),
            'User-Agent: IlluminatOS-Webhook/1.0',
        ];

        if (!empty($webhook['secret'])) {
            $signature = hash_hmac('sha256', $json, $webhook['secret']);
            $headers[] = 'X-Webhook-Signature: sha256=' . $signature;
        }

        $ch = curl_init($webhook['url']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => max(2, (int) ($timeout / 2)),
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            // Pin resolution to the IP we already vetted. Without this the
            // resolver could be invoked again inside libcurl and return a
            // different (private) IP — classic DNS rebinding.
            CURLOPT_RESOLVE        => [sprintf('%s:%d:%s', $host, $port, $resolution)],
        ]);

        $response = curl_exec($ch);
        $statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = curl_error($ch);
        curl_close($ch);

        $success = ($response !== false) && $statusCode >= 200 && $statusCode < 300;

        try {
            Webhook::recordDelivery(
                (int) $webhook['id'],
                $eventType,
                $statusCode ?: null,
                1,
                $success,
                $error ?: null
            );
        } catch (\Throwable $e) {
            error_log('[WebhookDispatcher] Failed to record delivery: ' . $e->getMessage());
        }
    }

    /**
     * Resolve a hostname and return a single safe IP, or null if any resolved
     * IP is in a blocked range. Public so WebhookController can run the same
     * check at create/update time and surface a clear error to the admin.
     *
     * Returning null on ANY private hit (not just all) is intentional: we
     * don't want to silently dodge an attacker who put one public + one
     * private IP in their DNS record hoping libcurl picks the private one.
     */
    public static function resolveSafe(string $host): ?string
    {
        // Literal IP forms — check directly without DNS.
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return self::isSafeIp($host) ? $host : null;
        }

        $ips = @gethostbynamel($host);
        if ($ips === false || $ips === []) {
            // No A record (or DNS failure). Try AAAA.
            $aaaa = @dns_get_record($host, DNS_AAAA);
            if (is_array($aaaa)) {
                foreach ($aaaa as $rec) {
                    if (!empty($rec['ipv6'])) $ips[] = $rec['ipv6'];
                }
            }
        }
        if (empty($ips)) return null;

        $firstSafe = null;
        foreach ($ips as $ip) {
            if (!self::isSafeIp($ip)) return null;
            if ($firstSafe === null) $firstSafe = $ip;
        }
        return $firstSafe;
    }

    /**
     * IP is safe when it's valid AND not in any of:
     *   private (RFC 1918, RFC 4193), loopback, link-local, broadcast,
     *   multicast, reserved/documentation ranges.
     * The FILTER_FLAG_NO_PRIV_RANGE + FILTER_FLAG_NO_RES_RANGE pair covers
     * everything except multicast, which we check separately.
     */
    public static function isSafeIp(string $ip): bool
    {
        $valid = filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        );
        if ($valid === false) return false;

        // Multicast: 224.0.0.0/4 (IPv4) and ff00::/8 (IPv6)
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $first = (int) explode('.', $ip)[0];
            if ($first >= 224) return false;
        } elseif (str_starts_with(strtolower($ip), 'ff')) {
            return false;
        }
        return true;
    }

    private static function recordFailure(array $webhook, string $eventType, string $error): void
    {
        try {
            Webhook::recordDelivery(
                (int) $webhook['id'],
                $eventType,
                null,
                1,
                false,
                $error
            );
        } catch (\Throwable $e) {
            error_log('[WebhookDispatcher] ' . $error . ' (and failed to record): ' . $e->getMessage());
        }
    }
}
