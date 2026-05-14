-- System and user configuration overrides.
-- defaults.json is the base; system_config layers on top; user_config layers on top of that.
CREATE TABLE IF NOT EXISTS system_config (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    section     VARCHAR(60) NOT NULL,
    value       JSON NOT NULL,
    updated_by  INT UNSIGNED NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_system_config_section (section),
    CONSTRAINT fk_system_config_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_config (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    section     VARCHAR(60) NOT NULL,
    value       JSON NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_section (user_id, section),
    CONSTRAINT fk_user_config_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
