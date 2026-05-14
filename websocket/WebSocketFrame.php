<?php
/**
 * WebSocket Frame Encoder/Decoder
 *
 * Implements RFC 6455 WebSocket frame parsing and construction.
 * Handles text frames, close frames, ping/pong, and fragmentation.
 */

class WebSocketFrame
{
    // Opcodes
    const OPCODE_CONTINUATION = 0x0;
    const OPCODE_TEXT = 0x1;
    const OPCODE_BINARY = 0x2;
    const OPCODE_CLOSE = 0x8;
    const OPCODE_PING = 0x9;
    const OPCODE_PONG = 0xA;

    /**
     * Perform the WebSocket handshake on an incoming HTTP request.
     *
     * @param resource $socket The client socket
     * @return string|false The raw HTTP request string, or false on failure
     */
    public static function performHandshake($socket): string|false
    {
        $header = '';
        $deadline = microtime(true) + 5.0; // 5 second timeout

        while (microtime(true) < $deadline) {
            $data = @fread($socket, 4096);
            if ($data === false || $data === '') {
                if (feof($socket)) return false;
                usleep(1000);
                continue;
            }
            $header .= $data;
            if (str_contains($header, "\r\n\r\n")) {
                break;
            }
        }

        if (!str_contains($header, "\r\n\r\n")) {
            return false;
        }

        // Parse the Sec-WebSocket-Key
        if (!preg_match('/Sec-WebSocket-Key:\s*(.+)\r\n/i', $header, $matches)) {
            return false;
        }

        $key = trim($matches[1]);
        $acceptKey = base64_encode(sha1($key . '258EAFA5-E914-47DA-95CA-5AB5DC65C5B3', true));

        $response = "HTTP/1.1 101 Switching Protocols\r\n" .
            "Upgrade: websocket\r\n" .
            "Connection: Upgrade\r\n" .
            "Sec-WebSocket-Accept: $acceptKey\r\n\r\n";

        @fwrite($socket, $response);

        return $header;
    }

    /**
     * Parse the query string from a WebSocket HTTP upgrade request.
     *
     * @param string $httpHeader Raw HTTP header string
     * @return array Parsed query parameters
     */
    public static function parseQueryParams(string $httpHeader): array
    {
        if (!preg_match('/GET\s+([^\s]+)\s+HTTP/i', $httpHeader, $matches)) {
            return [];
        }

        $urlParts = parse_url($matches[1]);
        if (!isset($urlParts['query'])) return [];

        parse_str($urlParts['query'], $params);
        return $params;
    }

    /**
     * Parse the request path from a WebSocket HTTP upgrade request.
     *
     * @param string $httpHeader Raw HTTP header string
     * @return string Request path
     */
    public static function parsePath(string $httpHeader): string
    {
        if (!preg_match('/GET\s+([^\s?]+)/i', $httpHeader, $matches)) {
            return '/';
        }
        return $matches[1];
    }

    /**
     * Parse Authorization header from HTTP upgrade request.
     *
     * @param string $httpHeader Raw HTTP header
     * @return string|null Bearer token or null
     */
    public static function parseAuthHeader(string $httpHeader): ?string
    {
        if (preg_match('/Authorization:\s*Bearer\s+(\S+)\r\n/i', $httpHeader, $matches)) {
            return trim($matches[1]);
        }
        return null;
    }

    /**
     * Parse a token from the Sec-WebSocket-Protocol header.
     *
     * Browsers don't let JS set arbitrary headers on the upgrade request,
     * but they DO let JS pass a subprotocol list as the second argument
     * to `new WebSocket(url, protocols)`. We use the convention
     * `token.<JWT>` so the token never appears in the URL (where it would
     * leak into proxy logs, browser history, and server access logs).
     *
     * The corresponding selected subprotocol must be echoed back in the
     * 101 response, but for `token.*` we treat the whole entry as opaque
     * and don't echo it (it's not a real protocol).
     *
     * @param string $httpHeader Raw HTTP header
     * @return string|null Token portion of a `token.<value>` entry, or null
     */
    public static function parseSubprotocolToken(string $httpHeader): ?string
    {
        if (!preg_match('/Sec-WebSocket-Protocol:\s*([^\r\n]+)/i', $httpHeader, $matches)) {
            return null;
        }
        $entries = array_map('trim', explode(',', $matches[1]));
        foreach ($entries as $entry) {
            if (strncmp($entry, 'token.', 6) === 0) {
                $tok = substr($entry, 6);
                return $tok !== '' ? $tok : null;
            }
        }
        return null;
    }

    /**
     * Decode a WebSocket frame from raw data.
     *
     * @param string $data Raw data from socket
     * @return array{opcode: int, payload: string, fin: bool, length: int}|false
     */
    public static function decode(string $data): array|false
    {
        $len = strlen($data);
        if ($len < 2) return false;

        $firstByte = ord($data[0]);
        $secondByte = ord($data[1]);

        $fin = ($firstByte >> 7) & 1;
        $opcode = $firstByte & 0x0F;
        $masked = ($secondByte >> 7) & 1;
        $payloadLength = $secondByte & 0x7F;

        $offset = 2;

        if ($payloadLength === 126) {
            if ($len < 4) return false;
            $payloadLength = unpack('n', substr($data, 2, 2))[1];
            $offset = 4;
        } elseif ($payloadLength === 127) {
            if ($len < 10) return false;
            $payloadLength = self::unpackUint64(substr($data, 2, 8));
            $offset = 10;
        }

        if ($masked) {
            if ($len < $offset + 4) return false;
            $mask = substr($data, $offset, 4);
            $offset += 4;
        }

        if ($len < $offset + $payloadLength) return false;

        $payload = substr($data, $offset, $payloadLength);

        if ($masked) {
            for ($i = 0; $i < $payloadLength; $i++) {
                $payload[$i] = chr(ord($payload[$i]) ^ ord($mask[$i % 4]));
            }
        }

        return [
            'opcode' => $opcode,
            'payload' => $payload,
            'fin' => (bool)$fin,
            'length' => $offset + $payloadLength,
        ];
    }

    /**
     * Encode data into a WebSocket frame (server -> client, unmasked).
     *
     * @param string $payload The payload data
     * @param int $opcode Frame opcode (default: text)
     * @return string Encoded frame
     */
    public static function encode(string $payload, int $opcode = self::OPCODE_TEXT): string
    {
        $length = strlen($payload);
        $frame = chr(0x80 | $opcode); // FIN + opcode

        if ($length <= 125) {
            $frame .= chr($length);
        } elseif ($length <= 65535) {
            $frame .= chr(126) . pack('n', $length);
        } else {
            $frame .= chr(127) . self::packUint64($length);
        }

        $frame .= $payload;
        return $frame;
    }

    /**
     * Encode a close frame with status code and reason.
     *
     * @param int $code Close status code
     * @param string $reason Close reason
     * @return string Encoded close frame
     */
    public static function encodeClose(int $code = 1000, string $reason = ''): string
    {
        $payload = pack('n', $code) . $reason;
        return self::encode($payload, self::OPCODE_CLOSE);
    }

    /**
     * Encode a ping frame.
     *
     * @param string $payload Optional ping payload
     * @return string Encoded ping frame
     */
    public static function encodePing(string $payload = ''): string
    {
        return self::encode($payload, self::OPCODE_PING);
    }

    /**
     * Encode a pong frame.
     *
     * @param string $payload Pong payload (should echo the ping payload)
     * @return string Encoded pong frame
     */
    public static function encodePong(string $payload = ''): string
    {
        return self::encode($payload, self::OPCODE_PONG);
    }

    /**
     * Decode a network-order unsigned 64-bit integer.
     */
    private static function unpackUint64(string $bytes): int
    {
        $parts = unpack('Nhigh/Nlow', $bytes);
        if ($parts === false) {
            return 0;
        }

        return ((int)$parts['high'] << 32) | (int)$parts['low'];
    }

    /**
     * Encode an unsigned 64-bit integer in network byte order.
     */
    private static function packUint64(int $value): string
    {
        $high = ($value >> 32) & 0xFFFFFFFF;
        $low = $value & 0xFFFFFFFF;
        return pack('NN', $high, $low);
    }
}
