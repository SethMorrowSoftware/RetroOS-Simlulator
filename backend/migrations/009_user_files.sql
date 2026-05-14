-- User files: uploaded content stored on disk + indexed here.
CREATE TABLE IF NOT EXISTS user_files (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    virtual_path    VARCHAR(500) NOT NULL,
    original_name   VARCHAR(255) NOT NULL DEFAULT '',
    mime_type       VARCHAR(100) NOT NULL DEFAULT '',
    size            BIGINT UNSIGNED NOT NULL DEFAULT 0,
    storage_path    VARCHAR(500) NOT NULL,
    sha256          CHAR(64) NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NULL,
    UNIQUE KEY uniq_user_virtual_path (user_id, virtual_path),
    KEY idx_user_files_sha (sha256),
    CONSTRAINT fk_user_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
