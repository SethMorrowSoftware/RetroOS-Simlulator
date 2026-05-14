<?php
/**
 * Campaign - Server-side record of an interactive narrative campaign.
 *
 * Campaign packages can also live entirely on the client (CampaignManager.js
 * loads them from the filesystem). This model adds:
 *
 *   - Persistent server-side registry of installed campaigns
 *   - Manifest + bindings storage for showrunner sync
 *   - Status (draft | published | archived) for admin lifecycle
 *   - "active" flag to mark the campaign currently being run
 *
 * A campaign's per-user play state lives in `campaign_progress`.
 */
class Campaign
{
    public const STATUS_DRAFT     = 'draft';
    public const STATUS_PUBLISHED = 'published';
    public const STATUS_ARCHIVED  = 'archived';

    public static function list(int $limit = 50, int $offset = 0, ?string $status = null): array
    {
        $sql = 'SELECT c.*, u.display_name AS author_name
                FROM campaigns c
                LEFT JOIN users u ON u.id = c.created_by';
        $params = [];

        if ($status !== null && $status !== '') {
            $sql .= ' WHERE c.status = ?';
            $params[] = $status;
        }

        $sql .= ' ORDER BY c.updated_at DESC LIMIT ' . (int) $limit . ' OFFSET ' . (int) $offset;

        return array_map([self::class, 'hydrate'], Database::fetchAll($sql, $params));
    }

    public static function count(?string $status = null): int
    {
        if ($status === null) {
            return (int) Database::fetchColumn('SELECT COUNT(*) FROM campaigns');
        }
        return (int) Database::fetchColumn(
            'SELECT COUNT(*) FROM campaigns WHERE status = ?',
            [$status]
        );
    }

    public static function findById(int $id): ?array
    {
        $row = Database::fetchOne(
            'SELECT c.*, u.display_name AS author_name
             FROM campaigns c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE c.id = ?',
            [$id]
        );
        return $row ? self::hydrate($row) : null;
    }

    public static function findBySlug(string $slug): ?array
    {
        $row = Database::fetchOne(
            'SELECT c.*, u.display_name AS author_name
             FROM campaigns c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE c.slug = ?',
            [$slug]
        );
        return $row ? self::hydrate($row) : null;
    }

    public static function getActive(): ?array
    {
        $row = Database::fetchOne(
            'SELECT c.*, u.display_name AS author_name
             FROM campaigns c
             LEFT JOIN users u ON u.id = c.created_by
             WHERE c.is_active = 1
             ORDER BY c.id DESC
             LIMIT 1'
        );
        return $row ? self::hydrate($row) : null;
    }

    public static function create(array $data): int
    {
        return Database::insert(
            'INSERT INTO campaigns (slug, name, version, description, manifest, bindings, status, is_active, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [
                $data['slug'],
                $data['name'],
                $data['version']     ?? '1.0.0',
                $data['description'] ?? '',
                json_encode($data['manifest'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                json_encode($data['bindings'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
                $data['status']      ?? self::STATUS_DRAFT,
                !empty($data['is_active']) ? 1 : 0,
                $data['created_by']  ?? null,
            ]
        );
    }

    public static function update(int $id, array $data): bool
    {
        $allowed = ['slug', 'name', 'version', 'description', 'status'];
        $sets = [];
        $params = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $data)) {
                $sets[] = "$key = ?";
                $params[] = $data[$key];
            }
        }

        if (array_key_exists('manifest', $data)) {
            $sets[] = 'manifest = ?';
            $params[] = json_encode($data['manifest'], JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('bindings', $data)) {
            $sets[] = 'bindings = ?';
            $params[] = json_encode($data['bindings'], JSON_UNESCAPED_UNICODE);
        }
        if (array_key_exists('is_active', $data)) {
            $sets[] = 'is_active = ?';
            $params[] = !empty($data['is_active']) ? 1 : 0;
        }

        if (empty($sets)) return false;
        $sets[] = 'updated_at = NOW()';
        $params[] = $id;

        return Database::execute(
            'UPDATE campaigns SET ' . implode(', ', $sets) . ' WHERE id = ?',
            $params
        ) > 0;
    }

    /**
     * Mark this campaign as the active one (and unset every other).
     */
    public static function setActive(int $id): bool
    {
        return Database::transaction(function () use ($id) {
            Database::execute('UPDATE campaigns SET is_active = 0 WHERE is_active = 1');
            $affected = Database::execute('UPDATE campaigns SET is_active = 1, status = ?, updated_at = NOW() WHERE id = ?', [self::STATUS_PUBLISHED, $id]);
            return $affected > 0;
        });
    }

    public static function clearActive(): void
    {
        Database::execute('UPDATE campaigns SET is_active = 0 WHERE is_active = 1');
    }

    public static function delete(int $id): bool
    {
        return Database::execute('DELETE FROM campaigns WHERE id = ?', [$id]) > 0;
    }

    private static function hydrate(array $row): array
    {
        $manifest = $row['manifest'] ?? '{}';
        $bindings = $row['bindings'] ?? '{}';
        if (is_string($manifest)) {
            $decoded = json_decode($manifest, true);
            $manifest = is_array($decoded) ? $decoded : [];
        }
        if (is_string($bindings)) {
            $decoded = json_decode($bindings, true);
            $bindings = is_array($decoded) ? $decoded : [];
        }
        return [
            'id'          => (int) $row['id'],
            'slug'        => $row['slug'],
            'name'        => $row['name'],
            'version'     => $row['version'] ?? '1.0.0',
            'description' => $row['description'] ?? '',
            'manifest'    => $manifest,
            'bindings'    => $bindings,
            'status'      => $row['status'] ?? self::STATUS_DRAFT,
            'is_active'   => (bool) ($row['is_active'] ?? false),
            'created_by'  => $row['created_by'] !== null ? (int) $row['created_by'] : null,
            'author_name' => $row['author_name'] ?? null,
            'created_at'  => $row['created_at'] ?? null,
            'updated_at'  => $row['updated_at'] ?? null,
        ];
    }
}
