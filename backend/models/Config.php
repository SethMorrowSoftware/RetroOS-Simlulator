<?php
/**
 * Config - Three-tier config merge: defaults.json → system_config (DB) → user_config (DB).
 *
 * Sections are top-level keys in the merged config (e.g. 'branding', 'features', 'apps').
 */
class Config
{
    /** Sections returned to anonymous (pre-auth) clients so the OS can boot. */
    public const PUBLIC_SECTIONS = [
        'branding', 'bootTips', 'welcomeTips', 'startMenuLabels', 'achievements',
        'easterEggs', 'desktopIcons', 'defaults', 'quickLaunch', 'wallpapers',
        'colorSchemes', 'themes', 'features', 'apps', 'plugins',
    ];

    /** Sections an admin is allowed to write to (whitelist). */
    public const WRITABLE_SECTIONS = [
        'branding', 'bootTips', 'welcomeTips', 'startMenuLabels', 'achievements',
        'easterEggs', 'desktopIcons', 'defaults', 'quickLaunch', 'wallpapers',
        'colorSchemes', 'themes', 'features', 'apps', 'plugins',
    ];

    public static function getPublicSections(): array
    {
        return self::PUBLIC_SECTIONS;
    }

    public static function isPublicSection(string $section): bool
    {
        return in_array($section, self::PUBLIC_SECTIONS, true);
    }

    public static function isValidSection(string $section): bool
    {
        return in_array($section, self::WRITABLE_SECTIONS, true);
    }

    /**
     * Build the merged config for a user.
     */
    public static function getMerged(?int $userId): array
    {
        $defaults = self::readDefaults();
        $systemOverrides = self::loadSystemOverrides();
        $userOverrides = $userId !== null ? self::loadUserOverrides($userId) : [];

        $merged = self::deepMerge($defaults, $systemOverrides);
        $merged = self::deepMerge($merged, $userOverrides);
        return $merged;
    }

    /**
     * Get just the system-level overrides (no defaults, no user).
     */
    public static function loadSystemOverrides(): array
    {
        try {
            $rows = Database::fetchAll('SELECT section, value FROM system_config');
        } catch (\Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $decoded = json_decode($row['value'] ?? 'null', true);
            if (is_array($decoded)) {
                $out[$row['section']] = $decoded;
            }
        }
        return $out;
    }

    /**
     * Get all user-level overrides for a user.
     */
    public static function loadUserOverrides(int $userId): array
    {
        try {
            $rows = Database::fetchAll(
                'SELECT section, value FROM user_config WHERE user_id = ?',
                [$userId]
            );
        } catch (\Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $decoded = json_decode($row['value'] ?? 'null', true);
            if (is_array($decoded)) {
                $out[$row['section']] = $decoded;
            }
        }
        return $out;
    }

    public static function getAllUserOverrides(int $userId): array
    {
        return self::loadUserOverrides($userId);
    }

    /**
     * Save a system config section.
     */
    public static function saveSystemSection(string $section, array $data, int $userId): void
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $existing = Database::fetchOne(
            'SELECT id FROM system_config WHERE section = ?',
            [$section]
        );

        if ($existing) {
            Database::execute(
                'UPDATE system_config SET value = ?, updated_by = ?, updated_at = NOW()
                 WHERE section = ?',
                [$json, $userId, $section]
            );
        } else {
            Database::insert(
                'INSERT INTO system_config (section, value, updated_by, updated_at)
                 VALUES (?, ?, ?, NOW())',
                [$section, $json, $userId]
            );
        }
    }

    /**
     * Reset a system config section to defaults (deletes the override).
     */
    public static function resetSystemSection(string $section): void
    {
        Database::execute('DELETE FROM system_config WHERE section = ?', [$section]);
    }

    /**
     * Save a user-level override section.
     */
    public static function saveUserSection(int $userId, string $section, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $existing = Database::fetchOne(
            'SELECT id FROM user_config WHERE user_id = ? AND section = ?',
            [$userId, $section]
        );

        if ($existing) {
            Database::execute(
                'UPDATE user_config SET value = ?, updated_at = NOW()
                 WHERE user_id = ? AND section = ?',
                [$json, $userId, $section]
            );
        } else {
            Database::insert(
                'INSERT INTO user_config (user_id, section, value, updated_at)
                 VALUES (?, ?, ?, NOW())',
                [$userId, $section, $json]
            );
        }
    }

    /**
     * Read config/defaults.json (the authoritative defaults).
     */
    private static function readDefaults(): array
    {
        $path = __DIR__ . '/../../config/defaults.json';
        if (!file_exists($path)) {
            return [];
        }
        $raw = @file_get_contents($path);
        if ($raw === false) return [];
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    /**
     * Deep-merge two arrays. Nested arrays merge recursively; scalars and lists overwrite.
     */
    private static function deepMerge(array $base, array $override): array
    {
        $out = $base;
        foreach ($override as $key => $value) {
            if (is_array($value) && isset($out[$key]) && is_array($out[$key]) && self::isAssoc($value) && self::isAssoc($out[$key])) {
                $out[$key] = self::deepMerge($out[$key], $value);
            } else {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    private static function isAssoc(array $arr): bool
    {
        if (empty($arr)) return false;
        return array_keys($arr) !== range(0, count($arr) - 1);
    }
}
