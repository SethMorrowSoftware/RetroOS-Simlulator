<?php
/**
 * UserController - Admin endpoints for managing users.
 *
 * Non-admin users use AuthController::me / updateMe instead.
 */
class UserController
{
    /**
     * GET /users
     * Admin-only. Supports ?limit, ?offset, ?role, ?search.
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        $role   = $_GET['role'] ?? null;
        $search = $_GET['search'] ?? null;

        if ($role !== null && $role !== '' && !in_array($role, ['visitor', 'user', 'admin', 'superadmin'], true)) {
            jsonError('Invalid role');
        }

        $users = User::list($limit, $offset, $role ?: null, $search ?: null);
        $total = User::count($role ?: null);

        jsonResponse([
            'users'  => array_map([User::class, 'toPublic'], $users),
            'total'  => $total,
            'limit'  => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * GET /users/:id
     * Admin-only.
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $target = $this->findTarget($params['id'] ?? '');
        jsonResponse(['user' => User::toPublic($target)]);
    }

    /**
     * PUT /users/:id
     * Admin-only. Updates display_name / role / preferences / password.
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $actor = currentUser();
        $target = $this->findTarget($params['id'] ?? '');
        $updates = [];

        $displayName = input('displayName');
        if ($displayName !== null) {
            if (!is_string($displayName) || strlen($displayName) < 2 || strlen($displayName) > 64) {
                jsonError('display_name must be between 2 and 64 characters');
            }
            if (!preg_match('/^[a-zA-Z0-9 _-]+$/', $displayName)) {
                jsonError('display_name contains invalid characters');
            }
            $existing = User::findByDisplayName($displayName);
            if ($existing && (int) $existing['id'] !== (int) $target['id']) {
                jsonError('display_name is already taken', 409);
            }
            $updates['display_name'] = $displayName;
        }

        $role = input('role');
        if ($role !== null) {
            if (!in_array($role, ['user', 'admin', 'superadmin', 'visitor'], true)) {
                jsonError('Invalid role');
            }
            // Only superadmin can grant/remove the admin and superadmin roles
            if (in_array($role, ['admin', 'superadmin'], true) || in_array($target['role'] ?? '', ['admin', 'superadmin'], true)) {
                if (($actor['role'] ?? '') !== 'superadmin') {
                    jsonError('Only superadmin can change admin roles', 403);
                }
            }
            $updates['role'] = $role;
        }

        $preferences = input('preferences');
        if ($preferences !== null) {
            if (!is_array($preferences)) jsonError('preferences must be an object');
            $updates['preferences'] = $preferences;
        }

        $password = input('password');
        if ($password !== null && $password !== '') {
            if (strlen($password) < 8) {
                jsonError('Password must be at least 8 characters');
            }
            $updates['password'] = $password;
        }

        if (empty($updates)) {
            jsonError('No fields to update');
        }

        User::update((int) $target['id'], $updates);

        AuditLog::log('user.updated', (int) $actor['id'], 'user', $target['uuid'], [
            'fields' => array_keys($updates),
        ]);

        EventService::dispatch('user.updated', [
            'uuid'   => $target['uuid'],
            'fields' => array_keys($updates),
        ], (int) $actor['id']);

        $updated = User::findById((int) $target['id']);
        jsonResponse(['user' => User::toPublic($updated)]);
    }

    /**
     * DELETE /users/:id
     * Admin-only. Permanently deletes a user.
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $actor = currentUser();
        $target = $this->findTarget($params['id'] ?? '');

        if ((int) $target['id'] === (int) $actor['id']) {
            jsonError('You cannot delete yourself', 400);
        }

        if (in_array($target['role'] ?? '', ['admin', 'superadmin'], true)) {
            if (($actor['role'] ?? '') !== 'superadmin') {
                jsonError('Only superadmin can delete other admins', 403);
            }
        }

        // Revoke all sessions first so live sockets disconnect
        Session::invalidateAllForUser((int) $target['id'], 'user_deleted');
        User::delete((int) $target['id']);

        AuditLog::log('user.deleted', (int) $actor['id'], 'user', $target['uuid']);

        EventService::dispatch('user.deleted', [
            'uuid' => $target['uuid'],
        ], (int) $actor['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * Allow lookups by numeric id or UUID.
     */
    private function findTarget(string $idOrUuid): array
    {
        $target = null;
        if (ctype_digit($idOrUuid)) {
            $target = User::findById((int) $idOrUuid);
        }
        if (!$target) {
            $target = User::findByUuid($idOrUuid);
        }
        if (!$target) {
            jsonError('User not found', 404);
        }
        return $target;
    }
}
