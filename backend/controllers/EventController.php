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
     * Query params:
     *   token     - Auth token (required fallback for EventSource clients)
     *   last_id   - Resume from this event ID (for reconnection)
     */
    public function stream(array $params): void
    {
        // Require authentication for SSE streams to prevent unauthenticated event access.
        Middleware::auth(true)($params);

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
                    SSEBroadcaster::sendEvent(
                        $event['event_type'],
                        $event['payload'] ?? [],
                        (string) $event['id']
                    );
                    $lastId = (int) $event['id'];
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
