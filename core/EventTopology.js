/**
 * EventTopology - Single source of truth for cross-process event mapping
 *
 * Before this existed, the same cross-process event was named in three files:
 *   1. `RealtimeClient.bridgedEvents` (the SSE allowlist)
 *   2. `index.js` (29 `EventBus.on('sse:*')` handlers transforming backend
 *      events into internal app events)
 *   3. `MultiplayerClient` WS bridge (`mp:*` prefix, no explicit list)
 *
 * Drift was inevitable — adding a new backend event meant editing all three.
 * The audit caught examples already in the wild (`narrative.mood.shift` was
 * wired into index.js but missing from the bridgedEvents allowlist for a time).
 *
 * The topology is a single array of entries:
 *
 *   {
 *     backend: 'system.notification',     // event name as emitted by the server
 *     frontend: 'notification:show',      // optional: internal event name to emit too
 *     transports: ['sse', 'ws'],          // which transports carry it
 *     description: 'Toast notification from admin',
 *   }
 *
 * Consumers (`RealtimeClient`, `MultiplayerClient`, the SSE handlers in
 * `index.js`) all consult this single list. Adding a new event = adding
 * one entry. No second list to keep in sync.
 *
 * The `frontend` field is forward-looking: in Wave 4 the existing
 * `EventBus.on('sse:<backend>')` handlers in index.js will move to
 * `EventBus.on('<frontend>')` and the `sse:` emission can be retired. For
 * now both event names are emitted so existing handlers continue to work.
 */

/**
 * @typedef {Object} TopologyEntry
 * @property {string} backend - Backend event name (e.g. 'system.notification')
 * @property {string} [frontend] - Optional internal event name to emit
 *                                  in addition to `sse:<backend>` / `mp:<backend>`.
 * @property {Array<'sse'|'ws'>} transports - Which transports carry this event.
 * @property {string} [description] - Human-readable purpose (for docs).
 */

/** @type {TopologyEntry[]} */
export const EventTopology = [
    // ── Config & administration ─────────────────────────────
    { backend: 'config.changed', transports: ['sse'], description: 'Admin pushed a config section update' },
    { backend: 'config.reset', transports: ['sse'], description: 'Admin reset a config section' },

    // ── Announcements ───────────────────────────────────────
    { backend: 'announcement.created', transports: ['sse'], frontend: 'system:announcement', description: 'New announcement posted' },
    { backend: 'announcement.updated', transports: ['sse'], description: 'Announcement edited' },
    { backend: 'announcement.deleted', transports: ['sse'], description: 'Announcement removed' },

    // ── Themes ──────────────────────────────────────────────
    { backend: 'theme.created', transports: ['sse'], description: 'New theme published' },
    { backend: 'theme.updated', transports: ['sse'], description: 'Theme edited' },
    { backend: 'theme.deleted', transports: ['sse'], description: 'Theme removed' },

    // ── Users ───────────────────────────────────────────────
    { backend: 'user.updated', transports: ['sse'], description: 'User account updated (admin or self)' },

    // ── System control plane ────────────────────────────────
    // NOTE: `frontend` is intentionally omitted for entries where the
    // existing index.js handler does payload transformation (defaults,
    // remapping). Setting frontend would cause RealtimeClient to emit the
    // transformed event name with the *raw* payload, double-firing with
    // a different shape. As index.js handlers migrate to subscribe to the
    // semantic name directly, frontend can be set here and the handler
    // removed in the same PR.
    { backend: 'system.message', transports: ['sse'], description: 'Admin broadcast text message' },
    { backend: 'system.dialog', transports: ['sse'], description: 'Admin pushes alert/confirm/prompt' },
    { backend: 'system.notification', transports: ['sse'], description: 'Toast notification (transformed by index.js handler)' },
    { backend: 'system.sound', transports: ['sse'], description: 'Admin triggers sound effect' },
    { backend: 'system.media', transports: ['sse'], description: 'Admin broadcasts uploaded media URL' },
    { backend: 'system.effect', transports: ['sse'], description: 'Admin triggers visual effect' },
    { backend: 'system.app.launch', transports: ['sse'], description: 'Admin remote-launches an app' },
    { backend: 'system.filesystem.command', transports: ['sse'], description: 'Admin remote filesystem op' },
    { backend: 'system.default_filesystem.updated', transports: ['sse'], description: 'Admin updated default FS for new sessions' },

    // ── Narrative / ARG ─────────────────────────────────────
    { backend: 'narrative.story.advance', transports: ['sse'], description: 'Story progression event' },
    { backend: 'narrative.story.branch', transports: ['sse'], description: 'Story branched' },
    { backend: 'narrative.story.reveal', transports: ['sse'], description: 'Story revealed information' },
    { backend: 'narrative.story.flashback', transports: ['sse'], description: 'Story flashback' },
    { backend: 'narrative.mood.shift', transports: ['sse'], description: 'Mood shift cue' },
    { backend: 'narrative.mood.glitch', transports: ['sse'], description: 'Glitch mood cue' },
    { backend: 'narrative.mood.dream', transports: ['sse'], description: 'Dream mood cue' },
    { backend: 'narrative.character.appear', transports: ['sse'], description: 'Character appears' },
    { backend: 'narrative.character.speak', transports: ['sse'], description: 'Character speaks' },
    { backend: 'narrative.character.leave', transports: ['sse'], description: 'Character leaves' },
    { backend: 'narrative.world.unlock', transports: ['sse'], description: 'World/zone unlocked' },
    { backend: 'narrative.world.change', transports: ['sse'], description: 'World state change' },
    { backend: 'narrative.world.timer', transports: ['sse'], description: 'World timer event' },
    { backend: 'narrative.puzzle.hint', transports: ['sse'], description: 'Puzzle hint' },
    { backend: 'narrative.puzzle.solve', transports: ['sse'], description: 'Puzzle solved' },
    { backend: 'narrative.puzzle.new', transports: ['sse'], description: 'New puzzle introduced' },
    { backend: 'narrative.custom', transports: ['sse'], description: 'Custom narrative event' },

    // ── Multiplayer / game session ──────────────────────────
    // WS events are bridged by MultiplayerClient with the `mp:` prefix. The
    // bridge accepts any `event` type message, so the list below is
    // informational — adding entries here doesn't change WS filtering
    // (yet). It documents the wire protocol surface.
    { backend: 'mp.connected', transports: ['ws'], frontend: 'mp:connected', description: 'WS handshake complete' },
    { backend: 'mp.error', transports: ['ws'], frontend: 'mp:error', description: 'WS server error' },
    { backend: 'mp.presence.online_list', transports: ['ws'], frontend: 'mp:presence:online_list' },
    { backend: 'mp.presence.join', transports: ['ws'], frontend: 'mp:presence:join' },
    { backend: 'mp.presence.leave', transports: ['ws'], frontend: 'mp:presence:leave' },
    { backend: 'mp.presence.update', transports: ['ws'], frontend: 'mp:presence:update' },
    { backend: 'mp.presence.typing', transports: ['ws'], frontend: 'mp:presence:typing' },
    { backend: 'mp.game.created', transports: ['ws'], frontend: 'mp:game:created' },
    { backend: 'mp.game.started', transports: ['ws'], frontend: 'mp:game:started' },
    { backend: 'mp.game.action', transports: ['ws'], frontend: 'mp:game:action' },
    { backend: 'mp.game.turn', transports: ['ws'], frontend: 'mp:game:turn' },
    { backend: 'mp.game.ended', transports: ['ws'], frontend: 'mp:game:ended' },
    { backend: 'mp.game.player_joined', transports: ['ws'], frontend: 'mp:game:player_joined' },
    { backend: 'mp.game.player_left', transports: ['ws'], frontend: 'mp:game:player_left' },
];

/**
 * Get backend event names that should be bridged from a given transport.
 * Used by `RealtimeClient` to build its accept-list.
 *
 * @param {'sse'|'ws'} transport
 * @returns {string[]}
 */
export function getBackendEventsForTransport(transport) {
    return EventTopology
        .filter(entry => Array.isArray(entry.transports) && entry.transports.includes(transport))
        .map(entry => entry.backend);
}

/**
 * Look up a topology entry by backend event name.
 * @param {string} backendName
 * @returns {TopologyEntry|undefined}
 */
export function getTopologyEntry(backendName) {
    return EventTopology.find(entry => entry.backend === backendName);
}

/**
 * Get the frontend event name that should be emitted in addition to the
 * legacy `sse:<backend>` / `mp:<backend>` aliases, when one is defined.
 *
 * @param {string} backendName
 * @returns {string|null}
 */
export function getFrontendEventName(backendName) {
    return getTopologyEntry(backendName)?.frontend || null;
}

export default { EventTopology, getBackendEventsForTransport, getTopologyEntry, getFrontendEventName };
