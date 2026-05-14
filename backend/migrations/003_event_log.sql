-- Event log: every dispatched event is recorded here for SSE + webhooks.
CREATE TABLE IF NOT EXISTS event_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type  VARCHAR(120) NOT NULL,
    payload     JSON NOT NULL,
    user_id     INT UNSIGNED NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_event_log_type (event_type),
    KEY idx_event_log_user (user_id),
    KEY idx_event_log_created (created_at),
    CONSTRAINT fk_event_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
