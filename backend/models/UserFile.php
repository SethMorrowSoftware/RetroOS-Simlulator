<?php
/**
 * UserFile - Records uploaded files in the virtual filesystem.
 */
class UserFile
{
    public static function findById(int $id): ?array
    {
        return Database::fetchOne('SELECT * FROM user_files WHERE id = ?', [$id]);
    }

    public static function findByUserAndPath(int $userId, string $virtualPath): ?array
    {
        return Database::fetchOne(
            'SELECT * FROM user_files WHERE user_id = ? AND virtual_path = ?',
            [$userId, $virtualPath]
        );
    }

    public static function listByUser(int $userId, ?string $pathPrefix = null, int $limit = 500, int $offset = 0): array
    {
        $sql = 'SELECT * FROM user_files WHERE user_id = ?';
        $params = [$userId];

        if ($pathPrefix !== null && $pathPrefix !== '') {
            $sql .= ' AND virtual_path LIKE ?';
            $params[] = $pathPrefix . '%';
        }

        $sql .= ' ORDER BY created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        return Database::fetchAll($sql, $params);
    }

    public static function quotaUsage(int $userId): int
    {
        return (int) Database::fetchColumn(
            'SELECT COALESCE(SUM(size), 0) FROM user_files WHERE user_id = ?',
            [$userId]
        );
    }

    public static function create(array $data): int
    {
        return Database::insert(
            'INSERT INTO user_files (user_id, virtual_path, original_name, mime_type, size, storage_path, sha256, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [
                $data['user_id'],
                $data['virtual_path'],
                $data['original_name'] ?? '',
                $data['mime_type'] ?? '',
                (int) ($data['size'] ?? 0),
                $data['storage_path'] ?? '',
                $data['sha256'] ?? '',
            ]
        );
    }

    public static function updatePath(int $id, int $userId, string $newPath): bool
    {
        return Database::execute(
            'UPDATE user_files SET virtual_path = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
            [$newPath, $id, $userId]
        ) > 0;
    }

    public static function delete(int $id, int $userId): bool
    {
        return Database::execute(
            'DELETE FROM user_files WHERE id = ? AND user_id = ?',
            [$id, $userId]
        ) > 0;
    }

    public static function toPublic(array $file): array
    {
        return [
            'id'            => (int) $file['id'],
            'virtual_path'  => $file['virtual_path'],
            'original_name' => $file['original_name'] ?? '',
            'mime_type'     => $file['mime_type'] ?? '',
            'size'          => (int) ($file['size'] ?? 0),
            'created_at'    => $file['created_at'] ?? null,
            'updated_at'    => $file['updated_at'] ?? null,
        ];
    }
}
