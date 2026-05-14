<?php
/**
 * CampaignController - Server-side campaign registry + lifecycle.
 *
 * Used by the admin panel's Campaign Studio. The OS itself can also fetch
 * the active campaign at boot to seed CampaignManager.js.
 *
 * Routes:
 *   GET    /campaigns                List campaigns
 *   POST   /campaigns                Create a new campaign
 *   GET    /campaigns/:id            Get one campaign (id or slug)
 *   PUT    /campaigns/:id            Update campaign
 *   DELETE /campaigns/:id            Delete campaign
 *   POST   /campaigns/:id/activate   Mark as the active campaign
 *   POST   /campaigns/:id/deactivate Unset active flag
 *   POST   /campaigns/:id/publish    Status -> published (and broadcast)
 *   GET    /campaigns/active         Get the currently active campaign (public read for clients)
 */
class CampaignController
{
    /**
     * GET /campaigns
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));
        $status = $_GET['status'] ?? null;

        if ($status !== null && $status !== '' &&
            !in_array($status, [Campaign::STATUS_DRAFT, Campaign::STATUS_PUBLISHED, Campaign::STATUS_ARCHIVED], true)) {
            jsonError('Invalid status filter');
        }

        $campaigns = Campaign::list($limit, $offset, $status ?: null);
        $total     = Campaign::count($status ?: null);

        jsonResponse([
            'campaigns' => $campaigns,
            'total'     => $total,
            'limit'     => $limit,
            'offset'    => $offset,
        ]);
    }

    /**
     * GET /campaigns/active
     * Public (authenticated): clients fetch this at boot.
     */
    public function active(array $params): void
    {
        Middleware::auth(false)($params);
        $campaign = Campaign::getActive();
        jsonResponse(['campaign' => $campaign]);
    }

    /**
     * GET /campaigns/:id
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        jsonResponse(['campaign' => $campaign]);
    }

    /**
     * POST /campaigns
     * Required: slug, name
     * Optional: version, description, manifest, bindings, status
     */
    public function create(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $slug = trim((string) input('slug', ''));
        $name = trim((string) input('name', ''));
        $version = trim((string) input('version', '1.0.0'));
        $description = trim((string) input('description', ''));
        $manifest = input('manifest', new \stdClass());
        $bindings = input('bindings', new \stdClass());
        $status = input('status', Campaign::STATUS_DRAFT);

        $this->validateSlug($slug);
        if ($name === '' || strlen($name) > 200) jsonError('name is required (max 200)');
        $this->validateVersion($version);
        if (strlen($description) > 2000) jsonError('description too long (max 2000)');
        $this->validateStatus($status);

        if (Campaign::findBySlug($slug)) {
            jsonError('A campaign with that slug already exists', 409);
        }

        // Manifest/bindings need to be objects/arrays — strip HTML in any value
        if ($manifest !== null && !is_array($manifest) && !($manifest instanceof \stdClass)) {
            jsonError('manifest must be an object');
        }
        if ($bindings !== null && !is_array($bindings) && !($bindings instanceof \stdClass)) {
            jsonError('bindings must be an object');
        }

        $actor = currentUser();
        $id = Campaign::create([
            'slug'        => $slug,
            'name'        => $name,
            'version'     => $version,
            'description' => $description,
            'manifest'    => is_array($manifest) ? $manifest : (array) $manifest,
            'bindings'    => is_array($bindings) ? $bindings : (array) $bindings,
            'status'      => $status,
            'created_by'  => (int) $actor['id'],
        ]);

        AuditLog::log('campaign.created', (int) $actor['id'], 'campaign', (string) $id, [
            'slug'    => $slug,
            'status'  => $status,
            'version' => $version,
        ]);

        EventService::dispatch('campaign.created', [
            'id'   => $id,
            'slug' => $slug,
            'name' => $name,
        ], (int) $actor['id']);

        jsonResponse(['campaign' => Campaign::findById($id)], 201);
    }

    /**
     * PUT /campaigns/:id
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        $updates = [];

        if (input('slug') !== null) {
            $slug = (string) input('slug');
            $this->validateSlug($slug);
            $existing = Campaign::findBySlug($slug);
            if ($existing && (int) $existing['id'] !== (int) $campaign['id']) {
                jsonError('Slug already taken', 409);
            }
            $updates['slug'] = $slug;
        }
        if (input('name') !== null) {
            $name = (string) input('name');
            if ($name === '' || strlen($name) > 200) jsonError('name must be 1-200 chars');
            $updates['name'] = $name;
        }
        if (input('version') !== null) {
            $version = (string) input('version');
            $this->validateVersion($version);
            $updates['version'] = $version;
        }
        if (input('description') !== null) {
            $desc = (string) input('description');
            if (strlen($desc) > 2000) jsonError('description too long (max 2000)');
            $updates['description'] = $desc;
        }
        if (input('manifest') !== null) {
            $updates['manifest'] = is_array(input('manifest')) ? input('manifest') : [];
        }
        if (input('bindings') !== null) {
            $updates['bindings'] = is_array(input('bindings')) ? input('bindings') : [];
        }
        if (input('status') !== null) {
            $status = input('status');
            $this->validateStatus($status);
            $updates['status'] = $status;
        }

        if (empty($updates)) jsonError('No fields to update');

        Campaign::update((int) $campaign['id'], $updates);

        $actor = currentUser();
        AuditLog::log('campaign.updated', (int) $actor['id'], 'campaign', (string) $campaign['id'], [
            'fields' => array_keys($updates),
        ]);

        EventService::dispatch('campaign.updated', [
            'id'     => (int) $campaign['id'],
            'slug'   => $campaign['slug'],
            'fields' => array_keys($updates),
        ], (int) $actor['id']);

        jsonResponse(['campaign' => Campaign::findById((int) $campaign['id'])]);
    }

    /**
     * DELETE /campaigns/:id
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        Campaign::delete((int) $campaign['id']);

        $actor = currentUser();
        AuditLog::log('campaign.deleted', (int) $actor['id'], 'campaign', (string) $campaign['id'], [
            'slug' => $campaign['slug'],
        ]);

        EventService::dispatch('campaign.deleted', [
            'id'   => (int) $campaign['id'],
            'slug' => $campaign['slug'],
        ], (int) $actor['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * POST /campaigns/:id/activate
     * Mark the campaign as the live one. Unsets any other active campaign.
     */
    public function activate(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        $ok = Campaign::setActive((int) $campaign['id']);
        if (!$ok) jsonError('Failed to activate campaign', 500);

        $actor = currentUser();
        AuditLog::log('campaign.activated', (int) $actor['id'], 'campaign', (string) $campaign['id']);

        EventService::dispatch('campaign.activated', [
            'id'   => (int) $campaign['id'],
            'slug' => $campaign['slug'],
            'name' => $campaign['name'],
        ], (int) $actor['id']);

        jsonResponse(['campaign' => Campaign::findById((int) $campaign['id'])]);
    }

    /**
     * POST /campaigns/:id/deactivate
     */
    public function deactivate(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        Campaign::update((int) $campaign['id'], ['is_active' => false]);

        $actor = currentUser();
        AuditLog::log('campaign.deactivated', (int) $actor['id'], 'campaign', (string) $campaign['id']);

        EventService::dispatch('campaign.deactivated', [
            'id'   => (int) $campaign['id'],
            'slug' => $campaign['slug'],
        ], (int) $actor['id']);

        jsonResponse(['campaign' => Campaign::findById((int) $campaign['id'])]);
    }

    /**
     * POST /campaigns/:id/publish
     * Convenience: status -> published.
     */
    public function publish(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $campaign = $this->findTarget($params['id'] ?? '');
        Campaign::update((int) $campaign['id'], ['status' => Campaign::STATUS_PUBLISHED]);

        $actor = currentUser();
        AuditLog::log('campaign.published', (int) $actor['id'], 'campaign', (string) $campaign['id']);

        EventService::dispatch('campaign.published', [
            'id'   => (int) $campaign['id'],
            'slug' => $campaign['slug'],
            'name' => $campaign['name'],
        ], (int) $actor['id']);

        jsonResponse(['campaign' => Campaign::findById((int) $campaign['id'])]);
    }

    private function findTarget(string $idOrSlug): array
    {
        $target = null;
        if (ctype_digit($idOrSlug)) {
            $target = Campaign::findById((int) $idOrSlug);
        }
        if (!$target) {
            $target = Campaign::findBySlug($idOrSlug);
        }
        if (!$target) {
            jsonError('Campaign not found', 404);
        }
        return $target;
    }

    private function validateSlug(string $slug): void
    {
        if ($slug === '' || strlen($slug) > 64) {
            jsonError('slug must be 1-64 chars');
        }
        if (!preg_match('/^[a-z0-9][a-z0-9-]*$/', $slug)) {
            jsonError('slug must be lowercase alphanumeric (hyphens allowed)');
        }
    }

    private function validateVersion(string $version): void
    {
        if (!preg_match('/^\d+\.\d+\.\d+([\.\-][a-zA-Z0-9.\-]+)?$/', $version)) {
            jsonError('version must be semver-formatted');
        }
    }

    private function validateStatus($status): void
    {
        if (!is_string($status) || !in_array($status, [
            Campaign::STATUS_DRAFT,
            Campaign::STATUS_PUBLISHED,
            Campaign::STATUS_ARCHIVED,
        ], true)) {
            jsonError('Invalid status (must be draft|published|archived)');
        }
    }
}
