-- Themes: custom wallpaper + color scheme bundles.
CREATE TABLE IF NOT EXISTS themes (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(60) NOT NULL,
    name         VARCHAR(100) NOT NULL,
    description  VARCHAR(500) NOT NULL DEFAULT '',
    definition   JSON NOT NULL,
    created_by   INT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uniq_themes_slug (slug),
    CONSTRAINT fk_themes_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
