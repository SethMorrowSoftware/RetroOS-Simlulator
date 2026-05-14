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
 * The schema is now split into domain-specific modules under core/schema/.
 * This file re-exports everything for backward compatibility.
 */

export {
    EventSchema,
    getEventSchema,
    getEventsByNamespace,
    getAllEvents,
    isEventRegistered,
} from './schema/index.js';

export { default } from './schema/index.js';
