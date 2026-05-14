/**
 * RealtimeClient - Server-Sent Events (SSE) connection for IlluminatOS!
 *
 * Connects to the v2 API SSE endpoint and bridges server events
 * into the frontend EventBus for real-time updates.
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Last-Event-ID tracking for resumption
 * - Event bridging to the existing EventBus
 * - Graceful degradation (does nothing if SSE unavailable)
 * - Auth token sent via Authorization header (not URL query params)
 */

import EventBus from './EventBus.js';
import { getApiBasePath, isBackendAvailable, fetchWithAuth } from './ConfigLoader.js';
import { getBackendEventsForTransport, getFrontendEventName } from './EventTopology.js';

let abortController = null;
let lastEventId = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectTimer = null;
let _token = null;
let _connected = false;

/**
 * SSE-bridged event names, derived from the central EventTopology so the
 * allowlist can never drift from the index.js SSE handlers or the WS
 * bridge in MultiplayerClient. Adding a new SSE event = adding one entry
 * to EventTopology.
 *
 * Memoized into a Set for O(1) membership checks.
 */
const bridgedEvents = new Set(getBackendEventsForTransport('sse'));

/**
 * Initialize the SSE connection.
 * Call this after the session token is established.
 *
 * @param {string} token - The session auth token
 */
export function initRealtime(token) {
    _token = token;
    reconnectAttempts = 0; // Reset on re-init to allow fresh connection attempts

    // Cancel any pending reconnect timer from a previous connection
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    if (!isBackendAvailable()) {
        console.log('[RealtimeClient] Backend not available, skipping SSE');
        return;
    }

    connect();
}

/**
 * Parse a single SSE line-based chunk into events.
 * Handles the SSE text protocol: event/data/id fields separated by blank lines.
 */
function parseSSEEvents(text) {
    const events = [];
    let currentEvent = { event: 'message', data: '', id: null };

    for (const line of text.split('\n')) {
        if (line === '') {
            // Blank line = dispatch event
            if (currentEvent.data) {
                events.push({ ...currentEvent });
            }
            currentEvent = { event: 'message', data: '', id: null };
        } else if (line.startsWith('event:')) {
            currentEvent.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            currentEvent.data += (currentEvent.data ? '\n' : '') + line.slice(5).trim();
        } else if (line.startsWith('id:')) {
            currentEvent.id = line.slice(3).trim();
        }
        // Lines starting with ':' are comments, ignore them
    }

    return events;
}

/**
 * Handle a parsed SSE event by dispatching to the appropriate handler.
 */
function handleSSEEvent(evt) {
    if (evt.id) {
        lastEventId = evt.id;
    }

    if (evt.event === 'connected') {
        try {
            const data = JSON.parse(evt.data);
            lastEventId = evt.id || data.last_id;
            console.log('[RealtimeClient] Connected, last_id:', lastEventId);
        } catch (err) {
            console.warn('[RealtimeClient] Failed to parse connected event:', err);
        }
        return;
    }

    if (evt.event === 'reconnect') {
        try {
            const data = JSON.parse(evt.data);
            lastEventId = data.last_id;
        } catch { /* ignore */ }
        // Trigger reconnect
        disconnect();
        connect();
        return;
    }

    // Bridge known event types to EventBus
    if (bridgedEvents.has(evt.event)) {
        try {
            const data = JSON.parse(evt.data);
            // Legacy emission — existing handlers subscribe to `sse:<backend>`.
            EventBus.emit(`sse:${evt.event}`, data);

            // If the topology defines a frontend (internal) event name,
            // emit that too so new handlers can subscribe to the
            // semantic name instead of the transport-prefixed alias.
            const frontend = getFrontendEventName(evt.event);
            if (frontend) {
                EventBus.emit(frontend, data);
            }

            // Hard-coded compatibility aliases retained until existing
            // subscribers migrate to the semantic names above.
            if (evt.event === 'config.changed') {
                EventBus.emit('system:config-updated', data);
            }
        } catch (err) {
            console.warn('[RealtimeClient] Failed to parse event data:', err);
        }
    }
}

/**
 * Connect to the SSE endpoint using fetch() with Authorization header.
 * This avoids leaking the auth token in URL query parameters.
 */
async function connect() {
    disconnect();

    const basePath = getApiBasePath();
    let url = `${basePath}api/v2/events/stream`;
    if (lastEventId !== null) {
        url += `?last_id=${lastEventId}`;
    }

    abortController = new AbortController();

    try {
        // fetchWithAuth adds Authorization + X-Requested-With automatically
        // and traps 401 by routing through SessionManager.logout. The 401
        // path emits auth:expired and clears the token before we'd try
        // to reconnect, so the loop stops on its own.
        const response = await fetchWithAuth(url, {
            headers: { 'Accept': 'text/event-stream' },
            signal: abortController.signal,
        });

        if (!response.ok) {
            console.warn(`[RealtimeClient] SSE connection failed: ${response.status}`);
            scheduleReconnect();
            return;
        }

        console.log('[RealtimeClient] SSE connection established');
        _connected = true;
        reconnectAttempts = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process complete events (separated by double newlines)
            const parts = buffer.split('\n\n');
            // Keep the last (potentially incomplete) part in the buffer
            buffer = parts.pop() || '';

            for (const part of parts) {
                if (!part.trim()) continue;
                const events = parseSSEEvents(part + '\n\n');
                for (const evt of events) {
                    handleSSEEvent(evt);
                }
            }
        }

        // Stream ended normally
        _connected = false;
        scheduleReconnect();

    } catch (e) {
        if (e.name === 'AbortError') {
            // Intentional disconnect, don't reconnect
            return;
        }
        console.warn('[RealtimeClient] SSE connection error:', e.message);
        _connected = false;
        scheduleReconnect();
    }
}

/**
 * Disconnect the current stream.
 */
function disconnect() {
    if (abortController) {
        abortController.abort();
        abortController = null;
    }
    _connected = false;
}

/**
 * Schedule a reconnection attempt with exponential backoff.
 */
function scheduleReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        console.warn('[RealtimeClient] Max reconnect attempts reached, giving up');
        return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;

    console.log(`[RealtimeClient] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
        connect();
    }, delay);
}

/**
 * Close the SSE connection.
 */
export function closeRealtime() {
    disconnect();
    clearTimeout(reconnectTimer);
}

/**
 * Check if the SSE connection is active.
 */
export function isRealtimeConnected() {
    return _connected;
}

const _RealtimeClient = { initRealtime, closeRealtime, isRealtimeConnected, isConnected: isRealtimeConnected };

if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.realtimeClient = _RealtimeClient;
}

export default _RealtimeClient;
