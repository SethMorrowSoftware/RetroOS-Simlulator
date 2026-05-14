<?php
/**
 * FileStorageService - Stores uploaded user files on disk + records them in user_files.
 *
 * Files are stored under data/uploads/{user_uuid}/{sha256_prefix}/{sha256}
 * to keep directory entries manageable.
 */
class FileStorageService
{
    private array $config;

    public function __construct()
    {
        $env = $GLOBALS['_env_cache'] ?? require __DIR__ . '/../env.php';
        $this->config = $env['uploads'] ?? [];
    }

    public function getAllowedTypes(): array
    {
        return $this->config['allowed_types'] ?? [];
    }

    /**
     * Get the user's current usage info.
     */
    public function getQuotaInfo(int $userId): array
    {
        $used = UserFile::quotaUsage($userId);
        $quota = (int) ($this->config['user_quota'] ?? 0);
        return [
            'used'      => $used,
            'quota'     => $quota,
            'remaining' => max(0, $quota - $used),
            'percent'   => $quota > 0 ? round(($used / $quota) * 100, 2) : 0,
        ];
    }

    /**
     * Store an uploaded file. Returns the file row's public representation.
     *
     * @param array  $uploadedFile  An entry from $_FILES.
     * @param int    $userId        Owner's primary user ID.
     * @param string $userUuid      Owner's UUID (used for storage path).
     * @param string $virtualPath   Sanitized virtual filesystem path.
     */
    public function store(array $uploadedFile, int $userId, string $userUuid, string $virtualPath): array
    {
        if (!is_uploaded_file($uploadedFile['tmp_name'])) {
            throw new \RuntimeException('Invalid upload');
        }

        if (!empty($uploadedFile['error'])) {
            throw new \RuntimeException('Upload failed: error code ' . (int) $uploadedFile['error']);
        }

        $size = (int) ($uploadedFile['size'] ?? 0);
        $maxSize = (int) ($this->config['max_size'] ?? 10485760);
        if ($size <= 0 || $size > $maxSize) {
            throw new \RuntimeException('File size out of range');
        }

        $mime = $this->detectMime($uploadedFile['tmp_name']);
        $allowed = $this->getAllowedTypes();
        if (!empty($allowed) && !in_array($mime, $allowed, true)) {
            throw new \RuntimeException('File type not allowed: ' . $mime);
        }

        // Enforce quota
        $usage = UserFile::quotaUsage($userId);
        $quota = (int) ($this->config['user_quota'] ?? 0);
        if ($quota > 0 && $usage + $size > $quota) {
            throw new \RuntimeException('Storage quota exceeded');
        }

        // Compute SHA-256 of the uploaded contents for content-addressed storage
        $sha = hash_file('sha256', $uploadedFile['tmp_name']);
        if (!$sha) {
            throw new \RuntimeException('Hash computation failed');
        }

        $rootDir = $this->storageRoot();
        $userDir = $rootDir . '/' . $userUuid;
        $shardDir = $userDir . '/' . substr($sha, 0, 2);
        if (!is_dir($shardDir)) {
            if (!@mkdir($shardDir, 0700, true) && !is_dir($shardDir)) {
                throw new \RuntimeException('Failed to create storage directory');
            }
        }

        $diskPath = $shardDir . '/' . $sha;
        if (!file_exists($diskPath)) {
            if (!@move_uploaded_file($uploadedFile['tmp_name'], $diskPath)) {
                throw new \RuntimeException('Failed to persist upload');
            }
            @chmod($diskPath, 0600);
        }

        $original = basename($uploadedFile['name'] ?? 'file');

        // If a row already exists at the same virtual path, replace it
        $existing = UserFile::findByUserAndPath($userId, $virtualPath);
        if ($existing) {
            UserFile::delete((int) $existing['id'], $userId);
        }

        $id = UserFile::create([
            'user_id'       => $userId,
            'virtual_path'  => $virtualPath,
            'original_name' => $original,
            'mime_type'     => $mime,
            'size'          => $size,
            'storage_path'  => str_replace($rootDir . '/', '', $diskPath),
            'sha256'        => $sha,
        ]);

        return UserFile::toPublic(UserFile::findById($id));
    }

    /**
     * Get the absolute disk path for a stored file. Validates the storage_path is rooted under the user's dir.
     */
    public function getDiskPath(array $file, string $userUuid): ?string
    {
        $root = $this->storageRoot();
        $rel = $file['storage_path'] ?? '';
        if ($rel === '' || str_contains($rel, '..')) {
            return null;
        }
        $abs = $root . '/' . $rel;
        // Confirm the path is still under the user's directory
        $userRoot = realpath($root . '/' . $userUuid);
        $resolved = realpath($abs);
        if (!$userRoot || !$resolved) return null;
        if (!str_starts_with($resolved, $userRoot)) return null;
        return $resolved;
    }

    /**
     * Delete a file row + on-disk content (when no other rows reference it).
     */
    public function delete(array $file, int $userId, string $userUuid): bool
    {
        $diskPath = $this->getDiskPath($file, $userUuid);

        $rowDeleted = UserFile::delete((int) $file['id'], $userId);
        if (!$rowDeleted) return false;

        // Are there other rows pointing at the same content-addressed disk file?
        if ($diskPath && !empty($file['sha256'])) {
            $stillReferenced = (int) Database::fetchColumn(
                'SELECT COUNT(*) FROM user_files WHERE sha256 = ?',
                [$file['sha256']]
            );
            if ($stillReferenced === 0 && file_exists($diskPath)) {
                @unlink($diskPath);
            }
        }

        return true;
    }

    private function storageRoot(): string
    {
        $root = $this->config['storage_path'] ?? (__DIR__ . '/../../data/uploads');
        if (!is_dir($root)) {
            @mkdir($root, 0700, true);
        }
        return realpath($root) ?: $root;
    }

    private function detectMime(string $path): string
    {
        if (function_exists('finfo_open')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $mime = finfo_file($finfo, $path);
                finfo_close($finfo);
                if (is_string($mime) && $mime !== '') return $mime;
            }
        }
        return 'application/octet-stream';
    }
}
