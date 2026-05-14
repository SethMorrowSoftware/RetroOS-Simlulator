<?php
/**
 * User - Account record.
 *
 * Roles: 'visitor' (anonymous), 'user', 'admin', 'superadmin'
 */
class User
{
    public static function findById(int $id): ?array
    {
        return self::hydrate(Database::fetchOne(
            'SELECT * FROM users WHERE id = ?',
            [$id]
        ));
    }

    public static function findByUuid(string $uuid): ?array
    {
        return self::hydrate(Database::fetchOne(
            'SELECT * FROM users WHERE uuid = ?',
            [$uuid]
        ));
    }

    public static function findByDisplayName(string $name): ?array
    {
        return self::hydrate(Database::fetchOne(
            'SELECT * FROM users WHERE display_name = ?',
            [$name]
        ));
    }

    /**
     * List users with optional filtering.
     */
    public static function list(int $limit = 50, int $offset = 0, ?string $role = null, ?string $search = null): array
    {
        $sql = 'SELECT id, uuid, display_name, role, is_anonymous, created_at, last_seen FROM users';
        $params = [];
        $conds = [];

        if ($role !== null) {
            $conds[] = 'role = ?';
            $params[] = $role;
        }
        if ($search !== null && $search !== '') {
            $conds[] = 'display_name LIKE ?';
            $params[] = '%' . $search . '%';
        }

        if (!empty($conds)) {
            $sql .= ' WHERE ' . implode(' AND ', $conds);
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        $rows = Database::fetchAll($sql, $params);
        return array_map([self::class, 'hydrate'], $rows);
    }

    /**
     * Count users, optionally by role.
     */
    public static function count(?string $role = null): int
    {
        if ($role === null) {
            return (int) Database::fetchColumn('SELECT COUNT(*) FROM users');
        }
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM users WHERE role = ?',
            [$role]
        );
    }

    /**
     * Count users active within the last N minutes (by last_seen).
     */
    public static function countActive(int $minutes): int
    {
        $cutoff = date('Y-m-d H:i:s', time() - $minutes * 60);
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM users WHERE last_seen >= ?',
            [$cutoff]
        );
    }

    /**
     * Create an anonymous user. Returns the new row.
     */
    public static function createAnonymous(): array
    {
        $uuid = generateUuid();
        $displayName = 'Guest_' . substr(bin2hex(random_bytes(4)), 0, 6);

        $id = Database::insert(
            'INSERT INTO users (uuid, display_name, role, is_anonymous, created_at, last_seen)
             VALUES (?, ?, ?, ?, NOW(), NOW())',
            [$uuid, $displayName, 'visitor', 1]
        );

        return self::findById($id);
    }

    /**
     * Upgrade an anonymous user to a registered account.
     */
    public static function upgrade(int $userId, string $displayName, string $password): bool
    {
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
        $affected = Database::execute(
            'UPDATE users SET display_name = ?, password_hash = ?, role = ?, is_anonymous = 0, upgraded_at = NOW()
             WHERE id = ? AND is_anonymous = 1',
            [$displayName, $hash, 'user', $userId]
        );
        return $affected > 0;
    }

    /**
     * Register a brand-new (non-anonymous) account directly.
     */
    public static function register(string $displayName, string $password, string $role = 'user'): array
    {
        $uuid = generateUuid();
        $hash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

        $id = Database::insert(
            'INSERT INTO users (uuid, display_name, password_hash, role, is_anonymous, created_at, last_seen)
             VALUES (?, ?, ?, ?, 0, NOW(), NOW())',
            [$uuid, $displayName, $hash, $role]
        );

        return self::findById($id);
    }

    /**
     * Update mutable fields. $fields keys: display_name, role, preferences, password.
     */
    public static function update(int $userId, array $fields): bool
    {
        $allowed = ['display_name', 'role', 'preferences'];
        $sets = [];
        $params = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $fields)) {
                $value = $fields[$key];
                if ($key === 'preferences' && is_array($value)) {
                    $value = json_encode($value);
                }
                $sets[] = "$key = ?";
                $params[] = $value;
            }
        }

        if (array_key_exists('password', $fields) && is_string($fields['password']) && $fields['password'] !== '') {
            $sets[] = 'password_hash = ?';
            $params[] = password_hash($fields['password'], PASSWORD_BCRYPT, ['cost' => 12]);
        }

        if (empty($sets)) {
            return false;
        }

        $params[] = $userId;
        $affected = Database::execute(
            'UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        );

        return $affected > 0;
    }

    /**
     * Touch last_seen.
     */
    public static function touch(int $userId): void
    {
        Database::execute(
            'UPDATE users SET last_seen = NOW() WHERE id = ?',
            [$userId]
        );
    }

    /**
     * Delete a user and cascade their session/audit rows where relevant.
     */
    public static function delete(int $userId): bool
    {
        // Cascade is defined at the schema level. Just delete the user row.
        return Database::execute('DELETE FROM users WHERE id = ?', [$userId]) > 0;
    }

    /**
     * Convert a user row to its public-safe representation (no password hash, etc.).
     */
    public static function toPublic(?array $user): ?array
    {
        if ($user === null) return null;
        $prefs = $user['preferences'] ?? null;
        if (is_string($prefs)) {
            $decoded = json_decode($prefs, true);
            $prefs = is_array($decoded) ? $decoded : null;
        }
        return [
            'id'           => (int) $user['id'],
            'uuid'         => $user['uuid'],
            'display_name' => $user['display_name'],
            'role'         => $user['role'] ?? 'user',
            'is_anonymous' => (bool) ($user['is_anonymous'] ?? false),
            'preferences'  => $prefs,
            'created_at'   => $user['created_at'] ?? null,
            'last_seen'    => $user['last_seen'] ?? null,
        ];
    }

    /**
     * Normalize a raw DB row.
     */
    private static function hydrate(?array $row): ?array
    {
        if ($row === null) return null;
        $row['is_anonymous'] = (bool) ($row['is_anonymous'] ?? 0);
        return $row;
    }
}
