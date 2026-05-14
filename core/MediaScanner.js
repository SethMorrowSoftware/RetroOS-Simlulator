/**
 * MediaScanner - Discovers media files on the webserver and populates the virtual filesystem
 *
 * Discovery chain (tries each in order, uses first that succeeds):
 * 1. PHP endpoint (api/media-scan.php) — automatically scans server directories
 * 2. media-manifest.json — hand-curated manifest file
 * 3. index.json in each directory — simple file listings
 *
 * Media files found are:
 * 1. Added to the virtual filesystem under C:/Users/User/Music and C:/Users/User/Videos
 * 2. Made available to MediaPlayer and RetroScript
 *
 * To add media, simply drop files into:
 *   assets/music/    — MP3, WAV, OGG, FLAC, M4A, AAC files
 *   assets/videos/   — MP4, WebM, OGV, MOV files
 *
 * They will be automatically discovered on next page load.
 */

import FileSystemManager from './FileSystemManager.js';
import StorageManager from './StorageManager.js';
import EventBus from './EventBus.js';

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv', '.mov'];

/** Per-request timeout for media discovery fetches (ms) */
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch with an AbortController timeout so requests cannot hang indefinitely.
 * @param {string} url
 * @param {RequestInit} options
 * @param {number} timeoutMs
 * @returns {Promise<Response>}
 */
function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

/**
 * MIME type map for media files
 */
const MIME_TYPES = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime'
};

class MediaScanner {
    constructor() {
        this.musicFiles = [];
        this.videoFiles = [];
        this.scanned = false;
        this.discoveryMethod = null; // Track which method succeeded

        // Listen for file deletions in Music/Videos folders to track them
        EventBus.on('fs:file:deleted:track', ({ fileName, parentPath }) => {
            if (parentPath && (parentPath.includes('Music') || parentPath.includes('Videos'))) {
                this.markAsDeleted(fileName);
            }
        });
    }

    /**
     * Scan for media files and populate the filesystem.
     * Called during system initialization.
     *
     * Tries discovery methods in priority order:
     * 1. PHP server-side scan (best — works automatically)
     * 2. media-manifest.json (manual — requires maintenance)
     * 3. index.json per directory (simple — per-directory listings)
     */
    async scan() {
        if (this.scanned) return;

        try {
            let discovered = false;

            // 1. Try PHP server-side auto-scan (fully automatic)
            if (!discovered) {
                discovered = await this.tryServerScan();
            }

            // 2. Try media-manifest.json (curated manifest)
            if (!discovered) {
                discovered = await this.tryManifest();
            }

            // 3. Try index.json in each directory
            if (!discovered) {
                discovered = await this.tryDirectoryIndex();
            }

            if (!discovered) {
                console.log('[MediaScanner] No media files discovered (all methods tried)');
            }

            // Populate the virtual filesystem with whatever we found
            this.populateFilesystem();
            this.scanned = true;

            EventBus.emit('media:scan:complete', {
                musicCount: this.musicFiles.length,
                videoCount: this.videoFiles.length,
                method: this.discoveryMethod,
                timestamp: Date.now()
            });

            if (this.musicFiles.length > 0 || this.videoFiles.length > 0) {
                console.log(`[MediaScanner] Discovered ${this.musicFiles.length} music + ${this.videoFiles.length} video files via ${this.discoveryMethod}`);
            }

        } catch (e) {
            console.warn('[MediaScanner] Scan failed:', e.message);
            this.scanned = true; // Don't retry on failure
        }
    }

    /**
     * Method 1: PHP server-side directory scan
     * The server scans assets/music/ and assets/videos/ and returns all files.
     * This is fully automatic — just drop files into the folders.
     */
    async tryServerScan() {
        try {
            const response = await fetchWithTimeout('api/media-scan.php', { cache: 'no-cache' });
            if (!response.ok) return false;

            const data = await response.json();
            if (!data || typeof data !== 'object') return false;

            const music = Array.isArray(data.music) ? data.music : [];
            const videos = Array.isArray(data.videos) ? data.videos : [];

            if (music.length === 0 && videos.length === 0) return false;

            this.musicFiles = music.map(f => this.normalizeEntry(f, 'music'));
            this.videoFiles = videos.map(f => this.normalizeEntry(f, 'videos'));
            this.discoveryMethod = 'server-scan';
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Method 2: Fetch assets/media-manifest.json
     */
    async tryManifest() {
        try {
            const response = await fetchWithTimeout('assets/media-manifest.json', { cache: 'no-cache' });
            if (!response.ok) return false;

            const data = await response.json();
            if (!data || typeof data !== 'object') return false;

            const music = Array.isArray(data.music) ? data.music : [];
            const videos = Array.isArray(data.videos) ? data.videos : [];

            if (music.length === 0 && videos.length === 0) return false;

            this.musicFiles = music.map(f => this.normalizeEntry(f, 'music'));
            this.videoFiles = videos.map(f => this.normalizeEntry(f, 'videos'));
            this.discoveryMethod = 'manifest';
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Method 3: Fetch index.json from each media directory
     */
    async tryDirectoryIndex() {
        let found = false;

        // Try music/index.json
        try {
            const response = await fetchWithTimeout('assets/music/index.json', { cache: 'no-cache' });
            if (response.ok) {
                const files = await response.json();
                if (Array.isArray(files) && files.length > 0) {
                    this.musicFiles = files.map(f => this.normalizeEntry(
                        typeof f === 'string' ? `assets/music/${f}` : { ...f, src: f.src || `assets/music/${f.filename}` },
                        'music'
                    ));
                    found = true;
                }
            }
        } catch { /* no index.json for music */ }

        // Try videos/index.json
        try {
            const response = await fetchWithTimeout('assets/videos/index.json', { cache: 'no-cache' });
            if (response.ok) {
                const files = await response.json();
                if (Array.isArray(files) && files.length > 0) {
                    this.videoFiles = files.map(f => this.normalizeEntry(
                        typeof f === 'string' ? `assets/videos/${f}` : { ...f, src: f.src || `assets/videos/${f.filename}` },
                        'videos'
                    ));
                    found = true;
                }
            }
        } catch { /* no index.json for videos */ }

        if (found) {
            this.discoveryMethod = 'index-json';
        }
        return found;
    }

    /**
     * Normalize a manifest entry into a standard format
     */
    normalizeEntry(entry, type) {
        if (typeof entry === 'string') {
            const filename = entry.split('/').pop();
            const ext = '.' + filename.split('.').pop().toLowerCase();
            return {
                name: filename.replace(/\.[^/.]+$/, ''),
                filename,
                src: entry.startsWith('assets/') ? entry : `assets/${type}/${entry}`,
                extension: ext.slice(1),
                mimeType: MIME_TYPES[ext] || (type === 'music' ? 'audio/mpeg' : 'video/mp4')
            };
        }
        // Already an object with name/src
        const filename = (entry.src || entry.filename || '').split('/').pop();
        const ext = '.' + filename.split('.').pop().toLowerCase();
        return {
            name: entry.name || filename.replace(/\.[^/.]+$/, ''),
            filename,
            src: entry.src || `assets/${type}/${filename}`,
            extension: ext.slice(1),
            mimeType: entry.mimeType || MIME_TYPES[ext] || (type === 'music' ? 'audio/mpeg' : 'video/mp4'),
            size: entry.size || 0
        };
    }

    /**
     * Get list of media files the user has explicitly deleted.
     * These won't be re-added by the scanner on next page load.
     */
    getDeletedFiles() {
        return StorageManager.get('mediaScanner_deleted', []);
    }

    /**
     * Mark a media file as deleted so the scanner won't re-add it.
     * Called when user deletes a file from Music or Videos folders.
     */
    markAsDeleted(filename) {
        const deleted = this.getDeletedFiles();
        if (!deleted.includes(filename)) {
            deleted.push(filename);
            StorageManager.set('mediaScanner_deleted', deleted);
        }
    }

    /**
     * Populate the virtual filesystem with discovered media files.
     * Respects user deletions — files the user has removed won't be re-added.
     */
    populateFilesystem() {
        // Ensure Music directory exists
        try {
            FileSystemManager.createDirectory(['C:', 'Users', 'User', 'Music']);
        } catch { /* already exists */ }

        // Ensure Videos directory exists
        try {
            FileSystemManager.createDirectory(['C:', 'Users', 'User', 'Videos']);
        } catch { /* already exists */ }

        const deletedFiles = this.getDeletedFiles();

        // Add music files to C:/Users/User/Music
        for (const file of this.musicFiles) {
            // Skip files the user has explicitly deleted
            if (deletedFiles.includes(file.filename)) continue;

            const filePath = ['C:', 'Users', 'User', 'Music', file.filename];
            try {
                // Check if file already exists (don't overwrite user edits)
                const existing = FileSystemManager.getNode(filePath);
                if (existing) continue;

                FileSystemManager.writeFile(filePath, '[Audio File]', file.extension, {
                    mimeType: file.mimeType,
                    src: file.src,
                    mediaName: file.name,
                    size: file.size || 0
                });
            } catch (e) {
                console.warn(`[MediaScanner] Failed to add music file: ${file.filename}`, e.message);
            }
        }

        // Add video files to C:/Users/User/Videos
        for (const file of this.videoFiles) {
            if (deletedFiles.includes(file.filename)) continue;

            const filePath = ['C:', 'Users', 'User', 'Videos', file.filename];
            try {
                const existing = FileSystemManager.getNode(filePath);
                if (existing) continue;

                FileSystemManager.writeFile(filePath, '[Video File]', file.extension, {
                    mimeType: file.mimeType,
                    src: file.src,
                    mediaName: file.name,
                    size: file.size || 0
                });
            } catch (e) {
                console.warn(`[MediaScanner] Failed to add video file: ${file.filename}`, e.message);
            }
        }

        // Save filesystem after populating
        if (this.musicFiles.length > 0 || this.videoFiles.length > 0) {
            FileSystemManager.saveFileSystem();
        }
    }

    /**
     * Get all discovered music files
     * @returns {Array} Music file entries
     */
    getMusicFiles() {
        return [...this.musicFiles];
    }

    /**
     * Get all discovered video files
     * @returns {Array} Video file entries
     */
    getVideoFiles() {
        return [...this.videoFiles];
    }

    /**
     * Get all media files (music + videos)
     * @returns {Array} All media file entries
     */
    getAllMedia() {
        return [...this.musicFiles, ...this.videoFiles];
    }

    /**
     * Check if any media has been discovered
     * @returns {boolean}
     */
    hasMedia() {
        return this.musicFiles.length > 0 || this.videoFiles.length > 0;
    }

    /**
     * Resolve a filesystem path to a playable media URL.
     * Given a virtual path like ['C:', 'Users', 'User', 'Music', 'song.mp3'],
     * returns the actual URL (e.g., 'assets/music/song.mp3').
     *
     * This is the key bridge between the virtual filesystem and actual media playback.
     *
     * @param {string|string[]} path - Virtual filesystem path
     * @returns {string|null} Playable URL or null
     */
    resolveMediaUrl(path) {
        try {
            const node = FileSystemManager.getNode(path);
            if (node && node.src) {
                return node.src;
            }
            // If the node exists but has no src, it might be a text content file
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Get media files from the filesystem (reads current state of Music/Videos dirs)
     * @param {string} type - 'music' or 'videos'
     * @returns {Array} File entries with name, src, extension
     */
    getFilesystemMedia(type) {
        const dirPath = type === 'music'
            ? ['C:', 'Users', 'User', 'Music']
            : ['C:', 'Users', 'User', 'Videos'];

        try {
            const dirNode = FileSystemManager.getNode(dirPath);
            if (!dirNode) return [];

            const children = dirNode.children || dirNode;
            const results = [];

            for (const [name, node] of Object.entries(children)) {
                if (node && node.type === 'file' && node.src) {
                    results.push({
                        name: node.mediaName || name.replace(/\.[^/.]+$/, ''),
                        filename: name,
                        src: node.src,
                        extension: node.extension,
                        mimeType: node.mimeType
                    });
                }
            }

            return results;
        } catch {
            return [];
        }
    }
}

// Singleton
const mediaScanner = new MediaScanner();
export default mediaScanner;
