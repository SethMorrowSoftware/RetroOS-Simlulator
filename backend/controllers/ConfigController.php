<?php
/**
 * ConfigController - System and per-user configuration management.
 *
 * Provides the 3-tier config merge chain:
 *   defaults.json → system_config (DB) → user_config (DB)
 */
class ConfigController
{
    /**
     * GET /config
     * Returns the fully merged config for the current user.
     *
     * Anonymous callers receive only PUBLIC_SECTIONS (those required for
     * the OS to boot without authentication). Authenticated callers see
     * the full merged config.
     */
    public function getMerged(array $params): void
    {
        Middleware::auth(false)($params);
        $user = currentUser();

        $merged = Config::getMerged($user ? $user['id'] : null);

        if (!$user) {
            $publicSections = array_flip(Config::getPublicSections());
            // Always preserve metadata keys (those starting with "_")
            $filtered = [];
            foreach ($merged as $key => $value) {
                if (isset($publicSections[$key]) || (is_string($key) && str_starts_with($key, '_'))) {
                    $filtered[$key] = $value;
                }
            }
            jsonResponse($filtered);
        }

        jsonResponse($merged);
    }

    /**
     * GET /config/:section
     * Returns a single section of the merged config.
     */
    public function getSection(array $params): void
    {
        Middleware::auth(false)($params);

        $section = $params['section'] ?? '';
        if (!Config::isValidSection($section)) {
            jsonError("Invalid section: $section", 400);
        }

        $user = currentUser();

        // Anonymous callers can only read sections explicitly marked public.
        if (!$user && !Config::isPublicSection($section)) {
            jsonError('Authentication required for this section', 401);
        }

        $merged = Config::getMerged($user ? $user['id'] : null);

        jsonResponse($merged[$section] ?? []);
    }

    /**
     * PUT /config/:section
     * Update a system config section (admin only).
     */
    public function updateSection(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $section = $params['section'] ?? '';
        if (!Config::isValidSection($section)) {
            jsonError("Invalid section: $section", 400);
        }

        $data = input('data');
        if ($data === null || !is_array($data)) {
            jsonError('Missing or invalid "data" field');
        }

        // Validate section data using existing validation logic
        $error = self::validateSection($section, $data);
        if ($error) {
            jsonError($error);
        }

        $user = currentUser();
        Config::saveSystemSection($section, $data, $user['id']);

        AuditLog::log('config.save', $user['id'], 'config', $section, [
            'section' => $section,
        ]);

        // Dispatch event for real-time updates
        EventService::dispatch('config.changed', [
            'section' => $section,
        ], $user['id']);

        jsonResponse(['success' => true, 'section' => $section]);
    }

    /**
     * DELETE /config/:section
     * Reset a system config section to defaults (admin only).
     */
    public function resetSection(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $section = $params['section'] ?? '';
        if (!Config::isValidSection($section)) {
            jsonError("Invalid section: $section", 400);
        }

        Config::resetSystemSection($section);

        $user = currentUser();
        AuditLog::log('config.reset', $user['id'], 'config', $section);

        EventService::dispatch('config.changed', [
            'section' => $section,
            'action'  => 'reset',
        ], $user['id']);

        jsonResponse(['success' => true, 'section' => $section]);
    }

    /**
     * GET /config/user
     * Get all user-level config overrides.
     */
    public function getUserConfig(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $overrides = Config::getAllUserOverrides($user['id']);

        jsonResponse($overrides);
    }

    /**
     * PUT /config/user/:section
     * Save a user-level config override for a section.
     */
    public function updateUserSection(array $params): void
    {
        Middleware::auth(true)($params);

        $section = $params['section'] ?? '';
        if (!Config::isValidSection($section)) {
            jsonError("Invalid section: $section", 400);
        }

        $data = input('data');
        if ($data === null || !is_array($data)) {
            jsonError('Missing or invalid "data" field');
        }

        $user = currentUser();
        Config::saveUserSection($user['id'], $section, $data);

        jsonResponse(['success' => true, 'section' => $section]);
    }

    /**
     * Validate section data (ported from existing api/save.php).
     * Returns error string or null if valid.
     */
    private static function validateSection(string $section, $data): ?string
    {
        switch ($section) {
            case 'branding':
                if (!is_array($data)) return 'Branding must be an object';
                foreach ($data as $key => $value) {
                    if (!is_string($value)) return "Branding.$key must be a string";
                    if (strlen($value) > 200) return "Branding.$key exceeds max length (200)";
                    if ($value !== strip_tags($value)) return "Branding.$key contains HTML";
                }
                break;

            case 'bootTips':
                if (!is_array($data)) return 'Boot tips must be an array';
                foreach ($data as $i => $tip) {
                    if (!is_string($tip)) return "Boot tip #$i must be a string";
                    if (strlen($tip) > 200) return "Boot tip #$i exceeds max length (200)";
                }
                break;

            case 'desktopIcons':
                if (!is_array($data)) return 'Desktop icons must be an array';
                foreach ($data as $i => $icon) {
                    if (!is_array($icon)) return "Desktop icon #$i must be an object";
                    if (empty($icon['id'])) return "Desktop icon #$i missing id";
                    if (empty($icon['label'])) return "Desktop icon #$i missing label";
                    if (isset($icon['url']) && !filter_var($icon['url'], FILTER_VALIDATE_URL)) {
                        return "Desktop icon #$i has invalid URL";
                    }
                }
                break;

            case 'defaults':
                if (!is_array($data)) return 'Defaults must be an object';
                break;

            case 'quickLaunch':
                if (!is_array($data)) return 'Quick launch must be an array';
                foreach ($data as $i => $item) {
                    if (!is_array($item)) return "Quick launch #$i must be an object";
                    if (empty($item['type'])) return "Quick launch #$i missing type";
                    if (isset($item['url']) && !filter_var($item['url'], FILTER_VALIDATE_URL)) {
                        return "Quick launch #$i has invalid URL";
                    }
                }
                break;

            case 'wallpapers':
                if (!is_array($data)) return 'Wallpapers must be an object';
                foreach ($data as $key => $wp) {
                    if (!is_array($wp)) return "Wallpaper '$key' must be an object";
                    if (isset($wp['css'])) {
                        $css = strtolower($wp['css']);
                        if (strpos($css, 'url(') !== false) return "Wallpaper '$key' CSS cannot contain url()";
                        if (strpos($css, 'expression(') !== false) return "Wallpaper '$key' CSS cannot contain expression()";
                        if (strpos($css, 'javascript:') !== false) return "Wallpaper '$key' CSS cannot contain javascript:";
                    }
                }
                break;

            case 'colorSchemes':
                if (!is_array($data)) return 'Color schemes must be an object';
                foreach ($data as $key => $scheme) {
                    if (!is_array($scheme)) return "Color scheme '$key' must be an object";
                    if (isset($scheme['window']) && !preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $scheme['window'])) {
                        return "Color scheme '$key' window color is not valid hex";
                    }
                    if (isset($scheme['titlebar']) && !preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/', $scheme['titlebar'])) {
                        return "Color scheme '$key' titlebar color is not valid hex";
                    }
                }
                break;

            case 'features':
                if (!is_array($data)) return 'Features must be an object';
                foreach ($data as $featureId => $featureCfg) {
                    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $featureId)) {
                        return "Feature ID '$featureId' contains invalid characters";
                    }
                    if (!is_array($featureCfg)) return "Feature '$featureId' must be an object";
                }
                break;

            case 'apps':
                if (!is_array($data)) return 'Apps must be an object';
                if (isset($data['disabledApps'])) {
                    if (!is_array($data['disabledApps'])) return 'disabledApps must be an array';
                    foreach ($data['disabledApps'] as $i => $appId) {
                        if (!is_string($appId)) return "disabledApps #$i must be a string";
                        if (!preg_match('/^[a-zA-Z0-9_-]+$/', $appId)) {
                            return "disabledApps #$i contains invalid characters";
                        }
                    }
                }
                break;

            case 'plugins':
                if (!is_array($data)) return 'Plugins must be an array';
                foreach ($data as $i => $plugin) {
                    if (!is_array($plugin)) return "Plugin #$i must be an object";
                    if (empty($plugin['path']) || !is_string($plugin['path'])) {
                        return "Plugin #$i missing or invalid path";
                    }
                    if (!preg_match('#^\./plugins/features/[a-zA-Z0-9_-]+/index\.js$#', $plugin['path'])) {
                        return "Plugin #$i has untrusted path";
                    }
                }
                break;
        }

        return null;
    }
}
