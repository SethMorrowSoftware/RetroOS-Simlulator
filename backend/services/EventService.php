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
     */
    public static function dispatch(string $eventType, array $payload, ?int $userId = null): int
    {
        $eventId = Event::record($eventType, $payload, $userId);

        // Fire webhooks (best-effort, doesn't block)
        try {
            self::fireWebhooks($eventType, $payload, $eventId);
        } catch (\Throwable $e) {
            error_log('[EventService] Webhook dispatch failed: ' . $e->getMessage());
        }

        return $eventId;
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
