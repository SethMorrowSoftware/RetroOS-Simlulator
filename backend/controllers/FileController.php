<?php
/**
 * FileController - REST API endpoints for user file uploads.
 *
 * All endpoints require authentication and scope to the current user.
 * Files are stored server-side and referenced by virtual filesystem paths.
 */
class FileController
{
    private FileStorageService $storage;

    public function __construct()
    {
        $this->storage = new FileStorageService();
    }

    /**
     * POST /files/upload
     * Upload a file via multipart/form-data.
     * Expects: file (binary), virtual_path (string)
     */
    public function upload(array $params): void
    {
        Middleware::auth(true)($params);
        Middleware::rateLimit(30, 60)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        if (!$user) {
            jsonError('Authentication required', 401);
        }

        if (empty($_FILES['file'])) {
            jsonError('No file provided. Send a file field via multipart/form-data.', 400);
        }

        $virtualPath = $_POST['virtual_path'] ?? null;
        if (empty($virtualPath)) {
            jsonError('virtual_path is required', 400);
        }

        // Sanitize virtual path
        $virtualPath = $this->sanitizePath($virtualPath);
        if (!$virtualPath) {
            jsonError('Invalid virtual_path', 400);
        }

        try {
            $result = $this->storage->store(
                $_FILES['file'],
                $user['id'],
                $user['uuid'],
                $virtualPath
            );

            jsonResponse([
                'file' => $result,
                'message' => 'File uploaded successfully',
            ], 201);
        } catch (\RuntimeException $e) {
            jsonError($e->getMessage(), 400);
        }
    }

    /**
     * GET /files
     * List current user's files. Optional ?path= prefix filter.
     */
    public function list(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $path = $_GET['path'] ?? null;
        $limit = min((int) ($_GET['limit'] ?? 500), 1000);
        $offset = max((int) ($_GET['offset'] ?? 0), 0);

        $files = UserFile::listByUser($user['id'], $path, $limit, $offset);
        $publicFiles = array_map([UserFile::class, 'toPublic'], $files);

        jsonResponse([
            'files'  => $publicFiles,
            'count'  => count($publicFiles),
            'limit'  => $limit,
            'offset' => $offset,
        ]);
    }

    /**
     * GET /files/quota
     * Get current user's storage usage and quota.
     */
    public function quota(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $quota = $this->storage->getQuotaInfo($user['id']);

        jsonResponse([
            'quota'         => $quota,
            'allowed_types' => $this->storage->getAllowedTypes(),
        ]);
    }

    /**
     * GET /files/:id
     * Get file metadata by ID.
     */
    public function get(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $file = $this->findOwnedFile($params['id'], $user['id']);

        jsonResponse(['file' => UserFile::toPublic($file)]);
    }

    /**
     * GET /files/:id/download
     * Stream/download the actual file content.
     */
    public function download(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $file = $this->findOwnedFile($params['id'], $user['id']);

        $diskPath = $this->storage->getDiskPath($file, $user['uuid']);
        if (!$diskPath) {
            jsonError('File not found on disk', 404);
        }

        // Stream the file
        $mimeType = $file['mime_type'] ?? 'application/octet-stream';
        $originalName = $file['original_name'] ?? 'download';

        // Determine disposition: inline for safe types, attachment for others.
        // SVG and HTML are XSS vectors and must always be forced to download.
        $dangerousTypes = ['image/svg+xml', 'text/html', 'text/xml', 'application/xml', 'application/xhtml+xml'];
        $inlineTypes = ['image/', 'text/', 'application/pdf'];
        $disposition = 'attachment';
        if (!in_array($mimeType, $dangerousTypes, true)) {
            foreach ($inlineTypes as $prefix) {
                if (str_starts_with($mimeType, $prefix)) {
                    $disposition = 'inline';
                    break;
                }
            }
        }

        // Sanitize filename for Content-Disposition to prevent header injection
        $safeName = preg_replace('/[^\x20-\x7E]/', '_', $originalName);
        $safeName = str_replace(['"', '\\', "\r", "\n"], '_', $safeName);
        // RFC 5987 encoded filename for proper unicode support
        $encodedName = rawurlencode($originalName);

        header('Content-Type: ' . $mimeType);
        header('Content-Length: ' . filesize($diskPath));
        header('Content-Disposition: ' . $disposition . '; filename="' . $safeName . '"; filename*=UTF-8\'\'' . $encodedName);
        header('Cache-Control: private, max-age=3600');
        header('X-Content-Type-Options: nosniff');

        readfile($diskPath);
        exit;
    }

    /**
     * PUT /files/:id
     * Update file metadata (rename/move by changing virtual_path).
     */
    public function update(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $file = $this->findOwnedFile($params['id'], $user['id']);

        $newPath = input('virtual_path');
        if (empty($newPath)) {
            jsonError('virtual_path is required', 400);
        }

        $newPath = $this->sanitizePath($newPath);
        if (!$newPath) {
            jsonError('Invalid virtual_path', 400);
        }

        // Check if target path already exists
        $existing = UserFile::findByUserAndPath($user['id'], $newPath);
        if ($existing && (int) $existing['id'] !== (int) $file['id']) {
            jsonError('A file already exists at that path', 409);
        }

        $updated = UserFile::updatePath((int) $file['id'], $user['id'], $newPath);
        if (!$updated) {
            jsonError('Failed to update file', 500);
        }

        $file = UserFile::findById((int) $file['id']);
        jsonResponse(['file' => UserFile::toPublic($file)]);
    }

    /**
     * DELETE /files/:id
     * Delete a file.
     */
    public function delete(array $params): void
    {
        Middleware::auth(true)($params);
        $this->requireRegisteredUser();

        $user = currentUser();
        $file = $this->findOwnedFile($params['id'], $user['id']);

        $deleted = $this->storage->delete($file, $user['id'], $user['uuid']);
        if (!$deleted) {
            jsonError('Failed to delete file', 500);
        }

        jsonResponse(['message' => 'File deleted successfully']);
    }

    // --- Private Helpers ---

    /**
     * Find a file owned by the specified user, or send 404.
     */
    private function findOwnedFile(string $id, int $userId): array
    {
        $fileId = (int) $id;
        if ($fileId <= 0) {
            jsonError('Invalid file ID', 400);
        }

        $file = UserFile::findById($fileId);
        if (!$file || (int) $file['user_id'] !== $userId) {
            jsonError('File not found', 404);
        }

        return $file;
    }

    /**
     * Sanitize and validate a virtual filesystem path.
     * Prevents path traversal and enforces consistent format.
     *
     * @return string|null Sanitized path, or null if invalid
     */
    private function sanitizePath(string $path): ?string
    {
        // Normalize separators
        $path = str_replace('\\', '/', trim($path));

        // Remove null bytes
        $path = str_replace("\0", '', $path);

        // Resolve . and .. segments
        $segments = explode('/', $path);
        $resolved = [];
        foreach ($segments as $segment) {
            $segment = trim($segment);
            if ($segment === '' || $segment === '.') continue;
            if ($segment === '..') {
                array_pop($resolved);
                continue;
            }
            $resolved[] = $segment;
        }

        if (count($resolved) < 4) {
            return null; // Need at least C:/Users/<name>/file
        }

        // Require user files to live under C:/Users to isolate uploads from
        // system/OS paths and keep user data in expected folders.
        if (strcasecmp($resolved[0], 'C:') !== 0 || strcasecmp($resolved[1], 'Users') !== 0) {
            return null;
        }

        // Verify the username segment matches the authenticated user to prevent
        // cross-user file access (e.g., user "alice" writing to "C:/Users/bob/...").
        // For frontend compatibility, also allow the canonical virtual profile
        // name "User" used throughout the default filesystem tree.
        $user = currentUser();
        if ($user) {
            $pathUsername = $resolved[2] ?? '';
            $authUsername = $user['display_name'] ?? '';
            $isCanonicalUser = (strcasecmp($pathUsername, 'User') === 0);
            $isAuthUser = (strcasecmp($pathUsername, $authUsername) === 0);
            if (!$isCanonicalUser && !$isAuthUser) {
                return null;
            }
        }

        return implode('/', $resolved);
    }

    /**
     * Enforce that only fully registered (non-anonymous) users can use file APIs.
     */
    private function requireRegisteredUser(): void
    {
        $user = currentUser();
        if (!$user || !empty($user['is_anonymous'])) {
            jsonError('Registered account required', 403);
        }
    }
}
