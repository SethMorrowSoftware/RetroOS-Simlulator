import DVDBouncerFeature from './DVDBouncerFeature.js';

/**
 * DVD Bouncer Plugin
 *
 * A nostalgic bouncing DVD logo screensaver that brings back memories
 * of waiting for that perfect corner hit! 📀
 *
 * Features:
 * - Classic bouncing DVD logo animation
 * - Color changes on every bounce
 * - Special celebration for perfect corner hits
 * - Configurable speed, size, and idle timeout
 * - Auto-start after period of inactivity
 * - Click anywhere to exit
 *
 * Installation:
 * 1. Place this plugin folder in plugins/features/
 * 2. Add to manifest using PluginLoader:
 *    ```javascript
 *    import PluginLoader from './core/PluginLoader.js';
 *    PluginLoader.addToManifest({
 *        path: './plugins/features/dvd-bouncer/index.js',
 *        enabled: true
 *    });
 *    await PluginLoader.loadAllPlugins();
 *    ```
 * 3. Or enable it in Settings > Features once loaded
 *
 * Usage:
 * - The screensaver will auto-start after the configured idle timeout
 * - Or manually trigger it via the feature's start() method
 * - Click anywhere to dismiss the screensaver
 * - Try to catch those legendary corner hits! 🎯
 *
 * Events emitted:
 * - dvd-bouncer:started - When screensaver starts
 * - dvd-bouncer:stopped - When screensaver stops (includes corner hit count)
 * - dvd-bouncer:corner-hit - When logo hits a perfect corner
 */

export default {
    // Plugin metadata
    id: 'dvd-bouncer-plugin',
    name: 'DVD Bouncer Screensaver',
    version: '1.0.0',
    author: 'IlluminatOS! Team',
    description: 'Nostalgic bouncing DVD logo screensaver with corner hit tracking',

    // Features provided by this plugin
    features: [
        new DVDBouncerFeature()
    ],

    // Apps provided by this plugin (none for this plugin)
    apps: [],

    // Lifecycle hooks
    onLoad: async () => {
        console.log('📀 DVD Bouncer Plugin loaded! Get ready for some corner-hunting action!');
    },

    onUnload: async () => {
        console.log('📀 DVD Bouncer Plugin unloaded. Thanks for watching!');
    }
};
