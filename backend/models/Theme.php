<?php
/**
 * Theme - Custom theme record (wallpaper + color scheme bundle).
 */
class Theme
{
    public static function list(int $limit = 100, int $offset = 0): array
    {
        $rows = Database::fetchAll(
            'SELECT * FROM themes ORDER BY created_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset
        );
        return array_map([self::class, 'hydrate'], $rows);
    }

    public static function count(): int
    {
        return (int) Database::fetchColumn('SELECT COUNT(*) FROM themes');
    }

    public static function findById(int $id): ?array
    {
        $row = Database::fetchOne('SELECT * FROM themes WHERE id = ?', [$id]);
        return $row ? self::hydrate($row) : null;
    }

    public static function findBySlug(string $slug): ?array
    {
        $row = Database::fetchOne('SELECT * FROM themes WHERE slug = ?', [$slug]);
        return $row ? self::hydrate($row) : null;
    }

    public static function create(array $data): int
    {
        return Database::insert(
            'INSERT INTO themes (slug, name, description, definition, created_by, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())',
            [
                $data['slug'],
                $data['name'],
                $data['description'] ?? '',
                json_encode($data['definition'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                $data['created_by'] ?? null,
            ]
        );
    }

    public static function update(int $id, array $data): bool
    {
        $allowed = ['slug', 'name', 'description'];
        $sets = [];
        $params = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $sets[] = "$key = ?";
                $params[] = $data[$key];
            }
        }

        if (array_key_exists('definition', $data)) {
            $sets[] = 'definition = ?';
            $params[] = json_encode($data['definition'], JSON_UNESCAPED_UNICODE);
        }

        if (empty($sets)) return false;
        $params[] = $id;

        return Database::execute(
            'UPDATE themes SET ' . implode(', ', $sets) . ', updated_at = NOW() WHERE id = ?',
            $params
        ) > 0;
    }

    public static function delete(int $id): bool
    {
        return Database::execute('DELETE FROM themes WHERE id = ?', [$id]) > 0;
    }

    private static function hydrate(array $row): array
    {
        $def = $row['definition'] ?? '{}';
        if (is_string($def)) {
            $decoded = json_decode($def, true);
            $def = is_array($decoded) ? $decoded : [];
        }
        return [
            'id'          => (int) $row['id'],
            'slug'        => $row['slug'],
            'name'        => $row['name'],
            'description' => $row['description'] ?? '',
            'definition'  => $def,
            'created_by'  => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'created_at'  => $row['created_at'] ?? null,
            'updated_at'  => $row['updated_at'] ?? null,
        ];
    }
}
