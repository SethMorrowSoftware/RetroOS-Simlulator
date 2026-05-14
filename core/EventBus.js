/**
 * EventBus - Unified event messaging system
 *
 * Re-exports everything from SemanticEventBus.js which is the single
 * source of truth for the event system. This file exists so that all
 * existing imports continue to work without changes.
 *
 * Both import styles are equivalent:
 *   import EventBus, { Events, Priority } from './EventBus.js';
 *   import EventBus, { Events, Priority } from './SemanticEventBus.js';
 *
 * Features:
 *   - Schema validation for event payloads
 *   - Legacy event name mapping (automatic)
 *   - Wildcard subscriptions (e.g., 'window:*')
 *   - Middleware support
 *   - Priority-based listener ordering
 *   - Request/response pattern
 *   - Channels for scoped communication
 *   - Event history and debugging tools
 */

export {
    default,
    Events,
    Priority,
    SemanticEventBus,
    EventBus
} from './SemanticEventBus.js';
