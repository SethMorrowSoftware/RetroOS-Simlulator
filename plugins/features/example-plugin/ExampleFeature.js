/**
 * ExampleFeature - A sample feature plugin for IlluminatOS!
 * Demonstrates how to create a feature that extends FeatureBase
 */

import FeatureBase from '../../../core/FeatureBase.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'example-feature',
    name: 'Example Feature',
    description: 'A sample feature demonstrating the plugin system',
    icon: '🔧',
    category: 'plugin',  // Plugins are automatically categorized as 'plugin'
    dependencies: [],    // List other feature IDs this depends on
    config: {
        exampleSetting: true,
        messageInterval: 60000  // 1 minute
    },
    settings: [
        {
            key: 'exampleSetting',
            label: 'Enable Example Messages',
            type: 'checkbox'
        },
        {
            key: 'messageInterval',
            label: 'Message Interval (seconds)',
            type: 'number',
            min: 10,
            max: 300,
            step: 10,
            transform: 'milliseconds'
        }
    ]
};

class ExampleFeature extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.messageTimer = null;
    }

    /**
     * Initialize the feature
     * This is called when the feature is enabled
     */
    async initialize() {
        if (!this.isEnabled()) return;

        this.log('Initializing...');

        // Subscribe to events
        this.subscribe('window:open', (data) => {
            this.onWindowOpen(data);
        });

        // Set up periodic message if enabled
        if (this.getConfig('exampleSetting', true)) {
            this.startMessageTimer();
        }

        // Register a hook that other features can use
        this.registerHook('example:action', (data) => {
            this.log('Hook triggered with data:', data);
            return { success: true };
        });

        this.log('Initialized successfully!');
    }

    /**
     * Cleanup when the feature is disabled
     */
    cleanup() {
        this.stopMessageTimer();
        super.cleanup();
        this.log('Cleaned up');
    }

    /**
     * React to window open events
     */
    onWindowOpen(data) {
        if (!this.isEnabled()) return;

        this.log(`Window opened: ${data.title || data.appId}`);

        // Example: Play a sound when a window opens
        this.playSound('open');
    }

    /**
     * Start the periodic message timer
     */
    startMessageTimer() {
        const interval = this.getConfig('messageInterval', 60000);

        this.stopMessageTimer();  // Clear existing timer

        this.messageTimer = setInterval(() => {
            if (this.getConfig('exampleSetting', true)) {
                this.showMessage();
            }
        }, interval);
    }

    /**
     * Stop the periodic message timer
     */
    stopMessageTimer() {
        if (this.messageTimer) {
            clearInterval(this.messageTimer);
            this.messageTimer = null;
        }
    }

    /**
     * Show an example message
     */
    showMessage() {
        this.log('Example feature is running!');

        // Example: Trigger a hook that other features might listen to
        this.triggerHook('example:message', {
            timestamp: Date.now(),
            message: 'Hello from Example Feature!'
        });
    }

    /**
     * Public method that can be called by other features or apps
     * @param {string} message - Message to display
     */
    displayMessage(message) {
        this.log('Displaying message:', message);

        // Could emit an event, show a dialog, etc.
        this.emit('example:display', { message });
    }
}

export default ExampleFeature;
