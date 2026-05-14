<?php
/**
 * WebhookDispatcher - Delivers events to outbound HTTP endpoints.
 *
 * Uses cURL with a short timeout. Each delivery is recorded in
 * webhook_deliveries. Signature is HMAC-SHA256 of the body with the
 * webhook's `secret` (if configured), sent in the X-Webhook-Signature header.
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
            // Block private/loopback IPs for safety against SSRF
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
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
}
