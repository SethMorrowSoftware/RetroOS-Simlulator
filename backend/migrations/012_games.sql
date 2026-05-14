-- Game sessions: lobby + active play state.
CREATE TABLE IF NOT EXISTS game_sessions (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id      VARCHAR(40) NOT NULL,
    game_id         VARCHAR(40) NOT NULL,
    host_user_id    INT UNSIGNED NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'waiting',
    settings        JSON NULL,
    max_players     INT UNSIGNED NOT NULL DEFAULT 0,
    is_private      TINYINT(1) NOT NULL DEFAULT 0,
    password_hash   VARCHAR(255) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at      TIMESTAMP NULL,
    ended_at        TIMESTAMP NULL,
    UNIQUE KEY uniq_game_session_id (session_id),
    KEY idx_game_sessions_game (game_id),
    KEY idx_game_sessions_host (host_user_id),
    KEY idx_game_sessions_status (status),
    CONSTRAINT fk_game_sessions_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_players (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id      INT UNSIGNED NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'player',
    score           BIGINT NOT NULL DEFAULT 0,
    joined_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_session_user (session_id, user_id),
    CONSTRAINT fk_game_players_session FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_game_players_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS leaderboards (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    game_id         VARCHAR(40) NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    score           BIGINT NOT NULL DEFAULT 0,
    status          VARCHAR(20) NOT NULL DEFAULT 'finished',
    session_id      VARCHAR(40) NULL,
    recorded_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_leaderboards_game_score (game_id, score),
    KEY idx_leaderboards_recorded (recorded_at),
    CONSTRAINT fk_leaderboards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
