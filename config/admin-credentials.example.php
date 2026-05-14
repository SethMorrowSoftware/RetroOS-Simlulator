<?php
/**
 * Admin credentials for IlluminatOS! Admin Panel
 *
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to admin-credentials.php
 * 2. Generate a new password hash:  php -r "echo password_hash('your_password', PASSWORD_BCRYPT);"
 * 3. Replace the hash below with your generated hash
 * 4. Set force_change to false once you've set your final password
 *
 * IMPORTANT: admin-credentials.php is gitignored and must NOT be committed.
 */

return [
    'password_hash' => '$2y$12$REPLACE_WITH_YOUR_BCRYPT_HASH_HERE',
    'force_change' => true
];
