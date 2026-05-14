/**
 * CampaignStudio - Campaign management, preview, diagnostics, and testing tool
 *
 * Phase 3 of the ARG Expansion Master Plan (Workstream E).
 * Provides:
 *   - Campaign package import and validation
 *   - Live campaign preview with state inspection
 *   - Script syntax and schema diagnostics with actionable errors
 *   - Scene/objective/binding/media graph inspection
 *   - Manual event and multimedia cue injection for testing
 *   - Narrative state snapshot and restore
 *
 * Usage:
 *   Launch from Start Menu > System Tools > Campaign Studio
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import NarrativeStateManager from '../core/NarrativeStateManager.js';
import MediaAssetManager from '../core/MediaAssetManager.js';
import MediaCueGraph, { validateGraphDefinition, simulateGraph } from '../core/MediaCueGraph.js';

class CampaignStudio extends AppBase {
    constructor() {
        super({
            id: 'campaign-studio',
            name: 'Campaign Studio',
            icon: '🎬',
            width: 880,
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
        <div class="campaign-studio">
            <div class="cs-toolbar">
                <button class="cs-toolbar-btn" data-action="import" title="Import Campaign Package">
                    <span class="cs-toolbar-icon">📦</span> Import
                </button>
                <button class="cs-toolbar-btn" data-action="validate" title="Validate Current Campaign">
                    <span class="cs-toolbar-icon">✅</span> Validate
                </button>
                <button class="cs-toolbar-btn" data-action="refresh" title="Refresh State">
                    <span class="cs-toolbar-icon">🔄</span> Refresh
                </button>
                <span class="cs-toolbar-separator"></span>
                <button class="cs-toolbar-btn" data-action="snapshot" title="Take State Snapshot">
                    <span class="cs-toolbar-icon">📸</span> Snapshot
                </button>
                <button class="cs-toolbar-btn" data-action="restore" title="Restore Snapshot">
                    <span class="cs-toolbar-icon">⏮</span> Restore
                </button>
                <span class="cs-toolbar-separator"></span>
                <button class="cs-toolbar-btn" data-action="clear-log" title="Clear Log">
                    <span class="cs-toolbar-icon">🗑</span> Clear
                </button>
            </div>

            <div class="cs-tabs">
                <div class="cs-tab active" data-tab="overview">Overview</div>
                <div class="cs-tab" data-tab="diagnostics">Diagnostics</div>
                <div class="cs-tab" data-tab="inspector">Inspector</div>
                <div class="cs-tab" data-tab="inject">Event Inject</div>
                <div class="cs-tab" data-tab="media">Media</div>
                <div class="cs-tab" data-tab="log">Event Log</div>
            </div>

            <div class="cs-body">
                <!-- Overview Tab -->
                <div class="cs-tab-content active" data-content="overview">
                    <div class="cs-overview">
                        <div class="cs-panel cs-campaign-info">
                            <div class="cs-panel-header">Campaign Status</div>
                            <div class="cs-panel-body" id="cs-campaign-status">
                                <div class="cs-empty-state">No campaign loaded. Import a package or start a campaign via script.</div>
                            </div>
                        </div>
                        <div class="cs-overview-grid">
                            <div class="cs-panel cs-stat-panel">
                                <div class="cs-panel-header">Scene</div>
                                <div class="cs-panel-body cs-stat-value" id="cs-current-scene">—</div>
                            </div>
                            <div class="cs-panel cs-stat-panel">
                                <div class="cs-panel-header">Mood</div>
                                <div class="cs-panel-body cs-stat-value" id="cs-current-mood">—</div>
                            </div>
                            <div class="cs-panel cs-stat-panel">
                                <div class="cs-panel-header">Objectives</div>
                                <div class="cs-panel-body cs-stat-value" id="cs-objective-count">0</div>
                            </div>
                            <div class="cs-panel cs-stat-panel">
                                <div class="cs-panel-header">Flags</div>
                                <div class="cs-panel-body cs-stat-value" id="cs-flag-count">0</div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Installed Campaigns</div>
                            <div class="cs-panel-body" id="cs-campaign-list">
                                <div class="cs-empty-state">No campaigns installed.</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Diagnostics Tab -->
                <div class="cs-tab-content" data-content="diagnostics">
                    <div class="cs-diagnostics">
                        <div class="cs-panel">
                            <div class="cs-panel-header">
                                Validation Results
                                <button class="cs-btn-sm" data-action="run-diagnostics">Run Full Diagnostics</button>
                            </div>
                            <div class="cs-panel-body cs-diagnostics-output" id="cs-diagnostics-output">
                                <div class="cs-empty-state">Click "Run Full Diagnostics" to analyze the current campaign.</div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Script Validation</div>
                            <div class="cs-panel-body">
                                <textarea class="cs-script-input" id="cs-script-validate" placeholder="Paste RetroScript here to validate syntax..."></textarea>
                                <div class="cs-script-actions">
                                    <button class="cs-btn-sm" data-action="validate-script">Validate Syntax</button>
                                </div>
                                <div class="cs-script-result" id="cs-script-result"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Inspector Tab -->
                <div class="cs-tab-content" data-content="inspector">
                    <div class="cs-inspector">
                        <div class="cs-inspector-sidebar">
                            <div class="cs-inspector-nav">
                                <div class="cs-inspector-nav-item active" data-inspect="scenes">Scenes</div>
                                <div class="cs-inspector-nav-item" data-inspect="objectives">Objectives</div>
                                <div class="cs-inspector-nav-item" data-inspect="flags">Flags</div>
                                <div class="cs-inspector-nav-item" data-inspect="clues">Clues</div>
                                <div class="cs-inspector-nav-item" data-inspect="npcs">NPCs</div>
                                <div class="cs-inspector-nav-item" data-inspect="bindings">Bindings</div>
                            </div>
                        </div>
                        <div class="cs-inspector-detail" id="cs-inspector-detail">
                            <div class="cs-empty-state">Select a category to inspect narrative state.</div>
                        </div>
                    </div>
                </div>

                <!-- Event Inject Tab -->
                <div class="cs-tab-content" data-content="inject">
                    <div class="cs-inject">
                        <div class="cs-panel">
                            <div class="cs-panel-header">Quick Actions</div>
                            <div class="cs-panel-body cs-quick-actions">
                                <div class="cs-inject-group">
                                    <label>Scene</label>
                                    <div class="cs-inject-row">
                                        <input type="text" class="cs-input" id="cs-inject-scene" placeholder="scene-id">
                                        <button class="cs-btn-sm" data-action="inject-scene-enter">Enter</button>
                                        <button class="cs-btn-sm" data-action="inject-scene-complete">Complete</button>
                                    </div>
                                </div>
                                <div class="cs-inject-group">
                                    <label>Objective</label>
                                    <div class="cs-inject-row">
                                        <input type="text" class="cs-input" id="cs-inject-obj-id" placeholder="objective-id">
                                        <input type="text" class="cs-input" id="cs-inject-obj-text" placeholder="description">
                                        <button class="cs-btn-sm" data-action="inject-obj-add">Add</button>
                                        <button class="cs-btn-sm" data-action="inject-obj-complete">Complete</button>
                                    </div>
                                </div>
                                <div class="cs-inject-group">
                                    <label>Flag</label>
                                    <div class="cs-inject-row">
                                        <input type="text" class="cs-input" id="cs-inject-flag-key" placeholder="key">
                                        <input type="text" class="cs-input" id="cs-inject-flag-value" placeholder="value">
                                        <button class="cs-btn-sm" data-action="inject-flag-set">Set</button>
                                    </div>
                                </div>
                                <div class="cs-inject-group">
                                    <label>Mood</label>
                                    <div class="cs-inject-row">
                                        <select class="cs-input" id="cs-inject-mood">
                                            <option value="">— select preset —</option>
                                            <option value="default">Default</option>
                                            <option value="calm">Calm</option>
                                            <option value="tense">Tense</option>
                                            <option value="mysterious">Mysterious</option>
                                            <option value="urgent">Urgent</option>
                                            <option value="glitch">Glitch</option>
                                        </select>
                                        <button class="cs-btn-sm" data-action="inject-mood-set">Apply</button>
                                    </div>
                                </div>
                                <div class="cs-inject-group">
                                    <label>Clue</label>
                                    <div class="cs-inject-row">
                                        <input type="text" class="cs-input" id="cs-inject-clue-id" placeholder="clue-id">
                                        <input type="text" class="cs-input" id="cs-inject-clue-tags" placeholder="tags (comma-separated)">
                                        <button class="cs-btn-sm" data-action="inject-clue-add">Add</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Custom Event</div>
                            <div class="cs-panel-body">
                                <div class="cs-inject-row">
                                    <input type="text" class="cs-input cs-input-wide" id="cs-inject-event-name" placeholder="event:name (e.g. story:scene:enter)">
                                </div>
                                <textarea class="cs-script-input cs-json-input" id="cs-inject-event-payload" placeholder='{"key": "value"}'></textarea>
                                <div class="cs-inject-row">
                                    <button class="cs-btn-sm cs-btn-primary" data-action="inject-custom-event">Emit Event</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Media Tab -->
                <div class="cs-tab-content" data-content="media">
                    <div class="cs-media">
                        <div class="cs-panel">
                            <div class="cs-panel-header">
                                Media Budget
                                <button class="cs-btn-sm" data-action="refresh-media">Refresh</button>
                            </div>
                            <div class="cs-panel-body" id="cs-media-budget">
                                <div class="cs-empty-state">No media state available.</div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Active Cues</div>
                            <div class="cs-panel-body" id="cs-active-cues">
                                <div class="cs-empty-state">No active cues.</div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Cue Graphs</div>
                            <div class="cs-panel-body" id="cs-cue-graphs">
                                <div class="cs-empty-state">No cue graphs registered.</div>
                            </div>
                        </div>
                        <div class="cs-panel">
                            <div class="cs-panel-header">Media Cue Injection</div>
                            <div class="cs-panel-body">
                                <div class="cs-inject-group">
                                    <label>Audio</label>
                                    <div class="cs-inject-row">
                                        <input type="text" class="cs-input" id="cs-inject-audio-src" placeholder="asset-id or URL">
                                        <select class="cs-input cs-input-sm" id="cs-inject-audio-group">
                                            <option value="ui">UI</option>
                                            <option value="music">Music</option>
                                            <option value="ambience">Ambience</option>
                                            <option value="voice">Voice</option>
                                            <option value="diegetic">Diegetic</option>
                                            <option value="stinger">Stinger</option>
                                        </select>
                                        <button class="cs-btn-sm" data-action="inject-audio-play">Play</button>
                                        <button class="cs-btn-sm" data-action="inject-audio-stop">Stop All</button>
                                    </div>
                                </div>
                                <div class="cs-inject-group">
                                    <label>FX</label>
                                    <div class="cs-inject-row">
                                        <select class="cs-input" id="cs-inject-fx-preset">
                                            <option value="">— select effect —</option>
                                            <option value="screen-shake">Screen Shake</option>
                                            <option value="static-burst">Static Burst</option>
                                            <option value="color-invert">Color Invert</option>
                                            <option value="vhs-glitch">VHS Glitch</option>
                                            <option value="scanline-flicker">Scanline Flicker</option>
                                        </select>
                                        <button class="cs-btn-sm" data-action="inject-fx-apply">Apply</button>
                                        <button class="cs-btn-sm" data-action="inject-fx-clear">Clear All</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Event Log Tab -->
                <div class="cs-tab-content" data-content="log">
                    <div class="cs-log">
                        <div class="cs-log-filters">
                            <label><input type="checkbox" class="cs-log-filter" data-filter="story" checked> Story</label>
                            <label><input type="checkbox" class="cs-log-filter" data-filter="media" checked> Media</label>
                            <label><input type="checkbox" class="cs-log-filter" data-filter="campaign" checked> Campaign</label>
                            <label><input type="checkbox" class="cs-log-filter" data-filter="other"> Other</label>
                        </div>
                        <div class="cs-log-entries" id="cs-log-entries">
                            <div class="cs-empty-state">Listening for events...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    onMount() {
        this._eventLog = [];
        this._snapshot = null;
        this._logFilters = { story: true, media: true, campaign: true, other: false };

        this._setupTabs();
        this._setupToolbar();
        this._setupInjectActions();
        this._setupInspectorNav();
        this._setupLogFilters();
        this._setupDiagnosticsActions();
        this._setupMediaActions();
        this._subscribeToEvents();
        this._refreshOverview();

        // Register scriptable commands
        this.registerCommand('refresh', () => {
            this._refreshOverview();
            return { refreshed: true };
        });
        this.registerCommand('snapshot', () => {
            this._takeSnapshot();
            return { snapshot: true };
        });
        this.registerCommand('restore', () => {
            this._restoreSnapshot();
            return { restored: !!this._snapshot };
        });
        this.registerQuery('state', () => {
            return NarrativeStateManager.getSnapshot();
        });
    }

    onClose() {
        this._eventLog = [];
        this._snapshot = null;
    }

    // ==========================================
    // TAB NAVIGATION
    // ==========================================

    _setupTabs() {
        const tabs = this.getElements('.cs-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', (e) => {
                const target = e.currentTarget.dataset.tab;
                tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const contents = this.getElements('.cs-tab-content');
                contents.forEach(c => {
                    c.classList.toggle('active', c.dataset.content === target);
                });

                if (target === 'overview') this._refreshOverview();
                if (target === 'media') this._refreshMedia();
                if (target === 'log') this._renderLog();
            });
        });
    }

    // ==========================================
    // TOOLBAR
    // ==========================================

    _setupToolbar() {
        const btns = this.getElements('.cs-toolbar-btn');
        btns.forEach(btn => {
            this.addHandler(btn, 'click', (e) => {
                const action = e.currentTarget.dataset.action;
                switch (action) {
                    case 'import': this._importCampaign(); break;
                    case 'validate': this._validateCampaign(); break;
                    case 'refresh': this._refreshOverview(); break;
                    case 'snapshot': this._takeSnapshot(); break;
                    case 'restore': this._restoreSnapshot(); break;
                    case 'clear-log': this._clearLog(); break;
                }
            });
        });
    }

    // ==========================================
    // CAMPAIGN IMPORT
    // ==========================================

    async _importCampaign() {
        const jsonStr = await this.prompt(
            'Paste campaign package JSON (campaign.json manifest):',
            '',
            'Import Campaign Package'
        );
        if (!jsonStr) return;

        try {
            const packageData = JSON.parse(jsonStr);
            EventBus.emit('command:campaign:install', {
                packageData,
                requestId: `cs-import-${Date.now()}`
            });
            this._addLogEntry('campaign', 'Campaign import requested', packageData.manifest || {});
            this._refreshOverview();
        } catch (err) {
            this.alert(`Invalid JSON: ${err.message}`);
        }
    }

    // ==========================================
    // VALIDATION
    // ==========================================

    _validateCampaign() {
        const campaignId = NarrativeStateManager.getCurrentCampaign();
        if (!campaignId) {
            this.alert('No active campaign to validate.');
            return;
        }

        // Request validation through CampaignManager
        EventBus.emit('query:campaign:get', {
            campaignId,
            requestId: `cs-validate-${Date.now()}`
        });

        this._addLogEntry('campaign', `Validation requested for "${campaignId}"`, {});
    }

    // ==========================================
    // DIAGNOSTICS
    // ==========================================

    _setupDiagnosticsActions() {
        const runBtn = this.getElement('[data-action="run-diagnostics"]');
        if (runBtn) {
            this.addHandler(runBtn, 'click', () => this._runDiagnostics());
        }

        const validateBtn = this.getElement('[data-action="validate-script"]');
        if (validateBtn) {
            this.addHandler(validateBtn, 'click', () => this._validateScript());
        }
    }

    _runDiagnostics() {
        const output = this.getElement('#cs-diagnostics-output');
        if (!output) return;

        const results = [];
        const state = NarrativeStateManager.getSnapshot();

        // Campaign status
        if (state.currentCampaign) {
            results.push({ level: 'info', msg: `Active campaign: ${state.currentCampaign}` });
        } else {
            results.push({ level: 'warn', msg: 'No active campaign' });
        }

        // Scene status
        if (state.currentScene) {
            results.push({ level: 'info', msg: `Current scene: ${state.currentScene}` });
        }

        const sceneCount = Object.keys(state.scenes).length;
        const completedScenes = Object.values(state.scenes).filter(s => s.status === 'completed').length;
        const blockedScenes = Object.values(state.scenes).filter(s => s.status === 'blocked').length;
        results.push({ level: 'info', msg: `Scenes: ${sceneCount} total, ${completedScenes} completed, ${blockedScenes} blocked` });

        // Objective status
        const objectives = state.objectives || {};
        const activeObj = Object.values(objectives).filter(o => o.status === 'active').length;
        const completedObj = Object.values(objectives).filter(o => o.status === 'completed').length;
        const failedObj = Object.values(objectives).filter(o => o.status === 'failed').length;
        results.push({ level: 'info', msg: `Objectives: ${activeObj} active, ${completedObj} completed, ${failedObj} failed` });

        // Flag count
        const flagCount = Object.keys(state.flags || {}).length;
        results.push({ level: 'info', msg: `Flags set: ${flagCount}` });

        // Clue count
        const clueCount = Object.keys(state.clues || {}).length;
        results.push({ level: 'info', msg: `Clues discovered: ${clueCount}` });

        // Media diagnostics
        const mediaSnapshot = MediaAssetManager.getSnapshot();
        results.push({ level: 'info', msg: `Media manifests: ${mediaSnapshot.manifests.length}` });
        results.push({ level: 'info', msg: `Preloaded assets: ${mediaSnapshot.preloadedCount}` });

        const budgetState = mediaSnapshot.budgetState;
        if (budgetState.audio.current > 0 || budgetState.video.current > 0) {
            results.push({ level: 'info', msg: `Active audio: ${budgetState.audio.current}/${budgetState.audio.limit}, video: ${budgetState.video.current}/${budgetState.video.limit}` });
        }

        // Budget warnings
        if (budgetState.audio.current >= budgetState.audio.limit) {
            results.push({ level: 'error', msg: 'Audio budget exhausted — no more audio cues can start' });
        }
        if (budgetState.video.current >= budgetState.video.limit) {
            results.push({ level: 'error', msg: 'Video budget exhausted — no more video cues can start' });
        }

        // Cue graph diagnostics
        const activeGraphs = MediaCueGraph.listActive();
        if (activeGraphs.length > 0) {
            results.push({ level: 'info', msg: `Active cue graphs: ${activeGraphs.join(', ')}` });
        }

        // Check for potential issues
        if (blockedScenes > 0 && activeObj === 0) {
            results.push({ level: 'warn', msg: 'Blocked scenes exist but no active objectives — player may be stuck' });
        }

        if (state.currentCampaign && !state.currentScene) {
            results.push({ level: 'warn', msg: 'Campaign is active but no scene has been entered' });
        }

        // Render results
        output.innerHTML = results.map(r => {
            const icon = r.level === 'error' ? '❌' : r.level === 'warn' ? '⚠️' : '✅';
            return `<div class="cs-diag-item cs-diag-${r.level}">${icon} ${this._escapeHtml(r.msg)}</div>`;
        }).join('');
    }

    _validateScript() {
        const textarea = this.getElement('#cs-script-validate');
        const resultDiv = this.getElement('#cs-script-result');
        if (!textarea || !resultDiv) return;

        const source = textarea.value.trim();
        if (!source) {
            resultDiv.innerHTML = '<span class="cs-diag-warn">⚠️ No script to validate</span>';
            return;
        }

        try {
            const ScriptEngine = window.__RETROS_DEBUG?.scriptEngine;
            if (ScriptEngine && typeof ScriptEngine.parse === 'function') {
                const result = ScriptEngine.parse(source);
                if (result.success) {
                    resultDiv.innerHTML = '<span class="cs-diag-info">✅ Script syntax is valid</span>';
                } else {
                    const errMsg = result.error?.message || 'Unknown parse error';
                    resultDiv.innerHTML = `<span class="cs-diag-error">❌ ${this._escapeHtml(errMsg)}</span>`;
                }
            } else {
                resultDiv.innerHTML = '<span class="cs-diag-warn">⚠️ ScriptEngine not available for validation</span>';
            }
        } catch (err) {
            resultDiv.innerHTML = `<span class="cs-diag-error">❌ ${this._escapeHtml(err.message)}</span>`;
        }
    }

    // ==========================================
    // INSPECTOR
    // ==========================================

    _setupInspectorNav() {
        const navItems = this.getElements('.cs-inspector-nav-item');
        navItems.forEach(item => {
            this.addHandler(item, 'click', (e) => {
                navItems.forEach(n => n.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this._renderInspector(e.currentTarget.dataset.inspect);
            });
        });
        // Default view
        this._renderInspector('scenes');
    }

    _renderInspector(category) {
        const detail = this.getElement('#cs-inspector-detail');
        if (!detail) return;

        const state = NarrativeStateManager.getSnapshot();

        switch (category) {
            case 'scenes':
                detail.innerHTML = this._renderScenesInspector(state);
                break;
            case 'objectives':
                detail.innerHTML = this._renderObjectivesInspector(state);
                break;
            case 'flags':
                detail.innerHTML = this._renderFlagsInspector(state);
                break;
            case 'clues':
                detail.innerHTML = this._renderCluesInspector(state);
                break;
            case 'npcs':
                detail.innerHTML = this._renderNpcsInspector(state);
                break;
            case 'bindings':
                detail.innerHTML = this._renderBindingsInspector();
                break;
            default:
                detail.innerHTML = '<div class="cs-empty-state">Unknown category</div>';
        }
    }

    _renderScenesInspector(state) {
        const scenes = state.scenes || {};
        const entries = Object.entries(scenes);
        if (entries.length === 0) {
            return '<div class="cs-empty-state">No scenes visited yet.</div>';
        }

        const currentScene = state.currentScene;
        return `<table class="cs-table">
            <thead><tr><th>Scene ID</th><th>Status</th><th>Entered</th><th>Completed</th></tr></thead>
            <tbody>${entries.map(([id, scene]) => {
                const isCurrent = id === currentScene;
                const statusClass = scene.status === 'completed' ? 'cs-status-ok' :
                    scene.status === 'blocked' ? 'cs-status-error' : 'cs-status-active';
                return `<tr class="${isCurrent ? 'cs-row-highlight' : ''}">
                    <td>${this._escapeHtml(id)}${isCurrent ? ' ◀' : ''}</td>
                    <td><span class="${statusClass}">${scene.status}</span></td>
                    <td>${scene.enteredAt ? new Date(scene.enteredAt).toLocaleTimeString() : '—'}</td>
                    <td>${scene.completedAt ? new Date(scene.completedAt).toLocaleTimeString() : '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    _renderObjectivesInspector(state) {
        const objectives = state.objectives || {};
        const entries = Object.entries(objectives);
        if (entries.length === 0) {
            return '<div class="cs-empty-state">No objectives tracked.</div>';
        }

        return `<table class="cs-table">
            <thead><tr><th>ID</th><th>Description</th><th>Status</th><th>Added</th></tr></thead>
            <tbody>${entries.map(([id, obj]) => {
                const statusClass = obj.status === 'completed' ? 'cs-status-ok' :
                    obj.status === 'failed' ? 'cs-status-error' : 'cs-status-active';
                return `<tr>
                    <td>${this._escapeHtml(id)}</td>
                    <td>${this._escapeHtml(obj.text || '')}</td>
                    <td><span class="${statusClass}">${obj.status}</span></td>
                    <td>${obj.addedAt ? new Date(obj.addedAt).toLocaleTimeString() : '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    _renderFlagsInspector(state) {
        const flags = state.flags || {};
        const entries = Object.entries(flags);
        if (entries.length === 0) {
            return '<div class="cs-empty-state">No flags set.</div>';
        }

        return `<table class="cs-table">
            <thead><tr><th>Key</th><th>Value</th><th>Type</th></tr></thead>
            <tbody>${entries.map(([key, value]) => {
                const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                return `<tr>
                    <td>${this._escapeHtml(key)}</td>
                    <td class="cs-mono">${this._escapeHtml(displayValue)}</td>
                    <td>${typeof value}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    _renderCluesInspector(state) {
        const clues = state.clues || {};
        const entries = Object.entries(clues);
        if (entries.length === 0) {
            return '<div class="cs-empty-state">No clues discovered.</div>';
        }

        return `<table class="cs-table">
            <thead><tr><th>Clue ID</th><th>Tags</th><th>Discovered</th></tr></thead>
            <tbody>${entries.map(([id, clue]) => {
                return `<tr>
                    <td>${this._escapeHtml(id)}</td>
                    <td>${(clue.tags || []).map(t => `<span class="cs-tag">${this._escapeHtml(t)}</span>`).join(' ')}</td>
                    <td>${clue.discoveredAt ? new Date(clue.discoveredAt).toLocaleTimeString() : '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
    }

    _renderNpcsInspector(state) {
        const npcs = state.npcs || {};
        const entries = Object.entries(npcs);
        if (entries.length === 0) {
            return '<div class="cs-empty-state">No NPC state recorded.</div>';
        }

        return entries.map(([npcId, npcState]) => {
            const stateEntries = Object.entries(npcState);
            return `<div class="cs-npc-card">
                <div class="cs-npc-name">${this._escapeHtml(npcId)}</div>
                <table class="cs-table">
                    <thead><tr><th>Key</th><th>Value</th></tr></thead>
                    <tbody>${stateEntries.map(([key, value]) => `<tr>
                        <td>${this._escapeHtml(key)}</td>
                        <td class="cs-mono">${this._escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>`;
        }).join('');
    }

    _renderBindingsInspector() {
        // Try to get bindings from CampaignManager via debug
        const campaignManager = window.__RETROS_DEBUG?.campaignManager;
        if (!campaignManager) {
            return '<div class="cs-empty-state">CampaignManager not available for binding inspection.</div>';
        }

        const campaignId = NarrativeStateManager.getCurrentCampaign();
        if (!campaignId) {
            return '<div class="cs-empty-state">No active campaign.</div>';
        }

        const bindings = typeof campaignManager.getCampaignBindings === 'function'
            ? campaignManager.getCampaignBindings(campaignId) : null;

        if (!bindings || Object.keys(bindings).length === 0) {
            return '<div class="cs-empty-state">No bindings registered for this campaign.</div>';
        }

        return `<pre class="cs-json-preview">${this._escapeHtml(JSON.stringify(bindings, null, 2))}</pre>`;
    }

    // ==========================================
    // EVENT INJECTION
    // ==========================================

    _setupInjectActions() {
        const actionMap = {
            'inject-scene-enter': () => {
                const id = this.getElement('#cs-inject-scene')?.value?.trim();
                if (!id) return;
                NarrativeStateManager.enterScene(id);
                this._addLogEntry('story', `Injected scene enter: ${id}`, { sceneId: id });
                this._refreshOverview();
            },
            'inject-scene-complete': () => {
                const id = this.getElement('#cs-inject-scene')?.value?.trim();
                if (!id) return;
                NarrativeStateManager.completeScene(id);
                this._addLogEntry('story', `Injected scene complete: ${id}`, { sceneId: id });
                this._refreshOverview();
            },
            'inject-obj-add': () => {
                const id = this.getElement('#cs-inject-obj-id')?.value?.trim();
                const text = this.getElement('#cs-inject-obj-text')?.value?.trim() || id;
                if (!id) return;
                NarrativeStateManager.addObjective(id, text);
                this._addLogEntry('story', `Injected objective: ${id}`, { objectiveId: id, text });
                this._refreshOverview();
            },
            'inject-obj-complete': () => {
                const id = this.getElement('#cs-inject-obj-id')?.value?.trim();
                if (!id) return;
                NarrativeStateManager.completeObjective(id);
                this._addLogEntry('story', `Completed objective: ${id}`, { objectiveId: id });
                this._refreshOverview();
            },
            'inject-flag-set': () => {
                const key = this.getElement('#cs-inject-flag-key')?.value?.trim();
                let value = this.getElement('#cs-inject-flag-value')?.value?.trim();
                if (!key) return;
                // Try to parse as JSON for booleans/numbers
                try { value = JSON.parse(value); } catch { /* keep as string */ }
                NarrativeStateManager.setFlag(key, value);
                this._addLogEntry('story', `Set flag: ${key} = ${JSON.stringify(value)}`, { key, value });
                this._refreshOverview();
            },
            'inject-mood-set': () => {
                const preset = this.getElement('#cs-inject-mood')?.value;
                if (!preset) return;
                NarrativeStateManager.setMood(preset);
                this._addLogEntry('story', `Set mood: ${preset}`, { presetId: preset });
                this._refreshOverview();
            },
            'inject-clue-add': () => {
                const id = this.getElement('#cs-inject-clue-id')?.value?.trim();
                const tagsStr = this.getElement('#cs-inject-clue-tags')?.value?.trim();
                if (!id) return;
                const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
                NarrativeStateManager.addClue(id, tags);
                this._addLogEntry('story', `Added clue: ${id}`, { clueId: id, tags });
                this._refreshOverview();
            },
            'inject-custom-event': () => {
                const eventName = this.getElement('#cs-inject-event-name')?.value?.trim();
                const payloadStr = this.getElement('#cs-inject-event-payload')?.value?.trim();
                if (!eventName) { this.alert('Event name is required.'); return; }
                let payload = {};
                if (payloadStr) {
                    try { payload = JSON.parse(payloadStr); }
                    catch { this.alert('Invalid JSON payload.'); return; }
                }
                EventBus.emit(eventName, { ...payload, timestamp: Date.now(), source: 'campaign-studio' });
                this._addLogEntry('other', `Emitted: ${eventName}`, payload);
            }
        };

        for (const [action, handler] of Object.entries(actionMap)) {
            const btn = this.getElement(`[data-action="${action}"]`);
            if (btn) {
                this.addHandler(btn, 'click', handler);
            }
        }
    }

    // ==========================================
    // MEDIA TAB
    // ==========================================

    _setupMediaActions() {
        const actions = {
            'refresh-media': () => this._refreshMedia(),
            'inject-audio-play': () => {
                const src = this.getElement('#cs-inject-audio-src')?.value?.trim();
                const group = this.getElement('#cs-inject-audio-group')?.value || 'ui';
                if (!src) return;
                EventBus.emit('media:audio:play', {
                    source: src, group, volume: 0.5, loop: false,
                    timestamp: Date.now(), injectedBy: 'campaign-studio'
                });
                this._addLogEntry('media', `Injected audio play: ${src} (${group})`, { source: src, group });
            },
            'inject-audio-stop': () => {
                MediaAssetManager.stopAllCues();
                EventBus.emit('media:audio:stop', { timestamp: Date.now(), injectedBy: 'campaign-studio' });
                this._addLogEntry('media', 'Stopped all audio cues', {});
            },
            'inject-fx-apply': () => {
                const preset = this.getElement('#cs-inject-fx-preset')?.value;
                if (!preset) return;
                EventBus.emit('media:fx:apply', {
                    presetId: preset, timestamp: Date.now(), injectedBy: 'campaign-studio'
                });
                this._addLogEntry('media', `Applied FX: ${preset}`, { presetId: preset });
            },
            'inject-fx-clear': () => {
                EventBus.emit('media:fx:clear', { timestamp: Date.now(), injectedBy: 'campaign-studio' });
                this._addLogEntry('media', 'Cleared all FX', {});
            }
        };

        for (const [action, handler] of Object.entries(actions)) {
            const btn = this.getElement(`[data-action="${action}"]`);
            if (btn) this.addHandler(btn, 'click', handler);
        }
    }

    _refreshMedia() {
        // Budget display
        const budgetEl = this.getElement('#cs-media-budget');
        if (budgetEl) {
            const snapshot = MediaAssetManager.getSnapshot();
            const bs = snapshot.budgetState;
            budgetEl.innerHTML = `
                <div class="cs-budget-grid">
                    <div class="cs-budget-item">
                        <div class="cs-budget-label">Audio</div>
                        <div class="cs-budget-bar">
                            <div class="cs-budget-fill ${bs.audio.current >= bs.audio.limit ? 'cs-budget-full' : ''}"
                                style="width: ${Math.min(100, (bs.audio.current / bs.audio.limit) * 100)}%"></div>
                        </div>
                        <div class="cs-budget-value">${bs.audio.current} / ${bs.audio.limit}</div>
                    </div>
                    <div class="cs-budget-item">
                        <div class="cs-budget-label">Video</div>
                        <div class="cs-budget-bar">
                            <div class="cs-budget-fill ${bs.video.current >= bs.video.limit ? 'cs-budget-full' : ''}"
                                style="width: ${Math.min(100, (bs.video.current / bs.video.limit) * 100)}%"></div>
                        </div>
                        <div class="cs-budget-value">${bs.video.current} / ${bs.video.limit}</div>
                    </div>
                    <div class="cs-budget-item">
                        <div class="cs-budget-label">Preloaded</div>
                        <div class="cs-budget-bar">
                            <div class="cs-budget-fill ${bs.preloaded.current >= bs.preloaded.limit ? 'cs-budget-full' : ''}"
                                style="width: ${Math.min(100, (bs.preloaded.current / bs.preloaded.limit) * 100)}%"></div>
                        </div>
                        <div class="cs-budget-value">${bs.preloaded.current} / ${bs.preloaded.limit}</div>
                    </div>
                </div>
                <div class="cs-media-meta">
                    Manifests: ${snapshot.manifests.join(', ') || 'none'} |
                    Active campaign: ${snapshot.activeCampaignId || 'none'}
                </div>
            `;
        }

        // Active cues
        const cuesEl = this.getElement('#cs-active-cues');
        if (cuesEl) {
            const activeCues = MediaAssetManager.getActiveCues();
            const cueEntries = Object.entries(activeCues);
            if (cueEntries.length === 0) {
                cuesEl.innerHTML = '<div class="cs-empty-state">No active cues.</div>';
            } else {
                cuesEl.innerHTML = `<table class="cs-table">
                    <thead><tr><th>Cue ID</th><th>Type</th><th>Asset</th><th>Group</th><th>Started</th></tr></thead>
                    <tbody>${cueEntries.map(([id, cue]) => `<tr>
                        <td>${this._escapeHtml(id)}</td>
                        <td>${cue.type || '—'}</td>
                        <td>${this._escapeHtml(cue.assetId || '—')}</td>
                        <td>${cue.group || '—'}</td>
                        <td>${cue.startedAt ? new Date(cue.startedAt).toLocaleTimeString() : '—'}</td>
                    </tr>`).join('')}</tbody>
                </table>`;
            }
        }

        // Cue graphs
        const graphsEl = this.getElement('#cs-cue-graphs');
        if (graphsEl) {
            const activeGraphs = MediaCueGraph.listActive();
            if (activeGraphs.length === 0) {
                graphsEl.innerHTML = '<div class="cs-empty-state">No cue graphs registered.</div>';
            } else {
                graphsEl.innerHTML = `<table class="cs-table">
                    <thead><tr><th>Graph ID</th><th>Current Node</th><th>Running</th></tr></thead>
                    <tbody>${activeGraphs.map(gid => {
                        const instance = MediaCueGraph.get(gid);
                        return `<tr>
                            <td>${this._escapeHtml(gid)}</td>
                            <td>${instance?.currentNodeId || '—'}</td>
                            <td>${instance?.running ? '▶' : '⏸'}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>`;
            }
        }
    }

    // ==========================================
    // EVENT LOG
    // ==========================================

    _setupLogFilters() {
        const checkboxes = this.getElements('.cs-log-filter');
        checkboxes.forEach(cb => {
            this.addHandler(cb, 'change', (e) => {
                this._logFilters[e.target.dataset.filter] = e.target.checked;
                this._renderLog();
            });
        });
    }

    _subscribeToEvents() {
        // Subscribe to story events
        const storyEvents = [
            'story:start', 'story:end',
            'story:scene:enter', 'story:scene:exit', 'story:scene:complete', 'story:scene:block',
            'story:objective:add', 'story:objective:complete', 'story:objective:fail',
            'story:flag:set', 'story:clue:add', 'story:clue:revealed',
            'story:mood:set', 'story:mood:transition'
        ];
        storyEvents.forEach(evt => {
            this.onEvent(evt, (payload) => {
                this._addLogEntry('story', evt, payload);
                this._refreshOverview();
            });
        });

        // Subscribe to media events
        const mediaEvents = [
            'media:audio:play', 'media:audio:stop', 'media:audio:duck', 'media:audio:restore',
            'media:video:play', 'media:video:stop',
            'media:fx:apply', 'media:fx:clear',
            'media:asset:preload', 'media:asset:loaded', 'media:asset:error',
            'media:cue:start', 'media:cue:end',
            'media:budget:warning', 'media:budget:exceeded'
        ];
        mediaEvents.forEach(evt => {
            this.onEvent(evt, (payload) => {
                this._addLogEntry('media', evt, payload);
            });
        });

        // Subscribe to campaign events
        const campaignEvents = [
            'story:campaign:install', 'story:campaign:uninstall',
            'story:campaign:enable', 'story:campaign:disable'
        ];
        campaignEvents.forEach(evt => {
            this.onEvent(evt, (payload) => {
                this._addLogEntry('campaign', evt, payload);
                this._refreshOverview();
            });
        });
    }

    _addLogEntry(category, msg, payload) {
        this._eventLog.push({
            timestamp: Date.now(),
            category,
            msg,
            payload: payload || {}
        });

        // Cap log size
        if (this._eventLog.length > 500) {
            this._eventLog = this._eventLog.slice(-300);
        }

        this._renderLog();
    }

    _renderLog() {
        const container = this.getElement('#cs-log-entries');
        if (!container) return;

        const filtered = this._eventLog.filter(e => this._logFilters[e.category]);
        if (filtered.length === 0) {
            container.innerHTML = '<div class="cs-empty-state">No events match current filters.</div>';
            return;
        }

        // Render most recent first
        const html = filtered.slice(-100).reverse().map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            const catClass = `cs-log-cat-${entry.category}`;
            return `<div class="cs-log-entry ${catClass}">
                <span class="cs-log-time">${time}</span>
                <span class="cs-log-cat">[${entry.category}]</span>
                <span class="cs-log-msg">${this._escapeHtml(entry.msg)}</span>
            </div>`;
        }).join('');

        container.innerHTML = html;
    }

    _clearLog() {
        this._eventLog = [];
        this._renderLog();
    }

    // ==========================================
    // SNAPSHOTS
    // ==========================================

    _takeSnapshot() {
        this._snapshot = NarrativeStateManager.getSnapshot();
        this._addLogEntry('campaign', 'State snapshot taken', {
            scenes: Object.keys(this._snapshot.scenes).length,
            objectives: Object.keys(this._snapshot.objectives).length,
            flags: Object.keys(this._snapshot.flags).length
        });
        this.alert('State snapshot saved. Use "Restore" to return to this state.');
    }

    async _restoreSnapshot() {
        if (!this._snapshot) {
            this.alert('No snapshot available. Take a snapshot first.');
            return;
        }

        const confirmed = await this.confirm(
            'Restore narrative state to the saved snapshot? This will overwrite the current state.',
            'Restore Snapshot'
        );
        if (!confirmed) return;

        NarrativeStateManager.importSnapshot(this._snapshot);
        this._addLogEntry('campaign', 'State restored from snapshot', {});
        this._refreshOverview();
    }

    // ==========================================
    // OVERVIEW REFRESH
    // ==========================================

    _refreshOverview() {
        const state = NarrativeStateManager.getSnapshot();

        // Campaign status
        const statusEl = this.getElement('#cs-campaign-status');
        if (statusEl) {
            if (state.currentCampaign) {
                statusEl.innerHTML = `
                    <div class="cs-campaign-active">
                        <strong>Campaign:</strong> ${this._escapeHtml(state.currentCampaign)}
                        <br><strong>Started:</strong> ${state._meta.createdAt ? new Date(state._meta.createdAt).toLocaleString() : '—'}
                        <br><strong>Last Modified:</strong> ${state._meta.lastModified ? new Date(state._meta.lastModified).toLocaleString() : '—'}
                    </div>
                `;
            } else {
                statusEl.innerHTML = '<div class="cs-empty-state">No active campaign.</div>';
            }
        }

        // Stats
        const sceneEl = this.getElement('#cs-current-scene');
        if (sceneEl) sceneEl.textContent = state.currentScene || '—';

        const moodEl = this.getElement('#cs-current-mood');
        if (moodEl) moodEl.textContent = state.mood?.currentPreset || '—';

        const objEl = this.getElement('#cs-objective-count');
        if (objEl) {
            const active = Object.values(state.objectives || {}).filter(o => o.status === 'active').length;
            const total = Object.keys(state.objectives || {}).length;
            objEl.textContent = total > 0 ? `${active}/${total}` : '0';
        }

        const flagEl = this.getElement('#cs-flag-count');
        if (flagEl) flagEl.textContent = Object.keys(state.flags || {}).length;

        // Campaign list
        this._refreshCampaignList();
    }

    _refreshCampaignList() {
        const listEl = this.getElement('#cs-campaign-list');
        if (!listEl) return;

        // Query campaigns through EventBus
        const requestId = `cs-list-${Date.now()}`;
        const handler = EventBus.on('query:campaign:list:response', (payload) => {
            if (payload.requestId !== requestId) return;
            handler(); // Unsubscribe

            const campaigns = payload.campaigns || [];
            if (campaigns.length === 0) {
                listEl.innerHTML = '<div class="cs-empty-state">No campaigns installed.</div>';
                return;
            }

            listEl.innerHTML = `<table class="cs-table">
                <thead><tr><th>Name</th><th>Version</th><th>Status</th><th>Installed</th></tr></thead>
                <tbody>${campaigns.map(c => {
                    const statusClass = c.status === 'enabled' ? 'cs-status-ok' :
                        c.status === 'disabled' ? 'cs-status-error' : 'cs-status-active';
                    return `<tr>
                        <td>${this._escapeHtml(c.name || c.id)}</td>
                        <td>${this._escapeHtml(c.version || '—')}</td>
                        <td><span class="${statusClass}">${c.status}</span></td>
                        <td>${c.installedAt ? new Date(c.installedAt).toLocaleDateString() : '—'}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>`;
        });

        EventBus.emit('query:campaign:list', { requestId });

        // Fallback if no response after 500ms
        setTimeout(() => {
            handler(); // Clean up listener if still active
        }, 500);
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

export default CampaignStudio;
