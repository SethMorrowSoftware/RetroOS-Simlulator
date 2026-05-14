/**
 * EventSchema - Semantic event definitions with validation
 * Provides type safety, documentation, and validation for all system events
 *
 * Each event has:
 * - namespace: Event category (window, app, system, ui, etc.)
 * - action: What the event does
 * - description: Human-readable description
 * - payload: Expected payload schema (field: type, '?' suffix = optional)
 * - example: Example payload for documentation
 *
 * This index re-assembles the schema from domain-specific modules.
 */

import { windowEvents } from './window.js';
import { appEvents } from './app.js';
import { systemEvents } from './system.js';
import { uiEvents } from './ui.js';
import { inputEvents } from './input.js';
import { mediaEvents } from './media.js';
import { filesystemEvents } from './filesystem.js';
import { dialogEvents } from './dialog.js';
import { stateEvents } from './state.js';
import { scriptingEvents } from './scripting.js';
import { featuresEvents } from './features.js';
import { gamesEvents } from './games.js';
import { appsEvents } from './apps.js';
import { networkEvents } from './network.js';
import { narrativeEvents } from './narrative.js';
import { operationsEvents } from './operations.js';
import { multiplayerEvents } from './multiplayer.js';

export const EventSchema = {
    ...windowEvents,
    ...appEvents,
    ...systemEvents,
    ...uiEvents,
    ...inputEvents,
    ...mediaEvents,
    ...filesystemEvents,
    ...dialogEvents,
    ...stateEvents,
    ...scriptingEvents,
    ...featuresEvents,
    ...gamesEvents,
    ...appsEvents,
    ...networkEvents,
    ...narrativeEvents,
    ...operationsEvents,
    ...multiplayerEvents,
};

/**
 * Get event schema for a given event name
 * @param {string} eventName - Event name
 * @returns {object|null} Event schema or null
 */
export function getEventSchema(eventName) {
    return EventSchema[eventName] || null;
}

/**
 * Get all events in a namespace
 * @param {string} namespace - Namespace (e.g., 'window', 'app')
 * @returns {string[]} Array of event names
 */
export function getEventsByNamespace(namespace) {
    return Object.keys(EventSchema).filter(
        eventName => EventSchema[eventName].namespace === namespace
    );
}

/**
 * Get all registered event names
 * @returns {string[]} Array of all event names
 */
export function getAllEvents() {
    return Object.keys(EventSchema);
}

/**
 * Check if an event is registered
 * @param {string} eventName - Event name
 * @returns {boolean} True if event exists
 */
export function isEventRegistered(eventName) {
    return EventSchema.hasOwnProperty(eventName);
}

export default EventSchema;
