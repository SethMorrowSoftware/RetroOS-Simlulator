<?php
/**
 * TimelineController - Scheduled / queued narrative events for showrunner ops.
 *
 * Routes:
 *   GET    /timeline                    List timeline entries
 *   POST   /timeline                    Schedule a new entry
 *   GET    /timeline/:id                Get one entry
 *   PUT    /timeline/:id                Update entry
 *   DELETE /timeline/:id                Cancel/delete entry
 *   POST   /timeline/:id/fire           Fire an entry NOW (manual trigger)
 *   POST   /timeline/run-due            Process all scheduled entries that are due
 */
class TimelineController
{
    /**
     * GET /timeline?campaign_id=&state=&limit=&offset=
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $limit       = max(1, min(200, (int) ($_GET['limit'] ?? 100)));
        $offset      = max(0, (int) ($_GET['offset'] ?? 0));
        $campaignId  = isset($_GET['campaign_id']) ? (int) $_GET['campaign_id'] : null;
        $state       = $_GET['state'] ?? null;

        if ($state !== null && $state !== '' &&
            !in_array($state, [TimelineEntry::STATE_SCHEDULED, TimelineEntry::STATE_FIRED, TimelineEntry::STATE_CANCELLED], true)) {
            jsonError('Invalid state filter');
        }

        $entries = TimelineEntry::list($campaignId, $state ?: null, $limit, $offset);
        $total   = TimelineEntry::count($campaignId, $state ?: null);

        jsonResponse([
            'entries' => $entries,
            'total'   => $total,
            'limit'   => $limit,
            'offset'  => $offset,
        ]);
    }

    /**
     * GET /timeline/:id
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $entry = $this->findOr404($params['id'] ?? '');
        jsonResponse(['entry' => $entry]);
    }

    /**
     * POST /timeline
     * Required: event_type
     * Optional: campaign_id, label, payload, scheduled_at (ISO 8601)
     */
    public function create(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $eventType  = trim((string) input('event_type', ''));
        $label      = trim((string) input('label', ''));
        $payload    = input('payload', []);
        $scheduled  = input('scheduled_at');
        $campaignId = input('campaign_id');

        if ($eventType === '' || !preg_match('/^[a-zA-Z0-9._-]+$/', $eventType)) {
            jsonError('event_type is required (alphanumeric, dots, dashes)');
        }
        if (strlen($label) > 200) jsonError('label too long (max 200)');
        if (!is_array($payload)) jsonError('payload must be an object');

        if ($campaignId !== null && $campaignId !== '') {
            if (!ctype_digit((string) $campaignId)) jsonError('campaign_id must be numeric');
            $campaignId = (int) $campaignId;
            if (!Campaign::findById($campaignId)) {
                jsonError('Campaign not found', 404);
            }
        } else {
            $campaignId = null;
        }

        $scheduledAt = $this->normalizeDateTime($scheduled);

        $actor = currentUser();
        $id = TimelineEntry::create([
            'campaign_id'  => $campaignId,
            'label'        => $label,
            'event_type'   => $eventType,
            'payload'      => $payload,
            'scheduled_at' => $scheduledAt,
            'state'        => TimelineEntry::STATE_SCHEDULED,
            'created_by'   => (int) $actor['id'],
        ]);

        AuditLog::log('timeline.created', (int) $actor['id'], 'timeline', (string) $id, [
            'event_type'   => $eventType,
            'scheduled_at' => $scheduledAt,
        ]);

        jsonResponse(['entry' => TimelineEntry::findById($id)], 201);
    }

    /**
     * PUT /timeline/:id
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $entry = $this->findOr404($params['id'] ?? '');
        if ($entry['state'] === TimelineEntry::STATE_FIRED) {
            jsonError('Cannot edit a fired entry', 409);
        }

        $updates = [];
        if (input('label') !== null) {
            $label = (string) input('label');
            if (strlen($label) > 200) jsonError('label too long');
            $updates['label'] = $label;
        }
        if (input('event_type') !== null) {
            $type = (string) input('event_type');
            if ($type === '' || !preg_match('/^[a-zA-Z0-9._-]+$/', $type)) {
                jsonError('Invalid event_type');
            }
            $updates['event_type'] = $type;
        }
        if (input('payload') !== null) {
            $p = input('payload');
            if (!is_array($p)) jsonError('payload must be an object');
            $updates['payload'] = $p;
        }
        if (array_key_exists('scheduled_at', $GLOBALS['requestBody'] ?? [])) {
            $updates['scheduled_at'] = $this->normalizeDateTime(input('scheduled_at'));
        }
        if (input('state') !== null) {
            $state = input('state');
            if (!in_array($state, [TimelineEntry::STATE_SCHEDULED, TimelineEntry::STATE_CANCELLED], true)) {
                jsonError('state must be scheduled|cancelled');
            }
            $updates['state'] = $state;
        }
        if (array_key_exists('campaign_id', $GLOBALS['requestBody'] ?? [])) {
            $cid = input('campaign_id');
            if ($cid === null || $cid === '') {
                $updates['campaign_id'] = null;
            } else {
                if (!ctype_digit((string) $cid)) jsonError('campaign_id must be numeric');
                if (!Campaign::findById((int) $cid)) jsonError('Campaign not found', 404);
                $updates['campaign_id'] = (int) $cid;
            }
        }

        if (empty($updates)) jsonError('No fields to update');

        TimelineEntry::update((int) $entry['id'], $updates);

        $actor = currentUser();
        AuditLog::log('timeline.updated', (int) $actor['id'], 'timeline', (string) $entry['id'], [
            'fields' => array_keys($updates),
        ]);

        jsonResponse(['entry' => TimelineEntry::findById((int) $entry['id'])]);
    }

    /**
     * DELETE /timeline/:id
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $entry = $this->findOr404($params['id'] ?? '');
        TimelineEntry::delete((int) $entry['id']);

        $actor = currentUser();
        AuditLog::log('timeline.deleted', (int) $actor['id'], 'timeline', (string) $entry['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * POST /timeline/:id/fire
     */
    public function fire(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $entry = $this->findOr404($params['id'] ?? '');
        if ($entry['state'] === TimelineEntry::STATE_FIRED) {
            jsonError('Entry already fired', 409);
        }
        if ($entry['state'] === TimelineEntry::STATE_CANCELLED) {
            jsonError('Cannot fire a cancelled entry', 409);
        }

        $eventId = $this->fireEntry($entry);

        $actor = currentUser();
        AuditLog::log('timeline.fired', (int) $actor['id'], 'timeline', (string) $entry['id'], [
            'event_type' => $entry['event_type'],
            'event_id'   => $eventId,
        ]);

        jsonResponse([
            'success'  => true,
            'event_id' => $eventId,
            'entry'    => TimelineEntry::findById((int) $entry['id']),
        ]);
    }

    /**
     * POST /timeline/run-due
     * Fire every scheduled entry whose scheduled_at <= NOW().
     * Used by the admin "Run Due" button or by a cron-style worker.
     */
    public function runDue(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::requireRole('admin', 'superadmin')($params);

        $due = TimelineEntry::due(100);
        $fired = [];

        foreach ($due as $entry) {
            try {
                $eventId = $this->fireEntry($entry);
                $fired[] = [
                    'id'         => (int) $entry['id'],
                    'event_id'   => $eventId,
                    'event_type' => $entry['event_type'],
                ];
            } catch (\Throwable $e) {
                error_log('[Timeline] Failed to fire entry ' . $entry['id'] . ': ' . $e->getMessage());
            }
        }

        $actor = currentUser();
        AuditLog::log('timeline.run_due', (int) $actor['id'], 'timeline', 'batch', [
            'count' => count($fired),
        ]);

        jsonResponse([
            'success' => true,
            'fired'   => $fired,
            'count'   => count($fired),
        ]);
    }

    /**
     * Dispatch a timeline entry through EventService and mark it fired.
     */
    private function fireEntry(array $entry): int
    {
        $actor = currentUser();
        $payload = is_array($entry['payload']) ? $entry['payload'] : [];

        // Inject context fields so consumers can correlate
        $payload['_timeline_id'] = (int) $entry['id'];
        if ($entry['campaign_id']) {
            $payload['_campaign_id'] = (int) $entry['campaign_id'];
        }
        if (!empty($entry['label'])) {
            $payload['_label'] = $entry['label'];
        }

        $eventId = EventService::dispatch($entry['event_type'], $payload, (int) $actor['id']);
        TimelineEntry::markFired((int) $entry['id'], $eventId);

        return $eventId;
    }

    /**
     * Normalise a user-provided datetime to MySQL DATETIME format.
     */
    private function normalizeDateTime($input): ?string
    {
        if ($input === null || $input === '') return null;
        if (!is_string($input)) jsonError('scheduled_at must be a string');

        $ts = strtotime($input);
        if ($ts === false) jsonError('scheduled_at is not a valid datetime');

        return date('Y-m-d H:i:s', $ts);
    }

    private function findOr404(string $id): array
    {
        if (!ctype_digit($id)) jsonError('Invalid timeline entry ID', 400);
        $entry = TimelineEntry::findById((int) $id);
        if (!$entry) jsonError('Timeline entry not found', 404);
        return $entry;
    }
}
