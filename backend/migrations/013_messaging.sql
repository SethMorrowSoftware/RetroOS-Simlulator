-- Room chat messages.
CREATE TABLE IF NOT EXISTS chat_messages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    room_id         VARCHAR(100) NOT NULL,
    user_id         INT UNSIGNED NOT NULL,
    display_name    VARCHAR(64) NOT NULL,
    content         TEXT NOT NULL,
    type            VARCHAR(20) NOT NULL DEFAULT 'message',
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_chat_room_id (room_id),
    KEY idx_chat_user_id (user_id),
    CONSTRAINT fk_chat_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Direct messages.
CREATE TABLE IF NOT EXISTS direct_messages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel_id      VARCHAR(60) NOT NULL,
    from_user_id    INT UNSIGNED NOT NULL,
    content         TEXT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at         TIMESTAMP NULL,
    KEY idx_dm_channel (channel_id),
    KEY idx_dm_from_user (from_user_id),
    CONSTRAINT fk_dm_user FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
