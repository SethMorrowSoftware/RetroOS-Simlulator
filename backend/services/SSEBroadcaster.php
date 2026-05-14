<?php
/**
 * SSEBroadcaster - Helper for sending Server-Sent Events.
 */
class SSEBroadcaster
{
    public static function setHeaders(): void
    {
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache, no-transform');
        header('X-Accel-Buffering: no');           // disable nginx buffering
        header('Connection: keep-alive');
    }

    /**
     * Send an SSE event. $id is optional and used by clients for resume.
     */
    public static function sendEvent(string $eventType, $data, ?string $id = null): void
    {
        if ($id !== null) {
            echo "id: $id\n";
        }
        echo "event: $eventType\n";

        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            $json = '{}';
        }

        // Split multi-line payloads onto multiple data: lines per the spec
        foreach (explode("\n", $json) as $line) {
            echo 'data: ' . $line . "\n";
        }
        echo "\n";

        if (ob_get_level() > 0) {
            @ob_flush();
        }
        @flush();
    }

    /**
     * Send a comment (keepalive ping). Comments start with ':' per the spec.
     */
    public static function sendComment(string $comment): void
    {
        echo ': ' . $comment . "\n\n";
        if (ob_get_level() > 0) {
            @ob_flush();
        }
        @flush();
    }

    /**
     * True if the client is still connected (no aborted output stream).
     */
    public static function isConnected(): bool
    {
        return connection_status() === CONNECTION_NORMAL;
    }
}
