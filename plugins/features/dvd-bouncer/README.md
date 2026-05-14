# 📀 DVD Bouncer Plugin

A nostalgic bouncing DVD logo screensaver that brings back memories of the classic DVD player screensaver. Watch the logo bounce around the screen and celebrate those rare perfect corner hits! 🎯

## Features

- **Classic Animation**: Bouncing DVD logo with smooth movement
- **Color Changes**: Logo changes color on every wall bounce
- **Corner Hit Tracking**: Keep count of those legendary perfect corner hits
- **Auto-start**: Automatically activates after a period of inactivity (configurable)
- **Configurable Settings**:
  - Bounce speed (1-10)
  - Logo size (40-200px)
  - Idle timeout (10-300 seconds)
  - Auto-start on/off

## Installation

The DVD Bouncer plugin is included by default in IlluminatOS!. It's automatically registered during the boot sequence in Phase 2.5 (Plugin System).

### Manual Installation (for custom plugins)

If you're creating your own plugin based on DVD Bouncer, here's how to register it:

```javascript
// In index.js, Phase 2.5: Load Plugins
await initComponent('PluginLoader', async () => {
    const manifest = PluginLoader.getPluginManifest();

    // Add your plugin (path is relative to /core/ directory)
    manifest.plugins.push({
        path: '../plugins/features/your-plugin/index.js',
        enabled: true
    });

    PluginLoader.savePluginManifest(manifest);
    await PluginLoader.loadAllPlugins();
});
```

### Console Testing

```javascript
// In browser console
import PluginLoader from './core/PluginLoader.js';

// Check if DVD Bouncer is loaded
PluginLoader.isLoaded('dvd-bouncer-plugin');

// Get plugin status
PluginLoader.logStatus();
```

## Usage

### Auto-start Mode
Once enabled, the screensaver will automatically start after the configured idle timeout (default: 60 seconds).

### Manual Control
You can also control the screensaver programmatically:

```javascript
// Get the feature instance
const dvdBouncer = FeatureRegistry.get('dvd-bouncer');

// Start the screensaver
dvdBouncer.start();

// Stop the screensaver
dvdBouncer.stop();
```

### Dismissing the Screensaver
Click anywhere on the screen to dismiss the screensaver, or press any key/move the mouse.

## Configuration

Access settings through Settings > Features > DVD Bouncer:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| Bounce Speed | Number (1-10) | 2 | How fast the logo bounces |
| Logo Size | Number (40-200) | 80 | Size of the DVD logo in pixels |
| Idle Timeout | Number (10-300) | 60 | Seconds of inactivity before auto-start |
| Auto-start on Idle | Boolean | true | Whether to auto-start after idle timeout |

## Events

The plugin emits the following events that other features can subscribe to:

### `dvd-bouncer:started`
Emitted when the screensaver starts.

```javascript
import EventBus from './core/EventBus.js';

EventBus.on('dvd-bouncer:started', (data) => {
    console.log('Screensaver started at:', data.timestamp);
});
```

### `dvd-bouncer:stopped`
Emitted when the screensaver stops, includes corner hit count.

```javascript
EventBus.on('dvd-bouncer:stopped', (data) => {
    console.log(`Screensaver stopped. Corner hits: ${data.cornerHits}`);
});
```

### `dvd-bouncer:corner-hit`
Emitted each time the logo hits a perfect corner.

```javascript
EventBus.on('dvd-bouncer:corner-hit', (data) => {
    console.log(`Corner hit #${data.count}!`);
});
```

## Fun Facts

- The DVD logo changes to a random color on every bounce
- Perfect corner hits trigger a special celebration message
- Every 5th corner hit gets an extra legendary message
- The feature tracks your corner hit count during each session

## Technical Details

### Dependencies
- Extends `FeatureBase` from IlluminatOS! core
- Uses `EventBus` for event emission
- Integrated with `FeatureRegistry` for lifecycle management

### File Structure
```
dvd-bouncer/
├── index.js              # Plugin manifest
├── DVDBouncerFeature.js  # Main feature implementation
└── README.md             # This file
```

### Architecture
- **Idle Detection**: Monitors mouse, keyboard, and window events
- **Animation Loop**: Uses `requestAnimationFrame` for smooth 60fps animation
- **Collision Detection**: Precise boundary checking for corner hits
- **Event-Driven**: Emits events for integration with other features

## Development

### Extending the Plugin

You can subscribe to the plugin's events to create integrations:

```javascript
// Example: Achievement system integration
EventBus.subscribe('dvd-bouncer:corner-hit', (data) => {
    if (data.count === 10) {
        // Unlock "Corner Master" achievement
        AchievementManager.unlock('corner-master');
    }
});
```

### Customization

Want to customize the colors? Edit the `colors` array in `DVDBouncerFeature.js`:

```javascript
this.colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
];
```

## License

Part of the IlluminatOS! project.

## Credits

Inspired by the classic DVD player screensaver that kept us entertained for hours! 📀✨
