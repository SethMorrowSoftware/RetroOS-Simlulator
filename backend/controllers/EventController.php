<?php
/**
 * EventController - SSE streaming and event dispatch.
 *
 * Provides a Server-Sent Events endpoint for real-time updates
 * to connected browser clients.
 */
class EventController
{
    /**
     * GET /events/stream
     * SSE endpoint — long-lived connection that pushes events to the client.
     *
     * Auth: Authorization: Bearer header only (the frontend streams via
     * fetch(), not EventSource, so headers work and tokens stay out of URLs).
     *
     * Query params:
     *   last_id   - Resume from this event ID (for reconnection)
     */
    public function stream(array $params): void
    {
        // Require authentication for SSE streams to prevent unauthenticated event access.
        Middleware::auth(true)($params);
        $currentUser = currentUser();

        $env = require __DIR__ . '/../env.php';
        $pollInterval = $env['sse']['poll_interval'] ?? 1;
        $maxLifetime = $env['sse']['max_lifetime'] ?? 300;

        // Disable output buffering for streaming
        while (ob_get_level() > 0) {
            ob_end_clean();
        }

        // Set SSE headers
        SSEBroadcaster::setHeaders();

        // Determine starting point
        $lastId = isset($_GET['last_id']) ? (int) $_GET['last_id'] : Event::getLatestId();

        // Send initial connection event
        SSEBroadcaster::sendEvent('connected', [
            'message'  => 'SSE connection established',
            'last_id'  => $lastId,
            'server_time' => date('c'),
        ], (string) $lastId);

        // Set execution time limit for the SSE connection
        set_time_limit($maxLifetime + 10);
        $startTime = time();
        $pingInterval = 15; // Send ping every 15 seconds
        $lastPing = time();

        // Event loop
        while (SSEBroadcaster::isConnected()) {
            // Check max lifetime
            if (time() - $startTime >= $maxLifetime) {
                SSEBroadcaster::sendEvent('reconnect', [
                    'message' => 'Connection lifetime exceeded, please reconnect',
                    'last_id' => $lastId,
                ], (string) $lastId);
                break;
            }

            // Guard against memory leaks in long-running connections
            if (memory_get_usage(true) > 32 * 1024 * 1024) { // 32 MB limit
                SSEBroadcaster::sendEvent('reconnect', [
                    'message' => 'Memory limit approaching, please reconnect',
                    'last_id' => $lastId,
                ], (string) $lastId);
                break;
            }

            // Poll for new events
            $events = Event::since($lastId, 50);

            if (!empty($events)) {
                foreach ($events as $event) {
                    $lastId = (int) $event['id'];

                    // Per-user session lifecycle events (revocation/eviction)
                    // are only relevant — and only safe — for the session's
                    // owner. Without this filter every connected client
                    // learns when and why any other user was logged out.
                    $type = (string) ($event['event_type'] ?? '');
                    if (str_starts_with($type, 'session.')) {
                        $eventUserId = $event['user_id'] ?? ($event['payload']['user_id'] ?? null);
                        if ($eventUserId !== null && (int) $eventUserId !== (int) ($currentUser['id'] ?? 0)) {
                            continue;
                        }
                    }

                    $sanitized = EventService::sanitizeEventRow($event);
                    SSEBroadcaster::sendEvent(
                        $sanitized['event_type'],
                        $sanitized['payload'] ?? [],
                        (string) $event['id']
                    );
                }
            }

            // Send keep-alive ping
            if (time() - $lastPing >= $pingInterval) {
                SSEBroadcaster::sendComment('ping');
                $lastPing = time();
            }

            // Sleep before next poll
            sleep($pollInterval);
        }
    }

    /**
     * POST /events
     * Manually dispatch an event (admin only).
     * Useful for testing webhooks and SSE.
     */
    public function dispatch(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $eventType = input('event_type', '');
        $payload = input('payload', []);

        if (empty($eventType)) {
            jsonError('event_type is required');
        }

        // Validate event type format
        if (!preg_match('/^[a-zA-Z0-9._-]+$/', $eventType)) {
            jsonError('Invalid event_type format');
        }

        $user = currentUser();
        $eventId = EventService::dispatch($eventType, $payload, $user['id']);

        AuditLog::log('event.dispatched', $user['id'], 'event', (string) $eventId, [
            'event_type' => $eventType,
        ]);

        jsonResponse([
            'success'  => true,
            'event_id' => $eventId,
        ]);
    }
}
