-- Audit log: records mutating admin actions for compliance.
CREATE TABLE IF NOT EXISTS audit_log (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    action          VARCHAR(80) NOT NULL,
    user_id         INT UNSIGNED NULL,
    resource_type   VARCHAR(40) NOT NULL DEFAULT '',
    resource_id     VARCHAR(120) NOT NULL DEFAULT '',
    metadata        JSON NULL,
    ip_address      VARCHAR(45) NULL,
    user_agent      VARCHAR(500) NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_audit_action (action),
    KEY idx_audit_user (user_id),
    KEY idx_audit_resource (resource_type, resource_id),
    KEY idx_audit_created (created_at),
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
