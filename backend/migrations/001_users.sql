-- Users: account records with optional registered credentials.
CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uuid            CHAR(36) NOT NULL,
    display_name    VARCHAR(64) NOT NULL,
    password_hash   VARCHAR(255) NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'visitor',
    is_anonymous    TINYINT(1) NOT NULL DEFAULT 1,
    preferences     JSON NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen       TIMESTAMP NULL,
    upgraded_at     TIMESTAMP NULL,
    UNIQUE KEY uniq_users_uuid (uuid),
    UNIQUE KEY uniq_users_display_name (display_name),
    KEY idx_users_role (role),
    KEY idx_users_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
