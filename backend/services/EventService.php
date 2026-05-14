<?php
/**
 * EventService - Dispatch an event to all subscribers.
 *
 * Pipeline:
 *   1. Record event in event_log (Event::record)
 *   2. Fire matching webhooks asynchronously (WebhookDispatcher)
 *   3. SSE pulls from event_log via Event::since() — no extra work here
 *
 * The webhook dispatch is best-effort: a failed POST is recorded as a
 * webhook delivery row but does NOT block the main API response.
 */
class EventService
{
    /**
     * Dispatch an event. Returns the event_log row ID.
     *
     * The full payload is stored in event_log (used by internal consumers
     * such as the /auth/revocations endpoint). External delivery (SSE,
     * webhooks) goes through sanitizeForExternal which strips fields that
     * must not leave the trust boundary — see the keyword list there.
     */
    public static function dispatch(string $eventType, array $payload, ?int $userId = null): int
    {
        $eventId = Event::record($eventType, $payload, $userId);

        $externalPayload = self::sanitizeForExternal($eventType, $payload);

        // Fire webhooks (best-effort, doesn't block)
        try {
            self::fireWebhooks($eventType, $externalPayload, $eventId);
        } catch (\Throwable $e) {
            error_log('[EventService] Webhook dispatch failed: ' . $e->getMessage());
        }

        return $eventId;
    }

    /**
     * Strip fields that must not leak to SSE clients or webhook receivers.
     *
     * Currently:
     *   session.revoked / session.evicted  →  remove `token`
     *
     * `token_fingerprint` (truncated SHA-256) is left in place so consumers
     * can correlate the event with their own session record without seeing
     * the live secret. SSE callers also use this path via sanitizeEventRow.
     */
    public static function sanitizeForExternal(string $eventType, array $payload): array
    {
        if ($eventType === 'session.revoked' || $eventType === 'session.evicted') {
            unset($payload['token']);
        }
        return $payload;
    }

    /**
     * Convenience for SSE streamers: take an event_log row, decode and
     * sanitize the payload in one step. Returns the row with `payload`
     * replaced by the sanitized array.
     */
    public static function sanitizeEventRow(array $row): array
    {
        $payload = $row['payload'] ?? [];
        if (is_string($payload)) {
            $decoded = json_decode($payload, true);
            $payload = is_array($decoded) ? $decoded : [];
        } elseif (!is_array($payload)) {
            $payload = [];
        }
        $row['payload'] = self::sanitizeForExternal($row['event_type'] ?? '', $payload);
        return $row;
    }

    private static function fireWebhooks(string $eventType, array $payload, int $eventId): void
    {
        $env = $GLOBALS['_env_cache'] ?? require __DIR__ . '/../env.php';
        $GLOBALS['_env_cache'] = $env;

        if (empty($env['webhooks']['enabled'])) {
            return;
        }

        try {
            $webhooks = Webhook::findForEventType($eventType);
        } catch (\Throwable $e) {
            return;
        }

        foreach ($webhooks as $webhook) {
            WebhookDispatcher::deliver($webhook, $eventType, $payload, $eventId);
        }
    }
}
