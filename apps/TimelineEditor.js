/**
 * TimelineEditor - Visual timeline/cue editor with export-only principle
 *
 * Phase 3 of the ARG Expansion Master Plan (Workstream F).
 * Provides:
 *   - Visual node-based timeline for cue graph authoring
 *   - Node types: Trigger, Branch, Action, Script, Delay, Media Cue
 *   - Cue graph validation and dry-run simulation
 *   - Export to .retro scripts + bindings.json + cue graph manifests
 *   - Source files remain canonical (editor is convenience only)
 *
 * Export contract:
 *   - Exports deterministic, reviewable .retro scene scripts
 *   - Exports bindings.json for event-to-script trigger wiring
 *   - Exports cue graph definitions compatible with MediaCueGraph
 *   - Optional metadata comments for round-trip fidelity
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import MediaCueGraph, { validateGraphDefinition, simulateGraph, NODE_TYPES } from '../core/MediaCueGraph.js';

/**
 * Default empty node templates for each type
 */
const NODE_TEMPLATES = {
    audio: { type: 'audio', assetId: '', group: 'music', durationMs: 0, loop: false },
    video: { type: 'video', assetId: '', durationMs: 0 },
    image: { type: 'image', assetId: '', durationMs: 3000 },
    subtitle: { type: 'subtitle', text: '', durationMs: 3000 },
    fx: { type: 'fx', presetId: '', durationMs: 2000 },
    delay: { type: 'delay', durationMs: 1000 },
    branch: { type: 'branch', conditions: [], defaultTarget: null },
    script: { type: 'script', scriptRef: '', inline: '' }
};

class TimelineEditor extends AppBase {
    constructor() {
        super({
            id: 'timeline-editor',
            name: 'Timeline Editor',
            icon: '⏱',
            width: 900,
            height: 620,
            minWidth: 640,
            minHeight: 480,
            category: 'systemtools',
            singleton: true,
            resizable: true
        });
    }

    onOpen() {
        return `
        <div class="timeline-editor">
            <div class="te-toolbar">
                <button class="te-toolbar-btn" data-action="new" title="New Graph">
                    <span class="te-toolbar-icon">📄</span> New
                </button>
                <button class="te-toolbar-btn" data-action="import" title="Import Cue Graph JSON">
                    <span class="te-toolbar-icon">📥</span> Import
                </button>
                <span class="te-toolbar-separator"></span>
                <button class="te-toolbar-btn" data-action="add-node" title="Add Node">
                    <span class="te-toolbar-icon">➕</span> Add Node
                </button>
                <button class="te-toolbar-btn" data-action="delete-node" title="Delete Selected Node">
                    <span class="te-toolbar-icon">🗑</span> Delete
                </button>
                <span class="te-toolbar-separator"></span>
                <button class="te-toolbar-btn" data-action="validate" title="Validate Graph">
                    <span class="te-toolbar-icon">✅</span> Validate
                </button>
                <button class="te-toolbar-btn" data-action="simulate" title="Simulate Graph">
                    <span class="te-toolbar-icon">▶</span> Simulate
                </button>
                <span class="te-toolbar-separator"></span>
                <button class="te-toolbar-btn te-btn-export" data-action="export-graph" title="Export Cue Graph JSON">
                    <span class="te-toolbar-icon">📤</span> Export Graph
                </button>
                <button class="te-toolbar-btn te-btn-export" data-action="export-retro" title="Export as RetroScript">
                    <span class="te-toolbar-icon">📜</span> Export .retro
                </button>
                <button class="te-toolbar-btn te-btn-export" data-action="export-bindings" title="Export Bindings">
                    <span class="te-toolbar-icon">🔗</span> Export Bindings
                </button>
            </div>

            <div class="te-main">
                <!-- Node List Panel -->
                <div class="te-sidebar">
                    <div class="te-sidebar-header">
                        <span>Graph:</span>
                        <input type="text" class="te-input te-graph-id" id="te-graph-id" value="my-cue-graph" placeholder="graph-id">
                    </div>
                    <div class="te-sidebar-section">
                        <div class="te-sidebar-label">Entry Node</div>
                        <select class="te-input" id="te-entry-node"></select>
                    </div>
                    <div class="te-sidebar-section">
                        <div class="te-sidebar-label">Nodes</div>
                        <div class="te-node-list" id="te-node-list">
                            <div class="te-empty-state">No nodes. Click "Add Node" to begin.</div>
                        </div>
                    </div>
                </div>

                <!-- Canvas / Node Detail -->
                <div class="te-content">
                    <div class="te-content-tabs">
                        <div class="te-content-tab active" data-view="visual">Visual</div>
                        <div class="te-content-tab" data-view="properties">Properties</div>
                        <div class="te-content-tab" data-view="output">Output</div>
                    </div>

                    <!-- Visual Timeline View -->
                    <div class="te-view active" data-view-content="visual">
                        <div class="te-canvas" id="te-canvas">
                            <div class="te-canvas-placeholder">
                                Add nodes to visualize the cue graph timeline.
                                <br><br>
                                <strong>Node Types:</strong><br>
                                🔊 Audio &nbsp; 🎥 Video &nbsp; 🖼 Image &nbsp; 💬 Subtitle<br>
                                ✨ FX &nbsp; ⏱ Delay &nbsp; 🔀 Branch &nbsp; 📜 Script
                            </div>
                        </div>
                    </div>

                    <!-- Properties Panel -->
                    <div class="te-view" data-view-content="properties">
                        <div class="te-properties" id="te-properties">
                            <div class="te-empty-state">Select a node to edit its properties.</div>
                        </div>
                    </div>

                    <!-- Output Panel -->
                    <div class="te-view" data-view-content="output">
                        <div class="te-output">
                            <div class="te-output-header">
                                <span>Export Preview</span>
                                <button class="te-btn-sm" data-action="copy-output">Copy to Clipboard</button>
                            </div>
                            <pre class="te-output-code" id="te-output-code">Click an export button to generate output.</pre>
                        </div>
                    </div>
                </div>
            </div>

            <div class="te-statusbar">
                <span id="te-status-msg">Ready</span>
                <span class="te-status-sep">|</span>
                <span id="te-status-nodes">Nodes: 0</span>
                <span class="te-status-sep">|</span>
                <span id="te-status-valid">Not validated</span>
            </div>
        </div>
        `;
    }

    onMount() {
        // Graph state
        this._nodes = new Map(); // nodeId -> node definition
        this._selectedNodeId = null;
        this._nodeCounter = 0;
        this._lastExportOutput = '';

        this._setupToolbar();
        this._setupContentTabs();
        this._setupNodeListInteraction();
        this._updateStatusBar();

        // Register scriptable commands
        this.registerCommand('export', (payload) => {
            const format = payload?.format || 'graph';
            if (format === 'retro') return { output: this._exportRetroScript() };
            if (format === 'bindings') return { output: this._exportBindings() };
            return { output: this._exportGraphJSON() };
        });
        this.registerQuery('graph', () => this._buildGraphDefinition());
    }

    onClose() {
        this._nodes = null;
        this._selectedNodeId = null;
    }

    // ==========================================
    // TOOLBAR
    // ==========================================

    _setupToolbar() {
        const actions = {
            'new': () => this._newGraph(),
            'import': () => this._importGraph(),
            'add-node': () => this._showAddNodeDialog(),
            'delete-node': () => this._deleteSelectedNode(),
            'validate': () => this._validateGraph(),
            'simulate': () => this._simulateGraph(),
            'export-graph': () => this._doExport('graph'),
            'export-retro': () => this._doExport('retro'),
            'export-bindings': () => this._doExport('bindings'),
            'copy-output': () => this._copyOutput()
        };

        for (const [action, handler] of Object.entries(actions)) {
            const btn = this.getElement(`[data-action="${action}"]`);
            if (btn) this.addHandler(btn, 'click', handler);
        }
    }

    _setupContentTabs() {
        const tabs = this.getElements('.te-content-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', (e) => {
                const view = e.currentTarget.dataset.view;
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const views = this.getElements('.te-view');
                views.forEach(v => v.classList.toggle('active', v.dataset.viewContent === view));
            });
        });
    }

    _setupNodeListInteraction() {
        const list = this.getElement('#te-node-list');
        if (list) {
            this.addHandler(list, 'click', (e) => {
                const nodeItem = e.target.closest('.te-node-item');
                if (nodeItem) {
                    this._selectNode(nodeItem.dataset.nodeId);
                }
            });
        }
    }

    // ==========================================
    // GRAPH MANAGEMENT
    // ==========================================

    async _newGraph() {
        if (this._nodes.size > 0) {
            const confirmed = await this.confirm('Clear current graph? Unsaved changes will be lost.', 'New Graph');
            if (!confirmed) return;
        }
        this._nodes.clear();
        this._selectedNodeId = null;
        this._nodeCounter = 0;
        const graphIdInput = this.getElement('#te-graph-id');
        if (graphIdInput) graphIdInput.value = 'my-cue-graph';
        this._refreshAll();
        this._setStatus('New graph created');
    }

    async _importGraph() {
        const jsonStr = await this.prompt('Paste cue graph JSON definition:', '', 'Import Cue Graph');
        if (!jsonStr) return;

        try {
            const definition = JSON.parse(jsonStr);
            const validation = validateGraphDefinition(definition);
            if (!validation.valid) {
                this.alert(`Invalid graph:\n${validation.errors.join('\n')}`);
                return;
            }

            this._nodes.clear();
            this._nodeCounter = 0;

            for (const [nodeId, node] of Object.entries(definition.nodes || {})) {
                this._nodes.set(nodeId, { ...node });
                this._nodeCounter++;
            }

            // Set entry node
            const entrySelect = this.getElement('#te-entry-node');
            if (entrySelect && definition.entryNode) {
                this._refreshEntryNodeSelect();
                entrySelect.value = definition.entryNode;
            }

            this._refreshAll();
            this._setStatus(`Imported graph with ${this._nodes.size} nodes`);

            if (validation.warnings.length > 0) {
                this.alert(`Import warnings:\n${validation.warnings.join('\n')}`);
            }
        } catch (err) {
            this.alert(`Invalid JSON: ${err.message}`);
        }
    }

    async _showAddNodeDialog() {
        const nodeTypes = [
            'audio - 🔊 Audio cue',
            'video - 🎥 Video cue',
            'image - 🖼 Image overlay',
            'subtitle - 💬 Subtitle text',
            'fx - ✨ Visual effect',
            'delay - ⏱ Timed delay',
            'branch - 🔀 Conditional branch',
            'script - 📜 Script reference'
        ];

        const typeStr = await this.prompt(
            `Select node type:\n\n${nodeTypes.join('\n')}\n\nEnter type name:`,
            'audio',
            'Add Node'
        );

        if (!typeStr) return;
        const type = typeStr.trim().toLowerCase();

        if (!NODE_TEMPLATES[type]) {
            this.alert(`Unknown node type: ${type}`);
            return;
        }

        this._nodeCounter++;
        const nodeId = `${type}-${this._nodeCounter}`;
        const template = { ...NODE_TEMPLATES[type] };

        this._nodes.set(nodeId, template);
        this._refreshAll();
        this._selectNode(nodeId);
        this._setStatus(`Added node: ${nodeId}`);
    }

    async _deleteSelectedNode() {
        if (!this._selectedNodeId) {
            this.alert('No node selected.');
            return;
        }

        const confirmed = await this.confirm(
            `Delete node "${this._selectedNodeId}"?`,
            'Delete Node'
        );
        if (!confirmed) return;

        const deletedId = this._selectedNodeId;

        // Remove references to this node from other nodes
        for (const [, node] of this._nodes) {
            if (node.next === deletedId) {
                delete node.next;
            } else if (Array.isArray(node.next)) {
                node.next = node.next.filter(edge => {
                    if (typeof edge === 'string') return edge !== deletedId;
                    if (edge?.target === deletedId) return false;
                    return true;
                });
                if (node.next.length === 0) delete node.next;
            }
            if (node.defaultTarget === deletedId) {
                delete node.defaultTarget;
            }
            if (Array.isArray(node.conditions)) {
                node.conditions = node.conditions.filter(c => c.target !== deletedId);
            }
        }

        this._nodes.delete(deletedId);
        this._selectedNodeId = null;
        this._refreshAll();
        this._setStatus(`Deleted node: ${deletedId}`);
    }

    // ==========================================
    // NODE SELECTION & PROPERTIES
    // ==========================================

    _selectNode(nodeId) {
        this._selectedNodeId = nodeId;

        // Highlight in list
        const items = this.getElements('.te-node-item');
        items.forEach(item => item.classList.toggle('active', item.dataset.nodeId === nodeId));

        // Show properties
        this._renderProperties();

        // Switch to properties tab
        const propTab = this.getElement('.te-content-tab[data-view="properties"]');
        if (propTab) propTab.click();
    }

    _renderProperties() {
        const container = this.getElement('#te-properties');
        if (!container) return;

        if (!this._selectedNodeId || !this._nodes.has(this._selectedNodeId)) {
            container.innerHTML = '<div class="te-empty-state">Select a node to edit its properties.</div>';
            return;
        }

        const nodeId = this._selectedNodeId;
        const node = this._nodes.get(nodeId);
        const otherNodes = [...this._nodes.keys()].filter(id => id !== nodeId);

        let html = `
            <div class="te-prop-section">
                <div class="te-prop-header">Node: ${this._escapeHtml(nodeId)}</div>
                <div class="te-prop-row">
                    <label>ID</label>
                    <input type="text" class="te-input" id="te-prop-id" value="${this._escapeHtml(nodeId)}">
                    <button class="te-btn-sm" data-prop-action="rename">Rename</button>
                </div>
                <div class="te-prop-row">
                    <label>Type</label>
                    <span class="te-prop-value">${this._getNodeIcon(node.type)} ${node.type}</span>
                </div>
            </div>
        `;

        // Type-specific properties
        if (['audio', 'video', 'image'].includes(node.type)) {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Media Properties</div>
                    <div class="te-prop-row">
                        <label>Asset ID</label>
                        <input type="text" class="te-input" data-prop="assetId" value="${this._escapeHtml(node.assetId || '')}">
                    </div>
                    ${node.type === 'audio' ? `
                    <div class="te-prop-row">
                        <label>Group</label>
                        <select class="te-input" data-prop="group">
                            ${['music', 'ambience', 'voice', 'ui', 'diegetic', 'stinger'].map(g =>
                                `<option value="${g}" ${node.group === g ? 'selected' : ''}>${g}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="te-prop-row">
                        <label>Loop</label>
                        <input type="checkbox" data-prop="loop" ${node.loop ? 'checked' : ''}>
                    </div>
                    ` : ''}
                    <div class="te-prop-row">
                        <label>Duration (ms)</label>
                        <input type="number" class="te-input" data-prop="durationMs" value="${node.durationMs || 0}" min="0">
                    </div>
                    <div class="te-prop-row">
                        <label>Wait for End</label>
                        <input type="checkbox" data-prop="waitForEnd" ${node.waitForEnd ? 'checked' : ''}>
                    </div>
                </div>
            `;
        }

        if (node.type === 'subtitle') {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Subtitle Properties</div>
                    <div class="te-prop-row">
                        <label>Text</label>
                        <input type="text" class="te-input" data-prop="text" value="${this._escapeHtml(node.text || '')}">
                    </div>
                    <div class="te-prop-row">
                        <label>Duration (ms)</label>
                        <input type="number" class="te-input" data-prop="durationMs" value="${node.durationMs || 3000}" min="0">
                    </div>
                </div>
            `;
        }

        if (node.type === 'fx') {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Effect Properties</div>
                    <div class="te-prop-row">
                        <label>Preset</label>
                        <input type="text" class="te-input" data-prop="presetId" value="${this._escapeHtml(node.presetId || '')}">
                    </div>
                    <div class="te-prop-row">
                        <label>Duration (ms)</label>
                        <input type="number" class="te-input" data-prop="durationMs" value="${node.durationMs || 2000}" min="0">
                    </div>
                </div>
            `;
        }

        if (node.type === 'delay') {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Delay Properties</div>
                    <div class="te-prop-row">
                        <label>Duration (ms)</label>
                        <input type="number" class="te-input" data-prop="durationMs" value="${node.durationMs || 1000}" min="0">
                    </div>
                </div>
            `;
        }

        if (node.type === 'script') {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Script Properties</div>
                    <div class="te-prop-row">
                        <label>Script Ref</label>
                        <input type="text" class="te-input" data-prop="scriptRef" value="${this._escapeHtml(node.scriptRef || '')}" placeholder="scenes/my-scene.retro">
                    </div>
                    <div class="te-prop-row">
                        <label>Inline Code</label>
                        <textarea class="te-input te-textarea" data-prop="inline">${this._escapeHtml(node.inline || '')}</textarea>
                    </div>
                </div>
            `;
        }

        if (node.type === 'branch') {
            const conditions = node.conditions || [];
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">
                        Branch Conditions
                        <button class="te-btn-sm" data-prop-action="add-condition">+ Add</button>
                    </div>
                    ${conditions.map((cond, i) => `
                        <div class="te-condition-row" data-cond-index="${i}">
                            <div class="te-prop-row">
                                <label>Flag</label>
                                <input type="text" class="te-input" data-cond-prop="flag" data-cond-index="${i}" value="${this._escapeHtml(cond.flag || '')}">
                                <label>= </label>
                                <input type="text" class="te-input" data-cond-prop="equals" data-cond-index="${i}" value="${cond.equals !== undefined ? this._escapeHtml(String(cond.equals)) : ''}">
                            </div>
                            <div class="te-prop-row">
                                <label>Target</label>
                                <select class="te-input" data-cond-prop="target" data-cond-index="${i}">
                                    <option value="">— none —</option>
                                    ${otherNodes.map(id => `<option value="${id}" ${cond.target === id ? 'selected' : ''}>${id}</option>`).join('')}
                                </select>
                                <button class="te-btn-sm te-btn-danger" data-prop-action="remove-condition" data-cond-index="${i}">✕</button>
                            </div>
                        </div>
                    `).join('')}
                    <div class="te-prop-row">
                        <label>Default Target</label>
                        <select class="te-input" data-prop="defaultTarget">
                            <option value="">— none —</option>
                            ${otherNodes.map(id => `<option value="${id}" ${node.defaultTarget === id ? 'selected' : ''}>${id}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
        }

        // Next node (for non-branch types)
        if (node.type !== 'branch') {
            html += `
                <div class="te-prop-section">
                    <div class="te-prop-header">Transition</div>
                    <div class="te-prop-row">
                        <label>Next Node</label>
                        <select class="te-input" data-prop="next">
                            <option value="">— end (terminal) —</option>
                            ${otherNodes.map(id => `<option value="${id}" ${node.next === id ? 'selected' : ''}>${id}</option>`).join('')}
                        </select>
                    </div>
                </div>
            `;
        }

        // Apply button
        html += `
            <div class="te-prop-actions">
                <button class="te-btn-sm te-btn-primary" data-prop-action="apply">Apply Changes</button>
            </div>
        `;

        container.innerHTML = html;

        // Wire up property action buttons
        this._wirePropertyActions(container);
    }

    _wirePropertyActions(container) {
        // Apply changes
        const applyBtn = container.querySelector('[data-prop-action="apply"]');
        if (applyBtn) {
            this.addHandler(applyBtn, 'click', () => this._applyProperties());
        }

        // Rename
        const renameBtn = container.querySelector('[data-prop-action="rename"]');
        if (renameBtn) {
            this.addHandler(renameBtn, 'click', () => this._renameNode());
        }

        // Add condition
        const addCondBtn = container.querySelector('[data-prop-action="add-condition"]');
        if (addCondBtn) {
            this.addHandler(addCondBtn, 'click', () => {
                const node = this._nodes.get(this._selectedNodeId);
                if (!node) return;
                if (!node.conditions) node.conditions = [];
                node.conditions.push({ flag: '', equals: true, target: '' });
                this._renderProperties();
            });
        }

        // Remove condition
        const removeCondBtns = container.querySelectorAll('[data-prop-action="remove-condition"]');
        removeCondBtns.forEach(btn => {
            this.addHandler(btn, 'click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.condIndex);
                const node = this._nodes.get(this._selectedNodeId);
                if (node && node.conditions) {
                    node.conditions.splice(idx, 1);
                    this._renderProperties();
                }
            });
        });
    }

    _applyProperties() {
        if (!this._selectedNodeId) return;
        const node = this._nodes.get(this._selectedNodeId);
        if (!node) return;

        const container = this.getElement('#te-properties');
        if (!container) return;

        // Read simple properties
        const inputs = container.querySelectorAll('[data-prop]');
        inputs.forEach(input => {
            const prop = input.dataset.prop;
            if (input.type === 'checkbox') {
                node[prop] = input.checked;
            } else if (input.type === 'number') {
                node[prop] = parseInt(input.value) || 0;
            } else if (input.tagName === 'SELECT') {
                node[prop] = input.value || undefined;
                if (!input.value) delete node[prop];
            } else if (input.tagName === 'TEXTAREA') {
                node[prop] = input.value;
            } else {
                node[prop] = input.value;
            }
        });

        // Read condition properties for branch nodes
        if (node.type === 'branch') {
            const condInputs = container.querySelectorAll('[data-cond-prop]');
            condInputs.forEach(input => {
                const idx = parseInt(input.dataset.condIndex);
                const prop = input.dataset.condProp;
                if (!node.conditions[idx]) return;

                if (prop === 'equals') {
                    let val = input.value;
                    try { val = JSON.parse(val); } catch { /* string */ }
                    node.conditions[idx][prop] = val;
                } else {
                    node.conditions[idx][prop] = input.value;
                }
            });
        }

        this._refreshCanvas();
        this._updateStatusBar();
        this._setStatus(`Properties applied to ${this._selectedNodeId}`);
    }

    async _renameNode() {
        const oldId = this.getElement('#te-prop-id')?.value?.trim();
        if (!oldId || !this._selectedNodeId) return;

        if (oldId === this._selectedNodeId) return; // No change

        if (this._nodes.has(oldId)) {
            this.alert(`Node ID "${oldId}" already exists.`);
            return;
        }

        const node = this._nodes.get(this._selectedNodeId);
        const prevId = this._selectedNodeId;

        // Update references in other nodes
        for (const [, otherNode] of this._nodes) {
            if (otherNode.next === prevId) otherNode.next = oldId;
            if (Array.isArray(otherNode.next)) {
                otherNode.next = otherNode.next.map(edge => {
                    if (typeof edge === 'string' && edge === prevId) return oldId;
                    if (edge?.target === prevId) return { ...edge, target: oldId };
                    return edge;
                });
            }
            if (otherNode.defaultTarget === prevId) otherNode.defaultTarget = oldId;
            if (Array.isArray(otherNode.conditions)) {
                otherNode.conditions.forEach(c => {
                    if (c.target === prevId) c.target = oldId;
                });
            }
        }

        this._nodes.delete(prevId);
        this._nodes.set(oldId, node);
        this._selectedNodeId = oldId;

        this._refreshAll();
        this._setStatus(`Renamed "${prevId}" to "${oldId}"`);
    }

    // ==========================================
    // VISUAL CANVAS
    // ==========================================

    _refreshCanvas() {
        const canvas = this.getElement('#te-canvas');
        if (!canvas) return;

        if (this._nodes.size === 0) {
            canvas.innerHTML = `<div class="te-canvas-placeholder">
                Add nodes to visualize the cue graph timeline.
                <br><br>
                <strong>Node Types:</strong><br>
                🔊 Audio &nbsp; 🎥 Video &nbsp; 🖼 Image &nbsp; 💬 Subtitle<br>
                ✨ FX &nbsp; ⏱ Delay &nbsp; 🔀 Branch &nbsp; 📜 Script
            </div>`;
            return;
        }

        const entryNode = this.getElement('#te-entry-node')?.value || '';
        const nodes = [...this._nodes.entries()];

        // Build a flow visualization
        let html = '<div class="te-flow">';

        // Show nodes in order, highlighting connections
        nodes.forEach(([nodeId, node]) => {
            const isEntry = nodeId === entryNode;
            const isSelected = nodeId === this._selectedNodeId;
            const icon = this._getNodeIcon(node.type);
            const nextLabel = this._getNextLabel(node);

            html += `
                <div class="te-flow-node ${isEntry ? 'te-flow-entry' : ''} ${isSelected ? 'te-flow-selected' : ''}"
                     data-canvas-node="${nodeId}">
                    <div class="te-flow-node-header">
                        ${isEntry ? '▶ ' : ''}${icon} ${this._escapeHtml(nodeId)}
                    </div>
                    <div class="te-flow-node-body">
                        ${this._getNodeSummary(nodeId, node)}
                    </div>
                    ${nextLabel ? `<div class="te-flow-node-next">→ ${this._escapeHtml(nextLabel)}</div>` : ''}
                </div>
            `;
        });

        html += '</div>';
        canvas.innerHTML = html;

        // Add click handlers to canvas nodes
        const canvasNodes = canvas.querySelectorAll('[data-canvas-node]');
        canvasNodes.forEach(el => {
            this.addHandler(el, 'click', (e) => {
                this._selectNode(e.currentTarget.dataset.canvasNode);
            });
        });
    }

    _getNodeIcon(type) {
        const icons = {
            audio: '🔊', video: '🎥', image: '🖼', subtitle: '💬',
            fx: '✨', delay: '⏱', branch: '🔀', script: '📜'
        };
        return icons[type] || '❓';
    }

    _getNodeSummary(nodeId, node) {
        switch (node.type) {
            case 'audio': return `${node.assetId || '(no asset)'} [${node.group || 'music'}]${node.loop ? ' 🔁' : ''}`;
            case 'video': return `${node.assetId || '(no asset)'}`;
            case 'image': return `${node.assetId || '(no asset)'} ${node.durationMs ? node.durationMs + 'ms' : ''}`;
            case 'subtitle': return `"${(node.text || '').substring(0, 30)}${(node.text || '').length > 30 ? '...' : ''}"`;
            case 'fx': return `${node.presetId || '(no preset)'} ${node.durationMs}ms`;
            case 'delay': return `${node.durationMs || 0}ms`;
            case 'branch': return `${(node.conditions || []).length} condition(s)`;
            case 'script': return node.scriptRef || '(inline)';
            default: return node.type;
        }
    }

    _getNextLabel(node) {
        if (node.type === 'branch') {
            const targets = (node.conditions || []).map(c => c.target).filter(Boolean);
            if (node.defaultTarget) targets.push(`default:${node.defaultTarget}`);
            return targets.length > 0 ? targets.join(', ') : null;
        }
        if (typeof node.next === 'string') return node.next;
        if (Array.isArray(node.next) && node.next.length > 0) {
            return node.next.map(e => typeof e === 'string' ? e : e?.target).filter(Boolean).join(', ');
        }
        return null;
    }

    // ==========================================
    // NODE LIST
    // ==========================================

    _refreshNodeList() {
        const list = this.getElement('#te-node-list');
        if (!list) return;

        if (this._nodes.size === 0) {
            list.innerHTML = '<div class="te-empty-state">No nodes. Click "Add Node" to begin.</div>';
            return;
        }

        const entryNode = this.getElement('#te-entry-node')?.value || '';

        list.innerHTML = [...this._nodes.entries()].map(([nodeId, node]) => {
            const icon = this._getNodeIcon(node.type);
            const isEntry = nodeId === entryNode;
            const isSelected = nodeId === this._selectedNodeId;
            return `<div class="te-node-item ${isSelected ? 'active' : ''} ${isEntry ? 'te-node-entry' : ''}" data-node-id="${nodeId}">
                <span class="te-node-icon">${icon}</span>
                <span class="te-node-name">${this._escapeHtml(nodeId)}</span>
                ${isEntry ? '<span class="te-node-badge">entry</span>' : ''}
            </div>`;
        }).join('');
    }

    _refreshEntryNodeSelect() {
        const select = this.getElement('#te-entry-node');
        if (!select) return;
        const current = select.value;
        select.innerHTML = '<option value="">— none —</option>' +
            [...this._nodes.keys()].map(id =>
                `<option value="${id}" ${id === current ? 'selected' : ''}>${id}</option>`
            ).join('');
    }

    _refreshAll() {
        this._refreshEntryNodeSelect();
        this._refreshNodeList();
        this._refreshCanvas();
        this._updateStatusBar();
    }

    // ==========================================
    // VALIDATION & SIMULATION
    // ==========================================

    _buildGraphDefinition() {
        const entryNode = this.getElement('#te-entry-node')?.value || '';
        const nodes = {};
        for (const [nodeId, node] of this._nodes) {
            nodes[nodeId] = { ...node };
        }
        return { entryNode, nodes };
    }

    _validateGraph() {
        const definition = this._buildGraphDefinition();
        const result = validateGraphDefinition(definition);

        let msg = '';
        if (result.valid) {
            msg = '✅ Graph is valid!\n';
        } else {
            msg = '❌ Validation errors:\n';
            result.errors.forEach(e => msg += `  • ${e}\n`);
        }
        if (result.warnings.length > 0) {
            msg += '\n⚠️ Warnings:\n';
            result.warnings.forEach(w => msg += `  • ${w}\n`);
        }

        const statusEl = this.getElement('#te-status-valid');
        if (statusEl) statusEl.textContent = result.valid ? '✅ Valid' : '❌ Invalid';

        this.alert(msg);
        this._setStatus(result.valid ? 'Graph is valid' : `${result.errors.length} error(s) found`);
    }

    _simulateGraph() {
        const definition = this._buildGraphDefinition();
        const validation = validateGraphDefinition(definition);
        if (!validation.valid) {
            this.alert('Fix validation errors before simulation:\n' + validation.errors.join('\n'));
            return;
        }

        const simResult = simulateGraph(definition, {});

        let msg = `Simulation Results:\n\n`;
        msg += `Reachable nodes: ${simResult.reachable.length}\n`;
        msg += `  ${simResult.reachable.join(', ')}\n\n`;

        if (simResult.deadEnds.length > 0) {
            msg += `⚠️ Dead ends (terminal nodes): ${simResult.deadEnds.length}\n`;
            msg += `  ${simResult.deadEnds.join(', ')}\n\n`;
        } else {
            msg += `✅ No dead ends\n\n`;
        }

        if (simResult.cycles.length > 0) {
            msg += `🔁 Cycles detected at: ${simResult.cycles.join(', ')}\n\n`;
        }

        msg += `Max depth: ${simResult.maxDepth}\n`;

        // Check for unreachable nodes
        const unreachable = [...this._nodes.keys()].filter(id => !simResult.reachable.includes(id));
        if (unreachable.length > 0) {
            msg += `\n⚠️ Unreachable nodes: ${unreachable.join(', ')}`;
        }

        this.alert(msg);
        this._setStatus('Simulation complete');
    }

    // ==========================================
    // EXPORT
    // ==========================================

    _doExport(format) {
        let output = '';
        switch (format) {
            case 'graph': output = this._exportGraphJSON(); break;
            case 'retro': output = this._exportRetroScript(); break;
            case 'bindings': output = this._exportBindings(); break;
        }

        this._lastExportOutput = output;
        const outputEl = this.getElement('#te-output-code');
        if (outputEl) outputEl.textContent = output;

        // Switch to output tab
        const outputTab = this.getElement('.te-content-tab[data-view="output"]');
        if (outputTab) outputTab.click();

        this._setStatus(`Exported as ${format}`);
    }

    _exportGraphJSON() {
        const definition = this._buildGraphDefinition();
        return JSON.stringify(definition, null, 2);
    }

    _exportRetroScript() {
        const graphId = this.getElement('#te-graph-id')?.value || 'my-cue-graph';
        const definition = this._buildGraphDefinition();
        const lines = [];

        lines.push(`# Timeline: ${graphId}`);
        lines.push(`# Generated by Campaign Studio Timeline Editor`);
        lines.push(`# Source: export-only — edit in Timeline Editor and re-export`);
        lines.push('');

        // Generate scene script from node sequence
        const visited = new Set();
        const entryNode = definition.entryNode;

        if (entryNode) {
            this._generateRetroScriptNode(definition, entryNode, lines, visited, 0);
        }

        // Generate any unvisited nodes as standalone handlers
        for (const [nodeId, node] of Object.entries(definition.nodes)) {
            if (!visited.has(nodeId)) {
                lines.push('');
                lines.push(`# Orphan node: ${nodeId}`);
                this._generateRetroScriptNode(definition, nodeId, lines, visited, 0);
            }
        }

        return lines.join('\n');
    }

    _generateRetroScriptNode(definition, nodeId, lines, visited, depth) {
        if (visited.has(nodeId) || !definition.nodes[nodeId]) return;
        visited.add(nodeId);

        const node = definition.nodes[nodeId];
        const indent = '  '.repeat(depth);

        switch (node.type) {
            case 'audio':
                if (node.assetId) {
                    const opts = [];
                    if (node.group) opts.push(`group: "${node.group}"`);
                    if (node.loop) opts.push('loop: true');
                    lines.push(`${indent}audio.play "${node.assetId}"${opts.length ? ` { ${opts.join(', ')} }` : ''}`);
                }
                if (node.durationMs > 0) lines.push(`${indent}wait ${node.durationMs}`);
                break;

            case 'video':
                if (node.assetId) {
                    lines.push(`${indent}video.play "${node.assetId}"`);
                }
                if (node.durationMs > 0) lines.push(`${indent}wait ${node.durationMs}`);
                break;

            case 'image':
                if (node.assetId) {
                    lines.push(`${indent}image.show "main", "${node.assetId}"`);
                }
                if (node.durationMs > 0) {
                    lines.push(`${indent}wait ${node.durationMs}`);
                    lines.push(`${indent}image.clear "main"`);
                }
                break;

            case 'subtitle':
                if (node.text) {
                    lines.push(`${indent}subtitle.show "default", "${node.text}"`);
                }
                if (node.durationMs > 0) {
                    lines.push(`${indent}wait ${node.durationMs}`);
                    lines.push(`${indent}subtitle.clear "default"`);
                }
                break;

            case 'fx':
                if (node.presetId) {
                    lines.push(`${indent}fx.apply "${node.presetId}"`);
                }
                if (node.durationMs > 0) {
                    lines.push(`${indent}wait ${node.durationMs}`);
                    if (node.presetId) lines.push(`${indent}fx.clear "${node.presetId}"`);
                }
                break;

            case 'delay':
                lines.push(`${indent}wait ${node.durationMs || 1000}`);
                break;

            case 'branch':
                if (node.conditions) {
                    node.conditions.forEach((cond, i) => {
                        const keyword = i === 0 ? 'if' : 'elif';
                        const flagCheck = cond.equals !== undefined
                            ? `flag.get("${cond.flag}") == ${JSON.stringify(cond.equals)}`
                            : `flag.get("${cond.flag}")`;
                        lines.push(`${indent}${keyword} ${flagCheck} {`);
                        if (cond.target) {
                            this._generateRetroScriptNode(definition, cond.target, lines, visited, depth + 1);
                        }
                        lines.push(`${indent}}`);
                    });
                    if (node.defaultTarget) {
                        lines.push(`${indent}else {`);
                        this._generateRetroScriptNode(definition, node.defaultTarget, lines, visited, depth + 1);
                        lines.push(`${indent}}`);
                    }
                }
                return; // Branch handles its own transitions

            case 'script':
                if (node.scriptRef) {
                    lines.push(`${indent}# Run script: ${node.scriptRef}`);
                    lines.push(`${indent}retro "${node.scriptRef}"`);
                }
                if (node.inline) {
                    lines.push(`${indent}# Inline script`);
                    node.inline.split('\n').forEach(l => lines.push(`${indent}${l}`));
                }
                break;
        }

        // Follow next transition
        if (node.next && typeof node.next === 'string') {
            lines.push('');
            this._generateRetroScriptNode(definition, node.next, lines, visited, depth);
        }
    }

    _exportBindings() {
        const graphId = this.getElement('#te-graph-id')?.value || 'my-cue-graph';
        const definition = this._buildGraphDefinition();

        const bindings = {
            _meta: {
                generatedBy: 'Timeline Editor',
                graphId,
                timestamp: new Date().toISOString()
            },
            cueGraphs: {
                [graphId]: definition
            }
        };

        return JSON.stringify(bindings, null, 2);
    }

    async _copyOutput() {
        const output = this._lastExportOutput;
        if (!output) {
            this.alert('No output to copy. Export first.');
            return;
        }

        try {
            await navigator.clipboard.writeText(output);
            this._setStatus('Copied to clipboard');
        } catch {
            // Fallback
            const el = this.getElement('#te-output-code');
            if (el) {
                const range = document.createRange();
                range.selectNodeContents(el);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
                this._setStatus('Text selected — use Ctrl+C to copy');
            }
        }
    }

    // ==========================================
    // STATUS BAR
    // ==========================================

    _updateStatusBar() {
        const nodesEl = this.getElement('#te-status-nodes');
        if (nodesEl) nodesEl.textContent = `Nodes: ${this._nodes.size}`;
    }

    _setStatus(msg) {
        const el = this.getElement('#te-status-msg');
        if (el) el.textContent = msg;
    }

    // ==========================================
    // HELPERS
    // ==========================================

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

export default TimelineEditor;
