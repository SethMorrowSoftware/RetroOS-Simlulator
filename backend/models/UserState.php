<?php
/**
 * UserState - Per-user snapshot of OS state (icons, settings, etc.).
 *
 * Acts as cloud-sync storage: the frontend can read/write its state blob here.
 */
class UserState
{
    /**
     * Get the user's full state snapshot. Returns an empty object if none exists.
     */
    public static function get(int $userId): array
    {
        $row = Database::fetchOne(
            'SELECT data, updated_at FROM user_state WHERE user_id = ?',
            [$userId]
        );
        if (!$row) {
            return ['data' => new \stdClass(), 'updated_at' => null];
        }
        $decoded = json_decode($row['data'] ?? '{}', true);
        return [
            'data'       => is_array($decoded) ? $decoded : [],
            'updated_at' => $row['updated_at'],
        ];
    }

    /**
     * Update the user's state. Replaces the entire blob.
     */
    public static function update(int $userId, array $data): bool
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) return false;

        $existing = Database::fetchOne('SELECT id FROM user_state WHERE user_id = ?', [$userId]);

        if ($existing) {
            Database::execute(
                'UPDATE user_state SET data = ?, updated_at = NOW() WHERE user_id = ?',
                [$json, $userId]
            );
        } else {
            Database::insert(
                'INSERT INTO user_state (user_id, data, updated_at) VALUES (?, ?, NOW())',
                [$userId, $json]
            );
        }
        return true;
    }

    /**
     * Delete a user's state blob (used during account purge).
     */
    public static function delete(int $userId): bool
    {
        return Database::execute('DELETE FROM user_state WHERE user_id = ?', [$userId]) > 0;
    }
}
