/**
 * Example Plugin for IlluminatOS!
 * Demonstrates how to create a plugin that adds a new feature
 *
 * Plugin Structure:
 * - index.js: Plugin entry point (this file)
 * - ExampleFeature.js: Feature implementation
 *
 * To install this plugin:
 * 1. Place the plugin folder in /plugins/features/
 * 2. Add to plugin manifest in localStorage or use PluginLoader.addToManifest()
 * 3. Restart IlluminatOS! or call PluginLoader.loadPluginFromPath()
 */

import ExampleFeature from './ExampleFeature.js';

// Plugin definition
export default {
    // Required: Unique identifier for the plugin
    id: 'example-plugin',

    // Required: Display name
    name: 'Example Plugin',

    // Version (semantic versioning recommended)
    version: '1.0.0',

    // Author information
    author: 'IlluminatOS! Team',

    // Description
    description: 'An example plugin demonstrating the IlluminatOS! plugin system',

    // Features provided by this plugin (instances of FeatureBase)
    features: [
        new ExampleFeature()
    ],

    // Apps provided by this plugin (instances of AppBase)
    apps: [],

    // Called when plugin is loaded
    onLoad: () => {
        console.log('[ExamplePlugin] Plugin loaded successfully!');
    },

    // Called when plugin is unloaded
    onUnload: () => {
        console.log('[ExamplePlugin] Plugin unloaded');
    }
};
