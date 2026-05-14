<?php
/**
 * Database - PDO singleton wrapper with prepared statement helpers.
 *
 * All SQL goes through prepared statements. No string interpolation.
 *
 * Usage:
 *   $row  = Database::fetchOne('SELECT * FROM users WHERE id = ?', [$id]);
 *   $rows = Database::fetchAll('SELECT * FROM users WHERE role = ?', [$role]);
 *   $val  = Database::fetchColumn('SELECT COUNT(*) FROM users');
 *   $newId = Database::insert('INSERT INTO users (name) VALUES (?)', [$name]);
 *   Database::execute('UPDATE users SET name = ? WHERE id = ?', [$name, $id]);
 *
 *   Database::transaction(function () {
 *       Database::execute('...');
 *       Database::execute('...');
 *   });
 */
class Database
{
    private static ?PDO $instance = null;
    private static array $config = [];

    /**
     * Returns the shared PDO instance, connecting on first call.
     */
    public static function getInstance(): PDO
    {
        if (self::$instance === null) {
            self::connect();
        }
        return self::$instance;
    }

    /**
     * Establish the database connection from env config.
     */
    private static function connect(): void
    {
        $env = require __DIR__ . '/env.php';
        self::$config = $env['database'] ?? [];

        $driver   = self::$config['driver']   ?? 'mysql';
        $host     = self::$config['host']     ?? 'localhost';
        $port     = (int) (self::$config['port'] ?? 3306);
        $database = self::$config['database'] ?? '';
        $username = self::$config['username'] ?? '';
        $password = self::$config['password'] ?? '';
        $charset  = self::$config['charset']  ?? 'utf8mb4';

        if ($driver !== 'mysql') {
            throw new \RuntimeException("Unsupported database driver: $driver");
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $host,
            $port,
            $database,
            $charset
        );

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES $charset",
        ];

        try {
            self::$instance = new PDO($dsn, $username, $password, $options);
        } catch (\PDOException $e) {
            throw new \RuntimeException(
                'Database connection failed: ' . $e->getMessage(),
                (int) $e->getCode()
            );
        }
    }

    /**
     * Fetch a single row, or null if no rows match.
     */
    public static function fetchOne(string $sql, array $params = []): ?array
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch();
        return $row === false ? null : $row;
    }

    /**
     * Fetch all matching rows.
     */
    public static function fetchAll(string $sql, array $params = []): array
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /**
     * Fetch a single column value from the first row, or null.
     */
    public static function fetchColumn(string $sql, array $params = [])
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        $val = $stmt->fetchColumn();
        return $val === false ? null : $val;
    }

    /**
     * Execute an INSERT and return the last insert ID.
     */
    public static function insert(string $sql, array $params = []): int
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return (int) self::getInstance()->lastInsertId();
    }

    /**
     * Execute a statement (UPDATE, DELETE, etc.) and return the affected row count.
     */
    public static function execute(string $sql, array $params = []): int
    {
        $stmt = self::getInstance()->prepare($sql);
        $stmt->execute($params);
        return $stmt->rowCount();
    }

    /**
     * Wrap a callback in a transaction. Commits on success, rolls back on exception.
     * Returns the callback's return value.
     */
    public static function transaction(callable $callback)
    {
        $pdo = self::getInstance();
        if ($pdo->inTransaction()) {
            // Nested transaction — just run the callback
            return $callback();
        }

        $pdo->beginTransaction();
        try {
            $result = $callback();
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Quote a value (typically only used in tests/admin tools — prefer prepared statements).
     */
    public static function quote(string $value): string
    {
        return self::getInstance()->quote($value);
    }
}
