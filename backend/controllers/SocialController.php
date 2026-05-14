<?php
/**
 * SocialController - Manages friend relationships.
 *
 * Supports:
 * - Listing friends
 * - Sending and accepting friend requests
 * - Blocking users
 * - Removing friends
 */
class SocialController
{
    /**
     * GET /social/friends
     * List the current user's friends.
     */
    public function listFriends(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $status = $_GET['status'] ?? 'accepted'; // accepted, pending, blocked
        $limit  = max(1, min(100, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        if (!in_array($status, ['accepted', 'pending', 'blocked'], true)) {
            jsonError('status must be one of: accepted, pending, blocked');
        }

        switch ($status) {
            case 'accepted':
                $friends = Friendship::listFriends($user['id'], $limit, $offset);
                $total   = Friendship::countFriends($user['id']);
                break;
            case 'pending':
                $friends = Friendship::listPendingReceived($user['id']);
                $total   = Friendship::countPending($user['id']);
                break;
            case 'blocked':
                $friends = Friendship::listBlocked($user['id']);
                $total   = count($friends);
                break;
            default:
                $friends = [];
                $total = 0;
        }

        jsonResponse([
            'friends' => $friends,
            'status'  => $status,
            'total'   => $total,
            'limit'   => $limit,
            'offset'  => $offset,
        ]);
    }

    /**
     * POST /social/friends/request
     * Send a friend request to another user.
     */
    public function sendRequest(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $targetUuid = input('user_uuid', '');
        if (empty($targetUuid)) {
            jsonError('user_uuid is required');
        }

        $target = User::findByUuid($targetUuid);
        if (!$target) {
            jsonError('User not found', 404);
        }

        if ($target['id'] === $user['id']) {
            jsonError('You cannot send a friend request to yourself', 400);
        }

        // Check for existing relationship in both directions
        $existingStatus = Friendship::getStatus($user['id'], (int) $target['id']);
        $reverseStatus  = Friendship::getStatus((int) $target['id'], $user['id']);

        if ($existingStatus === 'accepted' || $reverseStatus === 'accepted') {
            jsonError('You are already friends with this user', 409);
        }
        if ($existingStatus === 'pending') {
            jsonError('A friend request is already pending', 409);
        }
        if ($reverseStatus === 'pending') {
            // They already sent us a request - auto-accept
            Friendship::accept($user['id'], (int) $target['id']);
            jsonResponse(['success' => true, 'auto_accepted' => true], 200);
            return;
        }
        if ($existingStatus === 'blocked' || $reverseStatus === 'blocked') {
            jsonError('Cannot send a request to this user', 403);
        }

        Friendship::request($user['id'], (int) $target['id']);

        jsonResponse(['success' => true], 201);
    }

    /**
     * POST /social/friends/accept
     * Accept a pending friend request.
     */
    public function acceptRequest(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $requesterUuid = input('user_uuid', '');
        if (empty($requesterUuid)) {
            jsonError('user_uuid of the requester is required');
        }

        $requester = User::findByUuid($requesterUuid);
        if (!$requester) {
            jsonError('User not found', 404);
        }

        // Verify there is a pending request FROM the requester TO us
        $status = Friendship::getStatus((int) $requester['id'], $user['id']);
        if ($status !== 'pending') {
            jsonError('No pending friend request from this user', 400);
        }

        $result = Friendship::accept($user['id'], (int) $requester['id']);
        if (!$result) {
            jsonError('Failed to accept friend request', 500);
        }

        jsonResponse(['success' => true]);
    }

    /**
     * POST /social/friends/block
     * Block a user.
     */
    public function blockUser(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $targetUuid = input('user_uuid', '');
        if (empty($targetUuid)) {
            jsonError('user_uuid is required');
        }

        $target = User::findByUuid($targetUuid);
        if (!$target) {
            jsonError('User not found', 404);
        }

        if ($target['id'] === $user['id']) {
            jsonError('You cannot block yourself', 400);
        }

        Friendship::block($user['id'], (int) $target['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * GET /social/can-message/:uuid
     * Check if the current user can send a DM to the target user.
     * Returns can_message: false if either direction has a block.
     * Used by the WebSocket server to enforce block checks on real-time DMs.
     */
    public function canMessage(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $targetUuid = $params['uuid'] ?? '';
        if (empty($targetUuid)) {
            jsonError('User UUID is required');
        }

        $target = User::findByUuid($targetUuid);
        if (!$target) {
            jsonError('User not found', 404);
        }

        $blocked = Friendship::isBlocked($user['id'], (int) $target['id'])
            || Friendship::isBlocked((int) $target['id'], $user['id']);

        jsonResponse([
            'can_message' => !$blocked,
            'user_uuid'   => $targetUuid,
        ]);
    }

    /**
     * DELETE /social/friends/{userUuid}
     * Remove a friend or cancel a pending request.
     */
    public function removeFriend(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $targetUuid = $params['uuid'] ?? $params['userUuid'] ?? '';
        if (empty($targetUuid)) {
            jsonError('User UUID is required');
        }

        $target = User::findByUuid($targetUuid);
        if (!$target) {
            jsonError('User not found', 404);
        }

        // Verify a relationship exists
        $status = Friendship::getStatus($user['id'], (int) $target['id']);
        $reverseStatus = Friendship::getStatus((int) $target['id'], $user['id']);

        if (!$status && !$reverseStatus) {
            jsonError('No relationship with this user', 404);
        }

        Friendship::remove($user['id'], (int) $target['id']);

        jsonResponse(['success' => true]);
    }
}
