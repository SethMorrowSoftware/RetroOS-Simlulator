<?php
/**
 * IlluminatOS! Backend Environment Configuration
 *
 * Copy this file to backend/env.php and customize for your environment.
 * Never commit backend/env.php to version control.
 */

return [
    'app' => [
        'name'             => 'IlluminatOS!',
        'env'              => 'production',       // production | development
        'debug'            => false,              // true to show error details
        'timezone'         => 'UTC',
        'base_url'         => '',                 // e.g. https://example.com
        'session_lifetime' => 86400,              // seconds (24 hours)
        'internal_secret'  => 'change-me-to-a-random-64-byte-hex-string',
    ],

    'database' => [
        'driver'   => 'mysql',
        'host'     => 'localhost',
        'port'     => 3306,
        'database' => 'illuminatos',
        'username' => 'illuminatos',
        'password' => 'change-me',
        'charset'  => 'utf8mb4',
    ],

    'sse' => [
        'poll_interval' => 1,                     // seconds between event polls
        'max_lifetime'  => 300,                   // max seconds before forcing reconnect
    ],

    'rate_limit' => [
        'enabled'         => true,
        'storage_path'    => __DIR__ . '/../data/rate_limits',
        'fallback_window' => 60,                  // default window in seconds
        'fallback_limit'  => 60,                  // default requests per window
    ],

    'uploads' => [
        'storage_path' => __DIR__ . '/../data/uploads',
        'max_size'     => 10485760,               // 10 MB per file
        'user_quota'   => 104857600,              // 100 MB per user
        'allowed_types' => [
            'image/png', 'image/jpeg', 'image/gif', 'image/webp',
            'text/plain', 'text/csv',
            'application/json', 'application/pdf',
            'audio/mpeg', 'audio/wav', 'audio/ogg',
            'video/mp4', 'video/webm',
        ],
    ],

    'migrations' => [
        'secret' => 'change-me-to-a-random-token',
    ],

    'webhooks' => [
        'enabled'         => true,
        'request_timeout' => 5,                   // seconds
        'max_retries'     => 3,
        'retry_delay'     => 5,                   // seconds between retries
    ],

    'cors' => [
        'enabled'      => false,
        'origins'      => [],
        'allow_credentials' => true,
    ],
];
