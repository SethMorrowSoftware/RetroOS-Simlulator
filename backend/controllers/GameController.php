<?php
/**
 * GameController - Manages game sessions and leaderboards.
 *
 * Supports:
 * - Game session CRUD (list, create, get, join, leave, start, end)
 * - Leaderboard retrieval
 */
class GameController
{
    /**
     * GET /games/sessions
     * List game sessions, optionally filtered by game or status.
     */
    public function listSessions(array $params): void
    {
        Middleware::auth(true)($params);

        $gameId = $_GET['game_id'] ?? null;
        $status = $_GET['status'] ?? null;
        $limit  = max(1, min(100, (int) ($_GET['limit'] ?? 50)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        $sessions = GameSession::list($limit, $offset, $gameId, $status);
        $total    = GameSession::count($gameId, $status);

        jsonResponse([
            'sessions' => $sessions,
            'total'    => $total,
            'limit'    => $limit,
            'offset'   => $offset,
        ]);
    }

    /**
     * POST /games/sessions
     * Create a new game session.
     */
    public function createSession(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $gameId   = input('game_id', '');
        $roomUuid = input('room_uuid');
        $settings = input('settings', []);

        if (empty($gameId)) {
            jsonError('game_id is required');
        }

        if (!is_array($settings)) {
            jsonError('settings must be an object');
        }

        // Generate a unique session ID
        $sessionId = bin2hex(random_bytes(16));

        $session = GameSession::create($sessionId, $gameId, $user['id'], [
            'settings'   => $settings,
        ]);

        // Automatically add the host as a player
        GamePlayer::join($session['id'], $user['id'], 'host');

        jsonResponse(['session' => $session], 201);
    }

    /**
     * GET /games/sessions/{id}
     * Get details of a specific game session.
     */
    public function getSession(array $params): void
    {
        Middleware::auth(true)($params);

        $id = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($id)) {
            jsonError('Session ID is required');
        }

        $session = GameSession::findById($id);
        if (!$session) {
            jsonError('Game session not found', 404);
        }

        $players = GamePlayer::listBySession($session['id']);

        jsonResponse([
            'session' => $session,
            'players' => $players,
        ]);
    }

    /**
     * POST /games/sessions/{id}/join
     * Join an existing game session.
     */
    public function joinSession(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($id)) {
            jsonError('Session ID is required');
        }

        $session = GameSession::findById($id);
        if (!$session) {
            jsonError('Game session not found', 404);
        }

        if ($session['status'] !== 'waiting' && $session['status'] !== 'lobby') {
            jsonError('Game session is not accepting players', 400);
        }

        // Enforce password for private sessions
        if (!empty($session['is_private'])) {
            $password = input('password', '');
            if (empty($password) || !GameSession::verifyPassword($session['id'], $password)) {
                jsonError('Invalid or missing password for private session', 403);
            }
        }

        // Enforce max_players
        if ((int) $session['max_players'] > 0) {
            $playerCount = GamePlayer::count($session['id']);
            if ($playerCount >= (int) $session['max_players']) {
                jsonError('Game session is full', 400);
            }
        }

        if (GamePlayer::isInSession($session['id'], $user['id'])) {
            jsonError('You are already in this session', 409);
        }

        GamePlayer::join($session['id'], $user['id']);
        $players = GamePlayer::listBySession($session['id']);

        jsonResponse([
            'success' => true,
            'session' => $session,
            'players' => $players,
        ]);
    }

    /**
     * POST /games/sessions/{id}/leave
     * Leave a game session.
     */
    public function leaveSession(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($id)) {
            jsonError('Session ID is required');
        }

        $session = GameSession::findById($id);
        if (!$session) {
            jsonError('Game session not found', 404);
        }

        if (!GamePlayer::isInSession($session['id'], $user['id'])) {
            jsonError('You are not in this session', 400);
        }

        GamePlayer::leave($session['id'], $user['id']);

        jsonResponse(['success' => true]);
    }

    /**
     * POST /games/sessions/{id}/start
     * Start a game session (host only).
     */
    public function startSession(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($id)) {
            jsonError('Session ID is required');
        }

        $session = GameSession::findById($id);
        if (!$session) {
            jsonError('Game session not found', 404);
        }

        if ((int) $session['host_user_id'] !== $user['id']) {
            jsonError('Only the host can start the session', 403);
        }

        if ($session['status'] !== 'waiting' && $session['status'] !== 'lobby') {
            jsonError('Session is not in a startable state', 400);
        }

        $playerCount = GamePlayer::count($session['id']);
        if ($playerCount < 1) {
            jsonError('At least one player is required to start', 400);
        }

        GameSession::updateStatus($session['id'], 'playing');
        $updated = GameSession::findById($id);

        jsonResponse([
            'success' => true,
            'session' => $updated,
        ]);
    }

    /**
     * POST /games/sessions/{id}/end
     * End a game session (host only). Optionally submit final scores.
     */
    public function endSession(array $params): void
    {
        Middleware::auth(true)($params);
        $user = currentUser();

        $id = $params['id'] ?? $params['uuid'] ?? '';
        if (empty($id)) {
            jsonError('Session ID is required');
        }

        $session = GameSession::findById($id);
        if (!$session) {
            jsonError('Game session not found', 404);
        }

        if ((int) $session['host_user_id'] !== $user['id']) {
            jsonError('Only the host can end the session', 403);
        }

        if ($session['status'] !== 'playing' && $session['status'] !== 'active') {
            jsonError('Session is not active', 400);
        }

        // Process scores if provided
        $scores = input('scores', []);
        if (is_array($scores) && !empty($scores)) {
            foreach ($scores as $score) {
                if (!isset($score['user_id'], $score['score'])) {
                    continue;
                }
                // Only allow score updates for players in the session
                if (!GamePlayer::isInSession($session['id'], (int) $score['user_id'])) {
                    continue;
                }
                GamePlayer::updateScore($session['id'], (int) $score['user_id'], (int) $score['score']);
                Leaderboard::record(
                    $session['game_id'],
                    (int) $score['user_id'],
                    (int) $score['score'],
                    'finished',
                    $session['id']
                );
            }
        }

        GameSession::updateStatus($session['id'], 'finished');
        $updated = GameSession::findById($id);

        jsonResponse([
            'success' => true,
            'session' => $updated,
        ]);
    }

    /**
     * GET /games/leaderboard
     * Get the leaderboard for a specific game.
     */
    public function getLeaderboard(array $params): void
    {
        Middleware::auth(true)($params);

        $gameId = $_GET['game_id'] ?? '';
        if (empty($gameId)) {
            jsonError('game_id query parameter is required');
        }

        $period = $_GET['period'] ?? 'all'; // all, daily, weekly, monthly
        $limit  = max(1, min(100, (int) ($_GET['limit'] ?? 25)));
        $offset = max(0, (int) ($_GET['offset'] ?? 0));

        if (!in_array($period, ['all', 'daily', 'weekly', 'monthly'], true)) {
            jsonError('period must be one of: all, daily, weekly, monthly');
        }

        $entries = Leaderboard::topScores($gameId, $limit, $offset, $period);
        $total   = Leaderboard::count($gameId);

        jsonResponse([
            'leaderboard' => $entries,
            'game_id'     => $gameId,
            'period'      => $period,
            'total'       => $total,
            'limit'       => $limit,
            'offset'      => $offset,
        ]);
    }
}
