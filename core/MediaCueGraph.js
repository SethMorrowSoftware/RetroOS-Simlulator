/**
 * MediaCueGraph - Cue sequencing engine with conditional branches
 *
 * Phase 2 of the ARG Expansion Master Plan (Workstream C).
 * Provides:
 *   - Cue graph model for sequencing media (intro -> loop -> stinger)
 *   - Conditional branching based on story flags/scene state
 *   - Priority arbitration between overlapping cues
 *   - Validation and dry-run simulation for dead-end detection
 *
 * A cue graph is a directed graph where each node is a media cue and
 * edges define transitions (automatic, conditional, or manual).
 *
 * Usage:
 *   import MediaCueGraph from './core/MediaCueGraph.js';
 *   const graph = MediaCueGraph.create('ambient-sequence', definition);
 *   graph.start(context);
 */

import EventBus from './EventBus.js';

// ==========================================
// CUE NODE TYPES
// ==========================================

const NODE_TYPES = {
    AUDIO:     'audio',
    VIDEO:     'video',
    IMAGE:     'image',
    SUBTITLE:  'subtitle',
    FX:        'fx',
    DELAY:     'delay',
    BRANCH:    'branch',
    SCRIPT:    'script'
};

/**
 * Validate a cue graph definition.
 * @param {Object} definition - Graph definition
 * @returns {{valid: boolean, errors: string[], warnings: string[]}}
 */
function validateGraphDefinition(definition) {
    const errors = [];
    const warnings = [];

    if (!definition || typeof definition !== 'object') {
        return { valid: false, errors: ['Graph definition must be an object'], warnings };
    }

    if (!definition.nodes || typeof definition.nodes !== 'object') {
        errors.push('Graph must have a "nodes" object');
        return { valid: errors.length === 0, errors, warnings };
    }

    if (!definition.entryNode || typeof definition.entryNode !== 'string') {
        errors.push('Graph must have an "entryNode" string');
    }

    const nodeIds = new Set(Object.keys(definition.nodes));
    const referencedIds = new Set();

    if (definition.entryNode && !nodeIds.has(definition.entryNode)) {
        errors.push(`Entry node "${definition.entryNode}" not found in nodes`);
    }

    for (const [nodeId, node] of Object.entries(definition.nodes)) {
        if (!node.type) {
            errors.push(`Node "${nodeId}": missing "type"`);
            continue;
        }

        if (!Object.values(NODE_TYPES).includes(node.type) && node.type !== 'delay' && node.type !== 'branch' && node.type !== 'script') {
            errors.push(`Node "${nodeId}": unknown type "${node.type}"`);
        }

        // Media nodes must have assetId (except delay, branch, script)
        if (['audio', 'video', 'image'].includes(node.type) && !node.assetId) {
            errors.push(`Node "${nodeId}": media node requires "assetId"`);
        }

        // Validate transitions
        if (node.next) {
            if (typeof node.next === 'string') {
                referencedIds.add(node.next);
            } else if (Array.isArray(node.next)) {
                for (const edge of node.next) {
                    if (typeof edge === 'string') {
                        referencedIds.add(edge);
                    } else if (edge && typeof edge === 'object') {
                        if (!edge.target) {
                            errors.push(`Node "${nodeId}": transition edge missing "target"`);
                        } else {
                            referencedIds.add(edge.target);
                        }
                    }
                }
            }
        }

        // Branch nodes must have conditions
        if (node.type === 'branch') {
            if (!node.conditions || !Array.isArray(node.conditions) || node.conditions.length === 0) {
                errors.push(`Node "${nodeId}": branch node requires "conditions" array`);
            } else {
                for (const cond of node.conditions) {
                    if (!cond.target) {
                        errors.push(`Node "${nodeId}": branch condition missing "target"`);
                    } else {
                        referencedIds.add(cond.target);
                    }
                }
                if (node.defaultTarget) {
                    referencedIds.add(node.defaultTarget);
                }
            }
        }

        // Delay nodes must have durationMs
        if (node.type === 'delay' && (typeof node.durationMs !== 'number' || node.durationMs < 0)) {
            errors.push(`Node "${nodeId}": delay node requires positive "durationMs"`);
        }
    }

    // Check for unreachable nodes
    for (const nodeId of nodeIds) {
        if (nodeId !== definition.entryNode && !referencedIds.has(nodeId)) {
            warnings.push(`Node "${nodeId}" is unreachable (not referenced by any transition)`);
        }
    }

    // Check for missing transition targets
    for (const refId of referencedIds) {
        if (!nodeIds.has(refId)) {
            errors.push(`Transition references non-existent node "${refId}"`);
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Simulate a cue graph to detect dead-ends and race conditions.
 * Performs a depth-first traversal, evaluating conditions with a mock context.
 * @param {Object} definition - Graph definition
 * @param {Object} [mockContext={}] - Mock flag/state context for simulation
 * @returns {{reachable: string[], deadEnds: string[], cycles: string[], maxDepth: number}}
 */
function simulateGraph(definition, mockContext = {}) {
    const reachable = new Set();
    const deadEnds = [];
    const cyclesFound = new Set();
    let maxDepth = 0;

    function traverse(nodeId, visited, depth) {
        if (!nodeId || !definition.nodes[nodeId]) return;
        if (visited.has(nodeId)) {
            cyclesFound.add(nodeId);
            return;
        }

        reachable.add(nodeId);
        visited.add(nodeId);
        maxDepth = Math.max(maxDepth, depth);

        const node = definition.nodes[nodeId];
        let hasTransition = false;

        // Follow next transitions
        if (node.next) {
            hasTransition = true;
            if (typeof node.next === 'string') {
                traverse(node.next, new Set(visited), depth + 1);
            } else if (Array.isArray(node.next)) {
                for (const edge of node.next) {
                    const target = typeof edge === 'string' ? edge : edge?.target;
                    if (target) traverse(target, new Set(visited), depth + 1);
                }
            }
        }

        // Follow branch conditions
        if (node.type === 'branch' && node.conditions) {
            hasTransition = true;
            for (const cond of node.conditions) {
                if (cond.target) traverse(cond.target, new Set(visited), depth + 1);
            }
            if (node.defaultTarget) {
                traverse(node.defaultTarget, new Set(visited), depth + 1);
            }
        }

        // Terminal node (no transitions) -- only a dead end if not a looping/terminal media node
        if (!hasTransition && !node.loop) {
            deadEnds.push(nodeId);
        }
    }

    if (definition.entryNode) {
        traverse(definition.entryNode, new Set(), 0);
    }

    return {
        reachable: [...reachable],
        deadEnds,
        cycles: [...cyclesFound],
        maxDepth
    };
}


/**
 * CueGraphInstance - A running instance of a cue graph
 */
class CueGraphInstance {
    /**
     * @param {string} graphId - Graph identifier
     * @param {Object} definition - Validated graph definition
     */
    constructor(graphId, definition) {
        this.graphId = graphId;
        this.definition = definition;
        this.currentNodeId = null;
        this.running = false;
        this._timer = null;
        this._onCueAction = null; // Callback for cue execution
    }

    /**
     * Start the cue graph from the entry node
     * @param {Object} context - Execution context { flags, getFlag, MediaAssetManager }
     * @param {Function} onCueAction - Callback: (nodeId, node) => void
     */
    start(context, onCueAction) {
        if (this.running) return;

        this.running = true;
        this._onCueAction = onCueAction || (() => {});
        this._context = context || {};

        this._executeNode(this.definition.entryNode);
    }

    /**
     * Stop the cue graph
     */
    stop() {
        this.running = false;
        if (this._timer) {
            clearTimeout(this._timer);
            this._timer = null;
        }
        this.currentNodeId = null;
    }

    /**
     * Advance to a specific node (manual override)
     * @param {string} nodeId
     */
    advanceTo(nodeId) {
        if (!this.running) return;
        this._executeNode(nodeId);
    }

    /** @private */
    _executeNode(nodeId) {
        if (!this.running || !nodeId) return;

        const node = this.definition.nodes[nodeId];
        if (!node) {
            console.warn(`[MediaCueGraph] Node "${nodeId}" not found in graph "${this.graphId}"`);
            this.stop();
            return;
        }

        this.currentNodeId = nodeId;

        // Handle node based on type
        switch (node.type) {
            case 'delay':
                this._handleDelay(nodeId, node);
                break;

            case 'branch':
                this._handleBranch(nodeId, node);
                break;

            case 'script':
                this._handleScript(nodeId, node);
                break;

            default:
                // Media node (audio, video, image, subtitle, fx)
                this._handleMediaNode(nodeId, node);
                break;
        }
    }

    /** @private */
    _handleMediaNode(nodeId, node) {
        // Invoke the cue action callback
        this._onCueAction(nodeId, node);

        // If the node has a duration, auto-advance after it
        if (node.durationMs && node.durationMs > 0) {
            this._timer = setTimeout(() => {
                this._timer = null;
                this._advance(nodeId, node);
            }, node.durationMs);
        } else if (node.next && !node.waitForEnd) {
            // Advance immediately if not waiting for media end
            this._advance(nodeId, node);
        }
        // If node.waitForEnd is true, the external system must call advanceTo() or notify completion
    }

    /** @private */
    _handleDelay(nodeId, node) {
        const duration = node.durationMs || 0;
        this._timer = setTimeout(() => {
            this._timer = null;
            this._advance(nodeId, node);
        }, Math.max(0, duration));
    }

    /** @private */
    _handleBranch(nodeId, node) {
        const flags = this._context.flags || {};
        const getFlag = this._context.getFlag || ((key) => flags[key]);

        // Evaluate conditions in order
        for (const condition of (node.conditions || [])) {
            let result = false;

            if (condition.flag !== undefined) {
                const flagValue = getFlag(condition.flag);

                if (condition.equals !== undefined) {
                    result = flagValue === condition.equals;
                } else if (condition.notEquals !== undefined) {
                    result = flagValue !== condition.notEquals;
                } else if (condition.exists !== undefined) {
                    result = condition.exists ? flagValue !== undefined && flagValue !== null : flagValue === undefined || flagValue === null;
                } else {
                    // Truthy check
                    result = !!flagValue;
                }
            }

            if (condition.scene !== undefined && this._context.getCurrentScene) {
                const sceneMatch = this._context.getCurrentScene() === condition.scene;
                // If both flag and scene conditions are present, require both (AND logic)
                result = condition.flag !== undefined ? (result && sceneMatch) : sceneMatch;
            }

            if (result && condition.target) {
                this._executeNode(condition.target);
                return;
            }
        }

        // Default target if no condition matched
        if (node.defaultTarget) {
            this._executeNode(node.defaultTarget);
        } else {
            // Dead end — stop graph
            this.stop();
        }
    }

    /** @private */
    _handleScript(nodeId, node) {
        // Emit an event for script execution
        EventBus.emit('media:cue:script', {
            graphId: this.graphId,
            nodeId,
            scriptRef: node.scriptRef || null,
            inline: node.inline || null,
            timestamp: Date.now()
        });

        // Advance immediately
        this._advance(nodeId, node);
    }

    /** @private */
    _advance(nodeId, node) {
        if (!this.running) return;

        // If node loops, re-execute it
        if (node.loop) {
            this._executeNode(nodeId);
            return;
        }

        if (!node.next) {
            // Terminal node — graph done
            this.stop();
            return;
        }

        if (typeof node.next === 'string') {
            this._executeNode(node.next);
            return;
        }

        if (Array.isArray(node.next)) {
            // Evaluate conditional edges or take first
            for (const edge of node.next) {
                if (typeof edge === 'string') {
                    this._executeNode(edge);
                    return;
                }
                if (edge && typeof edge === 'object') {
                    // Check edge condition if present
                    if (edge.condition) {
                        const flags = this._context.flags || {};
                        const getFlag = this._context.getFlag || ((key) => flags[key]);
                        const flagValue = getFlag(edge.condition.flag);
                        if (edge.condition.equals !== undefined && flagValue !== edge.condition.equals) continue;
                        if (edge.condition.notEquals !== undefined && flagValue === edge.condition.notEquals) continue;
                    }
                    if (edge.target) {
                        this._executeNode(edge.target);
                        return;
                    }
                }
            }
            // No edge matched — stop
            this.stop();
        }
    }

    /**
     * Notify the graph that the current cue has completed (for waitForEnd nodes)
     */
    notifyCueComplete() {
        if (!this.running || !this.currentNodeId) return;
        const node = this.definition.nodes[this.currentNodeId];
        if (node && node.waitForEnd) {
            this._advance(this.currentNodeId, node);
        }
    }
}


/**
 * MediaCueGraph - Factory and registry for cue graph instances
 */
class MediaCueGraphFactory {
    constructor() {
        // Active graph instances: graphId -> CueGraphInstance
        this._instances = new Map();
    }

    /**
     * Create and register a cue graph instance
     * @param {string} graphId - Unique graph identifier
     * @param {Object} definition - Graph definition
     * @returns {CueGraphInstance|null} Instance or null if validation fails
     */
    create(graphId, definition) {
        const validation = validateGraphDefinition(definition);
        if (!validation.valid) {
            console.error(`[MediaCueGraph] Invalid graph "${graphId}":`, validation.errors);
            return null;
        }

        if (validation.warnings.length > 0) {
            console.warn(`[MediaCueGraph] Graph "${graphId}" warnings:`, validation.warnings);
        }

        const instance = new CueGraphInstance(graphId, definition);
        this._instances.set(graphId, instance);
        return instance;
    }

    /**
     * Get an active graph instance
     * @param {string} graphId
     * @returns {CueGraphInstance|null}
     */
    get(graphId) {
        return this._instances.get(graphId) || null;
    }

    /**
     * Stop and remove a graph instance
     * @param {string} graphId
     */
    destroy(graphId) {
        const instance = this._instances.get(graphId);
        if (instance) {
            instance.stop();
            this._instances.delete(graphId);
        }
    }

    /**
     * Stop and remove all graph instances
     */
    destroyAll() {
        for (const [, instance] of this._instances) {
            instance.stop();
        }
        this._instances.clear();
    }

    /**
     * Validate a graph definition without creating an instance
     * @param {Object} definition
     * @returns {{valid: boolean, errors: string[], warnings: string[]}}
     */
    validate(definition) {
        return validateGraphDefinition(definition);
    }

    /**
     * Simulate a graph for dead-end and cycle detection
     * @param {Object} definition
     * @param {Object} [mockContext]
     * @returns {Object}
     */
    simulate(definition, mockContext) {
        return simulateGraph(definition, mockContext);
    }

    /**
     * List all active graph IDs
     * @returns {string[]}
     */
    listActive() {
        return [...this._instances.keys()];
    }
}

// Singleton
const MediaCueGraph = new MediaCueGraphFactory();

// Debug access
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.mediaCueGraph = MediaCueGraph;
}

export { NODE_TYPES, CueGraphInstance, validateGraphDefinition, simulateGraph };
export default MediaCueGraph;
