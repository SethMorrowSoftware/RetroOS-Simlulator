/**
 * ShowrunnerConsole - Live operations control panel for ARG campaigns
 *
 * Workstream I from the ARG Expansion Master Plan.
 * Phase 4 enhancements: RBAC, two-step confirmation, timer controls,
 * telemetry integration, and enhanced safety controls.
 *
 * Provides:
 *   - Real-time narrative state inspection
 *   - Manual event/cue injection for live-ops
 *   - Scene/objective/flag override controls
 *   - Segmented broadcast messaging (all/cohort/user)
 *   - Timeline timer pause/resume controls
 *   - Mood override with preview
 *   - One-click state snapshot and rollback
 *   - Full audit trail of operator actions
 *   - RBAC with scoped permissions (Phase 4)
 *   - Two-step confirmation for destructive actions (Phase 4)
 *   - Timer pause/resume controls (Phase 4)
 *   - Telemetry quick-view (Phase 4)
 *
 * Safety controls:
 *   - Role-based access control (admin, operator, observer)
 *   - Two-step confirmation for destructive actions
 *   - Operator action logging with timestamps
 *   - Rollback checkpoint creation before overrides
 *
 * Usage:
 *   Launch from Start Menu > System Tools > Showrunner Console
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

class ShowrunnerConsole extends AppBase {
    constructor() {
        super({
            id: 'showrunner-console',
            name: 'Showrunner Console',
            icon: '\uD83C\uDF9B',
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
        <div class="showrunner-console">
            <div class="sr-toolbar">
                <button class="sr-toolbar-btn" data-action="snapshot" title="Create State Snapshot">
                    <span class="sr-toolbar-icon">\uD83D\uDCF8</span> Snapshot
                </button>
                <button class="sr-toolbar-btn" data-action="rollback" title="Rollback to Last Snapshot">
                    <span class="sr-toolbar-icon">\u23EA</span> Rollback
                </button>
                <button class="sr-toolbar-btn sr-separator" data-action="refresh" title="Refresh State">
                    <span class="sr-toolbar-icon">\uD83D\uDD04</span> Refresh
                </button>
                <button class="sr-toolbar-btn" data-action="pause-timers" title="Pause All Timers">
                    <span class="sr-toolbar-icon">\u23F8</span> Pause
                </button>
                <button class="sr-toolbar-btn" data-action="resume-timers" title="Resume All Timers">
                    <span class="sr-toolbar-icon">\u25B6</span> Resume
                </button>
                <button class="sr-toolbar-btn sr-danger" data-action="emergency-stop" title="Emergency Stop All Cues">
                    <span class="sr-toolbar-icon">\uD83D\uDED1</span> E-Stop
                </button>
                <span class="sr-role-badge" id="sr-role-badge">ADMIN</span>
                ${MultiplayerClient.isConnected() ? '<span style="color:#0f0;font-size:10px;margin-left:8px;">● MP</span>' : ''}
                <span class="sr-status-indicator" id="sr-status">IDLE</span>
            </div>

            <div class="sr-layout">
                <div class="sr-sidebar">
                    <div class="sr-nav">
                        <button class="sr-nav-btn active" data-panel="state">State</button>
                        <button class="sr-nav-btn" data-panel="inject">Inject</button>
                        <button class="sr-nav-btn" data-panel="broadcast">Broadcast</button>
                        <button class="sr-nav-btn" data-panel="override">Override</button>
                        <button class="sr-nav-btn" data-panel="timers">Timers</button>
                        <button class="sr-nav-btn" data-panel="mood">Mood</button>
                        <button class="sr-nav-btn" data-panel="telemetry">Telemetry</button>
                        <button class="sr-nav-btn" data-panel="audit">Audit Log</button>
                    </div>
                    <div class="sr-role-selector">
                        <label>Role:</label>
                        <select id="sr-role-select" class="sr-select">
                            <option value="admin">Admin</option>
                            <option value="operator">Operator</option>
                            <option value="observer">Observer</option>
                        </select>
                    </div>
                </div>

                <div class="sr-main">
                    <!-- State Inspection Panel -->
                    <div class="sr-panel active" data-panel="state">
                        <h3>Narrative State</h3>
                        <div class="sr-state-grid">
                            <div class="sr-state-card">
                                <div class="sr-card-label">Campaign</div>
                                <div class="sr-card-value" id="sr-campaign">\u2014</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Scene</div>
                                <div class="sr-card-value" id="sr-scene">\u2014</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Mood</div>
                                <div class="sr-card-value" id="sr-mood">default</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Active Cues</div>
                                <div class="sr-card-value" id="sr-cues">0</div>
                            </div>
                        </div>
                        <h4>Objectives</h4>
                        <div class="sr-list" id="sr-objectives">
                            <div class="sr-empty">No active objectives</div>
                        </div>
                        <h4>Flags</h4>
                        <div class="sr-list sr-flags-list" id="sr-flags">
                            <div class="sr-empty">No flags set</div>
                        </div>
                        <h4>Clues</h4>
                        <div class="sr-list" id="sr-clues">
                            <div class="sr-empty">No clues discovered</div>
                        </div>
                    </div>

                    <!-- Event Injection Panel -->
                    <div class="sr-panel" data-panel="inject">
                        <h3>Event Injection</h3>
                        <div class="sr-form-group">
                            <label>Event Name</label>
                            <input type="text" id="sr-inject-event" class="sr-input"
                                   placeholder="e.g., story:scene:enter" />
                        </div>
                        <div class="sr-form-group">
                            <label>Payload (JSON)</label>
                            <textarea id="sr-inject-payload" class="sr-textarea"
                                      placeholder='{"sceneId": "act2-reveal"}'></textarea>
                        </div>
                        <button class="sr-btn sr-btn-primary" id="sr-inject-fire">
                            Fire Event
                        </button>

                        <h4>Quick Cue Triggers</h4>
                        <div class="sr-quick-grid">
                            <button class="sr-quick-btn" data-quick="audio-play">Audio Play</button>
                            <button class="sr-quick-btn" data-quick="audio-stop">Audio Stop</button>
                            <button class="sr-quick-btn" data-quick="video-play">Video Play</button>
                            <button class="sr-quick-btn" data-quick="fx-glitch">FX: Glitch</button>
                            <button class="sr-quick-btn" data-quick="fx-shake">FX: Shake</button>
                            <button class="sr-quick-btn" data-quick="subtitle-show">Subtitle</button>
                        </div>

                        <h4>Injection Log</h4>
                        <div class="sr-list sr-injection-log" id="sr-inject-log">
                            <div class="sr-empty">No events injected</div>
                        </div>
                    </div>

                    <!-- Broadcast Panel -->
                    <div class="sr-panel" data-panel="broadcast">
                        <h3>Broadcast Message</h3>
                        <div class="sr-form-group">
                            <label>Channel</label>
                            <select id="sr-broadcast-channel" class="sr-select">
                                <option value="dialog">System Dialog</option>
                                <option value="inbox">Inbox</option>
                                <option value="im">Instant Messenger</option>
                                <option value="notification">Notification</option>
                            </select>
                        </div>
                        <div class="sr-form-group">
                            <label>From (NPC/System)</label>
                            <input type="text" id="sr-broadcast-from" class="sr-input"
                                   placeholder="system@illuminatos.local" />
                        </div>
                        <div class="sr-form-group">
                            <label>Subject / Title</label>
                            <input type="text" id="sr-broadcast-subject" class="sr-input"
                                   placeholder="Important message..." />
                        </div>
                        <div class="sr-form-group">
                            <label>Message Body</label>
                            <textarea id="sr-broadcast-body" class="sr-textarea"
                                      placeholder="Enter message content..."></textarea>
                        </div>
                        <button class="sr-btn sr-btn-primary" id="sr-broadcast-send">
                            Send Broadcast
                        </button>
                    </div>

                    <!-- Override Panel -->
                    <div class="sr-panel" data-panel="override">
                        <h3>Progression Overrides</h3>
                        <p class="sr-warning">\u26A0 Overrides bypass normal narrative flow. A snapshot will be created automatically before each override. Two-step confirmation is required.</p>

                        <div class="sr-form-group">
                            <label>Force Scene Transition</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-override-scene" class="sr-input"
                                       placeholder="scene-id" />
                                <button class="sr-btn sr-btn-warn" id="sr-override-scene-btn">Force Enter</button>
                            </div>
                        </div>

                        <div class="sr-form-group">
                            <label>Set Flag</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-override-flag-key" class="sr-input"
                                       placeholder="flag name" />
                                <input type="text" id="sr-override-flag-value" class="sr-input"
                                       placeholder="value" />
                                <button class="sr-btn sr-btn-warn" id="sr-override-flag-btn">Set</button>
                            </div>
                        </div>

                        <div class="sr-form-group">
                            <label>Complete Objective</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-override-obj" class="sr-input"
                                       placeholder="objective-id" />
                                <button class="sr-btn sr-btn-warn" id="sr-override-obj-btn">Complete</button>
                            </div>
                        </div>

                        <div class="sr-form-group">
                            <label>Add Clue</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-override-clue" class="sr-input"
                                       placeholder="clue-id" />
                                <button class="sr-btn sr-btn-warn" id="sr-override-clue-btn">Add</button>
                            </div>
                        </div>
                    </div>

                    <!-- Timers Panel (Phase 4) -->
                    <div class="sr-panel" data-panel="timers">
                        <h3>Timeline Timer Controls</h3>
                        <p class="sr-description">Pause, resume, or adjust active campaign timers and scheduled cues.</p>

                        <div class="sr-timer-controls">
                            <button class="sr-btn sr-btn-primary" id="sr-timer-pause-all">\u23F8 Pause All Timers</button>
                            <button class="sr-btn sr-btn-primary" id="sr-timer-resume-all">\u25B6 Resume All Timers</button>
                        </div>

                        <h4>Active Timers</h4>
                        <div class="sr-list" id="sr-timer-list">
                            <div class="sr-empty">No active timers</div>
                        </div>

                        <h4>Scheduled Cues</h4>
                        <div class="sr-list" id="sr-cue-list">
                            <div class="sr-empty">No scheduled cues</div>
                        </div>

                        <div class="sr-form-group">
                            <label>Schedule New Cue</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-timer-event" class="sr-input"
                                       placeholder="event name" />
                                <input type="number" id="sr-timer-delay" class="sr-input"
                                       placeholder="delay (ms)" value="5000" />
                                <button class="sr-btn sr-btn-primary" id="sr-timer-schedule">Schedule</button>
                            </div>
                        </div>
                    </div>

                    <!-- Mood Panel -->
                    <div class="sr-panel" data-panel="mood">
                        <h3>Mood Override</h3>
                        <div class="sr-mood-grid" id="sr-mood-grid">
                            <!-- Populated dynamically -->
                        </div>
                        <div class="sr-form-group">
                            <label>Custom Mood Transition</label>
                            <div class="sr-inline">
                                <input type="text" id="sr-mood-preset" class="sr-input"
                                       placeholder="preset-id" />
                                <input type="number" id="sr-mood-duration" class="sr-input"
                                       placeholder="ms" value="2000" />
                                <button class="sr-btn sr-btn-primary" id="sr-mood-apply">Apply</button>
                            </div>
                        </div>
                    </div>

                    <!-- Telemetry Panel (Phase 4) -->
                    <div class="sr-panel" data-panel="telemetry">
                        <h3>Telemetry Quick-View</h3>
                        <div class="sr-state-grid">
                            <div class="sr-state-card">
                                <div class="sr-card-label">Buffer Size</div>
                                <div class="sr-card-value" id="sr-telem-buffer">0</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Scenes Visited</div>
                                <div class="sr-card-value" id="sr-telem-scenes">0</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Objectives</div>
                                <div class="sr-card-value" id="sr-telem-objectives">0</div>
                            </div>
                            <div class="sr-state-card">
                                <div class="sr-card-label">Checkpoints</div>
                                <div class="sr-card-value" id="sr-telem-checkpoints">0</div>
                            </div>
                        </div>

                        <h4>Scene Funnel (last 10)</h4>
                        <div class="sr-list" id="sr-telem-funnel">
                            <div class="sr-empty">No scene data</div>
                        </div>

                        <h4>Recent Telemetry Events</h4>
                        <div class="sr-list" id="sr-telem-events">
                            <div class="sr-empty">No telemetry data</div>
                        </div>

                        <div class="sr-telemetry-actions">
                            <button class="sr-btn sr-btn-small" id="sr-telem-open-dashboard">Open Full Dashboard</button>
                            <button class="sr-btn sr-btn-small" id="sr-telem-export">Export Snapshot</button>
                        </div>
                    </div>

                    <!-- Audit Log Panel -->
                    <div class="sr-panel" data-panel="audit">
                        <h3>Operator Audit Log</h3>
                        <div class="sr-audit-controls">
                            <button class="sr-btn sr-btn-small" id="sr-audit-clear">Clear Log</button>
                            <button class="sr-btn sr-btn-small" id="sr-audit-export">Export JSON</button>
                        </div>
                        <div class="sr-list sr-audit-log" id="sr-audit-log">
                            <div class="sr-empty">No operator actions logged</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Two-Step Confirmation Dialog -->
            <div class="sr-confirm-overlay" id="sr-confirm-overlay" style="display:none">
                <div class="sr-confirm-dialog">
                    <div class="sr-confirm-title">\u26A0 Confirm Destructive Action</div>
                    <div class="sr-confirm-message" id="sr-confirm-message"></div>
                    <div class="sr-confirm-buttons">
                        <button class="sr-btn sr-btn-warn" id="sr-confirm-yes">Confirm</button>
                        <button class="sr-btn" id="sr-confirm-no">Cancel</button>
                    </div>
                </div>
            </div>
        </div>`;
    }

    onMount() {
        this._auditLog = [];
        this._snapshots = [];
        this._injectionLog = [];
        this._role = 'admin';
        this._pendingConfirm = null;
        this._timersPaused = false;
        this._scheduledTimers = [];

        this._bindToolbar();
        this._bindNavigation();
        this._bindRoleSelector();
        this._bindInjection();
        this._bindBroadcast();
        this._bindOverrides();
        this._bindTimers();
        this._bindMood();
        this._bindTelemetry();
        this._bindAudit();
        this._bindConfirmDialog();
        this._refreshState();

        // Auto-refresh state every 3 seconds
        this._refreshInterval = setInterval(() => {
            this._refreshState();
            this._refreshTelemetry();
        }, 3000);

        // Listen for narrative events to update state display
        this.onEvent('story:scene:enter', () => this._refreshState());
        this.onEvent('story:campaign:enable', () => this._refreshState());
        this.onEvent('story:mood:set', () => this._refreshState());
        this.onEvent('story:objective:add', () => this._refreshState());
        this.onEvent('story:objective:complete', () => this._refreshState());
        this.onEvent('story:flag:set', () => this._refreshState());
        this.onEvent('story:clue:add', () => this._refreshState());

        // Register scripting commands
        this.registerCommand('getAuditLog', () => [...this._auditLog]);
        this.registerCommand('setRole', (role) => this._setRole(role));
        this.registerCommand('pauseTimers', () => this._pauseAllTimers());
        this.registerCommand('resumeTimers', () => this._resumeAllTimers());
        this.registerQuery('auditLog', () => [...this._auditLog]);
        this.registerQuery('role', () => this._role);
        this.registerQuery('snapshots', () => this._snapshots.map(s => ({
            id: s.id,
            timestamp: s.timestamp,
            description: s.description
        })));
    }

    onClose() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }
        // Clear scheduled timers
        for (const timer of this._scheduledTimers) {
            if (timer.handle) clearTimeout(timer.handle);
        }
        this._scheduledTimers = [];
    }

    // ==========================================
    // RBAC (Phase 4)
    // ==========================================

    /**
     * Role permissions matrix:
     *   admin:    all actions
     *   operator: inject, broadcast, mood, timers, snapshots (no overrides)
     *   observer: read-only state and telemetry (no actions)
     */
    _hasPermission(action) {
        const permissions = {
            admin: ['state', 'inject', 'broadcast', 'override', 'mood', 'timers', 'telemetry', 'snapshot', 'rollback', 'emergency-stop'],
            operator: ['state', 'inject', 'broadcast', 'mood', 'timers', 'telemetry', 'snapshot'],
            observer: ['state', 'telemetry']
        };

        const allowed = permissions[this._role] || [];
        return allowed.includes(action);
    }

    _checkPermission(action) {
        if (!this._hasPermission(action)) {
            this.alert(`Permission denied: "${action}" requires a higher role (current: ${this._role})`);
            this._logAudit('permission-denied', `Denied: ${action} (role: ${this._role})`);
            return false;
        }
        return true;
    }

    _setRole(role) {
        if (!['admin', 'operator', 'observer'].includes(role)) return;
        this._role = role;
        const badge = this.getElement('#sr-role-badge');
        if (badge) {
            badge.textContent = role.toUpperCase();
            badge.className = `sr-role-badge sr-role-${role}`;
        }
        this._logAudit('role-change', `Role changed to: ${role}`);
    }

    _bindRoleSelector() {
        const select = this.getElement('#sr-role-select');
        if (select) {
            this.addHandler(select, 'change', () => {
                this._setRole(select.value);
            });
        }
    }

    // ==========================================
    // TWO-STEP CONFIRMATION (Phase 4)
    // ==========================================

    _requestConfirm(message, callback) {
        this._pendingConfirm = callback;
        const overlay = this.getElement('#sr-confirm-overlay');
        const msgEl = this.getElement('#sr-confirm-message');
        if (overlay) overlay.style.display = 'flex';
        if (msgEl) msgEl.textContent = message;
    }

    _bindConfirmDialog() {
        const yesBtn = this.getElement('#sr-confirm-yes');
        const noBtn = this.getElement('#sr-confirm-no');
        const overlay = this.getElement('#sr-confirm-overlay');

        if (yesBtn) {
            this.addHandler(yesBtn, 'click', () => {
                if (overlay) overlay.style.display = 'none';
                if (this._pendingConfirm) {
                    this._pendingConfirm();
                    this._pendingConfirm = null;
                }
            });
        }

        if (noBtn) {
            this.addHandler(noBtn, 'click', () => {
                if (overlay) overlay.style.display = 'none';
                this._pendingConfirm = null;
                this._logAudit('confirm-cancelled', 'User cancelled destructive action');
            });
        }
    }

    // ==========================================
    // TOOLBAR
    // ==========================================

    _bindToolbar() {
        const toolbar = this.getElement('.sr-toolbar');
        if (!toolbar) return;

        this.addHandler(toolbar, 'click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            switch (action) {
                case 'snapshot':
                    if (!this._checkPermission('snapshot')) return;
                    this._createSnapshot('Manual snapshot');
                    break;
                case 'rollback':
                    if (!this._checkPermission('rollback')) return;
                    this._requestConfirm('Are you sure you want to rollback to the last snapshot? This will revert all narrative state changes.', () => this._rollback());
                    break;
                case 'refresh':
                    this._refreshState();
                    break;
                case 'pause-timers':
                    if (!this._checkPermission('timers')) return;
                    this._pauseAllTimers();
                    break;
                case 'resume-timers':
                    if (!this._checkPermission('timers')) return;
                    this._resumeAllTimers();
                    break;
                case 'emergency-stop':
                    if (!this._checkPermission('emergency-stop')) return;
                    this._requestConfirm('EMERGENCY STOP will halt all media cues and timers. Continue?', () => this._emergencyStop());
                    break;
            }
        });
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    _bindNavigation() {
        const nav = this.getElement('.sr-nav');
        if (!nav) return;

        this.addHandler(nav, 'click', (e) => {
            const btn = e.target.closest('[data-panel]');
            if (!btn) return;

            const panelId = btn.dataset.panel;

            this.getElements('.sr-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            this.getElements('.sr-panel').forEach(p => p.classList.remove('active'));
            const panel = this.getElement(`.sr-panel[data-panel="${panelId}"]`);
            if (panel) panel.classList.add('active');

            if (panelId === 'mood') this._refreshMoodGrid();
            if (panelId === 'telemetry') this._refreshTelemetry();
            if (panelId === 'timers') this._refreshTimerList();
        });
    }

    // ==========================================
    // STATE INSPECTION
    // ==========================================

    _refreshState() {
        const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
        if (!nsm) return;

        const snapshot = nsm.getSnapshot ? nsm.getSnapshot() : {};

        const campaignEl = this.getElement('#sr-campaign');
        if (campaignEl) campaignEl.textContent = snapshot.currentCampaign || '\u2014';

        const sceneEl = this.getElement('#sr-scene');
        if (sceneEl) sceneEl.textContent = snapshot.currentScene || '\u2014';

        const moodEl = this.getElement('#sr-mood');
        if (moodEl) moodEl.textContent = snapshot.mood?.currentPreset || 'default';

        const mam = window.__RETROS_DEBUG?.mediaAssetManager;
        const cueCount = mam?.getActiveCues ? mam.getActiveCues().length : 0;
        const cuesEl = this.getElement('#sr-cues');
        if (cuesEl) cuesEl.textContent = String(cueCount);

        // Objectives
        const objEl = this.getElement('#sr-objectives');
        if (objEl && snapshot.objectives) {
            const entries = Object.entries(snapshot.objectives);
            if (entries.length === 0) {
                objEl.innerHTML = '<div class="sr-empty">No active objectives</div>';
            } else {
                objEl.innerHTML = entries.map(([id, obj]) => `
                    <div class="sr-list-item sr-obj-${obj.status || 'active'}">
                        <span class="sr-item-id">${this._esc(id)}</span>
                        <span class="sr-item-text">${this._esc(obj.text || '')}</span>
                        <span class="sr-item-status">${obj.status || 'active'}</span>
                    </div>
                `).join('');
            }
        }

        // Flags
        const flagsEl = this.getElement('#sr-flags');
        if (flagsEl && snapshot.flags) {
            const entries = Object.entries(snapshot.flags);
            if (entries.length === 0) {
                flagsEl.innerHTML = '<div class="sr-empty">No flags set</div>';
            } else {
                flagsEl.innerHTML = entries.map(([key, value]) => `
                    <div class="sr-list-item">
                        <span class="sr-item-id">${this._esc(key)}</span>
                        <span class="sr-item-value">${this._esc(JSON.stringify(value))}</span>
                    </div>
                `).join('');
            }
        }

        // Clues
        const cluesEl = this.getElement('#sr-clues');
        if (cluesEl && snapshot.clues) {
            const entries = Object.entries(snapshot.clues);
            if (entries.length === 0) {
                cluesEl.innerHTML = '<div class="sr-empty">No clues discovered</div>';
            } else {
                cluesEl.innerHTML = entries.map(([id, clue]) => `
                    <div class="sr-list-item">
                        <span class="sr-item-id">${this._esc(id)}</span>
                        <span class="sr-item-tags">${(clue.tags || []).join(', ')}</span>
                        <span class="sr-item-status">${clue.revealed ? 'revealed' : 'hidden'}</span>
                    </div>
                `).join('');
            }
        }
    }

    // ==========================================
    // EVENT INJECTION
    // ==========================================

    _bindInjection() {
        const fireBtn = this.getElement('#sr-inject-fire');
        if (fireBtn) {
            this.addHandler(fireBtn, 'click', () => {
                if (!this._checkPermission('inject')) return;
                this._fireEvent();
            });
        }

        const quickGrid = this.getElement('.sr-quick-grid');
        if (quickGrid) {
            this.addHandler(quickGrid, 'click', (e) => {
                const btn = e.target.closest('[data-quick]');
                if (!btn) return;
                if (!this._checkPermission('inject')) return;
                this._fireQuickCue(btn.dataset.quick);
            });
        }
    }

    _fireEvent() {
        const eventInput = this.getElement('#sr-inject-event');
        const payloadInput = this.getElement('#sr-inject-payload');
        if (!eventInput) return;

        const eventName = eventInput.value.trim();
        if (!eventName) return;

        let payload = {};
        try {
            const raw = (payloadInput?.value || '').trim();
            if (raw) payload = JSON.parse(raw);
        } catch (e) {
            this.alert('Invalid JSON payload: ' + e.message);
            return;
        }

        payload.timestamp = Date.now();
        payload._injectedBy = 'showrunner';

        EventBus.emit(eventName, payload);

        // Forward to multiplayer clients if connected
        if (MultiplayerClient.isConnected()) {
            MultiplayerClient.send({
                type: 'event',
                payload: { eventName, data: payload, channel: 'campaign', broadcast: true }
            });
        }

        this._logInjection(eventName, payload);
        this._logAudit('inject', `Fired event: ${eventName}`, payload);

        eventInput.value = '';
        if (payloadInput) payloadInput.value = '';
    }

    _fireQuickCue(type) {
        const quickCues = {
            'audio-play': { event: 'media:audio:play', payload: { cueId: 'quick-test', group: 'ui' } },
            'audio-stop': { event: 'media:audio:stop', payload: {} },
            'video-play': { event: 'media:video:play', payload: { assetId: 'quick-test' } },
            'fx-glitch': { event: 'media:fx:apply', payload: { presetId: 'glitch', durationMs: 2000 } },
            'fx-shake': { event: 'media:fx:apply', payload: { presetId: 'screen-shake', durationMs: 1000 } },
            'subtitle-show': { event: 'media:subtitle:show', payload: { trackId: 'quick', text: 'Test subtitle...', durationMs: 3000 } }
        };

        const cue = quickCues[type];
        if (!cue) return;

        cue.payload.timestamp = Date.now();
        cue.payload._injectedBy = 'showrunner';

        EventBus.emit(cue.event, cue.payload);
        this._logInjection(cue.event, cue.payload);
        this._logAudit('quick-cue', `Quick cue: ${type}`, cue.payload);
    }

    _logInjection(eventName, payload) {
        this._injectionLog.unshift({
            event: eventName,
            payload,
            timestamp: Date.now()
        });

        if (this._injectionLog.length > 50) this._injectionLog.pop();

        const logEl = this.getElement('#sr-inject-log');
        if (logEl) {
            logEl.innerHTML = this._injectionLog.map(entry => `
                <div class="sr-list-item sr-log-entry">
                    <span class="sr-log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span class="sr-log-event">${this._esc(entry.event)}</span>
                </div>
            `).join('');
        }
    }

    // ==========================================
    // BROADCAST
    // ==========================================

    _bindBroadcast() {
        const sendBtn = this.getElement('#sr-broadcast-send');
        if (sendBtn) {
            this.addHandler(sendBtn, 'click', () => {
                if (!this._checkPermission('broadcast')) return;
                this._sendBroadcast();
            });
        }
    }

    _sendBroadcast() {
        const channel = this.getElement('#sr-broadcast-channel')?.value || 'dialog';
        const from = this.getElement('#sr-broadcast-from')?.value || 'System';
        const subject = this.getElement('#sr-broadcast-subject')?.value || '';
        const body = this.getElement('#sr-broadcast-body')?.value || '';

        if (!body.trim()) {
            this.alert('Message body is required');
            return;
        }

        switch (channel) {
            case 'dialog':
                EventBus.emit('dialog:alert', {
                    title: subject || 'Broadcast',
                    message: body
                });
                break;
            case 'inbox':
                EventBus.emit('command:inbox:receive', {
                    from,
                    subject: subject || 'Broadcast',
                    body,
                    timestamp: Date.now()
                });
                break;
            case 'im':
                EventBus.emit('command:instant-messenger:receive', {
                    from,
                    message: body,
                    timestamp: Date.now()
                });
                break;
            case 'notification':
                EventBus.emit('notification:show', {
                    title: subject || 'Notice',
                    message: body,
                    duration: 8000
                });
                break;
        }

        // Forward broadcast to multiplayer clients if connected
        if (MultiplayerClient.isConnected()) {
            MultiplayerClient.send({
                type: 'event',
                payload: {
                    eventName: 'showrunner:broadcast',
                    data: { channel, from, subject, body },
                    broadcast: true
                }
            });
        }

        this._logAudit('broadcast', `Broadcast via ${channel}: ${subject || '(no subject)'}`, { channel, from, subject, body });

        const bodyEl = this.getElement('#sr-broadcast-body');
        if (bodyEl) bodyEl.value = '';
        const subjectEl = this.getElement('#sr-broadcast-subject');
        if (subjectEl) subjectEl.value = '';
    }

    // ==========================================
    // OVERRIDES (with two-step confirmation)
    // ==========================================

    _bindOverrides() {
        const sceneBtn = this.getElement('#sr-override-scene-btn');
        if (sceneBtn) {
            this.addHandler(sceneBtn, 'click', () => {
                if (!this._checkPermission('override')) return;
                const sceneId = this.getElement('#sr-override-scene')?.value?.trim();
                if (!sceneId) return;
                this._requestConfirm(`Force scene transition to "${sceneId}"? This bypasses normal narrative flow.`, () => {
                    this._createSnapshot('Pre-override: force scene');
                    EventBus.emit('story:scene:enter', { sceneId, _overrideBy: 'showrunner', timestamp: Date.now() });
                    const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
                    if (nsm?.enterScene) nsm.enterScene(sceneId);
                    this._logAudit('override', `Force scene: ${sceneId}`);
                    this._refreshState();
                });
            });
        }

        const flagBtn = this.getElement('#sr-override-flag-btn');
        if (flagBtn) {
            this.addHandler(flagBtn, 'click', () => {
                if (!this._checkPermission('override')) return;
                const key = this.getElement('#sr-override-flag-key')?.value?.trim();
                const rawValue = this.getElement('#sr-override-flag-value')?.value?.trim();
                if (!key) return;
                this._requestConfirm(`Set flag "${key}" = ${rawValue}?`, () => {
                    this._createSnapshot('Pre-override: set flag');
                    let value = rawValue;
                    try { value = JSON.parse(rawValue); } catch (_) { /* use as string */ }
                    const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
                    if (nsm?.setFlag) nsm.setFlag(key, value);
                    this._logAudit('override', `Set flag: ${key} = ${JSON.stringify(value)}`);
                    this._refreshState();
                });
            });
        }

        const objBtn = this.getElement('#sr-override-obj-btn');
        if (objBtn) {
            this.addHandler(objBtn, 'click', () => {
                if (!this._checkPermission('override')) return;
                const objId = this.getElement('#sr-override-obj')?.value?.trim();
                if (!objId) return;
                this._requestConfirm(`Force-complete objective "${objId}"?`, () => {
                    this._createSnapshot('Pre-override: complete objective');
                    const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
                    if (nsm?.completeObjective) nsm.completeObjective(objId);
                    this._logAudit('override', `Complete objective: ${objId}`);
                    this._refreshState();
                });
            });
        }

        const clueBtn = this.getElement('#sr-override-clue-btn');
        if (clueBtn) {
            this.addHandler(clueBtn, 'click', () => {
                if (!this._checkPermission('override')) return;
                const clueId = this.getElement('#sr-override-clue')?.value?.trim();
                if (!clueId) return;
                this._requestConfirm(`Add clue "${clueId}" via override?`, () => {
                    this._createSnapshot('Pre-override: add clue');
                    const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
                    if (nsm?.addClue) nsm.addClue(clueId);
                    this._logAudit('override', `Add clue: ${clueId}`);
                    this._refreshState();
                });
            });
        }
    }

    // ==========================================
    // TIMER CONTROLS (Phase 4)
    // ==========================================

    _bindTimers() {
        const pauseAllBtn = this.getElement('#sr-timer-pause-all');
        if (pauseAllBtn) {
            this.addHandler(pauseAllBtn, 'click', () => {
                if (!this._checkPermission('timers')) return;
                this._pauseAllTimers();
            });
        }

        const resumeAllBtn = this.getElement('#sr-timer-resume-all');
        if (resumeAllBtn) {
            this.addHandler(resumeAllBtn, 'click', () => {
                if (!this._checkPermission('timers')) return;
                this._resumeAllTimers();
            });
        }

        const scheduleBtn = this.getElement('#sr-timer-schedule');
        if (scheduleBtn) {
            this.addHandler(scheduleBtn, 'click', () => {
                if (!this._checkPermission('timers')) return;
                this._scheduleCue();
            });
        }
    }

    _pauseAllTimers() {
        this._timersPaused = true;
        EventBus.emit('story:timers:pause', { timestamp: Date.now(), _operatorAction: true });
        this._logAudit('timers', 'Paused all timers');
        this._setStatus('TIMERS PAUSED');
        this._refreshTimerList();
    }

    _resumeAllTimers() {
        this._timersPaused = false;
        EventBus.emit('story:timers:resume', { timestamp: Date.now(), _operatorAction: true });
        this._logAudit('timers', 'Resumed all timers');
        this._setStatus('IDLE');
        this._refreshTimerList();
    }

    _scheduleCue() {
        const eventName = this.getElement('#sr-timer-event')?.value?.trim();
        const delay = parseInt(this.getElement('#sr-timer-delay')?.value) || 5000;
        if (!eventName) return;

        const timerId = `timer-${Date.now()}`;
        const handle = setTimeout(() => {
            EventBus.emit(eventName, { _scheduledBy: 'showrunner', timerId, timestamp: Date.now() });
            this._logAudit('timer-fire', `Scheduled cue fired: ${eventName}`);
            // Remove from list
            this._scheduledTimers = this._scheduledTimers.filter(t => t.id !== timerId);
            this._refreshTimerList();
        }, delay);

        this._scheduledTimers.push({
            id: timerId,
            event: eventName,
            delay,
            createdAt: Date.now(),
            handle
        });

        this._logAudit('timer-schedule', `Scheduled: ${eventName} in ${delay}ms`);
        this._refreshTimerList();
    }

    _refreshTimerList() {
        const timerList = this.getElement('#sr-timer-list');
        if (timerList) {
            if (this._scheduledTimers.length === 0) {
                timerList.innerHTML = `<div class="sr-empty">No active timers${this._timersPaused ? ' (PAUSED)' : ''}</div>`;
            } else {
                timerList.innerHTML = this._scheduledTimers.map(t => {
                    const remaining = Math.max(0, (t.createdAt + t.delay) - Date.now());
                    return `
                    <div class="sr-list-item">
                        <span class="sr-item-id">${this._esc(t.id)}</span>
                        <span class="sr-item-text">${this._esc(t.event)}</span>
                        <span class="sr-item-status">${this._timersPaused ? 'PAUSED' : this._formatMs(remaining)}</span>
                    </div>`;
                }).join('');
            }
        }

        // Update cue list with media cue graph data if available
        const cueList = this.getElement('#sr-cue-list');
        if (cueList) {
            const mcg = window.__RETROS_DEBUG?.mediaCueGraph;
            const activeInstances = mcg?.getActiveInstances ? mcg.getActiveInstances() : [];
            if (activeInstances.length === 0) {
                cueList.innerHTML = '<div class="sr-empty">No scheduled cues</div>';
            } else {
                cueList.innerHTML = activeInstances.map(inst => `
                    <div class="sr-list-item">
                        <span class="sr-item-id">${this._esc(inst.id || 'unknown')}</span>
                        <span class="sr-item-text">${this._esc(inst.state || 'running')}</span>
                    </div>
                `).join('');
            }
        }
    }

    // ==========================================
    // MOOD CONTROLS
    // ==========================================

    _bindMood() {
        const applyBtn = this.getElement('#sr-mood-apply');
        if (applyBtn) {
            this.addHandler(applyBtn, 'click', () => {
                if (!this._checkPermission('mood')) return;
                const presetId = this.getElement('#sr-mood-preset')?.value?.trim();
                const duration = parseInt(this.getElement('#sr-mood-duration')?.value) || 2000;
                if (!presetId) return;

                const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
                if (nsm?.setMood) {
                    nsm.setMood(presetId);
                }
                this._logAudit('mood', `Applied mood: ${presetId} (${duration}ms)`);
                this._refreshState();
            });
        }

        this._refreshMoodGrid();
    }

    _refreshMoodGrid() {
        const grid = this.getElement('#sr-mood-grid');
        if (!grid) return;

        const mo = window.__RETROS_DEBUG?.moodOrchestrator;
        const presets = mo?.listPresets ? mo.listPresets() : ['default', 'calm', 'tense', 'mysterious', 'urgent', 'glitch'];

        grid.innerHTML = presets.map(id => `
            <button class="sr-mood-btn" data-mood="${this._esc(id)}">
                ${this._esc(id)}
            </button>
        `).join('');

        this.addHandler(grid, 'click', (e) => {
            const btn = e.target.closest('[data-mood]');
            if (!btn) return;
            if (!this._checkPermission('mood')) return;
            const presetId = btn.dataset.mood;
            const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
            if (nsm?.setMood) {
                nsm.setMood(presetId);
            }
            this._logAudit('mood', `Quick mood: ${presetId}`);
            this._refreshState();
        });
    }

    // ==========================================
    // TELEMETRY QUICK-VIEW (Phase 4)
    // ==========================================

    _bindTelemetry() {
        const openBtn = this.getElement('#sr-telem-open-dashboard');
        if (openBtn) {
            this.addHandler(openBtn, 'click', () => {
                EventBus.emit('command:app:launch', { appId: 'analytics-dashboard' });
                // Also try direct registry launch
                const registry = window.__RETROS_DEBUG?.appRegistry;
                if (registry?.launch) {
                    registry.launch('analytics-dashboard');
                }
            });
        }

        const exportBtn = this.getElement('#sr-telem-export');
        if (exportBtn) {
            this.addHandler(exportBtn, 'click', () => {
                const tc = window.__RETROS_DEBUG?.telemetryCollector;
                if (!tc) return;
                const snapshot = tc.exportSnapshot();
                const json = JSON.stringify(snapshot, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `telemetry-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    }

    _refreshTelemetry() {
        const tc = window.__RETROS_DEBUG?.telemetryCollector;
        if (!tc) return;

        const bufferEl = this.getElement('#sr-telem-buffer');
        if (bufferEl) bufferEl.textContent = String(tc.getBuffer().length);

        const scenesEl = this.getElement('#sr-telem-scenes');
        if (scenesEl) scenesEl.textContent = String(Object.keys(tc.getSceneDwellTimes()).length);

        const objEl = this.getElement('#sr-telem-objectives');
        if (objEl) objEl.textContent = String(Object.keys(tc.getObjectiveFunnel()).length);

        const checkEl = this.getElement('#sr-telem-checkpoints');
        if (checkEl) checkEl.textContent = String(tc.getCheckpoints().length);

        // Scene funnel (last 10)
        const funnel = tc.getSceneFunnel().slice(-10);
        const funnelEl = this.getElement('#sr-telem-funnel');
        if (funnelEl) {
            if (funnel.length === 0) {
                funnelEl.innerHTML = '<div class="sr-empty">No scene data</div>';
            } else {
                funnelEl.innerHTML = funnel.map(s => `
                    <div class="sr-list-item">
                        <span class="sr-item-id">${this._esc(s.sceneId)}</span>
                        <span class="sr-log-time">${new Date(s.timestamp).toLocaleTimeString()}</span>
                    </div>
                `).join('');
            }
        }

        // Recent events (last 10)
        const events = tc.query({ limit: 10 }).reverse();
        const eventsEl = this.getElement('#sr-telem-events');
        if (eventsEl) {
            if (events.length === 0) {
                eventsEl.innerHTML = '<div class="sr-empty">No telemetry data</div>';
            } else {
                eventsEl.innerHTML = events.map(e => `
                    <div class="sr-list-item">
                        <span class="sr-log-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
                        <span class="sr-log-event">${this._esc(e.type)}</span>
                    </div>
                `).join('');
            }
        }
    }

    // ==========================================
    // SNAPSHOTS & ROLLBACK
    // ==========================================

    _createSnapshot(description) {
        const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
        if (!nsm?.getSnapshot) {
            this.alert('NarrativeStateManager not available');
            return;
        }

        const snapshot = {
            id: `snap-${Date.now()}`,
            description,
            timestamp: Date.now(),
            data: nsm.getSnapshot()
        };

        this._snapshots.push(snapshot);
        if (this._snapshots.length > 20) this._snapshots.shift();

        this._logAudit('snapshot', `Created: ${description}`);
        this._setStatus('SNAPSHOT SAVED');
        setTimeout(() => this._setStatus(this._timersPaused ? 'TIMERS PAUSED' : 'IDLE'), 2000);
    }

    _rollback() {
        if (this._snapshots.length === 0) {
            this.alert('No snapshots available for rollback');
            return;
        }

        const snapshot = this._snapshots[this._snapshots.length - 1];
        const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
        if (!nsm?.importSnapshot) {
            this.alert('NarrativeStateManager not available');
            return;
        }

        nsm.importSnapshot(snapshot.data);
        this._logAudit('rollback', `Rolled back to: ${snapshot.description} (${new Date(snapshot.timestamp).toLocaleTimeString()})`);
        this._setStatus('ROLLED BACK');
        setTimeout(() => this._setStatus(this._timersPaused ? 'TIMERS PAUSED' : 'IDLE'), 3000);
        this._refreshState();
    }

    _emergencyStop() {
        // Stop all media cues
        EventBus.emit('media:audio:stop', { _all: true });
        EventBus.emit('media:video:stop', { _all: true });
        EventBus.emit('media:fx:clear', {});
        EventBus.emit('media:subtitle:clear', {});

        // Pause all timers
        this._pauseAllTimers();

        // Cancel all scheduled timers
        for (const timer of this._scheduledTimers) {
            if (timer.handle) clearTimeout(timer.handle);
        }
        this._scheduledTimers = [];

        this._logAudit('emergency-stop', 'All media cues stopped, all timers cancelled');
        this._setStatus('E-STOP ACTIVE');
        setTimeout(() => this._setStatus('IDLE'), 5000);
        this._refreshTimerList();
    }

    // ==========================================
    // AUDIT LOG
    // ==========================================

    _bindAudit() {
        const clearBtn = this.getElement('#sr-audit-clear');
        if (clearBtn) {
            this.addHandler(clearBtn, 'click', () => {
                this._auditLog = [];
                this._renderAuditLog();
            });
        }

        const exportBtn = this.getElement('#sr-audit-export');
        if (exportBtn) {
            this.addHandler(exportBtn, 'click', () => {
                const json = JSON.stringify(this._auditLog, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `showrunner-audit-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
    }

    _logAudit(type, description, details = null) {
        this._auditLog.unshift({
            type,
            description,
            details,
            role: this._role,
            timestamp: Date.now()
        });

        if (this._auditLog.length > 200) this._auditLog.pop();

        EventBus.emit('story:inject', {
            type,
            description,
            role: this._role,
            timestamp: Date.now()
        });

        this._renderAuditLog();
    }

    _renderAuditLog() {
        const logEl = this.getElement('#sr-audit-log');
        if (!logEl) return;

        if (this._auditLog.length === 0) {
            logEl.innerHTML = '<div class="sr-empty">No operator actions logged</div>';
            return;
        }

        logEl.innerHTML = this._auditLog.slice(0, 50).map(entry => `
            <div class="sr-list-item sr-audit-entry sr-audit-${entry.type}">
                <span class="sr-audit-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span class="sr-audit-type">${this._esc(entry.type)}</span>
                <span class="sr-audit-role">[${this._esc(entry.role || 'admin')}]</span>
                <span class="sr-audit-desc">${this._esc(entry.description)}</span>
            </div>
        `).join('');
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    _setStatus(text) {
        const el = this.getElement('#sr-status');
        if (el) el.textContent = text;
    }

    _formatMs(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const mins = Math.floor(ms / 60000);
        const secs = Math.round((ms % 60000) / 1000);
        return `${mins}m ${secs}s`;
    }

    _esc(str) {
        const div = document.createElement('div');
        div.textContent = String(str || '');
        return div.innerHTML;
    }
}

export default ShowrunnerConsole;
