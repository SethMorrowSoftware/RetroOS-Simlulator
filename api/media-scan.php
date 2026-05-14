<?php
/**
 * Media Scanner API Endpoint
 *
 * Scans assets/music/ and assets/videos/ directories on the server
 * and returns a JSON list of all media files found.
 *
 * This enables automatic media discovery without maintaining a manifest.
 *
 * GET /api/media-scan.php
 * Response: { "music": [...], "videos": [...] }
 */

header('Content-Type: application/json');
header('Cache-Control: no-cache');

// Allowed audio extensions
$audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'];

// Allowed video extensions
$videoExtensions = ['mp4', 'webm', 'ogv', 'mov'];

// MIME type map
$mimeTypes = [
    'mp3'  => 'audio/mpeg',
    'wav'  => 'audio/wav',
    'ogg'  => 'audio/ogg',
    'flac' => 'audio/flac',
    'm4a'  => 'audio/mp4',
    'aac'  => 'audio/aac',
    'mp4'  => 'video/mp4',
    'webm' => 'video/webm',
    'ogv'  => 'video/ogg',
    'mov'  => 'video/quicktime',
];

/**
 * Scan a directory for media files with given extensions.
 *
 * @param string $dir        Absolute path to the directory
 * @param string $baseUrl    URL prefix for building src paths
 * @param array  $extensions Allowed file extensions (lowercase)
 * @param array  $mimeTypes  Extension => MIME type map
 * @return array             Array of file entry objects
 */
function scanMediaDir(string $dir, string $baseUrl, array $extensions, array $mimeTypes): array {
    $files = [];

    if (!is_dir($dir)) {
        return $files;
    }

    // Scan directory (non-recursive — only top-level files)
    $entries = scandir($dir);
    if ($entries === false) {
        return $files;
    }

    foreach ($entries as $entry) {
        // Skip dotfiles, directories, and README/index files
        if ($entry[0] === '.' || is_dir($dir . '/' . $entry)) {
            continue;
        }

        $ext = strtolower(pathinfo($entry, PATHINFO_EXTENSION));
        if (!in_array($ext, $extensions, true)) {
            continue;
        }

        $name = pathinfo($entry, PATHINFO_FILENAME);
        $files[] = [
            'name'     => $name,
            'filename' => $entry,
            'src'      => $baseUrl . $entry,
            'extension'=> $ext,
            'mimeType' => $mimeTypes[$ext] ?? 'application/octet-stream',
            'size'     => filesize($dir . '/' . $entry) ?: 0,
        ];
    }

    // Sort alphabetically by name
    usort($files, function ($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

    return $files;
}

// Also scan subdirectories one level deep (e.g., assets/music/album/)
function scanMediaDirRecursive(string $dir, string $baseUrl, array $extensions, array $mimeTypes): array {
    $files = scanMediaDir($dir, $baseUrl, $extensions, $mimeTypes);

    if (!is_dir($dir)) {
        return $files;
    }

    $entries = scandir($dir);
    if ($entries === false) {
        return $files;
    }

    foreach ($entries as $entry) {
        if ($entry[0] === '.' || !is_dir($dir . '/' . $entry)) {
            continue;
        }

        $subFiles = scanMediaDir(
            $dir . '/' . $entry,
            $baseUrl . $entry . '/',
            $extensions,
            $mimeTypes
        );

        $files = array_merge($files, $subFiles);
    }

    return $files;
}

// Resolve paths relative to the project root
$projectRoot = realpath(__DIR__ . '/..');
$musicDir  = $projectRoot . '/assets/music';
$videoDir  = $projectRoot . '/assets/videos';

$result = [
    'music'  => scanMediaDirRecursive($musicDir, 'assets/music/', $audioExtensions, $mimeTypes),
    'videos' => scanMediaDirRecursive($videoDir, 'assets/videos/', $videoExtensions, $mimeTypes),
];

echo json_encode($result, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
