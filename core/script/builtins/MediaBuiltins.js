/**
 * MediaBuiltins - Media integration functions for RetroScript
 *
 * Provides built-in functions for:
 * - playMusic(path) / playVideo(path)  — play media from filesystem or URL
 * - stopMusic() / stopVideo()          — stop playback
 * - listMusic() / listVideos()         — list files in Music/Videos folders
 * - getMediaState()                    — get current playback state
 * - setVolume(level)                   — set master volume
 */

import MediaScanner from '../../MediaScanner.js';

export function registerMediaBuiltins(interpreter) {
    // ====== AUDIO PLAYBACK ======

    /**
     * playMusic(source, options?) - Play audio file
     * source: filesystem path string ("C:/Users/User/Music/song.mp3") or URL ("assets/music/song.mp3")
     * options: { volume: 0-1, loop: boolean }
     */
    interpreter.registerBuiltin('playMusic', (source, options = {}) => {
        const EventBus = interpreter.context.EventBus;
        if (!EventBus || !source) return false;

        // Resolve filesystem path to URL if needed
        let src = String(source);
        if (src.includes('C:') || src.includes('c:')) {
            const parts = src.replace(/\\/g, '/').split('/').filter(Boolean);
            const resolved = MediaScanner.resolveMediaUrl(parts);
            if (resolved) src = resolved;
        }

        EventBus.emit('audio:play', {
            src,
            volume: options.volume !== undefined ? Number(options.volume) : undefined,
            loop: Boolean(options.loop),
            force: true
        });

        return true;
    });

    /**
     * stopMusic(source?) - Stop audio playback
     * If source given, stops that specific track; otherwise stops all
     */
    interpreter.registerBuiltin('stopMusic', (source) => {
        const EventBus = interpreter.context.EventBus;
        if (!EventBus) return false;

        if (source) {
            let src = String(source);
            if (src.includes('C:') || src.includes('c:')) {
                const parts = src.replace(/\\/g, '/').split('/').filter(Boolean);
                const resolved = MediaScanner.resolveMediaUrl(parts);
                if (resolved) src = resolved;
            }
            EventBus.emit('audio:stop', { src });
        } else {
            EventBus.emit('audio:stopall', {});
        }

        return true;
    });

    // ====== VIDEO PLAYBACK ======

    /**
     * playVideo(source, options?) - Play video file in MediaPlayer
     * source: filesystem path or URL
     * options: { volume, loop, fullscreen, name }
     */
    interpreter.registerBuiltin('playVideo', async (source, options = {}) => {
        const CommandBus = interpreter.context.CommandBus;
        const EventBus = interpreter.context.EventBus;
        if (!CommandBus || !source) return false;

        let src = String(source);
        if (src.includes('C:') || src.includes('c:')) {
            const parts = src.replace(/\\/g, '/').split('/').filter(Boolean);
            const resolved = MediaScanner.resolveMediaUrl(parts);
            if (resolved) src = resolved;
        }

        const name = options.name || src.split('/').pop().replace(/\.[^/.]+$/, '');

        try {
            await CommandBus.execute('app:launch', {
                appId: 'mediaplayer',
                params: {
                    src,
                    name,
                    volume: options.volume,
                    loop: Boolean(options.loop),
                    fullscreen: Boolean(options.fullscreen)
                }
            });
        } catch (e) {
            console.warn('[MediaBuiltins] playVideo error:', e);
            return false;
        }

        if (EventBus) {
            EventBus.emit('mediaplayer:requested', { src, options });
        }

        return true;
    });

    /**
     * stopVideo() - Stop video playback
     */
    interpreter.registerBuiltin('stopVideo', async () => {
        const CommandBus = interpreter.context.CommandBus;
        if (!CommandBus) return false;

        try {
            await CommandBus.execute('mediaplayer:stop', {});
            return true;
        } catch {
            return false;
        }
    });

    // ====== MEDIA LISTING ======

    /**
     * listMusic() - List all music files in C:/Users/User/Music
     * Returns array of { name, filename, src }
     */
    interpreter.registerBuiltin('listMusic', () => {
        return MediaScanner.getFilesystemMedia('music');
    });

    /**
     * listVideos() - List all video files in C:/Users/User/Videos
     * Returns array of { name, filename, src }
     */
    interpreter.registerBuiltin('listVideos', () => {
        return MediaScanner.getFilesystemMedia('videos');
    });

    /**
     * listMedia() - List all media (music + videos)
     * Returns array of { name, filename, src, extension }
     */
    interpreter.registerBuiltin('listMedia', () => {
        const music = MediaScanner.getFilesystemMedia('music');
        const videos = MediaScanner.getFilesystemMedia('videos');
        return [...music, ...videos];
    });

    // ====== VOLUME CONTROL ======

    /**
     * setVolume(level) - Set master volume (0-100)
     */
    interpreter.registerBuiltin('setVolume', (level) => {
        const EventBus = interpreter.context.EventBus;
        if (!EventBus) return false;

        const vol = Math.max(0, Math.min(100, Number(level) || 0));
        EventBus.emit('sound:setVolume', { volume: vol / 100 });
        return true;
    });

    /**
     * playSound(type) - Play a predefined system sound
     * Types: click, error, notify, achievement, startup, shutdown, etc.
     */
    interpreter.registerBuiltin('playSound', (type, options = {}) => {
        const EventBus = interpreter.context.EventBus;
        if (!EventBus || !type) return false;

        EventBus.emit('sound:play', {
            type: String(type),
            volume: options.volume !== undefined ? Number(options.volume) : undefined,
            loop: Boolean(options.loop),
            force: Boolean(options.force)
        });

        return true;
    });

    /**
     * openMediaPlayer() - Open the MediaPlayer app
     */
    interpreter.registerBuiltin('openMediaPlayer', () => {
        const CommandBus = interpreter.context.CommandBus;
        if (!CommandBus) return false;

        CommandBus.execute('app:launch', { appId: 'mediaplayer' });
        return true;
    });

    /**
     * openMediaPlayer() - Open the Media Player app
     */
    interpreter.registerBuiltin('openMediaPlayer', () => {
        const CommandBus = interpreter.context.CommandBus;
        if (!CommandBus) return false;

        CommandBus.execute('app:launch', { appId: 'mediaplayer' });
        return true;
    });
}

export default registerMediaBuiltins;
