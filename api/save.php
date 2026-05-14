<?php
/**
 * IlluminatOS! Config Save API
 *
 * POST /api/save.php
 * Saves admin configuration changes to overrides.json.
 *
 * Expects JSON body: { "section": "branding", "data": { ... } }
 * Or for full save:  { "config": { ... } }
 */

// Harden session cookie parameters before starting the session
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_samesite', 'Strict');
if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    ini_set('session.cookie_secure', '1');
}

session_start();
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

// Enforce max session age (8 hours) for admin sessions
$maxSessionAge = 28800; // 8 hours in seconds
if (isset($_SESSION['admin_login_time']) && (time() - $_SESSION['admin_login_time'] > $maxSessionAge)) {
    unset($_SESSION['admin_authenticated']);
    unset($_SESSION['admin_login_time']);
    unset($_SESSION['csrf_token']);
}

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Check authentication
if (!($_SESSION['admin_authenticated'] ?? false)) {
    http_response_code(401);
    echo json_encode(['error' => 'Not authenticated']);
    exit;
}

// Enforce max request body size (512 KB) to prevent abuse
$rawBody = file_get_contents('php://input');
$maxBodySize = 512 * 1024; // 512 KB
if (strlen($rawBody) > $maxBodySize) {
    http_response_code(413);
    echo json_encode(['error' => 'Request body too large (max 512 KB)']);
    exit;
}

// Verify CSRF token
$input = json_decode($rawBody, true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON body']);
    exit;
}

$csrfToken = $input['csrfToken'] ?? '';
$sessionToken = $_SESSION['csrf_token'] ?? '';
if (!$sessionToken || !hash_equals($sessionToken, $csrfToken)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid CSRF token']);
    exit;
}

$configDir = __DIR__ . '/../config';
$overridesFile = $configDir . '/overrides.json';
$defaultsFile = $configDir . '/defaults.json';

// Valid config sections
$validSections = [
    'branding', 'welcomeTips', 'startMenuLabels', 'bootTips', 'achievements', 'easterEggs', 'desktopIcons', 'defaults',
    'quickLaunch', 'wallpapers', 'colorSchemes', 'features',
    'filesystem', 'apps', 'plugins'
];

// Load current overrides
$overrides = [];
if (file_exists($overridesFile)) {
    $overridesData = json_decode(file_get_contents($overridesFile), true);
    if ($overridesData !== null) {
        $overrides = $overridesData;
    }
}

$action = $input['action'] ?? 'save-section';
$section = null;

switch ($action) {
    case 'save-section':
        $section = $input['section'] ?? '';
        $data = $input['data'] ?? null;

        if (!in_array($section, $validSections)) {
            http_response_code(400);
            echo json_encode(['error' => "Invalid section: $section"]);
            exit;
        }

        if ($data === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing data']);
            exit;
        }

        // Validate the section data
        $validationError = validateSection($section, $data);
        if ($validationError) {
            http_response_code(400);
            echo json_encode(['error' => $validationError]);
            exit;
        }

        $overrides[$section] = $data;
        break;

    case 'reset-section':
        $section = $input['section'] ?? '';
        if (!in_array($section, $validSections)) {
            http_response_code(400);
            echo json_encode(['error' => "Invalid section: $section"]);
            exit;
        }
        unset($overrides[$section]);
        break;

    case 'save-full':
        $config = $input['config'] ?? null;
        if ($config === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing config']);
            exit;
        }
        // Only keep valid sections
        $filtered = array_intersect_key($config, array_flip($validSections));
        // Validate each section
        foreach ($filtered as $sec => $data) {
            $validationError = validateSection($sec, $data);
            if ($validationError) {
                http_response_code(400);
                echo json_encode(['error' => "Validation failed for section '$sec': $validationError"]);
                exit;
            }
        }
        $overrides = $filtered;
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        exit;
}

// Atomic write: write to temp file then rename
$tmpFile = $overridesFile . '.tmp.' . getmypid();
$json = json_encode($overrides, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

if (file_put_contents($tmpFile, $json, LOCK_EX) === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to write config']);
    exit;
}

if (!rename($tmpFile, $overridesFile)) {
    unlink($tmpFile);
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save config']);
    exit;
}

echo json_encode(['success' => true, 'section' => $section ?? 'full']);

/**
 * Validate section data based on its type.
 * Returns error string or null if valid.
 */
function validateSection(string $section, $data): ?string {
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

        case 'welcomeTips':
            if (!is_array($data)) return 'Welcome tips must be an object';
            if (isset($data['heading'])) {
                if (!is_string($data['heading'])) return 'Welcome tips heading must be a string';
                if ($data['heading'] !== strip_tags($data['heading'])) return 'Welcome tips heading contains HTML';
            }
            if (isset($data['headingIcon'])) {
                if (!is_string($data['headingIcon'])) return 'Welcome tips headingIcon must be a string';
                if (strlen($data['headingIcon']) > 10) return 'Welcome tips headingIcon exceeds max length (10)';
            }
            if (isset($data['items'])) {
                if (!is_array($data['items'])) return 'Welcome tips items must be an array';
                foreach ($data['items'] as $i => $tip) {
                    if (!is_string($tip)) return "Welcome tip #$i must be a string";
                    if (strlen($tip) > 300) return "Welcome tip #$i exceeds max length (300)";
                    if ($tip !== strip_tags($tip)) return "Welcome tip #$i contains HTML";
                }
            }
            break;

        case 'startMenuLabels':
            if (!is_array($data)) return 'Start menu labels must be an object';
            foreach ($data as $key => $value) {
                if (!is_string($value)) return "Start menu label '$key' must be a string";
                if (strlen($value) > 80) return "Start menu label '$key' exceeds max length (80)";
                if ($value !== strip_tags($value)) return "Start menu label '$key' contains HTML";
            }
            break;

        case 'achievements':
            if (!is_array($data)) return 'Achievements must be an array';
            $seenIds = [];
            foreach ($data as $i => $achievement) {
                if (!is_array($achievement)) return "Achievement #$i must be an object";
                if (empty($achievement['id']) || !is_string($achievement['id'])) {
                    return "Achievement #$i missing or invalid id";
                }
                if (!preg_match('/^[a-zA-Z0-9_-]+$/', $achievement['id'])) {
                    return "Achievement #$i has invalid id characters";
                }
                if (isset($seenIds[$achievement['id']])) {
                    return "Duplicate achievement id '{$achievement['id']}'";
                }
                $seenIds[$achievement['id']] = true;

                if (empty($achievement['name']) || !is_string($achievement['name'])) {
                    return "Achievement #$i missing or invalid name";
                }
                if ($achievement['name'] !== strip_tags($achievement['name'])) {
                    return "Achievement #$i name contains HTML";
                }
                if (isset($achievement['desc']) && !is_string($achievement['desc'])) {
                    return "Achievement #$i desc must be a string";
                }
                if (isset($achievement['desc']) && $achievement['desc'] !== strip_tags($achievement['desc'])) {
                    return "Achievement #$i desc contains HTML";
                }
                if (isset($achievement['icon']) && !is_string($achievement['icon'])) {
                    return "Achievement #$i icon must be a string";
                }
                if (strlen($achievement['name']) > 100) return "Achievement #$i name exceeds max length (100)";
                if (isset($achievement['desc']) && strlen($achievement['desc']) > 300) {
                    return "Achievement #$i desc exceeds max length (300)";
                }
            }
            break;

        case 'easterEggs':
            if (!is_array($data)) return 'Easter eggs must be an object';
            if (isset($data['konamiTitle'])) {
                if (!is_string($data['konamiTitle'])) return 'Easter eggs konamiTitle must be a string';
                if ($data['konamiTitle'] !== strip_tags($data['konamiTitle'])) return 'Easter eggs konamiTitle contains HTML';
            }
            if (isset($data['konamiButtonText'])) {
                if (!is_string($data['konamiButtonText'])) return 'Easter eggs konamiButtonText must be a string';
                if ($data['konamiButtonText'] !== strip_tags($data['konamiButtonText'])) return 'Easter eggs konamiButtonText contains HTML';
            }
            if (isset($data['konamiUnlocks'])) {
                if (!is_array($data['konamiUnlocks'])) return 'Easter eggs konamiUnlocks must be an array';
                foreach ($data['konamiUnlocks'] as $i => $unlock) {
                    if (!is_string($unlock)) return "Easter egg unlock #$i must be a string";
                    if (strlen($unlock) > 160) return "Easter egg unlock #$i exceeds max length (160)";
                    if ($unlock !== strip_tags($unlock)) return "Easter egg unlock #$i contains HTML";
                }
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
                    // Block dangerous CSS values
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
                if (isset($featureCfg['enabled']) && !is_bool($featureCfg['enabled'])) {
                    return "Feature '$featureId' enabled must be a boolean";
                }
                if (isset($featureCfg['config']) && !is_array($featureCfg['config'])) {
                    return "Feature '$featureId' config must be an object";
                }
            }
            break;

        case 'filesystem':
            if (!is_array($data)) return 'Filesystem must be an object';
            $validFsKeys = ['welcomeFile', 'documentFiles', 'secretFiles', 'projectFiles'];
            foreach (array_keys($data) as $key) {
                if (!in_array($key, $validFsKeys, true)) {
                    return "Filesystem contains unknown key '$key'";
                }
            }
            if (isset($data['welcomeFile'])) {
                if (!is_array($data['welcomeFile'])) return 'welcomeFile must be an object';
                if (isset($data['welcomeFile']['content']) && !is_string($data['welcomeFile']['content'])) {
                    return 'welcomeFile content must be a string';
                }
            }
            foreach (['documentFiles', 'secretFiles', 'projectFiles'] as $fileKey) {
                if (isset($data[$fileKey])) {
                    if (!is_array($data[$fileKey])) return "$fileKey must be an array";
                    foreach ($data[$fileKey] as $i => $file) {
                        if (!is_array($file)) return "$fileKey #$i must be an object";
                        if (!isset($file['path'])) return "$fileKey #$i missing path";
                        if (!isset($file['content']) || !is_string($file['content'])) {
                            return "$fileKey #$i missing or invalid content";
                        }
                    }
                }
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
            if (isset($data['startMenuOverrides']) && !is_array($data['startMenuOverrides'])) {
                return 'startMenuOverrides must be an object';
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
                    return "Plugin #$i has untrusted path: {$plugin['path']}";
                }
                if (isset($plugin['enabled']) && !is_bool($plugin['enabled'])) {
                    return "Plugin #$i enabled must be a boolean";
                }
            }
            break;
    }

    return null;
}
