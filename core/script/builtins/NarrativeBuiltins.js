/**
 * NarrativeBuiltins - Story/campaign scripting functions for RetroScript
 *
 * Provides the narrative API namespaces from the ARG Expansion Master Plan:
 *   story.*     — Campaign lifecycle
 *   scene.*     — Scene transitions and guards
 *   objective.* — Player task tracking
 *   flag.*      — Arbitrary state flags for branching
 *   clue.*      — Evidence and discovery progression
 *   mood.*      — Visual/audio/system tone shifts
 *   npc.*       — Persona state helpers
 *
 * All mutating helpers emit canonical story:* events.
 * APIs are idempotent where practical.
 * All helpers have deterministic failure responses.
 *
 * Available from Script Runner, Terminal `retro`, and autoexec scripts.
 */

export function registerNarrativeBuiltins(interpreter) {

    /**
     * Helper: get NarrativeStateManager from context
     * @returns {Object|null}
     */
    function getNSM() {
        return interpreter.context.NarrativeStateManager || null;
    }

    // ==========================================
    // story.* — Campaign lifecycle
    // ==========================================

    /**
     * story.start(campaignId) — Start a new campaign
     * Emits: story:start
     */
    interpreter.registerBuiltin('story.start', (campaignId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.startCampaign(String(campaignId || ''));
    });

    /**
     * story.end(campaignId, endingId?) — End the current campaign
     * Emits: story:end
     */
    interpreter.registerBuiltin('story.end', (campaignId, endingId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.endCampaign(
            String(campaignId || ''),
            endingId ? String(endingId) : null
        );
    });

    /**
     * story.current() — Get the current campaign ID
     */
    interpreter.registerBuiltin('story.current', () => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getCurrentCampaign();
    });

    /**
     * story.reset() — Reset all narrative state
     */
    interpreter.registerBuiltin('story.reset', () => {
        const nsm = getNSM();
        if (!nsm) return false;
        nsm.reset();
        return true;
    });

    /**
     * story.snapshot() — Get a snapshot of the full narrative state
     */
    interpreter.registerBuiltin('story.snapshot', () => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getSnapshot();
    });

    /**
     * story.import(snapshot) — Import a narrative state snapshot
     */
    interpreter.registerBuiltin('story.import', (snapshot) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.importSnapshot(snapshot);
    });

    // ==========================================
    // scene.* — Scene transitions and guards
    // ==========================================

    /**
     * scene.enter(sceneId) — Enter a scene
     * Emits: story:scene:enter, story:scene:exit (for previous scene)
     */
    interpreter.registerBuiltin('scene.enter', (sceneId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.enterScene(String(sceneId || ''));
    });

    /**
     * scene.complete(sceneId) — Mark a scene as completed
     * Emits: story:scene:complete
     */
    interpreter.registerBuiltin('scene.complete', (sceneId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.completeScene(String(sceneId || ''));
    });

    /**
     * scene.canEnter(sceneId) — Check if a scene can be entered
     */
    interpreter.registerBuiltin('scene.canEnter', (sceneId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.canEnterScene(String(sceneId || ''));
    });

    /**
     * scene.block(sceneId, reason?) — Block a scene from being entered
     * Emits: story:scene:block
     */
    interpreter.registerBuiltin('scene.block', (sceneId, reason) => {
        const nsm = getNSM();
        if (!nsm) return false;
        nsm.blockScene(String(sceneId || ''), reason ? String(reason) : '');
        return true;
    });

    /**
     * scene.unblock(sceneId) — Remove a scene block
     */
    interpreter.registerBuiltin('scene.unblock', (sceneId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        nsm.unblockScene(String(sceneId || ''));
        return true;
    });

    /**
     * scene.current() — Get the current scene ID
     */
    interpreter.registerBuiltin('scene.current', () => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getCurrentScene();
    });

    /**
     * scene.get(sceneId) — Get scene state object
     */
    interpreter.registerBuiltin('scene.get', (sceneId) => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getScene(String(sceneId || ''));
    });

    // ==========================================
    // objective.* — Player task tracking
    // ==========================================

    /**
     * objective.add(id, text, meta?) — Add a new objective
     * Emits: story:objective:add
     */
    interpreter.registerBuiltin('objective.add', (id, text, meta) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.addObjective(
            String(id || ''),
            String(text || ''),
            meta && typeof meta === 'object' ? meta : {}
        );
    });

    /**
     * objective.complete(id) — Mark an objective as completed
     * Emits: story:objective:complete
     */
    interpreter.registerBuiltin('objective.complete', (id) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.completeObjective(String(id || ''));
    });

    /**
     * objective.fail(id) — Mark an objective as failed
     * Emits: story:objective:fail
     */
    interpreter.registerBuiltin('objective.fail', (id) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.failObjective(String(id || ''));
    });

    /**
     * objective.get(id) — Get an objective's state
     */
    interpreter.registerBuiltin('objective.get', (id) => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getObjective(String(id || ''));
    });

    /**
     * objective.list(status?) — Get all objectives, optionally filtered by status
     */
    interpreter.registerBuiltin('objective.list', (status) => {
        const nsm = getNSM();
        if (!nsm) return {};
        return nsm.getObjectives(status ? String(status) : null);
    });

    // ==========================================
    // flag.* — Arbitrary state flags
    // ==========================================

    /**
     * flag.set(key, value) — Set a flag value
     * Emits: story:flag:set
     */
    interpreter.registerBuiltin('flag.set', (key, value) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.setFlag(String(key || ''), value);
    });

    /**
     * flag.get(key, default?) — Get a flag value
     */
    interpreter.registerBuiltin('flag.get', (key, defaultValue) => {
        const nsm = getNSM();
        if (!nsm) return defaultValue !== undefined ? defaultValue : null;
        return nsm.getFlag(
            String(key || ''),
            defaultValue !== undefined ? defaultValue : null
        );
    });

    /**
     * flag.has(key) — Check if a flag exists
     */
    interpreter.registerBuiltin('flag.has', (key) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.hasFlag(String(key || ''));
    });

    /**
     * flag.delete(key) — Delete a flag
     */
    interpreter.registerBuiltin('flag.delete', (key) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.deleteFlag(String(key || ''));
    });

    /**
     * flag.all() — Get all flags
     */
    interpreter.registerBuiltin('flag.all', () => {
        const nsm = getNSM();
        if (!nsm) return {};
        return nsm.getAllFlags();
    });

    // ==========================================
    // clue.* — Evidence and discovery
    // ==========================================

    /**
     * clue.add(id, tags?) — Add/discover a clue
     * Emits: story:clue:add
     */
    interpreter.registerBuiltin('clue.add', (id, tags) => {
        const nsm = getNSM();
        if (!nsm) return false;
        const tagArray = Array.isArray(tags) ? tags : (tags ? [String(tags)] : []);
        return nsm.addClue(String(id || ''), tagArray);
    });

    /**
     * clue.has(id) — Check if a clue has been discovered
     */
    interpreter.registerBuiltin('clue.has', (id) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.hasClue(String(id || ''));
    });

    /**
     * clue.get(id) — Get a clue's full state
     */
    interpreter.registerBuiltin('clue.get', (id) => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getClue(String(id || ''));
    });

    /**
     * clue.list(tag?) — Get all clues, optionally filtered by tag
     */
    interpreter.registerBuiltin('clue.list', (tag) => {
        const nsm = getNSM();
        if (!nsm) return {};
        return nsm.getClues(tag ? String(tag) : null);
    });

    /**
     * clue.reveal(id) — Mark a clue as revealed (emits event for UI)
     * Emits: story:clue:revealed
     */
    interpreter.registerBuiltin('clue.reveal', (id) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.revealClue(String(id || ''));
    });

    // ==========================================
    // mood.* — Visual/audio/system tone shifts
    // ==========================================

    /**
     * mood.set(presetId) — Set the current mood preset
     * Emits: story:mood:set
     */
    interpreter.registerBuiltin('mood.set', (presetId) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.setMood(String(presetId || ''));
    });

    /**
     * mood.transition(fromPreset, toPreset, durationMs) — Transition between moods
     * Emits: story:mood:transition, then story:mood:set after duration
     */
    interpreter.registerBuiltin('mood.transition', (fromPreset, toPreset, durationMs) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.transitionMood(
            String(fromPreset || ''),
            String(toPreset || ''),
            Number(durationMs) || 1000
        );
    });

    /**
     * mood.current() — Get the current mood preset ID
     */
    interpreter.registerBuiltin('mood.current', () => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getCurrentMood();
    });

    // ==========================================
    // npc.* — Persona state helpers
    // ==========================================

    /**
     * npc.setState(npcId, key, value) — Set NPC state
     */
    interpreter.registerBuiltin('npc.setState', (npcId, key, value) => {
        const nsm = getNSM();
        if (!nsm) return false;
        return nsm.setNpcState(
            String(npcId || ''),
            String(key || ''),
            value
        );
    });

    /**
     * npc.getState(npcId, key, default?) — Get NPC state value
     */
    interpreter.registerBuiltin('npc.getState', (npcId, key, defaultValue) => {
        const nsm = getNSM();
        if (!nsm) return defaultValue !== undefined ? defaultValue : null;
        return nsm.getNpcState(
            String(npcId || ''),
            String(key || ''),
            defaultValue !== undefined ? defaultValue : null
        );
    });

    /**
     * npc.get(npcId) — Get all state for an NPC
     */
    interpreter.registerBuiltin('npc.get', (npcId) => {
        const nsm = getNSM();
        if (!nsm) return null;
        return nsm.getNpc(String(npcId || ''));
    });
}

export default registerNarrativeBuiltins;
