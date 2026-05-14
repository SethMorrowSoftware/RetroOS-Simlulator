-- Multiplayer rooms (chat, games, custom).
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    id              VARCHAR(100) NOT NULL PRIMARY KEY,
    room_type       VARCHAR(40) NOT NULL DEFAULT 'custom',
    host_user_id    INT UNSIGNED NULL,
    max_players     INT UNSIGNED NOT NULL DEFAULT 0,
    is_private      TINYINT(1) NOT NULL DEFAULT 0,
    is_persistent   TINYINT(1) NOT NULL DEFAULT 0,
    password_hash   VARCHAR(255) NULL,
    metadata        JSON NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rooms_type (room_type),
    KEY idx_rooms_host (host_user_id),
    CONSTRAINT fk_rooms_host FOREIGN KEY (host_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Multiplayer presence: online status + last heartbeat.
CREATE TABLE IF NOT EXISTS multiplayer_presence (
    user_id         INT UNSIGNED NOT NULL PRIMARY KEY,
    status          VARCHAR(20) NOT NULL DEFAULT 'online',
    current_room    VARCHAR(100) NULL,
    last_heartbeat  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_presence_heartbeat (last_heartbeat),
    CONSTRAINT fk_presence_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
