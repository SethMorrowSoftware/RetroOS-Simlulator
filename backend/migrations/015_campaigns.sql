-- Campaigns: server-side registry of interactive narrative campaigns.
CREATE TABLE IF NOT EXISTS campaigns (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug         VARCHAR(64) NOT NULL,
    name         VARCHAR(200) NOT NULL,
    version      VARCHAR(40) NOT NULL DEFAULT '1.0.0',
    description  TEXT NULL,
    manifest     JSON NULL,
    bindings     JSON NULL,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft',
    is_active    TINYINT(1) NOT NULL DEFAULT 0,
    created_by   INT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP NULL,
    UNIQUE KEY uniq_campaigns_slug (slug),
    KEY idx_campaigns_status (status),
    KEY idx_campaigns_active (is_active),
    CONSTRAINT fk_campaigns_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-user campaign progress (acts/scenes/flags/clues snapshot).
CREATE TABLE IF NOT EXISTS campaign_progress (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED NOT NULL,
    campaign_id  INT UNSIGNED NOT NULL,
    state        JSON NOT NULL,
    updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_campaign (user_id, campaign_id),
    CONSTRAINT fk_cp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cp_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
