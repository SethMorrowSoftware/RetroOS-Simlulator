<?php
/**
 * UserStateController - Per-user OS state snapshot storage.
 *
 * The frontend can push its full OS state here for cross-device sync.
 * The payload is treated as opaque JSON, capped at 1 MB.
 */
class UserStateController
{
    public const MAX_PAYLOAD_BYTES = 1048576; // 1 MB

    /**
     * GET /user-state
     */
    public function get(array $params): void
    {
        $user = currentUser();
        $state = UserState::get((int) $user['id']);

        jsonResponse([
            'data'       => $state['data'],
            'updated_at' => $state['updated_at'],
        ]);
    }

    /**
     * PUT /user-state
     */
    public function update(array $params): void
    {
        $user = currentUser();
        $data = input('data');

        if (!is_array($data)) {
            jsonError('"data" must be an object', 400);
        }

        // Enforce reasonable size limit
        $encoded = json_encode($data);
        if ($encoded === false) jsonError('Failed to encode payload');
        if (strlen($encoded) > self::MAX_PAYLOAD_BYTES) {
            jsonError('Payload exceeds 1 MB limit', 413);
        }

        // Reject prototype-pollution-style keys at any depth
        if ($this->containsForbiddenKey($data)) {
            jsonError('Payload contains forbidden keys (__proto__, constructor, prototype)', 400);
        }

        UserState::update((int) $user['id'], $data);

        jsonResponse([
            'success'    => true,
            'updated_at' => date('c'),
        ]);
    }

    private function containsForbiddenKey($value): bool
    {
        if (!is_array($value)) return false;
        foreach ($value as $k => $v) {
            if (in_array($k, ['__proto__', 'constructor', 'prototype'], true)) {
                return true;
            }
            if (is_array($v) && $this->containsForbiddenKey($v)) {
                return true;
            }
        }
        return false;
    }
}
