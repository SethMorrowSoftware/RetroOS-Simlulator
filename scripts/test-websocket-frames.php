<?php
/**
 * scripts/test-websocket-frames.php — CLI regression tests for the RFC 6455
 * frame codec used by websocket/server.php.
 *
 * Pure-function coverage only (encode/decode/handshake parsing) — the
 * server's socket loop needs a live process and is exercised by the manual
 * smoke checklist instead.
 *
 * Usage: php scripts/test-websocket-frames.php   (exit 0 = all pass)
 */

require_once __DIR__ . '/../websocket/WebSocketFrame.php';

$pass = 0;
$fail = 0;

function check(string $name, bool $ok, string $detail = ''): void
{
    global $pass, $fail;
    if ($ok) {
        $pass++;
        echo "  PASS  $name\n";
    } else {
        $fail++;
        echo "  FAIL  $name" . ($detail !== '' ? " — $detail" : '') . "\n";
    }
}

/**
 * Build a CLIENT frame (masked) the way a browser would, so decode() sees
 * realistic input. encode() produces server frames (unmasked) by design.
 */
function clientFrame(string $payload, int $opcode = WebSocketFrame::OPCODE_TEXT, bool $fin = true): string
{
    $frame = chr(($fin ? 0x80 : 0x00) | $opcode);
    $len = strlen($payload);
    $maskBit = 0x80;

    if ($len <= 125) {
        $frame .= chr($maskBit | $len);
    } elseif ($len <= 65535) {
        $frame .= chr($maskBit | 126) . pack('n', $len);
    } else {
        $frame .= chr($maskBit | 127) . pack('NN', ($len >> 32) & 0xFFFFFFFF, $len & 0xFFFFFFFF);
    }

    $mask = random_bytes(4);
    $frame .= $mask;
    for ($i = 0; $i < $len; $i++) {
        $frame .= chr(ord($payload[$i]) ^ ord($mask[$i % 4]));
    }
    return $frame;
}

echo "1. Server frame encode → shape\n";
echo str_repeat('-', 50) . "\n";

$f = WebSocketFrame::encode('hello');
check('text frame: FIN set, opcode 1', (ord($f[0]) === 0x81));
check('text frame: server frames unmasked', (ord($f[1]) & 0x80) === 0);
check('text frame: short length byte', (ord($f[1]) & 0x7F) === 5);

$f126 = WebSocketFrame::encode(str_repeat('a', 300));
check('16-bit length marker for 300 bytes', (ord($f126[1]) & 0x7F) === 126);
check('16-bit length value', unpack('n', substr($f126, 2, 2))[1] === 300);

$f127 = WebSocketFrame::encode(str_repeat('b', 70000));
check('64-bit length marker for 70000 bytes', (ord($f127[1]) & 0x7F) === 127);

echo "\n2. Client frame decode (masked)\n";
echo str_repeat('-', 50) . "\n";

foreach ([5, 125, 126, 300, 65535, 70000] as $len) {
    $payload = str_repeat('x', $len);
    $decoded = WebSocketFrame::decode(clientFrame($payload));
    check(
        "roundtrip masked payload of $len bytes",
        is_array($decoded)
            && $decoded['payload'] === $payload
            && $decoded['opcode'] === WebSocketFrame::OPCODE_TEXT
            && $decoded['fin'] === true,
        is_array($decoded) ? 'payload mismatch' : 'decode returned false'
    );
}

$utf8 = "héllo wörld \xF0\x9F\x91\x8B";
$decoded = WebSocketFrame::decode(clientFrame($utf8));
check('UTF-8 payload survives masking roundtrip', is_array($decoded) && $decoded['payload'] === $utf8);

echo "\n3. Incremental parsing (partial buffers)\n";
echo str_repeat('-', 50) . "\n";

$full = clientFrame('partial-test');
check('empty buffer → false', WebSocketFrame::decode('') === false);
check('1-byte buffer → false', WebSocketFrame::decode($full[0]) === false);
check('header-only buffer → false', WebSocketFrame::decode(substr($full, 0, 6)) === false);
check('all-but-one-byte buffer → false', WebSocketFrame::decode(substr($full, 0, -1)) === false);
$decoded = WebSocketFrame::decode($full . clientFrame('next'));
check('decode consumes exactly one frame', is_array($decoded) && $decoded['length'] === strlen($full));

echo "\n4. Fragmentation flags\n";
echo str_repeat('-', 50) . "\n";

$first = WebSocketFrame::decode(clientFrame('frag-', WebSocketFrame::OPCODE_TEXT, false));
check('FIN=0 first fragment reported', is_array($first) && $first['fin'] === false && $first['opcode'] === WebSocketFrame::OPCODE_TEXT);
$cont = WebSocketFrame::decode(clientFrame('end', WebSocketFrame::OPCODE_CONTINUATION, true));
check('continuation frame reported', is_array($cont) && $cont['fin'] === true && $cont['opcode'] === WebSocketFrame::OPCODE_CONTINUATION);

echo "\n5. Control frames\n";
echo str_repeat('-', 50) . "\n";

$close = WebSocketFrame::encodeClose(4001, 'Session expired');
$decodedClose = WebSocketFrame::decode(clientFrame(substr($close, 2), WebSocketFrame::OPCODE_CLOSE));
check(
    'close frame code roundtrip',
    is_array($decodedClose) && unpack('n', substr($decodedClose['payload'], 0, 2))[1] === 4001
);
check(
    'close frame reason roundtrip',
    is_array($decodedClose) && substr($decodedClose['payload'], 2) === 'Session expired'
);

$ping = WebSocketFrame::encodePing('beat');
check('ping frame opcode', (ord($ping[0]) & 0x0F) === WebSocketFrame::OPCODE_PING);
$pong = WebSocketFrame::encodePong('beat');
check('pong frame opcode', (ord($pong[0]) & 0x0F) === WebSocketFrame::OPCODE_PONG);

echo "\n6. Handshake header parsing\n";
echo str_repeat('-', 50) . "\n";

$header = "GET /ws?x=1 HTTP/1.1\r\nHost: example\r\nSec-WebSocket-Protocol: token.abc123def, illuminatos\r\n\r\n";
check('parsePath strips query string', WebSocketFrame::parsePath($header) === '/ws');
check('subprotocol token extracted', WebSocketFrame::parseSubprotocolToken($header) === 'abc123def');

$noToken = "GET /ws HTTP/1.1\r\nSec-WebSocket-Protocol: illuminatos\r\n\r\n";
check('no token entry → null', WebSocketFrame::parseSubprotocolToken($noToken) === null);

$emptyToken = "GET /ws HTTP/1.1\r\nSec-WebSocket-Protocol: token.\r\n\r\n";
check('empty token entry → null', WebSocketFrame::parseSubprotocolToken($emptyToken) === null);

echo "\n" . str_repeat('=', 50) . "\n";
echo "Results: $pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
