<?php
/**
 * ThemeController - CRUD for custom themes (wallpaper + color scheme bundles).
 *
 * Themes are readable by any authenticated user (so the client can apply
 * them); only admins can create/modify.
 */
class ThemeController
{
    /**
     * GET /themes
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $themes = Theme::list($limit, $offset);
        jsonResponse([
            'themes' => $themes,
            'total'  => Theme::count(),
            'limit'  => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * GET /themes/:id
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);

        $theme = $this->findTarget($params['id'] ?? '');
        jsonResponse(['theme' => $theme]);
    }

    /**
     * POST /themes (admin only)
     * Required: slug, name, definition
     */
    public function create(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $slug = trim((string) input('slug', ''));
        $name = trim((string) input('name', ''));
        $description = trim((string) input('description', ''));
        $definition = input('definition', []);

        $this->validateSlug($slug);
        if ($name === '' || strlen($name) > 100) jsonError('name is required (max 100)');
        if (strlen($description) > 500) jsonError('description too long (max 500)');
        $this->validateDefinition($definition);

        if (Theme::findBySlug($slug)) {
            jsonError('A theme with that slug already exists', 409);
        }

        $actor = currentUser();
        $id = Theme::create([
            'slug'        => $slug,
            'name'        => $name,
            'description' => $description,
            'definition'  => $definition,
            'created_by'  => (int) $actor['id'],
        ]);

        AuditLog::log('theme.created', (int) $actor['id'], 'theme', (string) $id, [
            'slug' => $slug,
        ]);

        EventService::dispatch('theme.created', [
            'id'   => $id,
            'slug' => $slug,
            'name' => $name,
        ], (int) $actor['id']);

        jsonResponse(['theme' => Theme::findById($id)], 201);
    }

    /**
     * PUT /themes/:id (admin only)
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $theme = $this->findTarget($params['id'] ?? '');

        $updates = [];
        if (input('slug') !== null) {
            $slug = (string) input('slug');
            $this->validateSlug($slug);
            $existing = Theme::findBySlug($slug);
            if ($existing && (int) $existing['id'] !== (int) $theme['id']) {
                jsonError('A theme with that slug already exists', 409);
            }
            $updates['slug'] = $slug;
        }
        if (input('name') !== null) {
            $name = (string) input('name');
            if ($name === '' || strlen($name) > 100) jsonError('name must be 1-100 chars');
            $updates['name'] = $name;
        }
        if (input('description') !== null) {
            $desc = (string) input('description');
            if (strlen($desc) > 500) jsonError('description too long (max 500)');
            $updates['description'] = $desc;
        }
        if (input('definition') !== null) {
            $def = input('definition');
            $this->validateDefinition($def);
            $updates['definition'] = $def;
        }

        if (empty($updates)) jsonError('No fields to update');

        Theme::update((int) $theme['id'], $updates);

        $actor = currentUser();
        AuditLog::log('theme.updated', (int) $actor['id'], 'theme', (string) $theme['id'], [
            'fields' => array_keys($updates),
        ]);

        jsonResponse(['theme' => Theme::findById((int) $theme['id'])]);
    }

    /**
     * DELETE /themes/:id (admin only)
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $theme = $this->findTarget($params['id'] ?? '');
        Theme::delete((int) $theme['id']);

        $actor = currentUser();
        AuditLog::log('theme.deleted', (int) $actor['id'], 'theme', (string) $theme['id']);

        EventService::dispatch('theme.deleted', [
            'id'   => (int) $theme['id'],
            'slug' => $theme['slug'],
        ], (int) $actor['id']);

        jsonResponse(['success' => true]);
    }

    private function findTarget(string $idOrSlug): array
    {
        $target = null;
        if (ctype_digit($idOrSlug)) {
            $target = Theme::findById((int) $idOrSlug);
        }
        if (!$target) {
            $target = Theme::findBySlug($idOrSlug);
        }
        if (!$target) {
            jsonError('Theme not found', 404);
        }
        return $target;
    }

    private function validateSlug(string $slug): void
    {
        if ($slug === '' || strlen($slug) > 60) {
            jsonError('slug must be 1-60 chars');
        }
        if (!preg_match('/^[a-z0-9][a-z0-9-]*$/', $slug)) {
            jsonError('slug must be lowercase alphanumeric (hyphens allowed)');
        }
    }

    private function validateDefinition($def): void
    {
        if (!is_array($def)) {
            jsonError('definition must be an object');
        }
        // Reject HTML in any string value to neutralise XSS via theme injection
        array_walk_recursive($def, function ($v) {
            if (is_string($v) && $v !== strip_tags($v)) {
                jsonError('definition values must not contain HTML');
            }
        });
        // Reject obviously hostile CSS keywords
        $flat = json_encode($def);
        if ($flat !== false) {
            $lc = strtolower($flat);
            if (str_contains($lc, 'javascript:') || str_contains($lc, 'expression(')) {
                jsonError('definition contains disallowed CSS');
            }
        }
    }
}
