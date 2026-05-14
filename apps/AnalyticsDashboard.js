/**
 * AnalyticsDashboard - Campaign telemetry visualization app
 *
 * Phase 4 (Workstream J) from the ARG Expansion Master Plan.
 * Provides visual analytics dashboards for campaign telemetry data.
 *
 * Panels:
 *   - Overview: Session summary, key metrics, active run info
 *   - Scene Funnel: Ordered scene progression with dwell times
 *   - Objectives: Objective completion funnel with status breakdown
 *   - Puzzles: Attempt counts, success rates, hint usage
 *   - Media: Engagement metrics per asset (starts, completions, skips)
 *   - Replay: Load and playback telemetry recordings
 *   - Event Log: Filtered raw event stream
 *
 * Usage:
 *   Launch from Start Menu > System Tools > Analytics Dashboard
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';

class AnalyticsDashboard extends AppBase {
    constructor() {
        super({
            id: 'analytics-dashboard',
            name: 'Analytics Dashboard',
            icon: '\uD83D\uDCCA',
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
        <div class="analytics-dashboard">
            <div class="ad-toolbar">
                <button class="ad-toolbar-btn" data-action="refresh" title="Refresh Data">
                    <span class="ad-toolbar-icon">\uD83D\uDD04</span> Refresh
                </button>
                <button class="ad-toolbar-btn" data-action="export" title="Export Snapshot">
                    <span class="ad-toolbar-icon">\uD83D\uDCBE</span> Export
                </button>
                <button class="ad-toolbar-btn" data-action="reset" title="Reset Telemetry">
                    <span class="ad-toolbar-icon">\uD83D\uDDD1</span> Reset
                </button>
                <span class="ad-session-id" id="ad-session">—</span>
            </div>

            <div class="ad-layout">
                <div class="ad-sidebar">
                    <div class="ad-nav">
                        <button class="ad-nav-btn active" data-panel="overview">Overview</button>
                        <button class="ad-nav-btn" data-panel="funnel">Scene Funnel</button>
                        <button class="ad-nav-btn" data-panel="objectives">Objectives</button>
                        <button class="ad-nav-btn" data-panel="puzzles">Puzzles</button>
                        <button class="ad-nav-btn" data-panel="media">Media</button>
                        <button class="ad-nav-btn" data-panel="replay">Replay</button>
                        <button class="ad-nav-btn" data-panel="events">Event Log</button>
                    </div>
                </div>

                <div class="ad-main">
                    <!-- Overview Panel -->
                    <div class="ad-panel active" data-panel="overview">
                        <h3>Campaign Analytics Overview</h3>
                        <div class="ad-metrics-grid" id="ad-overview-metrics">
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Session</div>
                                <div class="ad-metric-value" id="ad-metric-session">—</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Campaign Run</div>
                                <div class="ad-metric-value" id="ad-metric-run">—</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Buffer Size</div>
                                <div class="ad-metric-value" id="ad-metric-buffer">0</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Scenes Visited</div>
                                <div class="ad-metric-value" id="ad-metric-scenes">0</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Objectives</div>
                                <div class="ad-metric-value" id="ad-metric-objectives">0</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Checkpoints</div>
                                <div class="ad-metric-value" id="ad-metric-checkpoints">0</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Puzzle Attempts</div>
                                <div class="ad-metric-value" id="ad-metric-puzzles">0</div>
                            </div>
                            <div class="ad-metric-card">
                                <div class="ad-metric-label">Media Cues</div>
                                <div class="ad-metric-value" id="ad-metric-media">0</div>
                            </div>
                        </div>
                        <h4>Recent Events</h4>
                        <div class="ad-list" id="ad-recent-events">
                            <div class="ad-empty">No telemetry data yet</div>
                        </div>
                    </div>

                    <!-- Scene Funnel Panel -->
                    <div class="ad-panel" data-panel="funnel">
                        <h3>Scene Funnel</h3>
                        <p class="ad-description">Ordered scene progression with dwell times.</p>
                        <div class="ad-funnel-chart" id="ad-scene-funnel">
                            <div class="ad-empty">No scene data yet</div>
                        </div>
                        <h4>Dwell Times</h4>
                        <div class="ad-table-wrap">
                            <table class="ad-table" id="ad-dwell-table">
                                <thead>
                                    <tr>
                                        <th>Scene</th>
                                        <th>Visits</th>
                                        <th>Total Time</th>
                                        <th>Avg Time</th>
                                        <th>Bar</th>
                                    </tr>
                                </thead>
                                <tbody id="ad-dwell-body">
                                    <tr><td colspan="5" class="ad-empty">No dwell data</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Objectives Panel -->
                    <div class="ad-panel" data-panel="objectives">
                        <h3>Objective Funnel</h3>
                        <div class="ad-obj-summary" id="ad-obj-summary">
                            <span class="ad-obj-stat ad-obj-active">Active: <b id="ad-obj-active-count">0</b></span>
                            <span class="ad-obj-stat ad-obj-completed">Completed: <b id="ad-obj-completed-count">0</b></span>
                            <span class="ad-obj-stat ad-obj-failed">Failed: <b id="ad-obj-failed-count">0</b></span>
                        </div>
                        <div class="ad-table-wrap">
                            <table class="ad-table">
                                <thead>
                                    <tr>
                                        <th>Objective</th>
                                        <th>Status</th>
                                        <th>First Seen</th>
                                        <th>Completed/Failed</th>
                                        <th>Duration</th>
                                    </tr>
                                </thead>
                                <tbody id="ad-obj-body">
                                    <tr><td colspan="5" class="ad-empty">No objectives tracked</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Puzzles Panel -->
                    <div class="ad-panel" data-panel="puzzles">
                        <h3>Puzzle Analytics</h3>
                        <div class="ad-table-wrap">
                            <table class="ad-table">
                                <thead>
                                    <tr>
                                        <th>Puzzle</th>
                                        <th>Attempts</th>
                                        <th>Successes</th>
                                        <th>Success Rate</th>
                                        <th>Hints Used</th>
                                        <th>Bar</th>
                                    </tr>
                                </thead>
                                <tbody id="ad-puzzle-body">
                                    <tr><td colspan="6" class="ad-empty">No puzzle data</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Media Panel -->
                    <div class="ad-panel" data-panel="media">
                        <h3>Media Engagement</h3>
                        <div class="ad-table-wrap">
                            <table class="ad-table">
                                <thead>
                                    <tr>
                                        <th>Asset</th>
                                        <th>Type</th>
                                        <th>Started</th>
                                        <th>Completed</th>
                                        <th>Skipped</th>
                                        <th>Replayed</th>
                                        <th>Completion %</th>
                                    </tr>
                                </thead>
                                <tbody id="ad-media-body">
                                    <tr><td colspan="7" class="ad-empty">No media data</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Replay Panel -->
                    <div class="ad-panel" data-panel="replay">
                        <h3>Telemetry Replay</h3>
                        <div class="ad-replay-controls">
                            <button class="ad-btn" id="ad-replay-load">Load Current Session</button>
                            <button class="ad-btn" id="ad-replay-play">\u25B6 Play</button>
                            <button class="ad-btn" id="ad-replay-pause">\u23F8 Pause</button>
                            <button class="ad-btn" id="ad-replay-stop">\u23F9 Stop</button>
                            <button class="ad-btn" id="ad-replay-step">\u23ED Step</button>
                            <select class="ad-select" id="ad-replay-speed">
                                <option value="0.5">0.5x</option>
                                <option value="1" selected>1x</option>
                                <option value="2">2x</option>
                                <option value="4">4x</option>
                                <option value="8">8x</option>
                                <option value="16">16x</option>
                            </select>
                        </div>
                        <div class="ad-replay-progress">
                            <div class="ad-progress-bar">
                                <div class="ad-progress-fill" id="ad-replay-fill" style="width:0%"></div>
                            </div>
                            <span class="ad-progress-text" id="ad-replay-status">Idle</span>
                        </div>
                        <h4>Replay Event Stream</h4>
                        <div class="ad-list ad-replay-log" id="ad-replay-log">
                            <div class="ad-empty">No replay active</div>
                        </div>
                        <h4>Divergence Report</h4>
                        <div class="ad-list" id="ad-divergence-log">
                            <div class="ad-empty">No divergences detected</div>
                        </div>
                    </div>

                    <!-- Event Log Panel -->
                    <div class="ad-panel" data-panel="events">
                        <h3>Raw Event Log</h3>
                        <div class="ad-filter-bar">
                            <select class="ad-select" id="ad-event-filter-ns">
                                <option value="">All Namespaces</option>
                                <option value="story">story</option>
                                <option value="media">media</option>
                                <option value="app">app</option>
                                <option value="system">system</option>
                            </select>
                            <input type="text" class="ad-input" id="ad-event-filter-type"
                                   placeholder="Filter by type..." />
                            <button class="ad-btn" id="ad-event-filter-apply">Filter</button>
                        </div>
                        <div class="ad-list ad-event-log" id="ad-event-log">
                            <div class="ad-empty">No events recorded</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    onMount() {
        this._replayEvents = [];

        this._bindToolbar();
        this._bindNavigation();
        this._bindReplay();
        this._bindEventFilter();
        this._refreshAll();

        // Auto-refresh every 5 seconds
        this._refreshInterval = setInterval(() => this._refreshAll(), 5000);

        // Listen for replay progress events
        this.onEvent('replay:event', (d) => this._onReplayEvent(d));
        this.onEvent('replay:progress', (d) => this._onReplayProgress(d));
        this.onEvent('replay:end', () => this._onReplayEnd());
        this.onEvent('replay:divergence', (d) => this._onReplayDivergence(d));

        // Register scripting
        this.registerCommand('refresh', () => this._refreshAll());
        this.registerQuery('snapshot', () => this._getTelemetry()?.exportSnapshot());
        this.registerQuery('state', () => ({
            bufferSize: this._getTelemetry()?.getBuffer().length || 0,
            replayState: this._getReplay()?.getState()
        }));
    }

    onClose() {
        if (this._refreshInterval) {
            clearInterval(this._refreshInterval);
        }
    }

    // ==========================================
    // TOOLBAR
    // ==========================================

    _bindToolbar() {
        const toolbar = this.getElement('.ad-toolbar');
        if (!toolbar) return;

        this.addHandler(toolbar, 'click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            this.playSound('click');
            switch (btn.dataset.action) {
                case 'refresh':
                    this._refreshAll();
                    break;
                case 'export':
                    this._exportSnapshot();
                    break;
                case 'reset':
                    this._resetTelemetry();
                    break;
            }
        });
    }

    _exportSnapshot() {
        const tc = this._getTelemetry();
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
    }

    _resetTelemetry() {
        const tc = this._getTelemetry();
        if (!tc) return;
        tc.reset();
        this._refreshAll();
    }

    // ==========================================
    // NAVIGATION
    // ==========================================

    _bindNavigation() {
        const nav = this.getElement('.ad-nav');
        if (!nav) return;

        this.addHandler(nav, 'click', (e) => {
            const btn = e.target.closest('[data-panel]');
            if (!btn) return;

            this.getElements('.ad-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            this.getElements('.ad-panel').forEach(p => p.classList.remove('active'));
            const panel = this.getElement(`.ad-panel[data-panel="${btn.dataset.panel}"]`);
            if (panel) panel.classList.add('active');
        });
    }

    // ==========================================
    // REFRESH ALL PANELS
    // ==========================================

    _refreshAll() {
        const tc = this._getTelemetry();
        if (!tc) return;

        this._refreshOverview(tc);
        this._refreshFunnel(tc);
        this._refreshObjectives(tc);
        this._refreshPuzzles(tc);
        this._refreshMedia(tc);
        this._refreshEventLog(tc);
    }

    _refreshOverview(tc) {
        const snapshot = tc.exportSnapshot();

        this._setText('#ad-session', snapshot.sessionId || '—');
        this._setText('#ad-metric-session', this._truncate(snapshot.sessionId || '—', 18));
        this._setText('#ad-metric-run', this._truncate(snapshot.campaignRunId || 'none', 18));
        this._setText('#ad-metric-buffer', String(snapshot.bufferSize));
        this._setText('#ad-metric-scenes', String(Object.keys(snapshot.sceneDwellTimes).length));
        this._setText('#ad-metric-objectives', String(Object.keys(snapshot.objectiveFunnel).length));
        this._setText('#ad-metric-checkpoints', String(snapshot.checkpoints.length));

        const totalPuzzleAttempts = Object.values(snapshot.puzzleAttempts)
            .reduce((sum, p) => sum + p.attempts, 0);
        this._setText('#ad-metric-puzzles', String(totalPuzzleAttempts));
        this._setText('#ad-metric-media', String(Object.keys(snapshot.mediaEngagement).length));

        // Recent events
        const recent = snapshot.events.slice(-15).reverse();
        const recentEl = this.getElement('#ad-recent-events');
        if (recentEl) {
            if (recent.length === 0) {
                recentEl.innerHTML = '<div class="ad-empty">No telemetry data yet</div>';
            } else {
                recentEl.innerHTML = recent.map(e => `
                    <div class="ad-list-item">
                        <span class="ad-event-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
                        <span class="ad-event-ns">${this._esc(e.namespace)}</span>
                        <span class="ad-event-type">${this._esc(e.type)}</span>
                    </div>
                `).join('');
            }
        }
    }

    _refreshFunnel(tc) {
        const funnel = tc.getSceneFunnel();
        const dwellTimes = tc.getSceneDwellTimes();

        const funnelEl = this.getElement('#ad-scene-funnel');
        if (funnelEl) {
            if (funnel.length === 0) {
                funnelEl.innerHTML = '<div class="ad-empty">No scene data yet</div>';
            } else {
                funnelEl.innerHTML = funnel.map((step, i) => `
                    <div class="ad-funnel-step">
                        <span class="ad-funnel-index">${i + 1}</span>
                        <span class="ad-funnel-scene">${this._esc(step.sceneId)}</span>
                        <span class="ad-funnel-time">${new Date(step.timestamp).toLocaleTimeString()}</span>
                    </div>
                `).join('<div class="ad-funnel-arrow">\u2193</div>');
            }
        }

        const dwellBody = this.getElement('#ad-dwell-body');
        if (dwellBody) {
            const entries = Object.entries(dwellTimes);
            if (entries.length === 0) {
                dwellBody.innerHTML = '<tr><td colspan="5" class="ad-empty">No dwell data</td></tr>';
            } else {
                const maxMs = Math.max(...entries.map(([, d]) => d.totalMs));
                dwellBody.innerHTML = entries.map(([sceneId, data]) => {
                    const avgMs = data.visits > 0 ? Math.round(data.totalMs / data.visits) : 0;
                    const pct = maxMs > 0 ? Math.round((data.totalMs / maxMs) * 100) : 0;
                    return `<tr>
                        <td class="ad-mono">${this._esc(sceneId)}</td>
                        <td>${data.visits}</td>
                        <td>${this._formatMs(data.totalMs)}</td>
                        <td>${this._formatMs(avgMs)}</td>
                        <td><div class="ad-bar"><div class="ad-bar-fill" style="width:${pct}%"></div></div></td>
                    </tr>`;
                }).join('');
            }
        }
    }

    _refreshObjectives(tc) {
        const objectives = tc.getObjectiveFunnel();
        const entries = Object.entries(objectives);

        let active = 0, completed = 0, failed = 0;
        entries.forEach(([, o]) => {
            if (o.status === 'completed') completed++;
            else if (o.status === 'failed') failed++;
            else active++;
        });

        this._setText('#ad-obj-active-count', String(active));
        this._setText('#ad-obj-completed-count', String(completed));
        this._setText('#ad-obj-failed-count', String(failed));

        const body = this.getElement('#ad-obj-body');
        if (body) {
            if (entries.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="ad-empty">No objectives tracked</td></tr>';
            } else {
                body.innerHTML = entries.map(([id, o]) => {
                    const endTime = o.completedAt || o.failedAt;
                    const duration = endTime ? this._formatMs(endTime - o.firstSeen) : '—';
                    return `<tr class="ad-obj-row-${o.status}">
                        <td class="ad-mono">${this._esc(id)}</td>
                        <td class="ad-obj-status-${o.status}">${o.status}</td>
                        <td>${new Date(o.firstSeen).toLocaleTimeString()}</td>
                        <td>${endTime ? new Date(endTime).toLocaleTimeString() : '—'}</td>
                        <td>${duration}</td>
                    </tr>`;
                }).join('');
            }
        }
    }

    _refreshPuzzles(tc) {
        const puzzles = tc.getPuzzleAttempts();
        const entries = Object.entries(puzzles);

        const body = this.getElement('#ad-puzzle-body');
        if (body) {
            if (entries.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="ad-empty">No puzzle data</td></tr>';
            } else {
                const maxAttempts = Math.max(...entries.map(([, p]) => p.attempts));
                body.innerHTML = entries.map(([id, p]) => {
                    const rate = p.attempts > 0 ? Math.round((p.successes / p.attempts) * 100) : 0;
                    const pct = maxAttempts > 0 ? Math.round((p.attempts / maxAttempts) * 100) : 0;
                    return `<tr>
                        <td class="ad-mono">${this._esc(id)}</td>
                        <td>${p.attempts}</td>
                        <td>${p.successes}</td>
                        <td>${rate}%</td>
                        <td>${p.hintCount}</td>
                        <td><div class="ad-bar"><div class="ad-bar-fill ad-bar-puzzle" style="width:${pct}%"></div></div></td>
                    </tr>`;
                }).join('');
            }
        }
    }

    _refreshMedia(tc) {
        const media = tc.getMediaEngagement();
        const entries = Object.entries(media);

        const body = this.getElement('#ad-media-body');
        if (body) {
            if (entries.length === 0) {
                body.innerHTML = '<tr><td colspan="7" class="ad-empty">No media data</td></tr>';
            } else {
                body.innerHTML = entries.map(([id, m]) => {
                    const completionPct = m.started > 0 ? Math.round((m.completed / m.started) * 100) : 0;
                    return `<tr>
                        <td class="ad-mono">${this._esc(id)}</td>
                        <td>${this._esc(m.type || '—')}</td>
                        <td>${m.started}</td>
                        <td>${m.completed}</td>
                        <td>${m.skipped}</td>
                        <td>${m.replayed}</td>
                        <td><div class="ad-bar"><div class="ad-bar-fill ad-bar-media" style="width:${completionPct}%"></div></div> ${completionPct}%</td>
                    </tr>`;
                }).join('');
            }
        }
    }

    _refreshEventLog(tc) {
        const nsFilter = this.getElement('#ad-event-filter-ns')?.value || '';
        const typeFilter = this.getElement('#ad-event-filter-type')?.value?.trim() || '';

        const filter = {};
        if (nsFilter) filter.namespace = nsFilter;
        if (typeFilter) filter.type = typeFilter;
        filter.limit = 100;

        const events = tc.query(filter).reverse();

        const logEl = this.getElement('#ad-event-log');
        if (logEl) {
            if (events.length === 0) {
                logEl.innerHTML = '<div class="ad-empty">No events match filter</div>';
            } else {
                logEl.innerHTML = events.map(e => `
                    <div class="ad-list-item ad-log-item">
                        <span class="ad-event-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
                        <span class="ad-event-ns">${this._esc(e.namespace)}</span>
                        <span class="ad-event-type">${this._esc(e.type)}</span>
                        <span class="ad-event-scene">${this._esc(e.context?.sceneId || '')}</span>
                    </div>
                `).join('');
            }
        }
    }

    // ==========================================
    // REPLAY
    // ==========================================

    _bindReplay() {
        const loadBtn = this.getElement('#ad-replay-load');
        if (loadBtn) {
            this.addHandler(loadBtn, 'click', () => {
                const tc = this._getTelemetry();
                const re = this._getReplay();
                if (!tc || !re) return;
                const snapshot = tc.exportSnapshot();
                const result = re.loadSnapshot(snapshot);
                this._setText('#ad-replay-status', `Loaded ${result.eventCount} events (${this._formatMs(result.duration)})`);
                this._replayEvents = [];
                this._updateReplayLog();
            });
        }

        const playBtn = this.getElement('#ad-replay-play');
        if (playBtn) {
            this.addHandler(playBtn, 'click', () => {
                const re = this._getReplay();
                const speed = parseFloat(this.getElement('#ad-replay-speed')?.value || '1');
                re?.play(speed);
                this._setText('#ad-replay-status', `Playing at ${speed}x`);
            });
        }

        const pauseBtn = this.getElement('#ad-replay-pause');
        if (pauseBtn) {
            this.addHandler(pauseBtn, 'click', () => {
                this._getReplay()?.pause();
                this._setText('#ad-replay-status', 'Paused');
            });
        }

        const stopBtn = this.getElement('#ad-replay-stop');
        if (stopBtn) {
            this.addHandler(stopBtn, 'click', () => {
                this._getReplay()?.stop();
                this._replayEvents = [];
                this._updateReplayLog();
                this._setText('#ad-replay-status', 'Stopped');
                const fill = this.getElement('#ad-replay-fill');
                if (fill) fill.style.width = '0%';
            });
        }

        const stepBtn = this.getElement('#ad-replay-step');
        if (stepBtn) {
            this.addHandler(stepBtn, 'click', () => {
                const event = this._getReplay()?.step();
                if (event) {
                    const state = this._getReplay()?.getState();
                    this._setText('#ad-replay-status', `Step ${state?.cursor || 0}/${state?.total || 0}`);
                }
            });
        }

        const speedSelect = this.getElement('#ad-replay-speed');
        if (speedSelect) {
            this.addHandler(speedSelect, 'change', () => {
                const speed = parseFloat(speedSelect.value);
                this._getReplay()?.setSpeed(speed);
            });
        }
    }

    _onReplayEvent(data) {
        this._replayEvents.unshift({
            type: data.originalType,
            namespace: data.namespace,
            timestamp: data.originalTimestamp
        });
        if (this._replayEvents.length > 50) this._replayEvents.pop();
        this._updateReplayLog();
    }

    _onReplayProgress(data) {
        const fill = this.getElement('#ad-replay-fill');
        if (fill) fill.style.width = `${Math.round(data.progress * 100)}%`;
        this._setText('#ad-replay-status', `Playing: ${data.cursor}/${data.total}`);
    }

    _onReplayEnd() {
        this._setText('#ad-replay-status', 'Replay Complete');
        const fill = this.getElement('#ad-replay-fill');
        if (fill) fill.style.width = '100%';

        // Show divergence report
        const report = this._getReplay()?.getDivergenceReport();
        this._updateDivergenceLog(report);
    }

    _onReplayDivergence(data) {
        const logEl = this.getElement('#ad-divergence-log');
        if (!logEl) return;
        const existing = logEl.querySelector('.ad-empty');
        if (existing) existing.remove();

        const div = document.createElement('div');
        div.className = 'ad-list-item ad-divergence-item';
        div.innerHTML = `
            <span class="ad-divergence-step">Step ${data.step}</span>
            <span class="ad-divergence-expected">Expected: ${this._esc(data.expected)}</span>
            <span class="ad-divergence-actual">Actual: ${this._esc(data.actual)}</span>
        `;
        logEl.prepend(div);
    }

    _updateReplayLog() {
        const logEl = this.getElement('#ad-replay-log');
        if (!logEl) return;

        if (this._replayEvents.length === 0) {
            logEl.innerHTML = '<div class="ad-empty">No replay active</div>';
        } else {
            logEl.innerHTML = this._replayEvents.map(e => `
                <div class="ad-list-item">
                    <span class="ad-event-time">${new Date(e.timestamp).toLocaleTimeString()}</span>
                    <span class="ad-event-ns">${this._esc(e.namespace)}</span>
                    <span class="ad-event-type">${this._esc(e.type)}</span>
                </div>
            `).join('');
        }
    }

    _updateDivergenceLog(report) {
        const logEl = this.getElement('#ad-divergence-log');
        if (!logEl) return;

        if (!report || report.divergences.length === 0) {
            logEl.innerHTML = '<div class="ad-empty">No divergences detected</div>';
        } else {
            logEl.innerHTML = report.divergences.map(d => `
                <div class="ad-list-item ad-divergence-item">
                    <span class="ad-divergence-step">Step ${d.step}</span>
                    <span class="ad-divergence-expected">Expected: ${this._esc(d.expected)}</span>
                    <span class="ad-divergence-actual">Actual: ${this._esc(d.actual)}</span>
                </div>
            `).join('');
        }
    }

    // ==========================================
    // EVENT FILTER
    // ==========================================

    _bindEventFilter() {
        const applyBtn = this.getElement('#ad-event-filter-apply');
        if (applyBtn) {
            this.addHandler(applyBtn, 'click', () => {
                const tc = this._getTelemetry();
                if (tc) this._refreshEventLog(tc);
            });
        }
    }

    // ==========================================
    // UTILITIES
    // ==========================================

    _getTelemetry() {
        return window.__RETROS_DEBUG?.telemetryCollector || null;
    }

    _getReplay() {
        return window.__RETROS_DEBUG?.replayEngine || null;
    }

    _setText(selector, text) {
        const el = this.getElement(selector);
        if (el) el.textContent = text;
    }

    _truncate(str, max) {
        return str && str.length > max ? str.slice(0, max) + '\u2026' : str;
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

export default AnalyticsDashboard;
