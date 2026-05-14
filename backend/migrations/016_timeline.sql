-- Timeline entries: scheduled or manual narrative events.
CREATE TABLE IF NOT EXISTS timeline_entries (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id    INT UNSIGNED NULL,
    label          VARCHAR(200) NOT NULL DEFAULT '',
    event_type     VARCHAR(120) NOT NULL,
    payload        JSON NULL,
    scheduled_at   DATETIME NULL,
    fired_at       DATETIME NULL,
    state          VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    event_id       BIGINT UNSIGNED NULL,
    created_by     INT UNSIGNED NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_timeline_state (state),
    KEY idx_timeline_scheduled (scheduled_at),
    KEY idx_timeline_campaign (campaign_id),
    KEY idx_timeline_event_type (event_type),
    CONSTRAINT fk_timeline_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL,
    CONSTRAINT fk_timeline_user     FOREIGN KEY (created_by)  REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_timeline_event    FOREIGN KEY (event_id)    REFERENCES event_log(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
