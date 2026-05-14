-- Webhooks: outbound HTTP subscriptions.
CREATE TABLE IF NOT EXISTS webhooks (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    url          VARCHAR(500) NOT NULL,
    secret       VARCHAR(255) NOT NULL DEFAULT '',
    events       JSON NOT NULL,
    active       TINYINT(1) NOT NULL DEFAULT 1,
    description  VARCHAR(500) NOT NULL DEFAULT '',
    created_by   INT UNSIGNED NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_webhooks_active (active),
    CONSTRAINT fk_webhooks_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    webhook_id   INT UNSIGNED NOT NULL,
    event_type   VARCHAR(120) NOT NULL,
    status_code  INT UNSIGNED NULL,
    attempt      INT UNSIGNED NOT NULL DEFAULT 1,
    success      TINYINT(1) NOT NULL DEFAULT 0,
    error        VARCHAR(500) NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_webhook_deliveries_webhook (webhook_id),
    KEY idx_webhook_deliveries_created (created_at),
    CONSTRAINT fk_webhook_deliveries_webhook FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
