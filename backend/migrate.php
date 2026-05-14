<?php
/**
 * backend/migrate.php — CLI database migration runner.
 *
 * Usage:
 *   php backend/migrate.php             # apply pending migrations
 *   php backend/migrate.php --status    # list applied / pending without running
 *
 * Picks up every SQL file in backend/migrations/, runs them in lexical order,
 * and tracks completion in the `_migrations` table. Idempotent: rerunning
 * after a successful run is a no-op.
 *
 * Refuses to run from a web request — this is a CLI tool. The web-based
 * setup wizard at api/v2/migrate.php remains for first-time deployment.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    header('Content-Type: text/plain');
    echo "backend/migrate.php is a CLI tool. Use api/v2/migrate.php for the web setup wizard.\n";
    exit(1);
}

define('ILLUMINATOS_API', true);
require_once __DIR__ . '/bootstrap.php';

$showStatus = in_array('--status', $argv, true);
$migrationDir = __DIR__ . '/migrations';

if (!is_dir($migrationDir)) {
    fwrite(STDERR, "ERROR: $migrationDir does not exist.\n");
    exit(1);
}

try {
    $pdo = Database::getInstance();
} catch (\Throwable $e) {
    fwrite(STDERR, 'ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}

// Ensure tracking table exists before we read from it.
$pdo->exec(
    'CREATE TABLE IF NOT EXISTS _migrations (
        filename VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$applied = $pdo->query('SELECT filename FROM _migrations')->fetchAll(PDO::FETCH_COLUMN);
$applied = array_flip($applied);

$files = glob($migrationDir . '/*.sql') ?: [];
sort($files);

$pending = array_values(array_filter($files, fn ($f) => !isset($applied[basename($f)])));

if ($showStatus) {
    echo "Applied migrations:\n";
    if (empty($applied)) {
        echo "  (none)\n";
    } else {
        foreach (array_keys($applied) as $name) echo "  $name\n";
    }
    echo "\nPending migrations:\n";
    if (empty($pending)) {
        echo "  (none — fully up to date)\n";
    } else {
        foreach ($pending as $f) echo '  ' . basename($f) . "\n";
    }
    exit(0);
}

if (empty($pending)) {
    echo "Nothing to apply. Database is already up to date.\n";
    exit(0);
}

echo "Applying " . count($pending) . " migration(s)...\n";

$failures = 0;
foreach ($pending as $file) {
    $name = basename($file);
    echo "  → $name ";
    $sql = file_get_contents($file);
    if ($sql === false || trim($sql) === '') {
        echo "(skipped: empty)\n";
        $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)')->execute([$name]);
        continue;
    }
    try {
        $pdo->exec($sql);
        $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)')->execute([$name]);
        echo "OK\n";
    } catch (\PDOException $e) {
        // Tolerate "table/column already exists" the same way the web wizard
        // does — that just means the schema was already partially applied.
        $code = (int) ($e->errorInfo[1] ?? 0);
        $sqlState = (string) ($e->errorInfo[0] ?? '');
        $ignorable = in_array($code, [1050, 1060, 1061], true)
                  || in_array($sqlState, ['42S01', '42S21'], true);
        if ($ignorable) {
            $pdo->prepare('INSERT INTO _migrations (filename) VALUES (?)')->execute([$name]);
            echo "OK (schema already present)\n";
            continue;
        }
        echo "FAILED\n";
        fwrite(STDERR, '    ' . $e->getMessage() . "\n");
        $failures++;
        break;
    }
}

if ($failures > 0) {
    fwrite(STDERR, "\n$failures migration(s) failed. Inspect the error above and re-run.\n");
    exit(1);
}

echo "\nDone.\n";
exit(0);
