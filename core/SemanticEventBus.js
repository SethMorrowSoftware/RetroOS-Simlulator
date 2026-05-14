/**
 * SemanticEventBus - Enhanced event bus with semantic events, validation, and middleware
 *
 * Extends the basic EventBus with:
 * - Event schema validation
 * - Event metadata (timestamp, source, etc.)
 * - Middleware support
 * - Pattern matching (e.g., 'window:*')
 * - Event logging and debugging
 * - Backward compatibility with old EventBus
 *
 * Usage:
 *   SemanticEventBus.emit('window:open', { id: 'window-1', appId: 'notepad' })
 *   SemanticEventBus.on('window:*', handler)  // Listen to all window events
 *   SemanticEventBus.use((event, next) => { console.log(event); next(); })
 */

import EventSchema from './EventSchema.js';
import SubscriptionManager from './SubscriptionManager.js';

// W4.1 — `LEGACY_EVENT_MAPPING` removed.
//
// Until Wave 4, the bus secretly rewrote old event names into their semantic
// equivalents inside `on()` and `emit()`. Calling
// `EventBus.emit('pet:toggle')` would dispatch as `feature:pet:toggle`,
// invisible to grep. That made debugging awful — a developer searching for
// `'pet:toggle'` saw call sites that "should work" but actually fired a
// different event than the name suggested.
//
// All call sites have been migrated to the semantic names:
//   pet:toggle        → feature:pet:toggle
//   pet:change        → feature:pet:change
//   taskbar:update    → ui:taskbar:update
//   boot:complete     → system:ready
//   startmenu:toggle  → ui:menu:start:toggle
//   contextmenu:show  → ui:menu:context:show
//   contextmenu:hide  → ui:menu:context:hide
//   menu:action       → ui:menu:action
//   screensaver:end   → system:screensaver:end
//
// The schema entries in `core/schema/*.js` retain a `legacyAction` field for
// reference, but the bus no longer rewrites — what you write is what fires.

class SemanticEventBusClass {
    constructor() {
        // Map of event names to arrays of listener objects { callback, priority, once }
        this.listeners = new Map();

        // Pattern listeners (for wildcard subscriptions)
        this.patternListeners = new Map();

        // Middleware functions
        this.middleware = [];

        // Event log for debugging (circular buffer to prevent memory leaks)
        this.eventLog = [];
        this.maxLogSize = 1000; // Increased from 100 for better debugging while preventing memory leaks

        // Configuration
        this.config = {
            validation: true,      // Validate payloads against schema
            logging: false,        // Log events to console
            timestamps: true,      // Add timestamps to events
            trackHistory: true,    // Keep event history
            warnUnknown: true,    // Warn about unknown events
            dropInvalidEvents: false // When true, invalid payloads are not dispatched
        };

        // Debug mode (legacy support)
        this.debug = false;

        // Statistics
        this.stats = {
            emitted: 0,
            validated: 0,
            validationErrors: 0,
            validationWarnings: 0,
            middlewareErrors: 0,
            requestsTotal: 0,
            requestsResolved: 0,
            requestsTimedOut: 0,
            eventsCancelled: 0
        };

        // Request/Response pending requests
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;

        // Channels for scoped communication
        this.channels = new Map(); // channelName -> Set of subscribers

        // Throttle/debounce timers
        this.throttleTimers = new Map();
        this.debounceTimers = new Map();

        // Command registry — single source of truth for command execution.
        // Platform handlers are registered at boot by `core/CommandRegistry.js`;
        // app- and feature-level commands self-register via
        // `EventBus.registerCommand()`.
        this.commandHandlers = new Map(); // command name (no 'command:' prefix) -> handler fn

        // Cached regex for pattern matching (avoid re-creating on every emit)
        this._regexCache = new Map();

        // Event priority levels
        this.PRIORITY = {
            SYSTEM: 1000,    // System-level handlers (run first)
            HIGH: 100,       // High priority
            NORMAL: 0,       // Default priority
            LOW: -100,       // Low priority
            SCRIPT: -500     // User scripts (run last)
        };
    }

    /**
     * Validate that an event name is safe to use.
     * Rejects prototype-pollution keys and names that are not basic strings.
     * @param {string} eventName
     * @returns {boolean}
     * @private
     */
    _isValidEventName(eventName) {
        if (typeof eventName !== 'string' || eventName.trim() === '') return false;
        // Block JS prototype-pollution keys
        const BLOCKED = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__']);
        // Check each colon-delimited segment
        const segments = eventName.split(':');
        return segments.every(seg => !BLOCKED.has(seg));
    }

    /**
     * Configure the event bus
     * @param {object} options - Configuration options
     */
    configure(options) {
        Object.assign(this.config, options);
        if (options.debug !== undefined) {
            this.debug = options.debug;
            this.config.logging = options.debug;
        }
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Event name (can include wildcards like 'window:*')
     * @param {Function} callback - Handler function
     * @param {object} options - Subscription options
     * @param {number} options.priority - Handler priority (higher runs first, default: 0)
     * @param {boolean} options.once - Remove after first call
     * @returns {Function} Unsubscribe function
     */
    on(eventName, callback, options = {}) {
        const { priority = this.PRIORITY.NORMAL, once = false } = options;

        // Guard against prototype-pollution event names
        if (!this._isValidEventName(eventName.replace(/\*/g, '_'))) {
            console.error(`[SemanticEventBus] Rejected invalid event name in on(): "${eventName}"`);
            return () => {}; // no-op unsubscribe
        }

        // Check for pattern (wildcard)
        if (eventName.includes('*')) {
            return this._onPattern(eventName, callback, { priority, once });
        }

        // Regular subscription with priority
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }

        const listener = { callback, priority, once };
        const listeners = this.listeners.get(eventName);
        listeners.push(listener);

        // Sort by priority (descending - higher priority first)
        listeners.sort((a, b) => b.priority - a.priority);

        // Return unsubscribe function, tracked against the active owner
        // (set by SubscriptionManager.runAs). If no owner is active, the
        // unsub is returned unwrapped — caller manages cleanup.
        const unsub = () => this.off(eventName, callback);
        return SubscriptionManager.track(unsub);
    }

    /**
     * Subscribe to an event only once
     * @param {string} eventName - Event name
     * @param {Function} callback - Handler function
     * @param {object} options - Subscription options
     */
    once(eventName, callback, options = {}) {
        // Legacy mapping handled by on()
        return this.on(eventName, callback, { ...options, once: true });
    }

    /**
     * Unsubscribe from an event
     * @param {string} eventName - Event name
     * @param {Function} callback - Handler to remove
     */
    off(eventName, callback) {
        if (this.listeners.has(eventName)) {
            const listeners = this.listeners.get(eventName);
            const index = listeners.findIndex(l => l.callback === callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }

        // Also check pattern listeners
        if (this.patternListeners.has(eventName)) {
            const patternListeners = this.patternListeners.get(eventName);
            const index = patternListeners.findIndex(l => l.callback === callback);
            if (index > -1) {
                patternListeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit an event with validation and middleware
     * @param {string} eventName - Event name from EventSchema
     * @param {object} payload - Event payload
     * @param {object} options - Emit options (validate, metadata, cancellable, etc.)
     * @returns {object} Event object that was emitted (includes cancelled state)
     */
    emit(eventName, payload = {}, options = {}) {
        this.stats.emitted++;

        // Guard against prototype-pollution event names
        if (!this._isValidEventName(eventName)) {
            console.error(`[SemanticEventBus] Rejected invalid event name in emit(): "${eventName}"`);
            return { name: eventName, cancelled: true, error: 'invalid_event_name' };
        }

        // Handle legacy usage (data as non-object)
        if (payload !== null && typeof payload !== 'object') {
            payload = { data: payload };
        }

        // Merge options with defaults
        const emitOptions = {
            validate: this.config.validation,
            log: this.config.logging || this.debug,
            cancellable: false,  // Whether event can be cancelled
            metadata: {},
            ...options
        };

        // Check if event is known - only warn for core platform namespaces.
        // App-scoped events (command:<appId>:*, app:<appId>:*, query:<appId>:*)
        // are dynamically registered by AppBase and do not need schema entries.
        if (this.config.warnUnknown && !EventSchema[eventName]) {
            const parts = eventName.split(':');
            const namespace = parts[0];

            // Skip warnings for app-scoped dynamic events.
            // These have 3+ segments where the second segment is an app ID:
            //   command:inbox:deliverMessage, app:inbox:messageReceived,
            //   query:calculator:getValue, action:result, game:*, etc.
            const isAppScoped = parts.length >= 3 && (
                namespace === 'command' ||
                namespace === 'app' ||
                namespace === 'query'
            );

            if (!isAppScoped) {
                const coreNamespaces = [
                    'system', 'window', 'command', 'fs', 'feature', 'app', 'ui',
                    'dialog', 'sound', 'audio', 'setting', 'desktop', 'icon',
                    'state', 'notification', 'keyboard', 'mouse', 'drag',
                    'screensaver', 'achievement', 'bsod', 'recyclebin',
                    'clipboard', 'script', 'terminal', 'timer', 'macro',
                    'channel', 'perf', 'debug', 'feedback', 'animation',
                    'theme', 'a11y', 'history', 'selection', 'search',
                    'network', 'user', 'session', 'touch', 'gesture',
                    'mediaplayer', 'filesystem', 'features', 'plugins',
                    'mp', 'multiplayer', 'game', 'presence', 'chat', 'dm'
                ];
                if (coreNamespaces.includes(namespace)) {
                    console.warn(`[SemanticEventBus] Unknown core event "${eventName}". Consider adding it to EventSchema.`);
                }
            }
        }

        // Validate payload against schema
        if (emitOptions.validate && EventSchema[eventName]) {
            this.stats.validated++;
            const validation = this._validatePayload(eventName, payload);
            if (!validation.valid) {
                this.stats.validationErrors++;
                console.error(`[SemanticEventBus] Validation failed for "${eventName}":`, validation.errors);
                if (this.config.dropInvalidEvents) {
                    return { name: eventName, payload, cancelled: true, dropped: true };
                }
                // Continue anyway for backward compatibility
            }
        }

        // Create event object with metadata and cancellation support
        const event = {
            name: eventName,
            payload: payload,
            cancelled: false,
            cancellable: emitOptions.cancellable,
            metadata: {
                timestamp: this.config.timestamps ? Date.now() : undefined,
                source: emitOptions.metadata.source || 'unknown',
                validated: emitOptions.validate && !!EventSchema[eventName],
                ...emitOptions.metadata
            },
            // Cancel method for cancellable events
            cancel: () => {
                if (emitOptions.cancellable) {
                    event.cancelled = true;
                    this.stats.eventsCancelled++;
                }
            },
            // Prevent default (alias for cancel)
            preventDefault: () => event.cancel()
        };

        // Log event
        if (emitOptions.log) {
            console.log(`[SemanticEventBus] ${eventName}`, payload, event.metadata);
        }

        // Track in history
        if (this.config.trackHistory) {
            this._addToLog(event);
        }

        // Run through middleware chain, then emit to listeners
        this._runMiddleware(event, () => {
            if (!event.cancelled) {
                this._emitToListeners(event);
            }
        });

        // Forward to multiplayer bridge if flagged and not a remote event
        if (
            !event.cancelled &&
            emitOptions.multiplayer &&
            !payload?._remote &&
            this._multiplayerBridge
        ) {
            try {
                this._multiplayerBridge(
                    eventName,
                    payload,
                    emitOptions.multiplayerChannel || 'lobby'
                );
            } catch (err) {
                console.error('[SemanticEventBus] Multiplayer bridge error:', err);
            }
        }

        return event;
    }

    /**
     * Emit an event with throttling (max once per interval)
     * @param {string} eventName - Event name
     * @param {object} payload - Event payload
     * @param {number} interval - Throttle interval in ms (default: 16ms ~60fps)
     * @param {object} options - Emit options
     */
    emitThrottled(eventName, payload = {}, interval = 16, options = {}) {
        const key = eventName;

        if (this.throttleTimers.has(key)) {
            // Update payload for next emission
            this.throttleTimers.get(key).payload = payload;
            return null;
        }

        // Emit immediately
        const event = this.emit(eventName, payload, options);

        // Set throttle timer
        const timer = {
            payload: null,
            timeout: setTimeout(() => {
                const lastPayload = this.throttleTimers.get(key)?.payload;
                this.throttleTimers.delete(key);
                // Emit final payload if there was one
                if (lastPayload !== null) {
                    this.emit(eventName, lastPayload, options);
                }
            }, interval)
        };
        this.throttleTimers.set(key, timer);

        return event;
    }

    /**
     * Emit an event with debouncing (wait until quiet period)
     * @param {string} eventName - Event name
     * @param {object} payload - Event payload
     * @param {number} delay - Debounce delay in ms
     * @param {object} options - Emit options
     */
    emitDebounced(eventName, payload = {}, delay = 100, options = {}) {
        const key = eventName;

        // Clear existing timer
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }

        // Set new timer
        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            this.emit(eventName, payload, options);
        }, delay);
        this.debounceTimers.set(key, timer);
    }

    /**
     * Request/Response pattern - emit an event and wait for a response
     * @param {string} eventName - Event name (should have corresponding :response event)
     * @param {object} payload - Event payload
     * @param {object} options - Options including timeout
     * @returns {Promise} Promise that resolves with the response
     */
    request(eventName, payload = {}, options = {}) {
        const { timeout = 30000 } = options;

        return new Promise((resolve, reject) => {
            this.stats.requestsTotal++;

            // Generate unique request ID
            const requestId = `req_${++this.requestIdCounter}_${Date.now()}`;

            // Determine response event name
            const responseEvent = options.responseEvent || `${eventName}:response`;

            // Store pending request
            let settled = false;
            const pendingRequest = {
                requestId,
                resolve,
                reject,
                timeout: null,
                eventName,
                responseEvent,
                unsubscribe: null
            };

            // Set timeout — also unsubscribes the response listener to prevent leaks
            pendingRequest.timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                if (pendingRequest.unsubscribe) {
                    pendingRequest.unsubscribe();
                }
                this.pendingRequests.delete(requestId);
                this.stats.requestsTimedOut++;
                reject(new Error(`Request timeout for "${eventName}" after ${timeout}ms`));
            }, timeout);

            this.pendingRequests.set(requestId, pendingRequest);

            // Listen for response (one time)
            const unsubscribe = this.on(responseEvent, (response) => {
                if (response.requestId === requestId) {
                    if (settled) return;
                    settled = true;
                    // Found our response
                    clearTimeout(pendingRequest.timeout);
                    this.pendingRequests.delete(requestId);
                    this.stats.requestsResolved++;
                    unsubscribe();
                    resolve(response);
                }
            });

            // Store unsubscribe so timeout handler can clean up the listener
            pendingRequest.unsubscribe = unsubscribe;

            // Emit the request with requestId in payload
            this.emit(eventName, { ...payload, requestId });
        });
    }

    /**
     * Respond to a request
     * @param {string} responseEvent - Response event name
     * @param {string} requestId - Request ID from the original request
     * @param {object} responsePayload - Response data
     */
    respond(responseEvent, requestId, responsePayload = {}) {
        this.emit(responseEvent, { requestId, ...responsePayload });
    }

    /**
     * Emit to all matching listeners
     * @private
     */
    _emitToListeners(event) {
        const { name, payload, metadata } = event;
        const listenersToRemove = [];

        // Collect all matching listeners with their priorities
        const allListeners = [];

        // Direct listeners
        if (this.listeners.has(name)) {
            const listeners = this.listeners.get(name);
            listeners.forEach((listener, index) => {
                allListeners.push({
                    ...listener,
                    source: 'direct',
                    eventName: name,
                    index
                });
            });
        }

        // Pattern listeners (e.g., 'window:*' matches 'window:open')
        this.patternListeners.forEach((listeners, pattern) => {
            const regex = this._patternToRegex(pattern);
            if (regex.test(name)) {
                listeners.forEach((listener, index) => {
                    allListeners.push({
                        ...listener,
                        source: 'pattern',
                        pattern,
                        index
                    });
                });
            }
        });

        // Sort all listeners by priority (already sorted within each list, but need to merge)
        allListeners.sort((a, b) => b.priority - a.priority);

        // Execute listeners in priority order
        for (const listener of allListeners) {
            // Check if event was cancelled mid-execution
            if (event.cancelled) {
                break;
            }

            try {
                // Pass event object as third param for cancellation support
                listener.callback(payload, metadata, event);

                // Track once listeners for removal
                if (listener.once) {
                    listenersToRemove.push(listener);
                }
            } catch (error) {
                const source = listener.source === 'pattern'
                    ? `pattern listener "${listener.pattern}"`
                    : `listener`;
                console.error(`[SemanticEventBus] Error in ${source} for "${name}":`, error);
            }
        }

        // Remove once listeners
        for (const listener of listenersToRemove) {
            if (listener.source === 'direct') {
                const listeners = this.listeners.get(listener.eventName);
                if (listeners) {
                    const index = listeners.findIndex(l => l.callback === listener.callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            } else {
                const listeners = this.patternListeners.get(listener.pattern);
                if (listeners) {
                    const index = listeners.findIndex(l => l.callback === listener.callback);
                    if (index > -1) listeners.splice(index, 1);
                }
            }
        }
    }

    /**
     * Add middleware function
     * Middleware receives (event, next) and must call next() to continue
     * @param {Function} fn - Middleware function
     */
    use(fn) {
        this.middleware.push(fn);
    }

    /**
     * Remove middleware function
     * @param {Function} fn - Middleware function to remove
     */
    removeMiddleware(fn) {
        const index = this.middleware.indexOf(fn);
        if (index > -1) {
            this.middleware.splice(index, 1);
        }
    }

    /**
     * Run middleware chain
     * @private
     */
    _runMiddleware(event, done) {
        let index = 0;

        const next = () => {
            if (index >= this.middleware.length) {
                done();
                return;
            }

            const middleware = this.middleware[index++];
            try {
                middleware(event, next);
            } catch (error) {
                this.stats.middlewareErrors++;
                console.error('[SemanticEventBus] Middleware error:', error);
                next(); // Continue despite error
            }
        };

        next();
    }

    /**
     * Subscribe to events matching a pattern
     * @private
     */
    _onPattern(pattern, callback, options = {}) {
        const { priority = this.PRIORITY.NORMAL, once = false } = options;

        if (!this.patternListeners.has(pattern)) {
            this.patternListeners.set(pattern, []);
        }

        const listener = { callback, priority, once };
        const listeners = this.patternListeners.get(pattern);
        listeners.push(listener);

        // Sort by priority (descending)
        listeners.sort((a, b) => b.priority - a.priority);

        // Return unsubscribe function, tracked against the active owner
        const unsub = () => {
            if (this.patternListeners.has(pattern)) {
                const patternListeners = this.patternListeners.get(pattern);
                const index = patternListeners.findIndex(l => l.callback === callback);
                if (index > -1) {
                    patternListeners.splice(index, 1);
                }
            }
        };
        return SubscriptionManager.track(unsub);
    }

    /**
     * Convert glob pattern to regex
     * @private
     */
    _patternToRegex(pattern) {
        if (this._regexCache.has(pattern)) {
            return this._regexCache.get(pattern);
        }
        const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
        const regexStr = escaped.replace(/\*/g, '.*');
        const regex = new RegExp(`^${regexStr}$`);
        this._regexCache.set(pattern, regex);
        return regex;
    }

    /**
     * Validate payload against event schema
     * @private
     */
    _validatePayload(eventName, payload) {
        const schema = EventSchema[eventName];
        if (!schema || !schema.payload) {
            return { valid: true, errors: [] };
        }

        const errors = [];

        for (const [key, type] of Object.entries(schema.payload)) {
            const isOptional = type.endsWith('?');
            const baseType = isOptional ? type.slice(0, -1) : type;
            const value = payload[key];

            // Check required fields
            if (!isOptional && value === undefined) {
                errors.push(`Missing required field "${key}"`);
                continue;
            }

            // Check type if value exists
            if (value !== undefined && !this._checkType(value, baseType)) {
                errors.push(`Invalid type for "${key}": expected ${baseType}, got ${typeof value}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Check if value matches expected type
     * @private
     */
    _checkType(value, type) {
        if (type === 'any') return true;
        if (type === 'array') return Array.isArray(value);
        if (type === 'object') return typeof value === 'object' && !Array.isArray(value) && value !== null;
        if (type === 'HTMLElement') return value instanceof HTMLElement;
        return typeof value === type;
    }

    /**
     * Add event to log
     * @private
     */
    _addToLog(event) {
        this.eventLog.push(event);
        if (this.eventLog.length > this.maxLogSize) {
            this.eventLog.shift();
        }
    }

    /**
     * Remove all listeners for an event (or all events)
     * @param {string} [event] - Optional event name
     */
    clear(event = null) {
        if (event) {
            this.listeners.delete(event);
            this.patternListeners.delete(event);
        } else {
            this.listeners.clear();
            this.patternListeners.clear();
            this._regexCache.clear();
        }
    }

    /**
     * Get count of listeners for an event
     * @param {string} event - Event name
     * @returns {number} Listener count
     */
    listenerCount(event) {
        const direct = this.listeners.has(event) ? this.listeners.get(event).length : 0;
        const pattern = this.patternListeners.has(event) ? this.patternListeners.get(event).length : 0;
        return direct + pattern;
    }

    // ==========================================
    // DEBUGGING & INTROSPECTION
    // ==========================================

    /**
     * Get event log history
     * @param {number} limit - Max events to return
     * @returns {Array} Event log
     */
    getEventLog(limit = this.maxLogSize) {
        return this.eventLog.slice(-limit);
    }

    /**
     * Clear event log
     */
    clearEventLog() {
        this.eventLog = [];
    }

    /**
     * Get all registered events from schema
     * @returns {string[]} Array of event names
     */
    getRegisteredEvents() {
        return Object.keys(EventSchema);
    }

    /**
     * Get event schema for an event
     * @param {string} eventName - Event name
     * @returns {object|null} Event schema
     */
    getEventSchema(eventName) {
        return EventSchema[eventName] || null;
    }

    /**
     * Get events by namespace
     * @param {string} namespace - Namespace (e.g., 'window', 'app')
     * @returns {string[]} Array of event names
     */
    getEventsByNamespace(namespace) {
        return Object.keys(EventSchema).filter(
            name => EventSchema[name].namespace === namespace
        );
    }

    /**
     * Get statistics
     * @returns {object} Statistics object
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            emitted: 0,
            validated: 0,
            validationErrors: 0,
            validationWarnings: 0,
            middlewareErrors: 0,
            requestsTotal: 0,
            requestsResolved: 0,
            requestsTimedOut: 0,
            eventsCancelled: 0
        };
    }

    /**
     * Schema coverage diagnostic. Returns the ratio of emitted-so-far events
     * that had a registered schema entry, plus the list of names that didn't.
     * App-scoped names (`command:<appId>:*`, `app:<appId>:*`, `query:<appId>:*`)
     * are excluded — they're created dynamically and have no static schema.
     *
     * Pair with the static `scripts/check-event-schema-coverage.mjs` gate to
     * catch regressions both pre-commit and at runtime.
     */
    getSchemaCoverage() {
        const seen = new Set();
        let total = 0;
        let covered = 0;
        const missing = new Set();
        for (const event of this.eventLog) {
            const name = event.name;
            if (seen.has(name)) continue;
            seen.add(name);

            const parts = name.split(':');
            const appScoped = parts.length >= 3 && ['command', 'app', 'query'].includes(parts[0])
                && !['fs', 'window', 'terminal', 'system', 'media', 'sound', 'desktop'].includes(parts[1]);
            if (appScoped) continue;

            total++;
            if (EventSchema[name]) covered++;
            else missing.add(name);
        }
        return {
            total,
            covered,
            ratio: total === 0 ? 1 : covered / total,
            missing: [...missing].sort()
        };
    }

    // ==========================================
    // CHANNEL METHODS (Scoped Communication)
    // ==========================================

    /**
     * Create or join a channel for scoped communication
     * @param {string} channelName - Channel name
     * @param {string} subscriberId - Subscriber identifier
     * @returns {object} Channel interface with send/receive methods
     */
    channel(channelName, subscriberId) {
        // Initialize channel if not exists
        if (!this.channels.has(channelName)) {
            this.channels.set(channelName, new Set());
        }

        const channel = this.channels.get(channelName);
        channel.add(subscriberId);

        // Emit subscription event
        this.emit('channel:subscribe', { channel: channelName, subscriber: subscriberId });

        // Return channel interface
        return {
            name: channelName,
            subscriberId,

            /**
             * Send a message to the channel
             */
            send: (message) => {
                this.emit('channel:message', {
                    channel: channelName,
                    message,
                    sender: subscriberId
                });
            },

            /**
             * Listen to messages on this channel
             */
            receive: (handler, options = {}) => {
                return this.on('channel:message', (payload) => {
                    if (payload.channel === channelName && payload.sender !== subscriberId) {
                        handler(payload.message, payload.sender);
                    }
                }, options);
            },

            /**
             * Leave the channel
             */
            leave: () => {
                if (this.channels.has(channelName)) {
                    this.channels.get(channelName).delete(subscriberId);
                    this.emit('channel:unsubscribe', { channel: channelName, subscriber: subscriberId });

                    // Clean up empty channels
                    if (this.channels.get(channelName).size === 0) {
                        this.channels.delete(channelName);
                    }
                }
            },

            /**
             * Get all subscribers in the channel
             */
            getSubscribers: () => {
                return [...(this.channels.get(channelName) || [])];
            }
        };
    }

    /**
     * Broadcast to all subscribers in a channel
     * @param {string} channelName - Channel name
     * @param {any} message - Message to broadcast
     * @param {string} sender - Sender identifier
     */
    broadcast(channelName, message, sender = 'system') {
        this.emit('channel:message', {
            channel: channelName,
            message,
            sender
        });
    }

    /**
     * Get list of active channels
     * @returns {string[]} Array of channel names
     */
    getChannels() {
        return [...this.channels.keys()];
    }

    /**
     * Get subscribers for a channel
     * @param {string} channelName - Channel name
     * @returns {string[]} Array of subscriber IDs
     */
    getChannelSubscribers(channelName) {
        return [...(this.channels.get(channelName) || [])];
    }

    // ==========================================
    // CONVENIENCE METHODS FOR SCRIPTING
    // ==========================================

    /**
     * Wait for an event to occur (Promise-based)
     * @param {string} eventName - Event to wait for
     * @param {object} options - Options including timeout and filter
     * @returns {Promise} Resolves with event payload
     */
    waitFor(eventName, options = {}) {
        const { timeout = 30000, filter = null } = options;

        return new Promise((resolve, reject) => {
            let timeoutId;

            const unsubscribe = this.on(eventName, (payload, metadata) => {
                // Apply filter if provided
                if (filter && !filter(payload)) {
                    return;
                }

                clearTimeout(timeoutId);
                unsubscribe();
                resolve({ payload, metadata });
            });

            if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    unsubscribe();
                    reject(new Error(`Timeout waiting for event "${eventName}" after ${timeout}ms`));
                }, timeout);
            }
        });
    }

    /**
     * Create an event stream (async iterator)
     * @param {string} eventName - Event to stream
     * @param {object} options - Options including filter
     * @returns {AsyncGenerator} Async iterator of events
     */
    stream(eventName, options = {}) {
        const { filter = null } = options;
        const eventBus = this;

        return {
            [Symbol.asyncIterator]() {
                const queue = [];
                let resolve = null;
                let closed = false;

                const unsubscribe = eventBus.on(eventName, (payload, metadata) => {
                    if (filter && !filter(payload)) return;

                    const event = { payload, metadata };
                    if (resolve) {
                        resolve({ value: event, done: false });
                        resolve = null;
                    } else {
                        queue.push(event);
                    }
                });

                return {
                    next() {
                        if (closed) {
                            return Promise.resolve({ done: true });
                        }
                        if (queue.length > 0) {
                            return Promise.resolve({ value: queue.shift(), done: false });
                        }
                        return new Promise(r => { resolve = r; });
                    },
                    return() {
                        closed = true;
                        unsubscribe();
                        return Promise.resolve({ done: true });
                    }
                };
            }
        };
    }

    /**
     * Pipe events from one event to another with optional transformation
     * @param {string} sourceEvent - Source event name
     * @param {string} targetEvent - Target event name
     * @param {Function} transform - Optional transform function
     * @returns {Function} Unsubscribe function
     */
    pipe(sourceEvent, targetEvent, transform = null) {
        return this.on(sourceEvent, (payload, metadata) => {
            const transformedPayload = transform ? transform(payload) : payload;
            if (transformedPayload !== null && transformedPayload !== undefined) {
                this.emit(targetEvent, transformedPayload, {
                    metadata: { ...metadata, pipedFrom: sourceEvent }
                });
            }
        });
    }

    /**
     * Create a filtered view of events
     * @param {string} eventName - Event to filter
     * @param {Function} predicate - Filter predicate
     * @param {string} newEventName - New event name for filtered events
     * @returns {Function} Unsubscribe function
     */
    filter(eventName, predicate, newEventName) {
        return this.pipe(eventName, newEventName, (payload) => {
            return predicate(payload) ? payload : null;
        });
    }

    /**
     * Combine multiple events into one
     * @param {string[]} eventNames - Events to combine
     * @param {string} combinedEventName - Combined event name
     * @param {Function} reducer - Function to combine payloads
     * @returns {Function} Unsubscribe function
     */
    combine(eventNames, combinedEventName, reducer = null) {
        const latestPayloads = {};
        const unsubscribers = [];

        eventNames.forEach(eventName => {
            const unsub = this.on(eventName, (payload) => {
                latestPayloads[eventName] = payload;

                // Check if we have all payloads
                const allPresent = eventNames.every(e => e in latestPayloads);
                if (allPresent) {
                    const combined = reducer
                        ? reducer(latestPayloads)
                        : { ...latestPayloads };
                    this.emit(combinedEventName, combined);
                }
            });
            unsubscribers.push(unsub);
        });

        return () => {
            unsubscribers.forEach(unsub => unsub());
            // Clear references to prevent memory leaks from retained payloads
            Object.keys(latestPayloads).forEach(k => delete latestPayloads[k]);
        };
    }

    /**
     * Get all active listeners (for debugging)
     * @returns {object} Map of event names to listener counts
     */
    getActiveListeners() {
        const result = {};

        // Direct listeners (now arrays)
        this.listeners.forEach((listeners, event) => {
            if (listeners.length > 0) {
                result[event] = listeners.length;
            }
        });

        // Pattern listeners (now arrays)
        const patterns = {};
        this.patternListeners.forEach((listeners, pattern) => {
            if (listeners.length > 0) {
                patterns[pattern] = listeners.length;
            }
        });

        if (Object.keys(patterns).length > 0) {
            result._patterns = patterns;
        }

        return result;
    }

    // ==========================================
    // COMMAND REGISTRY
    // ==========================================

    /**
     * Register a command handler. The handler receives the payload and may
     * return a value (or Promise) — the requestId/action:result protocol is
     * handled here.
     *
     * @param {string} command - Command name without the `command:` prefix
     *                           (e.g. `app:launch`, `fs:read`).
     * @param {Function} handler - async (payload) => result
     * @returns {Function} Unregister function (tracked by SubscriptionManager
     *                     when called inside a `runAs` scope).
     */
    registerCommand(command, handler) {
        if (typeof command !== 'string' || !command.trim()) {
            console.error('[SemanticEventBus] registerCommand: invalid command name', command);
            return () => {};
        }
        if (typeof handler !== 'function') {
            console.error(`[SemanticEventBus] registerCommand("${command}"): handler is not a function`);
            return () => {};
        }
        this.commandHandlers.set(command, handler);
        const unsub = () => {
            // Only delete if still owned by this handler (avoids stomping a
            // re-register from a different owner).
            if (this.commandHandlers.get(command) === handler) {
                this.commandHandlers.delete(command);
            }
        };
        return SubscriptionManager.track(unsub);
    }

    /**
     * Execute a registered command. Emits `action:result` when the payload
     * carries a `requestId` so callers using the request/response protocol
     * receive the outcome.
     *
     * @param {string} command - Command name without the `command:` prefix.
     * @param {object} payload - Command payload (may include `requestId`).
     * @returns {Promise<{success: boolean, data?: any, error?: string}>}
     */
    async executeCommand(command, payload = {}) {
        const { requestId } = payload || {};
        const handler = this.commandHandlers.get(command);

        if (!handler) {
            console.warn(`[SemanticEventBus] Unknown command: ${command}`);
            if (requestId) {
                this.emit('action:result', { requestId, success: false, error: `Unknown command: ${command}` });
            }
            return { success: false, error: `Unknown command: ${command}` };
        }

        try {
            const result = await handler(payload);
            if (requestId) {
                this.emit('action:result', { requestId, success: true, data: result });
            }
            return { success: true, data: result };
        } catch (error) {
            const message = error?.message || String(error);
            console.error(`[SemanticEventBus] Error executing "${command}":`, error);
            if (requestId) {
                this.emit('action:result', { requestId, success: false, error: message });
            }
            return { success: false, error: message };
        }
    }

    /**
     * Check whether a command is registered.
     * @param {string} command
     * @returns {boolean}
     */
    hasCommand(command) {
        return this.commandHandlers.has(command);
    }

    /**
     * List registered commands (for diagnostics).
     * @returns {string[]}
     */
    getCommands() {
        return [...this.commandHandlers.keys()];
    }

    // ===== Multiplayer Bridge =====

    /**
     * Set the multiplayer bridge callback.
     * When set, events emitted with { multiplayer: true } in options
     * will be forwarded to the MultiplayerClient for broadcast.
     * @param {Function|null} bridge - Callback(eventName, payload, options) or null to disable
     */
    setMultiplayerBridge(bridge) {
        this._multiplayerBridge = typeof bridge === 'function' ? bridge : null;
    }

    /**
     * Emit an event with multiplayer forwarding.
     * Convenience wrapper that sets the multiplayer flag in options.
     * @param {string} eventName - Event name
     * @param {Object} payload - Event payload
     * @param {string} channel - Multiplayer channel/room to broadcast to
     * @param {Object} options - Additional emit options
     * @returns {Object} Event object
     */
    emitMultiplayer(eventName, payload = {}, channel = 'lobby', options = {}) {
        return this.emit(eventName, payload, {
            ...options,
            multiplayer: true,
            multiplayerChannel: channel
        });
    }
}

// Create singleton instance
const SemanticEventBus = new SemanticEventBusClass();

// Export event constants for backward compatibility
export const Events = {
    // Window events
    WINDOW_CREATE: 'window:create',
    WINDOW_OPEN: 'window:open',
    WINDOW_CLOSE: 'window:close',
    WINDOW_FOCUS: 'window:focus',
    WINDOW_MINIMIZE: 'window:minimize',
    WINDOW_MAXIMIZE: 'window:maximize',
    WINDOW_RESTORE: 'window:restore',
    WINDOW_RESIZE: 'window:resize',
    WINDOW_MOVE: 'window:move',
    WINDOW_MOVE_START: 'window:move:start',
    WINDOW_MOVE_END: 'window:move:end',
    WINDOW_RESIZE_START: 'window:resize:start',
    WINDOW_RESIZE_END: 'window:resize:end',
    WINDOW_SNAP: 'window:snap',
    WINDOW_TITLEBAR_CLICK: 'window:titlebar:click',
    WINDOW_SHAKE: 'window:shake',
    WINDOW_FLASH: 'window:flash',

    // Taskbar events
    TASKBAR_UPDATE: 'ui:taskbar:update',

    // Icon events
    ICON_CLICK: 'icon:click',
    ICON_DBLCLICK: 'icon:dblclick',
    ICON_MOVE: 'icon:move',
    ICON_DELETE: 'icon:delete',

    // App events
    APP_LAUNCH: 'app:launch',
    APP_OPEN: 'app:open',
    APP_CLOSE: 'app:close',
    APP_FOCUS: 'app:focus',
    APP_BLUR: 'app:blur',
    APP_READY: 'app:ready',
    APP_BUSY: 'app:busy',
    APP_IDLE: 'app:idle',
    APP_ERROR: 'app:error',
    APP_STATE_CHANGE: 'app:state:change',
    APP_MESSAGE: 'app:message',
    APP_BROADCAST: 'app:broadcast',
    APP_REGISTERED: 'app:registered',

    // Menu events
    START_MENU_TOGGLE: 'ui:menu:start:toggle',
    START_MENU_OPEN: 'ui:menu:start:open',
    START_MENU_CLOSE: 'ui:menu:start:close',
    CONTEXT_MENU_SHOW: 'ui:menu:context:show',
    CONTEXT_MENU_HIDE: 'ui:menu:context:hide',
    MENU_ACTION: 'ui:menu:action',

    // System events
    SYSTEM_BOOT: 'system:boot',
    SYSTEM_BOOT_PHASE: 'system:boot:phase',
    BOOT_COMPLETE: 'system:ready',
    SYSTEM_READY: 'system:ready',
    SHUTDOWN: 'system:shutdown',
    SYSTEM_IDLE: 'system:idle',
    SYSTEM_ACTIVE: 'system:active',
    SYSTEM_SLEEP: 'system:sleep',
    SYSTEM_WAKE: 'system:wake',
    SYSTEM_ERROR: 'system:error',
    SYSTEM_WARNING: 'system:warning',
    SYSTEM_FOCUS: 'system:focus',
    SYSTEM_BLUR: 'system:blur',
    SYSTEM_VISIBILITY_CHANGE: 'system:visibility:change',
    SYSTEM_ONLINE: 'system:online',
    SYSTEM_OFFLINE: 'system:offline',
    SYSTEM_RESIZE: 'system:resize',
    SYSTEM_FULLSCREEN_ENTER: 'system:fullscreen:enter',
    SYSTEM_FULLSCREEN_EXIT: 'system:fullscreen:exit',
    SYSTEM_MEMORY_WARNING: 'system:memory:warning',
    SYSTEM_STORAGE_WARNING: 'system:storage:warning',
    SYSTEM_STORAGE_FULL: 'system:storage:full',
    SCREENSAVER_START: 'system:screensaver:start',
    SCREENSAVER_END: 'system:screensaver:end',

    // User session lifecycle
    USER_LOGIN: 'user:login',
    USER_LOGOUT: 'user:logout',
    USER_SWITCH: 'user:switch',
    AUTH_EXPIRED: 'auth:expired',

    // Achievement events
    ACHIEVEMENT_UNLOCK: 'achievement:unlock',
    ACHIEVEMENT_PROGRESS: 'achievement:progress',
    ACHIEVEMENT_CHECK: 'achievement:check',

    // Sound events
    SOUND_PLAY: 'sound:play',
    VOLUME_CHANGE: 'sound:volume',
    SOUND_SET_VOLUME: 'sound:setVolume',

    // Audio playback events
    AUDIO_PLAY: 'audio:play',
    AUDIO_STOP: 'audio:stop',
    AUDIO_STOP_ALL: 'audio:stopall',
    AUDIO_PAUSE: 'audio:pause',
    AUDIO_RESUME: 'audio:resume',
    AUDIO_ENDED: 'audio:ended',
    AUDIO_ERROR: 'audio:error',
    AUDIO_LOADED: 'audio:loaded',
    AUDIO_TIME_UPDATE: 'audio:timeupdate',

    // Video playback events
    VIDEO_PLAY: 'mediaplayer:play',
    VIDEO_PAUSE: 'mediaplayer:pause',
    VIDEO_STOP: 'mediaplayer:stop',
    VIDEO_ENDED: 'mediaplayer:ended',
    VIDEO_LOADED: 'mediaplayer:loaded',
    VIDEO_ERROR: 'mediaplayer:error',
    VIDEO_SEEK: 'mediaplayer:seek',
    VIDEO_TIME_UPDATE: 'mediaplayer:timeupdate',
    VIDEO_FULLSCREEN: 'mediaplayer:fullscreen',
    VIDEO_PLAYING: 'mediaplayer:playing',
    VIDEO_PLAYLIST_ADD: 'mediaplayer:playlist:add',
    VIDEO_PLAYLIST_ENDED: 'mediaplayer:playlist:ended',

    // State events
    STATE_CHANGE: 'state:change',

    // Drag events
    DRAG_START: 'drag:start',
    DRAG_MOVE: 'drag:move',
    DRAG_END: 'drag:end',

    // Pet events
    PET_TOGGLE: 'feature:pet:toggle',
    PET_CHANGE: 'feature:pet:change',

    // Setting events
    SETTING_CHANGED: 'setting:changed',

    // Desktop events
    DESKTOP_RENDER: 'desktop:render',
    DESKTOP_REFRESH: 'desktop:refresh',
    DESKTOP_ARRANGE: 'desktop:arrange',
    DESKTOP_BG_CHANGE: 'desktop:bg-change',
    DESKTOP_SETTINGS_CHANGE: 'desktop:settings-change',

    // Screensaver events (settings/control)
    SCREENSAVER_SETTINGS_START: 'screensaver:start',
    SCREENSAVER_UPDATE_DELAY: 'screensaver:update-delay',
    SCREENSAVER_UPDATE_TYPE: 'screensaver:update-type',

    // Dialog events
    DIALOG_ALERT: 'dialog:alert',
    DIALOG_ALERT_RESPONSE: 'dialog:alert:response',
    DIALOG_CONFIRM: 'dialog:confirm',
    DIALOG_CONFIRM_RESPONSE: 'dialog:confirm:response',
    DIALOG_PROMPT: 'dialog:prompt',
    DIALOG_PROMPT_RESPONSE: 'dialog:prompt:response',
    DIALOG_FILE_OPEN: 'dialog:file-open',
    DIALOG_FILE_OPEN_RESPONSE: 'dialog:file-open:response',
    DIALOG_FILE_SAVE: 'dialog:file-save',
    DIALOG_FILE_SAVE_RESPONSE: 'dialog:file-save:response',

    // Filesystem events
    FILESYSTEM_CHANGED: 'filesystem:changed',
    FS_FILE_CREATE: 'fs:file:create',
    FS_FILE_READ: 'fs:file:read',
    FS_FILE_UPDATE: 'fs:file:update',
    FS_FILE_DELETE: 'fs:file:delete',
    FS_FILE_RENAME: 'fs:file:rename',
    FS_FILE_MOVE: 'fs:file:move',
    FS_FILE_COPY: 'fs:file:copy',
    FS_DIRECTORY_CREATE: 'fs:directory:create',
    FS_DIRECTORY_DELETE: 'fs:directory:delete',
    FS_DIRECTORY_RENAME: 'fs:directory:rename',
    FS_DIRECTORY_OPEN: 'fs:directory:open',
    FS_ERROR: 'fs:error',
    FS_PERMISSION_DENIED: 'fs:permission:denied',
    FS_WATCH_CHANGE: 'fs:watch:change',

    // Recycle bin events
    RECYCLEBIN_UPDATE: 'recyclebin:update',
    RECYCLEBIN_RECYCLE_FILE: 'recyclebin:recycle-file',
    RECYCLEBIN_RESTORE: 'recyclebin:restore',
    RECYCLEBIN_EMPTY: 'recyclebin:empty',

    // Notification events
    NOTIFICATION_SHOW: 'notification:show',
    NOTIFICATION_DISMISS: 'notification:dismiss',

    // Clipboard events
    CLIPBOARD_COPY: 'clipboard:copy',
    CLIPBOARD_PASTE: 'clipboard:paste',

    // Keyboard events
    KEYBOARD_SHORTCUT: 'keyboard:shortcut',
    KEYBOARD_KEYDOWN: 'keyboard:keydown',
    KEYBOARD_KEYUP: 'keyboard:keyup',
    KEYBOARD_INPUT: 'keyboard:input',
    KEYBOARD_COMBO: 'keyboard:combo',

    // Mouse events
    MOUSE_MOVE: 'mouse:move',
    MOUSE_CLICK: 'mouse:click',
    MOUSE_DBLCLICK: 'mouse:dblclick',
    MOUSE_DOWN: 'mouse:down',
    MOUSE_UP: 'mouse:up',
    MOUSE_CONTEXTMENU: 'mouse:contextmenu',
    MOUSE_SCROLL: 'mouse:scroll',
    MOUSE_ENTER: 'mouse:enter',
    MOUSE_LEAVE: 'mouse:leave',

    // Touch events
    TOUCH_START: 'touch:start',
    TOUCH_MOVE: 'touch:move',
    TOUCH_END: 'touch:end',
    TOUCH_CANCEL: 'touch:cancel',

    // Gesture events
    GESTURE_TAP: 'gesture:tap',
    GESTURE_DOUBLETAP: 'gesture:doubletap',
    GESTURE_LONGPRESS: 'gesture:longpress',
    GESTURE_SWIPE: 'gesture:swipe',
    GESTURE_PINCH: 'gesture:pinch',
    GESTURE_ROTATE: 'gesture:rotate',

    // Script/automation events
    SCRIPT_START: 'script:start',
    SCRIPT_EXECUTE: 'script:execute',
    SCRIPT_STATEMENT: 'script:statement',
    SCRIPT_COMPLETE: 'script:complete',
    SCRIPT_ERROR: 'script:error',
    SCRIPT_OUTPUT: 'script:output',
    SCRIPT_VARIABLE_SET: 'script:variable:set',
    SCRIPT_FUNCTION_CALL: 'script:function:call',
    SCRIPT_EVENT_SUBSCRIBE: 'script:event:subscribe',
    SCRIPT_EVENT_EMIT: 'script:event:emit',

    // Channel events
    CHANNEL_MESSAGE: 'channel:message',
    CHANNEL_SUBSCRIBE: 'channel:subscribe',
    CHANNEL_UNSUBSCRIBE: 'channel:unsubscribe',

    // Feature events
    FEATURE_ENABLE: 'feature:enable',
    FEATURE_DISABLE: 'feature:disable',
    FEATURE_ENABLED: 'feature:enabled',
    FEATURE_DISABLED: 'feature:disabled',
    FEATURE_INITIALIZE: 'feature:initialize',
    FEATURE_READY: 'feature:ready',
    FEATURE_ERROR: 'feature:error',
    FEATURE_REGISTERED: 'feature:registered',
    FEATURE_CONFIG_CHANGE: 'feature:config:change',
    FEATURE_CONFIG_CHANGED: 'feature:config-changed',
    FEATURE_CONFIG_RESET: 'feature:config-reset',
    FEATURES_INITIALIZED: 'features:initialized',

    // Plugin events
    PLUGIN_LOAD: 'plugin:load',
    PLUGIN_LOADED: 'plugin:loaded',
    PLUGIN_ERROR: 'plugin:error',
    PLUGIN_UNLOAD: 'plugin:unload',

    // Performance events
    PERF_FPS: 'perf:fps',
    PERF_FPS_LOW: 'perf:fps:low',
    PERF_MEMORY: 'perf:memory',
    PERF_LONGTASK: 'perf:longtask',
    PERF_MEASURE: 'perf:measure',

    // Debug events
    DEBUG_LOG: 'debug:log',
    DEBUG_BREAKPOINT: 'debug:breakpoint',
    DEBUG_STEP: 'debug:step',
    DEBUG_VARIABLE_CHANGE: 'debug:variable:change',

    // Feedback events
    FEEDBACK_TOAST: 'feedback:toast',
    FEEDBACK_FLASH: 'feedback:flash',
    FEEDBACK_SHAKE: 'feedback:shake',
    FEEDBACK_VIBRATE: 'feedback:vibrate',
    FEEDBACK_PROGRESS_START: 'feedback:progress:start',
    FEEDBACK_PROGRESS_UPDATE: 'feedback:progress:update',
    FEEDBACK_PROGRESS_END: 'feedback:progress:end',

    // Animation events
    ANIMATION_START: 'animation:start',
    ANIMATION_END: 'animation:end',
    ANIMATION_CANCEL: 'animation:cancel',

    // Theme events
    THEME_CHANGE: 'theme:change',
    THEME_COLOR_CHANGE: 'theme:color:change',

    // Accessibility events
    A11Y_ANNOUNCE: 'a11y:announce',
    A11Y_FOCUS_CHANGE: 'a11y:focus:change',
    A11Y_MODE_CHANGE: 'a11y:mode:change',

    // History/Undo events
    HISTORY_PUSH: 'history:push',
    HISTORY_UNDO: 'history:undo',
    HISTORY_REDO: 'history:redo',
    HISTORY_CLEAR: 'history:clear',

    // Selection events
    SELECTION_CHANGE: 'selection:change',
    SELECTION_CLEAR: 'selection:clear',
    SELECTION_ALL: 'selection:all',

    // Search events
    SEARCH_QUERY: 'search:query',
    SEARCH_RESULTS: 'search:results',
    SEARCH_CLEAR: 'search:clear',

    // Network events
    NETWORK_REQUEST: 'network:request',
    NETWORK_RESPONSE: 'network:response',
    NETWORK_ERROR: 'network:error',

    // User events
    USER_ACTION: 'user:action',
    USER_PREFERENCE_CHANGE: 'user:preference:change',

    // Session events
    SESSION_START: 'session:start',
    SESSION_END: 'session:end',
    SESSION_ACTIVITY: 'session:activity',

    // Timer events
    TIMER_SET: 'timer:set',
    TIMER_CLEAR: 'timer:clear',
    TIMER_FIRED: 'timer:fired',

    // Macro events
    MACRO_RECORD_START: 'macro:record:start',
    MACRO_RECORD_STOP: 'macro:record:stop',
    MACRO_PLAY: 'macro:play',
    MACRO_SAVE: 'macro:save',

    // Terminal events
    TERMINAL_COMMAND: 'terminal:command',
    TERMINAL_OUTPUT: 'terminal:output',
    TERMINAL_ERROR: 'terminal:error',
    TERMINAL_CWD_CHANGE: 'terminal:cwd:change',
    TERMINAL_MATRIX: 'terminal:matrix',
    TERMINAL_COMMAND_EXECUTED: 'terminal:command:executed',
    TERMINAL_COMMAND_ERROR: 'terminal:command:error',
    TERMINAL_CLEARED: 'terminal:cleared',
    TERMINAL_DIRECTORY_CHANGED: 'terminal:directory:changed',
    APP_TERMINAL_OPENED: 'app:terminal:opened',
    APP_TERMINAL_COMMAND: 'app:terminal:command',
    APP_TERMINAL_CLOSED: 'app:terminal:closed',

    // App error events
    APP_LAUNCH_ERROR: 'app:launch:error',
    APP_CLOSE_ERROR: 'app:close:error',

    // BSOD events
    BSOD_SHOW: 'bsod:show',

    // Filesystem granular events
    FILESYSTEM_FILE_CHANGED: 'filesystem:file:changed',
    FILESYSTEM_DIRECTORY_CHANGED: 'filesystem:directory:changed',

    // Clipboard events
    CLIPBOARD_CHANGED: 'clipboard:changed',
    CLIPBOARD_CUT_STATE: 'clipboard:cut-state',

    // Feature lifecycle events
    FEATURE_UNREGISTERED: 'feature:unregistered',
    FEATURE_DEPENDENCY_FAILED: 'feature:dependency-failed',

    // Plugin lifecycle events
    PLUGINS_LOADED: 'plugins:loaded',
    PLUGIN_UNLOADED: 'plugin:unloaded',

    // Autoexec events
    AUTOEXEC_START: 'autoexec:start',
    AUTOEXEC_COMPLETE: 'autoexec:complete',
    AUTOEXEC_ERROR: 'autoexec:error',

    // System health events
    SYSTEM_HEALTH_WARNING: 'system:health:warning',

    // Macro lifecycle events
    MACRO_RECORDING: 'macro:recording',
    MACRO_RECORDED: 'macro:recorded',
    MACRO_PLAYING: 'macro:playing',
    MACRO_COMPLETE: 'macro:complete',

    // Game events (generic cross-game)
    GAME_START: 'game:start',
    GAME_OVER: 'game:over',
    GAME_SCORE: 'game:score',
    GAME_HIGHSCORE: 'game:highscore',
    GAME_LIVES: 'game:lives',
    GAME_PAUSE: 'game:pause',
    GAME_RESUME: 'game:resume',
    GAME_LEVEL: 'game:level',

    // Multiplayer events
    MP_STATE: 'mp:state',
    MP_CONNECTED: 'mp:connected',
    MP_ERROR: 'mp:error',
    MP_PRESENCE_ONLINE_LIST: 'mp:presence:online_list',
    MP_PRESENCE_JOIN: 'mp:presence:join',
    MP_PRESENCE_LEAVE: 'mp:presence:leave',
    MP_PRESENCE_UPDATE: 'mp:presence:update',
    MP_PRESENCE_TYPING: 'mp:presence:typing',
    MP_GAME_CREATED: 'mp:game:created',
    MP_GAME_STARTED: 'mp:game:started',
    MP_GAME_ACTION: 'mp:game:action',
    MP_GAME_TURN: 'mp:game:turn',
    MP_GAME_ENDED: 'mp:game:ended',
    MP_GAME_PLAYER_JOINED: 'mp:game:player_joined',
    MP_GAME_PLAYER_LEFT: 'mp:game:player_left',

    // Config events
    CONFIG_UPDATE: 'config:update',

    // Effect events
    EFFECT_TRIGGER: 'effect:trigger',

    // System resource events
    SYSTEM_RESOURCE_REPORT: 'system:resource:report',
    SYSTEM_RESOURCE_WARNING: 'system:resource:warning',

    // Narrative bridge event
    NARRATIVE_EVENT: 'narrative:event'
};

// Export priority levels
export const Priority = SemanticEventBus.PRIORITY;

// Add global debug helpers (in development)
if (typeof window !== 'undefined') {
    const debugObj = {
        eventBus: SemanticEventBus,
        Priority: SemanticEventBus.PRIORITY,

        // Enable/disable event logging
        enableLog: () => SemanticEventBus.configure({ logging: true }),
        disableLog: () => SemanticEventBus.configure({ logging: false }),

        // View event log
        showEventLog: (limit = 20) => {
            console.table(SemanticEventBus.getEventLog(limit));
        },

        // List all registered events
        listEvents: () => {
            const events = SemanticEventBus.getRegisteredEvents();
            console.log(`Registered Events (${events.length} total):`, events);
        },

        // List events by namespace
        listNamespace: (namespace) => {
            const events = SemanticEventBus.getEventsByNamespace(namespace);
            console.log(`Events in "${namespace}" (${events.length}):`, events);
        },

        // List all namespaces
        listNamespaces: () => {
            const events = SemanticEventBus.getRegisteredEvents();
            const namespaces = [...new Set(events.map(e => e.split(':')[0]))];
            console.log('Available Namespaces:', namespaces);
        },

        // Show event schema
        describeEvent: (eventName) => {
            const schema = SemanticEventBus.getEventSchema(eventName);
            if (schema) {
                console.log(`Event: ${eventName}`);
                console.log('Namespace:', schema.namespace);
                console.log('Action:', schema.action);
                console.log('Description:', schema.description);
                console.log('Payload:', schema.payload);
                console.log('Example:', schema.example);
            } else {
                console.warn(`Event "${eventName}" not found in schema`);
            }
        },

        // Show statistics
        showStats: () => {
            console.log('Event Bus Statistics:', SemanticEventBus.getStats());
        },

        // Show active listeners
        showListeners: () => {
            console.log('Active Listeners:', SemanticEventBus.getActiveListeners());
        },

        // Show active channels
        showChannels: () => {
            const channels = SemanticEventBus.getChannels();
            console.log(`Active Channels (${channels.length}):`, channels);
            channels.forEach(ch => {
                console.log(`  ${ch}:`, SemanticEventBus.getChannelSubscribers(ch));
            });
        },

        // Show pending requests
        showPendingRequests: () => {
            console.log('Pending Requests:', [...SemanticEventBus.pendingRequests.keys()]);
        },

        // Reset stats
        resetStats: () => SemanticEventBus.resetStats(),

        // Interactive helpers for testing
        emit: (event, payload) => SemanticEventBus.emit(event, payload),
        request: (event, payload) => SemanticEventBus.request(event, payload),
        waitFor: (event, opts) => SemanticEventBus.waitFor(event, opts)
    };
    window.__RETROS_DEBUG = Object.assign(window.__RETROS_DEBUG || {}, debugObj);
    window.__ILLUMINATOS_DEBUG = window.__RETROS_DEBUG;
}

// Named exports - both names for backward compat
const EventBus = SemanticEventBus;
export { SemanticEventBus, EventBus };
export default SemanticEventBus;
