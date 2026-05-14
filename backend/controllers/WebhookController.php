<?php
/**
 * WebhookController - Admin CRUD for outbound webhooks.
 */
class WebhookController
{
    /**
     * GET /webhooks
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhooks = Webhook::list();
        jsonResponse(['webhooks' => $webhooks, 'total' => count($webhooks)]);
    }

    /**
     * GET /webhooks/:id
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhook = $this->findOr404($params['id'] ?? '');
        jsonResponse(['webhook' => $webhook]);
    }

    /**
     * POST /webhooks
     * Required: url, events[]
     * Optional: secret, description, active
     */
    public function create(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $url    = trim((string) input('url', ''));
        $events = input('events', []);
        $secret = trim((string) input('secret', ''));
        $description = trim((string) input('description', ''));
        $active = input('active', true);

        $this->validateUrl($url);
        $this->validateEvents($events);
        if (strlen($description) > 500) jsonError('Description too long (max 500)');

        $actor = currentUser();
        $id = Webhook::create([
            'url'         => $url,
            'secret'      => $secret,
            'events'      => $events,
            'active'      => (bool) $active,
            'description' => $description,
            'created_by'  => (int) $actor['id'],
        ]);

        AuditLog::log('webhook.created', (int) $actor['id'], 'webhook', (string) $id, [
            'url'    => $url,
            'events' => $events,
        ]);

        jsonResponse(['webhook' => Webhook::findById($id)], 201);
    }

    /**
     * PUT /webhooks/:id
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhook = $this->findOr404($params['id'] ?? '');

        $updates = [];
        if (input('url') !== null) {
            $url = (string) input('url');
            $this->validateUrl($url);
            $updates['url'] = $url;
        }
        if (input('events') !== null) {
            $events = input('events');
            $this->validateEvents($events);
            $updates['events'] = $events;
        }
        if (input('secret') !== null) {
            $updates['secret'] = (string) input('secret');
        }
        if (input('description') !== null) {
            $desc = (string) input('description');
            if (strlen($desc) > 500) jsonError('Description too long (max 500)');
            $updates['description'] = $desc;
        }
        if (input('active') !== null) {
            $updates['active'] = (bool) input('active');
        }

        if (empty($updates)) jsonError('No fields to update');

        Webhook::update((int) $webhook['id'], $updates);

        $actor = currentUser();
        AuditLog::log('webhook.updated', (int) $actor['id'], 'webhook', (string) $webhook['id'], [
            'fields' => array_keys($updates),
        ]);

        jsonResponse(['webhook' => Webhook::findById((int) $webhook['id'])]);
    }

    /**
     * DELETE /webhooks/:id
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhook = $this->findOr404($params['id'] ?? '');
        Webhook::delete((int) $webhook['id']);

        $actor = currentUser();
        AuditLog::log('webhook.deleted', (int) $actor['id'], 'webhook', (string) $webhook['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * POST /webhooks/:id/test
     * Fire a synthetic event to verify the webhook receiver responds.
     */
    public function test(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhook = $this->findOr404($params['id'] ?? '');
        $actor = currentUser();

        $payload = [
            'test'         => true,
            'triggered_by' => $actor['display_name'] ?? 'admin',
            'timestamp'    => date('c'),
        ];

        WebhookDispatcher::deliver($webhook, 'webhook.test', $payload);

        // Return the latest delivery row so the UI can show response details
        $deliveries = Webhook::listDeliveries((int) $webhook['id'], 1);

        AuditLog::log('webhook.tested', (int) $actor['id'], 'webhook', (string) $webhook['id']);

        jsonResponse([
            'success'   => true,
            'delivery'  => $deliveries[0] ?? null,
        ]);
    }

    /**
     * GET /webhooks/:id/deliveries
     */
    public function deliveries(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $webhook = $this->findOr404($params['id'] ?? '');
        $limit  = max(1, min(200, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $deliveries = Webhook::listDeliveries((int) $webhook['id'], $limit, $offset);

        jsonResponse([
            'deliveries' => $deliveries,
            'webhook_id' => (int) $webhook['id'],
            'limit'      => $limit,
            'offset'     => $offset,
        ]);
    }

    private function findOr404(string $id): array
    {
        if (!ctype_digit($id)) {
            jsonError('Invalid webhook ID', 400);
        }
        $webhook = Webhook::findById((int) $id);
        if (!$webhook) {
            jsonError('Webhook not found', 404);
        }
        return $webhook;
    }

    private function validateUrl(string $url): void
    {
        if ($url === '') jsonError('url is required');
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            jsonError('Invalid URL');
        }
        $parsed = parse_url($url);
        if (!isset($parsed['scheme']) || !in_array(strtolower($parsed['scheme']), ['http', 'https'], true)) {
            jsonError('URL must use http or https');
        }
        if (strlen($url) > 500) jsonError('URL too long (max 500)');
    }

    private function validateEvents($events): void
    {
        if (!is_array($events) || empty($events)) {
            jsonError('events must be a non-empty array');
        }
        foreach ($events as $i => $event) {
            if (!is_string($event) || $event === '') {
                jsonError("events[$i] must be a non-empty string");
            }
            // Allow exact, wildcard suffix (".*"), and "*"
            if ($event !== '*' && !preg_match('/^[a-zA-Z0-9._-]+(\.\*)?$/', $event)) {
                jsonError("events[$i] has invalid format");
            }
        }
    }
}
